-- 0002 — Shared helper functions.
-- Cf. Spec 3 §4 (Optimistic Locking), §5 (Audit), §19 (ULID generation).

-- gen_ulid() — PL/pgSQL ULID generator.
-- Crockford base32, 26 chars: 10 chars of millisecond timestamp + 16 random.
-- Spec 3 §19 prefers the pg_idkit extension; this fallback covers environments
-- where pg_idkit is not enabled (e.g., default Cloud SQL).
CREATE OR REPLACE FUNCTION gen_ulid()
RETURNS char(26)
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  ts       bigint;
  ts_str   text := '';
  rnd_str  text := '';
  i        int;
  v        int;
BEGIN
  ts := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  FOR i IN 1..10 LOOP
    v := ((ts >> ((10 - i) * 5)) & 31)::int;
    ts_str := ts_str || substr(alphabet, v + 1, 1);
  END LOOP;
  FOR i IN 1..16 LOOP
    v := floor(random() * 32)::int;
    rnd_str := rnd_str || substr(alphabet, v + 1, 1);
  END LOOP;
  RETURN ts_str || rnd_str;
END;
$$;

COMMENT ON FUNCTION gen_ulid() IS
  'ULID generator. Application code generates ULIDs client-side in normal operation; this is the DB-side fallback (e.g., audit trigger).';

-- fn_increment_row_version — Spec 3 §4.2.
CREATE OR REPLACE FUNCTION fn_increment_row_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.row_version := COALESCE(OLD.row_version, 0) + 1;
  NEW.updated_at  := now();
  RETURN NEW;
END;
$$;

-- fn_audit_row_change — Spec 3 §5.2.
-- Implementation differs slightly from the spec's example: uses JSONB extraction
-- to read organization_id / workspace_id, so the same function works against
-- tables that lack those columns (e.g., the organizations table itself, which
-- uses its own id as its organization_id).
CREATE OR REPLACE FUNCTION fn_audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_id    char(26)    := NULLIF(current_setting('app.current_actor_id',    true), '')::char(26);
  v_actor_kind  varchar(40) := COALESCE(NULLIF(current_setting('app.current_actor_kind', true), ''), 'system');
  v_request_id  text        := NULLIF(current_setting('app.current_request_id',  true), '');
  v_row         jsonb;
  v_old_row     jsonb;
  v_org_id      char(26);
  v_ws_id       char(26);
  v_entity_id   char(26);
  v_operation   varchar(80);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row       := to_jsonb(OLD);
    v_old_row   := v_row;
    v_operation := 'record.hard_deleted';
  ELSIF TG_OP = 'INSERT' THEN
    v_row       := to_jsonb(NEW);
    v_old_row   := NULL;
    v_operation := 'record.created';
  ELSE -- UPDATE
    v_row       := to_jsonb(NEW);
    v_old_row   := to_jsonb(OLD);
    IF (v_old_row ->> 'deleted_at') IS NULL AND (v_row ->> 'deleted_at') IS NOT NULL THEN
      v_operation := 'record.soft_deleted';
    ELSIF (v_old_row ->> 'deleted_at') IS NOT NULL AND (v_row ->> 'deleted_at') IS NULL THEN
      v_operation := 'record.restored';
    ELSE
      v_operation := 'record.updated';
    END IF;
  END IF;

  v_entity_id := NULLIF(v_row ->> 'id', '')::char(26);
  v_org_id := COALESCE(
    NULLIF(v_row ->> 'organization_id', '')::char(26),
    CASE WHEN TG_TABLE_SCHEMA = 'xb_core' AND TG_TABLE_NAME = 'organizations'
         THEN NULLIF(v_row ->> 'id', '')::char(26)
    END
  );
  v_ws_id := NULLIF(v_row ->> 'workspace_id', '')::char(26);

  INSERT INTO xb_audit.audit_log (
    id, organization_id, workspace_id, actor_id, actor_kind,
    operation, entity_kind, entity_id, before_state, after_state,
    metadata, occurred_at
  ) VALUES (
    gen_ulid(),
    v_org_id, v_ws_id, v_actor_id, v_actor_kind,
    v_operation,
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    v_entity_id,
    v_old_row,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE v_row END,
    jsonb_build_object('request_id', v_request_id, 'trigger', true, 'op', TG_OP),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;
