-- 0005 — Workspaces and idempotency keys.
-- Cf. Spec 3 §10.5 and §10.8 (idempotency_keys).

CREATE TABLE IF NOT EXISTS xb_core.workspaces (
  id                       char(26)      PRIMARY KEY,
  organization_id          char(26)      NOT NULL,

  workspace_name           varchar(200)  NOT NULL,
  workspace_type           varchar(40)   NOT NULL,
  workspace_status         varchar(40)   NOT NULL DEFAULT 'active',

  default_currency_code    char(3)       NOT NULL,
  timezone                 varchar(64)   NOT NULL DEFAULT 'UTC',
  dos_target_days          numeric(6,2)  NOT NULL DEFAULT 30.0,
  forecast_rule_id         char(26)      NULL,

  archived_at              timestamptz   NULL,

  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  deleted_at               timestamptz   NULL,

  created_by_actor_id      char(26)      NULL,
  updated_by_actor_id      char(26)      NULL,
  deleted_by_actor_id      char(26)      NULL,

  row_version              integer       NOT NULL DEFAULT 1,

  CONSTRAINT fk_workspaces_org           FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT ck_workspaces_type          CHECK (workspace_type IN ('marketplace','dtc','warehouse','omni_channel')),
  CONSTRAINT ck_workspaces_status        CHECK (workspace_status IN ('active','archived')),
  CONSTRAINT ck_workspaces_dos_positive  CHECK (dos_target_days >= 0)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_org    ON xb_core.workspaces (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON xb_core.workspaces (workspace_status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_org_name
  ON xb_core.workspaces (organization_id, lower(workspace_name))
  WHERE deleted_at IS NULL;

ALTER TABLE xb_core.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_core.workspaces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_workspaces_tenant ON xb_core.workspaces;
CREATE POLICY p_workspaces_tenant ON xb_core.workspaces
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP TRIGGER IF EXISTS trg_workspaces_row_version ON xb_core.workspaces;
CREATE TRIGGER trg_workspaces_row_version
  BEFORE UPDATE ON xb_core.workspaces
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

DROP TRIGGER IF EXISTS trg_workspaces_audit ON xb_core.workspaces;
CREATE TRIGGER trg_workspaces_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.workspaces
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();


-- idempotency_keys — Spec 3 §10.8 (TTL-driven cleanup by worker).
CREATE TABLE IF NOT EXISTS xb_core.idempotency_keys (
  id                  char(26)      PRIMARY KEY,
  organization_id     char(26)      NOT NULL,
  key                 varchar(120)  NOT NULL,
  request_fingerprint varchar(120)  NOT NULL,
  result              jsonb         NULL,

  created_at          timestamptz   NOT NULL DEFAULT now(),
  expires_at          timestamptz   NOT NULL,

  CONSTRAINT fk_idem_org FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_idem_org_key
  ON xb_core.idempotency_keys (organization_id, key);
CREATE INDEX        IF NOT EXISTS idx_idem_expires
  ON xb_core.idempotency_keys (expires_at);

ALTER TABLE xb_core.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_core.idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_idem_tenant ON xb_core.idempotency_keys;
CREATE POLICY p_idem_tenant ON xb_core.idempotency_keys
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );
