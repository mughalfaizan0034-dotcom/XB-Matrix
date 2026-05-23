import type {
  InventoryState,
  MapperInput,
  MapperResult,
  NormalizedInventoryPosition,
  UnresolvedRecord,
  UploadMapper,
} from './types.js';
import {
  normalizeMarketplaceCode,
  regionFromMarketplace,
  tryResolve,
} from './helpers.js';

export interface InventoryPositionRow {
  readonly action: 'add' | 'update' | 'remove';
  readonly uid: string;
  readonly date: string;
  readonly channel: string;
  readonly marketplace: string;   // amazon.com, walmart.com, warehouse, 3pl, retail
  readonly sku: string;
  readonly total: number;
  readonly receiving: number;
  readonly fcTransfer: number;
  readonly reserved: number;
  readonly damaged: number;
}

/**
 * Inventory Position mapper, all-channel. Each input row carries the
 * pool's marketplace + channel + per-state quantities; the mapper
 * decomposes it into up-to-5 NormalizedInventoryPosition rows (one
 * per non-zero state: available / reserved / inbound / transfer /
 * damaged) so engines can compute sellable supply, blended DOS,
 * replenishment, transfer planning, etc. by filtering on state.
 *
 * Inventory pools like 'warehouse', '3pl', 'retail' aren't tied to a
 * marketplace, the marketplace column on those rows IS the pool
 * identity. fulfillmentType is derived from channel + marketplace so
 * engines can answer "what's sellable on Amazon US specifically" vs
 * "what's in inventory globally."
 */
export const inventoryPositionMapper: UploadMapper<
  InventoryPositionRow,
  NormalizedInventoryPosition
> = {
  kind: 'inventory_position',
  async map(
    input: MapperInput<InventoryPositionRow>,
  ): Promise<MapperResult<NormalizedInventoryPosition>> {
    const mapped: NormalizedInventoryPosition[] = [];
    const unresolved: UnresolvedRecord[] = [];
    const ingestedAt = new Date();

    for (let i = 0; i < input.rows.length; i++) {
      const r = input.rows[i]!;
      const rowNumber = i + 2;
      const marketplaceCode = normalizeMarketplaceCode(r.marketplace);
      const regionCode = regionFromMarketplace(marketplaceCode);
      const sourcePlatform = inferSourcePlatform(marketplaceCode);
      const fulfillmentType = inferFulfillment(r.channel, marketplaceCode);
      const inventoryLocationCode = inferLocationCode(r.channel, marketplaceCode);
      const isMarketplacePool = !['warehouse', '3pl', 'retail'].includes(marketplaceCode);

      const rr = await tryResolve(
        input.app,
        input.client,
        input.workspaceId,
        'platform_sku',
        r.sku,
        sourcePlatform,
        isMarketplacePool ? marketplaceCode : null,
        null,
      );
      if (rr.resolved === null) {
        unresolved.push({
          rowNumber,
          aliasType: 'platform_sku',
          aliasValue: r.sku,
          sourcePlatform,
          sourceMarketplace: isMarketplacePool ? marketplaceCode : null,
          sourceAccount: null,
          reason: rr.reason,
          sourcePayload: { ...r },
        });
        continue;
      }
      const skuNormalized = rr.resolved;

      const partitionedSum = r.receiving + r.fcTransfer + r.reserved + r.damaged;
      const available = Math.max(0, r.total - partitionedSum);

      const states: ReadonlyArray<{ state: InventoryState; qty: number }> = [
        { state: 'available', qty: available },
        { state: 'reserved',  qty: r.reserved },
        { state: 'inbound',   qty: r.receiving },
        { state: 'transfer',  qty: r.fcTransfer },
        { state: 'damaged',   qty: r.damaged },
      ];

      for (const { state, qty } of states) {
        if (qty <= 0) continue;
        mapped.push({
          skuNormalized,
          marketplaceCode: isMarketplacePool ? marketplaceCode : null,
          regionCode,
          fulfillmentType,
          inventoryLocationCode,
          inventoryState: state,
          ownership: 'owned',
          quantity: qty,
          positionDate: r.date,
          linkedShipmentId: null,
          action: r.action,
          source: {
            platform: sourcePlatform ?? marketplaceCode,
            marketplace: isMarketplacePool ? marketplaceCode : null,
            account: null,
            uploadId: input.uploadId,
            rowNumber,
            rowUid: r.uid,
            reportType: 'inventory_position',
            ingestedAt,
          },
        });
      }
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

function inferSourcePlatform(marketplaceCode: string): string {
  if (marketplaceCode.startsWith('amazon')) return 'amazon';
  if (marketplaceCode.startsWith('walmart')) return 'walmart';
  if (marketplaceCode === 'shopify') return 'shopify';
  if (marketplaceCode.startsWith('tiktok')) return 'tiktok';
  return marketplaceCode;
}

function inferFulfillment(channel: string, marketplaceCode: string): string {
  const k = channel.trim().toLowerCase();
  if (k === 'fba' || k === 'fbm' || k === 'dtc' || k === '3pl' || k === 'retail') return k;
  // Fallback by marketplace identity
  if (marketplaceCode === '3pl') return '3pl';
  if (marketplaceCode === 'warehouse') return 'owned_warehouse';
  if (marketplaceCode === 'retail') return 'retail';
  return 'fbm';
}

function inferLocationCode(channel: string, marketplaceCode: string): string {
  const region = regionFromMarketplace(marketplaceCode);
  const ch = channel.trim().toLowerCase();
  if (ch === 'fba') return `FBA-${region}`;
  if (marketplaceCode === 'warehouse') return 'WH-DEFAULT';
  if (marketplaceCode === '3pl') return '3PL-DEFAULT';
  if (marketplaceCode === 'retail') return 'RETAIL-DEFAULT';
  return `${marketplaceCode.toUpperCase()}-${region}`;
}
