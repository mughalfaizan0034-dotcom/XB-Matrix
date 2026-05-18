# xB Matrix — Architecture

This document explains the *why* behind the foundation. For the *what*, read the code in `apps/` and `packages/`. For the canonical database contract, read [`sql/`](../sql/) and (when available) the `spec_03_postgresql_schema.md` source.

## 1. Goals

xB Matrix is a multi-tenant enterprise commerce intelligence platform. Architecturally, it must:

1. Isolate tenants completely — no cross-org leaks under any code path.
2. Be reproducible — every reported number can be traced back to inputs + engine version.
3. Be auditable — every state change is recorded.
4. Be extensible — new modules, new engines, new AI providers slot in without rewriting the core.
5. Be honest — frontend renders truth from the backend; frontend never computes truth.

## 2. Topology

```
┌─────────────────┐      ┌──────────────────┐      ┌────────────────────┐
│  apps/web       │      │  apps/api        │      │  apps/worker       │
│  Next.js 14     │◀────▶│  Fastify         │◀────▶│  Cloud Tasks       │
│  GitHub Pages   │      │  Cloud Run       │      │  Cloud Run         │
└─────────────────┘      └────────┬─────────┘      └──────────┬─────────┘
                                  │                            │
                  ┌───────────────┼────────────────────────────┘
                  ▼               ▼
        ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
        │  Cloud SQL       │  │  Redis (cache /  │  │  GCS  +          │
        │  PostgreSQL 16   │  │  rate limit)     │  │  BigQuery        │
        │  (RLS-enforced)  │  │                  │  │  xbmatrixbq      │
        └──────────────────┘  └──────────────────┘  └──────────────────┘
```

- **web** is a static Next.js export served by GitHub Pages. It owns presentation only.
- **api** is the operational backend. It owns all business calculations, authorization, and writes.
- **worker** consumes Cloud Tasks for async jobs (uploads, reports, forecasts, audit archive, soft-delete purge).
- **Cloud SQL PG16** is operational truth. **BigQuery** (`xbmatrixbq`) is analytical truth and archive.
- **GCS** is staging (uploads, generated PDFs); both buckets have 30-day lifecycle delete.

## 3. Monorepo layout

```
apps/
  web/           — Next.js 14 App Router (presentation only)
  api/           — Fastify backend (truth, auth, audit)
  worker/        — Cloud Tasks HTTP consumer
packages/
  types/         — Branded ID/Money types, ActorContext, PermissionScope
  config/        — Typed env loaders for api/worker/web
  auth/          — Centralized Resolver + rule providers, Session, AuthErrors
  calculations/  — Backend-only math (money, engine descriptors)
  ai/            — Provider-agnostic AI interface + Groq/OpenRouter/Ollama stubs
  ui/            — Tailwind preset, theme tokens, shared components
infrastructure/
  docker/        — Dockerfile.api, Dockerfile.worker
  cloudrun/      — Cloud Run service yamls (envsubst-rendered at deploy)
  cloudbuild/    — Optional Cloud Build pipeline
sql/
  migrations/    — Versioned SQL migrations
docs/
  ARCHITECTURE.md, CONTRIBUTING.md
.github/workflows/
  ci.yml, deploy-web.yml, deploy-backend.yml
```

## 4. The resolver — authorization architecture

All authorization decisions flow through `packages/auth`'s `Resolver`. The Resolver:

1. Takes an `ActorContext` and a `PermissionScope` (`{ organizationId, workspaceId, module, action }`).
2. Walks an ordered list of `RuleProvider`s. **First provider that "applies" wins.**
3. Returns a `PermissionDecision` with `{ allowed, source, reason }`.
4. Emits the decision via `onDecision` for audit + telemetry.

Default provider order:

| # | Provider | Purpose |
|---|---|---|
| 1 | `InternalManagerProvider` | Bypass for `is_internal_manager = true`. Audited. |
| 2 | `PageOverrideProvider` | Per-page overrides (highest-specificity grant). |
| 3 | `WorkspaceGrantProvider` | Workspace-level grants. |
| 4 | `RoleProvider` | Role-based defaults (internal_manager, internal_staff, organization_admin, organization_user). |

If no provider applies → `deny_default`. There is no implicit allow.

The resolver also performs context sanity checks:
- Actor must have an organization context (or be system/internal_manager).
- `scope.organizationId` must match `actor.organizationId` unless internal_manager.

When Spec 2 (Permission Truth Table) arrives, it populates the role matrix and grant/override lookups. The resolver shape does not change.

## 5. Database connection context contract (Spec 3 §1.7)

Every transaction issued by the API or worker MUST set the following on the connection before any query:

```
SET LOCAL app.current_organization_id = ...
SET LOCAL app.current_actor_id        = ...
SET LOCAL app.current_actor_kind      = ...
SET LOCAL app.current_request_id      = ...
SET LOCAL app.current_session_id      = ...
SET LOCAL app.is_internal_manager     = 'true' | 'false'
```

This is enforced by the `withConnection(actor, work)` helper in `apps/api/src/plugins/audit-context.ts`. Direct calls to `app.pg.query` outside of `withConnection` are a bug — they will hit RLS with no org context and see zero rows from tenant-scoped tables.

RLS policies and the audit trigger function `fn_audit_row_change()` both read these settings. The trigger function uses `current_setting(..., true)` so a missing setting returns NULL rather than erroring, and JSONB extraction (`row ->> 'organization_id'`) so the same trigger works against tables that don't have the column (the `organizations` table itself).

## 6. Two-layer audit

| Layer | Mechanism | Captures |
|---|---|---|
| Data audit | `fn_audit_row_change()` trigger on every tracked table | INSERT/UPDATE/DELETE: before, after, actor, request |
| Operation audit | Application writes | `permission.granted`, `module.enabled`, `report.generated`, etc. |

Both write to `xb_audit.audit_log` (partitioned by month, append-only). RLS denies UPDATE/DELETE. After 30 days, partitions are detached and exported to BigQuery (worker job, future phase).

## 7. Soft delete + 90-day purge

Soft-deletable tables carry `deleted_at timestamptz NULL`. The query layer adds `WHERE deleted_at IS NULL` by default; opt-in is required to see soft-deleted rows. After 90 days, a worker job hard-purges (with audit). Append-only tables (audit_log, raw uploads) are exempt.

## 8. Engine versioning

Every intelligence output records `engine_key` + `engine_version` + `generated_at`. Engines never silently overwrite old-version data; recompute is always explicit. The frontend may display "computed by Engine v2.3.1" for transparency.

`packages/calculations/src/engine.ts` provides the `Engine<Input, Output>` interface and `makeEngineRunMeta(descriptor)`.

## 9. Idempotency

Every write endpoint accepts an `idempotency-key` header. `xb_core.idempotency_keys` stores `(organization_id, key)` with the cached result and TTL. Worker tasks deduplicate the same way (Redis-cached or table-backed; Redis preferred for short TTL, table for audit).

## 10. AI layer

`packages/ai` defines a single `AiProvider` interface and a registry. Free providers (Groq, OpenRouter, Ollama) come first; OpenAI / Anthropic / Gemini drop in later without touching call sites.

**Architectural rule:** AI explains engine outputs. AI never *is* the source of truth. The contract: engine → numbers; AI → narrative over numbers.

## 11. Out of scope for the foundation phase

- Real Sales / PPC / Inventory / Shipments / Forecasting engine implementations
- Real upload processing (CSV/Excel/Sheets ingestion)
- Real AI provider HTTP calls (stubs throw "not implemented")
- Stripe / subscription billing (manual agency billing only)
- API keys (table is created but unused)
- Multi-region failover

These land in later phases against this foundation, not by reshaping the foundation.
