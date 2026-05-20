-- Down: remove the provisioned super admin row. Doesn't restore the
-- previously soft-deleted managers (that's a destructive recovery
-- that should be done manually if needed).

UPDATE xb_core.users
   SET deleted_at = now(),
       user_status = 'deactivated'
 WHERE id = '01HXBFAIZANUSERSUPERMGR001'
   AND deleted_at IS NULL;
