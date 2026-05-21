-- 0021 down — restore the original ('none','view','edit') CHECK.
-- Fails if any rows hold 'admin'; reconcile those first.

ALTER TABLE xb_core.workspace_permissions DROP CONSTRAINT IF EXISTS ck_wsperm_level;
ALTER TABLE xb_core.workspace_permissions
  ADD CONSTRAINT ck_wsperm_level
  CHECK (access_level IN ('none', 'view', 'edit'));

ALTER TABLE xb_core.page_permissions DROP CONSTRAINT IF EXISTS ck_pgperm_level;
ALTER TABLE xb_core.page_permissions
  ADD CONSTRAINT ck_pgperm_level
  CHECK (access_level IN ('none', 'view', 'edit'));

ALTER TABLE xb_core.internal_permissions DROP CONSTRAINT IF EXISTS ck_intperm_level;
ALTER TABLE xb_core.internal_permissions
  ADD CONSTRAINT ck_intperm_level
  CHECK (access_level IN ('none', 'view', 'edit'));
