import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId, WorkspaceId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';
import { ConcurrencyError, ConflictError, NotFoundError, SemanticError } from '../lib/errors.js';

export interface Workspace {
  readonly id: WorkspaceId;
  readonly organizationId: OrganizationId;
  readonly workspaceName: string;
  readonly workspaceType: string | null;
  readonly workspaceStatus: 'active' | 'archived';
  readonly defaultCurrencyCode: string;
  readonly timezone: string;
  readonly dosTargetDays: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

interface WsRow {
  id: string;
  organization_id: string;
  workspace_name: string;
  workspace_type: Workspace['workspaceType'];
  workspace_status: Workspace['workspaceStatus'];
  default_currency_code: string;
  timezone: string;
  dos_target_days: string;
  created_at: Date;
  updated_at: Date;
  row_version: number;
}

const SELECT_WS = `
  SELECT id, organization_id, workspace_name, workspace_type, workspace_status,
         default_currency_code, timezone, dos_target_days::text AS dos_target_days,
         created_at, updated_at, row_version
    FROM xb_core.workspaces
   WHERE deleted_at IS NULL
`;

function rowToWorkspace(r: WsRow): Workspace {
  return {
    id: r.id as WorkspaceId,
    organizationId: r.organization_id as OrganizationId,
    workspaceName: r.workspace_name,
    workspaceType: r.workspace_type,
    workspaceStatus: r.workspace_status,
    defaultCurrencyCode: r.default_currency_code,
    timezone: r.timezone,
    dosTargetDays: r.dos_target_days,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    rowVersion: r.row_version,
  };
}

export interface ListWorkspacesOptions {
  readonly organizationId?: OrganizationId;
  readonly limit?: number;
}

/**
 * List workspaces. Internal managers can pass an ?organizationId; everyone
 * else is scoped to their own organization. RLS enforces org isolation as
 * defense in depth.
 */
export async function listWorkspaces(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListWorkspacesOptions = {},
): Promise<ReadonlyArray<Workspace>> {
  const targetOrg = opts.organizationId ?? actor.organizationId;
  if (!targetOrg) {
    if (actor.isInternalManager) return [];
    throw new ForbiddenError('no organization context', 'no_org');
  }
  await app.assertPermission(actor, {
    organizationId: targetOrg as OrganizationId,
    workspaceId: null,
    module: 'settings',
    action: 'view',
  });

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<WsRow>(
      `${SELECT_WS} AND organization_id = $1 ORDER BY workspace_name ASC LIMIT $2`,
      [targetOrg, limit],
    );
    return rows.map(rowToWorkspace);
  });
}

export interface AccessibleWorkspace {
  readonly id: WorkspaceId;
  readonly workspaceName: string;
  readonly workspaceType: Workspace['workspaceType'];
  readonly workspaceStatus: Workspace['workspaceStatus'];
  readonly organizationId: OrganizationId;
  readonly organizationName: string;
  /**
   * Resolved access level for the requesting actor — present only on
   * the active-workspace summary (so the frontend can disable write
   * actions for view-only users). Optional on switcher-list rows
   * because internal managers can switch into workspaces beyond their
   * permission grants.
   */
  readonly accessLevel?: WorkspaceAccessLevel;
}

/**
 * Workspaces the current actor can switch into. Used by the topbar switcher.
 *
 *   - internal_manager → every active workspace across every active org
 *   - organization_admin / organization_user → every active workspace in
 *     their own org (page-level permission grants will narrow this further
 *     in a future phase; for now org membership is sufficient)
 *
 * Only active workspaces under active organizations are returned — there is
 * no reason to surface suspended/archived contexts in the switcher.
 */
export async function listAccessibleWorkspaces(
  app: FastifyInstance,
  actor: ActorContext,
): Promise<ReadonlyArray<AccessibleWorkspace>> {
  const isManager = actor.isInternalManager;
  if (!isManager && !actor.organizationId) return [];

  // organization_user is gated on workspace_permissions presence —
  // permission rows are the source of truth, not org membership. Org
  // admins still see every workspace in their own org (they manage
  // permissions; otherwise they'd have to grant themselves access to
  // every workspace). Internal managers bypass via RLS.
  const isOrgUser = actor.effectiveRole === 'organization_user';

  const params: unknown[] = [];
  let orgFilter = '';
  let permsFilter = '';
  if (!isManager) {
    params.push(actor.organizationId);
    orgFilter = `AND w.organization_id = $${params.length}`;
  }
  if (isOrgUser) {
    params.push(actor.actorId);
    permsFilter = `
       AND EXISTS (
         SELECT 1 FROM xb_core.workspace_permissions wp
           JOIN xb_core.users u ON u.id = wp.user_id
          WHERE u.actor_id = $${params.length}
            AND wp.workspace_id = w.id
            AND wp.access_level <> 'none'
            AND wp.deleted_at IS NULL
       )`;
  }

  const sql = `
    SELECT w.id, w.workspace_name, w.workspace_type, w.workspace_status,
           w.organization_id, o.display_name AS organization_name
      FROM xb_core.workspaces w
      JOIN xb_core.organizations o ON o.id = w.organization_id
     WHERE w.deleted_at IS NULL
       AND o.deleted_at IS NULL
       AND w.workspace_status = 'active'
       AND o.organization_status = 'active'
       ${orgFilter}
       ${permsFilter}
     ORDER BY o.display_name ASC, w.workspace_name ASC
  `;

  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      id: string;
      workspace_name: string;
      workspace_type: Workspace['workspaceType'];
      workspace_status: Workspace['workspaceStatus'];
      organization_id: string;
      organization_name: string;
    }>(sql, params);
    return rows.map((r) => ({
      id: r.id as WorkspaceId,
      workspaceName: r.workspace_name,
      workspaceType: r.workspace_type,
      workspaceStatus: r.workspace_status,
      organizationId: r.organization_id as OrganizationId,
      organizationName: r.organization_name,
    }));
  });
}

/**
 * Set the active workspace on the current session, after verifying the
 * actor actually has access. Passing null clears it (returning to the
 * org-level / cross-workspace view).
 */
export async function selectActiveWorkspace(
  app: FastifyInstance,
  actor: ActorContext,
  sessionId: string,
  workspaceId: WorkspaceId | null,
): Promise<AccessibleWorkspace | null> {
  if (workspaceId === null) {
    await app.withConnection(actor, async (client) => {
      const result = await client.query(
        `UPDATE xb_core.sessions SET active_workspace_id = NULL, last_seen_at = now()
          WHERE id = $1 AND revoked_at IS NULL`,
        [sessionId],
      );
      // If the session row vanished or got revoked between the JWT
      // check and now, throw — silently returning success would leave
      // the client thinking the switch worked when it didn't.
      if ((result.rowCount ?? 0) === 0) {
        throw new NotFoundError('session', sessionId);
      }
    });
    return null;
  }

  const accessible = await listAccessibleWorkspaces(app, actor);
  const match = accessible.find((w) => w.id === workspaceId);
  if (!match) {
    throw new ForbiddenError('workspace not accessible to this actor', 'workspace_scope');
  }

  // UPDATE + reload in the SAME transaction so read-after-write
  // visibility is guaranteed regardless of connection pooling /
  // proxy modes between the two queries (previously the reload ran
  // on a separate pool connection and could miss the just-committed
  // row, throwing a spurious 422 switch_did_not_persist).
  return app.withConnection(actor, async (client) => {
    const result = await client.query(
      `UPDATE xb_core.sessions
          SET active_workspace_id = $2, last_seen_at = now()
        WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId, workspaceId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundError('session', sessionId);
    }

    const { rows } = await client.query<{
      id: string;
      workspace_name: string;
      workspace_type: Workspace['workspaceType'];
      workspace_status: Workspace['workspaceStatus'];
      organization_id: string;
      organization_name: string;
    }>(
      `SELECT w.id, w.workspace_name, w.workspace_type, w.workspace_status,
              w.organization_id, o.display_name AS organization_name
         FROM xb_core.sessions s
         JOIN xb_core.workspaces w     ON w.id = s.active_workspace_id
         JOIN xb_core.organizations o  ON o.id = w.organization_id
        WHERE s.id = $1
          AND s.revoked_at IS NULL
          AND w.deleted_at IS NULL
          AND o.deleted_at IS NULL
        LIMIT 1`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) {
      // Should be impossible after a successful UPDATE — log loudly
      // but still return the lookup-validated workspace so the user
      // isn't blocked on a transient read inconsistency.
      app.log.error(
        { sessionId, workspaceId },
        'session UPDATE succeeded but in-tx reload returned null — returning lookup match',
      );
      return match;
    }
    return {
      id: row.id as WorkspaceId,
      workspaceName: row.workspace_name,
      workspaceType: row.workspace_type,
      workspaceStatus: row.workspace_status,
      organizationId: row.organization_id as OrganizationId,
      organizationName: row.organization_name,
    };
  });
}

/**
 * Look up the active workspace summary for a session, if any. Used by /me
 * so the frontend can hydrate the switcher's selected state on every page
 * load without an extra round trip.
 */
export async function loadActiveWorkspaceForSession(
  app: FastifyInstance,
  actor: ActorContext,
  sessionId: string,
): Promise<AccessibleWorkspace | null> {
  // xb_core.workspaces is RLS-scoped. This join MUST run inside
  // withConnection so the actor's org context is set — a raw pool query
  // has no context and sees zero rows, making the active workspace
  // silently vanish on every page load / refresh.
  //
  // organization_user is also gated on workspace_permissions: if perms
  // are revoked the session's pinned workspace surfaces as null on the
  // next /me, so the user is bounced to the picker (which then shows
  // nothing). Internal/managers bypass; org_admin keeps implicit access.
  const isOrgUser = actor.effectiveRole === 'organization_user';
  const params: unknown[] = [sessionId];
  let permsFilter = '';
  if (isOrgUser) {
    params.push(actor.actorId);
    permsFilter = `
          AND EXISTS (
            SELECT 1 FROM xb_core.workspace_permissions wp
              JOIN xb_core.users u ON u.id = wp.user_id
             WHERE u.actor_id = $${params.length}
               AND wp.workspace_id = w.id
               AND wp.access_level <> 'none'
               AND wp.deleted_at IS NULL
          )`;
  }
  const result = await app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      id: string;
      workspace_name: string;
      workspace_type: Workspace['workspaceType'];
      workspace_status: Workspace['workspaceStatus'];
      organization_id: string;
      organization_name: string;
    }>(
      `SELECT w.id, w.workspace_name, w.workspace_type, w.workspace_status,
              w.organization_id, o.display_name AS organization_name
         FROM xb_core.sessions s
         JOIN xb_core.workspaces w     ON w.id = s.active_workspace_id
         JOIN xb_core.organizations o  ON o.id = w.organization_id
        WHERE s.id = $1
          AND s.revoked_at IS NULL
          AND w.deleted_at IS NULL
          AND o.deleted_at IS NULL
          ${permsFilter}
        LIMIT 1`,
      params,
    );
    const r = rows[0];
    if (!r) return null;
    const accessLevel = await resolveWorkspaceAccessLevel(client, actor, {
      id: r.id,
      organization_id: r.organization_id,
    });
    return { row: r, accessLevel };
  });
  if (!result) return null;
  const r = result.row;
  return {
    id: r.id as WorkspaceId,
    workspaceName: r.workspace_name,
    workspaceType: r.workspace_type,
    workspaceStatus: r.workspace_status,
    organizationId: r.organization_id as OrganizationId,
    organizationName: r.organization_name,
    accessLevel: result.accessLevel,
  };
}

/**
 * Resolve the operational write context for the current request.
 *
 * The active workspace is a SECURED SESSION CONTEXT — it lives on the
 * session row, not on the request body. Every workspace-scoped WRITE
 * (uploads, ingestion, future inventory/transfer/forecast mutations)
 * must derive its target workspace from here, never from a
 * client-supplied id. This makes "All workspaces" mode inherently
 * read-only and removes any path for a tampered/stale client to write
 * into the wrong workspace.
 *
 * Throws (409) when there is no active workspace, and validates that
 * the workspace is still real, active, and inside the actor's scope.
 */
export type WorkspaceAccessLevel = 'view' | 'edit';

/**
 * Compute the effective access level of the actor on the given
 * workspace. internal_manager / super_admin and an organization_admin
 * on their own org always carry 'edit'. For organization_user the
 * level comes from workspace_permissions; a missing row falls back to
 * 'view' (visibility filters elsewhere ensure no-access actors never
 * reach this code path).
 */
async function resolveWorkspaceAccessLevel(
  client: import('pg').PoolClient,
  actor: ActorContext,
  workspace: { id: string; organization_id: string },
): Promise<WorkspaceAccessLevel> {
  if (actor.isInternalManager) return 'edit';
  if (
    actor.effectiveRole === 'organization_admin' &&
    actor.organizationId !== null &&
    (actor.organizationId as string) === workspace.organization_id
  ) {
    return 'edit';
  }
  const { rows } = await client.query<{ access_level: string }>(
    `SELECT wp.access_level
       FROM xb_core.workspace_permissions wp
       JOIN xb_core.users u ON u.id = wp.user_id
      WHERE u.actor_id = $1
        AND wp.workspace_id = $2
        AND wp.deleted_at IS NULL`,
    [actor.actorId, workspace.id],
  );
  return (rows[0]?.access_level as WorkspaceAccessLevel) ?? 'view';
}

export async function requireActiveWorkspace(
  app: FastifyInstance,
  actor: ActorContext,
  sessionId: string | null,
  requiredLevel: WorkspaceAccessLevel = 'view',
): Promise<{
  workspaceId: WorkspaceId;
  organizationId: OrganizationId;
  accessLevel: WorkspaceAccessLevel;
}> {
  if (!sessionId) {
    throw new ConflictError(
      'This action requires an interactive session.',
      'session_required',
    );
  }

  const { rows: sessionRows } = await app.pg.query<{ active_workspace_id: string | null }>(
    `SELECT active_workspace_id
       FROM xb_core.sessions
      WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [sessionId],
  );
  const session = sessionRows[0];
  if (!session) {
    throw new ConflictError('Your session is no longer valid. Sign in again.', 'session_invalid');
  }
  if (!session.active_workspace_id) {
    throw new ConflictError(
      'Pick a workspace before performing this action. "All workspaces" mode is read-only.',
      'no_active_workspace',
    );
  }

  // RLS-scoped — must run with the actor's connection context.
  // Workspace validation + access-level resolution happen in one
  // connection so the permission row check piggybacks the same RLS
  // context.
  const result = await app.withConnection(actor, async (client) => {
    const { rows: wsRows } = await client.query<{ id: string; organization_id: string }>(
      `SELECT w.id, w.organization_id
         FROM xb_core.workspaces w
         JOIN xb_core.organizations o ON o.id = w.organization_id
        WHERE w.id = $1
          AND w.deleted_at IS NULL
          AND w.workspace_status = 'active'
          AND o.deleted_at IS NULL
          AND o.organization_status = 'active'`,
      [session.active_workspace_id],
    );
    const ws = wsRows[0];
    if (!ws) return null;
    const accessLevel = await resolveWorkspaceAccessLevel(client, actor, ws);
    return { ws, accessLevel };
  });

  if (!result) {
    throw new ConflictError(
      'Your active workspace is no longer available. Pick another workspace.',
      'active_workspace_unavailable',
    );
  }
  if (!actor.isInternalManager && result.ws.organization_id !== (actor.organizationId as string | null)) {
    throw new ForbiddenError('workspace is not in your organization', 'workspace_scope');
  }
  if (requiredLevel === 'edit' && result.accessLevel !== 'edit') {
    throw new ForbiddenError(
      'This workspace is view-only for you. Ask an admin for edit access.',
      'workspace_view_only',
    );
  }

  return {
    workspaceId: result.ws.id as WorkspaceId,
    organizationId: result.ws.organization_id as OrganizationId,
    accessLevel: result.accessLevel,
  };
}

export async function getWorkspace(
  app: FastifyInstance,
  actor: ActorContext,
  id: WorkspaceId,
): Promise<Workspace | null> {
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<WsRow>(`${SELECT_WS} AND id = $1`, [id]);
    const row = rows[0];
    if (!row) return null;
    await app.assertPermission(actor, {
      organizationId: row.organization_id as OrganizationId,
      workspaceId: id,
      module: 'settings',
      action: 'view',
    });
    return rowToWorkspace(row);
  });
}

export interface CreateWorkspaceInput {
  readonly organizationId: OrganizationId;
  readonly workspaceName: string;
  /** Free-text, optional label (e.g. "Amazon", "DTC"). No fixed vocabulary. */
  readonly workspaceType?: string | null;
  readonly defaultCurrencyCode: string;
  readonly timezone?: string;
  readonly dosTargetDays?: number;
}

export async function createWorkspace(
  app: FastifyInstance,
  actor: ActorContext,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  await app.assertPermission(actor, {
    organizationId: input.organizationId,
    workspaceId: null,
    module: 'settings',
    action: 'create',
  });
  if (!actor.isInternalManager && actor.organizationId !== input.organizationId) {
    throw new ForbiddenError('cannot create workspace in another organization', 'org_scope');
  }

  const id = ulid();
  const name = input.workspaceName.trim();
  try {
    return await app.withConnection(actor, async (client) => {
      // Parent organization must be active. Suspended orgs reject all
      // new sign-ins and shouldn't grow new tenant resources; archived
      // and soft-deleted orgs are even more terminal.
      const { rows: orgRows } = await client.query<{
        organization_status: 'active' | 'suspended' | 'archived';
        display_name: string;
      }>(
        `SELECT organization_status, display_name
           FROM xb_core.organizations
          WHERE id = $1 AND deleted_at IS NULL`,
        [input.organizationId],
      );
      const parent = orgRows[0];
      if (!parent) throw new NotFoundError('organization', input.organizationId);
      if (parent.organization_status !== 'active') {
        throw new SemanticError(
          `Cannot create a workspace in a ${parent.organization_status} organization. ` +
            `Reactivate "${parent.display_name}" first.`,
          'parent_org_not_active',
          { parentStatus: parent.organization_status },
        );
      }

      await client.query(
        `INSERT INTO xb_core.workspaces
           (id, organization_id, workspace_name, workspace_type, default_currency_code,
            timezone, dos_target_days, created_by_actor_id, updated_by_actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [
          id,
          input.organizationId,
          name,
          input.workspaceType?.trim() || null,
          input.defaultCurrencyCode,
          input.timezone ?? 'UTC',
          input.dosTargetDays ?? 30,
          actor.actorId,
        ],
      );
      const { rows } = await client.query<WsRow>(`${SELECT_WS} AND id = $1`, [id]);
      if (!rows[0]) throw new Error('inserted workspace vanished');
      return rowToWorkspace(rows[0]);
    });
  } catch (err) {
    if (isUniqueViolation(err, 'uq_workspaces_org_name')) {
      throw new ConflictError(
        `A workspace named "${name}" already exists in this organization.`,
        'workspace_exists',
      );
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  if (e?.code !== '23505') return false;
  return !constraint || e.constraint === constraint;
}

export interface PatchWorkspaceInput {
  readonly workspaceName?: string;
  readonly workspaceType?: Workspace['workspaceType'];
  readonly defaultCurrencyCode?: string;
  readonly timezone?: string;
  readonly dosTargetDays?: number;
  readonly workspaceStatus?: Workspace['workspaceStatus'];
  readonly expectedRowVersion: number;
}

export async function patchWorkspace(
  app: FastifyInstance,
  actor: ActorContext,
  id: WorkspaceId,
  input: PatchWorkspaceInput,
): Promise<Workspace> {
  try {
    return await app.withConnection(actor, async (client) => {
      const { rows: existing } = await client.query<WsRow>(`${SELECT_WS} AND id = $1`, [id]);
      const cur = existing[0];
      if (!cur) throw new NotFoundError('workspace', id);
      await app.assertPermission(actor, {
        organizationId: cur.organization_id as OrganizationId,
        workspaceId: id,
        module: 'settings',
        action: 'edit',
      });

      const updates: string[] = [];
      const params: unknown[] = [];
      let p = 0;
      if (input.workspaceName !== undefined) {
        params.push(input.workspaceName.trim());
        updates.push(`workspace_name = $${++p}`);
      }
      if (input.workspaceType !== undefined) {
        params.push(input.workspaceType);
        updates.push(`workspace_type = $${++p}`);
      }
      if (input.defaultCurrencyCode !== undefined) {
        params.push(input.defaultCurrencyCode);
        updates.push(`default_currency_code = $${++p}`);
      }
      if (input.timezone !== undefined) {
        params.push(input.timezone);
        updates.push(`timezone = $${++p}`);
      }
      if (input.dosTargetDays !== undefined) {
        params.push(input.dosTargetDays);
        updates.push(`dos_target_days = $${++p}`);
      }
      if (updates.length === 0) return rowToWorkspace(cur);

      params.push(actor.actorId);
      updates.push(`updated_by_actor_id = $${++p}`);
      params.push(id);
      params.push(input.expectedRowVersion);
      const idIdx = ++p;
      const verIdx = ++p;

      const result = await client.query<WsRow>(
        `UPDATE xb_core.workspaces
            SET ${updates.join(', ')}
          WHERE id = $${idIdx}
            AND deleted_at IS NULL
            AND row_version = $${verIdx}
          RETURNING id, organization_id, workspace_name, workspace_type, workspace_status,
                    default_currency_code, timezone, dos_target_days::text AS dos_target_days,
                    created_at, updated_at, row_version`,
        params,
      );
      if (result.rows.length === 0) throw new ConcurrencyError();
      return rowToWorkspace(result.rows[0]!);
    });
  } catch (err) {
    if (isUniqueViolation(err, 'uq_workspaces_org_name')) {
      throw new ConflictError(
        `A workspace with that name already exists in this organization.`,
        'workspace_exists',
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Lifecycle: workspace_status active|archived, plus soft-delete.
// Spec 3 only allows active|archived on workspace_status; "suspended" lives
// on organizations. Workspaces inherit org-level suspension implicitly.
// ---------------------------------------------------------------------------

async function transitionWorkspaceStatus(
  app: FastifyInstance,
  actor: ActorContext,
  id: WorkspaceId,
  expectedRowVersion: number,
  next: Workspace['workspaceStatus'],
  requireFrom?: ReadonlyArray<Workspace['workspaceStatus']>,
): Promise<Workspace> {
  return app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<WsRow>(`${SELECT_WS} AND id = $1`, [id]);
    const cur = existing[0];
    if (!cur) throw new NotFoundError('workspace', id);
    await app.assertPermission(actor, {
      organizationId: cur.organization_id as OrganizationId,
      workspaceId: id,
      module: 'settings',
      action: 'edit',
    });
    if (requireFrom && !requireFrom.includes(cur.workspace_status)) {
      throw new SemanticError(
        `cannot transition workspace from ${cur.workspace_status} to ${next}`,
        'invalid_status_transition',
        { from: cur.workspace_status, to: next, allowedFrom: requireFrom },
      );
    }
    const result = await client.query<WsRow>(
      `UPDATE xb_core.workspaces
          SET workspace_status = $3::varchar,
              updated_by_actor_id = $4,
              archived_at = CASE WHEN $3::varchar = 'archived' THEN now() ELSE NULL END
        WHERE id = $1
          AND deleted_at IS NULL
          AND row_version = $2
        RETURNING id, organization_id, workspace_name, workspace_type, workspace_status,
                  default_currency_code, timezone, dos_target_days::text AS dos_target_days,
                  created_at, updated_at, row_version`,
      [id, expectedRowVersion, next, actor.actorId],
    );
    if (result.rows.length === 0) throw new ConcurrencyError();
    return rowToWorkspace(result.rows[0]!);
  });
}

export const archiveWorkspace = (
  app: FastifyInstance,
  actor: ActorContext,
  id: WorkspaceId,
  expectedRowVersion: number,
) => transitionWorkspaceStatus(app, actor, id, expectedRowVersion, 'archived', ['active']);

export const reactivateWorkspace = (
  app: FastifyInstance,
  actor: ActorContext,
  id: WorkspaceId,
  expectedRowVersion: number,
) => transitionWorkspaceStatus(app, actor, id, expectedRowVersion, 'active', ['archived']);

export async function softDeleteWorkspace(
  app: FastifyInstance,
  actor: ActorContext,
  id: WorkspaceId,
  expectedRowVersion: number,
): Promise<Workspace> {
  return app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<WsRow>(`${SELECT_WS} AND id = $1`, [id]);
    const cur = existing[0];
    if (!cur) throw new NotFoundError('workspace', id);
    await app.assertPermission(actor, {
      organizationId: cur.organization_id as OrganizationId,
      workspaceId: id,
      module: 'settings',
      action: 'delete',
    });
    const result = await client.query<WsRow>(
      `UPDATE xb_core.workspaces
          SET deleted_at = now(),
              deleted_by_actor_id = $3
        WHERE id = $1
          AND deleted_at IS NULL
          AND row_version = $2
        RETURNING id, organization_id, workspace_name, workspace_type, workspace_status,
                  default_currency_code, timezone, dos_target_days::text AS dos_target_days,
                  created_at, updated_at, row_version`,
      [id, expectedRowVersion, actor.actorId],
    );
    if (result.rows.length === 0) throw new ConcurrencyError();
    return rowToWorkspace(result.rows[0]!);
  });
}

export async function restoreWorkspace(
  app: FastifyInstance,
  actor: ActorContext,
  id: WorkspaceId,
): Promise<Workspace> {
  return app.withConnection(actor, async (client) => {
    const result = await client.query<WsRow>(
      `UPDATE xb_core.workspaces
          SET deleted_at = NULL,
              deleted_by_actor_id = NULL,
              workspace_status = 'active',
              archived_at = NULL,
              updated_by_actor_id = $2
        WHERE id = $1
          AND deleted_at IS NOT NULL
        RETURNING id, organization_id, workspace_name, workspace_type, workspace_status,
                  default_currency_code, timezone, dos_target_days::text AS dos_target_days,
                  created_at, updated_at, row_version`,
      [id, actor.actorId],
    );
    if (result.rows.length === 0) throw new NotFoundError('soft-deleted workspace', id);
    return rowToWorkspace(result.rows[0]!);
  });
}
