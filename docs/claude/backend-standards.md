# backend-standards

`apps/api` + `apps/worker` conventions. Companion: [data-model](data-model.md), [permissions](permissions.md), [engineering-rules](engineering-rules.md).

## 1. Service architecture

```
routes/   thin: validate → call service → shape response
services/ business logic, transactions, permissions, audit
lib/      cross-cutting (permissions, errors, password, ulid, rate-limit)
plugins/  fastify integrations (db, redis, auth, audit-context, storage)
uploads/  validators/ + mappers/ (ingestion only)
cli/      reset:admin, seed, ops scripts
```

- One service module per resource (`users-service`, `workspace-service`, `upload-service`, `purge-service`, …).
- Services own permission checks. Routes never call resolver directly.
- Helpers in `lib/` are pure or DB-context-aware via `withConnection`.

## 2. Route conventions

- File per resource: `apps/api/src/routes/<resource>.ts`.
- Verbs: `POST /v1/<resource>`, `GET /v1/<resource>`, `PATCH /v1/<resource>/:id` (require `If-Match`), `DELETE /v1/<resource>/:id` (soft-delete).
- All routes go through `withConnection(actor, work)`. No direct `app.pg.query`.
- Tenant-scoped routes: workspace ID from `requireActiveWorkspace()`, never `req.body`.
- Idempotency: writes accept `Idempotency-Key` header.
- Errors: throw typed errors from `apps/api/src/lib/errors.ts` → Fastify error handler maps to status + JSON shape.

## 3. Migrations

- Source of truth: `sql/migrations/NNNN_<slug>.sql`.
- Numbered, never gapped.
- One slice per migration. Mixing schema + data backfill forbidden unless atomic dependency.
- Idempotent where safe (`IF NOT EXISTS`, `ALTER ... ADD COLUMN IF NOT EXISTS`).
- New operational schema → update `0007_runtime_user_grants.sql` style grant set.
- Migrations run as `postgres` (Cloud SQL superuser). Runtime queries run as `xbmatrixapp` (no DDL).
- Never drop a column / table in the same migration that ships its replacement. Two-phase: write → backfill → swap → drop.

## 4. Transactions

- `withConnection(actor, work)` is the only transaction entry.
- One transaction per request unit. **No nested transactions** inside it.
- `SET LOCAL app.current_*` settings set on entry. RLS + audit triggers depend on them.
- Long-running work → enqueue Cloud Task; never hold a DB transaction across an HTTP boundary.

## 5. RLS enforcement

- Every tenant-scoped table has policy `p_<t>_tenant_isolation` (see [data-model §4](data-model.md#4-multi-tenancy--rls)).
- Bypass only via `app.is_internal_manager = 'true'`, set by `withConnection` when the actor is `super_admin` or `internal_manager`.
- Platform-global tables (no RLS) gated by app capability guards (see [permissions §5](permissions.md#5-capability-guards-public-api)).
- Audit a bypass: every internal-manager flow writes operation-audit (`platform_admin.read`, `platform_admin.write`).

## 6. API response conventions

Success:
```json
{ "data": <payload>, "meta": <optional pagination/provenance> }
```

List:
```json
{ "data": [...], "meta": { "page": 1, "perPage": 25, "total": 123 } }
```

Engine output:
```json
{ "data": { ... }, "meta": { "provenance": {...} } }
```

Error:
```json
{ "error": { "code": "<machine_code>", "message": "<human>", "details": {...} } }
```

Status codes:
- `400` validation · `401` unauthenticated · `403` unauthorized · `404` not found · `409` row_version mismatch / idempotency conflict · `422` business-rule violation · `429` rate-limited · `5xx` server.

## 7. Audit philosophy

Two layers (see [architecture §12](architecture.md#12-two-layer-audit)):

- **Data audit** — `fn_audit_row_change()` trigger on every tracked table. Captures before/after/actor/request automatically.
- **Operation audit** — explicit app writes for business events. Required minimum events:
  - `permission.granted` / `permission.changed` / `permission.revoked`
  - `module.enabled` / `module.disabled`
  - `feature_flag.enabled` / `feature_flag.disabled`
  - `report.generated`
  - `ai_recommendation.acknowledged`
  - `record.soft_deleted` / `record.restored` / `record.hard_deleted`
  - `platform_admin.read` / `platform_admin.write`

Both write to `xb_audit.audit_log` (append-only, monthly partitions, RLS denies UPDATE/DELETE).

## 8. Purge orchestration

- One central service: `apps/api/src/services/purge-service.ts` (or worker equivalent).
- Inputs: target resource type + id. Output: idempotent purge.
- Protected entities (self, super_admin) rejected at the orchestrator boundary. Backend-first — never rely on UI.
- Cascade rules:
  - Audit FKs → `ON DELETE SET NULL` (preserve audit trail).
  - Operational FKs → explicit handling per resource. No blind CASCADE.
- Emits `record.hard_deleted` to operation audit before delete.
- Drop nested transactions inside purge flows (regression-prone). Use the existing `withConnection` transaction.
- Don't swallow FK errors as "missing table". Propagate; orchestrator decides.

## 9. Soft delete + 90d retention

- Standard pattern: `deleted_at` set explicitly via service. Trigger emits `record.soft_deleted`.
- Daily worker job moves `soft_deleted` rows past 90d into `purge_scheduled`, then invokes purge orchestrator.
- Restoration: clear `deleted_at`. Trigger emits `record.restored`. Idempotent.
- Exempt from soft-delete: append-only, canonical period tables (UPSERT semantics), summary tables, forecast outputs.

## 10. Cron + worker conventions

- `apps/worker` is the Cloud Tasks consumer. HTTP entry points only.
- Cron jobs scheduled via Cloud Scheduler → Cloud Tasks → worker HTTP route.
- Idempotency: every task carries an idempotency key; worker dedupes via Redis (short TTL) or `xb_core.idempotency_keys` table (long TTL audit).
- Job retry policy at Cloud Tasks layer (max 5, exponential backoff).
- Worker uses the same `withConnection` helper.

## 11. Background jobs

- Long work (upload processing, report generation, engine recompute, forecast run, audit archive, purge) → worker only.
- Status reported via the resource's own status field (`upload_status`, `report_status`).
- No streaming progress over HTTP. Frontend polls or subscribes (future) to status.

## 12. Errors

- Typed error classes in `apps/api/src/lib/errors.ts` (`HttpError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`).
- Never `throw new Error(...)` in business logic.
- Don't swallow errors. Log + rethrow; surface to client via the error handler.
- No silent catch-all DB suppression. If a FK fails, that's data — surface it.

## 13. Rate limiting

- `apps/api/src/lib/rate-limit.ts` — Redis token bucket per actor + IP.
- Defaults: 100 req / minute / actor on writes; reads unmetered by default.
- Auth endpoints: stricter (`/v1/auth/sign-in` 10/min/IP).

## 14. Password + session

- Password: scrypt with per-user salt. `apps/api/src/lib/password.ts`.
- Session: HTTP-only cookie, 7d default, 30d on "Remember device". Renewed via `last_seen_at`.
- Sign-out revokes session (sets `revoked_at`).
- Workspace switch updates `xb_core.sessions.active_workspace_id` inside the same transaction.
- Super-admin password rotation via `pnpm --filter @xb/api reset:admin -- --username faizan --password '<new>'`. Never commit plaintext (incl. comments).

## 15. Upload pipeline

- Direct-to-GCS signed-URL upload from browser.
- Worker picks up via Cloud Tasks → validates → maps → resolves SKUs → writes canonical.
- Validation errors land in `xb_raw.upload_validation_errors` with raw row snapshot.
- Status lifecycle: `pending` → `validating` → `mapping` → `loaded` / `failed`.
- 30d GCS lifecycle delete on the uploads bucket.

## 16. Cross-package builds

- Editing `packages/types` or `packages/auth`: run `pnpm --filter @xb/types build && pnpm --filter @xb/auth build` before typecheck.
- Apps consume `dist/` of these packages, not source.

## 17. Health / observability

- `GET /health/live` — process up.
- `GET /health/ready` — PG + Redis reachable.
- Request ID via `x-request-id` header, propagated through `requestId` plugin and logged on every line.

## Cross-refs

[architecture](architecture.md) · [data-model](data-model.md) · [permissions](permissions.md) · [engines](engines.md) · [engineering-rules](engineering-rules.md)
