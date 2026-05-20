-- 0015 — xb_master.unresolved_sku_rows — the mapping-layer dead-letter queue.
--
-- The mapping layer translates platform-shaped upload rows (Amazon, Walmart,
-- Shopify, …) into platform-agnostic NormalizedEntity objects. The crucial
-- step in that translation is resolveSku() — turning whatever code the
-- source platform uses (ASIN, seller SKU, UPC, fnsku, …) into the workspace's
-- canonical sku_normalized.
--
-- When resolveSku() fails (no alias yet, or ambiguous match), we don't drop
-- the row and we don't crash the upload. We park it here with the full
-- platform-shaped data needed to replay the mapping later — once the operator
-- adds the missing alias, every queued row for that (alias_type, alias_value,
-- source_*) combination can be remapped automatically.
--
-- Lifecycle:
--   pending   — needs an alias to be resolved
--   mapped    — alias was added, row was successfully translated to a
--               NormalizedEntity (we keep the audit trail for debugging)
--   dismissed — operator decided this row is junk (junk SKU on a vendor
--               report, dropped product, etc); won't be replayed
--
-- This is NOT a canonical table — it's a temporary holding area between
-- ingestion and canonicalization. Each row carries enough context to re-run
-- the mapper for just itself once the missing piece is in place.

CREATE TABLE IF NOT EXISTS xb_master.unresolved_sku_rows (
  id                       char(26)      PRIMARY KEY,
  organization_id          char(26)      NOT NULL,
  workspace_id             char(26)      NOT NULL,

  -- Parent upload — when the upload is hard-deleted, these queue rows
  -- go with it (they're meaningless without the source). The CASCADE
  -- matches what the operator expects when reprocessing.
  upload_id                char(26)      NOT NULL,
  upload_kind              varchar(40)   NOT NULL,    -- amazon_sales, amazon_inventory, ...
  row_number               integer       NOT NULL,    -- 1-based, matches validator output

  -- What the mapper tried to resolve. The (alias_type, alias_value)
  -- combined with source_* is exactly what was passed to resolveSku().
  alias_type               varchar(40)   NOT NULL,
  alias_value              varchar(200)  NOT NULL,
  source_platform          varchar(80)   NULL,
  source_marketplace       varchar(80)   NULL,
  source_account           varchar(200)  NULL,

  -- Why this row landed here. 'no_match' is the common case (alias not
  -- in sku_aliases yet); 'ambiguous' is when multiple sku_normalized
  -- values match (data quality issue the operator must clean up).
  reason                   varchar(40)   NOT NULL,

  -- The platform-shaped row we received, kept verbatim so replaying is
  -- a pure function: same input + new alias → NormalizedEntity. Bounded
  -- to the validator's parsed shape, not the raw CSV string.
  source_payload           jsonb         NOT NULL,

  -- Status lifecycle
  status                   varchar(40)   NOT NULL DEFAULT 'pending',

  -- When status='mapped', which alias unblocked it (debug / audit help).
  resolved_alias_id        char(26)      NULL,
  resolved_sku_normalized  varchar(200)  NULL,
  resolved_at              timestamptz   NULL,
  resolved_by_actor_id     char(26)      NULL,

  -- When status='dismissed'
  dismissed_at             timestamptz   NULL,
  dismissed_by_actor_id    char(26)      NULL,
  dismissal_reason         varchar(200)  NULL,

  -- Standard packs (TIMESTAMPS only; not soft-deletable — terminal states
  -- are mapped/dismissed, both keep history. Hard delete only when the
  -- parent upload is purged).
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  created_by_actor_id      char(26)      NULL,
  updated_by_actor_id      char(26)      NULL,
  row_version              integer       NOT NULL DEFAULT 1,

  CONSTRAINT fk_unresolved_org    FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_unresolved_ws     FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),
  CONSTRAINT fk_unresolved_upload FOREIGN KEY (upload_id)
    REFERENCES xb_core.uploads(id) ON DELETE CASCADE,
  CONSTRAINT fk_unresolved_alias  FOREIGN KEY (resolved_alias_id)
    REFERENCES xb_master.sku_aliases(id),

  CONSTRAINT ck_unresolved_status CHECK (status IN ('pending','mapped','dismissed')),
  CONSTRAINT ck_unresolved_reason CHECK (reason IN ('no_match','ambiguous','mapping_error')),
  CONSTRAINT ck_unresolved_alias_type CHECK (alias_type IN (
    'platform_sku','asin','upc','ean','gtin','isbn',
    'fnsku','supplier_sku','internal_sku','warehouse_sku'
  )),
  -- Terminal-state coherence: mapped rows must carry the resolution
  -- evidence; dismissed rows must carry the dismissal stamp; pending
  -- rows must carry neither.
  CONSTRAINT ck_unresolved_state_coherent CHECK (
    (status = 'pending'   AND resolved_at IS NULL AND dismissed_at IS NULL)
    OR
    (status = 'mapped'    AND resolved_at IS NOT NULL AND dismissed_at IS NULL
                          AND resolved_alias_id IS NOT NULL
                          AND resolved_sku_normalized IS NOT NULL)
    OR
    (status = 'dismissed' AND dismissed_at IS NOT NULL AND resolved_at IS NULL)
  )
);

-- HOT: queue browse — pending rows per workspace, newest first.
CREATE INDEX IF NOT EXISTS idx_unresolved_ws_pending
  ON xb_master.unresolved_sku_rows (workspace_id, created_at DESC)
  WHERE status = 'pending';

-- AGGREGATION: count distinct unresolved aliases per workspace (the UI
-- groups identical (alias_type, alias_value, source_*) so the operator
-- fixes one mapping and clears N rows).
CREATE INDEX IF NOT EXISTS idx_unresolved_ws_alias_group
  ON xb_master.unresolved_sku_rows (
    workspace_id, alias_type, alias_value,
    COALESCE(source_platform, ''),
    COALESCE(source_marketplace, ''),
    COALESCE(source_account, '')
  )
  WHERE status = 'pending';

-- REPLAY: when an alias is created/updated, find every pending row it
-- can now resolve. Same composite shape as the sku_aliases lookup index.
CREATE INDEX IF NOT EXISTS idx_unresolved_replay_lookup
  ON xb_master.unresolved_sku_rows (
    workspace_id, alias_type, alias_value
  )
  WHERE status = 'pending';

-- UPLOAD DRILL-DOWN: show all unresolved rows tied to one upload.
CREATE INDEX IF NOT EXISTS idx_unresolved_upload
  ON xb_master.unresolved_sku_rows (upload_id, row_number);

-- RLS — standard tenant isolation.
ALTER TABLE xb_master.unresolved_sku_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_master.unresolved_sku_rows FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_unresolved_tenant ON xb_master.unresolved_sku_rows;
CREATE POLICY p_unresolved_tenant ON xb_master.unresolved_sku_rows
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP TRIGGER IF EXISTS trg_unresolved_row_version ON xb_master.unresolved_sku_rows;
CREATE TRIGGER trg_unresolved_row_version
  BEFORE UPDATE ON xb_master.unresolved_sku_rows
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

-- Audit on state transitions — operators investigating "why did this row
-- skip canonical ingestion" need to see when it landed, when it got
-- mapped, and by whom.
DROP TRIGGER IF EXISTS trg_unresolved_audit ON xb_master.unresolved_sku_rows;
CREATE TRIGGER trg_unresolved_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_master.unresolved_sku_rows
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();
