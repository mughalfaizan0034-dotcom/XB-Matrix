-- 0022 down — restore the post-0021 vocabulary ('none','view','edit','admin').
-- Pre-existing 'none' rows that the up migration removed are not restored.

ALTER TABLE xb_core.workspace_permissions DROP CONSTRAINT IF EXISTS ck_wsperm_level;
ALTER TABLE xb_core.workspace_permissions
  ADD CONSTRAINT ck_wsperm_level
  CHECK (access_level IN ('none', 'view', 'edit', 'admin'));
