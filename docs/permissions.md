# Permissions — enterprise workspace × module × access-level

The foundational authorization layer. Permissions are **organization-aware,
workspace-aware, role-aware, module-aware** — not role names alone. The
same model flows through every surface: pages, APIs, uploads, dashboard
data, exports, AI, future automations. One centralized authorization
layer.

## Hierarchy

```
Organization → Workspace → Module/Page → Access level
```

## Access levels

Mutually exclusive — radio selection per module/page. Deterministic +
auditable.

| Level | Meaning |
|---|---|
| `none` | hidden / unreachable |
| `view` | read-only access |
| `edit` | read + write |
| `admin` | full control inside that scope (manage settings, permissions) |

The DB CHECK is `('none','view','edit','admin')` on `workspace_permissions`,
`page_permissions`, `internal_permissions`. Migration 0021 added `admin`
to the original Spec 3 set.

## Existing schema (migration 0006)

```
xb_core.workspace_permissions     user × workspace × access_level
xb_core.page_permissions          user × workspace × page_key × access_level
xb_core.internal_permissions      internal_user × organization × access_level
xb_core.workspace_permission_snapshots   frozen state at archival (audit)
```

All RLS-scoped, soft-deletable, row-versioned, audit-triggered.
`page_key` doubles as the module identifier in current code — when a
real per-org module catalogue is needed (`module_definitions` /
`module_enablement`), it slots above this without changing the
permission tables.

## Resolver lookup order (deny by default)

The resolver (`packages/auth`) walks ordered providers; first that
applies wins. Default order:

| # | Provider | Purpose |
|---|---|---|
| 1 | InternalManagerProvider | `is_internal_manager = true` → bypass + audit |
| 2 | PageOverrideProvider | per-page override (highest specificity) |
| 3 | WorkspaceGrantProvider | workspace-level grant |
| 4 | InternalPermissionProvider | internal user × org grant |
| 5 | RoleProvider | role defaults (org_admin / org_user) |

No provider applies → `deny_default`. There is no implicit allow.

## Role tiers (5)

| Role | Scope |
|---|---|
| `super_admin` | exactly ONE; migration-provisioned; full RLS bypass |
| `internal_manager` | platform-wide; creates internal_staff + org roles; RLS bypass |
| `internal_staff` | platform-wide read |
| `organization_admin` | full access within own org; manages its users + permissions |
| `organization_user` | only assigned workspaces + assigned modules |

`isInternalManager` (RLS bypass flag) is true for super_admin AND
internal_manager. `effectiveRole === 'super_admin'` for super-admin-only
checks.

## Non-negotiable operational rules

1. **Workspace isolation is mandatory.** A user assigned to workspace A
   must NEVER query, see, upload to, or get AI context from workspace B.
2. **Permissions flow everywhere.** Same layer controls pages, APIs,
   uploads, dashboards, exports, AI, reports, settings, automations.
3. **AI inherits permissions.** The assistant only sees authorized
   workspaces, only answers from authorized modules, only accesses
   authorized operational data. *"Inventory view only"* → AI cannot
   surface inventory edit/replenishment actions.
4. **API enforcement first or in parallel with UI.** Never frontend-only.
5. **Module-level granularity** enables real enterprise tenancy —
   agencies with PPC-only access, warehouse teams with inventory-only,
   finance with reports-only, executives read-only dashboards.

## Operational examples

```
Warehouse operator:
  Inventory = edit · Uploads = edit · Dashboard = view · Advertising = none

Agency PPC manager:
  Advertising = edit · Sales = view · Inventory = none

Executive:
  Everything = view

Organization admin:
  Everything = admin (within own org only)
```

## UI direction

Spreadsheet/matrix style, fast to scan, easy to audit, easy to
bulk-change. The radio-matrix pattern from the customer brief
(`None / View / Edit / Admin` columns × module rows). Later: copy from
another user, bulk workspace assignment, preset role templates,
inherited-permission view, permission diff, audit log.

## Implementation order

1. **Permission schema stabilization** — access levels (incl. `admin`),
   table audit, doc. *(this doc + migration 0021)*
2. **Workspace assignment engine** — assign user → workspace with
   per-module access levels; the service that the matrix UI calls.
3. **Permission middleware / API guards** — resolver providers point
   at `workspace_permissions` + `page_permissions`; every workspace-
   scoped read/write asserts module + level.
4. **Radio-matrix permissions UI** — per workspace, user × module ×
   level. The screenshot pattern.
5. **Module visibility enforcement** — sidebar + page guards driven by
   the same permission layer (no frontend-only allow).
6. **Upload / action enforcement** — uploads + ingestion writes gate on
   `module=uploads, action=create` etc.; same for SKU aliases, future
   inventory actions, transfers.
7. **AI permission inheritance** — the assistant's context loader
   filters every engine call by the user's authorized modules; the
   recommendation set is scoped accordingly.
8. **Permission audit logging** — every grant/change recorded via the
   existing audit trigger + operation-audit writes
   (`permission.granted`, `permission.changed`, `permission.revoked`).
9. **Preset role templates** — Warehouse op / Agency PPC / Executive /
   Finance / Org admin — one-click apply with deviations highlighted.

## Future-proofing

The same layer will gate AI action permissions, automation approvals,
workflow approvals, forecasting approvals, transfer approvals,
warehouse operations, financial exports, audit compliance. Foundational
enterprise infrastructure — not UI polish.
