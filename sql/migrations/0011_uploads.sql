-- 0011 — Uploads.
-- The pipeline foundation for every operational dataset that follows
-- (sales, inventory, ad spend, shipments, returns…). Each per-module
-- validator/parser will land later as its own slice; this table is the
-- single source of truth for "a file was offered to the system" + its
-- status + its validation outcome.
--
-- Workspace-scoped: every upload belongs to exactly one workspace. RLS
-- mirrors the workspaces table (tenant-isolated; internal_manager
-- bypass for support flows).

CREATE TABLE IF NOT EXISTS xb_core.uploads (
  id                       char(26)      PRIMARY KEY,
  organization_id          char(26)      NOT NULL,
  workspace_id             char(26)      NOT NULL,

  -- What kind of dataset the user claims this is. `generic` is the
  -- catch-all until a module registers its own kind + validator.
  upload_kind              varchar(40)   NOT NULL DEFAULT 'generic',

  original_filename        varchar(500)  NOT NULL,
  content_type             varchar(120)  NOT NULL,
  file_size_bytes          bigint        NOT NULL,
  sha256                   char(64)      NOT NULL,

  -- Where the bytes live in GCS. Object keys follow the convention:
  --   org/{org_id}/ws/{ws_id}/uploads/{upload_id}/{filename}
  -- so we never collide and a single bucket lifecycle policy can scope
  -- retention by prefix later.
  storage_bucket           varchar(120)  NOT NULL,
  storage_object_key       varchar(1024) NOT NULL,

  upload_status            varchar(40)   NOT NULL DEFAULT 'queued',

  -- Validation outcome — opaque jsonb so each module can use its own
  -- schema (row counts, column mapping, error samples, etc) without
  -- migrations. The frontend renders summary fields if present and
  -- otherwise treats the blob as opaque.
  validation_summary       jsonb         NULL,
  -- One-line failure reason surfaced to the user when status=failed.
  error_message            text          NULL,
  -- Bump on retry so the user can see how many attempts ran.
  retry_count              integer       NOT NULL DEFAULT 0,

  -- Async pipeline coordination: when set, a worker job is enqueued
  -- against this id. Cleared when terminal (ready/failed).
  validation_started_at    timestamptz   NULL,
  validation_completed_at  timestamptz   NULL,

  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  deleted_at               timestamptz   NULL,

  created_by_actor_id      char(26)      NULL,
  updated_by_actor_id      char(26)      NULL,
  deleted_by_actor_id      char(26)      NULL,

  row_version              integer       NOT NULL DEFAULT 1,

  CONSTRAINT fk_uploads_org   FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_uploads_ws    FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),

  CONSTRAINT ck_uploads_status CHECK (upload_status IN (
    'queued', 'uploading', 'validating', 'ready', 'failed'
  )),
  CONSTRAINT ck_uploads_size_positive CHECK (file_size_bytes >= 0),
  CONSTRAINT ck_uploads_retry_nonneg  CHECK (retry_count >= 0)
);

-- Hot lookups: most recent first, scoped to the active workspace.
CREATE INDEX IF NOT EXISTS idx_uploads_ws_created
  ON xb_core.uploads (workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_org_created
  ON xb_core.uploads (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_status
  ON xb_core.uploads (upload_status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Dedupe by content hash within a workspace — if the user re-uploads
-- the same file we can reuse the existing row instead of storing twice.
-- Not a unique constraint because we explicitly allow re-uploads of the
-- same content for re-validation; just an index for fast lookup.
CREATE INDEX IF NOT EXISTS idx_uploads_ws_sha
  ON xb_core.uploads (workspace_id, sha256)
  WHERE deleted_at IS NULL;

ALTER TABLE xb_core.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_core.uploads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_uploads_tenant ON xb_core.uploads;
CREATE POLICY p_uploads_tenant ON xb_core.uploads
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP TRIGGER IF EXISTS trg_uploads_row_version ON xb_core.uploads;
CREATE TRIGGER trg_uploads_row_version
  BEFORE UPDATE ON xb_core.uploads
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

DROP TRIGGER IF EXISTS trg_uploads_audit ON xb_core.uploads;
CREATE TRIGGER trg_uploads_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.uploads
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();
