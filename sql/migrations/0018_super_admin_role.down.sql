-- Down: demote super_admins back to manager (lossy — distinguishing
-- super_admin from manager is lost in the down direction), restore
-- the original CHECK.

UPDATE xb_core.users
   SET internal_user_role = 'manager'
 WHERE internal_user_role = 'super_admin';

ALTER TABLE xb_core.users DROP CONSTRAINT IF EXISTS ck_users_internal_role;
ALTER TABLE xb_core.users
  ADD CONSTRAINT ck_users_internal_role CHECK (
    internal_user_role IS NULL OR internal_user_role IN ('manager', 'staff')
  );
