import type { FastifyInstance } from 'fastify';
import type { ActorContext, WorkspaceId } from '@xb/types';
import { requireWorkspaceAccess } from './workspace-service.js';

/**
 * Central intelligence service — the deterministic engine layer that
 * sits between canonical tables and every read surface (dashboards,
 * module pages, reports, AI). Architectural rule (CLAUDE.md): all
 * business math happens here, server-side. The frontend renders the
 * shapes this service emits and never recomputes a KPI.
 *
 * The hooks here are intentionally workspace-scoped: every entry point
 * validates `requireWorkspaceAccess` so the same call works for org
 * admins, internal managers, and view-only org users — RLS does the
 * tenant cut, this gate does the per-workspace cut, and the AI layer
 * (later) inherits whichever access level resolves here.
 *
 * Roadmap mapping (docs/engines.md):
 *   - Slice A1 (sales engine)          → getDashboardKpis().sales + readiness
 *   - Slice A2 (inventory engine)      → getDashboardKpis().inventory + readiness
 *   - Slice A3 (advertising engine)    → getAdvertisingSummary()
 *   - Slice A4 (dashboard KPIs/trends) → getDashboardKpis()
 *   - Slice (unit economics)           → getUnitEconomicsSummary()
 *   - Slice (forecasting/replen)       → getShipmentsReadiness()
 *   - Slice (report catalog)           → getReportRegistry()
 *
 * Each entry point returns a `readiness` block describing whether the
 * engine has the data it needs. The UI uses that to render either the
 * computed KPI or an honest empty state — never a fabricated number.
 */

// ----- Shared shapes -------------------------------------------------

export interface EngineReadiness {
  /** True when the engine has enough data to compute non-zero outputs. */
  readonly ready: boolean;
  /** Operator-readable reason when not ready (e.g. "Upload a sales CSV"). */
  readonly reason: string | null;
  /** Optional pointer to where the operator can take action. */
  readonly action?: { readonly label: string; readonly href: string };
}

interface WorkspaceScope {
  readonly workspaceId: WorkspaceId;
  readonly windowDays: number;
}

const DEFAULT_WINDOW_DAYS = 30;

// ----- Dashboard KPI bundle ------------------------------------------

export interface DashboardSalesKpis {
  readonly windowDays: number;
  readonly orders: number;
  readonly units: number;
  /** numeric(18,4) text — sum of total_price across the window. */
  readonly revenue: string;
  /** numeric(18,4) text — revenue / orders. null when orders=0. */
  readonly averageOrderValue: string | null;
  /** numeric(18,4) text — revenue / units. null when units=0. */
  readonly averageSellingPrice: string | null;
  /** units / windowDays — daily velocity (server-rounded to 4dp string). */
  readonly dailyVelocity: string | null;
  readonly distinctSkus: number;
  readonly distinctMarketplaces: number;
}

export interface DashboardInventoryKpis {
  readonly snapshotDate: string | null;
  readonly distinctSkus: number;
  readonly distinctWarehouses: number;
  readonly totalOnHand: number;
  readonly totalAvailable: number;
  readonly totalInbound: number;
  readonly totalReserved: number;
  /** numeric(18,4) text — sum(unit_cost * on_hand) where unit_cost set. */
  readonly totalValuation: string;
  /** Share of distinct SKUs that carry unit_cost — 0..1, 4dp text. */
  readonly costCoverage: string;
}

export interface DashboardCombinedKpis {
  /** days = on_hand / (units / windowDays). null when either half is missing. */
  readonly stockCoverDays: string | null;
  /**
   * At-risk-of-stockout SKU count: SKUs where the latest on-hand /
   * average daily velocity over the window < workspace's DOS target.
   * 0 when either input is missing.
   */
  readonly stockoutRiskSkus: number;
  /** SKUs with on_hand > 0 but zero sales in the window. */
  readonly deadStockSkus: number;
}

export interface MarketplaceBreakdownEntry {
  readonly marketplace: string;
  readonly orders: number;
  readonly units: number;
  /** numeric(18,4) text. */
  readonly revenue: string;
  /** 0..1, 4dp text. share of total revenue. */
  readonly revenueShare: string;
}

export interface DashboardKpiBundle {
  readonly workspaceId: string;
  readonly windowDays: number;
  readonly window: { readonly from: string; readonly to: string };
  readonly sales: DashboardSalesKpis;
  readonly salesReadiness: EngineReadiness;
  readonly inventory: DashboardInventoryKpis;
  readonly inventoryReadiness: EngineReadiness;
  readonly combined: DashboardCombinedKpis;
  /** Top 5 marketplaces by revenue (descending). Empty when no sales. */
  readonly topMarketplaces: ReadonlyArray<MarketplaceBreakdownEntry>;
  /** Workspace's days-of-stock target (numeric text, e.g. "30"). */
  readonly dosTargetDays: string;
}

/**
 * Compute the dashboard KPI bundle in a single round trip's worth of
 * SQL. Every figure is engine-computed; the client renders these
 * verbatim. When inputs are missing we set readiness.ready=false and
 * leave numeric fields at zero / null so the UI shows an honest empty
 * state rather than fabricated metrics.
 */
export async function getDashboardKpis(
  app: FastifyInstance,
  actor: ActorContext,
  scope: WorkspaceScope,
): Promise<DashboardKpiBundle> {
  await requireWorkspaceAccess(app, actor, scope.workspaceId, 'view');
  const windowDays = clampWindow(scope.windowDays);

  return app.withConnection(actor, async (client) => {
    // Workspace DOS target — used by combined.stockoutRiskSkus and
    // surfaced to the UI for honest labelling ("vs 30-day target").
    const { rows: wsRows } = await client.query<{
      dos_target: string;
    }>(
      `SELECT dos_target_days::text AS dos_target
         FROM xb_core.workspaces
        WHERE id = $1 AND deleted_at IS NULL`,
      [scope.workspaceId],
    );
    const dosTargetDays = wsRows[0]?.dos_target ?? '30';
    const dosTargetNum = Number(dosTargetDays);

    // ---------- Sales window ------------------------------------------
    // The 30-day window is inclusive: today minus (windowDays-1) days.
    // PostgreSQL handles the date math so timezone drift cannot move
    // the boundary client-side.
    const { rows: salesRows } = await client.query<{
      window_from: Date;
      window_to: Date;
      orders: string;
      units: string;
      revenue: string;
      distinct_skus: string;
      distinct_marketplaces: string;
    }>(
      `WITH win AS (
         SELECT (CURRENT_DATE - ($2::int - 1)) AS f, CURRENT_DATE AS t
       )
       SELECT win.f AS window_from,
              win.t AS window_to,
              COALESCE(count(*), 0)::text AS orders,
              COALESCE(sum(s.quantity), 0)::text AS units,
              COALESCE(sum(s.total_price), 0)::text AS revenue,
              COALESCE(count(DISTINCT s.sku), 0)::text AS distinct_skus,
              COALESCE(count(DISTINCT s.marketplace) FILTER (WHERE s.marketplace IS NOT NULL), 0)::text AS distinct_marketplaces
         FROM win
         LEFT JOIN xb_canonical.sales_orders s
           ON s.workspace_id = $1
          AND s.deleted_at IS NULL
          AND s.order_date >= win.f
          AND s.order_date <= win.t
        GROUP BY win.f, win.t`,
      [scope.workspaceId, windowDays],
    );
    const sRow = salesRows[0]!;
    const orders = Number(sRow.orders);
    const units = Number(sRow.units);
    const revenueText = sRow.revenue;
    const revenueNum = Number(revenueText);
    const sales: DashboardSalesKpis = {
      windowDays,
      orders,
      units,
      revenue: revenueText,
      averageOrderValue: orders > 0 ? (revenueNum / orders).toFixed(4) : null,
      averageSellingPrice: units > 0 ? (revenueNum / units).toFixed(4) : null,
      dailyVelocity: windowDays > 0 ? (units / windowDays).toFixed(4) : null,
      distinctSkus: Number(sRow.distinct_skus),
      distinctMarketplaces: Number(sRow.distinct_marketplaces),
    };
    const salesReadiness: EngineReadiness = orders > 0
      ? { ready: true, reason: null }
      : {
          ready: false,
          reason: 'No sales data in this workspace for the selected window.',
          action: { label: 'Upload sales CSV', href: '/uploads' },
        };

    // ---------- Inventory (latest snapshot per sku+warehouse) ---------
    // Same DISTINCT ON pattern as listInventory so the dashboard tile
    // matches the inventory page row-for-row.
    const { rows: invRows } = await client.query<{
      max_date: Date | null;
      distinct_skus: string;
      distinct_warehouses: string;
      total_on_hand: string;
      total_available: string;
      total_inbound: string;
      total_reserved: string;
      total_valuation: string;
      sku_with_cost: string;
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (sku, warehouse_code)
                sku, warehouse_code, snapshot_date,
                quantity_on_hand, quantity_available, quantity_inbound, quantity_reserved,
                unit_cost
           FROM xb_canonical.inventory_snapshots
          WHERE workspace_id = $1 AND deleted_at IS NULL
          ORDER BY sku, warehouse_code, snapshot_date DESC, id DESC
       )
       SELECT max(snapshot_date) AS max_date,
              COALESCE(count(DISTINCT sku), 0)::text AS distinct_skus,
              COALESCE(count(DISTINCT warehouse_code), 0)::text AS distinct_warehouses,
              COALESCE(sum(quantity_on_hand), 0)::text AS total_on_hand,
              COALESCE(sum(quantity_available), 0)::text AS total_available,
              COALESCE(sum(quantity_inbound), 0)::text AS total_inbound,
              COALESCE(sum(quantity_reserved), 0)::text AS total_reserved,
              COALESCE(sum(unit_cost * quantity_on_hand), 0)::text AS total_valuation,
              COALESCE(count(DISTINCT sku) FILTER (WHERE unit_cost IS NOT NULL), 0)::text AS sku_with_cost
         FROM latest`,
      [scope.workspaceId],
    );
    const iRow = invRows[0]!;
    const distinctSkus = Number(iRow.distinct_skus);
    const skuWithCost = Number(iRow.sku_with_cost);
    const totalOnHand = Number(iRow.total_on_hand);
    const inventory: DashboardInventoryKpis = {
      snapshotDate: iRow.max_date ? iRow.max_date.toISOString().slice(0, 10) : null,
      distinctSkus,
      distinctWarehouses: Number(iRow.distinct_warehouses),
      totalOnHand,
      totalAvailable: Number(iRow.total_available),
      totalInbound: Number(iRow.total_inbound),
      totalReserved: Number(iRow.total_reserved),
      totalValuation: iRow.total_valuation,
      costCoverage: distinctSkus > 0 ? (skuWithCost / distinctSkus).toFixed(4) : '0.0000',
    };
    const inventoryReadiness: EngineReadiness = distinctSkus > 0
      ? { ready: true, reason: null }
      : {
          ready: false,
          reason: 'No inventory snapshot recorded for this workspace.',
          action: { label: 'Upload inventory CSV', href: '/uploads' },
        };

    // ---------- Combined (cross-engine) -------------------------------
    let stockCoverDays: string | null = null;
    if (totalOnHand > 0 && units > 0 && windowDays > 0) {
      const daily = units / windowDays;
      stockCoverDays = (totalOnHand / daily).toFixed(2);
    }

    // Stockout-risk + dead-stock SKU counts. Joins latest inventory
    // against the same-window sales velocity per SKU. SQL keeps every
    // division on the engine, never the client.
    const { rows: combinedRows } = await client.query<{
      risk_skus: string;
      dead_stock_skus: string;
    }>(
      `WITH win AS (
         SELECT (CURRENT_DATE - ($2::int - 1)) AS f, CURRENT_DATE AS t
       ),
       latest_inv AS (
         SELECT DISTINCT ON (sku)
                sku, sum(quantity_on_hand) OVER (PARTITION BY sku) AS on_hand
           FROM xb_canonical.inventory_snapshots, win
          WHERE workspace_id = $1 AND deleted_at IS NULL
          ORDER BY sku, snapshot_date DESC, id DESC
       ),
       sku_velocity AS (
         SELECT s.sku,
                COALESCE(sum(s.quantity), 0)::numeric / NULLIF($2::int, 0) AS daily_units
           FROM xb_canonical.sales_orders s, win
          WHERE s.workspace_id = $1
            AND s.deleted_at IS NULL
            AND s.order_date >= win.f
            AND s.order_date <= win.t
          GROUP BY s.sku
       )
       SELECT
         COALESCE(count(*) FILTER (
           WHERE li.on_hand > 0
             AND sv.daily_units IS NOT NULL
             AND sv.daily_units > 0
             AND (li.on_hand / sv.daily_units) < $3::numeric
         ), 0)::text AS risk_skus,
         COALESCE(count(*) FILTER (
           WHERE li.on_hand > 0
             AND (sv.daily_units IS NULL OR sv.daily_units = 0)
         ), 0)::text AS dead_stock_skus
         FROM latest_inv li
         LEFT JOIN sku_velocity sv ON sv.sku = li.sku`,
      [scope.workspaceId, windowDays, dosTargetNum],
    );
    const cRow = combinedRows[0]!;
    const combined: DashboardCombinedKpis = {
      stockCoverDays,
      stockoutRiskSkus: Number(cRow.risk_skus),
      deadStockSkus: Number(cRow.dead_stock_skus),
    };

    // ---------- Top marketplaces --------------------------------------
    const { rows: mpRows } = await client.query<{
      marketplace: string;
      orders: string;
      units: string;
      revenue: string;
    }>(
      `WITH win AS (
         SELECT (CURRENT_DATE - ($2::int - 1)) AS f, CURRENT_DATE AS t
       )
       SELECT s.marketplace,
              count(*)::text AS orders,
              COALESCE(sum(s.quantity), 0)::text AS units,
              COALESCE(sum(s.total_price), 0)::text AS revenue
         FROM xb_canonical.sales_orders s, win
        WHERE s.workspace_id = $1
          AND s.deleted_at IS NULL
          AND s.marketplace IS NOT NULL
          AND s.order_date >= win.f
          AND s.order_date <= win.t
        GROUP BY s.marketplace
        ORDER BY sum(s.total_price) DESC NULLS LAST
        LIMIT 5`,
      [scope.workspaceId, windowDays],
    );
    const topMarketplaces: MarketplaceBreakdownEntry[] = mpRows.map((m) => {
      const mpRev = Number(m.revenue);
      return {
        marketplace: m.marketplace,
        orders: Number(m.orders),
        units: Number(m.units),
        revenue: m.revenue,
        revenueShare: revenueNum > 0 ? (mpRev / revenueNum).toFixed(4) : '0.0000',
      };
    });

    return {
      workspaceId: scope.workspaceId,
      windowDays,
      window: {
        from: sRow.window_from.toISOString().slice(0, 10),
        to: sRow.window_to.toISOString().slice(0, 10),
      },
      sales,
      salesReadiness,
      inventory,
      inventoryReadiness,
      combined,
      topMarketplaces,
      dosTargetDays,
    };
  });
}

// ----- Advertising engine --------------------------------------------

export interface AdvertisingSummary {
  readonly workspaceId: string;
  readonly windowDays: number;
  readonly readiness: EngineReadiness;
  /**
   * Engine-computed KPIs. All numeric(18,4) text or null when the
   * engine isn't ready. Populated by Slice A3 once the advertising
   * canonical table ships; today every field is null and readiness
   * carries the honest reason.
   */
  readonly kpis: {
    readonly spend: string | null;
    readonly attributedSales: string | null;
    readonly orders: number | null;
    readonly impressions: number | null;
    readonly clicks: number | null;
    readonly ctr: string | null;   // clicks / impressions
    readonly cpc: string | null;   // spend / clicks
    readonly acos: string | null;  // spend / attributed_sales
    readonly tacos: string | null; // spend / total_revenue
    readonly roas: string | null;  // attributed_sales / spend
  };
}

export async function getAdvertisingSummary(
  app: FastifyInstance,
  actor: ActorContext,
  scope: WorkspaceScope,
): Promise<AdvertisingSummary> {
  await requireWorkspaceAccess(app, actor, scope.workspaceId, 'view');
  const windowDays = clampWindow(scope.windowDays);
  // The advertising canonical table isn't yet migrated (see CLAUDE.md
  // §"Next priorities" — engines A3). When it lands the same shape
  // returns populated values; the UI doesn't change.
  return {
    workspaceId: scope.workspaceId,
    windowDays,
    readiness: {
      ready: false,
      reason:
        'Advertising data is not yet ingested. Add the Ads Performance CSV upload type to populate ACOS, TACOS, ROAS, and campaign health.',
      action: { label: 'Open Uploads', href: '/uploads' },
    },
    kpis: {
      spend: null,
      attributedSales: null,
      orders: null,
      impressions: null,
      clicks: null,
      ctr: null,
      cpc: null,
      acos: null,
      tacos: null,
      roas: null,
    },
  };
}

// ----- Unit economics ------------------------------------------------

export interface UnitEconomicsSummary {
  readonly workspaceId: string;
  readonly readiness: EngineReadiness;
  /**
   * SKU-level coverage. Until the dedicated unit economics canonical
   * table ships (landed cost, fees, returns), the engine reports the
   * inputs it has and the share of SKUs ready for full margin
   * calculation. Frontend renders these honestly — no per-unit margin
   * is invented from partial data.
   */
  readonly inputs: {
    readonly totalSkus: number;
    readonly skusWithUnitCost: number;
    readonly skusWithSellingPrice: number;
    /** 0..1 — share of SKUs with both unit cost and a recent selling price. */
    readonly readinessShare: string;
  };
}

export async function getUnitEconomicsSummary(
  app: FastifyInstance,
  actor: ActorContext,
  scope: WorkspaceScope,
): Promise<UnitEconomicsSummary> {
  await requireWorkspaceAccess(app, actor, scope.workspaceId, 'view');
  const windowDays = clampWindow(scope.windowDays);

  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      total_skus: string;
      with_unit_cost: string;
      with_price: string;
      both: string;
    }>(
      `WITH win AS (
         SELECT (CURRENT_DATE - ($2::int - 1)) AS f, CURRENT_DATE AS t
       ),
       inv_skus AS (
         SELECT DISTINCT sku, bool_or(unit_cost IS NOT NULL) AS has_cost
           FROM xb_canonical.inventory_snapshots
          WHERE workspace_id = $1 AND deleted_at IS NULL
          GROUP BY sku
       ),
       sales_skus AS (
         SELECT DISTINCT s.sku
           FROM xb_canonical.sales_orders s, win
          WHERE s.workspace_id = $1
            AND s.deleted_at IS NULL
            AND s.order_date >= win.f
            AND s.order_date <= win.t
            AND s.unit_price > 0
       ),
       all_skus AS (
         SELECT sku FROM inv_skus
         UNION
         SELECT sku FROM sales_skus
       )
       SELECT count(*)::text AS total_skus,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM inv_skus i WHERE i.sku = a.sku AND i.has_cost))::text AS with_unit_cost,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM sales_skus s WHERE s.sku = a.sku))::text AS with_price,
              count(*) FILTER (
                WHERE EXISTS (SELECT 1 FROM inv_skus i WHERE i.sku = a.sku AND i.has_cost)
                  AND EXISTS (SELECT 1 FROM sales_skus s WHERE s.sku = a.sku)
              )::text AS both
         FROM all_skus a`,
      [scope.workspaceId, windowDays],
    );
    const r = rows[0]!;
    const total = Number(r.total_skus);
    const withCost = Number(r.with_unit_cost);
    const withPrice = Number(r.with_price);
    const both = Number(r.both);
    const share = total > 0 ? both / total : 0;
    return {
      workspaceId: scope.workspaceId,
      readiness: total > 0
        ? {
            ready: false,
            reason:
              'Per-unit margin requires landed cost, marketplace fees, and returns. The unit economics engine ships when those inputs are templated.',
          }
        : {
            ready: false,
            reason: 'No SKUs are present in this workspace yet — start with a sales or inventory upload.',
            action: { label: 'Open Uploads', href: '/uploads' },
          },
      inputs: {
        totalSkus: total,
        skusWithUnitCost: withCost,
        skusWithSellingPrice: withPrice,
        readinessShare: share.toFixed(4),
      },
    };
  });
}

// ----- Shipments / replenishment readiness ---------------------------

export interface ShipmentsReadiness {
  readonly workspaceId: string;
  readonly readiness: EngineReadiness;
  readonly preview: {
    readonly skusAtRisk: number;
    readonly skusDeadStock: number;
    readonly dosTargetDays: string;
  };
}

export async function getShipmentsReadiness(
  app: FastifyInstance,
  actor: ActorContext,
  scope: WorkspaceScope,
): Promise<ShipmentsReadiness> {
  await requireWorkspaceAccess(app, actor, scope.workspaceId, 'view');
  // Re-use the dashboard's combined view — the replenishment engine
  // will operate on the same primitives once the shipment/lead-time
  // template ships. Surfacing the inputs today gives operators an
  // honest preview without inventing recommendations.
  const bundle = await getDashboardKpis(app, actor, scope);
  return {
    workspaceId: scope.workspaceId,
    readiness: {
      ready: false,
      reason:
        'Shipment planning needs supplier lead times and a shipments template. The replenishment engine ships in the next slice; the inputs below are the inventory + velocity signals it will consume.',
      action: { label: 'Open Uploads', href: '/uploads' },
    },
    preview: {
      skusAtRisk: bundle.combined.stockoutRiskSkus,
      skusDeadStock: bundle.combined.deadStockSkus,
      dosTargetDays: bundle.dosTargetDays,
    },
  };
}

// ----- Report registry -----------------------------------------------

export interface ReportRegistryEntry {
  readonly key: 'sales' | 'inventory' | 'ads' | 'warehouse_inventory';
  readonly title: string;
  readonly description: string;
  /** True when an engine output exists today; false → "coming soon". */
  readonly available: boolean;
  /** Frontend route for the page that backs the report. */
  readonly href: string;
}

export interface ReportRegistry {
  readonly workspaceId: string;
  readonly reports: ReadonlyArray<ReportRegistryEntry>;
  readonly counts: {
    readonly salesRows: number;
    readonly inventoryRows: number;
    readonly adsRows: number;
  };
}

export async function getReportRegistry(
  app: FastifyInstance,
  actor: ActorContext,
  scope: WorkspaceScope,
): Promise<ReportRegistry> {
  await requireWorkspaceAccess(app, actor, scope.workspaceId, 'view');

  const counts = await app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{
      sales: string;
      inventory: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM xb_canonical.sales_orders
            WHERE workspace_id = $1 AND deleted_at IS NULL) AS sales,
         (SELECT count(*)::text FROM xb_canonical.inventory_snapshots
            WHERE workspace_id = $1 AND deleted_at IS NULL) AS inventory`,
      [scope.workspaceId],
    );
    return rows[0]!;
  });

  const salesRows = Number(counts.sales);
  const inventoryRows = Number(counts.inventory);
  // Ads canonical table not yet migrated — count stays 0 until it ships.
  const adsRows = 0;

  return {
    workspaceId: scope.workspaceId,
    reports: [
      {
        key: 'sales',
        title: 'Sales Report',
        description:
          'Marketplace-blended sales performance over the selected window. Engine-computed: revenue, orders, units, AOV, ASP, per-marketplace share.',
        available: salesRows > 0,
        href: '/sales',
      },
      {
        key: 'inventory',
        title: 'Inventory Report',
        description:
          'Current on-hand, available, inbound, and valuation across warehouses. Latest snapshot per SKU.',
        available: inventoryRows > 0,
        href: '/inventory',
      },
      {
        key: 'ads',
        title: 'Ads Report',
        description:
          'Spend, ACOS, TACOS, ROAS, and campaign health. Ships when the advertising performance template lands.',
        available: adsRows > 0,
        href: '/ppc',
      },
      {
        key: 'warehouse_inventory',
        title: 'Warehouse Inventory',
        description:
          'Per-warehouse breakdown with reserved + inbound visibility. Coming soon — requires the warehouse template.',
        available: false,
        href: '/inventory',
      },
    ],
    counts: {
      salesRows,
      inventoryRows,
      adsRows,
    },
  };
}

// ----- helpers -------------------------------------------------------

function clampWindow(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_WINDOW_DAYS;
  return Math.min(Math.max(Math.trunc(value), 1), 365);
}
