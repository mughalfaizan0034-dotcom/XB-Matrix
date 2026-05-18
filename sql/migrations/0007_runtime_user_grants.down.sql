-- Reverse of 0007 — revoke all xb_* schema rights from the runtime user.
-- Safe even if the role does not exist (REVOKE on missing role errors, so we
-- guard with the same role-exists check).
DO $$
DECLARE
  runtime_role text := 'xbmatrixapp';
  ops_schema   text;
  all_schemas  text[] := ARRAY[
    'xb_core', 'xb_master', 'xb_raw', 'xb_canonical',
    'xb_summary', 'xb_intelligence', 'xb_reports', 'xb_ai', 'xb_audit'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    RETURN;
  END IF;

  FOREACH ops_schema IN ARRAY all_schemas LOOP
    EXECUTE format('REVOKE ALL ON ALL TABLES    IN SCHEMA %I FROM %I', ops_schema, runtime_role);
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM %I', ops_schema, runtime_role);
    EXECUTE format('REVOKE ALL ON SCHEMA        %I FROM %I', ops_schema, runtime_role);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I '
      'REVOKE ALL ON TABLES FROM %I',
      ops_schema, runtime_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I '
      'REVOKE ALL ON SEQUENCES FROM %I',
      ops_schema, runtime_role
    );
  END LOOP;
END $$;
