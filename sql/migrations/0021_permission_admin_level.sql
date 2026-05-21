-- 0021 — Add 'admin' to the access-level CHECKs on permission tables.
--
-- Original Spec 3 / migration 0006 vocabulary was ('none','view','edit').
-- The enterprise permission model (docs/permissions.md) needs an explicit
-- 'admin' level at workspace / page / internal scopes so an org-admin
-- (or scoped grant) is a first-class permission row rather than a
-- role-name special case. Same vocabulary across the three tables keeps
-- the resolver lookup uniform.

ALTER TABLE xb_core.workspace_permissions DROP CONSTRAINT IF EXISTS ck_wsperm_level;
ALTER TABLE xb_core.workspace_permissions
  ADD CONSTRAINT ck_wsperm_level
  CHECK (access_level IN ('none', 'view', 'edit', 'admin'));

ALTER TABLE xb_core.page_permissions DROP CONSTRAINT IF EXISTS ck_pgperm_level;
ALTER TABLE xb_core.page_permissions
  ADD CONSTRAINT ck_pgperm_level
  CHECK (access_level IN ('none', 'view', 'edit', 'admin'));

ALTER TABLE xb_core.internal_permissions DROP CONSTRAINT IF EXISTS ck_intperm_level;
ALTER TABLE xb_core.internal_permissions
  ADD CONSTRAINT ck_intperm_level
  CHECK (access_level IN ('none', 'view', 'edit', 'admin'));
