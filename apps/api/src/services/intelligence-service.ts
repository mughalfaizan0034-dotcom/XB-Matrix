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

// ----- Engine provenance --------------------------------------------
// Every engine response carries provenance so any operator (or future
// AI insight) can answer "where did this number come from" without
// re-running the engine. Extends the audit-first rule to derived data.
//
// Bumped manually when the engine's computational contract changes in a
// way an AI memory or cached report should invalidate against —
// schema-level changes get a major; new metric or window changes get a
// minor; bug fixes get a patch.

export const ENGINE_VERSION = '0.1.0';

export interface EngineProvenance {
  /** ISO timestamp at which the engine computed this response. */
  readonly computedAt: string;
  /** Distinct xb_core.uploads.id values that fed every canonical row read. */
  readonly sourceUploadIds: ReadonlyArray<string>;
  /** Total canonical rows the engine read while building this response. */
  readonly canonicalRowCount: number;
  /** ENGINE_VERSION at compute time — bumped on contract changes. */
  readonly engineVersion: string;
}

/**
 * Internal accumulator passed through an engine entry point's queries.
 * Each canonical query reports `upload_ids` (array_agg DISTINCT) and a
 * `row_count`; the helpers fold both into one provenance block at the
 * end. Keeping this private so callers can't mutate provenance after
 * the engine emits it.
 */
interface ProvenanceCollector {
  readonly uploadIds: Set<string>;
  rowCount: number;
}

function emptyCollector(): ProvenanceCollector {
  return { uploadIds: new Set<string>(), rowCount: 0 };
}

function recordCanonicalRead(
  collector: ProvenanceCollector,
  uploadIds: ReadonlyArray<string> | null,
  rowCount: number | string,
): void {
  if (uploadIds) {
    for (const id of uploadIds) {
      // Defensive: some drivers serialize NULL into the array as a
      // null entry rather than filtering it.
      if (id != null) collector.uploadIds.add(id);
    }
  }
  const n = typeof rowCount === 'string' ? Number(rowCount) : rowCount;
  if (Number.isFinite(n)) collector.rowCount += n;
}

function finalizeProvenance(c: ProvenanceCollector): EngineProvenance {
  // Sort for stable serialization — downstream consumers (AI memory,
  // diff-of-responses tests) shouldn't churn on insertion order.
  return {
    computedAt: new Date().toISOString(),
    sourceUploadIds: [...c.uploadIds].sort(),
    canonicalRowCount: c.rowCount,
    engineVersion: ENGINE_VERSION,
  };
}

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
  readonly provenance: EngineProvenance;
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
  const provenance = emptyCollector();

  return app.withConnection(actor, async (client) => {
    // Workspace DOS target — used by combined.stockoutRiskSkus and
    // surfaced to the UI for honest labelling ("vs 30-day target").
    // Not a canonical read; doesn't count toward provenance.
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
    //
    // count(s.id) — NOT count(*) — so empty workspaces report 0 orders.
    // The LEFT JOIN from the `win` row produces one synthetic null-s row
    // when nothing matches; count(*) would surface that as orders=1.
    const { rows: salesRows } = await client.query<{
      window_from: Date;
      window_to: Date;
      orders: string;
      units: string;
      revenue: string;
      distinct_skus: string;
      distinct_marketplaces: string;
      row_count: string;
      upload_ids: string[] | null;
    }>(
      `WITH win AS (
         SELECT (CURRENT_DATE - ($2::int - 1)) AS f, CURRENT_DATE AS t
       )
       SELECT win.f AS window_from,
              win.t AS window_to,
              COALESCE(count(s.id), 0)::text AS orders,
              COALESCE(sum(s.quantity), 0)::text AS units,
              COALESCE(sum(s.total_price), 0)::text AS revenue,
              COALESCE(count(DISTINCT s.sku), 0)::text AS distinct_skus,
              COALESCE(count(DISTINCT s.marketplace) FILTER (WHERE s.marketplace IS NOT NULL), 0)::text AS distinct_marketplaces,
              COALESCE(count(s.id), 0)::text AS row_count,
              array_remove(array_agg(DISTINCT s.upload_id), NULL) AS upload_ids
         FROM win
         LEFT JOIN xb_canonical.sales_orders s
           ON s.workspace_id = $1
          AND s.deleted_at IS NULL
          AND s.order_date >= win.f
          AND s.order_date <= win.t
        GROUP BY win.f, win.t`,
      [scope.workspaceId, windowDays],
    );
    recordCanonicalRead(provenance, salesRows[0]?.upload_ids ?? null, salesRows[0]?.row_count ?? 0);
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
      row_count: string;
      upload_ids: string[] | null;
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (sku, warehouse_code)
                sku, warehouse_code, snapshot_date,
                quantity_on_hand, quantity_available, quantity_inbound, quantity_reserved,
                unit_cost, upload_id
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
              COALESCE(count(DISTINCT sku) FILTER (WHERE unit_cost IS NOT NULL), 0)::text AS sku_with_cost,
              COALESCE(count(*), 0)::text AS row_count,
              array_remove(array_agg(DISTINCT upload_id), NULL) AS upload_ids
         FROM latest`,
      [scope.workspaceId],
    );
    recordCanonicalRead(provenance, invRows[0]?.upload_ids ?? null, invRows[0]?.row_count ?? 0);
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
    // Provenance NOTE: combined + top-marketplaces queries re-read the
    // same sales_orders + inventory_snapshots rows the dashboard already
    // accounted for above. Recording them again would double-count the
    // canonical_row_count; we only want each canonical row attributed
    // once per response.
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
      provenance: finalizeProvenance(provenance),
    };
  });
}

// ----- Advertising engine --------------------------------------------

/** Industry-standard attribution window default when none is requested. */
const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 14;

export interface AdvertisingScope extends WorkspaceScope {
  /**
   * Attribution window the engine aggregates against. Defaults to 14
   * (industry-standard reporting window). Engine matches the column
   * value exactly; rows with NULL attribution_window_days are
   * INCLUDED in every window's aggregate (operator's "best available"
   * fallback for sources that don't carry the window). Pass a
   * specific value to pivot — e.g. 7 for performance-marketing,
   * 30 for portfolio rollups.
   */
  readonly attributionWindowDays?: number;
}

export interface AdvertisingPlatformBreakdownEntry {
  readonly adPlatformCode: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly attributedOrders: number;
  /** numeric(18,4) text. */
  readonly spend: string;
  readonly attributedSales: string;
  /** Derived. null when divisor is 0. */
  readonly acos: string | null;
  readonly roas: string | null;
  /** 0..1, 4dp text — share of total ad spend. */
  readonly spendShare: string;
}

export interface AdvertisingKpis {
  readonly spend: string | null;
  readonly attributedSales: string | null;
  readonly orders: number | null;
  readonly impressions: number | null;
  readonly clicks: number | null;
  readonly ctr: string | null;   // clicks / impressions
  readonly cpc: string | null;   // spend / clicks
  readonly acos: string | null;  // spend / attributed_sales
  readonly tacos: string | null; // spend / total marketplace revenue (channel_sales join)
  readonly roas: string | null;  // attributed_sales / spend
  readonly cvr: string | null;   // attributed_orders / clicks
}

export interface AdvertisingSummary {
  readonly workspaceId: string;
  readonly windowDays: number;
  /** Attribution window the engine aggregated against. */
  readonly attributionWindowDays: number;
  /** Window date range, server-computed (avoids client timezone drift). */
  readonly window: { readonly from: string; readonly to: string };
  readonly readiness: EngineReadiness;
  readonly kpis: AdvertisingKpis;
  /** Per-ad-platform breakdown, sorted by spend desc. Empty when not ready. */
  readonly byAdPlatform: ReadonlyArray<AdvertisingPlatformBreakdownEntry>;
  readonly provenance: EngineProvenance;
}

/**
 * Advertising intelligence engine. Reads xb_canonical.channel_ads
 * (migration 0023) for additive primitives, joins xb_canonical.channel_sales
 * for the TACOS denominator, and computes ACOS / ROAS / CPC / CTR / CVR /
 * TACOS server-side. Frontend renders these verbatim; no derived
 * metric ever crosses the wire as a primitive.
 *
 * Window semantics (attribution_window_days):
 *   - Default 14 (industry-standard TACOS reporting).
 *   - When passed explicitly, matches the column exactly.
 *   - NULL rows are INCLUDED in every window's aggregate (operator's
 *     "best available" fallback for sources that don't carry a window).
 *     Once mappers reliably populate the window, this fallback
 *     becomes a no-op.
 *
 * TACOS calculation:
 *   - Numerator: SUM(spend) from channel_ads in the window.
 *   - Denominator: SUM(sales_total) from channel_sales JOINed on
 *     (workspace_id, period_grain, period_start, period_end,
 *      target_marketplace_code ↔ marketplace_code). Marketplace
 *     alignment is intentional — TACOS for off-Amazon spend driving
 *     Amazon should be measured against Amazon revenue, not the
 *     spender's home marketplace.
 */
export async function getAdvertisingSummary(
  app: FastifyInstance,
  actor: ActorContext,
  scope: AdvertisingScope,
): Promise<AdvertisingSummary> {
  await requireWorkspaceAccess(app, actor, scope.workspaceId, 'view');
  const windowDays = clampWindow(scope.windowDays);
  const attributionWindowDays =
    scope.attributionWindowDays && Number.isInteger(scope.attributionWindowDays)
      ? Math.min(Math.max(scope.attributionWindowDays, 1), 90)
      : DEFAULT_ATTRIBUTION_WINDOW_DAYS;
  const provenance = emptyCollector();

  return app.withConnection(actor, async (client) => {
    // ---------- Aggregate ad primitives + TACOS denominator -----------
    // One round trip: CTEs for the period window, the filtered ad rows
    // (matching window or NULL window), and the same-period channel_sales
    // total revenue. All math here is additive; ACOS/ROAS/TACOS/CTR/CPC/CVR
    // are computed in JS from these primitives.
    const { rows: totalsRows } = await client.query<{
      window_from: Date;
      window_to: Date;
      impressions: string;
      clicks: string;
      orders: string;
      spend: string;
      attributed_sales: string;
      row_count: string;
      upload_ids: string[] | null;
      total_revenue: string;
    }>(
      `WITH win AS (
         SELECT (CURRENT_DATE - ($2::int - 1)) AS f, CURRENT_DATE AS t
       ),
       ad_window AS (
         SELECT a.*
           FROM xb_canonical.channel_ads a, win
          WHERE a.workspace_id = $1
            AND a.period_start >= win.f
            AND a.period_end   <= win.t
            AND (a.attribution_window_days = $3::int OR a.attribution_window_days IS NULL)
       ),
       sales_window AS (
         SELECT s.target_marketplace_code AS marketplace_code, s.sales_total
           FROM (
             SELECT cs.marketplace_code AS target_marketplace_code, cs.sales_total
               FROM xb_canonical.channel_sales cs, win
              WHERE cs.workspace_id = $1
                AND cs.period_start >= win.f
                AND cs.period_end   <= win.t
           ) s
       )
       SELECT win.f AS window_from,
              win.t AS window_to,
              COALESCE(sum(a.impressions),       0)::text AS impressions,
              COALESCE(sum(a.clicks),            0)::text AS clicks,
              COALESCE(sum(a.attributed_orders), 0)::text AS orders,
              COALESCE(sum(a.spend),             0)::text AS spend,
              COALESCE(sum(a.attributed_sales),  0)::text AS attributed_sales,
              COALESCE(count(a.id),              0)::text AS row_count,
              array_remove(array_agg(DISTINCT a.upload_id), NULL) AS upload_ids,
              (SELECT COALESCE(sum(sales_total), 0)::text FROM sales_window) AS total_revenue
         FROM win
         LEFT JOIN ad_window a ON true
        GROUP BY win.f, win.t`,
      [scope.workspaceId, windowDays, attributionWindowDays],
    );
    const totals = totalsRows[0]!;
    recordCanonicalRead(provenance, totals.upload_ids, totals.row_count);

    const rowCount = Number(totals.row_count);
    const impressions = Number(totals.impressions);
    const clicks = Number(totals.clicks);
    const orders = Number(totals.orders);
    const spendNum = Number(totals.spend);
    const attributedSalesNum = Number(totals.attributed_sales);
    const totalRevenueNum = Number(totals.total_revenue);

    const readiness: EngineReadiness = rowCount > 0
      ? { ready: true, reason: null }
      : {
          ready: false,
          reason:
            'No advertising data ingested yet. Upload an Ads Performance CSV to populate ACOS, TACOS, ROAS, and campaign health.',
          action: { label: 'Open Uploads', href: '/uploads' },
        };

    const kpis: AdvertisingKpis = rowCount === 0
      ? {
          spend: null, attributedSales: null, orders: null,
          impressions: null, clicks: null,
          ctr: null, cpc: null, acos: null, tacos: null, roas: null, cvr: null,
        }
      : {
          spend: totals.spend,
          attributedSales: totals.attributed_sales,
          orders,
          impressions,
          clicks,
          ctr:   impressions > 0 ? (clicks / impressions).toFixed(4) : null,
          cpc:   clicks      > 0 ? (spendNum / clicks).toFixed(4)    : null,
          acos:  attributedSalesNum > 0 ? (spendNum / attributedSalesNum).toFixed(4) : null,
          tacos: totalRevenueNum    > 0 ? (spendNum / totalRevenueNum).toFixed(4)    : null,
          roas:  spendNum    > 0 ? (attributedSalesNum / spendNum).toFixed(4) : null,
          cvr:   clicks      > 0 ? (orders / clicks).toFixed(4)               : null,
        };

    // ---------- Per-ad-platform breakdown -----------------------------
    // Same window filter; aggregated by ad_platform_code. The frontend
    // renders this verbatim so cross-platform comparison is engine-output
    // (CLAUDE.md three-layer rule).
    const byAdPlatform = rowCount === 0
      ? []
      : await (async () => {
          const { rows } = await client.query<{
            ad_platform_code: string;
            impressions: string;
            clicks: string;
            orders: string;
            spend: string;
            attributed_sales: string;
          }>(
            `WITH win AS (
               SELECT (CURRENT_DATE - ($2::int - 1)) AS f, CURRENT_DATE AS t
             )
             SELECT a.ad_platform_code,
                    sum(a.impressions)::text       AS impressions,
                    sum(a.clicks)::text            AS clicks,
                    sum(a.attributed_orders)::text AS orders,
                    sum(a.spend)::text             AS spend,
                    sum(a.attributed_sales)::text  AS attributed_sales
               FROM xb_canonical.channel_ads a, win
              WHERE a.workspace_id = $1
                AND a.period_start >= win.f
                AND a.period_end   <= win.t
                AND (a.attribution_window_days = $3::int OR a.attribution_window_days IS NULL)
              GROUP BY a.ad_platform_code
              ORDER BY sum(a.spend) DESC NULLS LAST`,
            [scope.workspaceId, windowDays, attributionWindowDays],
          );
          return rows.map<AdvertisingPlatformBreakdownEntry>((p) => {
            const pSpend = Number(p.spend);
            const pSales = Number(p.attributed_sales);
            return {
              adPlatformCode: p.ad_platform_code,
              impressions: Number(p.impressions),
              clicks: Number(p.clicks),
              attributedOrders: Number(p.orders),
              spend: p.spend,
              attributedSales: p.attributed_sales,
              acos: pSales > 0 ? (pSpend / pSales).toFixed(4) : null,
              roas: pSpend > 0 ? (pSales / pSpend).toFixed(4) : null,
              spendShare: spendNum > 0 ? (pSpend / spendNum).toFixed(4) : '0.0000',
            };
          });
        })();

    return {
      workspaceId: scope.workspaceId,
      windowDays,
      attributionWindowDays,
      window: {
        from: totals.window_from.toISOString().slice(0, 10),
        to: totals.window_to.toISOString().slice(0, 10),
      },
      readiness,
      kpis,
      byAdPlatform,
      provenance: finalizeProvenance(provenance),
    };
  });
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
  readonly provenance: EngineProvenance;
}

export async function getUnitEconomicsSummary(
  app: FastifyInstance,
  actor: ActorContext,
  scope: WorkspaceScope,
): Promise<UnitEconomicsSummary> {
  await requireWorkspaceAccess(app, actor, scope.workspaceId, 'view');
  const windowDays = clampWindow(scope.windowDays);
  const provenance = emptyCollector();

  return app.withConnection(actor, async (client) => {
    // Two reads in this query (inventory + sales) — both contribute to
    // provenance. We materialize the upload_ids + row_counts in CTEs
    // alongside the SKU-coverage analysis so it's all one round trip.
    const { rows } = await client.query<{
      total_skus: string;
      with_unit_cost: string;
      with_price: string;
      both: string;
      inv_rows: string;
      sales_rows: string;
      inv_upload_ids: string[] | null;
      sales_upload_ids: string[] | null;
    }>(
      `WITH win AS (
         SELECT (CURRENT_DATE - ($2::int - 1)) AS f, CURRENT_DATE AS t
       ),
       inv_rows AS (
         SELECT sku, unit_cost, upload_id
           FROM xb_canonical.inventory_snapshots
          WHERE workspace_id = $1 AND deleted_at IS NULL
       ),
       inv_skus AS (
         SELECT DISTINCT sku, bool_or(unit_cost IS NOT NULL) AS has_cost
           FROM inv_rows
          GROUP BY sku
       ),
       sales_rows AS (
         SELECT s.sku, s.upload_id
           FROM xb_canonical.sales_orders s, win
          WHERE s.workspace_id = $1
            AND s.deleted_at IS NULL
            AND s.order_date >= win.f
            AND s.order_date <= win.t
            AND s.unit_price > 0
       ),
       sales_skus AS (
         SELECT DISTINCT sku FROM sales_rows
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
              )::text AS both,
              (SELECT count(*)::text FROM inv_rows)   AS inv_rows,
              (SELECT count(*)::text FROM sales_rows) AS sales_rows,
              (SELECT array_remove(array_agg(DISTINCT upload_id), NULL) FROM inv_rows)   AS inv_upload_ids,
              (SELECT array_remove(array_agg(DISTINCT upload_id), NULL) FROM sales_rows) AS sales_upload_ids
         FROM all_skus a`,
      [scope.workspaceId, windowDays],
    );
    const r = rows[0]!;
    recordCanonicalRead(provenance, r.inv_upload_ids, r.inv_rows);
    recordCanonicalRead(provenance, r.sales_upload_ids, r.sales_rows);

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
      provenance: finalizeProvenance(provenance),
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
  readonly provenance: EngineProvenance;
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
  // Shipments delegates entirely to the dashboard's combined view, so
  // the provenance the dashboard already computed IS the provenance
  // shipments would compute. Forwarding it directly preserves source
  // upload attribution without re-reading canonical.
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
    provenance: bundle.provenance,
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
  readonly provenance: EngineProvenance;
}

export async function getReportRegistry(
  app: FastifyInstance,
  actor: ActorContext,
  scope: WorkspaceScope,
): Promise<ReportRegistry> {
  await requireWorkspaceAccess(app, actor, scope.workspaceId, 'view');
  const provenance = emptyCollector();

  const counts = await app.withConnection(actor, async (client) => {
    // Canonical row counts that drive the report availability flags.
    // channel_ads is now in-scope (migration 0023 shipped); empty until
    // the validator/mapper writer wire-up lands as its own atomic slice.
    const { rows } = await client.query<{
      sales: string;
      inventory: string;
      ads: string;
      sales_uploads: string[] | null;
      inventory_uploads: string[] | null;
      ads_uploads: string[] | null;
    }>(
      `SELECT
         (SELECT count(*)::text FROM xb_canonical.sales_orders
            WHERE workspace_id = $1 AND deleted_at IS NULL) AS sales,
         (SELECT count(*)::text FROM xb_canonical.inventory_snapshots
            WHERE workspace_id = $1 AND deleted_at IS NULL) AS inventory,
         (SELECT count(*)::text FROM xb_canonical.channel_ads
            WHERE workspace_id = $1) AS ads,
         (SELECT array_remove(array_agg(DISTINCT upload_id), NULL)
            FROM xb_canonical.sales_orders
            WHERE workspace_id = $1 AND deleted_at IS NULL) AS sales_uploads,
         (SELECT array_remove(array_agg(DISTINCT upload_id), NULL)
            FROM xb_canonical.inventory_snapshots
            WHERE workspace_id = $1 AND deleted_at IS NULL) AS inventory_uploads,
         (SELECT array_remove(array_agg(DISTINCT upload_id), NULL)
            FROM xb_canonical.channel_ads
            WHERE workspace_id = $1) AS ads_uploads`,
      [scope.workspaceId],
    );
    return rows[0]!;
  });

  recordCanonicalRead(provenance, counts.sales_uploads, counts.sales);
  recordCanonicalRead(provenance, counts.inventory_uploads, counts.inventory);
  recordCanonicalRead(provenance, counts.ads_uploads, counts.ads);

  const salesRows = Number(counts.sales);
  const inventoryRows = Number(counts.inventory);
  const adsRows = Number(counts.ads);

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
    provenance: finalizeProvenance(provenance),
  };
}

// ----- helpers -------------------------------------------------------

function clampWindow(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_WINDOW_DAYS;
  return Math.min(Math.max(Math.trunc(value), 1), 365);
}
