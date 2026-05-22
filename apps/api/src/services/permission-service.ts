import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { ForbiddenError } from '@xb/auth';
import type { ActorContext, OrganizationId, UserId, WorkspaceId } from '@xb/types';
import { NotFoundError, SemanticError } from '../lib/errors.js';

/**
 * Workspace-assignment + module-grant service (permissions program P2).
 *
 * Backs the radio-matrix permissions UI (P4): one bulk PUT writes a
 * user's workspace_permissions + page_permissions atomically inside
 * the actor's transaction (audit trigger fires per row).
 *
 * Authorization: only super_admin / internal_manager / organization_admin
 * (within own org) may edit permissions. organization_user is rejected
 * — they cannot grant or revoke anyone, including themselves.
 *
 * The resolver (P3) will read these tables; this service is the
 * write/read shape the UI binds to. See docs/permissions.md.
 */

export const ACCESS_LEVELS = ['none', 'view', 'edit', 'admin'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Canonical module keys mirrored from the sidebar. */
export const MODULES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'dashboard',      label: 'Dashboard' },
  { key: 'sales',          label: 'Sales' },
  { key: 'advertising',    label: 'Advertising' },
  { key: 'inventory',      label: 'Inventory' },
  { key: 'shipments',      label: 'Shipments' },
  { key: 'uploads',        label: 'Uploads' },
  { key: 'reports',        label: 'Reports' },
  { key: 'unit_economics', label: 'Unit Economics' },
  { key: 'sku_aliases',    label: 'SKU Aliases' },
  { key: 'forecasting',    label: 'Forecasting' },
  { key: 'settings',       label: 'Settings' },
];

const MODULE_KEYS = new Set(MODULES.map((m) => m.key));

export interface WorkspacePermissionAssignment {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly workspaceLevel: AccessLevel;
  /** Per-module overrides; only keys with a row are present. */
  readonly modules: Record<string, AccessLevel>;
}

export interface ListWorkspacePermissionsResult {
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly modules: ReadonlyArray<{ key: string; label: string }>;
  readonly assignments: ReadonlyArray<WorkspacePermissionAssignment>;
}

// ----- Authorization helper ------------------------------------------

/**
 * Confirm the actor is allowed to manage permissions for the target
 * workspace. Returns the workspace's organization_id for downstream
 * use. Throws ForbiddenError otherwise.
 */
async function requirePermissionsAdmin(
  app: FastifyInstance,
  actor: ActorContext,
  workspaceId: WorkspaceId,
): Promise<{ organizationId: OrganizationId }> {
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{ organization_id: string }>(
      `SELECT organization_id FROM xb_core.workspaces
        WHERE id = $1 AND deleted_at IS NULL`,
      [workspaceId],
    );
    if (!rows[0]) throw new NotFoundError('workspace', workspaceId);
    const orgId = rows[0].organization_id;
    const allowed =
      actor.isInternalManager ||
      (actor.effectiveRole === 'organization_admin' &&
        actor.organizationId !== null &&
        (actor.organizationId as string) === orgId);
    if (!allowed) {
      throw new ForbiddenError(
        'Cannot manage permissions for this workspace.',
        'not_permissions_admin',
      );
    }
    return { organizationId: orgId as OrganizationId };
  });
}

// ----- Reads ----------------------------------------------------------

/**
 * List existing per-user assignments for a workspace. Returns one entry
 * per user that has a workspace_permissions row; users with no row are
 * absent (the UI separately fetches the full org-users list and merges
 * absent users as "unassigned").
 */
export async function listWorkspacePermissions(
  app: FastifyInstance,
  actor: ActorContext,
  workspaceId: WorkspaceId,
): Promise<ListWorkspacePermissionsResult> {
  const { organizationId } = await requirePermissionsAdmin(app, actor, workspaceId);

  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      user_id: string;
      username: string;
      display_name: string;
      workspace_level: AccessLevel;
      page_overrides: Array<{ page_key: string; access_level: AccessLevel }> | null;
    }>(
      `SELECT wp.user_id,
              u.username,
              u.display_name,
              wp.access_level AS workspace_level,
              COALESCE(
                (SELECT jsonb_agg(jsonb_build_object('page_key', pp.page_key,
                                                     'access_level', pp.access_level)
                                  ORDER BY pp.page_key)
                   FROM xb_core.page_permissions pp
                  WHERE pp.user_id = wp.user_id
                    AND pp.workspace_id = wp.workspace_id
                    AND pp.deleted_at IS NULL),
                '[]'::jsonb
              ) AS page_overrides
         FROM xb_core.workspace_permissions wp
         JOIN xb_core.users u ON u.id = wp.user_id
        WHERE wp.workspace_id = $1
          AND wp.deleted_at IS NULL
          AND u.deleted_at IS NULL
        ORDER BY u.display_name ASC`,
      [workspaceId],
    );

    const assignments: WorkspacePermissionAssignment[] = rows.map((r) => {
      const modules: Record<string, AccessLevel> = {};
      for (const o of r.page_overrides ?? []) modules[o.page_key] = o.access_level;
      return {
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        workspaceLevel: r.workspace_level,
        modules,
      };
    });

    return { workspaceId, organizationId, modules: MODULES, assignments };
  });
}

// ----- Writes ---------------------------------------------------------

export interface SetUserWorkspacePermissionsInput {
  readonly workspaceLevel: AccessLevel;
  readonly modules: Record<string, AccessLevel>;
}

/**
 * Bulk upsert one user's workspace + module permissions for a workspace.
 * Replaces every existing page_permission row for the (user × workspace)
 * pair so the input is the new full truth — matrix-UI PUT semantics.
 *
 * Same-org guard: target user must belong to the workspace's org. No
 * cross-org grants.
 */
export async function setUserWorkspacePermissions(
  app: FastifyInstance,
  actor: ActorContext,
  args: {
    workspaceId: WorkspaceId;
    userId: UserId;
    input: SetUserWorkspacePermissionsInput;
  },
): Promise<void> {
  // Validate vocabulary.
  if (!ACCESS_LEVELS.includes(args.input.workspaceLevel)) {
    throw new SemanticError(
      `Unknown access level "${args.input.workspaceLevel}".`,
      'invalid_access_level',
    );
  }
  for (const [key, level] of Object.entries(args.input.modules)) {
    if (!MODULE_KEYS.has(key)) {
      throw new SemanticError(`Unknown module "${key}".`, 'unknown_module');
    }
    if (!ACCESS_LEVELS.includes(level)) {
      throw new SemanticError(
        `Unknown access level "${level}" for module "${key}".`,
        'invalid_access_level',
      );
    }
  }

  const { organizationId } = await requirePermissionsAdmin(app, actor, args.workspaceId);

  await app.withConnection(actor, async (client) => {
    // Verify target user is in the workspace's org.
    const { rows: userRows } = await client.query<{ organization_id: string | null }>(
      `SELECT organization_id FROM xb_core.users
        WHERE id = $1 AND deleted_at IS NULL`,
      [args.userId],
    );
    if (!userRows[0]) throw new NotFoundError('user', args.userId);
    if (userRows[0].organization_id !== organizationId) {
      throw new ForbiddenError(
        'Cannot assign a user from a different organization to this workspace.',
        'org_mismatch',
      );
    }

    // Upsert workspace_permissions. The unique index is partial
    // (WHERE deleted_at IS NULL) — ON CONFLICT must match that predicate.
    await client.query(
      `INSERT INTO xb_core.workspace_permissions
         (id, organization_id, workspace_id, user_id, access_level,
          created_by_actor_id, updated_by_actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (user_id, workspace_id) WHERE deleted_at IS NULL
       DO UPDATE SET access_level = EXCLUDED.access_level,
                     updated_by_actor_id = EXCLUDED.updated_by_actor_id,
                     updated_at = now()`,
      [ulid(), organizationId, args.workspaceId, args.userId, args.input.workspaceLevel, actor.actorId],
    );

    // Replace page_permissions for this (user × workspace). Soft-delete
    // existing rows so audit trail survives, then insert the new set.
    await client.query(
      `UPDATE xb_core.page_permissions
          SET deleted_at = now(), deleted_by_actor_id = $3
        WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      [args.userId, args.workspaceId, actor.actorId],
    );

    const moduleEntries = Object.entries(args.input.modules);
    if (moduleEntries.length > 0) {
      const values: string[] = [];
      const params: unknown[] = [];
      let p = 0;
      for (const [pageKey, level] of moduleEntries) {
        values.push(
          `($${++p}, $${++p}, $${++p}, $${++p}, $${++p}, $${++p}, $${++p}, $${++p})`,
        );
        params.push(
          ulid(),
          organizationId,
          args.workspaceId,
          args.userId,
          pageKey,
          level,
          actor.actorId,
          actor.actorId,
        );
      }
      await client.query(
        `INSERT INTO xb_core.page_permissions
           (id, organization_id, workspace_id, user_id, page_key, access_level,
            created_by_actor_id, updated_by_actor_id)
         VALUES ${values.join(', ')}`,
        params,
      );
    }
  });
}

/**
 * Remove a user from a workspace — soft-delete the workspace_permissions
 * row and every page_permissions row for the (user × workspace) pair.
 * Idempotent.
 */
export async function removeUserFromWorkspace(
  app: FastifyInstance,
  actor: ActorContext,
  args: { workspaceId: WorkspaceId; userId: UserId },
): Promise<void> {
  await requirePermissionsAdmin(app, actor, args.workspaceId);
  await app.withConnection(actor, async (client) => {
    await client.query(
      `UPDATE xb_core.workspace_permissions
          SET deleted_at = now(), deleted_by_actor_id = $3
        WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      [args.userId, args.workspaceId, actor.actorId],
    );
    await client.query(
      `UPDATE xb_core.page_permissions
          SET deleted_at = now(), deleted_by_actor_id = $3
        WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      [args.userId, args.workspaceId, actor.actorId],
    );
  });
}
