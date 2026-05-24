-- 0025 — Grace-window purge: add purged_at columns + partial indexes.
--
-- The grace-window deletion lifecycle distinguishes between TWO
-- timestamps (project_deletion_lifecycle memory):
--
--   deleted_at  — set when an org admin removes the row. Soft-delete.
--                 Row remains physically present; counted in the
--                 30-day Recycle Bin window.
--
--   purged_at   — set in the same transaction that performs the
--                 hard DELETE, by the centralized purge orchestrator.
--                 The row immediately disappears from the primary
--                 tables, so purged_at is only ever observed in the
--                 audit_log entry the orchestrator emits — but the
--                 column being present means a future
--                 tombstone/retention table can read both timestamps
--                 if needed.
--
-- Keeping them separate is required for auditability, retention
-- reporting, support tooling, and future compliance exports — the
-- difference between "user clicked Remove" and "system enforced
-- the 30-day window" is exactly the kind of distinction those
-- workflows turn on.
--
-- Schema migration is purely additive. The cron sweep + force-
-- delete-now orchestrator land in the same PR as service code.
-- FK referential behavior is NOT modified here: the orchestrator
-- explicitly walks the dependency graph and deletes downstream rows
-- in correct order inside a single transaction. That keeps the
-- option open for future "archive on purge" treatment of canonical
-- data without needing another schema migration.

ALTER TABLE xb_core.users
  ADD COLUMN IF NOT EXISTS purged_at timestamptz NULL;

ALTER TABLE xb_core.organizations
  ADD COLUMN IF NOT EXISTS purged_at timestamptz NULL;

ALTER TABLE xb_core.workspaces
  ADD COLUMN IF NOT EXISTS purged_at timestamptz NULL;

-- Partial indexes — every purge sweep scans for the same shape:
-- "rows soft-deleted longer than the grace window, not yet purged."
-- Filtering on the index keeps the scan O(expired-rows) even when
-- the table grows.
CREATE INDEX IF NOT EXISTS ix_users_purge_candidates
  ON xb_core.users (deleted_at)
  WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_organizations_purge_candidates
  ON xb_core.organizations (deleted_at)
  WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_workspaces_purge_candidates
  ON xb_core.workspaces (deleted_at)
  WHERE deleted_at IS NOT NULL AND purged_at IS NULL;
