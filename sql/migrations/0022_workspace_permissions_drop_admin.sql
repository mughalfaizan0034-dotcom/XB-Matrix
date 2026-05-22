-- 0022 — workspace_permissions: tighten access_level to ('view','edit').
--
-- Refined model (docs/permissions.md): workspace-level grants are the
-- ONLY permission surface. Vocabulary is view / edit; a missing row IS
-- 'none'. There is never a materialized 'none' row — setting a
-- workspace to none soft-deletes the existing row.
--
-- 'edit' is the operational admin level inside a workspace; there is
-- no separate workspace-admin tier. Platform administration
-- (super_admin / internal_manager / internal_staff) stays a system
-- role and bypasses workspace permissions entirely.
--
-- internal_permissions keeps 'admin' (it remains the cross-org
-- platform-admin grant). page_permissions keeps 'admin' should
-- per-module overrides ever be re-introduced — not used in V1.

-- Clean up any pre-existing 'none' rows. Operationally equivalent to a
-- missing row; tightening the CHECK would otherwise fail.
DELETE FROM xb_core.workspace_permissions WHERE access_level = 'none';

ALTER TABLE xb_core.workspace_permissions DROP CONSTRAINT IF EXISTS ck_wsperm_level;
ALTER TABLE xb_core.workspace_permissions
  ADD CONSTRAINT ck_wsperm_level
  CHECK (access_level IN ('view', 'edit'));
