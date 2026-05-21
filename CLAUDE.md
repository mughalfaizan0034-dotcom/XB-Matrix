# CLAUDE.md — XB Matrix

> Lean architectural brief — always-loaded working memory. Detailed
> references live in `docs/` (see the index at the bottom). Keep this
> file lean and directionally strong; do not paste full DDL, migration
> history, or completed-slice logs here.

## What XB Matrix is

A centralized **commerce operations, inventory orchestration, WMS,
forecasting, and intelligence platform** for ecommerce agencies and
brands. Not a dashboard app — an operational intelligence platform.
**Uploads are inputs; reports/insights/recommendations are outputs.**

Multi-channel from day one: Amazon, Walmart, Shopify, TikTok, eBay,
Etsy, Meta Ads, Google Ads, warehouses, 3PLs, ERPs all feed into one
unified operational layer. **Marketplace/platform is a source
dimension, never an isolated system.**

## The pipeline

```
Connectors / Uploads / APIs
  → Validators → Mappers → SKU Resolution → Normalized Entities
  → Canonical Tables → Summary Layers → Engines
  → Insights / Reports / WMS / Forecasting / UI
```

The connector boundary is the **mapping layer**: connector-specific code
exists only in templates/validators/mappers. Everything downstream is
channel-agnostic. Adding a connector must not change canonical tables,
engines, summaries, or UI.

## Architectural guardrails (non-negotiable)

1. **Centralized backend engines.** All calculation (TACOS, DOS,
   forecasting, profitability, recommendations, unit economics) lives in
   backend engines. The frontend renders engine output — it never
   computes business metrics.
2. **Marketplace/platform-agnostic core.** No `if (platform ===
   'amazon')` past the mapper. Marketplace is a filter dimension.
3. **Normalized SKU is the core entity.** One SKU spans many
   marketplaces, warehouses, fulfillment pools, ad platforms, regions.
   `xb_master.sku_aliases` resolves any platform code → `sku_normalized`.
4. **Engines read canonical/summary tables only** — never raw uploads,
   never inside frontend pages.
5. **Tenant isolation.** Every query filters by `organization_id`
   (+ `workspace_id`); RLS backstops it. Org isolation is a security
   boundary; workspace/page authz is the resolver's job.
6. **Audit-first, soft-delete everywhere, optimistic locking** on
   mutable resources (`If-Match` row_version → 409 on conflict).
7. **Conventions:** ULID `char(26)` PKs, `numeric(18,4)` money, enums as
   `varchar + CHECK`, `timestamptz` UTC. Details in `docs/schema.md`.

## Hierarchy

```
Platform → Organizations → Workspaces → Modules → Pages → Tabs
```

Workspace type: optional, UI-controlled select — Marketplace / DTC /
Warehouse / General.

## Roles (5 tiers)

```
super_admin        exactly ONE; provisioned only via DB migration;
                   NOT creatable via API/UI. Full RLS bypass.
internal_manager   creates internal_staff + org roles. Full RLS bypass.
                   Cannot create super_admin or another manager.
internal_staff     platform-wide read.
organization_admin full access within own org; manages its users.
organization_user  operational access within own org.
```

RLS-bypass flag (`isInternalManager`) is true for super_admin AND
internal_manager. Super-admin-only checks use `effectiveRole ===
'super_admin'`.

## Operational datasets

Three centralized datasets — **not** per-marketplace kinds. One file may
hold many marketplaces; marketplace/platform is a row-level column.

- **Sales Performance** · **Inventory Position** · **Advertising Performance**

UI labels: "Sales Report", "Inventory Report", "Ads Report", "Warehouse
Inventory (coming soon)". Uploads are presented as operational datasets,
never as marketplace-specific reports. Template column lists →
`docs/pipeline.md`.

## Modules

Sidebar: Dashboard · Sales · Inventory · Shipments · Advertisements ·
Forecasting · Unit Economics · Reports · Uploads · Insights · Settings.

Every module: `Header → KPI Strip → Inner Tabs → Content`. Each module's
KPI/tab detail is decided when the module is built — do not pre-spec it
here.

Settings tabs: Organization · Workspaces · Users · Warehouses ·
Forecast Rules · Upload Templates · Diagnostics.

## Active operating decisions

- **Uploads UX:** operational dataset is the primary visual weight;
  connectors/marketplaces are supporting. Templates page is
  download-only; guidance ships as a branded Download Guide PDF.
- **Auth:** username + password sign-in, no email in the user flow.
  Admins create users directly (no invitation/email roundtrip) and reset
  passwords directly. No forgot-password in the UI. "Remember this
  device" → 30-day session (default 7). Legacy email code
  (invitations/verification/reset) is dormant — remove as encountered.
- **User management:** action is "Remove user" (soft delete, idempotent,
  revokes sessions). Super-admin row cannot be removed.
- **Reports:** fixed set — Sales, Ads, Inventory, Warehouse Inventory
  (coming soon). No forecasting page; workspace DOS targets feed a future
  engine.
- **UI style:** enterprise operational platform, not consumer SaaS.
  Navy/orange theme, Quicksand headings, Inter body + tabular numbers.
  Lean UI — no metadata walls, no speculative "planned" lists, no
  customer-facing "omnichannel" wording.

## Current state

Foundation shipped: multi-tenancy, organizations, workspaces, auth/
sessions, audit logging, resolver-based permissions, enterprise CRUD
lifecycle (suspend/archive/soft-delete/restore), DataTable primitives,
uploads foundation (5-tab UI, GCS storage, status lifecycle), validators,
platform-agnostic mapping layer, unresolved-SKU queue, SKU alias identity
layer, workspace-aware UI, production infra (Cloud Run + Cloud SQL +
BigQuery + GCS). The Walmart connector validated the marketplace-agnostic
architecture (reused contracts with zero downstream change).

## Next priorities (in order)

### Permission program — enterprise workspace × module × access level

Foundational authorization layer before deeper AI / automation. Same
permission layer flows through pages, APIs, uploads, dashboard data,
exports, AI, future automations. Detail: `docs/permissions.md`.

P1. Permission schema stabilization (access levels `none / view / edit /
    admin`, migration 0021)
P2. Workspace-assignment + module-grant service
P3. Resolver providers wired to `workspace_permissions` +
    `page_permissions`
P4. Radio-matrix permissions UI (workspace × module × level)
P5. Sidebar / route module-visibility enforcement
P6. Upload / action enforcement (uploads, SKU aliases, future writes)
P7. AI permission inheritance
P8. Permission audit logging + preset role templates

### AI-ready intelligence program

Deterministic engines first, AI strictly on top of engine output. AI
inherits both the active workspace session AND the user's permission
scope. Detail + intelligence-API catalogue: `docs/engines.md`.

A1. Sales intelligence engine
A2. Inventory intelligence engine
A3. Advertising intelligence engine
A4. Dashboard KPI / trend system
A5. Operational alerts layer
A6. AI-ready intelligence APIs — one service layer feeding
    dashboards · reports · alerts · AI
A7. AI assistant shell — floating, workspace-scoped, streaming
A8. AI insight summaries — deterministic insight feed
A9. AI recommendation engine
A10. Forecasting + automation

Pending reconciliation: legacy `sales_orders` / `inventory_snapshots`
canonical tables → replace with `channel_sales` / `channel_inventory`
(see `docs/pipeline.md` §8).

## Reference docs

| Doc | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | topology, monorepo, resolver, connection context, audit, idempotency, AI layer |
| [`docs/schema.md`](docs/schema.md) | Spec 3 — conventions, RLS, partitioning, retention, core DDL |
| [`docs/pipeline.md`](docs/pipeline.md) | connectors, datasets, templates, mappers, SKU identity, canonical shapes |
| [`docs/engines.md`](docs/engines.md) | engine catalogue, I/O contracts, replenishment, reports |
| [`sql/migrations/`](sql/migrations/) | **source of truth** for the live schema |
| [`HANDOFF.md`](HANDOFF.md) | new-chat quick reference |

When a question isn't answered here or in `docs/`, ask a focused
clarification question rather than documenting an assumption.
