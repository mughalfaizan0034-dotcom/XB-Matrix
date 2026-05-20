-- 0013 — Canonical inventory snapshots.
-- Second per-module canonical table after sales_orders. Inventory is
-- point-in-time by nature: each row is "as of snapshot_date, this SKU
-- in this warehouse had these quantities". Multiple uploads on the
-- same day for the same (workspace, sku, warehouse) are allowed —
-- consumers always read the most recent snapshot_date per key.

CREATE TABLE IF NOT EXISTS xb_canonical.inventory_snapshots (
  id                       char(26)       PRIMARY KEY,
  organization_id          char(26)       NOT NULL,
  workspace_id             char(26)       NOT NULL,
  upload_id                char(26)       NOT NULL,

  sku                      varchar(200)   NOT NULL,
  warehouse_code           varchar(120)   NOT NULL,
  snapshot_date            date           NOT NULL,

  quantity_on_hand         integer        NOT NULL,
  quantity_reserved        integer        NOT NULL DEFAULT 0,
  quantity_available       integer        NOT NULL,
  quantity_inbound         integer        NOT NULL DEFAULT 0,

  -- Optional valuation. When present, the validator requires a 3-letter
  -- currency_code and uses unit_cost * quantity_on_hand for tile aggregates.
  unit_cost                numeric(18, 4) NULL,
  currency_code            char(3)        NULL,

  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),
  deleted_at               timestamptz    NULL,

  created_by_actor_id      char(26)       NULL,

  row_version              integer        NOT NULL DEFAULT 1,

  CONSTRAINT fk_inventory_snapshots_org    FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_inventory_snapshots_ws     FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),
  CONSTRAINT fk_inventory_snapshots_upload FOREIGN KEY (upload_id)       REFERENCES xb_core.uploads(id),

  CONSTRAINT ck_inventory_on_hand_nonneg   CHECK (quantity_on_hand   >= 0),
  CONSTRAINT ck_inventory_reserved_nonneg  CHECK (quantity_reserved  >= 0),
  CONSTRAINT ck_inventory_available_nonneg CHECK (quantity_available >= 0),
  CONSTRAINT ck_inventory_inbound_nonneg   CHECK (quantity_inbound   >= 0),
  CONSTRAINT ck_inventory_cost_pos         CHECK (unit_cost IS NULL OR unit_cost >= 0),
  CONSTRAINT ck_inventory_currency_with_cost CHECK (
    (unit_cost IS NULL AND currency_code IS NULL) OR
    (unit_cost IS NOT NULL AND currency_code IS NOT NULL AND currency_code ~ '^[A-Z]{3}$')
  )
);

-- Most common scan: latest snapshot per workspace + SKU. (ws, sku, date desc).
CREATE INDEX IF NOT EXISTS idx_inventory_ws_sku_date
  ON xb_canonical.inventory_snapshots (workspace_id, sku, snapshot_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_ws_warehouse
  ON xb_canonical.inventory_snapshots (workspace_id, warehouse_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_ws_date
  ON xb_canonical.inventory_snapshots (workspace_id, snapshot_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_upload
  ON xb_canonical.inventory_snapshots (upload_id)
  WHERE deleted_at IS NULL;

ALTER TABLE xb_canonical.inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_canonical.inventory_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_inventory_tenant ON xb_canonical.inventory_snapshots;
CREATE POLICY p_inventory_tenant ON xb_canonical.inventory_snapshots
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP TRIGGER IF EXISTS trg_inventory_snapshots_row_version ON xb_canonical.inventory_snapshots;
CREATE TRIGGER trg_inventory_snapshots_row_version
  BEFORE UPDATE ON xb_canonical.inventory_snapshots
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

-- Same rationale as sales_orders: audit trigger OFF on canonical rows.
-- Provenance lives in upload_id; per-row audit on 100k uploads would
-- inflate xb_audit with no useful signal.
