-- 0004 — Tenancy and identity: organizations, actors, users.
-- Cf. Spec 3 §10.1–§10.3.

-- organizations (platform-global; no RLS — the org IS the tenancy root)
CREATE TABLE IF NOT EXISTS xb_core.organizations (
  id                       char(26)     PRIMARY KEY,
  display_name             varchar(200) NOT NULL,
  legal_name               varchar(200) NULL,
  slug                     varchar(64)  NOT NULL,
  organization_status      varchar(40)  NOT NULL DEFAULT 'active',
  billing_status           varchar(40)  NOT NULL DEFAULT 'not_configured',
  default_currency_code    char(3)      NOT NULL,
  default_timezone         varchar(64)  NOT NULL DEFAULT 'UTC',

  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  deleted_at               timestamptz  NULL,
  archived_at              timestamptz  NULL,
  suspended_at             timestamptz  NULL,

  created_by_actor_id      char(26)     NULL,
  updated_by_actor_id      char(26)     NULL,
  deleted_by_actor_id      char(26)     NULL,

  row_version              integer      NOT NULL DEFAULT 1,

  CONSTRAINT ck_organizations_status      CHECK (organization_status IN ('active','suspended','archived')),
  CONSTRAINT ck_organizations_billing     CHECK (billing_status IN ('active','past_due','cancelled','trial','not_configured')),
  CONSTRAINT ck_organizations_slug_format CHECK (slug ~ '^[a-z0-9-]{1,64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_slug
  ON xb_core.organizations (slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON xb_core.organizations (organization_status)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_organizations_row_version ON xb_core.organizations;
CREATE TRIGGER trg_organizations_row_version
  BEFORE UPDATE ON xb_core.organizations
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

DROP TRIGGER IF EXISTS trg_organizations_audit ON xb_core.organizations;
CREATE TRIGGER trg_organizations_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.organizations
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();


-- actors (polymorphic; no RLS — gated in application)
CREATE TABLE IF NOT EXISTS xb_core.actors (
  id                  char(26)     PRIMARY KEY,
  organization_id     char(26)     NULL,
  actor_kind          varchar(40)  NOT NULL,
  display_name        varchar(200) NOT NULL,
  actor_status        varchar(40)  NOT NULL DEFAULT 'active',

  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  deleted_at          timestamptz  NULL,

  created_by_actor_id char(26)     NULL,
  updated_by_actor_id char(26)     NULL,

  row_version         integer      NOT NULL DEFAULT 1,

  CONSTRAINT ck_actors_kind   CHECK (actor_kind IN ('internal_user','organization_user','api_key','system_job','connector','ai_agent')),
  CONSTRAINT ck_actors_status CHECK (actor_status IN ('active','deactivated','revoked')),
  CONSTRAINT fk_actors_org    FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_actors_org    ON xb_core.actors (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_actors_kind   ON xb_core.actors (actor_kind)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_actors_status ON xb_core.actors (actor_status)    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_actors_row_version ON xb_core.actors;
CREATE TRIGGER trg_actors_row_version
  BEFORE UPDATE ON xb_core.actors
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

DROP TRIGGER IF EXISTS trg_actors_audit ON xb_core.actors;
CREATE TRIGGER trg_actors_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.actors
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();


-- users (no RLS directly — queries always filter by organization_id in app)
CREATE TABLE IF NOT EXISTS xb_core.users (
  id                          char(26)     PRIMARY KEY,
  actor_id                    char(26)     NOT NULL UNIQUE,
  user_kind                   varchar(40)  NOT NULL,
  organization_id             char(26)     NULL,

  username                    varchar(120) NOT NULL,
  display_name                varchar(200) NOT NULL,
  email                       varchar(254) NOT NULL,
  password_hash               varchar(255) NOT NULL,

  internal_user_role          varchar(40)  NULL,
  organization_user_role      varchar(40)  NULL,

  user_status                 varchar(40)  NOT NULL DEFAULT 'pending_invite',
  mfa_enabled                 boolean      NOT NULL DEFAULT false,
  mfa_secret_encrypted        bytea        NULL,
  last_login_at               timestamptz  NULL,
  password_changed_at         timestamptz  NULL,

  created_at                  timestamptz  NOT NULL DEFAULT now(),
  updated_at                  timestamptz  NOT NULL DEFAULT now(),
  deleted_at                  timestamptz  NULL,

  created_by_actor_id         char(26)     NULL,
  updated_by_actor_id         char(26)     NULL,
  deleted_by_actor_id         char(26)     NULL,

  row_version                 integer      NOT NULL DEFAULT 1,

  CONSTRAINT fk_users_actor          FOREIGN KEY (actor_id)        REFERENCES xb_core.actors(id),
  CONSTRAINT fk_users_org            FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT ck_users_kind           CHECK (user_kind IN ('internal','organization')),
  CONSTRAINT ck_users_status         CHECK (user_status IN ('active','deactivated','pending_invite')),
  CONSTRAINT ck_users_internal_role  CHECK (internal_user_role IS NULL OR internal_user_role IN ('manager','staff')),
  CONSTRAINT ck_users_org_role       CHECK (organization_user_role IS NULL OR organization_user_role IN ('admin','user')),
  CONSTRAINT ck_users_role_consistency CHECK (
    (user_kind = 'internal'     AND internal_user_role IS NOT NULL AND organization_user_role IS NULL AND organization_id IS NULL)
    OR
    (user_kind = 'organization' AND organization_user_role IS NOT NULL AND internal_user_role IS NULL AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON xb_core.users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email    ON xb_core.users (lower(email))    WHERE deleted_at IS NULL;
CREATE INDEX        IF NOT EXISTS idx_users_org     ON xb_core.users (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX        IF NOT EXISTS idx_users_kind    ON xb_core.users (user_kind)       WHERE deleted_at IS NULL;
CREATE INDEX        IF NOT EXISTS idx_users_status  ON xb_core.users (user_status)     WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_users_row_version ON xb_core.users;
CREATE TRIGGER trg_users_row_version
  BEFORE UPDATE ON xb_core.users
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

DROP TRIGGER IF EXISTS trg_users_audit ON xb_core.users;
CREATE TRIGGER trg_users_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.users
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();
