import type { FastifyInstance } from 'fastify';
import type {
  ActorContext,
  OrganizationId,
  WorkspaceId,
} from '@xb/types';
import {
  ConflictError,
  NotFoundError,
  SemanticError,
} from '../lib/errors.js';
import type { AliasType } from './sku-alias-service.js';
import { resolveSku } from './sku-alias-service.js';

/**
 * Service for xb_master.unresolved_sku_rows — the mapping-layer
 * dead-letter queue (see migration 0015 + mappers/types.ts).
 *
 * Operators land here when an upload had rows the mapper couldn't
 * resolve to a sku_normalized. The queue exposes:
 *   - grouped view (unique alias_value × source_*) so fixing one
 *     mapping clears every row that matches
 *   - replay (call resolveSku again now that an alias exists)
 *   - dismiss (mark junk rows so they don't keep showing up)
 *
 * Replay is a pure function: the mapper output for a row is fully
 * determined by (alias_value, source_*, sku_normalized) plus the
 * row's source_payload. We don't re-run the mapper here — we resolve
 * the alias, stamp the row as 'mapped', and downstream the canonical
 * writer (when it ships) will scoop up mapped rows on its next pass.
 *
 * Workspace scope: all reads + writes are workspace-scoped. RLS
 * additionally enforces organization isolation.
 */

export type UnresolvedStatus = 'pending' | 'mapped' | 'dismissed';
export type UnresolvedReason = 'no_match' | 'ambiguous' | 'mapping_error';

export interface UnresolvedRow {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly uploadKind: string;
  readonly rowNumber: number;
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform: string | null;
  readonly sourceMarketplace: string | null;
  readonly sourceAccount: string | null;
  readonly reason: UnresolvedReason;
  readonly sourcePayload: Record<string, unknown>;
  readonly status: UnresolvedStatus;
  readonly resolvedAliasId: string | null;
  readonly resolvedSkuNormalized: string | null;
  readonly resolvedAt: string | null;
  readonly dismissedAt: string | null;
  readonly dismissalReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

interface DbRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  upload_id: string;
  upload_kind: string;
  row_number: number;
  alias_type: AliasType;
  alias_value: string;
  source_platform: string | null;
  source_marketplace: string | null;
  source_account: string | null;
  reason: UnresolvedReason;
  source_payload: Record<string, unknown>;
  status: UnresolvedStatus;
  resolved_alias_id: string | null;
  resolved_sku_normalized: string | null;
  resolved_at: Date | null;
  dismissed_at: Date | null;
  dismissal_reason: string | null;
  created_at: Date;
  updated_at: Date;
  row_version: number;
}

function toRow(r: DbRow): UnresolvedRow {
  return {
    id: r.id,
    organizationId: r.organization_id,
    workspaceId: r.workspace_id,
    uploadId: r.upload_id,
    uploadKind: r.upload_kind,
    rowNumber: r.row_number,
    aliasType: r.alias_type,
    aliasValue: r.alias_value,
    sourcePlatform: r.source_platform,
    sourceMarketplace: r.source_marketplace,
    sourceAccount: r.source_account,
    reason: r.reason,
    sourcePayload: r.source_payload,
    status: r.status,
    resolvedAliasId: r.resolved_alias_id,
    resolvedSkuNormalized: r.resolved_sku_normalized,
    resolvedAt: r.resolved_at ? r.resolved_at.toISOString() : null,
    dismissedAt: r.dismissed_at ? r.dismissed_at.toISOString() : null,
    dismissalReason: r.dismissal_reason,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    rowVersion: r.row_version,
  };
}

const SELECT_ROW = `
  SELECT id, organization_id, workspace_id, upload_id, upload_kind,
         row_number, alias_type, alias_value,
         source_platform, source_marketplace, source_account,
         reason, source_payload, status,
         resolved_alias_id, resolved_sku_normalized, resolved_at,
         dismissed_at, dismissal_reason,
         created_at, updated_at, row_version
    FROM xb_master.unresolved_sku_rows
`;

async function assertWorkspaceAccess(
  app: FastifyInstance,
  actor: ActorContext,
  workspaceId: WorkspaceId,
): Promise<string> {
  // xb_core.workspaces is RLS-scoped — the lookup must run inside
  // withConnection so the actor's org context is set. A raw pool query
  // has no context and sees zero rows.
  const ws = await app
    .withConnection(actor, (client) =>
      client.query<{ organization_id: string }>(
        `SELECT organization_id FROM xb_core.workspaces WHERE id = $1 AND deleted_at IS NULL`,
        [workspaceId],
      ),
    )
    .then((r) => r.rows[0]);
  if (!ws) throw new NotFoundError('workspace', workspaceId);
  if (
    ws.organization_id !== (actor.organizationId as string | null) &&
    !actor.isInternalManager
  ) {
    throw new NotFoundError('workspace', workspaceId);
  }
  await app.assertPermission(actor, {
    organizationId: ws.organization_id as OrganizationId,
    workspaceId,
    module: 'settings',
    action: 'view',
  });
  return ws.organization_id;
}

// ---- grouped view --------------------------------------------------

/**
 * The operator-facing surface. Identical (alias_type, alias_value,
 * source_*) tuples roll up so fixing the alias once resolves every
 * affected row. `affectedRows` is the count of pending rows behind
 * each tuple; `sampleUploadIds` shows which uploads contributed.
 */
export interface UnresolvedGroup {
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform: string | null;
  readonly sourceMarketplace: string | null;
  readonly sourceAccount: string | null;
  readonly reason: UnresolvedReason;
  readonly affectedRows: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly sampleUploadIds: ReadonlyArray<string>;
}

export interface ListGroupsOptions {
  readonly workspaceId: WorkspaceId;
  readonly q?: string;
  readonly aliasType?: AliasType;
  readonly sourcePlatform?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface UnresolvedGroupList {
  readonly items: ReadonlyArray<UnresolvedGroup>;
  readonly total: number;
  readonly hasMore: boolean;
  readonly aggregates: {
    readonly pendingRows: number;
    readonly distinctAliases: number;
    readonly distinctUploads: number;
  };
}

export async function listUnresolvedGroups(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListGroupsOptions,
): Promise<UnresolvedGroupList> {
  await assertWorkspaceAccess(app, actor, opts.workspaceId);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 500);
  const page = Math.max(opts.page ?? 0, 0);
  const offset = page * pageSize;

  const where: string[] = ["status = 'pending'", 'workspace_id = $1'];
  const params: unknown[] = [opts.workspaceId];
  let idx = 2;

  if (opts.aliasType) {
    where.push(`alias_type = $${idx++}`);
    params.push(opts.aliasType);
  }
  if (opts.sourcePlatform) {
    where.push(`source_platform = $${idx++}`);
    params.push(opts.sourcePlatform);
  }
  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    where.push(`lower(alias_value) LIKE $${idx++}`);
    params.push(like);
  }
  const whereSql = where.join(' AND ');

  return app.withConnection(actor, async (client) => {
    const aggParams = [...params];
    const { rows: aggRows } = await client.query<{
      pending_rows: string;
      distinct_aliases: string;
      distinct_uploads: string;
    }>(
      `SELECT count(*)::text                                                                AS pending_rows,
              count(DISTINCT (alias_type, alias_value, source_platform, source_marketplace, source_account))::text AS distinct_aliases,
              count(DISTINCT upload_id)::text                                               AS distinct_uploads
         FROM xb_master.unresolved_sku_rows
        WHERE ${whereSql}`,
      aggParams,
    );
    const pendingRows = Number(aggRows[0]?.pending_rows ?? 0);
    const distinctAliases = Number(aggRows[0]?.distinct_aliases ?? 0);
    const distinctUploads = Number(aggRows[0]?.distinct_uploads ?? 0);

    const dataParams = [...params, pageSize, offset];
    const { rows } = await client.query<{
      alias_type: AliasType;
      alias_value: string;
      source_platform: string | null;
      source_marketplace: string | null;
      source_account: string | null;
      reason: UnresolvedReason;
      affected: string;
      first_seen: Date;
      last_seen: Date;
      upload_ids: string[];
    }>(
      `SELECT alias_type, alias_value, source_platform, source_marketplace, source_account,
              min(reason) AS reason,
              count(*)::text AS affected,
              min(created_at) AS first_seen,
              max(created_at) AS last_seen,
              (array_agg(DISTINCT upload_id))[1:5] AS upload_ids
         FROM xb_master.unresolved_sku_rows
        WHERE ${whereSql}
        GROUP BY alias_type, alias_value, source_platform, source_marketplace, source_account
        ORDER BY count(*) DESC, max(created_at) DESC
        LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams,
    );

    const items: UnresolvedGroup[] = rows.map((r) => ({
      aliasType: r.alias_type,
      aliasValue: r.alias_value,
      sourcePlatform: r.source_platform,
      sourceMarketplace: r.source_marketplace,
      sourceAccount: r.source_account,
      reason: r.reason,
      affectedRows: Number(r.affected),
      firstSeenAt: r.first_seen.toISOString(),
      lastSeenAt: r.last_seen.toISOString(),
      sampleUploadIds: r.upload_ids ?? [],
    }));
    return {
      items,
      total: distinctAliases,
      hasMore: offset + items.length < distinctAliases,
      aggregates: { pendingRows, distinctAliases, distinctUploads },
    };
  });
}

// ---- raw row list (drill into a group / upload) -------------------

export interface ListRowsOptions {
  readonly workspaceId: WorkspaceId;
  readonly status?: UnresolvedStatus;
  readonly uploadId?: string;
  readonly aliasType?: AliasType;
  readonly aliasValue?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface UnresolvedRowList {
  readonly items: ReadonlyArray<UnresolvedRow>;
  readonly total: number;
  readonly hasMore: boolean;
}

export async function listUnresolvedRows(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListRowsOptions,
): Promise<UnresolvedRowList> {
  await assertWorkspaceAccess(app, actor, opts.workspaceId);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 500);
  const page = Math.max(opts.page ?? 0, 0);
  const offset = page * pageSize;

  const where: string[] = ['workspace_id = $1'];
  const params: unknown[] = [opts.workspaceId];
  let idx = 2;
  where.push(`status = $${idx++}`);
  params.push(opts.status ?? 'pending');
  if (opts.uploadId) {
    where.push(`upload_id = $${idx++}`);
    params.push(opts.uploadId);
  }
  if (opts.aliasType) {
    where.push(`alias_type = $${idx++}`);
    params.push(opts.aliasType);
  }
  if (opts.aliasValue) {
    where.push(`alias_value = $${idx++}`);
    params.push(opts.aliasValue);
  }
  const whereSql = where.join(' AND ');

  return app.withConnection(actor, async (client) => {
    const { rows: totalRows } = await client.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM xb_master.unresolved_sku_rows WHERE ${whereSql}`,
      params,
    );
    const total = Number(totalRows[0]?.total ?? 0);
    const dataParams = [...params, pageSize, offset];
    const { rows } = await client.query<DbRow>(
      `${SELECT_ROW} WHERE ${whereSql} ORDER BY created_at DESC, id DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams,
    );
    const items = rows.map(toRow);
    return { items, total, hasMore: offset + items.length < total };
  });
}

// ---- replay --------------------------------------------------------

export interface ReplayOptions {
  readonly workspaceId: WorkspaceId;
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform: string | null;
  readonly sourceMarketplace: string | null;
  readonly sourceAccount: string | null;
}

export interface ReplayResult {
  readonly resolvedSkuNormalized: string | null;
  readonly resolvedAliasId: string | null;
  readonly markedMapped: number;
  /** When alias still isn't resolvable, nothing changes — caller can prompt to create the alias. */
  readonly stillUnresolved: boolean;
}

/**
 * Replay one alias-group: if it now resolves, stamp every matching
 * pending row as 'mapped'. If it still doesn't resolve, leave them
 * pending and tell the caller. We don't auto-create aliases here —
 * that's an explicit operator action via the aliases POST endpoint.
 */
export async function replayGroup(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ReplayOptions,
): Promise<ReplayResult> {
  const orgId = await assertWorkspaceAccess(app, actor, opts.workspaceId);
  await app.assertPermission(actor, {
    organizationId: orgId as OrganizationId,
    workspaceId: opts.workspaceId,
    module: 'settings',
    action: 'edit',
  });

  return app.withConnection(actor, async (client) => {
    const resolved = await resolveSku(app, client, {
      workspaceId: opts.workspaceId,
      aliasType: opts.aliasType,
      aliasValue: opts.aliasValue,
      sourcePlatform: opts.sourcePlatform,
      sourceMarketplace: opts.sourceMarketplace,
      sourceAccount: opts.sourceAccount,
    });
    if (resolved === null) {
      return {
        resolvedSkuNormalized: null,
        resolvedAliasId: null,
        markedMapped: 0,
        stillUnresolved: true,
      };
    }

    // Look up the actual alias row id so the mapped row carries a
    // pointer back to the mapping that unblocked it.
    const { rows: aliasRows } = await client.query<{ id: string }>(
      `SELECT id FROM xb_master.sku_aliases
        WHERE workspace_id = $1
          AND alias_type = $2
          AND alias_value = $3
          AND COALESCE(source_platform, '')    = COALESCE($4, '')
          AND COALESCE(source_marketplace, '') = COALESCE($5, '')
          AND COALESCE(source_account, '')     = COALESCE($6, '')
          AND is_active = true AND deleted_at IS NULL
        LIMIT 1`,
      [
        opts.workspaceId,
        opts.aliasType,
        opts.aliasValue,
        opts.sourcePlatform,
        opts.sourceMarketplace,
        opts.sourceAccount,
      ],
    );
    const aliasId = aliasRows[0]?.id ?? null;

    const result = await client.query(
      `UPDATE xb_master.unresolved_sku_rows
          SET status = 'mapped',
              resolved_alias_id = $1,
              resolved_sku_normalized = $2,
              resolved_at = now(),
              resolved_by_actor_id = $3,
              updated_by_actor_id = $3
        WHERE workspace_id = $4
          AND status = 'pending'
          AND alias_type = $5
          AND alias_value = $6
          AND COALESCE(source_platform, '')    = COALESCE($7, '')
          AND COALESCE(source_marketplace, '') = COALESCE($8, '')
          AND COALESCE(source_account, '')     = COALESCE($9, '')`,
      [
        aliasId,
        resolved,
        actor.actorId,
        opts.workspaceId,
        opts.aliasType,
        opts.aliasValue,
        opts.sourcePlatform,
        opts.sourceMarketplace,
        opts.sourceAccount,
      ],
    );
    return {
      resolvedSkuNormalized: resolved,
      resolvedAliasId: aliasId,
      markedMapped: result.rowCount ?? 0,
      stillUnresolved: false,
    };
  });
}

// ---- dismiss -------------------------------------------------------

export interface DismissGroupOptions extends ReplayOptions {
  readonly reason?: string | null;
}

export interface DismissResult {
  readonly markedDismissed: number;
}

export async function dismissGroup(
  app: FastifyInstance,
  actor: ActorContext,
  opts: DismissGroupOptions,
): Promise<DismissResult> {
  const orgId = await assertWorkspaceAccess(app, actor, opts.workspaceId);
  await app.assertPermission(actor, {
    organizationId: orgId as OrganizationId,
    workspaceId: opts.workspaceId,
    module: 'settings',
    action: 'edit',
  });
  if (opts.reason && opts.reason.length > 200) {
    throw new SemanticError('dismissal reason must be ≤ 200 chars', 'invalid_input');
  }

  return app.withConnection(actor, async (client) => {
    const result = await client.query(
      `UPDATE xb_master.unresolved_sku_rows
          SET status = 'dismissed',
              dismissed_at = now(),
              dismissed_by_actor_id = $1,
              dismissal_reason = $2,
              updated_by_actor_id = $1
        WHERE workspace_id = $3
          AND status = 'pending'
          AND alias_type = $4
          AND alias_value = $5
          AND COALESCE(source_platform, '')    = COALESCE($6, '')
          AND COALESCE(source_marketplace, '') = COALESCE($7, '')
          AND COALESCE(source_account, '')     = COALESCE($8, '')`,
      [
        actor.actorId,
        opts.reason ?? null,
        opts.workspaceId,
        opts.aliasType,
        opts.aliasValue,
        opts.sourcePlatform,
        opts.sourceMarketplace,
        opts.sourceAccount,
      ],
    );
    return { markedDismissed: result.rowCount ?? 0 };
  });
}

// ---- restore (un-dismiss) -----------------------------------------

/**
 * Move a dismissed group back to pending — useful when an operator
 * dismissed-by-accident. Optimistic-locked at the row level via the
 * row_version trigger; we don't expect a UI to multi-edit these but
 * the trigger keeps history consistent.
 */
export async function restoreGroup(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ReplayOptions,
): Promise<{ restored: number }> {
  const orgId = await assertWorkspaceAccess(app, actor, opts.workspaceId);
  await app.assertPermission(actor, {
    organizationId: orgId as OrganizationId,
    workspaceId: opts.workspaceId,
    module: 'settings',
    action: 'edit',
  });
  return app.withConnection(actor, async (client) => {
    const result = await client.query(
      `UPDATE xb_master.unresolved_sku_rows
          SET status = 'pending',
              dismissed_at = NULL,
              dismissed_by_actor_id = NULL,
              dismissal_reason = NULL,
              updated_by_actor_id = $1
        WHERE workspace_id = $2
          AND status = 'dismissed'
          AND alias_type = $3
          AND alias_value = $4
          AND COALESCE(source_platform, '')    = COALESCE($5, '')
          AND COALESCE(source_marketplace, '') = COALESCE($6, '')
          AND COALESCE(source_account, '')     = COALESCE($7, '')`,
      [
        actor.actorId,
        opts.workspaceId,
        opts.aliasType,
        opts.aliasValue,
        opts.sourcePlatform,
        opts.sourceMarketplace,
        opts.sourceAccount,
      ],
    );
    return { restored: result.rowCount ?? 0 };
  });
}

// ---- single-row inspection ----------------------------------------

export async function getUnresolvedRow(
  app: FastifyInstance,
  actor: ActorContext,
  id: string,
): Promise<UnresolvedRow> {
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<DbRow>(`${SELECT_ROW} WHERE id = $1`, [id]);
    const row = rows[0];
    if (!row) throw new NotFoundError('unresolved_sku_row', id);
    if (
      row.organization_id !== (actor.organizationId as string | null) &&
      !actor.isInternalManager
    ) {
      throw new NotFoundError('unresolved_sku_row', id);
    }
    await app.assertPermission(actor, {
      organizationId: row.organization_id as OrganizationId,
      workspaceId: row.workspace_id as WorkspaceId,
      module: 'settings',
      action: 'view',
    });
    return toRow(row);
  });
}

// Re-export for the route file's convenience.
export { ConflictError };
