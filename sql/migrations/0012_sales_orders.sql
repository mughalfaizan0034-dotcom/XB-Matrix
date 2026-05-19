-- 0012 — Canonical sales orders.
-- First per-module canonical table. Produced by the sales validator
-- when an upload of kind='sales' lands; every downstream sales view
-- (dashboard tiles, unit economics, ad-cost attribution) reads from
-- here, never from xb_core.uploads directly.
--
-- Provenance: upload_id FK so we can trace every row back to the file
-- it came from. Deleting an upload would orphan rows — we soft-delete
-- uploads (deleted_at) and leave the canonical rows in place; a future
-- janitor will GC orphans alongside the 90-day purge.

CREATE TABLE IF NOT EXISTS xb_canonical.sales_orders (
  id                       char(26)       PRIMARY KEY,
  organization_id          char(26)       NOT NULL,
  workspace_id             char(26)       NOT NULL,
  upload_id                char(26)       NOT NULL,

  -- Source fields (carried from the upload essentially as-is, just
  -- typed + normalized). Keep order_id loose — different marketplaces
  -- use different ID conventions and we don't want to over-constrain.
  order_id                 varchar(200)   NOT NULL,
  sku                      varchar(200)   NOT NULL,
  quantity                 integer        NOT NULL,
  unit_price               numeric(18, 4) NOT NULL,
  total_price              numeric(18, 4) NOT NULL,
  currency_code            char(3)        NOT NULL,
  order_date               date           NOT NULL,
  marketplace              varchar(80)    NULL,
  channel                  varchar(80)    NULL,

  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),
  deleted_at               timestamptz    NULL,

  created_by_actor_id      char(26)       NULL,

  row_version              integer        NOT NULL DEFAULT 1,

  CONSTRAINT fk_sales_orders_org    FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_sales_orders_ws     FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),
  CONSTRAINT fk_sales_orders_upload FOREIGN KEY (upload_id)       REFERENCES xb_core.uploads(id),

  CONSTRAINT ck_sales_orders_qty       CHECK (quantity > 0),
  CONSTRAINT ck_sales_orders_unit_pos  CHECK (unit_price >= 0),
  CONSTRAINT ck_sales_orders_total_pos CHECK (total_price >= 0),
  CONSTRAINT ck_sales_orders_currency  CHECK (currency_code ~ '^[A-Z]{3}$')
);

-- Hot lookups: workspace + date-range scans are the dominant query
-- pattern for every sales view + aggregation job.
CREATE INDEX IF NOT EXISTS idx_sales_orders_ws_date
  ON xb_canonical.sales_orders (workspace_id, order_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_upload
  ON xb_canonical.sales_orders (upload_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_ws_sku
  ON xb_canonical.sales_orders (workspace_id, sku)
  WHERE deleted_at IS NULL;

-- Same tenant-isolation pattern as workspaces/uploads.
ALTER TABLE xb_canonical.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_canonical.sales_orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_sales_orders_tenant ON xb_canonical.sales_orders;
CREATE POLICY p_sales_orders_tenant ON xb_canonical.sales_orders
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP TRIGGER IF EXISTS trg_sales_orders_row_version ON xb_canonical.sales_orders;
CREATE TRIGGER trg_sales_orders_row_version
  BEFORE UPDATE ON xb_canonical.sales_orders
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

-- Audit is intentionally OFF for canonical rows — at scale a 100k-row
-- upload would write 100k audit rows which inflates xb_audit and adds
-- no signal beyond the parent upload's audit entry. Provenance is
-- already covered by upload_id. Re-enable per-module if we ever need
-- row-level forensics.
