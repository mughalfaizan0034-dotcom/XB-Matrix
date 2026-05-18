-- 0008 — Unified auth tokens.
--
-- One table for every short-lived, one-time-use, hashed-and-stored token
-- the platform issues for authentication flows. Adding a new flow (e.g.
-- MFA OTP, magic-link sign-in) means adding a new `token_type` value, not
-- a new table.
--
--   token_type ∈ {invitation, email_verification, password_reset,
--                 email_change, magic_link, mfa_otp}
--
-- The raw token is HMAC-shareable in a URL but NEVER stored. Only the
-- sha-256 hex digest lives in the DB; lookup is by digest, exact match.
--
-- Lifecycle:
--   1. mint   — INSERT with expires_at; return the raw token to the caller.
--   2. verify — lookup by hash; check (consumed_at IS NULL) AND (expires_at > now).
--   3. consume — UPDATE consumed_at = now(), consumed_by_actor_id = caller.
--   4. revoke — UPDATE consumed_at = now() (mass invalidation, e.g. password change).
--
-- Cleanup: a Cloud Tasks scheduled job deletes rows where
--   (consumed_at IS NOT NULL AND consumed_at < now() - interval '30 days')
--   OR (expires_at < now() - interval '30 days').
-- Until that ships, expired/consumed rows are still safe — verify() rejects
-- them — they just accumulate.

CREATE TABLE IF NOT EXISTS xb_core.auth_tokens (
  id                     char(26)     PRIMARY KEY,
  token_type             varchar(40)  NOT NULL,
  token_hash             varchar(128) NOT NULL,

  -- Who this token is for. user_id may be NULL for self-service flows that
  -- mint a token before a user row exists (currently none — kept for future).
  target_user_id         char(26)     NULL,
  target_email           varchar(254) NOT NULL,

  -- For flows that carry pending state (e.g. email_change holds the new
  -- email until verified). Stays NULL for the simple flows.
  pending_payload        jsonb        NULL,

  expires_at             timestamptz  NOT NULL,
  consumed_at            timestamptz  NULL,
  consumed_by_actor_id   char(26)     NULL,

  created_at             timestamptz  NOT NULL DEFAULT now(),
  created_by_actor_id    char(26)     NULL,
  created_ip             inet         NULL,

  CONSTRAINT ck_auth_tokens_type CHECK (token_type IN (
    'invitation', 'email_verification', 'password_reset', 'email_change',
    'magic_link', 'mfa_otp'
  )),
  CONSTRAINT fk_auth_tokens_user FOREIGN KEY (target_user_id)
    REFERENCES xb_core.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_tokens_hash
  ON xb_core.auth_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type_created
  ON xb_core.auth_tokens (target_user_id, token_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_email_type_created
  ON xb_core.auth_tokens (lower(target_email), token_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_active
  ON xb_core.auth_tokens (expires_at)
  WHERE consumed_at IS NULL;

-- auth_tokens is platform-internal — no RLS (look-ups happen with no
-- organization context, e.g. when a recipient clicks an email link before
-- signing in). Access is gated by token-hash secrecy.

DROP TRIGGER IF EXISTS trg_auth_tokens_audit ON xb_core.auth_tokens;
CREATE TRIGGER trg_auth_tokens_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.auth_tokens
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();
