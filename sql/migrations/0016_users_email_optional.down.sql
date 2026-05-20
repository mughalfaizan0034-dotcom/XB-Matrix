-- Re-add unique index on email (only for active+non-null rows) and
-- restore NOT NULL. This down migration assumes every user row has an
-- email value; if any rows have NULL email, the ALTER will fail and
-- those rows need backfill first.

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email
  ON xb_core.users (lower(email))
  WHERE deleted_at IS NULL;

ALTER TABLE xb_core.users ALTER COLUMN email SET NOT NULL;
