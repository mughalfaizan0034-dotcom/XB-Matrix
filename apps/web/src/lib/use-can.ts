'use client';

import { useSession, type SessionUser } from './session';

/**
 * Frontend mirror of the backend's canonical permissions module
 * (apps/api/src/lib/permissions.ts). UI gating composes the same
 * capability checks the API enforces, so a disabled button + a 403
 * response can never disagree.
 *
 * Direction (project_rbac_governance memory):
 *   - capabilities, NOT roles. UI code calls useCan('manage-internal-users'),
 *     never `user.effectiveRole === 'super_admin'`.
 *   - keep this file mirroring the backend permissions module exactly.
 *     If the backend rule changes, this file changes with it (same PR).
 *   - inline role checks outside this module + apps/api/src/lib/
 *     permissions.ts will get banned by a CI guard in a follow-up PR.
 *
 * The hook returns a stable boolean while the session is loading so
 * components don't flicker between authorized/unauthorized states
 * during hydration. Defaults to false — start locked, open as the
 * session resolves.
 */

export type Capability =
  | 'manage-internal-users'
  | 'view-organizations'
  | 'access-platform-admin'
  | 'create-internal-manager'
  | 'create-internal-staff';

export function useCan(capability: Capability): boolean {
  const { data: user } = useSession();
  if (!user) return false;
  return check(user, capability);
}

/**
 * Out-of-component capability check for callers that already have the
 * session user in hand. Use this in handlers / computed props where
 * the hook form doesn't fit.
 */
export function can(user: SessionUser | null | undefined, capability: Capability): boolean {
  if (!user) return false;
  return check(user, capability);
}

// ----- The canonical mirror ------------------------------------------

function isSuperAdmin(u: SessionUser): boolean {
  return u.effectiveRole === 'super_admin';
}
function isInternalManager(u: SessionUser): boolean {
  return u.effectiveRole === 'internal_manager';
}
function isInternalStaff(u: SessionUser): boolean {
  return u.effectiveRole === 'internal_staff';
}
function isAnyInternal(u: SessionUser): boolean {
  return isSuperAdmin(u) || isInternalManager(u) || isInternalStaff(u);
}

function canManageInternalUsers(u: SessionUser): boolean {
  return isSuperAdmin(u) || isInternalManager(u);
}

function check(user: SessionUser, capability: Capability): boolean {
  switch (capability) {
    case 'manage-internal-users':
      return canManageInternalUsers(user);
    case 'view-organizations':
      return isAnyInternal(user);
    case 'access-platform-admin':
      // Platform admin WRITE surface (Recycle Bin purge, billing,
      // feature flags). Read-only platform surfaces use
      // view-organizations to keep internal_staff in.
      return isSuperAdmin(user) || isInternalManager(user);
    case 'create-internal-manager':
      // Role-escalation cap: only super_admin can create another
      // manager. Even other managers cannot.
      return isSuperAdmin(user);
    case 'create-internal-staff':
      return canManageInternalUsers(user);
  }
}

// ----- Target-row capability checks ----------------------------------

/**
 * Whether the actor can soft-delete (or purge) a target user row.
 * Mirrors `canDeleteActor` in the backend permissions module exactly:
 * self-lockout, super_admin protection, manager-cannot-remove-manager,
 * org-scope for org-admin actors.
 */
export interface DeleteTarget {
  /** xb_core.users.id */
  readonly id: string;
  /** xb_core.users.actor_id - for self check */
  readonly actorId: string;
  /** DB column value ('manager'/'staff'/'super_admin' for internal; null for org) */
  readonly internalRole: 'super_admin' | 'manager' | 'staff' | null;
  /** Required when target is an org user */
  readonly organizationId: string | null;
}

export function canDeleteActor(
  user: SessionUser | null | undefined,
  target: DeleteTarget,
): boolean {
  if (!user) return false;
  if (target.actorId === user.actorId) return false;
  if (target.internalRole === 'super_admin') return false;
  if (target.internalRole === 'manager') return isSuperAdmin(user);
  if (target.internalRole === 'staff') return canManageInternalUsers(user);
  // org user
  if (target.internalRole === null) {
    if (isSuperAdmin(user) || isInternalManager(user)) return true;
    if (
      user.effectiveRole === 'organization_admin' &&
      user.organizationId !== null &&
      target.organizationId !== null &&
      user.organizationId === target.organizationId
    ) {
      return true;
    }
    return false;
  }
  return false;
}
