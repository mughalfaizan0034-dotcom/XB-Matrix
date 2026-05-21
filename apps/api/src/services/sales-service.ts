import type { FastifyInstance } from 'fastify';
import type { ActorContext, OrganizationId, WorkspaceId } from '@xb/types';
import { NotFoundError } from '../lib/errors.js';

export interface SalesOrder {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadId: string;
  readonly orderId: string;
  readonly sku: string;
  readonly quantity: number;
  /** numeric(18,4) — string to avoid float drift on the wire. */
  readonly unitPrice: string;
  readonly totalPrice: string;
  readonly currencyCode: string;
  /** ISO date (YYYY-MM-DD). */
  readonly orderDate: string;
  readonly marketplace: string | null;
  readonly channel: string | null;
  readonly createdAt: string;
}

interface Row {
  id: string;
  organization_id: string;
  workspace_id: string;
  upload_id: string;
  order_id: string;
  sku: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  currency_code: string;
  order_date: Date;
  marketplace: string | null;
  channel: string | null;
  created_at: Date;
}

function toOrder(r: Row): SalesOrder {
  return {
    id: r.id,
    organizationId: r.organization_id,
    workspaceId: r.workspace_id,
    uploadId: r.upload_id,
    orderId: r.order_id,
    sku: r.sku,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    totalPrice: r.total_price,
    currencyCode: r.currency_code,
    orderDate: r.order_date.toISOString().slice(0, 10),
    marketplace: r.marketplace,
    channel: r.channel,
    createdAt: r.created_at.toISOString(),
  };
}

const SELECT_SALES = `
  SELECT id, organization_id, workspace_id, upload_id,
         order_id, sku, quantity, unit_price::text AS unit_price,
         total_price::text AS total_price, currency_code, order_date,
         marketplace, channel, created_at
    FROM xb_canonical.sales_orders
   WHERE deleted_at IS NULL
`;

export interface ListSalesOptions {
  readonly workspaceId: WorkspaceId;
  readonly q?: string;
  /** ISO date or empty. Inclusive bounds. */
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly marketplace?: string;
  readonly channel?: string;
  readonly sku?: string;
  readonly sort?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface SalesListResult {
  readonly items: ReadonlyArray<SalesOrder>;
  readonly total: number;
  readonly hasMore: boolean;
  /** Lightweight aggregates over the FILTERED set (not just the page). */
  readonly aggregates: {
    readonly totalOrders: number;
    readonly totalQuantity: number;
    readonly totalGross: string; // numeric(18,4) as text
  };
}

// Allow-listed sort columns — never user-interpolated into SQL.
const SORT_COLUMNS: Record<string, string> = {
  orderDate:  'order_date',
  orderId:    'order_id',
  sku:        'sku',
  quantity:   'quantity',
  unitPrice:  'unit_price',
  totalPrice: 'total_price',
  marketplace: 'marketplace',
  channel:    'channel',
  createdAt:  'created_at',
};

function parseSort(sort: string | undefined): { column: string; direction: 'ASC' | 'DESC' } {
  if (!sort) return { column: 'order_date', direction: 'DESC' };
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  const column = SORT_COLUMNS[key] ?? 'order_date';
  return { column, direction: desc ? 'DESC' : 'ASC' };
}

/**
 * List sales orders for a workspace with optional filters + paging.
 * Aggregates over the *filtered* set are computed in the same round
 * trip so the UI doesn't need a second query for the summary cards.
 */
export async function listSalesOrders(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListSalesOptions,
): Promise<SalesListResult> {
  // Verify workspace exists + belongs to actor's org (or actor is manager).
  // Doubles as a permission gate before we touch canonical data.
  // xb_core.workspaces is RLS-scoped — the lookup must run inside
  // withConnection so the actor's org context is set. A raw pool query
  // has no context and sees zero rows.
  const ws = await app
    .withConnection(actor, (client) =>
      client.query<{ organization_id: string }>(
        `SELECT organization_id FROM xb_core.workspaces WHERE id = $1 AND deleted_at IS NULL`,
        [opts.workspaceId],
      ),
    )
    .then((r) => r.rows[0]);
  if (!ws) throw new NotFoundError('workspace', opts.workspaceId);
  if (ws.organization_id !== (actor.organizationId as string | null) && !actor.isInternalManager) {
    throw new NotFoundError('workspace', opts.workspaceId);
  }
  await app.assertPermission(actor, {
    organizationId: ws.organization_id as OrganizationId,
    workspaceId: opts.workspaceId,
    module: 'sales',
    action: 'view',
  });

  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 500);
  const page = Math.max(opts.page ?? 0, 0);
  const offset = page * pageSize;

  const where: string[] = ['workspace_id = $1'];
  const params: unknown[] = [opts.workspaceId];
  let idx = 2;

  if (opts.dateFrom) {
    where.push(`order_date >= $${idx++}`);
    params.push(opts.dateFrom);
  }
  if (opts.dateTo) {
    where.push(`order_date <= $${idx++}`);
    params.push(opts.dateTo);
  }
  if (opts.marketplace) {
    where.push(`marketplace = $${idx++}`);
    params.push(opts.marketplace);
  }
  if (opts.channel) {
    where.push(`channel = $${idx++}`);
    params.push(opts.channel);
  }
  if (opts.sku) {
    where.push(`sku = $${idx++}`);
    params.push(opts.sku);
  }
  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim().toLowerCase()}%`;
    where.push(`(lower(order_id) LIKE $${idx} OR lower(sku) LIKE $${idx})`);
    params.push(like);
    idx++;
  }
  const whereSql = `AND ${where.join(' AND ')}`;
  const { column, direction } = parseSort(opts.sort);

  return app.withConnection(actor, async (client) => {
    // Aggregates over the filtered set. Computed alongside count to
    // keep round-trips down. SUM uses NUMERIC so no float drift.
    const { rows: aggRows } = await client.query<{
      total: string;
      total_qty: string | null;
      total_gross: string | null;
    }>(
      `SELECT count(*)::text AS total,
              COALESCE(sum(quantity)::text, '0') AS total_qty,
              COALESCE(sum(total_price)::text, '0') AS total_gross
         FROM xb_canonical.sales_orders
        WHERE deleted_at IS NULL ${whereSql}`,
      params,
    );
    const total = Number(aggRows[0]?.total ?? 0);

    const dataParams = [...params, pageSize, offset];
    const { rows } = await client.query<Row>(
      `${SELECT_SALES} ${whereSql} ORDER BY ${column} ${direction}, id ${direction} LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams,
    );
    const items = rows.map(toOrder);
    return {
      items,
      total,
      hasMore: offset + items.length < total,
      aggregates: {
        totalOrders: total,
        totalQuantity: Number(aggRows[0]?.total_qty ?? 0),
        totalGross: aggRows[0]?.total_gross ?? '0',
      },
    };
  });
}

/**
 * Distinct marketplace + channel values for the filter dropdowns.
 * Scoped to the workspace — small set so we load it once.
 */
export async function listSalesFacets(
  app: FastifyInstance,
  actor: ActorContext,
  workspaceId: WorkspaceId,
): Promise<{
  marketplaces: ReadonlyArray<string>;
  channels: ReadonlyArray<string>;
}> {
  // RLS-scoped — must run inside withConnection (see listSalesOrders).
  const ws = await app
    .withConnection(actor, (client) =>
      client.query<{ organization_id: string }>(
        `SELECT organization_id FROM xb_core.workspaces WHERE id = $1 AND deleted_at IS NULL`,
        [workspaceId],
      ),
    )
    .then((r) => r.rows[0]);
  if (!ws) throw new NotFoundError('workspace', workspaceId);
  if (ws.organization_id !== (actor.organizationId as string | null) && !actor.isInternalManager) {
    throw new NotFoundError('workspace', workspaceId);
  }
  await app.assertPermission(actor, {
    organizationId: ws.organization_id as OrganizationId,
    workspaceId,
    module: 'sales',
    action: 'view',
  });

  return app.withConnection(actor, async (client) => {
    const { rows: mp } = await client.query<{ marketplace: string }>(
      `SELECT DISTINCT marketplace FROM xb_canonical.sales_orders
        WHERE workspace_id = $1 AND deleted_at IS NULL AND marketplace IS NOT NULL
        ORDER BY marketplace ASC LIMIT 100`,
      [workspaceId],
    );
    const { rows: ch } = await client.query<{ channel: string }>(
      `SELECT DISTINCT channel FROM xb_canonical.sales_orders
        WHERE workspace_id = $1 AND deleted_at IS NULL AND channel IS NOT NULL
        ORDER BY channel ASC LIMIT 100`,
      [workspaceId],
    );
    return {
      marketplaces: mp.map((r) => r.marketplace),
      channels: ch.map((r) => r.channel),
    };
  });
}
