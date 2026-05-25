# terminology

Canonical vocabulary. One term, one definition, one home doc. Agents use these exact phrases; do not coin synonyms.

| Term | Definition | Home |
|---|---|---|
| actor | Polymorphic action-performing identity (`xb_core.actors`); every user / API key / system job / connector / AI agent has one | [data-model](../data-model.md) |
| actor-scoped | Cache / query keyed by `(actorId, organizationId, workspaceId)`; never shared across actors | [frontend-standards](../frontend-standards.md) |
| active workspace | Workspace bound to the current session (`xb_core.sessions.active_workspace_id`); the only legitimate source of workspace context | [architecture](../architecture.md) |
| additive metric | Quantity safe to SUM across rows (impressions, clicks, units, sales). Canonical stores only these | [data-model](../data-model.md) |
| ad platform | Ad-spend source dimension (`ad_platform_code`: `amazon_ads`, `meta_ads`, …). Distinct from marketplace | [data-model](../data-model.md) |
| attribution window | Reporting window for ad attribution (`attribution_window_days`); first-class canonical dimension on `channel_ads` | [data-model](../data-model.md) |
| audit (data) | Trigger-driven row-change audit via `fn_audit_row_change()` | [architecture](../architecture.md) |
| audit (operation) | App-written business-event audit (`permission.granted`, `report.generated`, …) | [backend-standards](../backend-standards.md) |
| AwaitingData | Empty-state pattern for operational pages with no data yet | [design-system](../design-system.md) |
| backstop (RLS) | DB-side enforcement that catches application-layer mistakes | [data-model](../data-model.md) |
| blended | Engine output with no platform / marketplace filter applied | [engines](../engines.md) |
| canonical layer | `xb_canonical.*` — channel-agnostic, additive facts, period-grain | [data-model](../data-model.md) |
| canonical SKU | `sku_normalized`; the platform-independent product identifier | [architecture](../architecture.md) |
| capability | Named permission in `apps/api/src/lib/permissions.ts` (e.g. `canManageInternalUsers`) | [permissions](../permissions.md) |
| capability guard | Function returning `boolean` over an `ActorContext`; sole public API for authorization | [permissions](../permissions.md) |
| ComingSoonState | Premium full-page primitive for unfinished modules | [design-system](../design-system.md) |
| connection context | `SET LOCAL app.current_*` settings on the active DB connection | [architecture](../architecture.md) |
| connector | Ingestion mechanism (CSV / API / webhook / feed); platform-shaped, scoped to validator + mapper | [architecture](../architecture.md) |
| deny-default | Resolver behavior: no provider applies → access denied | [permissions](../permissions.md) |
| derived metric | Computed from additive metrics (ACOS, TACOS, ROAS, DOS, CPC, …); engine output only | [engines](../engines.md) |
| effective role | The 5-tier role string on the actor (`super_admin` / `internal_manager` / `internal_staff` / `organization_admin` / `organization_user`) | [permissions](../permissions.md) |
| engine | Deterministic backend service producing versioned output | [engines](../engines.md) |
| engine version | `engine_key` + `engine_version` + `generated_at` stamped on every engine row | [engines](../engines.md) |
| fulfillment type | Dimension (`fba`, `fbm`, `dtc`, `3pl`, `retail`) | [data-model](../data-model.md) |
| hot memory | Active branch + active PR state; small + frequently updated | [current-state](../current-state.md) |
| cold memory | Architecture / rules / standards — stable, long-lived | [README](../README.md) |
| idempotency | Repeat-safe write semantics; key cached in `xb_core.idempotency_keys` + Redis | [backend-standards](../backend-standards.md) |
| ingestion | Connector → validator → mapper → SKU resolution → canonical | [architecture](../architecture.md) |
| intelligence layer | `/v1/intelligence/*` engine services; single source for KPIs / reports / alerts / AI | [engines](../engines.md) |
| internal user | Cross-org platform staff (`super_admin` / `internal_manager` / `internal_staff`) | [permissions](../permissions.md) |
| inventory state | Controlled vocab (`available` / `reserved` / `inbound` / `damaged` / `transfer` / `processing` / `unsellable`); only `available` is sellable | [data-model](../data-model.md) |
| isInternalManager | RLS bypass flag; true for super_admin + internal_manager | [permissions](../permissions.md) |
| KPI strip | 3–6-card row at top of an operational module | [design-system](../design-system.md) |
| mapper | Connector code that turns platform-shaped rows into normalized canonical rows | [architecture](../architecture.md) |
| marketplace | Sales / inventory dimension (`marketplace_code`: `amazon_us`, `walmart`, `shopify`, …); a column, never a system | [architecture](../architecture.md) |
| metric registry | Single canonical name + formula + unit + formatter per KPI | [analytics-agent](../agents/analytics-agent.md) |
| module shell | `Header → KPI Strip → Inner Tabs → Content` page layout | [design-system](../design-system.md) |
| operational dataset | One of: Sales Performance · Inventory Position · Advertising Performance; marketplace is a row column | [data-model](../data-model.md) |
| optimistic locking | `row_version` + `If-Match`; 409 on conflict | [data-model](../data-model.md) |
| organization scope | `(organization_id)` tenancy boundary; RLS-enforced | [data-model](../data-model.md) |
| platform-global | Tables with no RLS (`organizations`, `internal_users`, `feature_flags`, …); guarded by capability | [data-model](../data-model.md) |
| provenance | `{engine_key, engine_version, generated_at, window, filters, rowCount}` block on engine responses | [engines](../engines.md) |
| purge lifecycle | `active` → `soft_deleted` → `purge_scheduled` → `purged`; separate `deleted_at` + `purged_at` | [data-model](../data-model.md) |
| purge orchestrator | Centralized service that executes hard-deletes with protection rules + audit | [backend-standards](../backend-standards.md) |
| Recharts | Locked chart library | [design-system](../design-system.md) |
| reconciliation | Comparison / correction logic that lives **beside** canonical, never inside it | [data-model](../data-model.md) |
| recycle bin | Admin surface listing soft-deleted entities with restore + purge actions | [data-model](../data-model.md) |
| resolveSku() | Mapper function: platform code → `sku_normalized`; unmatched → unresolved queue | [architecture](../architecture.md) |
| resolver | Authorization engine in `packages/auth` walking ordered providers | [permissions](../permissions.md) |
| RLS bypass | `app.is_internal_manager='true'`; only legitimate org-isolation bypass | [permissions](../permissions.md) |
| row_version | Optimistic-lock column on mutable resources | [data-model](../data-model.md) |
| semantic token | Theme-driven Tailwind class from `packages/ui` (`bg-surface`, `text-accent`, …); the only allowed color source | [design-system](../design-system.md) |
| session context | Server-derived `(actor, organization, workspace, request, session)` propagated into the DB connection | [architecture](../architecture.md) |
| SKU alias | `xb_master.sku_aliases` mapping platform code → `sku_normalized` | [architecture](../architecture.md) |
| soft delete | `deleted_at IS NOT NULL`, recoverable; emits `record.soft_deleted` | [data-model](../data-model.md) |
| summary layer | `xb_summary.*` — rebuildable, pre-aggregated tables | [data-model](../data-model.md) |
| super_admin | Singleton role; migration-provisioned only; full RLS bypass | [permissions](../permissions.md) |
| unresolved queue | `xb_master.unresolved_sku_rows`; first-class operator workflow | [architecture](../architecture.md) |
| workspace | Per-org operational scope (`xb_core.workspaces`); has type (Marketplace/DTC/Warehouse/General) | [architecture](../architecture.md) |
| workspace-scoped | Query / cache / context bounded by `(organization_id, workspace_id)` | [architecture](../architecture.md) |
| withConnection | `apps/api/src/plugins/audit-context.ts` helper; only legitimate DB entry point | [backend-standards](../backend-standards.md) |

## Banned synonyms

| Don't write | Write instead |
|---|---|
| omnichannel | (delete — banned in product UI) |
| platform-specific | channel-agnostic violation |
| user role check | capability guard |
| invitation flow | direct admin add-user |
| forgot password | (deferred until Resend wired) |
| generic upload | operational dataset |
| dashboard math | engine output |
