import type { FastifyInstance } from 'fastify';
import type { ActorContext, OrganizationId, UserId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';
import { ConcurrencyError, NotFoundError, SemanticError } from '../lib/errors.js';

export interface UserSummary {
  readonly id: string;
  readonly actorId: string;
  readonly email: string;
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
  email: string;
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
  SELECT id, actor_id, email, display_name, user_kind, organization_id,
         internal_user_role, organization_user_role, user_status,
         email_verified_at, last_login_at, created_at, row_version
    FROM xb_core.users
   WHERE deleted_at IS NULL
`;

function rowToSummary(r: UserRow): UserSummary {
  return {
    id: r.id,
    actorId: r.actor_id,
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
