-- 0017 — Reset super admin to a known account.
--
-- Operator direction (2026-05-20): provision a clean super-admin
-- account at "faizan" + the specified password, and remove every
-- pre-existing internal_manager (including any prior "faizan" rows)
-- so there's exactly one super-admin going forward.
--
-- All removals are SOFT deletes (deleted_at = now()) so the audit
-- history is preserved. Sessions for removed users are revoked so
-- any stale cookies stop working immediately.
--
-- Password format matches lib/password.ts: scrypt$1$<salt>$<key>
-- (scrypt with 64-byte key, 16-byte salt, NFKC-normalized password).
-- Generated locally for password "vLFkvTfrD?KSEbEZ".

DO $$
DECLARE
  v_new_user_id  char(26) := '01HXBFAIZANUSERSUPERMGR001';
  v_new_actor_id char(26) := '01HXBFAIZANACTORSUPERMGR01';
  v_username text := 'faizan';
  v_display_name text := 'Faizan';
  v_password_hash text :=
    'scrypt$1$1599bbdeed47a872736686ca11bc1cdd$a33b461a3d55d9bf63a49a1f81fd3ee1f1077e20d10cdb32c4e74a869d9f5320e5d069882bd8d79b34b3172072066ff957c05f87fbd5ac3ab72b1c32737ab78d';
BEGIN
  -- Set audit context so trigger captures the change attribution.
  PERFORM set_config('app.current_actor_id', v_new_actor_id, true);
  PERFORM set_config('app.current_actor_kind', 'system', true);
  PERFORM set_config('app.is_internal_manager', 'true', true);

  -- 1) Revoke every live session whose user we're about to soft-delete
  --    (every existing internal_manager + any user matching the target
  --    username). Prevents stale cookies from continuing to work.
  UPDATE xb_core.sessions s
     SET revoked_at = now(), revoke_reason = 'admin_revoke'
   WHERE s.revoked_at IS NULL
     AND s.user_id IN (
       SELECT id FROM xb_core.users
        WHERE deleted_at IS NULL
          AND (
            (user_kind = 'internal' AND internal_user_role = 'manager')
            OR lower(username) = v_username
          )
     );

  -- 2) Soft-delete every pre-existing internal_manager + any user
  --    matching the target username. Audit trigger records the
  --    transition; row remains for historical attribution lookups.
  UPDATE xb_core.users
     SET deleted_at = now(),
         deleted_by_actor_id = v_new_actor_id,
         user_status = 'deactivated'
   WHERE deleted_at IS NULL
     AND (
       (user_kind = 'internal' AND internal_user_role = 'manager')
       OR lower(username) = v_username
     );

  -- 3) Insert the fresh actor for the new super admin.
  INSERT INTO xb_core.actors
    (id, organization_id, actor_kind, display_name, actor_status)
  VALUES
    (v_new_actor_id, NULL, 'internal_user', v_display_name, 'active');

  -- 4) Insert the new super admin user row. Email stays NULL
  --    (migration 0016 made it optional).
  INSERT INTO xb_core.users
    (id, actor_id, user_kind, organization_id, username, display_name,
     email, password_hash, internal_user_role, user_status,
     password_changed_at, created_by_actor_id)
  VALUES
    (v_new_user_id, v_new_actor_id, 'internal', NULL, v_username, v_display_name,
     NULL, v_password_hash, 'manager', 'active',
     now(), v_new_actor_id);
END $$;
