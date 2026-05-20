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
 * Validated row shape produced by `amazon-sales` validator. Mirrors
 * ParsedRow there; duplicated here so the validator and mapper are
 * decoupled at the type level (changing one doesn't ripple).
 */
export interface AmazonSalesRow {
  readonly action: 'upsert' | 'delete';
  readonly uid: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly channel: string;       // raw marketplace label from the upload
  readonly sku: string;            // platform SKU code (Amazon seller SKU)
  readonly sessionsTotal: number;
  readonly sessionsB2b: number;
  readonly ordersTotal: number;
  readonly ordersB2b: number;
  readonly unitsTotal: number;
  readonly unitsB2b: number;
  readonly salesTotal: number;
  readonly salesB2b: number;
  readonly refundsTotal: number;
  readonly refundsB2b: number;
}

/**
 * Amazon sales mapper. Translates Amazon Business Report rows into
 * NormalizedSale entities ready for canonical insertion (channel_sales).
 * Source platform is fixed to 'amazon'; marketplace is derived from
 * the row's `channel` field (Amazon US / CA / UK / …).
 */
export const amazonSalesMapper: UploadMapper<AmazonSalesRow, NormalizedSale> = {
  kind: 'amazon_sales',
  async map(
    input: MapperInput<AmazonSalesRow>,
  ): Promise<MapperResult<NormalizedSale>> {
    const mapped: NormalizedSale[] = [];
    const unresolved: UnresolvedRecord[] = [];
    const ingestedAt = new Date();

    for (let i = 0; i < input.rows.length; i++) {
      const r = input.rows[i]!;
      const rowNumber = i + 2; // 1-based + header row (matches validator)
      const marketplaceCode = normalizeMarketplaceCode(r.channel);
      const regionCode = regionFromMarketplace(marketplaceCode);

      // Resolve the platform SKU into the workspace's normalized SKU.
      // For Amazon sales reports the alias_type is 'platform_sku' (the
      // seller SKU); ASIN-keyed aliases are a separate type used by
      // ads + inventory reports that key on ASIN.
      const r1 = await tryResolve(
        input.app,
        input.client,
        input.workspaceId,
        'platform_sku',
        r.sku,
        'amazon',
        marketplaceCode,
        null,
      );
      if (r1.resolved === null) {
        unresolved.push({
          rowNumber,
          aliasType: 'platform_sku',
          aliasValue: r.sku,
          sourcePlatform: 'amazon',
          sourceMarketplace: marketplaceCode,
          sourceAccount: null,
          reason: r1.reason,
          sourcePayload: { ...r },
        });
        continue;
      }

      mapped.push({
        skuNormalized: r1.resolved,
        marketplaceCode,
        regionCode,
        // Amazon Business Reports are FBA + FBM mixed at the SKU level;
        // we leave fulfillment as null at the sales-row grain.
        // Inventory rows separately carry the fulfillment dimension.
        fulfillmentType: null,
        periodStart: r.startDate,
        periodEnd: r.endDate,
        // Validator's report cadence isn't declared explicitly. Amazon
        // BR is typically daily, but operators upload weekly + monthly
        // rolls. We infer from the period span; engines can re-bucket
        // when summarizing.
        periodGrain: inferGrain(r.startDate, r.endDate),
        sessionsTotal: r.sessionsTotal,
        sessionsB2b: r.sessionsB2b,
        ordersTotal: r.ordersTotal,
        ordersB2b: r.ordersB2b,
        unitsTotal: r.unitsTotal,
        unitsB2b: r.unitsB2b,
        salesTotal: r.salesTotal,
        salesB2b: r.salesB2b,
        refundsTotal: r.refundsTotal,
        refundsB2b: r.refundsB2b,
        // Amazon Business Reports report in marketplace currency; we
        // pick the marketplace default. Currency normalization to a
        // workspace-default lives in the FX engine, not the mapper.
        currencyCode: currencyForMarketplace(marketplaceCode),
        action: r.action,
        source: {
          platform: 'amazon',
          marketplace: marketplaceCode,
          account: null,
          uploadId: input.uploadId,
          rowNumber,
          rowUid: r.uid,
          reportType: 'business_report',
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
  const days = Math.round(ms / 86_400_000) + 1; // inclusive
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  return 'month';
}

function currencyForMarketplace(code: string): string {
  switch (code) {
    case 'amazon_us': return 'USD';
    case 'amazon_ca': return 'CAD';
    case 'amazon_uk': return 'GBP';
    case 'amazon_de': return 'EUR';
    case 'amazon_mx': return 'MXN';
    default: return 'USD';
  }
}
