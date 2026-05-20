-- 0016 — Make email optional on users (auth pivot 2026-05-20).
--
-- We're switching to username-first auth until resend.com is wired
-- (memory/feedback_auth_direction). Email becomes optional metadata,
-- not part of the identity. Admins create users with username +
-- password directly — no email collected.
--
-- Changes:
--   1. Drop NOT NULL on xb_core.users.email
--   2. Drop the unique-on-email index (username already enforces
--      identity uniqueness)
--
-- Email column itself stays — when email lifecycle ships (verification,
-- invitations, password reset) we'll start populating it again. The
-- per-user opt-in to email will set the value at that point.

ALTER TABLE xb_core.users ALTER COLUMN email DROP NOT NULL;

DROP INDEX IF EXISTS xb_core.uq_users_email;
