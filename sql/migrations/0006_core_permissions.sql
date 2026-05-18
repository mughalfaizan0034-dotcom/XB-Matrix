-- 0006 — Permission tables.
-- Cf. Spec 3 §10.6.

-- workspace_permissions (user × workspace × access_level)
CREATE TABLE IF NOT EXISTS xb_core.workspace_permissions (
  id                   char(26)    PRIMARY KEY,
  organization_id      char(26)    NOT NULL,
  workspace_id         char(26)    NOT NULL,
  user_id              char(26)    NOT NULL,
  access_level         varchar(20) NOT NULL,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,

  created_by_actor_id  char(26)    NULL,
  updated_by_actor_id  char(26)    NULL,
  deleted_by_actor_id  char(26)    NULL,

  row_version          integer     NOT NULL DEFAULT 1,

  CONSTRAINT fk_wsperm_org  FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_wsperm_ws   FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),
  CONSTRAINT fk_wsperm_user FOREIGN KEY (user_id)         REFERENCES xb_core.users(id),
  CONSTRAINT ck_wsperm_level CHECK (access_level IN ('none','view','edit'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wsperm_user_ws
  ON xb_core.workspace_permissions (user_id, workspace_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wsperm_ws   ON xb_core.workspace_permissions (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wsperm_user ON xb_core.workspace_permissions (user_id)      WHERE deleted_at IS NULL;

ALTER TABLE xb_core.workspace_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_core.workspace_permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_wsperm_tenant ON xb_core.workspace_permissions;
CREATE POLICY p_wsperm_tenant ON xb_core.workspace_permissions
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP TRIGGER IF EXISTS trg_wsperm_row_version ON xb_core.workspace_permissions;
CREATE TRIGGER trg_wsperm_row_version
  BEFORE UPDATE ON xb_core.workspace_permissions
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

DROP TRIGGER IF EXISTS trg_wsperm_audit ON xb_core.workspace_permissions;
CREATE TRIGGER trg_wsperm_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.workspace_permissions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();


-- page_permissions (per-page override)
CREATE TABLE IF NOT EXISTS xb_core.page_permissions (
  id                   char(26)    PRIMARY KEY,
  organization_id      char(26)    NOT NULL,
  workspace_id         char(26)    NOT NULL,
  user_id              char(26)    NOT NULL,
  page_key             varchar(64) NOT NULL,
  access_level         varchar(20) NOT NULL,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,

  created_by_actor_id  char(26)    NULL,
  updated_by_actor_id  char(26)    NULL,
  deleted_by_actor_id  char(26)    NULL,

  row_version          integer     NOT NULL DEFAULT 1,

  CONSTRAINT fk_pgperm_org   FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_pgperm_ws    FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),
  CONSTRAINT fk_pgperm_user  FOREIGN KEY (user_id)         REFERENCES xb_core.users(id),
  CONSTRAINT ck_pgperm_level CHECK (access_level IN ('none','view','edit'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pgperm_user_ws_page
  ON xb_core.page_permissions (user_id, workspace_id, page_key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pgperm_ws ON xb_core.page_permissions (workspace_id) WHERE deleted_at IS NULL;

ALTER TABLE xb_core.page_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_core.page_permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_pgperm_tenant ON xb_core.page_permissions;
CREATE POLICY p_pgperm_tenant ON xb_core.page_permissions
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP TRIGGER IF EXISTS trg_pgperm_row_version ON xb_core.page_permissions;
CREATE TRIGGER trg_pgperm_row_version
  BEFORE UPDATE ON xb_core.page_permissions
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

DROP TRIGGER IF EXISTS trg_pgperm_audit ON xb_core.page_permissions;
CREATE TRIGGER trg_pgperm_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.page_permissions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();


-- internal_permissions (cross-tenant — accessed by internal users only; no RLS)
CREATE TABLE IF NOT EXISTS xb_core.internal_permissions (
  id                   char(26)    PRIMARY KEY,
  internal_user_id     char(26)    NOT NULL,
  organization_id      char(26)    NOT NULL,
  access_level         varchar(20) NOT NULL,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz NULL,

  created_by_actor_id  char(26)    NULL,
  updated_by_actor_id  char(26)    NULL,
  deleted_by_actor_id  char(26)    NULL,

  row_version          integer     NOT NULL DEFAULT 1,

  CONSTRAINT fk_intperm_user  FOREIGN KEY (internal_user_id) REFERENCES xb_core.users(id),
  CONSTRAINT fk_intperm_org   FOREIGN KEY (organization_id)  REFERENCES xb_core.organizations(id),
  CONSTRAINT ck_intperm_level CHECK (access_level IN ('none','view','edit'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intperm_user_org
  ON xb_core.internal_permissions (internal_user_id, organization_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_intperm_org
  ON xb_core.internal_permissions (organization_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_intperm_row_version ON xb_core.internal_permissions;
CREATE TRIGGER trg_intperm_row_version
  BEFORE UPDATE ON xb_core.internal_permissions
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

DROP TRIGGER IF EXISTS trg_intperm_audit ON xb_core.internal_permissions;
CREATE TRIGGER trg_intperm_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.internal_permissions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();


-- workspace_permission_snapshots (append-only; frozen state at archive)
CREATE TABLE IF NOT EXISTS xb_core.workspace_permission_snapshots (
  id                   char(26)    PRIMARY KEY,
  organization_id      char(26)    NOT NULL,
  workspace_id         char(26)    NOT NULL,
  snapshot_reason      varchar(40) NOT NULL,
  snapshot_data        jsonb       NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by_actor_id  char(26)    NULL,

  CONSTRAINT fk_wsps_org    FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_wsps_ws     FOREIGN KEY (workspace_id)    REFERENCES xb_core.workspaces(id),
  CONSTRAINT ck_wsps_reason CHECK (snapshot_reason IN ('archive','pre_restore','manual'))
);

CREATE INDEX IF NOT EXISTS idx_wsps_ws_created
  ON xb_core.workspace_permission_snapshots (workspace_id, created_at DESC);
