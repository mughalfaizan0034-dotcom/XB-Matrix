import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId, UserId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';
import { hashPassword } from '../lib/password.js';
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
  readonly internalRole: 'manager' | 'staff' | null;
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
  internal_user_role: 'manager' | 'staff' | null;
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
 *   - internal_manager  → any users (org or internal), any org
 *   - internal_staff    → any users, read-only
 *   - organization_admin / organization_user → only org users in their own org
 */
export async function listUsers(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListUsersOptions = {},
): Promise<ReadonlyArray<UserSummary>> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  // For org-scoped callers, force the filter to their org.
  let orgFilter: string | null | undefined = opts.organizationId ?? null;
  if (!actor.isInternalManager && actor.effectiveRole !== 'internal_staff') {
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
  } else if (orgFilter === null && actor.isInternalManager) {
    // Manager listing without ?organizationId — show internal users only.
    where.push(`organization_id IS NULL`);
  }
  if (opts.status) {
    params.push(opts.status);
    where.push(`user_status = $${params.length}`);
  }
  const whereSql = where.length ? `AND ${where.join(' AND ')}` : '';
  params.push(limit);

  const { rows } = await app.pg.query<UserRow>(
    `${SELECT_USER} ${whereSql} ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(rowToSummary);
}

export async function getUser(
  app: FastifyInstance,
  actor: ActorContext,
  id: UserId,
): Promise<UserSummary | null> {
  const { rows } = await app.pg.query<UserRow>(`${SELECT_USER} AND id = $1`, [id]);
  const row = rows[0];
  if (!row) return null;
  // Scope check
  if (!actor.isInternalManager && actor.effectiveRole !== 'internal_staff') {
    if (row.organization_id !== actor.organizationId) {
      throw new ForbiddenError('cannot view users outside your organization', 'org_scope');
    }
  }
  return rowToSummary(row);
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
// Authorization:
//   - internal_manager: create any role, any org
//   - organization_admin: create organization_admin / organization_user
//     within their own org
//   - others: rejected

export type CreateUserRole =
  | 'internal_manager'
  | 'internal_staff'
  | 'organization_admin'
  | 'organization_user';

export interface CreateUserInput {
  readonly username: string;
  readonly displayName: string;
  readonly password: string;
  readonly role: CreateUserRole;
  /** Required for organization_* roles; ignored for internal_* */
  readonly organizationId?: OrganizationId | null;
}

function isInternalRole(role: CreateUserRole): boolean {
  return role === 'internal_manager' || role === 'internal_staff';
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

  const orgId = isInternalRole(input.role) ? null : input.organizationId ?? null;
  if (!isInternalRole(input.role) && !orgId) {
    throw new SemanticError(
      'organization_admin and organization_user require an organizationId.',
      'invalid_input',
    );
  }

  // Authorization: manager OR org-admin-in-own-org.
  if (actor.isInternalManager) {
    // ok
  } else if (actor.effectiveRole === 'organization_admin') {
    if (isInternalRole(input.role)) {
      throw new ForbiddenError(
        'Only internal managers can create internal users.',
        'role_scope',
      );
    }
    if (orgId !== actor.organizationId) {
      throw new ForbiddenError(
        'Cannot create users outside your organization.',
        'org_scope',
      );
    }
  } else {
    throw new ForbiddenError(
      'Only internal managers and organization admins can create users.',
      'not_authorized',
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
          isInternalRole(input.role) ? 'internal_user' : 'organization_user',
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
          isInternalRole(input.role) ? 'internal' : 'organization',
          orgId,
          username,
          displayName,
          hash,
          isInternalRole(input.role)
            ? input.role === 'internal_manager'
              ? 'manager'
              : 'staff'
            : null,
          isInternalRole(input.role)
            ? null
            : input.role === 'organization_admin'
              ? 'admin'
              : 'user',
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

export async function adminResetPassword(
  app: FastifyInstance,
  actor: ActorContext,
  userId: UserId,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 12) {
    throw new SemanticError('Password must be at least 12 characters.', 'weak_password');
  }
  const { rows: existing } = await app.pg.query<{
    organization_id: string | null;
    user_status: string;
  }>(
    `SELECT organization_id, user_status FROM xb_core.users WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  const cur = existing[0];
  if (!cur) throw new NotFoundError('user', userId);
  if (!actor.isInternalManager) {
    if (actor.effectiveRole !== 'organization_admin') {
      throw new ForbiddenError(
        'Only managers and org admins can reset passwords.',
        'not_authorized',
      );
    }
    if (cur.organization_id !== actor.organizationId) {
      throw new ForbiddenError(
        'Cannot reset passwords outside your organization.',
        'org_scope',
      );
    }
  }
  const hash = await hashPassword(newPassword);
  await app.withConnection(actor, async (client) => {
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
    if (!actor.isInternalManager && cur.organization_id !== actor.organizationId) {
      throw new ForbiddenError('cannot deactivate users outside your organization', 'org_scope');
    }
    if (cur.id === actor.actorId) {
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
    if (!actor.isInternalManager && cur.organization_id !== actor.organizationId) {
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
