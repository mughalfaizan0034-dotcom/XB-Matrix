import type { ActorContext, EffectiveRole } from '@xb/types';

/**
 * Canonical authorization module. Every backend access decision goes
 * through one of the capability guards here; never inline
 * `actor.effectiveRole === 'super_admin'` outside this file.
 *
 * Direction (project_rbac_governance memory):
 *   - capabilities, NOT roles. The public API names a permission, not
 *     a role tier.
 *   - role hierarchy is an internal helper; the rest of the codebase
 *     should compose capabilities, not reach for role strings.
 *   - resource ownership, workspace access, and capability checks are
 *     deliberately distinct concerns. Don't collapse them into a
 *     single "can do X" boolean for every role.
 *   - frontend useCan() mirrors this file exactly so UI gating cannot
 *     diverge from backend policy.
 *
 * Sequencing for any new capability (locked, see permissions.md §11):
 *   1. backend policy correctness here
 *   2. RLS correctness in the migration
 *   3. expose the capability guard here
 *   4. service-layer adopts the guard
 *   5. UI consumes via useCan()
 *   6. nav / button visibility cleans up
 *
 * Never invert.
 */

// ----- Role hierarchy helpers (INTERNAL — never expose role strings) -

function isSuperAdmin(actor: ActorContext): boolean {
  return actor.effectiveRole === 'super_admin';
}

function isInternalManager(actor: ActorContext): boolean {
  return actor.effectiveRole === 'internal_manager';
}

function isInternalStaff(actor: ActorContext): boolean {
  return actor.effectiveRole === 'internal_staff';
}

function isAnyInternal(actor: ActorContext): boolean {
  return isSuperAdmin(actor) || isInternalManager(actor) || isInternalStaff(actor);
}

function isOrganizationAdmin(actor: ActorContext): boolean {
  return actor.effectiveRole === 'organization_admin';
}

// ----- Target descriptors --------------------------------------------

/**
 * Values stored in xb_core.users.internal_user_role. Null for org
 * users. These are the DB column values (NOT the effectiveRole
 * derivations seen on the actor).
 */
export type UserInternalRoleDb = 'super_admin' | 'manager' | 'staff' | null;

/**
 * Minimal shape of a user row needed by canDeleteActor / role-modify
 * decisions. The caller pulls these columns from xb_core.users before
 * invoking the guard.
 */
export interface UserTarget {
  /** xb_core.users.id (NOT actor_id). */
  readonly id: string;
  /** xb_core.users.actor_id — used for self-check. */
  readonly actorId: string;
  /** xb_core.users.internal_user_role. Null for org users. */
  readonly internalRole: UserInternalRoleDb;
  /** xb_core.users.organization_id. Null for internal users. */
  readonly organizationId: string | null;
}

// ----- Capability guards (the public API) ----------------------------

/**
 * Internal users (cross-org platform staff) management.
 * Manager + super_admin can create / remove internal staff. Internal
 * staff has read-only platform access and cannot manage other
 * internal users.
 */
export function canManageInternalUsers(actor: ActorContext): boolean {
  return isSuperAdmin(actor) || isInternalManager(actor);
}

/**
 * Who can list / view organizations across the platform.
 * All internal roles — staff gets platform-wide READ for operational
 * visibility (D-050). Org-level users only see their own org through
 * separate gating downstream.
 */
export function canViewOrganizations(actor: ActorContext): boolean {
  return isAnyInternal(actor);
}

/**
 * Platform-wide read of users (lists + lookups across orgs).
 * Same set as canViewOrganizations — every internal tier (including
 * read-only staff) sees the cross-org user surface. Org-level users
 * are filtered to their own org by the caller.
 */
export function canReadPlatformUsers(actor: ActorContext): boolean {
  return isAnyInternal(actor);
}

/**
 * Roles that may be assigned to a new user via the API.
 * Super_admin is intentionally absent — it is provisioned only via
 * migration per D-006.
 */
export type CreatableRole =
  | 'internal_manager'
  | 'internal_staff'
  | 'organization_admin'
  | 'organization_user';

/**
 * Superset accepted by the createUser DTO. Includes 'super_admin' only
 * so the API can produce a deterministic 403 — never as a creatable
 * value (D-006). Use `isCreatableRole` to narrow before any DB work.
 */
export type CreateUserRole = CreatableRole | 'super_admin';

/**
 * Whether the role payload is creatable from the API at all. Super
 * admin is locked — provisioned only via DB migration; no API caller
 * may produce one. Encapsulated here so the role-string compare stays
 * inside the canonical module.
 */
export function isCreatableRole(role: CreateUserRole): role is CreatableRole {
  return role !== 'super_admin';
}

/**
 * Whether the actor can create a user with the given target role.
 *
 *   super_admin       → can create internal_manager + internal_staff + org_*
 *   internal_manager  → can create internal_staff + org_* (NOT another manager)
 *   organization_admin → can create org_admin + org_user (own org only,
 *                         org-scope is verified by the caller separately)
 *   internal_staff / org_user → cannot create users
 *
 * The role-escalation cap from D-051 is encoded here in one place:
 * only super_admin can elevate to internal_manager.
 */
export function canCreateUserWithRole(
  actor: ActorContext,
  targetRole: CreatableRole,
): boolean {
  if (targetRole === 'internal_manager') return isSuperAdmin(actor);
  if (targetRole === 'internal_staff') return canManageInternalUsers(actor);
  if (targetRole === 'organization_admin' || targetRole === 'organization_user') {
    return (
      isSuperAdmin(actor) ||
      isInternalManager(actor) ||
      isOrganizationAdmin(actor)
    );
  }
  return false;
}

/**
 * Whether the actor can soft-delete (or hard-purge) a target user row.
 * Composes the platform's identity-protection rules (D-031):
 *
 *   - actor cannot delete themselves (self-lockout guard)
 *   - super_admin row is immutable
 *   - manager-target requires super_admin actor
 *   - staff-target requires canManageInternalUsers
 *   - org-user target requires either internal-manager-tier OR an
 *     org_admin whose org matches the target's org
 *
 * Used by removeUser AND the recycle-bin purge orchestrator.
 */
export function canDeleteActor(
  actor: ActorContext,
  target: UserTarget,
): boolean {
  // Self-lockout guard.
  if (target.actorId === actor.actorId) return false;

  // Super_admin row never deletable from outside migrations.
  if (target.internalRole === 'super_admin') return false;

  // Internal-manager target requires super_admin actor.
  if (target.internalRole === 'manager') return isSuperAdmin(actor);

  // Internal-staff target requires manager-tier authority.
  if (target.internalRole === 'staff') return canManageInternalUsers(actor);

  // Org user target. Internal manager-tier can delete anyone in any
  // org; org_admin can delete users in their own org only.
  if (target.internalRole === null) {
    if (isSuperAdmin(actor) || isInternalManager(actor)) return true;
    if (
      isOrganizationAdmin(actor) &&
      actor.organizationId !== null &&
      actor.organizationId === target.organizationId
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Whether the actor has WRITE authority over the given organization.
 *
 *   - super_admin + internal_manager: every org
 *   - internal_staff: false (read-only platform access; use
 *     canViewOrganizations for reads)
 *   - organization_admin: only their own org
 *   - everyone else: false
 */
export function hasOrgScope(
  actor: ActorContext,
  organizationId: string,
): boolean {
  if (isSuperAdmin(actor) || isInternalManager(actor)) return true;
  if (
    isOrganizationAdmin(actor) &&
    actor.organizationId !== null &&
    actor.organizationId === organizationId
  ) {
    return true;
  }
  return false;
}

/**
 * Whether the actor can assume the platform-admin surface for WRITE
 * operations (Recycle Bin purge, billing, feature flags, etc.).
 * Read-only platform surfaces should use canViewOrganizations so
 * internal_staff retains operational visibility.
 */
export function canAccessPlatformAdmin(actor: ActorContext): boolean {
  return isSuperAdmin(actor) || isInternalManager(actor);
}

/**
 * Whether the actor needs an explicit workspace_permissions row to
 * see a workspace. Only `organization_user` is gated this way —
 * internal-tier roles bypass via RLS, org_admin keeps implicit access
 * to every workspace in their own org (they're the ones who grant).
 */
export function requiresExplicitWorkspaceGrant(actor: ActorContext): boolean {
  return actor.effectiveRole === 'organization_user';
}

// ----- Resolver-root helpers -----------------------------------------

/**
 * Derive the RLS-bypass flag from an effective role string. Used by
 * the resolver root (auth-cookie plugin + auth-service sign-in) when
 * materializing the actor context. Role-string knowledge stays in
 * this module so consumers can't drift.
 *
 * Super_admin and internal_manager both bypass; staff does not.
 */
export function deriveIsInternalManager(role: EffectiveRole): boolean {
  return role === 'super_admin' || role === 'internal_manager';
}

// ----- DTO → DB column mappers ---------------------------------------
//
// These translate a creatable-role payload (request DTO) into the
// (user_kind, actor_kind, internal_user_role, organization_user_role)
// column tuple stored in xb_core.users + xb_core.actors. They keep
// role-string knowledge confined to this module so the rest of the
// codebase composes named helpers, never inline ternaries.

/**
 * True for the role tiers stored as internal users (no organization).
 */
export function isInternalCreatableRole(role: CreatableRole): boolean {
  return role === 'internal_manager' || role === 'internal_staff';
}

export function internalRoleColumnFor(role: CreatableRole): UserInternalRoleDb {
  if (role === 'internal_manager') return 'manager';
  if (role === 'internal_staff') return 'staff';
  return null;
}

export function orgRoleColumnFor(role: CreatableRole): 'admin' | 'user' | null {
  if (role === 'organization_admin') return 'admin';
  if (role === 'organization_user') return 'user';
  return null;
}

export function userKindFor(role: CreatableRole): 'internal' | 'organization' {
  return isInternalCreatableRole(role) ? 'internal' : 'organization';
}

export function actorKindFor(
  role: CreatableRole,
): 'internal_user' | 'organization_user' {
  return isInternalCreatableRole(role) ? 'internal_user' : 'organization_user';
}

// Internal-staff specifics surfaced for places that need to render
// "staff sees this but can't act on it" affordances. Compose with
// canViewOrganizations rather than reaching for this directly.
export { isInternalStaff };
