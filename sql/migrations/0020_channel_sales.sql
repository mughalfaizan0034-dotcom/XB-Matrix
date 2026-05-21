-- 0020 — Canonical channel sales (period-grain, marketplace-agnostic).
--
-- The operational core for the Sales intelligence engine and every
-- downstream consumer: dashboard KPIs, reports, alerts, AI. Replaces the
-- legacy per-order xb_canonical.sales_orders (0012), which is
-- marketplace-coupled in shape and lacks the dimensional flexibility
-- blended intelligence needs. sales_orders is left in place until
-- sales-service + the dashboard are migrated off it (pipeline.md §8),
-- then dropped in a follow-up.
--
-- Shape: one row per
--   (workspace × SKU × marketplace × channel × fulfillment × region × period).
-- Marketplace/platform is a row-level DIMENSION, never a separate table
-- — the same row set serves blended, marketplace-specific, SKU-specific
-- and warehouse-specific queries via filters/grouping. Metrics carry the
-- total + B2B split from the Sales Performance template.
--
-- Grain: period_grain (day|week|month) + period_start/period_end.
-- Re-uploads of the same period+dimensions UPSERT on the natural key
-- rather than duplicating — canonical period rows are not soft-deleted
-- and carry no row_version (schema.md §3/§4).
--
-- Partitioning: deferred. schema.md targets monthly RANGE partitions on
-- period_start; partitioning is query-transparent, so engines never
-- change when it is added once volume warrants it.

CREATE SCHEMA IF NOT EXISTS xb_canonical;

CREATE TABLE IF NOT EXISTS xb_canonical.channel_sales (
  id                   char(26)       PRIMARY KEY,
  organization_id      char(26)       NOT NULL,
  workspace_id         char(26)       NOT NULL,

  -- Dimensions ------------------------------------------------------
  sku_normalized       varchar(200)   NOT NULL,
  marketplace_code     varchar(80)    NOT NULL,   -- amazon_us | walmart | shopify | ...
  channel              varchar(80)    NULL,
  fulfillment_type     varchar(40)    NULL,       -- fba | fbm | dtc | 3pl | retail
  region_code          varchar(16)    NULL,       -- US | CA | UK | ...

  -- Period grain ----------------------------------------------------
  period_grain         varchar(10)    NOT NULL,   -- day | week | month
  period_start         date           NOT NULL,
  period_end           date           NOT NULL,

  -- Metrics — Sales Performance template, total + B2B split ----------
  sessions_total       bigint         NOT NULL DEFAULT 0,
  sessions_b2b         bigint         NOT NULL DEFAULT 0,
  orders_total         bigint         NOT NULL DEFAULT 0,
  orders_b2b           bigint         NOT NULL DEFAULT 0,
  units_total          bigint         NOT NULL DEFAULT 0,
  units_b2b            bigint         NOT NULL DEFAULT 0,
  sales_total          numeric(18, 4) NOT NULL DEFAULT 0,
  sales_b2b            numeric(18, 4) NOT NULL DEFAULT 0,
  refunds_total        numeric(18, 4) NOT NULL DEFAULT 0,
  refunds_b2b          numeric(18, 4) NOT NULL DEFAULT 0,
  currency_code        char(3)        NOT NULL,

  -- Source metadata -------------------------------------------------
  source_system        varchar(50)    NOT NULL DEFAULT 'manual_upload',
  source_platform      varchar(80)    NULL,       -- amazon | walmart | shopify | ...
  source_account       varchar(120)   NULL,       -- seller / merchant account
  upload_id            char(26)       NULL,

  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now(),
  created_by_actor_id  char(26)       NULL,

  CONSTRAINT fk_channel_sales_org    FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_channel_sales_ws     FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),
  CONSTRAINT fk_channel_sales_upload FOREIGN KEY (upload_id)       REFERENCES xb_core.uploads(id),

  CONSTRAINT ck_channel_sales_grain    CHECK (period_grain IN ('day', 'week', 'month')),
  CONSTRAINT ck_channel_sales_period   CHECK (period_end >= period_start),
  CONSTRAINT ck_channel_sales_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT ck_channel_sales_nonneg   CHECK (
    sessions_total >= 0 AND sessions_b2b >= 0 AND
    orders_total   >= 0 AND orders_b2b   >= 0 AND
    units_total    >= 0 AND units_b2b    >= 0 AND
    sales_total    >= 0 AND sales_b2b    >= 0 AND
    refunds_total  >= 0 AND refunds_b2b  >= 0
  )
);

-- Natural key — re-uploads of the same period+dimensions UPSERT here
-- instead of duplicating. NULLS NOT DISTINCT (PG15+) so nullable
-- dimensions still collide rather than inserting a fresh row each time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_sales_natural
  ON xb_canonical.channel_sales (
    workspace_id, sku_normalized, marketplace_code, channel,
    fulfillment_type, region_code, period_grain, period_start, period_end,
    source_platform, source_account
  ) NULLS NOT DISTINCT;

-- Hot path: workspace + period-range scans drive every engine query.
CREATE INDEX IF NOT EXISTS idx_channel_sales_ws_period
  ON xb_canonical.channel_sales (workspace_id, period_start DESC);

-- SKU-centric diagnostics — one SKU across marketplaces.
CREATE INDEX IF NOT EXISTS idx_channel_sales_ws_sku
  ON xb_canonical.channel_sales (workspace_id, sku_normalized);

-- Provenance.
CREATE INDEX IF NOT EXISTS idx_channel_sales_upload
  ON xb_canonical.channel_sales (upload_id);

-- Tenant isolation — same pattern as every tenant-scoped table.
ALTER TABLE xb_canonical.channel_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_canonical.channel_sales FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_channel_sales_tenant ON xb_canonical.channel_sales;
CREATE POLICY p_channel_sales_tenant ON xb_canonical.channel_sales
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

-- No row_version / soft-delete: canonical period rows are
-- upsert-by-natural-key (schema.md §3/§4). No audit trigger — provenance
-- is upload_id; per-row audit at upload scale is cost without signal.
