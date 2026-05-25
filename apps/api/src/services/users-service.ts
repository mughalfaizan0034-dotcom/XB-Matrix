import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId, UserId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';
import {
  actorKindFor,
  canAccessPlatformAdmin,
  canCreateUserWithRole,
  canDeleteActor,
  canManageInternalUsers,
  canReadPlatformUsers,
  hasOrgScope,
  internalRoleColumnFor,
  isCreatableRole,
  isInternalCreatableRole,
  orgRoleColumnFor,
  userKindFor,
  type CreatableRole,
  type CreateUserRole,
} from '../lib/permissions.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import {
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  SemanticError,
} from '../lib/errors.js';

export interface UserSummary {
  readonly id: string;
  readonly actorId: string;
  readonly username: string;
  /** Email is now optional — admins create users with username only. */
  readonly email: string | null;
  readonly displayName: string;
  readonly userKind: 'internal' | 'organization';
  readonly organizationId: string | null;
  readonly internalRole: 'super_admin' | 'manager' | 'staff' | null;
  readonly orgRole: 'admin' | 'user' | null;
  readonly status: 'active' | 'deactivated' | 'pending_invite';
  readonly emailVerifiedAt: string | null;
  readonly lastLoginAt: string | null;
  readonly createdAt: string;
  readonly rowVersion: number;
}

interface UserRow {
  id: string;
  actor_id: string;
  username: string;
  email: string | null;
  display_name: string;
  user_kind: 'internal' | 'organization';
  organization_id: string | null;
  internal_user_role: 'super_admin' | 'manager' | 'staff' | null;
  organization_user_role: 'admin' | 'user' | null;
  user_status: 'active' | 'deactivated' | 'pending_invite';
  email_verified_at: Date | null;
  last_login_at: Date | null;
  created_at: Date;
  row_version: number;
}

const SELECT_USER = `
  SELECT id, actor_id, username, email, display_name, user_kind, organization_id,
         internal_user_role, organization_user_role, user_status,
         email_verified_at, last_login_at, created_at, row_version
    FROM xb_core.users
   WHERE deleted_at IS NULL
`;

function rowToSummary(r: UserRow): UserSummary {
  return {
    id: r.id,
    actorId: r.actor_id,
    username: r.username,
    email: r.email,
    displayName: r.display_name,
    userKind: r.user_kind,
    organizationId: r.organization_id,
    internalRole: r.internal_user_role,
    orgRole: r.organization_user_role,
    status: r.user_status,
    emailVerifiedAt: r.email_verified_at ? r.email_verified_at.toISOString() : null,
    lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    rowVersion: r.row_version,
  };
}

export interface ListUsersOptions {
  readonly organizationId?: OrganizationId | null;
  readonly status?: UserSummary['status'];
  readonly limit?: number;
}

/**
 * List users. Visibility rules:
 *   - super_admin / internal_manager / internal_staff → any users
 *     (any org), staff is read-only at the service-action layer
 *   - organization_admin / organization_user → only users in their
 *     own org, forced server-side
 *
 * Authorization composes canReadPlatformUsers (platform-wide read)
 * and canManageInternalUsers (default scope when listing without an
 * orgId filter). Inline role-string checks would drift from the
 * frontend useCan() mirror.
 */
export async function listUsers(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListUsersOptions = {},
): Promise<ReadonlyArray<UserSummary>> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  // Org-scoped callers cannot read across orgs; force the filter to
  // their own org regardless of what they asked for.
  let orgFilter: string | null | undefined = opts.organizationId ?? null;
  if (!canReadPlatformUsers(actor)) {
    if (!actor.organizationId) {
      throw new ForbiddenError('no organization context', 'no_org');
    }
    orgFilter = actor.organizationId;
  }

  await app.assertPermission(actor, {
    organizationId: (orgFilter ?? actor.organizationId ?? 'platform') as OrganizationId,
    workspaceId: null,
    module: 'settings',
    action: 'view',
  });

  const params: unknown[] = [];
  const where: string[] = [];
  if (orgFilter !== null && orgFilter !== undefined) {
    params.push(orgFilter);
    where.push(`organization_id = $${params.length}`);
  } else if (orgFilter === null && canManageInternalUsers(actor)) {
    // Manager-tier listing without ?organizationId — default to
    // internal users only. Read-only staff land here too via
    // canReadPlatformUsers above, but assertPermission will already
    // have surfaced any staff-write attempt downstream.
    where.push(`organization_id IS NULL`);
  }
  if (opts.status) {
    params.push(opts.status);
    where.push(`user_status = $${params.length}`);
  }
  const whereSql = where.length ? `AND ${where.join(' AND ')}` : '';
  params.push(limit);

  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<UserRow>(
      `${SELECT_USER} ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map(rowToSummary);
  });
}

export async function getUser(
  app: FastifyInstance,
  actor: ActorContext,
  id: UserId,
): Promise<UserSummary | null> {
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<UserRow>(`${SELECT_USER} AND id = $1`, [id]);
    const row = rows[0];
    if (!row) return null;
    // Org-scoped callers cannot read across orgs.
    if (!canReadPlatformUsers(actor)) {
      if (row.organization_id !== actor.organizationId) {
        throw new ForbiddenError('cannot view users outside your organization', 'org_scope');
      }
    }
    return rowToSummary(row);
  });
}

// ---------------------------------------------------------------------------
// Direct create — username + password only, no invitation roundtrip
// ---------------------------------------------------------------------------
//
// This is the PRIMARY user-creation path (2026-05-20 auth pivot).
// invitations-service stays in the tree but is dormant until email
// infrastructure (resend.com) is set up; at that point the email-based
// invite flow can re-activate as an optional path.
//
// Authorization composes canonical guards:
//   - isCreatableRole          : super_admin payload rejected before
//                                 any DB work (D-006)
//   - canCreateUserWithRole    : who-can-make-what role-tier matrix
//   - hasOrgScope              : org-admin scoped to own org; internal
//                                 manager-tier any org

export interface CreateUserInput {
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: CreateUserRole;
  /** Required for organization_* roles; ignored for internal_* */
  readonly organizationId?: OrganizationId | null;
}

export async function createUser(
  app: FastifyInstance,
  actor: ActorContext,
  input: CreateUserInput,
): Promise<UserSummary> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!/^[a-z0-9._-]{3,120}$/.test(username)) {
    throw new SemanticError(
      'Username must be 3-120 characters: lowercase letters, digits, dot, underscore, dash.',
      'invalid_username',
    );
  }
  if (!displayName) {
    throw new SemanticError('Display name is required.', 'invalid_input');
  }
  if (input.password.length < 12) {
    throw new SemanticError('Password must be at least 12 characters.', 'weak_password');
  }

  // Super admin is locked — provisioned only via DB migration. No API
  // path (not even from another super admin) can create one. Operator
  // direction 2026-05-20: there is exactly one super admin (D-006).
  if (!isCreatableRole(input.role)) {
    throw new ForbiddenError(
      'Super admin is provisioned only via database migration. Not creatable from the API.',
      'super_admin_locked',
    );
  }
  const targetRole: CreatableRole = input.role;

  const orgId = isInternalCreatableRole(targetRole)
    ? null
    : input.organizationId ?? null;
  if (!isInternalCreatableRole(targetRole) && !orgId) {
    throw new SemanticError(
      'organization_admin and organization_user require an organizationId.',
      'invalid_input',
    );
  }

  if (!canCreateUserWithRole(actor, targetRole)) {
    if (targetRole === 'internal_manager') {
      throw new ForbiddenError(
        'Only super admins can create other internal managers.',
        'role_scope',
      );
    }
    if (isInternalCreatableRole(targetRole)) {
      throw new ForbiddenError(
        'You cannot create internal users.',
        'role_scope',
      );
    }
    throw new ForbiddenError(
      'Only super admins, internal managers, and organization admins can create users.',
      'not_authorized',
    );
  }
  if (orgId && !hasOrgScope(actor, orgId)) {
    throw new ForbiddenError(
      'Cannot create users outside your organization.',
      'org_scope',
    );
  }

  const hash = await hashPassword(input.password);
  const userId = ulid();
  const newActorId = ulid();

  try {
    return await app.withConnection(actor, async (client) => {
      if (orgId) {
        const { rows: orgRows } = await client.query<{
          display_name: string;
          organization_status: string;
        }>(
          `SELECT display_name, organization_status
             FROM xb_core.organizations
            WHERE id = $1 AND deleted_at IS NULL`,
          [orgId],
        );
        const org = orgRows[0];
        if (!org) throw new NotFoundError('organization', orgId);
        if (org.organization_status !== 'active') {
          throw new SemanticError(
            `Cannot create users in a ${org.organization_status} organization.`,
            'parent_org_not_active',
          );
        }
      }

      await client.query(
        `INSERT INTO xb_core.actors
           (id, organization_id, actor_kind, display_name, actor_status, created_by_actor_id)
         VALUES ($1, $2, $3, $4, 'active', $5)`,
        [
          newActorId,
          orgId,
          actorKindFor(targetRole),
          displayName,
          actor.actorId,
        ],
      );

      // Email column stays NULL (migration 0016 made it nullable).
      // When email lifecycle ships, admins can set email on existing
      // users via a future PATCH endpoint.
      await client.query(
        `INSERT INTO xb_core.users
           (id, actor_id, user_kind, organization_id, username, display_name, email,
            password_hash, internal_user_role, organization_user_role,
            user_status, password_changed_at, created_by_actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, 'active', now(), $10)`,
        [
          userId,
          newActorId,
          userKindFor(targetRole),
          orgId,
          username,
          displayName,
          hash,
          internalRoleColumnFor(targetRole),
          orgRoleColumnFor(targetRole),
          actor.actorId,
        ],
      );

      const { rows } = await client.query<UserRow>(`${SELECT_USER} AND id = $1`, [userId]);
      return rowToSummary(rows[0]!);
    });
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505' && pgErr.constraint === 'uq_users_username') {
      throw new ConflictError(
        `A user with the username "${username}" already exists.`,
        'username_taken',
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Admin password reset (no email lifecycle)
// ---------------------------------------------------------------------------

/**
 * Self-service: update the current actor's user profile (display name
 * only — username and email are not user-editable). Runs inside
 * withConnection so the audit trigger captures the actor context.
 */
export async function updateOwnProfile(
  app: FastifyInstance,
  actor: ActorContext,
  input: { displayName: string },
): Promise<UserSummary> {
  const name = input.displayName.trim();
  if (name.length === 0 || name.length > 200) {
    throw new SemanticError('Display name must be 1–200 characters.', 'invalid_display_name');
  }
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<UserRow>(
      `UPDATE xb_core.users
          SET display_name = $2,
              updated_by_actor_id = $3
        WHERE actor_id = $1 AND deleted_at IS NULL
        RETURNING id, actor_id, username, email, display_name, user_kind,
                  organization_id, internal_user_role, organization_user_role,
                  user_status, email_verified_at, last_login_at, created_at,
                  row_version`,
      [actor.actorId, name, actor.actorId],
    );
    if (rows.length === 0) throw new NotFoundError('user', actor.actorId);
    return rowToSummary(rows[0]!);
  });
}

/**
 * Self-service: change the current actor's password. Requires the
 * current password as proof — distinct from adminResetPassword which
 * is the admin-resets-someone-else flow. Does NOT revoke sibling
 * sessions; a deliberate password change shouldn't kick the user out
 * on other devices.
 *
 * Runs inside withConnection so the audit trigger captures the actor
 * context on the UPDATE — direct app.pg.query would leave a NULL
 * actor in audit_log (D-009).
 */
export async function changeOwnPassword(
  app: FastifyInstance,
  actor: ActorContext,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 12 || newPassword.length > 200) {
    throw new SemanticError('New password must be 12–200 characters.', 'weak_password');
  }
  await app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{ password_hash: string }>(
      `SELECT password_hash FROM xb_core.users
        WHERE actor_id = $1 AND deleted_at IS NULL`,
      [actor.actorId],
    );
    if (rows.length === 0) throw new NotFoundError('user', actor.actorId);
    const ok = await verifyPassword(currentPassword, rows[0]!.password_hash);
    if (!ok) {
      throw new SemanticError('Current password is incorrect.', 'wrong_current_password');
    }
    const hash = await hashPassword(newPassword);
    await client.query(
      `UPDATE xb_core.users
          SET password_hash = $2,
              password_changed_at = now(),
              updated_by_actor_id = $3
        WHERE actor_id = $1`,
      [actor.actorId, hash, actor.actorId],
    );
  });
}

export async function adminResetPassword(
  app: FastifyInstance,
  actor: ActorContext,
  userId: UserId,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 12) {
    throw new SemanticError('Password must be at least 12 characters.', 'weak_password');
  }
  const hash = await hashPassword(newPassword);
  await app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<{
      organization_id: string | null;
      user_status: string;
    }>(
      `SELECT organization_id, user_status FROM xb_core.users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const cur = existing[0];
    if (!cur) throw new NotFoundError('user', userId);

    // Authorization composes hasOrgScope (for org-user targets) and
    // canManageInternalUsers (for internal-user targets). Org_admin
    // can only reset passwords of users in their own org; internal
    // managers + super_admin can reset anyone.
    if (cur.organization_id === null) {
      if (!canManageInternalUsers(actor)) {
        throw new ForbiddenError(
          'Only managers can reset internal user passwords.',
          'not_authorized',
        );
      }
    } else if (!hasOrgScope(actor, cur.organization_id)) {
      throw new ForbiddenError(
        'Cannot reset passwords outside your organization.',
        'org_scope',
      );
    }

    await client.query(
      `UPDATE xb_core.users
          SET password_hash = $1,
              password_changed_at = now(),
              updated_by_actor_id = $3
        WHERE id = $2 AND deleted_at IS NULL`,
      [hash, userId, actor.actorId],
    );
  });
}

/**
 * Remove a user — soft delete. No optimistic-lock version required:
 * removal is idempotent and a stale row_version should never block an
 * admin from removing a user. Sets deleted_at + deactivates + revokes
 * every live session so the account is fully retired immediately.
 */
export async function removeUser(
  app: FastifyInstance,
  actor: ActorContext,
  userId: UserId,
): Promise<void> {
  await app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      id: string;
      actor_id: string;
      organization_id: string | null;
      internal_user_role: 'super_admin' | 'manager' | 'staff' | null;
    }>(
      `SELECT id, actor_id, organization_id, internal_user_role
         FROM xb_core.users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const cur = rows[0];
    if (!cur) throw new NotFoundError('user', userId);

    // Authorization composes the canonical capability guard in one
    // call: self-lockout, super_admin protection, manager-cannot-
    // remove-manager, org-scope checks all live in canDeleteActor
    // (apps/api/src/lib/permissions.ts). Inline role checks would
    // drift; this single call mirrors the same rule applied by the
    // recycle-bin purge orchestrator and the frontend useCan() hook.
    if (
      !canDeleteActor(actor, {
        id: cur.id,
        actorId: cur.actor_id,
        internalRole: cur.internal_user_role,
        organizationId: cur.organization_id,
      })
    ) {
      throw new ForbiddenError('Not authorized to remove this user.', 'not_authorized');
    }

    await client.query(
      `UPDATE xb_core.users
          SET deleted_at = now(),
              deleted_by_actor_id = $2,
              user_status = 'deactivated'
        WHERE id = $1 AND deleted_at IS NULL`,
      [userId, actor.actorId],
    );
    await client.query(
      `UPDATE xb_core.sessions
          SET revoked_at = now(), revoke_reason = 'admin_revoke'
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  });
}

export interface DeactivateUserInput {
  readonly userId: UserId;
  readonly expectedRowVersion: number;
}

/**
 * Deactivate a user. Sets status='deactivated' which sign-in rejects.
 * Active sessions are not revoked here — call revokeAllSessionsForUser
 * separately if you want immediate sign-out everywhere.
 */
export async function deactivateUser(
  app: FastifyInstance,
  actor: ActorContext,
  input: DeactivateUserInput,
): Promise<UserSummary> {
  return app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<UserRow>(
      `${SELECT_USER} AND id = $1`,
      [input.userId],
    );
    const cur = existing[0];
    if (!cur) throw new NotFoundError('user', input.userId);

    await app.assertPermission(actor, {
      organizationId: (cur.organization_id ?? actor.organizationId ?? 'platform') as OrganizationId,
      workspaceId: null,
      module: 'settings',
      action: 'admin',
    });
    // Same set as actor.isInternalManager (super_admin + internal_manager).
    // Org-scoped callers cannot deactivate across orgs.
    if (!canAccessPlatformAdmin(actor) && cur.organization_id !== actor.organizationId) {
      throw new ForbiddenError('cannot deactivate users outside your organization', 'org_scope');
    }
    // Self-protection guard: compare actor IDs (actors.id), not user
    // IDs (users.id). The two are distinct ULIDs — the previous code
    // compared `cur.id` (user row id) to `actor.actorId` (actor row
    // id) and would have silently allowed self-deactivation.
    if (cur.actor_id === actor.actorId) {
      throw new SemanticError('You cannot deactivate yourself.', 'self_deactivate');
    }
    if (cur.user_status === 'deactivated') return rowToSummary(cur);

    const result = await client.query<UserRow>(
      `UPDATE xb_core.users
          SET user_status = 'deactivated',
              updated_by_actor_id = $3
        WHERE id = $1
          AND deleted_at IS NULL
          AND row_version = $2
        RETURNING id, actor_id, email, display_name, user_kind, organization_id,
                  internal_user_role, organization_user_role, user_status,
                  email_verified_at, last_login_at, created_at, row_version`,
      [input.userId, input.expectedRowVersion, actor.actorId],
    );
    if (result.rows.length === 0) throw new ConcurrencyError();
    return rowToSummary(result.rows[0]!);
  });
}

export async function reactivateUser(
  app: FastifyInstance,
  actor: ActorContext,
  input: DeactivateUserInput,
): Promise<UserSummary> {
  return app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<UserRow>(`${SELECT_USER} AND id = $1`, [input.userId]);
    const cur = existing[0];
    if (!cur) throw new NotFoundError('user', input.userId);

    await app.assertPermission(actor, {
      organizationId: (cur.organization_id ?? actor.organizationId ?? 'platform') as OrganizationId,
      workspaceId: null,
      module: 'settings',
      action: 'admin',
    });
    if (!canAccessPlatformAdmin(actor) && cur.organization_id !== actor.organizationId) {
      throw new ForbiddenError('cannot reactivate users outside your organization', 'org_scope');
    }
    if (cur.user_status === 'active') return rowToSummary(cur);
    if (cur.user_status === 'pending_invite') {
      throw new SemanticError(
        'User has not accepted their invitation yet — resend the invitation instead.',
        'pending_invite',
      );
    }

    const result = await client.query<UserRow>(
      `UPDATE xb_core.users
          SET user_status = 'active',
              updated_by_actor_id = $3
        WHERE id = $1
          AND deleted_at IS NULL
          AND row_version = $2
        RETURNING id, actor_id, email, display_name, user_kind, organization_id,
                  internal_user_role, organization_user_role, user_status,
                  email_verified_at, last_login_at, created_at, row_version`,
      [input.userId, input.expectedRowVersion, actor.actorId],
    );
    if (result.rows.length === 0) throw new ConcurrencyError();
    return rowToSummary(result.rows[0]!);
  });
}
