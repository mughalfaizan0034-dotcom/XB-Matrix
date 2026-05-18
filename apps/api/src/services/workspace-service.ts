import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId, WorkspaceId } from '@xb/types';
import { ForbiddenError } from '@xb/auth';

export interface Workspace {
  readonly id: WorkspaceId;
  readonly organizationId: OrganizationId;
  readonly workspaceName: string;
  readonly workspaceType: 'marketplace' | 'dtc' | 'warehouse' | 'omni_channel';
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
  readonly workspaceType: Workspace['workspaceType'];
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
  return app.withConnection(actor, async (client) => {
    await client.query(
      `INSERT INTO xb_core.workspaces
         (id, organization_id, workspace_name, workspace_type, default_currency_code,
          timezone, dos_target_days, created_by_actor_id, updated_by_actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [
        id,
        input.organizationId,
        input.workspaceName,
        input.workspaceType,
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
  return app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<WsRow>(`${SELECT_WS} AND id = $1`, [id]);
    const cur = existing[0];
    if (!cur) throw new ForbiddenError('workspace not found', 'not_found');
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
      params.push(input.workspaceName);
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
    if (input.workspaceStatus !== undefined) {
      params.push(input.workspaceStatus);
      updates.push(`workspace_status = $${++p}`);
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
    if (result.rows.length === 0) {
      throw new ForbiddenError('workspace not found or row_version mismatch', 'stale_version');
    }
    return rowToWorkspace(result.rows[0]!);
  });
}
