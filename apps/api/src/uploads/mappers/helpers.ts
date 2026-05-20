import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { ulid } from 'ulid';
import type { ActorContext, OrganizationId, WorkspaceId } from '@xb/types';
import { resolveSku, type AliasType } from '../../services/sku-alias-service.js';
import type { UnresolvedRecord } from './types.js';
import { MAX_UNRESOLVED_QUEUE_INSERTS } from './types.js';
import type { UploadKind } from '../../services/upload-service.js';

/**
 * Shared helper every connector mapper uses to translate a platform-
 * shaped SKU code into the canonical normalized SKU. Wraps resolveSku()
 * with a stable result shape so mappers can early-exit into the
 * unresolved queue uniformly.
 *
 * On miss: returns `{ resolved: null, reason: 'no_match' }` and the
 * mapper appends an UnresolvedRecord. On hit: returns the
 * sku_normalized string. We don't attempt fuzzy or auto-create here —
 * those policies live in the alias service and are explicit operator
 * actions, not silent mapper side-effects.
 */
export async function tryResolve(
  app: FastifyInstance,
  client: PoolClient | null,
  workspaceId: WorkspaceId,
  aliasType: AliasType,
  aliasValue: string,
  sourcePlatform: string | null,
  sourceMarketplace: string | null,
  sourceAccount: string | null,
): Promise<{ resolved: string; reason: null } | { resolved: null; reason: 'no_match' }> {
  const sku = await resolveSku(app, client, {
    workspaceId,
    aliasType,
    aliasValue,
    sourcePlatform,
    sourceMarketplace,
    sourceAccount,
  });
  if (sku === null) return { resolved: null, reason: 'no_match' };
  return { resolved: sku, reason: null };
}

/**
 * Marketplace / channel inference. Source uploads label the channel
 * in different ways ("Amazon US", "amazon_us", "ATVPDKIKX0DER" — the
 * Amazon US marketplace id). The mapper normalizes to the canonical
 * marketplace_code used across xb_canonical.* tables.
 *
 * Unknown values pass through normalized to snake_case so downstream
 * grouping still works; an operator can later add a proper mapping
 * rule. We never throw — translation is best-effort by design.
 */
export function normalizeMarketplaceCode(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, '_');

  // Canonical .com-style vocabulary (2026-05-20 omnichannel direction).
  // Templates use these values; mapper normalizes to internal codes
  // so downstream canonical tables stay stable.
  switch (k) {
    case 'amazon':
    case 'amazon.com':
    case 'amazon_us':
    case 'atvpdkikx0der':       return 'amazon_us';
    case 'amazon.ca':
    case 'amazon_ca':
    case 'a2eufneub5z2v':       return 'amazon_ca';
    case 'amazon.co.uk':
    case 'amazon_uk':
    case 'amazon_gb':
    case 'a1f83g8c2aro7p':      return 'amazon_uk';
    case 'amazon.de':
    case 'amazon_de':
    case 'a1pa6795ukmfr9':      return 'amazon_de';
    case 'amazon.com.mx':
    case 'amazon_mx':
    case 'a1am78c64um0y8':      return 'amazon_mx';
    case 'walmart':
    case 'walmart.com':
    case 'walmart_us':          return 'walmart_us';
    case 'walmart.ca':
    case 'walmart_ca':          return 'walmart_ca';
    case 'shopify':             return 'shopify';
    case 'tiktokshop':
    case 'tiktok_shop':         return 'tiktokshop';
    case 'ebay.com':
    case 'ebay_us':             return 'ebay_us';
    case 'ebay.co.uk':
    case 'ebay_uk':             return 'ebay_uk';
    case 'etsy.com':
    case 'etsy_us':             return 'etsy_us';
    case 'warehouse':           return 'warehouse';
    case '3pl':                 return '3pl';
    case 'retail':              return 'retail';
    default:                    return k; // unknown → snake_case passthrough
  }
}

/**
 * Ad-platform canonical code. Templates use the user-facing
 * vocabulary (amazonads.com, walmartconnect.com, meta.com,
 * googleads.com, tiktokads.com); mapper normalizes to short stable
 * codes used by xb_canonical.channel_ads + engines.
 */
export function normalizeAdPlatformCode(raw: string): string {
  const k = raw.trim().toLowerCase().replace(/\s+/g, '_');
  switch (k) {
    case 'amazon':
    case 'amazon_ads':
    case 'amazonads':
    case 'amazonads.com':       return 'amazon_ads';
    case 'walmart_connect':
    case 'walmartconnect':
    case 'walmartconnect.com':  return 'walmart_connect';
    case 'meta':
    case 'meta_ads':
    case 'meta.com':
    case 'facebook_ads':        return 'meta_ads';
    case 'google':
    case 'google_ads':
    case 'googleads':
    case 'googleads.com':       return 'google_ads';
    case 'tiktok':
    case 'tiktok_ads':
    case 'tiktokads':
    case 'tiktokads.com':       return 'tiktok_ads';
    default:                    return k;
  }
}

/**
 * Region code derived from marketplace. Engines aggregate by region
 * (e.g., "all US sales across Amazon + Shopify + Walmart") so this
 * needs to be honest even when the marketplace is DTC.
 */
export function regionFromMarketplace(marketplaceCode: string): string {
  if (marketplaceCode.endsWith('_us') || marketplaceCode === 'amazon_us') return 'US';
  if (marketplaceCode.endsWith('_ca') || marketplaceCode === 'amazon_ca') return 'CA';
  if (marketplaceCode.endsWith('_uk') || marketplaceCode === 'amazon_uk') return 'UK';
  if (marketplaceCode.endsWith('_de') || marketplaceCode === 'amazon_de') return 'DE';
  if (marketplaceCode.endsWith('_mx') || marketplaceCode === 'amazon_mx') return 'MX';
  if (marketplaceCode.endsWith('_fr')) return 'FR';
  if (marketplaceCode.endsWith('_jp')) return 'JP';
  if (marketplaceCode.endsWith('_au')) return 'AU';
  // Default — operator can override via channel mapping rules later.
  return 'US';
}

/**
 * Persist unresolved-SKU records inside the same tx (or pool) as the
 * mapper run. Bounded by MAX_UNRESOLVED_QUEUE_INSERTS so a truly
 * broken upload doesn't write millions of queue rows. When the cap is
 * hit, mapper stats still report the real count.
 */
export async function writeUnresolvedQueue(
  app: FastifyInstance,
  client: PoolClient | null,
  actor: ActorContext,
  organizationId: OrganizationId,
  workspaceId: WorkspaceId,
  uploadId: string,
  uploadKind: UploadKind,
  records: ReadonlyArray<UnresolvedRecord>,
): Promise<{ inserted: number; truncated: boolean }> {
  if (records.length === 0) return { inserted: 0, truncated: false };
  const runner = client ?? app.pg;
  const capped = records.slice(0, MAX_UNRESOLVED_QUEUE_INSERTS);
  const truncated = records.length > capped.length;

  // Batched single-statement INSERT. Each row only carries primitives
  // + a jsonb payload, so building one VALUES list per call is fine
  // (records is already bounded).
  const values: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  for (const r of capped) {
    values.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::jsonb, $${p++})`,
    );
    params.push(
      ulid(),                                  // id
      organizationId,                          // organization_id
      workspaceId,                             // workspace_id
      uploadId,                                // upload_id
      uploadKind,                              // upload_kind
      r.rowNumber,                             // row_number
      r.aliasType,                             // alias_type
      r.aliasValue,                            // alias_value
      r.sourcePlatform,                        // source_platform
      r.sourceMarketplace,                     // source_marketplace
      r.sourceAccount,                         // source_account
      r.reason,                                // reason
      JSON.stringify(r.sourcePayload),         // source_payload (jsonb)
      actor.actorId,                           // created_by_actor_id
    );
  }
  await runner.query(
    `INSERT INTO xb_master.unresolved_sku_rows
       (id, organization_id, workspace_id, upload_id, upload_kind,
        row_number, alias_type, alias_value,
        source_platform, source_marketplace, source_account,
        reason, source_payload, created_by_actor_id)
     VALUES ${values.join(', ')}
     ON CONFLICT DO NOTHING`,
    params,
  );
  return { inserted: capped.length, truncated };
}
