-- 0010 — Persistent server-side sessions.
--
-- Before this, sessions were stateless JWTs — sign-out only cleared the
-- cookie, which meant a leaked JWT was usable until expiry. Now every
-- session has a row here; the JWT carries its `id`; every request looks
-- it up and rejects revoked or expired ones.
--
-- Password reset revokes all sessions for the user (cascade sign-out
-- everywhere). MFA challenges and step-up will read additional columns.
--
-- Lookups happen by primary key only. Light Redis cache (60s TTL) keyed
-- by session id absorbs hot-path load; cache invalidation on revoke is
-- best-effort, and a stale-cache window of <60s is acceptable for a
-- newly-revoked session (revoke + ~60s wait completes the effective
-- sign-out).

CREATE TABLE IF NOT EXISTS xb_core.sessions (
  id                     char(26)     PRIMARY KEY,
  user_id                char(26)     NOT NULL,
  actor_id               char(26)     NOT NULL,
  organization_id        char(26)     NULL,

  -- Active workspace stored here so server can include it in
  -- ActorContext without the cookie carrying that detail.
  active_workspace_id    char(26)     NULL,

  user_agent             varchar(500) NULL,
  ip_address             inet         NULL,

  created_at             timestamptz  NOT NULL DEFAULT now(),
  last_seen_at           timestamptz  NOT NULL DEFAULT now(),
  expires_at             timestamptz  NOT NULL,
  revoked_at             timestamptz  NULL,
  revoke_reason          varchar(40)  NULL,

  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES xb_core.users(id),
  CONSTRAINT fk_sessions_actor FOREIGN KEY (actor_id) REFERENCES xb_core.actors(id),
  CONSTRAINT fk_sessions_org FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_sessions_ws FOREIGN KEY (active_workspace_id) REFERENCES xb_core.workspaces(id),
  CONSTRAINT ck_sessions_revoke_reason CHECK (
    revoke_reason IS NULL OR revoke_reason IN (
      'sign_out', 'password_reset', 'admin_revoke', 'expired', 'security_event'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON xb_core.sessions (user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON xb_core.sessions (expires_at)
  WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_sessions_audit ON xb_core.sessions;
CREATE TRIGGER trg_sessions_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.sessions
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();
