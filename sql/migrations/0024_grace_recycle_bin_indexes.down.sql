-- 0024 down — drop the grace-window indexes.

DROP INDEX IF EXISTS xb_core.ix_workspaces_deleted_at;
DROP INDEX IF EXISTS xb_core.ix_organizations_deleted_at;
DROP INDEX IF EXISTS xb_core.ix_users_deleted_at;
