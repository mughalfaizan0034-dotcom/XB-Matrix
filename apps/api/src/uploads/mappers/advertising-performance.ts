import type {
  MapperInput,
  MapperResult,
  NormalizedAdPerformance,
  UnresolvedRecord,
  UploadMapper,
} from './types.js';
import {
  normalizeAdPlatformCode,
  normalizeMarketplaceCode,
  regionFromMarketplace,
  tryResolve,
} from './helpers.js';

export interface AdvertisingPerformanceRow {
  readonly action: 'add' | 'update' | 'remove';
  readonly uid: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly campaignName: string;
  readonly campaignType: string;
  readonly platform: string;            // amazonads.com, walmartconnect.com, meta.com, ...
  readonly targetMarketplace: string;   // amazon.com, walmart.com, shopify, ...
  readonly skuName: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly orders: number;
  readonly totalCost: number;
  readonly sales: number;
  readonly currency: string;
  /** Optional attribution window in days [1, 90]; null when not supplied. */
  readonly attributionWindowDays: number | null;
}

/**
 * Advertising Performance mapper — all-channel. Each row carries the
 * ad platform AND the target marketplace separately, so the canonical
 * layer can answer:
 *   - blended TACOS across every ad platform (no platform filter)
 *   - TACOS per ad platform (filter by ad_platform_code)
 *   - "off-Amazon spend driving Amazon traffic" (platform=meta_ads,
 *     target=amazon_us)
 *   - cross-attribution between platforms (group by target_marketplace)
 *
 * Aggregate campaigns (sku_name = ALL / * / empty) produce rows with
 * skuNormalized=null so engines still aggregate the spend at the
 * campaign level without falsely attributing it to one SKU.
 */
export const advertisingPerformanceMapper: UploadMapper<
  AdvertisingPerformanceRow,
  NormalizedAdPerformance
> = {
  kind: 'advertising_performance',
  async map(
    input: MapperInput<AdvertisingPerformanceRow>,
  ): Promise<MapperResult<NormalizedAdPerformance>> {
    const mapped: NormalizedAdPerformance[] = [];
    const unresolved: UnresolvedRecord[] = [];
    const ingestedAt = new Date();

    for (let i = 0; i < input.rows.length; i++) {
      const r = input.rows[i]!;
      const rowNumber = i + 2;
      const adPlatformCode = normalizeAdPlatformCode(r.platform);
      const targetMarketplaceCode = normalizeMarketplaceCode(r.targetMarketplace);
      const regionCode = regionFromMarketplace(targetMarketplaceCode);
      const isAggregate = isAggregateSkuLabel(r.skuName);

      let skuNormalized: string | null = null;
      if (!isAggregate) {
        const rr = await tryResolve(
          input.app,
          input.client,
          input.workspaceId,
          'platform_sku',
          r.skuName,
          adPlatformOwner(adPlatformCode),
          targetMarketplaceCode,
          null,
        );
        if (rr.resolved === null) {
          unresolved.push({
            rowNumber,
            aliasType: 'platform_sku',
            aliasValue: r.skuName,
            sourcePlatform: adPlatformOwner(adPlatformCode),
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
        adPlatformCode,
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
        // Carried through verbatim — the mapper does not invent or
        // default a window. Null round-trips to canonical as null.
        attributionWindowDays: r.attributionWindowDays,
        action: r.action,
        source: {
          platform: adPlatformCode,
          marketplace: targetMarketplaceCode,
          account: null,
          uploadId: input.uploadId,
          rowNumber,
          rowUid: r.uid,
          reportType: 'advertising_performance',
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

/**
 * SKU alias scope for an ad platform: aliases registered against the
 * marketplace owner — e.g., Amazon Ads SKUs resolve via 'amazon'
 * source_platform; Walmart Connect via 'walmart'; Meta/Google/TikTok
 * Ads share aliases with the target marketplace operator owns.
 */
function adPlatformOwner(adPlatformCode: string): string {
  switch (adPlatformCode) {
    case 'amazon_ads':      return 'amazon';
    case 'walmart_connect': return 'walmart';
    // Off-marketplace platforms drive into Amazon/Walmart/Shopify;
    // resolve via the target marketplace's seller SKU vocabulary.
    case 'meta_ads':
    case 'google_ads':
    case 'tiktok_ads':      return 'amazon';  // best-effort default
    default:                return adPlatformCode;
  }
}

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
