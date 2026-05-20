-- 0014 — xb_master.sku_aliases — the identity layer for the commerce OS.
--
-- The platform is omnichannel and SKU-centric (CLAUDE.md Part 5). The
-- same product carries different codes on different platforms:
--   Amazon ASIN          B0C123XYZ
--   Amazon seller SKU    WIDGET-A-US-PRIME
--   Walmart item ID      WMT-447721
--   Shopify variant id   gid://shopify/ProductVariant/4982
--   Supplier SKU         SUP-7782
--   Barcode (UPC/EAN)    012345678905
--   Internal SKU         WIDGET-A
--
-- Without this table, every downstream metric double-counts and engines
-- can't safely aggregate. This is foundational; it precedes canonical
-- ingestion + engine work.
--
-- Lookup model: (workspace_id, alias_type, alias_value, source_platform,
--   source_marketplace, source_account) → sku_normalized. Active rows
-- only; soft-delete + is_active flag for audit-friendly history.

CREATE TABLE IF NOT EXISTS xb_master.sku_aliases (
  id                       char(26)       PRIMARY KEY,
  organization_id          char(26)       NOT NULL,
  workspace_id             char(26)       NOT NULL,

  -- The canonical normalized SKU — the operational identity every
  -- downstream layer aggregates on.
  sku_normalized           varchar(200)   NOT NULL,

  -- The alias being mapped TO sku_normalized.
  alias_value              varchar(200)   NOT NULL,
  alias_type               varchar(40)    NOT NULL,

  -- Source context — where the alias came from. Nullable because
  -- universal barcodes (UPC/EAN/GTIN) and internal/supplier SKUs
  -- aren't tied to a marketplace.
  source_platform          varchar(80)    NULL,    -- amazon, walmart, shopify, ...
  source_account           varchar(200)   NULL,    -- specific seller/merchant account
  source_marketplace       varchar(80)    NULL,    -- amazon_us, amazon_uk, shopify, ...
  region_code              varchar(8)     NULL,    -- US, CA, UK
  warehouse_code           varchar(120)   NULL,    -- for warehouse-specific labels

  -- Lifecycle / quality
  is_active                boolean        NOT NULL DEFAULT true,
  source_method            varchar(40)    NOT NULL DEFAULT 'manual',
  -- 0.00 .. 1.00 for non-manual mappings; NULL when source_method='manual'.
  confidence               numeric(3, 2)  NULL,
  notes                    text           NULL,

  -- Standard packs (TIMESTAMPS + SOFT_DELETE + ACTORS + ROW_VERSION)
  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),
  deleted_at               timestamptz    NULL,
  created_by_actor_id      char(26)       NULL,
  updated_by_actor_id      char(26)       NULL,
  deleted_by_actor_id      char(26)       NULL,
  row_version              integer        NOT NULL DEFAULT 1,

  CONSTRAINT fk_sku_aliases_org FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_sku_aliases_ws  FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),

  CONSTRAINT ck_sku_aliases_alias_type CHECK (alias_type IN (
    'platform_sku',    -- the SKU code on a marketplace
    'asin',            -- Amazon ASIN
    'upc',             -- UPC barcode
    'ean',             -- EAN barcode
    'gtin',            -- Global Trade Item Number
    'isbn',            -- books
    'fnsku',           -- Amazon Fulfillment Network SKU
    'supplier_sku',    -- manufacturer/supplier code
    'internal_sku',    -- org's internal identifier
    'warehouse_sku'    -- warehouse-applied label
  )),
  CONSTRAINT ck_sku_aliases_source_method CHECK (source_method IN (
    'manual',          -- user-entered
    'rule',            -- rule-based mapping (regex, etc)
    'fuzzy',           -- fuzzy string match
    'ai_suggested',    -- AI proposal accepted
    'auto_first_seen'  -- auto-created on first upload — needs review
  )),
  CONSTRAINT ck_sku_aliases_confidence CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

-- HOT PATH: given a platform's alias, resolve to sku_normalized.
-- Unique among active rows so the resolver never returns ambiguity.
-- COALESCE pads nulls so the unique constraint treats them as a value
-- (otherwise NULLs are distinct in Postgres unique indexes and we'd
-- allow duplicate (alias_type, alias_value) for the same workspace).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sku_aliases_lookup
  ON xb_master.sku_aliases (
    workspace_id,
    alias_type,
    alias_value,
    COALESCE(source_platform, ''),
    COALESCE(source_marketplace, ''),
    COALESCE(source_account, '')
  )
  WHERE deleted_at IS NULL AND is_active = true;

-- REVERSE LOOKUP: all aliases for a given normalized SKU.
CREATE INDEX IF NOT EXISTS idx_sku_aliases_normalized
  ON xb_master.sku_aliases (workspace_id, sku_normalized)
  WHERE deleted_at IS NULL;

-- BARCODE FAST PATH: scan by barcode without knowing the platform.
CREATE INDEX IF NOT EXISTS idx_sku_aliases_barcode
  ON xb_master.sku_aliases (workspace_id, alias_value)
  WHERE deleted_at IS NULL AND alias_type IN ('upc', 'ean', 'gtin', 'isbn');

-- BROWSE PATTERN: paginated list ordered by recent edits.
CREATE INDEX IF NOT EXISTS idx_sku_aliases_ws_updated
  ON xb_master.sku_aliases (workspace_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- RLS — standard tenant isolation (CLAUDE.md §2.3).
ALTER TABLE xb_master.sku_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_master.sku_aliases FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_sku_aliases_tenant ON xb_master.sku_aliases;
CREATE POLICY p_sku_aliases_tenant ON xb_master.sku_aliases
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP TRIGGER IF EXISTS trg_sku_aliases_row_version ON xb_master.sku_aliases;
CREATE TRIGGER trg_sku_aliases_row_version
  BEFORE UPDATE ON xb_master.sku_aliases
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

-- Audit on alias changes — these mappings drive every downstream metric,
-- so an audit trail is required to debug attribution issues.
DROP TRIGGER IF EXISTS trg_sku_aliases_audit ON xb_master.sku_aliases;
CREATE TRIGGER trg_sku_aliases_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_master.sku_aliases
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();
