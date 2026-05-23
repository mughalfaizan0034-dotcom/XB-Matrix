import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId, WorkspaceId } from '@xb/types';
import type { NormalizedSale } from '../mappers/types.js';

/**
 * Canonical writer for xb_canonical.channel_sales (0020).
 *
 * Consumes NormalizedSale entities, the platform-agnostic shape every
 * sales mapper produces, and upserts them into the canonical table on
 * the natural key. No marketplace-specific code: Amazon, Walmart,
 * Shopify rows all flow through the same writer because they are the
 * same shape by the time they get here.
 *
 * Lifecycle from the `action` column on the source row:
 *   - 'add'    → INSERT, upsert on conflict (operational reality: an
 *                "add" of a key that already exists is a re-upload).
 *   - 'update' → same as add, both upsert on the natural key.
 *   - 'remove' → DELETE on the natural key. Canonical period rows are
 *                not soft-deleted (schema.md §3); a future-replay can
 *                re-INSERT the same key cleanly.
 *
 * Runs inside the upload's transaction client when one is supplied so
 * the canonical insert + the upload status update are atomic. Falls
 * back to the pool for ad-hoc replays.
 */

export interface ChannelSalesWriteStats {
  readonly upserted: number;
  readonly removed: number;
}

export async function writeChannelSales(
  app: FastifyInstance,
  client: PoolClient | null,
  actor: ActorContext,
  organizationId: OrganizationId,
  workspaceId: WorkspaceId,
  uploadId: string,
  rows: ReadonlyArray<NormalizedSale>,
): Promise<ChannelSalesWriteStats> {
  if (rows.length === 0) return { upserted: 0, removed: 0 };
  const runner = client ?? app.pg;
  let upserted = 0;
  let removed = 0;

  // Sequential per-row: files cap at 32 MB so row counts are modest,
  // and preserves intent when a single file mixes add+remove for the
  // same key. Batched VALUES is a future perf knob if very large
  // period files ever land.
  for (const r of rows) {
    if (r.action === 'remove') {
      // IS NOT DISTINCT FROM handles the nullable dimension columns,
      // matching the same NULLS NOT DISTINCT semantics of the natural
      // key index.
      const result = await runner.query(
        `DELETE FROM xb_canonical.channel_sales
          WHERE workspace_id     = $1
            AND sku_normalized   = $2
            AND marketplace_code = $3
            AND channel             IS NOT DISTINCT FROM $4
            AND fulfillment_type    IS NOT DISTINCT FROM $5
            AND region_code         IS NOT DISTINCT FROM $6
            AND period_grain     = $7
            AND period_start     = $8
            AND period_end       = $9
            AND source_platform     IS NOT DISTINCT FROM $10
            AND source_account      IS NOT DISTINCT FROM $11`,
        [
          workspaceId,
          r.skuNormalized,
          r.marketplaceCode,
          r.channel ?? null,
          r.fulfillmentType,
          r.regionCode,
          r.periodGrain,
          r.periodStart,
          r.periodEnd,
          r.source.platform,
          r.source.account,
        ],
      );
      removed += result.rowCount ?? 0;
      continue;
    }

    // 'add' and 'update' both upsert on the natural key. The ON
    // CONFLICT column list matches uq_channel_sales_natural (which is
    // declared NULLS NOT DISTINCT, so nullable dimensions still
    // collide on re-upload).
    await runner.query(
      `INSERT INTO xb_canonical.channel_sales (
         id, organization_id, workspace_id,
         sku_normalized, marketplace_code, channel, fulfillment_type, region_code,
         period_grain, period_start, period_end,
         sessions_total, sessions_b2b, orders_total, orders_b2b,
         units_total, units_b2b, sales_total, sales_b2b,
         refunds_total, refunds_b2b, currency_code,
         source_system, source_platform, source_account,
         upload_id, created_by_actor_id
       ) VALUES (
         $1,  $2,  $3,
         $4,  $5,  $6,  $7,  $8,
         $9,  $10, $11,
         $12, $13, $14, $15,
         $16, $17, $18, $19,
         $20, $21, $22,
         $23, $24, $25,
         $26, $27
       )
       ON CONFLICT (
         workspace_id, sku_normalized, marketplace_code, channel,
         fulfillment_type, region_code, period_grain, period_start, period_end,
         source_platform, source_account
       ) DO UPDATE SET
         sessions_total = EXCLUDED.sessions_total,
         sessions_b2b   = EXCLUDED.sessions_b2b,
         orders_total   = EXCLUDED.orders_total,
         orders_b2b     = EXCLUDED.orders_b2b,
         units_total    = EXCLUDED.units_total,
         units_b2b      = EXCLUDED.units_b2b,
         sales_total    = EXCLUDED.sales_total,
         sales_b2b      = EXCLUDED.sales_b2b,
         refunds_total  = EXCLUDED.refunds_total,
         refunds_b2b    = EXCLUDED.refunds_b2b,
         currency_code  = EXCLUDED.currency_code,
         upload_id      = EXCLUDED.upload_id,
         source_system  = EXCLUDED.source_system,
         updated_at     = now()`,
      [
        ulid(),
        organizationId,
        workspaceId,
        r.skuNormalized,
        r.marketplaceCode,
        r.channel ?? null,
        r.fulfillmentType,
        r.regionCode,
        r.periodGrain,
        r.periodStart,
        r.periodEnd,
        r.sessionsTotal,
        r.sessionsB2b,
        r.ordersTotal,
        r.ordersB2b,
        r.unitsTotal,
        r.unitsB2b,
        r.salesTotal,
        r.salesB2b,
        r.refundsTotal,
        r.refundsB2b,
        r.currencyCode,
        'manual_upload',
        r.source.platform,
        r.source.account,
        uploadId,
        actor.actorId,
      ],
    );
    upserted += 1;
  }

  return { upserted, removed };
}
