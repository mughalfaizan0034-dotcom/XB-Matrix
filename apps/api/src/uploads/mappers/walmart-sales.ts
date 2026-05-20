import type {
  MapperInput,
  MapperResult,
  NormalizedSale,
  UnresolvedRecord,
  UploadMapper,
} from './types.js';
import {
  normalizeMarketplaceCode,
  regionFromMarketplace,
  tryResolve,
} from './helpers.js';

/**
 * Validated row shape produced by `walmart-sales` validator. Walmart-
 * native field names live here (item_id, page_views, gmv); the mapper
 * translates them into the marketplace-agnostic NormalizedSale shape.
 * Downstream engines never see "item_id" or "gmv" — they read
 * sessionsTotal, salesTotal, etc., uniformly across every connector.
 */
export interface WalmartSalesRow {
  readonly action: 'upsert' | 'delete';
  readonly uid: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly marketplace: string;     // walmart_us
  readonly itemId: string;          // Walmart item identifier
  readonly gtin: string | null;     // optional secondary identifier
  readonly pageViews: number;       // Walmart's "sessions"
  readonly orders: number;
  readonly units: number;
  readonly gmv: number;             // Walmart's "sales"
  readonly refunds: number;
  readonly currency: string;
}

/**
 * Walmart sales mapper — translates Walmart Item Performance rows
 * into NormalizedSale. The output shape is identical to amazon-sales
 * mapper's output by design — that's the architectural-validation
 * win. Engines, summaries, dashboards, forecasting, and reporting
 * read the same NormalizedSale interface regardless of source.
 *
 * Resolution strategy:
 *   1. Try resolving by item_id as alias_type='platform_sku' with
 *      source_platform='walmart'. This is the primary path.
 *   2. If that misses and we have a gtin, try resolving by gtin as
 *      alias_type='gtin' WITHOUT source context (barcodes are
 *      universal). This is the cross-platform identity bridge — a
 *      product uploaded to Amazon with a UPC alias becomes
 *      automatically resolvable from Walmart too.
 *   3. If both miss, park the row in the unresolved queue keyed on
 *      the item_id attempt (since that's the primary path; the
 *      operator can add either a Walmart platform_sku alias OR a
 *      gtin alias to unblock).
 */
export const walmartSalesMapper: UploadMapper<WalmartSalesRow, NormalizedSale> = {
  kind: 'walmart_sales',
  async map(
    input: MapperInput<WalmartSalesRow>,
  ): Promise<MapperResult<NormalizedSale>> {
    const mapped: NormalizedSale[] = [];
    const unresolved: UnresolvedRecord[] = [];
    const ingestedAt = new Date();

    for (let i = 0; i < input.rows.length; i++) {
      const r = input.rows[i]!;
      const rowNumber = i + 2;
      const marketplaceCode = normalizeMarketplaceCode(r.marketplace);
      const regionCode = regionFromMarketplace(marketplaceCode);

      // Primary: Walmart item_id as platform_sku.
      let resolution = await tryResolve(
        input.app,
        input.client,
        input.workspaceId,
        'platform_sku',
        r.itemId,
        'walmart',
        marketplaceCode,
        null,
      );

      // Fallback: GTIN. Universal barcode — no source context. This
      // is what lets a product mapped via Amazon UPC automatically
      // resolve on Walmart too without re-mapping.
      if (resolution.resolved === null && r.gtin) {
        const gtinResolution = await tryResolve(
          input.app,
          input.client,
          input.workspaceId,
          'gtin',
          r.gtin,
          null,
          null,
          null,
        );
        if (gtinResolution.resolved !== null) {
          resolution = gtinResolution;
        }
      }

      if (resolution.resolved === null) {
        unresolved.push({
          rowNumber,
          aliasType: 'platform_sku',
          aliasValue: r.itemId,
          sourcePlatform: 'walmart',
          sourceMarketplace: marketplaceCode,
          sourceAccount: null,
          reason: 'no_match',
          sourcePayload: { ...r },
        });
        continue;
      }

      mapped.push({
        skuNormalized: resolution.resolved,
        marketplaceCode,
        regionCode,
        // Walmart doesn't report fulfillment at the sales-row grain.
        // Like Amazon's BR, fulfillment is inventory-side; sales rows
        // leave it null and engines aggregate across fulfillment.
        fulfillmentType: null,
        periodStart: r.startDate,
        periodEnd: r.endDate,
        periodGrain: inferGrain(r.startDate, r.endDate),

        // Walmart-native → canonical translation.
        // Walmart has no B2B/total split → B2B columns land as 0.
        // The canonical contract still carries both columns so engines
        // can aggregate uniformly across Amazon (split) + Walmart (zero
        // B2B) without a connector-aware code path.
        sessionsTotal: r.pageViews,
        sessionsB2b: 0,
        ordersTotal: r.orders,
        ordersB2b: 0,
        unitsTotal: r.units,
        unitsB2b: 0,
        salesTotal: r.gmv,
        salesB2b: 0,
        refundsTotal: r.refunds,
        refundsB2b: 0,
        currencyCode: r.currency.toUpperCase(),

        action: r.action,
        source: {
          platform: 'walmart',
          marketplace: marketplaceCode,
          account: null,
          uploadId: input.uploadId,
          rowNumber,
          rowUid: r.uid,
          reportType: 'item_performance',
          ingestedAt,
        },
      });
    }

    return {
      mapped,
      unresolved,
      stats: {
        rowsIn: input.rows.length,
        mappedCount: mapped.length,
        unresolvedCount: unresolved.length,
      },
    };
  },
};

function inferGrain(start: string, end: string): 'day' | 'week' | 'month' {
  if (start === end) return 'day';
  const ms = new Date(end + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime();
  const days = Math.round(ms / 86_400_000) + 1;
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  return 'month';
}
