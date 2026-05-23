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
 * Row shape from the `sales_performance` validator. Already all-channel:
 * the `marketplace` column lives on every row, so a single file can
 * mix Amazon US + Amazon CA + Walmart + Shopify + TikTok rows.
 */
export interface SalesPerformanceRow {
  readonly action: 'add' | 'update' | 'remove';
  readonly uid: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly channel: string;
  readonly marketplace: string;     // amazon.com, walmart.com, shopify, ...
  readonly sku: string;
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
 * Sales Performance mapper, operates on a normalized all-channel
 * row shape. The marketplace column drives the per-row source
 * platform / marketplace / region derivation; no per-marketplace
 * branching is needed downstream because every row produces the
 * same NormalizedSale contract.
 *
 * Adding a new marketplace = adding a case in normalizeMarketplaceCode
 * (helpers.ts). No mapper changes, no canonical changes, no engine
 * changes.
 */
export const salesPerformanceMapper: UploadMapper<SalesPerformanceRow, NormalizedSale> = {
  kind: 'sales_performance',
  async map(
    input: MapperInput<SalesPerformanceRow>,
  ): Promise<MapperResult<NormalizedSale>> {
    const mapped: NormalizedSale[] = [];
    const unresolved: UnresolvedRecord[] = [];
    const ingestedAt = new Date();

    for (let i = 0; i < input.rows.length; i++) {
      const r = input.rows[i]!;
      const rowNumber = i + 2;
      const marketplaceCode = normalizeMarketplaceCode(r.marketplace);
      const regionCode = regionFromMarketplace(marketplaceCode);
      const sourcePlatform = inferSourcePlatform(marketplaceCode);

      const rr = await tryResolve(
        input.app,
        input.client,
        input.workspaceId,
        'platform_sku',
        r.sku,
        sourcePlatform,
        marketplaceCode,
        null,
      );
      if (rr.resolved === null) {
        unresolved.push({
          rowNumber,
          aliasType: 'platform_sku',
          aliasValue: r.sku,
          sourcePlatform,
          sourceMarketplace: marketplaceCode,
          sourceAccount: null,
          reason: rr.reason,
          sourcePayload: { ...r },
        });
        continue;
      }

      mapped.push({
        skuNormalized: rr.resolved,
        marketplaceCode,
        regionCode,
        // Carry the raw channel label and the normalized fulfillment
        // type independently. Recognized labels (fba/fbm/dtc/3pl/retail)
        // populate fulfillmentType; everything else (wholesale, b2b,
        // …) stays only on channel.
        channel: r.channel?.trim() || null,
        fulfillmentType: normalizeFulfillment(r.channel),
        periodStart: r.startDate,
        periodEnd: r.endDate,
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
        currencyCode: currencyForMarketplace(marketplaceCode),
        action: r.action,
        source: {
          platform: sourcePlatform ?? marketplaceCode,
          marketplace: marketplaceCode,
          account: null,
          uploadId: input.uploadId,
          rowNumber,
          rowUid: r.uid,
          reportType: 'sales_performance',
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
 * Marketplace → source_platform inference. The marketplace identifies
 * the storefront; the source_platform identifies the seller account
 * domain (Amazon, Walmart, Shopify, …). Per-marketplace SKU aliases
 * are scoped by source_platform so engines can distinguish "same
 * code on different platforms" cleanly.
 */
function inferSourcePlatform(marketplaceCode: string): string {
  if (marketplaceCode.startsWith('amazon')) return 'amazon';
  if (marketplaceCode.startsWith('walmart')) return 'walmart';
  if (marketplaceCode === 'shopify') return 'shopify';
  if (marketplaceCode.startsWith('tiktok')) return 'tiktok';
  if (marketplaceCode.startsWith('ebay')) return 'ebay';
  if (marketplaceCode.startsWith('etsy')) return 'etsy';
  return marketplaceCode;
}

function normalizeFulfillment(channel: string): string | null {
  const k = channel.trim().toLowerCase();
  if (k === 'fba' || k === 'fbm' || k === 'dtc' || k === 'retail' || k === '3pl') return k;
  return null;
}

function inferGrain(start: string, end: string): 'day' | 'week' | 'month' {
  if (start === end) return 'day';
  const ms = new Date(end + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime();
  const days = Math.round(ms / 86_400_000) + 1;
  if (days <= 1) return 'day';
  if (days <= 7) return 'week';
  return 'month';
}

function currencyForMarketplace(code: string): string {
  switch (code) {
    case 'amazon_us':
    case 'walmart_us':
    case 'ebay_us':
    case 'etsy_us':
    case 'tiktokshop':
    case 'shopify':       return 'USD';
    case 'amazon_ca':
    case 'walmart_ca':    return 'CAD';
    case 'amazon_uk':
    case 'ebay_uk':       return 'GBP';
    case 'amazon_de':     return 'EUR';
    case 'amazon_mx':     return 'MXN';
    default:              return 'USD';
  }
}
