import type {
  MapperInput,
  MapperResult,
  NormalizedAdPerformance,
  UnresolvedRecord,
  UploadMapper,
} from './types.js';
import {
  normalizeMarketplaceCode,
  regionFromMarketplace,
  tryResolve,
} from './helpers.js';

/**
 * Validated row shape from the `amazon-ads` validator.
 */
export interface AmazonAdsRow {
  readonly action: 'add' | 'update' | 'remove';
  readonly uid: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly campaignName: string;
  readonly campaignType: string;
  readonly skuName: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly orders: number;
  readonly totalCost: number;
  readonly sales: number;
  readonly currency: string;
  readonly platform: string;          // 'amazon'
  readonly targetPlatform: string;    // marketplace driven (amazon_us, ...)
  /** Optional attribution window in days [1, 90]; null when not supplied. */
  readonly attributionWindowDays: number | null;
}

/**
 * Amazon ads mapper. Amazon Ads reports key on SKU NAME (the seller's
 * SKU as configured in the campaign), not ASIN. We resolve via
 * alias_type='platform_sku'. When the campaign targets multiple SKUs
 * (Sponsored Brands), the validator may emit rows without a sellable
 * SKU; those rows produce NormalizedAdPerformance with
 * `skuNormalized=null` so engines can still aggregate at the campaign
 * level without losing spend.
 */
export const amazonAdsMapper: UploadMapper<AmazonAdsRow, NormalizedAdPerformance> = {
  kind: 'amazon_ads',
  async map(
    input: MapperInput<AmazonAdsRow>,
  ): Promise<MapperResult<NormalizedAdPerformance>> {
    const mapped: NormalizedAdPerformance[] = [];
    const unresolved: UnresolvedRecord[] = [];
    const ingestedAt = new Date();

    for (let i = 0; i < input.rows.length; i++) {
      const r = input.rows[i]!;
      const rowNumber = i + 2;
      const targetMarketplaceCode = normalizeMarketplaceCode(r.targetPlatform);
      const regionCode = regionFromMarketplace(targetMarketplaceCode);

      // SKU-level campaigns: try to resolve. If the SKU code looks
      // like a campaign aggregate placeholder (empty / "ALL" / "*"),
      // emit as a sku=null row instead of pushing to unresolved.
      const isAggregate = isAggregateSkuLabel(r.skuName);
      let skuNormalized: string | null = null;
      if (!isAggregate) {
        const rr = await tryResolve(
          input.app,
          input.client,
          input.workspaceId,
          'platform_sku',
          r.skuName,
          'amazon',
          targetMarketplaceCode,
          null,
        );
        if (rr.resolved === null) {
          unresolved.push({
            rowNumber,
            aliasType: 'platform_sku',
            aliasValue: r.skuName,
            sourcePlatform: 'amazon',
            sourceMarketplace: targetMarketplaceCode,
            sourceAccount: null,
            reason: rr.reason,
            sourcePayload: { ...r },
          });
          continue;
        }
        skuNormalized = rr.resolved;
      }

      mapped.push({
        skuNormalized,
        campaignName: r.campaignName,
        campaignType: r.campaignType,
        adPlatformCode: 'amazon_ads',
        targetMarketplaceCode,
        regionCode,
        periodStart: r.startDate,
        periodEnd: r.endDate,
        periodGrain: inferGrain(r.startDate, r.endDate),
        impressions: r.impressions,
        clicks: r.clicks,
        attributedOrders: r.orders,
        spend: r.totalCost,
        attributedSales: r.sales,
        currencyCode: r.currency.toUpperCase(),
        // Carried through verbatim, null round-trips to canonical.
        attributionWindowDays: r.attributionWindowDays,
        action: r.action,
        source: {
          platform: 'amazon_ads',
          marketplace: targetMarketplaceCode,
          account: null,
          uploadId: input.uploadId,
          rowNumber,
          rowUid: r.uid,
          reportType: 'ads_report',
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

function isAggregateSkuLabel(s: string): boolean {
  const k = s.trim().toLowerCase();
  return k === '' || k === 'all' || k === '*' || k === 'n/a' || k === 'aggregate';
}

function inferGrain(start: string, end: string): 'day' | 'week' | 'month' {
  if (start === end) return 'day';
  const ms = new Date(end + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime();
  const days = Math.round(ms / 86_400_000) + 1;
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  return 'month';
}
