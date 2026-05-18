-- 0007 — Least-privilege grants for the runtime application user.
--
-- The 'postgres' role is reserved for migrations and admin operations.
-- The runtime role (default: 'xbmatrixapp') is what the api + worker
-- connect as in production and gets exactly the rights it needs — no DDL,
-- no schema CREATE, no SUPERUSER, no BYPASSRLS.
--
-- Privilege summary:
--   USAGE on every xb_* schema
--   SELECT+INSERT+UPDATE+DELETE on all tables in operational schemas
--   SELECT+INSERT only on xb_audit (append-only; RLS also denies UPDATE/DELETE)
--   ALTER DEFAULT PRIVILEGES so future migrations auto-grant
--   No access to public.schema_migrations or anything outside xb_*
--
-- Idempotent: GRANT and ALTER DEFAULT PRIVILEGES re-apply cleanly.
-- Skips itself with a NOTICE if the role does not exist (so local dev that
-- has not yet created the runtime role does not fail this migration).

DO $$
DECLARE
  runtime_role text := 'xbmatrixapp';
  ops_schema   text;
  ops_schemas  text[] := ARRAY[
    'xb_core', 'xb_master', 'xb_raw', 'xb_canonical',
    'xb_summary', 'xb_intelligence', 'xb_reports', 'xb_ai'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    RAISE NOTICE 'role % does not exist; skipping runtime grants', runtime_role;
    RETURN;
  END IF;

  -- USAGE on every xb_* schema
  FOREACH ops_schema IN ARRAY ops_schemas || ARRAY['xb_audit'] LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', ops_schema, runtime_role);
  END LOOP;

  -- CRUD on operational schemas (current + future tables)
  FOREACH ops_schema IN ARRAY ops_schemas LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
      ops_schema, runtime_role
    );
    EXECUTE format(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I',
      ops_schema, runtime_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I '
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
      ops_schema, runtime_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I '
      'GRANT USAGE, SELECT ON SEQUENCES TO %I',
      ops_schema, runtime_role
    );
  END LOOP;

  -- xb_audit: append-only. SELECT + INSERT, no UPDATE/DELETE.
  -- Trigger function fn_audit_row_change runs as the calling user (INVOKER
  -- semantics), so the runtime role needs INSERT on the partitioned parent.
  -- Partition INSERTs route through the parent and use the parent's privileges
  -- under declarative partitioning in PG10+.
  EXECUTE format(
    'GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA xb_audit TO %I',
    runtime_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA xb_audit '
    'GRANT SELECT, INSERT ON TABLES TO %I',
    runtime_role
  );

  -- Defense in depth: ensure no CREATE on any operational schema, even if
  -- something later grants PUBLIC.
  FOREACH ops_schema IN ARRAY ops_schemas || ARRAY['xb_audit'] LOOP
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %I', ops_schema, runtime_role);
  END LOOP;

  -- Explicitly deny access to migration metadata.
  REVOKE ALL ON public.schema_migrations FROM PUBLIC;
  EXECUTE format('REVOKE ALL ON public.schema_migrations FROM %I', runtime_role);

  RAISE NOTICE 'runtime grants applied for role %', runtime_role;
END $$;
