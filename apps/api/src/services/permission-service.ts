import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { ForbiddenError } from '@xb/auth';
import type { ActorContext, UserId } from '@xb/types';
import { hasOrgScope } from '../lib/permissions.js';
import { NotFoundError, SemanticError } from '../lib/errors.js';

/**
 * Permissions program — workspace-level grants only (refined model).
 *
 * Vocabulary: none / view / edit. 'edit' is the effective operational
 * admin inside a workspace; there is no separate workspace-admin tier.
 * Platform administration (super_admin / internal_manager) stays a
 * system role, not a workspace permission level.
 *
 * Storage rule: a missing row IS 'none'. Setting a workspace to 'none'
 * soft-deletes any existing row (audit-preserving) rather than
 * materializing a 'none' row — keeps the table small and reads
 * unambiguous (visibility filters check EXISTS only).
 *
 * Authorization to manage: super_admin / internal_manager (any org),
 * or organization_admin (within own org). Cross-org grants rejected.
 */

export const WORKSPACE_ACCESS_LEVELS = ['none', 'view', 'edit'] as const;
export type WorkspaceAccessLevel = (typeof WORKSPACE_ACCESS_LEVELS)[number];

export interface UserWorkspaceAssignment {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly accessLevel: WorkspaceAccessLevel;
}

export interface UserPermissionsResponse {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly workspaces: ReadonlyArray<UserWorkspaceAssignment>;
}

async function requirePermissionsAdmin(actor: ActorContext, targetOrgId: string): Promise<void> {
  // hasOrgScope covers the full rule: super_admin + internal_manager
  // (any org) and organization_admin (own org). internal_staff is
  // read-only and correctly excluded.
  if (!hasOrgScope(actor, targetOrgId)) {
    throw new ForbiddenError(
      'Cannot manage permissions for this organization.',
      'not_permissions_admin',
    );
  }
}

/**
 * Return the full workspace×permission matrix for one user: every
 * active workspace in their organization, joined with their current
 * grant (or 'none' when no row exists).
 */
export async function getUserPermissions(
  app: FastifyInstance,
  actor: ActorContext,
  userId: UserId,
): Promise<UserPermissionsResponse> {
  return app.withConnection(actor, async (client) => {
    const { rows: userRows } = await client.query<{
      id: string;
      username: string;
      display_name: string;
      organization_id: string | null;
      organization_name: string | null;
    }>(
      `SELECT u.id, u.username, u.display_name, u.organization_id,
              o.display_name AS organization_name
         FROM xb_core.users u
         LEFT JOIN xb_core.organizations o ON o.id = u.organization_id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId],
    );
    if (!userRows[0]) throw new NotFoundError('user', userId);
    const u = userRows[0];
    if (!u.organization_id) {
      throw new SemanticError(
        'This user has no organization; workspace permissions do not apply.',
        'no_org_user',
      );
    }
    await requirePermissionsAdmin(actor, u.organization_id);

    const { rows: wsRows } = await client.query<{
      id: string;
      workspace_name: string;
      access_level: WorkspaceAccessLevel | null;
    }>(
      `SELECT w.id, w.workspace_name, wp.access_level
         FROM xb_core.workspaces w
         LEFT JOIN xb_core.workspace_permissions wp
           ON wp.workspace_id = w.id
          AND wp.user_id = $1
          AND wp.deleted_at IS NULL
        WHERE w.organization_id = $2
          AND w.deleted_at IS NULL
          AND w.workspace_status = 'active'
        ORDER BY w.workspace_name ASC`,
      [userId, u.organization_id],
    );

    return {
      userId: u.id,
      username: u.username,
      displayName: u.display_name,
      organizationId: u.organization_id,
      organizationName: u.organization_name ?? '',
      workspaces: wsRows.map((r) => ({
        workspaceId: r.id,
        workspaceName: r.workspace_name,
        accessLevel: r.access_level ?? 'none',
      })),
    };
  });
}

/**
 * Bulk-set one user's workspace permissions. `assignments` is the new
 * truth: 'none' soft-deletes the existing row (no materialized 'none'
 * rows), any other level upserts. Workspaces omitted from the map are
 * left untouched.
 */
export async function setUserWorkspacePermissions(
  app: FastifyInstance,
  actor: ActorContext,
  args: {
    userId: UserId;
    assignments: Record<string, WorkspaceAccessLevel>;
  },
): Promise<void> {
  for (const [, level] of Object.entries(args.assignments)) {
    if (!WORKSPACE_ACCESS_LEVELS.includes(level)) {
      throw new SemanticError(`Invalid access level "${level}".`, 'invalid_access_level');
    }
  }

  return app.withConnection(actor, async (client) => {
    const { rows: userRows } = await client.query<{ organization_id: string | null }>(
      `SELECT organization_id FROM xb_core.users
        WHERE id = $1 AND deleted_at IS NULL`,
      [args.userId],
    );
    if (!userRows[0]) throw new NotFoundError('user', args.userId);
    const orgId = userRows[0].organization_id;
    if (!orgId) {
      throw new SemanticError(
        'This user has no organization; workspace permissions cannot be set.',
        'no_org_user',
      );
    }
    await requirePermissionsAdmin(actor, orgId);

    const workspaceIds = Object.keys(args.assignments);
    if (workspaceIds.length === 0) return;

    // Reject any workspace id that isn't in the target user's org.
    const { rows: validRows } = await client.query<{ id: string }>(
      `SELECT id FROM xb_core.workspaces
        WHERE organization_id = $1 AND deleted_at IS NULL
          AND id = ANY($2::char(26)[])`,
      [orgId, workspaceIds],
    );
    const validIds = new Set(validRows.map((r) => r.id));
    for (const id of workspaceIds) {
      if (!validIds.has(id)) {
        throw new ForbiddenError(
          `Workspace ${id} is not in this user's organization.`,
          'workspace_scope',
        );
      }
    }

    for (const [workspaceId, level] of Object.entries(args.assignments)) {
      if (level === 'none') {
        await client.query(
          `UPDATE xb_core.workspace_permissions
              SET deleted_at = now(), deleted_by_actor_id = $3
            WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
          [args.userId, workspaceId, actor.actorId],
        );
      } else {
        await client.query(
          `INSERT INTO xb_core.workspace_permissions
             (id, organization_id, workspace_id, user_id, access_level,
              created_by_actor_id, updated_by_actor_id)
           VALUES ($1, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (user_id, workspace_id) WHERE deleted_at IS NULL
           DO UPDATE SET access_level = EXCLUDED.access_level,
                         updated_by_actor_id = EXCLUDED.updated_by_actor_id,
                         updated_at = now()`,
          [ulid(), orgId, workspaceId, args.userId, level, actor.actorId],
        );
      }
    }
  });
}
