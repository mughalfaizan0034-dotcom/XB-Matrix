# architecture

Compact operational memory. See [README](README.md) for index.

## 1. What XB Matrix is

Multi-tenant **commerce operations + intelligence platform**. Inputs = connectors/uploads/APIs. Outputs = reports, insights, recommendations, WMS, forecasting. Not a dashboard app.

## 2. Pipeline (single direction)

```
Connectors/Uploads/APIs
 → Validators → Mappers → SKU Resolution
 → Canonical (xb_canonical.*)
 → Summary (xb_summary.*)
 → Engines (xb_intelligence.*)
 → KPIs / Reports / WMS / Forecasting / UI
 → AI (narrative layer over engine output ONLY)
```

Rules:
- Connector boundary = mapping layer. Anything platform-shaped lives in templates/validators/mappers, never beyond.
- Engines read canonical/summary only. Never raw uploads, never frontend.
- Frontend renders engine output. Never computes business metrics.
- AI consumes engine output. Never raw rows, never uploads.

## 3. Canonical architecture

| Layer | Source of truth | Channel-aware? |
|---|---|---|
| Connectors | per-platform CSV/API | yes (until mapper) |
| Validators | per-source schema check | yes |
| Mappers | normalize → canonical shape | yes → no |
| `xb_canonical.*` | additive facts | no — platform is a column |
| `xb_summary.*` | rebuildable aggregates | no |
| `xb_intelligence.*` | engine outputs (versioned) | no |
| Frontend | renders only | no |

## 4. Marketplace = dimension, not system

- `marketplace_code`, `ad_platform_code`, `region_code`, `fulfillment_type`, `inventory_location_code` are **row columns**.
- Forbidden: `if (platform === 'amazon')` past the mapper.
- Blended = no filter. Filtered = same engine + `WHERE`. Never a separate engine.

## 5. SKU normalization

- `xb_master.sku_aliases`: any platform code → `sku_normalized`.
- `resolveSku()` runs in the mapper. Canonical stores only `sku_normalized`.
- Unmatched rows → `xb_master.unresolved_sku_rows` (operational queue; not scaffolding).
- One SKU spans every marketplace, warehouse, ad platform, region. Core operational entity.

## 6. Hierarchy

```
Platform → Organizations → Workspaces → Modules → Pages → Tabs
```

Workspace type: optional UI-only select (Marketplace / DTC / Warehouse / General). DB column = nullable varchar, no CHECK.

## 7. Workspace-scoped security (non-negotiable)

- Every workspace-scoped query filters by `organization_id` + `workspace_id`.
- RLS backstop on `organization_id` only (workspace authz = resolver).
- Active workspace = **secured session context** (`requireActiveWorkspace()`). Never trust client-sent workspaceId.
- AI inherits the active workspace + permission scope. No cross-workspace context.

## 8. Connection context contract

Every DB transaction (api + worker) sets, via `withConnection(actor, work)`:
```
SET LOCAL app.current_organization_id
SET LOCAL app.current_actor_id
SET LOCAL app.current_actor_kind
SET LOCAL app.current_request_id
SET LOCAL app.current_session_id
SET LOCAL app.is_internal_manager     -- 'true' bypasses org-RLS
```
Direct `app.pg.query` outside `withConnection` = bug. RLS + audit trigger both read these.

## 9. Cache isolation

- Redis keys: `{actor_id}:{org_id}:{workspace_id}:{resource}`. Never share across actors or workspaces.
- React Query keys: actor-scoped, workspace-scoped. See [frontend-standards](frontend-standards.md).
- On sign-out / workspace switch / role change → `queryClient.clear()`.
- Server cache invalidates on writes within the same actor+workspace scope.

## 10. Engines — deterministic before AI

- Engines: pure, idempotent, versioned (`engine_key` + `engine_version` + `generated_at`).
- Frontend never derives ACOS/TACOS/DOS/ROAS/profitability.
- AI never invents numbers. AI = narrative over engine output. See [engines](engines.md).

## 11. Topology

```
apps/web (Next.js 14, GH Pages, static export, presentation only)
apps/api (Fastify, Cloud Run, all business logic + auth + audit)
apps/worker (Cloud Tasks consumer, async jobs)
Cloud SQL PG16 (RLS) · Redis · GCS · BigQuery (xbmatrixbq)
```

## 12. Two-layer audit

| Layer | Mechanism |
|---|---|
| Data audit | `fn_audit_row_change()` trigger on tracked tables |
| Operation audit | app writes business events (`permission.granted`, `module.enabled`, `report.generated`, ...) |

Both → `xb_audit.audit_log` (append-only, monthly partitions, RLS denies UPDATE/DELETE).

## 13. Lifecycle states (canonical)

`active` → `soft_deleted` → `purge_scheduled` → `purged`. Separate `deleted_at` + `purged_at`. See [data-model](data-model.md) + [backend-standards](backend-standards.md).

## 14. Idempotency

Write endpoints accept `Idempotency-Key`. Cached via `xb_core.idempotency_keys` + Redis TTL. Worker tasks dedupe the same way.

## 15. Out of scope (foundation)

Real engines · real ingestion at scale · paid AI providers · Stripe billing · API-key surface · multi-region failover. All slot in over this foundation.

## Cross-refs

[permissions](permissions.md) · [data-model](data-model.md) · [engines](engines.md) · [engineering-rules](engineering-rules.md) · [roadmap](roadmap.md)
