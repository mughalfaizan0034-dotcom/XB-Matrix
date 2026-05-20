-- Down: restore NOT NULL + the CHECK. Assumes every row has a valid
-- enum value; rows with NULL or off-list values must be backfilled
-- before this runs.

ALTER TABLE xb_core.workspaces ALTER COLUMN workspace_type SET NOT NULL;
ALTER TABLE xb_core.workspaces
  ADD CONSTRAINT ck_workspaces_type CHECK (
    workspace_type IN ('marketplace', 'dtc', 'warehouse', 'omni_channel')
  );
