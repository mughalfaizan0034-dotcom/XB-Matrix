-- 0003 — xb_audit.audit_log (partitioned by month, append-only).
-- Cf. Spec 3 §5.5 and §17.1.

CREATE TABLE IF NOT EXISTS xb_audit.audit_log (
  id                   char(26)     NOT NULL,
  organization_id      char(26)     NULL,
  workspace_id         char(26)     NULL,

  actor_id             char(26)     NULL,
  actor_kind           varchar(40)  NOT NULL,

  operation            varchar(80)  NOT NULL,
  entity_kind          varchar(80)  NOT NULL,
  entity_id            char(26)     NULL,

  before_state         jsonb        NULL,
  after_state          jsonb        NULL,
  metadata             jsonb        NULL,

  occurred_at          timestamptz  NOT NULL DEFAULT now(),

  PRIMARY KEY (id, occurred_at),

  CONSTRAINT ck_audit_actor_kind CHECK (
    actor_kind IN ('internal_user','organization_user','api_key','system_job','connector','ai_agent','system')
  )
) PARTITION BY RANGE (occurred_at);

CREATE INDEX IF NOT EXISTS idx_audit_org_time ON xb_audit.audit_log (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor    ON xb_audit.audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity   ON xb_audit.audit_log (entity_kind, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_op       ON xb_audit.audit_log (operation, occurred_at DESC);

-- Initial monthly partitions: current month plus 5 forward.
-- A worker job (later phase) extends the rolling window; pg_partman is the
-- preferred long-term mechanism per Spec 3 §6.3.
DO $$
DECLARE
  base date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  i    int;
  start_d date;
  end_d   date;
  pname text;
BEGIN
  FOR i IN 0..5 LOOP
    start_d := (base + (i || ' months')::interval)::date;
    end_d   := (start_d + interval '1 month')::date;
    pname   := format('audit_log_y%sm%s', to_char(start_d, 'YYYY'), to_char(start_d, 'MM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS xb_audit.%I PARTITION OF xb_audit.audit_log FOR VALUES FROM (%L) TO (%L);',
      pname, start_d, end_d
    );
  END LOOP;
END $$;

-- Append-only RLS — Spec 3 §5.5
ALTER TABLE xb_audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_audit.audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_audit_no_update ON xb_audit.audit_log;
CREATE POLICY p_audit_no_update ON xb_audit.audit_log FOR UPDATE USING (false);

DROP POLICY IF EXISTS p_audit_no_delete ON xb_audit.audit_log;
CREATE POLICY p_audit_no_delete ON xb_audit.audit_log FOR DELETE USING (false);

DROP POLICY IF EXISTS p_audit_read ON xb_audit.audit_log;
CREATE POLICY p_audit_read ON xb_audit.audit_log
  FOR SELECT
  USING (
    organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::char(26)
    OR organization_id IS NULL
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

DROP POLICY IF EXISTS p_audit_insert ON xb_audit.audit_log;
CREATE POLICY p_audit_insert ON xb_audit.audit_log
  FOR INSERT
  WITH CHECK (true);
