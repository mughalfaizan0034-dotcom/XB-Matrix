-- 0019 — Workspace type becomes free-text and optional.
--
-- Operator direction (2026-05-21): the fixed workspace-type dropdown
-- (marketplace / dtc / warehouse / omni_channel) added complexity for
-- end users with no operational payoff. Workspace type is now an
-- optional free-text label — keep it simple.
--
--   - Drop the ck_workspaces_type CHECK constraint.
--   - Make workspace_type nullable.

ALTER TABLE xb_core.workspaces DROP CONSTRAINT IF EXISTS ck_workspaces_type;
ALTER TABLE xb_core.workspaces ALTER COLUMN workspace_type DROP NOT NULL;
