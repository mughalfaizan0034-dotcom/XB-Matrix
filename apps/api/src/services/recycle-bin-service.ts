import type { FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { ActorContext } from '@xb/types';
import { requirePlatformAdmin } from './platform-service.js';

/**
 * Recycle-bin service — grace-window admin surface.
 *
 * When an org admin removes a user / org / workspace, the row is
 * soft-deleted (deleted_at = now()). For 30 days, internal managers
 * and super_admin can list those rows and restore them through this
 * service. After the window, a daily cron (lands in a follow-up PR)
 * hard-deletes them and the recycle bin stops surfacing them.
 *
 * Org admins never see deleted rows — every org-scoped query already
 * filters `WHERE deleted_at IS NULL`. The recycle bin is the only
 * surface that intentionally drops that filter, and it's gated to
 * `requirePlatformAdmin` (super_admin + internal_manager).
 *
 * What's NOT here yet (queued for PR-2):
 *   - forceDeleteNow — admin pulls the trigger before the 30 days
 *   - runGracePurgeSweep — daily worker that hard-deletes expired
 *   - FK migration setting audit refs to ON DELETE SET NULL so
 *     historical audit_log entries survive the eventual purge
 */

export type RecycleBinKind = 'user' | 'organization' | 'workspace';

const GRACE_WINDOW_DAYS = 30;

export interface RecycleBinEntry {
  readonly id: string;
  readonly kind: RecycleBinKind;
  readonly label: string;
  /** Org context (null for the org row itself, since the org IS the context). */
  readonly organizationId: string | null;
  readonly organizationName: string | null;
  readonly deletedAt: string;
  /** Display name of the actor who soft-deleted the row, or null if the actor is gone or unknown (legacy rows, system). */
  readonly deletedBy: string | null;
  /** UTC ISO timestamp when this row will be hard-purged. */
  readonly purgeAt: string;
  /** Whole days remaining in the grace window, floored. 0 = today. */
  readonly daysRemaining: number;
}

export async function listRecycleBin(
  app: FastifyInstance,
  actor: ActorContext,
  kind: RecycleBinKind,
): Promise<ReadonlyArray<RecycleBinEntry>> {
  requirePlatformAdmin(actor);
  return app.withConnection(actor, async (client) => {
    // deleted_by display name is resolved via the actor's owning
    // user row (deleted_by_actor_id -> users.actor_id -> display_name).
    // Works for both internal + org-user actors since both live in
    // xb_core.users. System / API-key / cron actors have no users row
    // so the join returns null and the UI renders "System".
    if (kind === 'user') {
      const { rows } = await client.query<{
        id: string;
        display_name: string;
        username: string;
        organization_id: string | null;
        organization_name: string | null;
        deleted_at: Date;
        deleted_by_name: string | null;
      }>(
        `SELECT u.id, u.display_name, u.username,
                u.organization_id,
                o.display_name AS organization_name,
                u.deleted_at,
                du.display_name AS deleted_by_name
           FROM xb_core.users u
           LEFT JOIN xb_core.organizations o ON o.id = u.organization_id
           LEFT JOIN xb_core.users du ON du.actor_id = u.deleted_by_actor_id
          WHERE u.deleted_at IS NOT NULL
            AND u.deleted_at > now() - ($1 || ' days')::interval
          ORDER BY u.deleted_at DESC`,
        [String(GRACE_WINDOW_DAYS)],
      );
      return rows.map((r) =>
        toEntry({
          id: r.id,
          kind: 'user',
          label: `${r.display_name} (@${r.username})`,
          organizationId: r.organization_id,
          organizationName: r.organization_name,
          deletedAt: r.deleted_at,
          deletedBy: r.deleted_by_name,
        }),
      );
    }
    if (kind === 'organization') {
      const { rows } = await client.query<{
        id: string;
        display_name: string;
        deleted_at: Date;
        deleted_by_name: string | null;
      }>(
        `SELECT o.id, o.display_name, o.deleted_at,
                du.display_name AS deleted_by_name
           FROM xb_core.organizations o
           LEFT JOIN xb_core.users du ON du.actor_id = o.deleted_by_actor_id
          WHERE o.deleted_at IS NOT NULL
            AND o.deleted_at > now() - ($1 || ' days')::interval
          ORDER BY o.deleted_at DESC`,
        [String(GRACE_WINDOW_DAYS)],
      );
      return rows.map((r) =>
        toEntry({
          id: r.id,
          kind: 'organization',
          label: r.display_name,
          organizationId: null,
          organizationName: null,
          deletedAt: r.deleted_at,
          deletedBy: r.deleted_by_name,
        }),
      );
    }
    // workspace
    const { rows } = await client.query<{
      id: string;
      workspace_name: string;
      organization_id: string;
      organization_name: string;
      deleted_at: Date;
      deleted_by_name: string | null;
    }>(
      `SELECT w.id, w.workspace_name,
              w.organization_id,
              o.display_name AS organization_name,
              w.deleted_at,
              du.display_name AS deleted_by_name
         FROM xb_core.workspaces w
         JOIN xb_core.organizations o ON o.id = w.organization_id
         LEFT JOIN xb_core.users du ON du.actor_id = w.deleted_by_actor_id
        WHERE w.deleted_at IS NOT NULL
          AND w.deleted_at > now() - ($1 || ' days')::interval
        ORDER BY w.deleted_at DESC`,
      [String(GRACE_WINDOW_DAYS)],
    );
    return rows.map((r) =>
      toEntry({
        id: r.id,
        kind: 'workspace',
        label: r.workspace_name,
        organizationId: r.organization_id,
        organizationName: r.organization_name,
        deletedAt: r.deleted_at,
        deletedBy: r.deleted_by_name,
      }),
    );
  });
}

/**
 * Clear deleted_at on a soft-deleted row. Idempotent against the
 * already-live state (409) and against expired rows beyond the grace
 * window (409). The UI should never offer the action in either state,
 * but the API rejects both as defence in depth.
 */
export interface RestoreResult {
  readonly id: string;
  readonly kind: RecycleBinKind;
  readonly restoredAt: string;
}

export async function restoreEntity(
  app: FastifyInstance,
  actor: ActorContext,
  kind: RecycleBinKind,
  id: string,
): Promise<RestoreResult> {
  requirePlatformAdmin(actor);
  const table = TABLE_BY_KIND[kind];
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM ${table} WHERE id = $1`,
      [id],
    );
    const head = rows[0];
    if (!head) throw new NotFoundError(kind, id);
    if (head.deleted_at === null) {
      throw new ConflictError(
        'This record is already active.',
        'recycle_bin_already_restored',
      );
    }
    const ageMs = Date.now() - head.deleted_at.getTime();
    if (ageMs > GRACE_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      throw new ConflictError(
        'The 30-day grace window has elapsed. Recreate the record instead.',
        'recycle_bin_window_elapsed',
      );
    }

    await client.query(
      `UPDATE ${table} SET deleted_at = NULL WHERE id = $1`,
      [id],
    );
    return { id, kind, restoredAt: new Date().toISOString() };
  });
}

// ----- helpers --------------------------------------------------------

const TABLE_BY_KIND: Record<RecycleBinKind, string> = {
  user: 'xb_core.users',
  organization: 'xb_core.organizations',
  workspace: 'xb_core.workspaces',
};

interface ToEntryInput {
  id: string;
  kind: RecycleBinKind;
  label: string;
  organizationId: string | null;
  organizationName: string | null;
  deletedAt: Date;
  deletedBy: string | null;
}

function toEntry(input: ToEntryInput): RecycleBinEntry {
  const purgeMs =
    input.deletedAt.getTime() + GRACE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(
    0,
    Math.floor((purgeMs - Date.now()) / (24 * 60 * 60 * 1000)),
  );
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    deletedAt: input.deletedAt.toISOString(),
    deletedBy: input.deletedBy,
    purgeAt: new Date(purgeMs).toISOString(),
    daysRemaining,
  };
}
