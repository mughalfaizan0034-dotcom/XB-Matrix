# permissions

Canonical RBAC module. See [architecture §7](architecture.md#7-workspace-scoped-security-non-negotiable) and [engineering-rules](engineering-rules.md).

## 1. Philosophy

- **Capabilities, not roles.** Public API names a permission, not a role tier.
- Single source of truth: `apps/api/src/lib/permissions.ts`. Frontend mirror: `apps/web/src/lib/use-can.ts` (exact 1:1).
- Resource ownership, workspace access, and capability checks are distinct. Never collapse into one boolean.
- Deny by default.

## 2. Role tiers (5)

| Role | Scope | Notes |
|---|---|---|
| `super_admin` | exactly ONE | migration-provisioned only; full RLS bypass; not creatable via API/UI |
| `internal_manager` | platform-wide | creates internal_staff + org roles; full RLS bypass; cannot create another manager |
| `internal_staff` | platform-wide read | no writes; visibility only |
| `organization_admin` | own org | manages own org's users + permissions |
| `organization_user` | own org operational | only assigned workspaces + modules |

`isInternalManager` RLS bypass flag = true for super_admin + internal_manager. Super-admin-only checks use `effectiveRole === 'super_admin'`, never inline outside `permissions.ts`.

## 3. Workspace × module × access level

Hierarchy: `Organization → Workspace → Module/Page → Access level`.

| Level | Meaning |
|---|---|
| `none` | hidden / unreachable |
| `view` | read-only |
| `edit` | read + write |
| `admin` | full control inside scope (settings, permissions) |

Stored on `xb_core.workspace_permissions`, `page_permissions`, `internal_permissions`. CHECK = `('none','view','edit','admin')`.

## 4. Resolver (`packages/auth`) — provider order

First applies wins. Default order:

1. `InternalManagerProvider` — `is_internal_manager=true` → bypass + audit
2. `PageOverrideProvider` — per-page override (highest specificity)
3. `WorkspaceGrantProvider` — workspace-level grant
4. `InternalPermissionProvider` — internal user × org grant
5. `RoleProvider` — role defaults

No provider applies → `deny_default`. There is no implicit allow.

## 5. Capability guards (public API)

Defined in `apps/api/src/lib/permissions.ts`. Add new guards here only. Frontend `useCan(capability)` mirrors exactly.

| Guard | Allowed roles |
|---|---|
| `canManageInternalUsers` | super_admin, internal_manager |
| `canViewOrganizations` | any internal (incl. staff read) |
| `canAccessPlatformAdmin` | super_admin, internal_manager (WRITE platform surfaces) |
| `canCreateUserWithRole(role)` | rules in §6 |
| `canDeleteActor(target)` | rules in §7 |
| `hasOrgScope(orgId)` | super_admin, internal_manager, org_admin (own org only) |

## 6. Role escalation cap

- `internal_manager` → super_admin only
- `internal_staff` → super_admin or internal_manager
- `organization_*` → super_admin, internal_manager, or organization_admin (same org)
- `super_admin` → migration only, never API

## 7. canDeleteActor — composed rules

- Self-lockout: actor cannot delete themselves.
- Super_admin row: never deletable.
- Manager target: requires super_admin.
- Staff target: requires manager-tier.
- Org user target: internal manager-tier OR org_admin in same org.

Used by `removeUser` AND recycle-bin purge orchestrator. Both backend.

## 8. RLS expectations

- Every tenant-scoped table has `p_<t>_tenant_isolation` policy reading `app.current_organization_id`.
- Bypass: `app.is_internal_manager = 'true'`.
- Platform-global tables (`organizations`, `internal_users`, `internal_permissions`, `feature_flags`, `module_definitions`, `engines`, `ai_*`) have no RLS — gated by app capability checks.
- RLS = org-level only. Workspace authz lives in the resolver.

## 9. Actor-scoped query rules

Backend:
- Queries filter by `(organization_id, workspace_id)` first, then by resource.
- Workspace ID derives from session (`requireActiveWorkspace()`), never request body.
- Cross-org reads require explicit `isInternalManager` branch + audit.

Frontend:
- React Query keys include `actorId` + active `workspaceId`. See [frontend-standards §1](frontend-standards.md#1-react-query).
- Cache invalidates on actor or workspace change (`queryClient.clear()`).

## 10. Forbidden patterns (CI-banned)

- Inline `actor.effectiveRole === '...'` outside `apps/api/src/lib/permissions.ts` and `apps/web/src/lib/use-can.ts`.
- Frontend-only authorization. UI gating must mirror a backend guard.
- Trusting `req.body.workspaceId` for tenancy.
- Resolver bypass via raw SQL `SET LOCAL app.is_internal_manager = 'true'` outside permitted internal-manager flows.
- Re-implementing capability logic in services. Always import from the canonical module.

## 11. Capability addition sequence (locked)

1. Backend policy in `apps/api/src/lib/permissions.ts`
2. RLS correctness in the migration
3. Capability guard exposed
4. Service-layer adopts guard
5. UI consumes via `useCan()`
6. Nav / button visibility cleanup

Never invert.

## 12. Audit

Every grant/change → `permission.granted` / `permission.changed` / `permission.revoked` via operation-audit writes + audit trigger on the permission tables.

## 13. AI inheritance

AI assistant inherits active workspace + permission scope. View-only modules → AI cannot surface edit actions. Cross-workspace reasoning is impossible by construction.

## Cross-refs

[architecture](architecture.md) · [backend-standards](backend-standards.md) · [engineering-rules](engineering-rules.md) · [data-model](data-model.md)
