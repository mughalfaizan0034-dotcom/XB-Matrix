-- 0001 — Extensions and schema layout.
-- Cf. Spec 3 §1.2 (Schema Layout). pg_partman is preferred for partitioning
-- but optional in the foundation; if absent, partitions are managed manually
-- by the worker rotation job (later phase).

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_partman is recommended but not required at foundation time.
-- DO $$ BEGIN
--   CREATE EXTENSION IF NOT EXISTS pg_partman;
-- EXCEPTION WHEN OTHERS THEN
--   RAISE NOTICE 'pg_partman not available; using manual partition rotation';
-- END $$;

-- Schemas — see Spec 3 §1.2
CREATE SCHEMA IF NOT EXISTS xb_core;
CREATE SCHEMA IF NOT EXISTS xb_master;
CREATE SCHEMA IF NOT EXISTS xb_raw;
CREATE SCHEMA IF NOT EXISTS xb_canonical;
CREATE SCHEMA IF NOT EXISTS xb_summary;
CREATE SCHEMA IF NOT EXISTS xb_intelligence;
CREATE SCHEMA IF NOT EXISTS xb_reports;
CREATE SCHEMA IF NOT EXISTS xb_audit;
CREATE SCHEMA IF NOT EXISTS xb_ai;

COMMENT ON SCHEMA xb_core         IS 'Tenancy, identity, permissions, configuration.';
COMMENT ON SCHEMA xb_master       IS 'SKUs, warehouses, FX rates (future).';
COMMENT ON SCHEMA xb_raw          IS 'Raw uploads landing (future).';
COMMENT ON SCHEMA xb_canonical    IS 'Normalized period-bucketed facts (future).';
COMMENT ON SCHEMA xb_summary      IS 'Pre-aggregated UI-facing tables (future).';
COMMENT ON SCHEMA xb_intelligence IS 'Forecasts, insights, recommendations (future).';
COMMENT ON SCHEMA xb_reports      IS 'Generated report metadata (future).';
COMMENT ON SCHEMA xb_audit        IS 'Append-only audit log; partitioned by month.';
COMMENT ON SCHEMA xb_ai           IS 'AI provider registry, conversations, prompts (future).';
