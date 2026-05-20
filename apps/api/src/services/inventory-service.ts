import type { FastifyInstance } from 'fastify';
import type { ActorContext, OrganizationId, WorkspaceId } from '@xb/types';
import { NotFoundError } from '../lib/errors.js';

export interface InventorySnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly sku: string;
  readonly warehouseCode: string;
  readonly snapshotDate: string; // YYYY-MM-DD
  readonly quantityOnHand: number;
  readonly quantityReserved: number;
  readonly quantityAvailable: number;
  readonly quantityInbound: number;
  /** numeric(18,4) — wire as string. null when not provided. */
  readonly unitCost: string | null;
  readonly currencyCode: string | null;
  readonly createdAt: string;
}

interface Row {
  id: string;
  organization_id: string;
  workspace_id: string;
  upload_id: string;
  sku: string;
  warehouse_code: string;
  snapshot_date: Date;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  quantity_inbound: number;
  unit_cost: string | null;
  currency_code: string | null;
  created_at: Date;
}

function toSnapshot(r: Row): InventorySnapshot {
  return {
    id: r.id,
    organizationId: r.organization_id,
    workspaceId: r.workspace_id,
    uploadId: r.upload_id,
    sku: r.sku,
    warehouseCode: r.warehouse_code,
    snapshotDate: r.snapshot_date.toISOString().slice(0, 10),
    quantityOnHand: r.quantity_on_hand,
    quantityReserved: r.quantity_reserved,
    quantityAvailable: r.quantity_available,
    quantityInbound: r.quantity_inbound,
    unitCost: r.unit_cost,
    currencyCode: r.currency_code,
    createdAt: r.created_at.toISOString(),
  };
}

const SELECT_INV = `
  SELECT id, organization_id, workspace_id, upload_id,
         sku, warehouse_code, snapshot_date,
         quantity_on_hand, quantity_reserved, quantity_available, quantity_inbound,
         unit_cost::text AS unit_cost, currency_code, created_at
    FROM xb_canonical.inventory_snapshots
   WHERE deleted_at IS NULL
`;

const SORT_COLUMNS: Record<string, string> = {
  snapshotDate: 'snapshot_date',
  sku:          'sku',
  warehouse:    'warehouse_code',
  onHand:       'quantity_on_hand',
  reserved:     'quantity_reserved',
  available:    'quantity_available',
  inbound:      'quantity_inbound',
  unitCost:     'unit_cost',
  createdAt:    'created_at',
};

function parseSort(sort: string | undefined): { column: string; direction: 'ASC' | 'DESC' } {
  if (!sort) return { column: 'snapshot_date', direction: 'DESC' };
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const column = SORT_COLUMNS[key] ?? 'snapshot_date';
  return { column, direction: desc ? 'DESC' : 'ASC' };
}

export interface ListInventoryOptions {
  readonly workspaceId: WorkspaceId;
  readonly q?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly warehouse?: string;
  readonly sku?: string;
  /**
   * When true, returns only the LATEST snapshot per (sku, warehouse).
   * Default true — this is the current-state view operators care
   * about. Pass false for historical analyses (every snapshot row).
   */
  readonly latestOnly?: boolean;
  readonly sort?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface InventoryListResult {
  readonly items: ReadonlyArray<InventorySnapshot>;
  readonly total: number;
  readonly hasMore: boolean;
  readonly aggregates: {
    readonly distinctSkus: number;
    readonly distinctWarehouses: number;
    readonly totalOnHand: number;
    readonly totalAvailable: number;
    /** numeric(18,4) text — sum of on_hand * unit_cost over rows where unit_cost is non-null. */
    readonly totalValuation: string;
  };
}

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
    module: 'inventory',
    action: 'view',
  });
  return ws.organization_id;
}

/**
 * List inventory snapshots, with the workspace-scoped operator view
 * (latest snapshot per sku+warehouse) on by default.
 *
 * Latest-only uses DISTINCT ON which Postgres handles efficiently on
 * the (workspace_id, sku, snapshot_date DESC) index — fine up to a
 * million rows per workspace, then we'd need a materialized view.
 */
export async function listInventory(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListInventoryOptions,
): Promise<InventoryListResult> {
  await assertWorkspaceAccess(app, actor, opts.workspaceId);

  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 500);
  const page = Math.max(opts.page ?? 0, 0);
  const offset = page * pageSize;
  const latestOnly = opts.latestOnly !== false;

  const where: string[] = ['workspace_id = $1'];
  const params: unknown[] = [opts.workspaceId];
  let idx = 2;

  if (opts.dateFrom) {
    where.push(`snapshot_date >= $${idx++}`);
    params.push(opts.dateFrom);
  }
  if (opts.dateTo) {
    where.push(`snapshot_date <= $${idx++}`);
    params.push(opts.dateTo);
  }
  if (opts.warehouse) {
    where.push(`warehouse_code = $${idx++}`);
    params.push(opts.warehouse);
  }
  if (opts.sku) {
    where.push(`sku = $${idx++}`);
    params.push(opts.sku);
  }
  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    where.push(`(lower(sku) LIKE $${idx} OR lower(warehouse_code) LIKE $${idx})`);
    params.push(like);
    idx++;
  }
  const whereSql = `AND ${where.join(' AND ')}`;
  const { column, direction } = parseSort(opts.sort);

  // CTE form: when latestOnly, first pick the most recent snapshot per
  // (sku, warehouse), then sort + paginate over that set. The aggregate
  // is computed over the same filtered set so summary tiles match the
  // list 1:1.
  const baseCte = latestOnly
    ? `
      WITH base AS (
        SELECT DISTINCT ON (sku, warehouse_code)
               id, organization_id, workspace_id, upload_id,
               sku, warehouse_code, snapshot_date,
               quantity_on_hand, quantity_reserved, quantity_available, quantity_inbound,
               unit_cost, currency_code, created_at
          FROM xb_canonical.inventory_snapshots
         WHERE deleted_at IS NULL ${whereSql}
         ORDER BY sku, warehouse_code, snapshot_date DESC, id DESC
      )
    `
    : `
      WITH base AS (
        SELECT id, organization_id, workspace_id, upload_id,
               sku, warehouse_code, snapshot_date,
               quantity_on_hand, quantity_reserved, quantity_available, quantity_inbound,
               unit_cost, currency_code, created_at
          FROM xb_canonical.inventory_snapshots
         WHERE deleted_at IS NULL ${whereSql}
      )
    `;

  return app.withConnection(actor, async (client) => {
    const { rows: aggRows } = await client.query<{
      total: string;
      distinct_skus: string;
      distinct_warehouses: string;
      total_on_hand: string;
      total_available: string;
      total_valuation: string;
    }>(
      `${baseCte}
       SELECT count(*)::text AS total,
              count(DISTINCT sku)::text AS distinct_skus,
              count(DISTINCT warehouse_code)::text AS distinct_warehouses,
              COALESCE(sum(quantity_on_hand)::text, '0') AS total_on_hand,
              COALESCE(sum(quantity_available)::text, '0') AS total_available,
              COALESCE(sum(unit_cost * quantity_on_hand)::text, '0') AS total_valuation
         FROM base`,
      params,
    );
    const aggRow = aggRows[0];

    const dataParams = [...params, pageSize, offset];
    const { rows } = await client.query<Row>(
      `${baseCte}
       SELECT id, organization_id, workspace_id, upload_id,
              sku, warehouse_code, snapshot_date,
              quantity_on_hand, quantity_reserved, quantity_available, quantity_inbound,
              unit_cost::text AS unit_cost, currency_code, created_at
         FROM base
        ORDER BY ${column} ${direction}, id ${direction}
        LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams,
    );
    const items = rows.map(toSnapshot);
    const total = Number(aggRow?.total ?? 0);
    return {
      items,
      total,
      hasMore: offset + items.length < total,
      aggregates: {
        distinctSkus: Number(aggRow?.distinct_skus ?? 0),
        distinctWarehouses: Number(aggRow?.distinct_warehouses ?? 0),
        totalOnHand: Number(aggRow?.total_on_hand ?? 0),
        totalAvailable: Number(aggRow?.total_available ?? 0),
        totalValuation: aggRow?.total_valuation ?? '0',
      },
    };
  });
}

/** Distinct warehouses for the filter dropdown. */
export async function listInventoryFacets(
  app: FastifyInstance,
  actor: ActorContext,
  workspaceId: WorkspaceId,
): Promise<{ warehouses: ReadonlyArray<string> }> {
  await assertWorkspaceAccess(app, actor, workspaceId);
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{ warehouse_code: string }>(
      `SELECT DISTINCT warehouse_code FROM xb_canonical.inventory_snapshots
        WHERE workspace_id = $1 AND deleted_at IS NULL
        ORDER BY warehouse_code ASC LIMIT 200`,
      [workspaceId],
    );
    return { warehouses: rows.map((r) => r.warehouse_code) };
  });
}
