import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId, WorkspaceId } from '@xb/types';
import type { NormalizedAdPerformance } from '../mappers/types.js';

/**
 * Canonical writer for xb_canonical.channel_ads (migration 0023).
 *
 * Consumes NormalizedAdPerformance entities — the platform-agnostic
 * shape every ad mapper produces — and upserts them into the canonical
 * table on the natural key. No platform-specific code: Amazon Ads,
 * Walmart Connect, Meta, Google, TikTok rows all flow through the
 * same writer because they are the same shape by the time they get
 * here (the mapper terminated provider-specific parsing).
 *
 * Lifecycle from the `action` column on the source row:
 *   - 'add'    → INSERT, upsert on conflict (re-upload of the same
 *                period at the same attribution window is the
 *                operational reality).
 *   - 'update' → same as add — both upsert on the natural key.
 *   - 'remove' → DELETE on the natural key. Canonical period rows are
 *                not soft-deleted (schema.md §3); a future replay can
 *                re-INSERT the same key cleanly.
 *
 * Runs inside the upload's transaction client when one is supplied so
 * the canonical insert + the upload status update are atomic. Falls
 * back to the pool for ad-hoc replays.
 *
 * NO derivation here. ACOS / TACOS / ROAS / CPC / CTR / CVR are engine
 * outputs (intelligence-service), never persisted on the canonical
 * row. This writer carries the four additive primitives only:
 * impressions, clicks, attributed_orders, spend, attributed_sales.
 *
 * Attribution-window-aware: `attribution_window_days` is part of the
 * natural key, so a single campaign-period can carry distinct rows for
 * 1d / 7d / 14d / 30d. Null windows round-trip to canonical as null.
 */

export interface ChannelAdsWriteStats {
  readonly upserted: number;
  readonly removed: number;
}

export async function writeChannelAds(
  app: FastifyInstance,
  client: PoolClient | null,
  actor: ActorContext,
  organizationId: OrganizationId,
  workspaceId: WorkspaceId,
  uploadId: string,
  rows: ReadonlyArray<NormalizedAdPerformance>,
): Promise<ChannelAdsWriteStats> {
  if (rows.length === 0) return { upserted: 0, removed: 0 };
  const runner = client ?? app.pg;
  let upserted = 0;
  let removed = 0;

  for (const r of rows) {
    if (r.action === 'remove') {
      // IS NOT DISTINCT FROM handles the nullable dimension columns,
      // matching the NULLS NOT DISTINCT semantics of
      // uq_channel_ads_natural in migration 0023.
      const result = await runner.query(
        `DELETE FROM xb_canonical.channel_ads
          WHERE workspace_id            = $1
            AND ad_platform_code        = $2
            AND target_marketplace_code IS NOT DISTINCT FROM $3
            AND region_code             IS NOT DISTINCT FROM $4
            AND campaign_name           IS NOT DISTINCT FROM $5
            AND sku_normalized          IS NOT DISTINCT FROM $6
            AND attribution_window_days IS NOT DISTINCT FROM $7
            AND period_grain            = $8
            AND period_start            = $9
            AND period_end              = $10
            AND source_platform         IS NOT DISTINCT FROM $11
            AND source_account          IS NOT DISTINCT FROM $12`,
        [
          workspaceId,
          r.adPlatformCode,
          r.targetMarketplaceCode,
          r.regionCode,
          r.campaignName,
          r.skuNormalized,
          r.attributionWindowDays,
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
    // CONFLICT column list MUST match uq_channel_ads_natural exactly
    // (which is declared NULLS NOT DISTINCT so nullable dimensions
    // still collide on re-upload).
    //
    // Forward-looking columns (campaign_id, ad_group_id, ad_group_name,
    // ad_id, targeting_type, placement, profile_id, account_code) are
    // intentionally inserted as NULL — the current mapper doesn't carry
    // them. The mapper PR that adds API-level ingestion (SP-API /
    // Walmart Connect API) will populate them; the canonical table is
    // ready for both shapes.
    await runner.query(
      `INSERT INTO xb_canonical.channel_ads (
         id, organization_id, workspace_id,
         ad_platform_code, target_marketplace_code, region_code,
         campaign_name, campaign_type,
         campaign_id, ad_group_id, ad_group_name, ad_id,
         targeting_type, placement, profile_id, account_code,
         sku_normalized,
         attribution_window_days,
         period_grain, period_start, period_end,
         impressions, clicks, attributed_orders, spend, attributed_sales,
         currency_code,
         source_system, source_platform, source_account,
         upload_id, created_by_actor_id
       ) VALUES (
         $1,  $2,  $3,
         $4,  $5,  $6,
         $7,  $8,
         NULL, NULL, NULL, NULL,
         NULL, NULL, NULL, NULL,
         $9,
         $10,
         $11, $12, $13,
         $14, $15, $16, $17, $18,
         $19,
         $20, $21, $22,
         $23, $24
       )
       ON CONFLICT (
         workspace_id, ad_platform_code, target_marketplace_code, region_code,
         campaign_id, campaign_name, ad_group_id, ad_id, targeting_type, placement,
         sku_normalized, attribution_window_days,
         period_grain, period_start, period_end,
         source_platform, source_account
       ) DO UPDATE SET
         campaign_type     = EXCLUDED.campaign_type,
         impressions       = EXCLUDED.impressions,
         clicks            = EXCLUDED.clicks,
         attributed_orders = EXCLUDED.attributed_orders,
         spend             = EXCLUDED.spend,
         attributed_sales  = EXCLUDED.attributed_sales,
         currency_code     = EXCLUDED.currency_code,
         upload_id         = EXCLUDED.upload_id,
         source_system     = EXCLUDED.source_system,
         updated_at        = now()`,
      [
        ulid(),
        organizationId,
        workspaceId,
        r.adPlatformCode,
        r.targetMarketplaceCode,
        r.regionCode,
        r.campaignName,
        r.campaignType,
        r.skuNormalized,
        r.attributionWindowDays,
        r.periodGrain,
        r.periodStart,
        r.periodEnd,
        r.impressions,
        r.clicks,
        r.attributedOrders,
        r.spend,
        r.attributedSales,
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
