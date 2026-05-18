-- 0009 — Email verification state on users.
--
-- Users created via invitation start with email_verified_at = NULL. The
-- invitation accept flow sets it to now() because consuming the invite
-- token requires receiving + opening an email at that address.
--
-- Sign-in checks email_verified_at IS NOT NULL. The bootstrap admin user
-- (created via seed:admin CLI) is back-filled to "now()" — they bypassed
-- the email flow but the operator effectively verified out-of-band.

ALTER TABLE xb_core.users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_users_email_verified_active
  ON xb_core.users (email_verified_at)
  WHERE deleted_at IS NULL;

-- Back-fill: any pre-existing 'active' internal user is treated as verified.
UPDATE xb_core.users
   SET email_verified_at = now()
 WHERE email_verified_at IS NULL
   AND deleted_at IS NULL
   AND user_status = 'active';
