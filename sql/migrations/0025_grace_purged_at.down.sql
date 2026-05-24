-- 0025 down — drop the grace-window purge columns + indexes.

DROP INDEX IF EXISTS xb_core.ix_workspaces_purge_candidates;
DROP INDEX IF EXISTS xb_core.ix_organizations_purge_candidates;
DROP INDEX IF EXISTS xb_core.ix_users_purge_candidates;

ALTER TABLE xb_core.workspaces    DROP COLUMN IF EXISTS purged_at;
ALTER TABLE xb_core.organizations DROP COLUMN IF EXISTS purged_at;
ALTER TABLE xb_core.users         DROP COLUMN IF EXISTS purged_at;
