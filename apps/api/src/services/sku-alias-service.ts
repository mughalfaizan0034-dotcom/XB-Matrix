import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { ulid } from 'ulid';
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

export const ALIAS_TYPES = [
  'platform_sku',
  'asin',
  'upc',
  'ean',
  'gtin',
  'isbn',
  'fnsku',
  'supplier_sku',
  'internal_sku',
  'warehouse_sku',
] as const;
export type AliasType = (typeof ALIAS_TYPES)[number];

export const SOURCE_METHODS = [
  'manual',
  'rule',
  'fuzzy',
  'ai_suggested',
  'auto_first_seen',
] as const;
export type SourceMethod = (typeof SOURCE_METHODS)[number];

export interface SkuAlias {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly skuNormalized: string;
  readonly aliasValue: string;
  readonly aliasType: AliasType;
  readonly sourcePlatform: string | null;
  readonly sourceAccount: string | null;
  readonly sourceMarketplace: string | null;
  readonly regionCode: string | null;
  readonly warehouseCode: string | null;
  readonly isActive: boolean;
  readonly sourceMethod: SourceMethod;
  readonly confidence: number | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rowVersion: number;
}

interface Row {
  id: string;
  organization_id: string;
  workspace_id: string;
  sku_normalized: string;
  alias_value: string;
  alias_type: AliasType;
  source_platform: string | null;
  source_account: string | null;
  source_marketplace: string | null;
  region_code: string | null;
  warehouse_code: string | null;
  is_active: boolean;
  source_method: SourceMethod;
  confidence: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  row_version: number;
}

function toAlias(r: Row): SkuAlias {
  return {
    id: r.id,
    organizationId: r.organization_id,
    workspaceId: r.workspace_id,
    skuNormalized: r.sku_normalized,
    aliasValue: r.alias_value,
    aliasType: r.alias_type,
    sourcePlatform: r.source_platform,
    sourceAccount: r.source_account,
    sourceMarketplace: r.source_marketplace,
    regionCode: r.region_code,
    warehouseCode: r.warehouse_code,
    isActive: r.is_active,
    sourceMethod: r.source_method,
    confidence: r.confidence !== null ? Number(r.confidence) : null,
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    rowVersion: r.row_version,
  };
}

const SELECT_ALIAS = `
  SELECT id, organization_id, workspace_id, sku_normalized,
         alias_value, alias_type,
         source_platform, source_account, source_marketplace,
         region_code, warehouse_code,
         is_active, source_method, confidence::text AS confidence, notes,
         created_at, updated_at, row_version
    FROM xb_master.sku_aliases
   WHERE deleted_at IS NULL
`;

async function assertWorkspaceAccess(
  app: FastifyInstance,
  actor: ActorContext,
  workspaceId: WorkspaceId,
): Promise<string> {
  const ws = await app.pg
    .query<{ organization_id: string }>(
      `SELECT organization_id FROM xb_core.workspaces WHERE id = $1 AND deleted_at IS NULL`,
      [workspaceId],
    )
    .then((r) => r.rows[0]);
  if (!ws) throw new NotFoundError('workspace', workspaceId);
  if (ws.organization_id !== (actor.organizationId as string | null) && !actor.isInternalManager) {
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

// ---- resolveSku --------------------------------------------------------

/**
 * Resolve a platform-shaped SKU into the canonical normalized SKU. This
 * is the hot path called by every connector mapper during canonical
 * transformation — keep it fast and idempotent.
 *
 * The lookup matches on (workspace_id, alias_type, alias_value) plus
 * any source context provided. Missing source columns must be passed
 * as `null` so the unique index match works (since the index treats
 * NULLs as '' via COALESCE).
 *
 * Returns the normalized SKU when exactly one active row matches,
 * `null` otherwise (no match, or ambiguous match — caller decides
 * whether to auto-create with method='auto_first_seen' or fail).
 */
export interface ResolveSkuInput {
  readonly workspaceId: WorkspaceId;
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform?: string | null;
  readonly sourceMarketplace?: string | null;
  readonly sourceAccount?: string | null;
}

export async function resolveSku(
  app: FastifyInstance,
  client: PoolClient | null,
  input: ResolveSkuInput,
): Promise<string | null> {
  // Caller may share an existing transaction (mapping layer runs inside
  // the upload validator's tx); otherwise we use the pool directly.
  const runner = client ?? app.pg;
  const { rows } = await runner.query<{ sku_normalized: string }>(
    `SELECT sku_normalized
       FROM xb_master.sku_aliases
      WHERE deleted_at IS NULL
        AND is_active = true
        AND workspace_id = $1
        AND alias_type = $2
        AND alias_value = $3
        AND COALESCE(source_platform, '')    = COALESCE($4, '')
        AND COALESCE(source_marketplace, '') = COALESCE($5, '')
        AND COALESCE(source_account, '')     = COALESCE($6, '')
      LIMIT 2`,
    [
      input.workspaceId,
      input.aliasType,
      input.aliasValue,
      input.sourcePlatform ?? null,
      input.sourceMarketplace ?? null,
      input.sourceAccount ?? null,
    ],
  );
  if (rows.length === 0) return null;
  if (rows.length > 1) return null; // ambiguous — caller treats as unresolved
  return rows[0]!.sku_normalized;
}

// ---- list + paginate ---------------------------------------------------

export interface ListAliasesOptions {
  readonly workspaceId: WorkspaceId;
  readonly q?: string;
  readonly aliasType?: AliasType;
  readonly sourcePlatform?: string;
  readonly skuNormalized?: string;
  readonly isActive?: boolean;
  readonly sort?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface AliasListResult {
  readonly items: ReadonlyArray<SkuAlias>;
  readonly total: number;
  readonly hasMore: boolean;
  readonly aggregates: {
    readonly totalAliases: number;
    readonly distinctSkus: number;
    readonly distinctPlatforms: number;
  };
}

const SORT_COLUMNS: Record<string, string> = {
  skuNormalized:     'sku_normalized',
  aliasValue:        'alias_value',
  aliasType:         'alias_type',
  sourcePlatform:    'source_platform',
  sourceMarketplace: 'source_marketplace',
  updatedAt:         'updated_at',
  createdAt:         'created_at',
};

function parseSort(sort: string | undefined): { column: string; direction: 'ASC' | 'DESC' } {
  if (!sort) return { column: 'updated_at', direction: 'DESC' };
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const column = SORT_COLUMNS[key] ?? 'updated_at';
  return { column, direction: desc ? 'DESC' : 'ASC' };
}

export async function listAliases(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListAliasesOptions,
): Promise<AliasListResult> {
  await assertWorkspaceAccess(app, actor, opts.workspaceId);

  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 500);
  const page = Math.max(opts.page ?? 0, 0);
  const offset = page * pageSize;

  const where: string[] = ['workspace_id = $1'];
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
  if (opts.skuNormalized) {
    where.push(`sku_normalized = $${idx++}`);
    params.push(opts.skuNormalized);
  }
  if (typeof opts.isActive === 'boolean') {
    where.push(`is_active = $${idx++}`);
    params.push(opts.isActive);
  }
  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    where.push(`(lower(sku_normalized) LIKE $${idx} OR lower(alias_value) LIKE $${idx})`);
    params.push(like);
    idx++;
  }
  const whereSql = `AND ${where.join(' AND ')}`;
  const { column, direction } = parseSort(opts.sort);

  return app.withConnection(actor, async (client) => {
    const { rows: agg } = await client.query<{
      total: string;
      distinct_skus: string;
      distinct_platforms: string;
    }>(
      `SELECT count(*)::text AS total,
              count(DISTINCT sku_normalized)::text AS distinct_skus,
              count(DISTINCT source_platform)::text AS distinct_platforms
         FROM xb_master.sku_aliases
        WHERE deleted_at IS NULL ${whereSql}`,
      params,
    );
    const total = Number(agg[0]?.total ?? 0);

    const dataParams = [...params, pageSize, offset];
    const { rows } = await client.query<Row>(
      `${SELECT_ALIAS} ${whereSql} ORDER BY ${column} ${direction}, id ${direction} LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams,
    );
    const items = rows.map(toAlias);
    return {
      items,
      total,
      hasMore: offset + items.length < total,
      aggregates: {
        totalAliases: total,
        distinctSkus: Number(agg[0]?.distinct_skus ?? 0),
        distinctPlatforms: Number(agg[0]?.distinct_platforms ?? 0),
      },
    };
  });
}

// ---- create / update / deactivate / delete -----------------------------

export interface CreateAliasInput {
  readonly workspaceId: WorkspaceId;
  readonly skuNormalized: string;
  readonly aliasValue: string;
  readonly aliasType: AliasType;
  readonly sourcePlatform?: string | null;
  readonly sourceAccount?: string | null;
  readonly sourceMarketplace?: string | null;
  readonly regionCode?: string | null;
  readonly warehouseCode?: string | null;
  readonly isActive?: boolean;
  readonly sourceMethod?: SourceMethod;
  readonly confidence?: number | null;
  readonly notes?: string | null;
}

export async function createAlias(
  app: FastifyInstance,
  actor: ActorContext,
  input: CreateAliasInput,
): Promise<SkuAlias> {
  const orgId = await assertWorkspaceAccess(app, actor, input.workspaceId);
  await app.assertPermission(actor, {
    organizationId: orgId as OrganizationId,
    workspaceId: input.workspaceId,
    module: 'settings',
    action: 'edit',
  });

  const skuNormalized = input.skuNormalized.trim();
  const aliasValue = input.aliasValue.trim();
  if (!skuNormalized) throw new SemanticError('sku_normalized is required', 'invalid_input');
  if (!aliasValue) throw new SemanticError('alias_value is required', 'invalid_input');

  const id = ulid();
  try {
    return await app.withConnection(actor, async (client) => {
      await client.query(
        `INSERT INTO xb_master.sku_aliases
           (id, organization_id, workspace_id, sku_normalized,
            alias_value, alias_type,
            source_platform, source_account, source_marketplace,
            region_code, warehouse_code,
            is_active, source_method, confidence, notes,
            created_by_actor_id, updated_by_actor_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)`,
        [
          id,
          orgId,
          input.workspaceId,
          skuNormalized,
          aliasValue,
          input.aliasType,
          input.sourcePlatform ?? null,
          input.sourceAccount ?? null,
          input.sourceMarketplace ?? null,
          input.regionCode ?? null,
          input.warehouseCode ?? null,
          input.isActive ?? true,
          input.sourceMethod ?? 'manual',
          input.confidence ?? null,
          input.notes ?? null,
          actor.actorId,
        ],
      );
      const { rows } = await client.query<Row>(`${SELECT_ALIAS} AND id = $1`, [id]);
      if (!rows[0]) throw new Error('inserted alias vanished');
      return toAlias(rows[0]);
    });
  } catch (err) {
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr?.code === '23505') {
      throw new ConflictError(
        'An active alias with that combination already exists.',
        'alias_exists',
        { constraint: pgErr.constraint },
      );
    }
    throw err;
  }
}

export interface UpdateAliasInput {
  readonly expectedRowVersion: number;
  readonly skuNormalized?: string;
  readonly isActive?: boolean;
  readonly notes?: string | null;
  readonly confidence?: number | null;
}

export async function updateAlias(
  app: FastifyInstance,
  actor: ActorContext,
  id: string,
  input: UpdateAliasInput,
): Promise<SkuAlias> {
  return app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<{
      organization_id: string;
      workspace_id: string;
      row_version: number;
    }>(
      `SELECT organization_id, workspace_id, row_version
         FROM xb_master.sku_aliases
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const cur = existing[0];
    if (!cur) throw new NotFoundError('sku_alias', id);
    if (cur.organization_id !== (actor.organizationId as string | null) && !actor.isInternalManager) {
      throw new NotFoundError('sku_alias', id);
    }
    await app.assertPermission(actor, {
      organizationId: cur.organization_id as OrganizationId,
      workspaceId: cur.workspace_id as WorkspaceId,
      module: 'settings',
      action: 'edit',
    });

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (input.skuNormalized !== undefined) {
      const v = input.skuNormalized.trim();
      if (!v) throw new SemanticError('sku_normalized cannot be empty', 'invalid_input');
      sets.push(`sku_normalized = $${idx++}`);
      params.push(v);
    }
    if (input.isActive !== undefined) {
      sets.push(`is_active = $${idx++}`);
      params.push(input.isActive);
    }
    if (input.notes !== undefined) {
      sets.push(`notes = $${idx++}`);
      params.push(input.notes);
    }
    if (input.confidence !== undefined) {
      sets.push(`confidence = $${idx++}`);
      params.push(input.confidence);
    }
    if (sets.length === 0) {
      const { rows } = await client.query<Row>(`${SELECT_ALIAS} AND id = $1`, [id]);
      return toAlias(rows[0]!);
    }
    sets.push(`updated_by_actor_id = $${idx++}`);
    params.push(actor.actorId);
    params.push(id, input.expectedRowVersion);

    const result = await client.query(
      `UPDATE xb_master.sku_aliases
          SET ${sets.join(', ')}
        WHERE id = $${idx++} AND row_version = $${idx++} AND deleted_at IS NULL`,
      params,
    );
    if (result.rowCount === 0) {
      throw new ConflictError(
        'Alias was modified by another action. Reload and try again.',
        'row_version_mismatch',
      );
    }
    const { rows } = await client.query<Row>(`${SELECT_ALIAS} AND id = $1`, [id]);
    return toAlias(rows[0]!);
  });
}

export async function softDeleteAlias(
  app: FastifyInstance,
  actor: ActorContext,
  id: string,
  expectedRowVersion: number,
): Promise<void> {
  await app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<{
      organization_id: string;
      workspace_id: string;
    }>(
      `SELECT organization_id, workspace_id
         FROM xb_master.sku_aliases
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const cur = existing[0];
    if (!cur) throw new NotFoundError('sku_alias', id);
    await app.assertPermission(actor, {
      organizationId: cur.organization_id as OrganizationId,
      workspaceId: cur.workspace_id as WorkspaceId,
      module: 'settings',
      action: 'delete',
    });
    const result = await client.query(
      `UPDATE xb_master.sku_aliases
          SET deleted_at = now(),
              deleted_by_actor_id = $2,
              is_active = false
        WHERE id = $1 AND row_version = $3 AND deleted_at IS NULL`,
      [id, actor.actorId, expectedRowVersion],
    );
    if (result.rowCount === 0) {
      throw new ConflictError(
        'Alias was modified by another action. Reload and try again.',
        'row_version_mismatch',
      );
    }
  });
}

// ---- conflict detection -----------------------------------------------

export interface AliasConflict {
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform: string | null;
  readonly sourceMarketplace: string | null;
  readonly sourceAccount: string | null;
  readonly resolvedSkus: ReadonlyArray<string>;
  readonly aliasIds: ReadonlyArray<string>;
}

/**
 * Detect aliases that resolve to multiple sku_normalized values. The
 * unique index prevents this for active rows, BUT inactive rows + soft-
 * deleted rows can still represent past conflicts the operator should
 * see when cleaning up. Plus, future fuzzy/AI-suggested aliases may
 * intentionally be left as multi-candidates for review.
 */
export async function detectConflicts(
  app: FastifyInstance,
  actor: ActorContext,
  workspaceId: WorkspaceId,
): Promise<ReadonlyArray<AliasConflict>> {
  await assertWorkspaceAccess(app, actor, workspaceId);
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      alias_type: AliasType;
      alias_value: string;
      source_platform: string | null;
      source_marketplace: string | null;
      source_account: string | null;
      sku_list: string[];
      id_list: string[];
    }>(
      `SELECT alias_type, alias_value,
              source_platform, source_marketplace, source_account,
              array_agg(DISTINCT sku_normalized) AS sku_list,
              array_agg(id) AS id_list
         FROM xb_master.sku_aliases
        WHERE workspace_id = $1
          AND deleted_at IS NULL
        GROUP BY alias_type, alias_value, source_platform, source_marketplace, source_account
       HAVING count(DISTINCT sku_normalized) > 1
        ORDER BY alias_type, alias_value
        LIMIT 500`,
      [workspaceId],
    );
    return rows.map((r) => ({
      aliasType: r.alias_type,
      aliasValue: r.alias_value,
      sourcePlatform: r.source_platform,
      sourceMarketplace: r.source_marketplace,
      sourceAccount: r.source_account,
      resolvedSkus: r.sku_list,
      aliasIds: r.id_list,
    }));
  });
}
