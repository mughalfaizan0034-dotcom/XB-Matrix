# conventions

Tiny operational rules. Naming + format only. Semantics live in the topic docs.

## Schemas + tables

- Schema: `xb_<domain>` — `xb_core`, `xb_master`, `xb_raw`, `xb_canonical`, `xb_summary`, `xb_intelligence`, `xb_reports`, `xb_audit`, `xb_ai`.
- Table: snake_case plural. `workspaces`, `sales_performance_period`, `channel_sales`.
- Column: snake_case singular. `organization_id`, `created_at`, `inventory_state`.
- Index: `idx_<table>_<cols>`. Unique: `uq_<table>_<cols>`. FK constraint: `fk_<table>_<ref_table>`. Check: `ck_<table>_<concept>`. Trigger: `trg_<table>_<event>`. Function: `fn_<purpose>`.

## Migrations

- Path: `sql/migrations/NNNN_<slug>.sql`. Numbered, never gapped.
- Slug: lowercase snake, short verb-first (`add_workspace_permissions_admin_level`, `rotate_super_admin_password`).
- One slice per migration. Schema + data backfill mix forbidden unless atomic dependency.
- Plaintext secrets banned, including in comments.

## API routes

- Versioned root: `/v1/<resource>`.
- `POST /v1/<resource>` create · `GET /v1/<resource>` list · `GET /v1/<resource>/:id` read · `PATCH /v1/<resource>/:id` update (requires `If-Match`) · `DELETE /v1/<resource>/:id` soft-delete.
- Custom verbs only as nested actions: `POST /v1/<resource>/:id/<action>` (e.g. `/:id/restore`, `/:id/purge`).
- Intelligence: `/v1/intelligence/<engine>` (e.g. `/v1/intelligence/sales-trends`).
- Auth: `/v1/auth/sign-in`, `/v1/auth/sign-out`, `/v1/auth/me`.
- Health: `/health/live`, `/health/ready`.

## API response shape

```json
{ "data": <payload>, "meta": <optional> }
{ "error": { "code": "<machine>", "message": "<human>", "details": {} } }
```

List meta: `{ page, perPage, total }`. Engine meta: `{ provenance }`. See [backend-standards §6](../backend-standards.md#6-api-response-conventions).

## Services + lib

- Backend service file: `apps/api/src/services/<resource>-service.ts`.
- Lib helper: `apps/api/src/lib/<topic>.ts`.
- Plugin: `apps/api/src/plugins/<topic>.ts`.
- CLI: `apps/api/src/cli/<command>.ts`.
- Frontend API client: `apps/web/src/lib/api-<resource>.ts`.
- Frontend hook: `apps/web/src/lib/use-<topic>.ts`.

## React Query keys

```ts
queryKey: [<resource>, { actorId, organizationId, workspaceId, ...filters }]
```

- First element: resource string in kebab-case (`'sales-trends'`, `'workspace-list'`).
- Always include `actorId` + `workspaceId` for workspace-scoped data.
- Mutations invalidate by resource string, scoped to current workspace.

## Capability names

- Backend: `canVerbObject(...)` returning `boolean` (`canManageInternalUsers`, `canDeleteActor`).
- Frontend `Capability` literal type: kebab-case (`'manage-internal-users'`, `'access-platform-admin'`, `'view-organizations'`).
- One name per concept. No synonyms.

## KPI naming (metric registry)

- snake_case scalar metric names: `sales_total`, `orders_total`, `units_total`, `refunds_total`, `tacos`, `acos`, `roas`, `cpc`, `ctr`, `cvr`, `dos_blended`, `velocity_per_day`, `contribution_margin`.
- Total / b2b split: suffix `_total` / `_b2b` on canonical metrics.
- Window suffix when applicable: `_1d`, `_7d`, `_14d`, `_30d`.
- Currency on row: separate `currency_code char(3)`.
- One name per metric across BE + FE + docs.

## Engine naming

- Engine descriptor: `engine_key` = kebab-case (`'sales-aggregation'`, `'inventory-health'`, `'ppc-analytics'`, `'replenishment'`, `'forecasting'`).
- `engine_version` = semver string (`'1.0.0'`).
- Engine I/O types: `<Engine>Query`, `<Engine>Output` in `packages/calculations`.

## Chart naming

- Component: `<Module><Concept>Chart` (`DashboardRevenueTrendChart`, `AdsTacosBreakdownChart`).
- Lives under `apps/web/src/components/charts/<module>/`.
- Wraps shared `<ChartContainer>` from `packages/ui` with theme tokens + tick formatters.
- Min height: 240 desktop / 200 mobile.

## Hook naming

- React hook: `useNoun()` for data (`useSession`, `useCan`), `useNounAction()` for mutations (`useRemoveUser`, `useSwitchWorkspace`).
- Persistence helper: `use-persisted-string`, `use-persisted-set`.
- Browser/utility: `use-scrolled`.

## Component naming

- PascalCase. Filename matches export. `add-user-dialog.tsx` → `AddUserDialog`.
- Dialogs: `<Verb><Noun>Dialog`. Drawers: `<Noun>Drawer`. Panels: `<Noun>Panel`.
- Empty-state primitives: `AwaitingData`, `ComingSoonState`, `AcademyEmptyState`.

## Module + page naming

- Sidebar order fixed (see [design-system §14](../design-system.md#14-sidebar--topbar)).
- Page route segments kebab-case: `/unit-economics`, `/select-workspace`, `/sku-aliases`.
- Module shell layout: `Header → KPI Strip → Inner Tabs → Content`.

## Audit event names

- Dotted, lowercase, verb-past-tense:
  - Permissions: `permission.granted`, `permission.changed`, `permission.revoked`.
  - Modules: `module.enabled`, `module.disabled`.
  - Feature flags: `feature_flag.enabled`, `feature_flag.disabled`.
  - Reports: `report.generated`.
  - AI: `ai_recommendation.acknowledged`.
  - Lifecycle: `record.soft_deleted`, `record.restored`, `record.hard_deleted`.
  - Platform admin: `platform_admin.read`, `platform_admin.write`.

## Idempotency

- Header: `Idempotency-Key: <ulid>`.
- Generated client-side per mutation. Cached server-side with TTL.

## Cookies + headers

- Auth cookie: HTTP-only, secure, SameSite=Lax. Name set by `@xb/config`.
- Workspace switch sets cookie + writes `xb_core.sessions.active_workspace_id` in the same transaction.
- Request ID: `x-request-id` (ULID); propagated through `requestId` plugin.

## ULIDs

- Type: `char(26)`. Generated via `apps/api/src/lib/ulid.ts`.
- Time-ordered → `(organization_id, id DESC)` doubles as pagination + time scan.

## File / directory layout shortcuts

| Concern | Path |
|---|---|
| Permissions module (BE) | `apps/api/src/lib/permissions.ts` |
| Permissions mirror (FE) | `apps/web/src/lib/use-can.ts` |
| Resolver | `packages/auth/src/resolver.ts` |
| Engine interface | `packages/calculations/src/engine.ts` |
| Theme tokens | `packages/ui/src/tokens/` |
| Migrations | `sql/migrations/` |
| Validators | `apps/api/src/uploads/validators/` |
| Mappers | `apps/api/src/uploads/mappers/` |

## Branch + commit

- Branch: `<type>/<slug>` — `feat/permissions-canonical-rbac`, `fix/purge-self-row`.
- Commit: conventional (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`). Optional scope: `feat(api):`, `feat(ui):`.
- One slice per PR. PR description follows [pr-template](pr-template.md).
