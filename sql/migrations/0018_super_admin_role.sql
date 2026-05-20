-- 0018 — Add super_admin role tier above internal_manager.
--
-- New 5-tier role hierarchy (2026-05-20 operator direction):
--
--   super_admin       — platform owner. Only role allowed to create
--                       other super_admins or internal_managers.
--                       Full RLS + resolver bypass.
--   internal_manager  — platform staff with wide bypass. Can create
--                       internal_staff and any organization role.
--                       Cannot create another super_admin or
--                       internal_manager.
--   internal_staff    — read-only platform-wide.
--   organization_admin — full access within own org, manages org users.
--   organization_user  — operational access within own org.
--
-- Schema change: internal_user_role CHECK was previously
-- ('manager','staff'); now allows 'super_admin' too.
-- ck_users_role_consistency still works because super_admin keeps
-- internal_user_role NOT NULL.
--
-- Data change: the existing super-admin row (provisioned in
-- migration 0017, currently sitting at internal_user_role='manager')
-- is promoted to 'super_admin'.

ALTER TABLE xb_core.users DROP CONSTRAINT IF EXISTS ck_users_internal_role;
ALTER TABLE xb_core.users
  ADD CONSTRAINT ck_users_internal_role CHECK (
    internal_user_role IS NULL
    OR internal_user_role IN ('super_admin', 'manager', 'staff')
  );

-- Promote the existing provisioned super-admin row.
DO $$
DECLARE
  v_actor_id char(26) := '01HXBFAIZANACTORSUPERMGR01';
BEGIN
  PERFORM set_config('app.current_actor_id', v_actor_id, true);
  PERFORM set_config('app.current_actor_kind', 'system', true);
  PERFORM set_config('app.is_internal_manager', 'true', true);

  UPDATE xb_core.users
     SET internal_user_role = 'super_admin'
   WHERE id = '01HXBFAIZANUSERSUPERMGR001'
     AND deleted_at IS NULL;
END $$;
