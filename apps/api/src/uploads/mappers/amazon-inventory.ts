import type {
  MapperInput,
  MapperResult,
  NormalizedInventoryPosition,
  UnresolvedRecord,
  UploadMapper,
  InventoryState,
} from './types.js';
import {
  normalizeMarketplaceCode,
  regionFromMarketplace,
  tryResolve,
} from './helpers.js';

/**
 * Validated row shape from the `amazon-inventory` validator. The
 * upload row carries one combined position; the mapper splits it into
 * one NormalizedInventoryPosition per inventory_state (available,
 * reserved, inbound, transfer, damaged). Engines then aggregate by
 * state via WHERE filters.
 */
export interface AmazonInventoryRow {
  readonly action: 'add' | 'update' | 'remove';
  readonly uid: string;
  readonly date: string;
  readonly channel: string;
  readonly sku: string;
  readonly total: number;
  readonly receiving: number;
  readonly fcTransfer: number;
  readonly reserved: number;
  readonly damaged: number;
}

/**
 * Amazon inventory mapper. Amazon's snapshot row encodes a single
 * SKU's footprint across one FBA pool as a set of partitioned counts
 * (CLAUDE.md Part 6). The mapper:
 *   1. Resolves the platform SKU into sku_normalized.
 *   2. Derives the FBA pool code (FBA-US, FBA-CA, …) from the channel.
 *   3. Computes 'available' = total − (receiving + fc_transfer + reserved + damaged).
 *      Negative result clamps to 0; the validator already sanity-checks
 *      this but defensive clamping keeps mapper output non-negative.
 *   4. Emits up to 5 NormalizedInventoryPosition rows per source row,
 *      one per non-zero state. Zero-count states are skipped to keep
 *      canonical lean, engines treat missing rows as zero anyway.
 */
export const amazonInventoryMapper: UploadMapper<
  AmazonInventoryRow,
  NormalizedInventoryPosition
> = {
  kind: 'amazon_inventory',
  async map(
    input: MapperInput<AmazonInventoryRow>,
  ): Promise<MapperResult<NormalizedInventoryPosition>> {
    const mapped: NormalizedInventoryPosition[] = [];
    const unresolved: UnresolvedRecord[] = [];
    const ingestedAt = new Date();

    for (let i = 0; i < input.rows.length; i++) {
      const r = input.rows[i]!;
      const rowNumber = i + 2;
      const marketplaceCode = normalizeMarketplaceCode(r.channel);
      const regionCode = regionFromMarketplace(marketplaceCode);
      const inventoryLocationCode = `FBA-${regionCode}`;

      const rr = await tryResolve(
        input.app,
        input.client,
        input.workspaceId,
        'platform_sku',
        r.sku,
        'amazon',
        marketplaceCode,
        null,
      );
      if (rr.resolved === null) {
        unresolved.push({
          rowNumber,
          aliasType: 'platform_sku',
          aliasValue: r.sku,
          sourcePlatform: 'amazon',
          sourceMarketplace: marketplaceCode,
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
        { state: 'available',  qty: available },
        { state: 'reserved',   qty: r.reserved },
        { state: 'inbound',    qty: r.receiving },
        { state: 'transfer',   qty: r.fcTransfer },
        { state: 'damaged',    qty: r.damaged },
      ];

      for (const { state, qty } of states) {
        if (qty <= 0) continue;
        mapped.push({
          skuNormalized,
          marketplaceCode,
          regionCode,
          fulfillmentType: 'fba',
          inventoryLocationCode,
          inventoryState: state,
          ownership: 'owned',
          quantity: qty,
          positionDate: r.date,
          linkedShipmentId: null, // wired up when shipments↔inventory link lands
          action: r.action,
          source: {
            platform: 'amazon',
            marketplace: marketplaceCode,
            account: null,
            uploadId: input.uploadId,
            rowNumber,
            rowUid: r.uid,
            reportType: 'inventory_ledger',
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
