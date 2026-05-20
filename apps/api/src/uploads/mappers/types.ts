import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { ActorContext, OrganizationId, WorkspaceId } from '@xb/types';
import type { UploadKind } from '../../services/upload-service.js';
import type { AliasType } from '../../services/sku-alias-service.js';

/**
 * Mapping layer — the translator between platform-shaped upload rows
 * (Amazon, Walmart, Shopify, …) and platform-agnostic NormalizedEntity
 * objects. Validators parse + sanity-check the source CSV. Mappers
 * take that validated, platform-shaped data and produce normalized
 * commerce entities the canonical writers + engines consume.
 *
 * Architecture rule (CLAUDE.md Part 4): connector-specific code lives
 * at the ingestion edge — validators + mappers only. After this layer,
 * every downstream layer (canonical, summary, intelligence, UI) is
 * channel-agnostic and reasons about NormalizedEntities.
 *
 * Resolution behavior:
 *   resolveSku(alias_type, alias_value, source_*) → sku_normalized.
 *   When a row's SKU can't be resolved (no alias yet, or ambiguous),
 *   the row is NOT silently dropped. It's parked in the
 *   xb_master.unresolved_sku_rows queue with its full platform-shaped
 *   payload so an operator can fix the alias and replay the mapping.
 *
 * Mappers MUST preserve source metadata on every NormalizedEntity:
 *   source_platform, source_marketplace, source_account, source_upload_id,
 *   source_row_number, source_uid (validator-supplied), ingested_at.
 * Engines and dashboards filter on these to answer "where did this
 * number come from."
 */

export interface MapperInput<TRow> {
  readonly app: FastifyInstance;
  readonly actor: ActorContext;
  /**
   * Optional shared transaction. When the upload pipeline maps inside
   * the same tx that validated the upload, pass it through so the
   * canonical writes + unresolved-queue inserts are atomic with the
   * upload status update. If null, the mapper falls back to the pool.
   */
  readonly client: PoolClient | null;

  readonly organizationId: OrganizationId;
  readonly workspaceId: WorkspaceId;
  readonly uploadId: string;
  readonly uploadKind: UploadKind;

  /**
   * Already-validated, platform-shaped rows. The validator confirms
   * shape + sanity; the mapper assumes every row passed in is well-
   * formed and focuses on translation + SKU resolution.
   */
  readonly rows: ReadonlyArray<TRow>;
}

export interface MapperResult<TEntity> {
  /** Successfully mapped rows — ready for canonical insertion. */
  readonly mapped: ReadonlyArray<TEntity>;
  /** Rows parked in xb_master.unresolved_sku_rows for later replay. */
  readonly unresolved: ReadonlyArray<UnresolvedRecord>;
  /** Bookkeeping for the upload summary. */
  readonly stats: {
    readonly rowsIn: number;
    readonly mappedCount: number;
    readonly unresolvedCount: number;
  };
}

/**
 * What the mapper hands to the unresolved-queue writer. The full
 * platform-shaped row goes into `sourcePayload` so replay is a pure
 * function: same input + new alias → NormalizedEntity.
 */
export interface UnresolvedRecord {
  readonly rowNumber: number;
  readonly aliasType: AliasType;
  readonly aliasValue: string;
  readonly sourcePlatform: string | null;
  readonly sourceMarketplace: string | null;
  readonly sourceAccount: string | null;
  readonly reason: 'no_match' | 'ambiguous' | 'mapping_error';
  readonly sourcePayload: Record<string, unknown>;
}

/**
 * Per-kind mapper. Adding a new connector is two steps: write its
 * validator (ingestion edge) + write its mapper (translation edge).
 * After this layer, downstream code never knows which platform a row
 * came from — it filters on `source_platform` / `source_marketplace`
 * if it wants per-channel slicing.
 */
export interface UploadMapper<TRow, TEntity> {
  readonly kind: UploadKind;
  map(input: MapperInput<TRow>): Promise<MapperResult<TEntity>>;
}

// =====================================================================
// NormalizedEntity contracts — platform-agnostic shapes every connector
// produces and every downstream layer consumes.
// =====================================================================

/**
 * Provenance every NormalizedEntity carries. Lets engines + dashboards
 * answer "which platform / which seller account / which upload
 * produced this number." Encodes CLAUDE.md Part 5's source-metadata
 * requirement.
 */
export interface NormalizedSource {
  readonly platform: string;            // amazon, walmart, shopify, meta_ads, ...
  readonly marketplace: string | null;  // amazon_us, amazon_uk, shopify, walmart_us, ...
  readonly account: string | null;      // seller / merchant account identifier
  readonly uploadId: string;
  readonly rowNumber: number;           // 1-based, matches validator output
  readonly rowUid: string;              // caller-managed unique row id from the upload
  readonly reportType: string | null;   // business_report, inventory_ledger, ads_search_term, ...
  readonly ingestedAt: Date;
}

/**
 * NormalizedSale — period-grain row destined for
 * xb_canonical.channel_sales (Spec 3 / CLAUDE.md Part 5). One row per
 * (sku × marketplace × period × b2b/total split). The b2b split is
 * preserved as separate columns rather than separate rows so engines
 * can aggregate either bucket cheaply.
 */
export interface NormalizedSale {
  readonly skuNormalized: string;
  readonly marketplaceCode: string;          // amazon_us, walmart, shopify, ...
  readonly regionCode: string;               // US, CA, UK, ...
  readonly fulfillmentType: string | null;   // fba, fbm, dtc, 3pl — null when unknown
  readonly periodStart: string;              // YYYY-MM-DD
  readonly periodEnd: string;                // YYYY-MM-DD
  readonly periodGrain: 'day' | 'week' | 'month';

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
  readonly currencyCode: string;             // ISO 4217

  /** Lifecycle: 'add' creates new row, 'update' overwrites by natural key, 'remove' soft-deletes. */
  readonly action: 'add' | 'update' | 'remove';
  readonly source: NormalizedSource;
}

/**
 * NormalizedInventoryPosition — destined for xb_canonical.channel_inventory
 * (CLAUDE.md Part 6). One row per
 * (sku × marketplace × inventory_location × inventory_state × ownership).
 * The validator's Amazon row (total / receiving / fc_transfer / reserved /
 * damaged) splits into multiple NormalizedInventoryPosition entries —
 * one per state — so engines can compute "sellable" by filtering on
 * inventory_state='available'.
 */
export interface NormalizedInventoryPosition {
  readonly skuNormalized: string;
  readonly marketplaceCode: string | null;       // null for warehouse-only
  readonly regionCode: string;
  readonly fulfillmentType: string;              // fba, fbm, 3pl, owned_warehouse, retail
  readonly inventoryLocationCode: string;        // FBA-US, FBA-CA, WH-NJ, 3PL-LAX-01, ...
  readonly inventoryState: InventoryState;
  readonly ownership: 'owned' | 'consigned' | 'partner';
  readonly quantity: number;
  readonly positionDate: string;                 // YYYY-MM-DD
  readonly linkedShipmentId: string | null;      // FK to shipment_tracking when inbound/transfer

  readonly action: 'add' | 'update' | 'remove';
  readonly source: NormalizedSource;
}

export type InventoryState =
  | 'available'
  | 'reserved'
  | 'inbound'
  | 'damaged'
  | 'transfer'
  | 'processing'
  | 'unsellable';

/**
 * NormalizedAdPerformance — destined for xb_canonical.channel_ads
 * (CLAUDE.md Part 4). One row per
 * (sku × ad_platform × campaign × target_marketplace × period). SKU
 * is optional because some campaign types (Sponsored Brands, awareness)
 * don't attribute to a single SKU.
 */
export interface NormalizedAdPerformance {
  readonly skuNormalized: string | null;
  readonly campaignName: string;
  readonly campaignType: string;
  readonly adPlatformCode: string;       // amazon_ads, meta_ads, google_ads, ...
  readonly targetMarketplaceCode: string; // marketplace the spend drove into
  readonly regionCode: string;

  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodGrain: 'day' | 'week' | 'month';

  readonly impressions: number;
  readonly clicks: number;
  readonly attributedOrders: number;
  readonly spend: number;
  readonly attributedSales: number;
  readonly currencyCode: string;

  readonly action: 'add' | 'update' | 'remove';
  readonly source: NormalizedSource;
}

/**
 * Bounded helper: max rows per upload the mapper will park in the
 * unresolved queue. A truly broken upload (e.g., zero aliases set up
 * yet) shouldn't write a million queue rows; cap and let the operator
 * fix the root cause first. Validator stats still record the true
 * unresolvedCount even when not every row is queued.
 */
export const MAX_UNRESOLVED_QUEUE_INSERTS = 5_000;
