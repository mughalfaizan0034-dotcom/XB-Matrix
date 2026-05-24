-- 0024 — Grace-window recycle-bin indexes.
--
-- Soft-deletion gains a 30-day grace window: when an org admin removes a
-- user / org / workspace, the row goes to deleted_at = now(); a daily
-- background sweep (lands in a follow-up PR) hard-deletes anything
-- where deleted_at < now() - interval '30 days'. Internal managers and
-- super_admin can list + restore inside that window via a new Recycle
-- Bin admin surface.
--
-- This migration is the index-only first slice. It adds partial
-- indexes that make the recycle-bin LIST query and the future purge
-- sweep both O(grace-window rows) instead of O(table). They are
-- additive, safe to roll out independently, and impose no schema or
-- FK changes — those land in the cron/force-delete PR alongside the
-- ON DELETE SET NULL audit-FK migration that lets the eventual hard
-- delete preserve historical attribution.
--
-- Predicate `deleted_at IS NOT NULL`: filters out the long tail of
-- live rows entirely. Index pages only carry tombstoned rows, so it
-- stays small even as the tables grow.
--
-- Convention check (project_architectural_rules memory): no DDL on
-- live columns, no FK changes, no RLS policy touches. Additive only.

CREATE INDEX IF NOT EXISTS ix_users_deleted_at
  ON xb_core.users (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_organizations_deleted_at
  ON xb_core.organizations (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_workspaces_deleted_at
  ON xb_core.workspaces (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;
