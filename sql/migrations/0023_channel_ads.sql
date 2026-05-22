-- 0023 — Canonical channel ads (period-grain, channel-agnostic).
--
-- Sibling to xb_canonical.channel_sales (0020). Backs the
-- `advertising_performance` upload kind whose validator + mapper have
-- already shipped (apps/api/src/uploads/{validators,mappers}/
-- advertising-performance.ts, amazon-ads.ts); their mapper emits the
-- NormalizedAdPerformance shape pointed at this exact table. The
-- validator records the note "canonical insertion into channel_ads
-- lands when Spec 3 §10.9+ DDL ships" — this is that DDL.
--
-- Shape: one period-aggregated row per
--   (workspace × ad_platform × target_marketplace × region × campaign
--    × ad_group × sku × attribution_window × period).
-- ad_platform is the spender (amazon_ads / meta_ads / google_ads / …);
-- target_marketplace is what the spend drove into (amazon_us / walmart
-- / shopify). Keeping them as separate dimensions means the engine
-- can answer "off-Amazon spend driving Amazon traffic" (platform=
-- meta_ads, target=amazon_us) without inventing a new join.
--
-- Architectural commitments (project_next_intelligence_phase memory):
--
--   1. ADDITIVE PRIMITIVES ONLY. impressions, clicks, attributed_orders,
--      spend, attributed_sales, currency_code. NO derived metrics —
--      ACOS, ROAS, CPC, CTR, CVR, TACOS are engine outputs computed
--      in intelligence-service. Storing them invites drift between
--      what's persisted and what the engine recomputes.
--
--   2. ATTRIBUTION-AWARE GRAIN. Amazon (and others) emit the same
--      campaign-period at 1d / 7d / 14d / 30d windows; collapsing
--      them bakes a connector decision into the warehouse the engine
--      can't undo. attribution_window_days is a first-class dimension
--      so the engine pivots per analysis (TACOS over 14d, ROAS over
--      7d, …). Nullable so existing mappers (which don't yet carry
--      the window) keep inserting cleanly until the mapper PR adds it.
--
--   3. PROVIDER-AGNOSTIC NAMING. Amazon's `attributedSales14d`,
--      `purchases7d`, `clicks_1d` terminate inside the mapper layer.
--      Canonical columns are channel-agnostic.
--
--   4. IMMUTABLE CANONICAL. Re-uploads of the same period+dimensions
--      UPSERT on the natural key. No row_version, no soft-delete
--      (matches channel_sales / schema.md §3-§4). Reconciliation
--      metadata layers in a separate table keyed by
--      (natural_key, upload_id) — the canonical row itself never
--      carries mutable reconciliation state.
--
--   5. UPLOAD/SOURCE TRACEABILITY. upload_id + source_system +
--      source_platform + source_account on every row so the
--      provenance block in /v1/intelligence/* responses can answer
--      "where did this number come from" deterministically.
--
-- Partitioning: deferred (mirrors channel_sales). schema.md targets
-- monthly RANGE partitions on period_start; query-transparent so the
-- engine never changes when partitioning lands.

CREATE SCHEMA IF NOT EXISTS xb_canonical;

CREATE TABLE IF NOT EXISTS xb_canonical.channel_ads (
  id                       char(26)       PRIMARY KEY,
  organization_id          char(26)       NOT NULL,
  workspace_id             char(26)       NOT NULL,

  -- Channel dimensions — names match NormalizedAdPerformance --------
  -- ad_platform_code: provider class — amazon_ads | walmart_connect |
  -- meta_ads | google_ads | tiktok_ads | pinterest_ads | …
  ad_platform_code         varchar(40)    NOT NULL,
  -- target_marketplace_code: what the spend drove into (amazon_us,
  -- walmart, shopify). NULL for cross-marketplace brand campaigns.
  target_marketplace_code  varchar(80)    NULL,
  region_code              varchar(16)    NULL,

  -- Campaign hierarchy ----------------------------------------------
  -- Existing mapper extracts campaign_name + campaign_type. The
  -- *_id / ad_group / ad columns are forward-looking — populated
  -- when richer API ingestion (SP-API, Walmart Connect API) lands.
  -- Engine queries filter by NULL-vs-NOT-NULL to pick the right grain.
  campaign_name            varchar(400)   NULL,
  campaign_type            varchar(80)    NULL,
  campaign_id              varchar(160)   NULL,
  ad_group_id              varchar(160)   NULL,
  ad_group_name            varchar(400)   NULL,
  ad_id                    varchar(160)   NULL,
  targeting_type           varchar(40)    NULL,    -- auto | manual | audience | …
  placement                varchar(80)    NULL,    -- top_of_search | product_page | …

  -- Product --------------------------------------------------------
  -- NULL when the ad doesn't attribute to a single SKU (Sponsored
  -- Brands, awareness, campaign-level aggregates). Engines aggregate
  -- spend at the campaign level without falsely attributing to a SKU.
  sku_normalized           varchar(200)   NULL,

  -- Attribution window — the dimension that makes Amazon honest ----
  -- Standard channel windows: 1, 7, 14, 30. Some channels run longer
  -- (90 view-through on Meta). NULL allowed for the legacy mapper
  -- shape that doesn't carry the window yet; the mapper PR adding
  -- window extraction is a separate atomic slice.
  attribution_window_days  smallint       NULL,

  -- Period grain ---------------------------------------------------
  period_grain             varchar(10)    NOT NULL,    -- day | week | month
  period_start             date           NOT NULL,
  period_end               date           NOT NULL,

  -- ADDITIVE PRIMITIVES ONLY ---------------------------------------
  -- Engine computes ACOS = spend / attributed_sales,
  -- ROAS = attributed_sales / spend, CPC = spend / clicks,
  -- CTR = clicks / impressions, CVR = attributed_orders / clicks,
  -- TACOS = spend / (joined channel_sales revenue). None of those
  -- live here.
  impressions              bigint         NOT NULL DEFAULT 0,
  clicks                   bigint         NOT NULL DEFAULT 0,
  attributed_orders        bigint         NOT NULL DEFAULT 0,
  spend                    numeric(18, 4) NOT NULL DEFAULT 0,
  attributed_sales         numeric(18, 4) NOT NULL DEFAULT 0,
  currency_code            char(3)        NOT NULL,

  -- Source metadata (provenance) -----------------------------------
  source_system            varchar(50)    NOT NULL DEFAULT 'manual_upload',
  source_platform          varchar(80)    NULL,        -- amazon | walmart | meta | google | tiktok | …
  source_account           varchar(120)   NULL,
  upload_id                char(26)       NULL,

  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),
  created_by_actor_id      char(26)       NULL,

  CONSTRAINT fk_channel_ads_org    FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_channel_ads_ws     FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),
  CONSTRAINT fk_channel_ads_upload FOREIGN KEY (upload_id)       REFERENCES xb_core.uploads(id),

  CONSTRAINT ck_channel_ads_grain      CHECK (period_grain IN ('day', 'week', 'month')),
  CONSTRAINT ck_channel_ads_period     CHECK (period_end >= period_start),
  -- NULL passes the CHECK; populated values constrained 1..90 to
  -- catch unit errors (someone sending '14d' as 14000 or 0).
  CONSTRAINT ck_channel_ads_window     CHECK (
    attribution_window_days IS NULL
    OR (attribution_window_days > 0 AND attribution_window_days <= 90)
  ),
  CONSTRAINT ck_channel_ads_currency   CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_channel_ads_nonneg     CHECK (
    impressions       >= 0 AND
    clicks            >= 0 AND
    attributed_orders >= 0 AND
    spend             >= 0 AND
    attributed_sales  >= 0
  ),
  -- Engagement sanity — clicks can't exceed impressions in the same
  -- row. NOTE: we deliberately do NOT constrain attributed_orders /
  -- attributed_sales relative to clicks; attribution carries across
  -- periods (a day-1 click can attribute an order on day 7, landing
  -- in a different period row), so the cross-row relationship is the
  -- engine's job, not a per-row CHECK.
  CONSTRAINT ck_channel_ads_engagement CHECK (clicks <= impressions)
);

-- Natural key — re-uploads of the same period+dimensions UPSERT here
-- instead of duplicating. NULLS NOT DISTINCT (PG15+) so nullable
-- dimensions still collide. The window is part of the key so a
-- single campaign-period can carry distinct rows for 1d / 7d / 14d /
-- 30d. Mirrors channel_sales uq_channel_sales_natural posture.
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_ads_natural
  ON xb_canonical.channel_ads (
    workspace_id, ad_platform_code, target_marketplace_code, region_code,
    campaign_id, campaign_name, ad_group_id, ad_id, targeting_type, placement,
    sku_normalized, attribution_window_days,
    period_grain, period_start, period_end,
    source_platform, source_account
  ) NULLS NOT DISTINCT;

-- Hot path: workspace + period-range scans drive every engine query.
-- Same shape as channel_sales so the planner picks parallel plans
-- when the engine joins ads + sales on (workspace, period).
CREATE INDEX IF NOT EXISTS idx_channel_ads_ws_period
  ON xb_canonical.channel_ads (workspace_id, period_start DESC);

-- Channel comparison — group spend / sales by ad platform.
CREATE INDEX IF NOT EXISTS idx_channel_ads_ws_platform
  ON xb_canonical.channel_ads (workspace_id, ad_platform_code, period_start DESC);

-- Cross-channel SKU intelligence (joins to channel_sales by sku_normalized).
CREATE INDEX IF NOT EXISTS idx_channel_ads_ws_sku
  ON xb_canonical.channel_ads (workspace_id, sku_normalized, period_start DESC)
  WHERE sku_normalized IS NOT NULL;

-- Campaign-centric drilldown — pick a campaign, scan its history.
-- Partial index keeps it lean when many rows are SKU-level only.
CREATE INDEX IF NOT EXISTS idx_channel_ads_ws_campaign
  ON xb_canonical.channel_ads (workspace_id, campaign_name, period_start DESC)
  WHERE campaign_name IS NOT NULL;

-- Provenance — used by the engine's provenance block + audit answers.
CREATE INDEX IF NOT EXISTS idx_channel_ads_upload
  ON xb_canonical.channel_ads (upload_id);

-- Tenant isolation — identical RLS posture to every tenant-scoped table.
ALTER TABLE xb_canonical.channel_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_canonical.channel_ads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_channel_ads_tenant ON xb_canonical.channel_ads;
CREATE POLICY p_channel_ads_tenant ON xb_canonical.channel_ads
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

-- No row_version / soft-delete / audit trigger: canonical period rows
-- are upsert-by-natural-key (schema.md §3/§4). Provenance is upload_id;
-- per-row audit at upload scale is cost without signal. Reconciliation
-- metadata (paid / corrected / superseded) lives in a separate table
-- in a follow-up migration, never on the canonical row itself.
