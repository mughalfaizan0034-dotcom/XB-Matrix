import type { FastifyInstance } from 'fastify';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import type { ActorContext } from '@xb/types';
import { requirePlatformAdmin } from './platform-service.js';
import type { RecycleBinKind } from './recycle-bin-service.js';

/**
 * Purge orchestrator — operational hard-delete for users / orgs /
 * workspaces. Single entry point for both:
 *
 *   - manual force-delete-now from the Recycle Bin UI
 *   - the daily cron sweep that hard-deletes rows whose 30-day
 *     grace window has elapsed
 *
 * Per project_deletion_lifecycle memory:
 *
 *   active --(org admin Remove)--> soft_deleted --(30d)-->
 *   purge_scheduled --(orchestrator)--> purged
 *
 * Architectural rules embedded here:
 *
 *   1. NO purge logic inside route handlers. Every code path that
 *      hard-deletes an identity row goes through purgeEntity().
 *   2. Centralized dependency walk. The orchestrator deletes
 *      downstream rows explicitly in correct order inside a single
 *      transaction. FK CASCADE was deliberately NOT used in the
 *      schema migration so future "archive on purge" treatment of
 *      canonical data is a one-function edit, not another migration.
 *   3. purged_at is set in the SAME transaction as the DELETE — the
 *      audit_log entry captures both timestamps before the row
 *      disappears. After commit the row is gone but the audit row
 *      remains (audit_log has no FK to the parent entity, so the
 *      actor_id reference survives naturally — see
 *      project_deletion_lifecycle).
 *   4. Idempotent. Re-running against an already-purged or
 *      non-existent row is a 409, not a corruption.
 *   5. Observable. Every run emits a PurgeResult with counts,
 *      duration, failures, and skip reasons for the cron sweep to
 *      log + the platform audit surface to read.
 *
 * Operational deletion ONLY. Legal/compliance erasure
 * (GDPR right-to-erasure, retention enforcement) is a separate
 * system with separate vocabulary — do NOT overload this service
 * for it.
 */

const GRACE_WINDOW_DAYS = 30;

export type PurgeReason = 'manual' | 'expired';

export interface PurgedEntity {
  readonly kind: RecycleBinKind;
  readonly id: string;
  readonly reason: PurgeReason;
  readonly purgedAt: string;
}

export interface PurgeFailure {
  readonly kind: RecycleBinKind;
  readonly id: string;
  readonly error: string;
}

export interface PurgeSkip {
  readonly kind: RecycleBinKind;
  readonly id: string;
  readonly reason: 'not_found' | 'still_in_grace' | 'already_purged' | 'not_soft_deleted';
}

export interface PurgeResult {
  readonly purged: ReadonlyArray<PurgedEntity>;
  readonly failures: ReadonlyArray<PurgeFailure>;
  readonly skipped: ReadonlyArray<PurgeSkip>;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly finishedAt: string;
}

// ----- Single-entity purge -------------------------------------------

/**
 * Hard-delete one user / org / workspace and every downstream row that
 * referenced it. Runs in a single transaction; rolls back on any error.
 *
 * Reason:
 *   - 'manual'  : platform admin clicked Permanently delete in the bin
 *   - 'expired' : grace window elapsed; called by the cron sweep
 *
 * Manual purges require the row to be soft-deleted first; the recycle
 * bin UI enforces this and the API rejects with 409 otherwise.
 */
export async function purgeEntity(
  app: FastifyInstance,
  actor: ActorContext,
  kind: RecycleBinKind,
  id: string,
  reason: PurgeReason,
): Promise<PurgedEntity> {
  requirePlatformAdmin(actor);
  const table = TABLE_BY_KIND[kind];
  // app.withConnection already runs BEGIN / COMMIT / ROLLBACK around
  // the callback (audit-context plugin). Do NOT nest another BEGIN
  // here: Postgres treats it as a no-op with a warning, the inner
  // COMMIT then closes the OUTER transaction prematurely, and the
  // SET LOCAL connection-context settings (actor id, is_internal_manager)
  // get dropped before audit triggers fire. The 500s observed in
  // 2026-05-25 came from exactly this layering bug.
  return app.withConnection(actor, async (client) => {
    // Pull the protection-relevant columns inline with the lock so the
    // self-row and super_admin guards run before any dependent walk
    // touches data. For non-user kinds the extra columns are NULL
    // and the guards are no-ops.
    const protectedCols =
      kind === 'user' ? ', actor_id, internal_user_role' : '';
    const { rows } = await client.query<{
      deleted_at: Date | null;
      purged_at: Date | null;
      actor_id?: string | null;
      internal_user_role?: string | null;
    }>(
      `SELECT deleted_at, purged_at${protectedCols} FROM ${table} WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const head = rows[0];
    if (!head) throw new NotFoundError(kind, id);
    if (head.purged_at !== null) {
      throw new ConflictError(
        'This record is already purged.',
        'purge_already_completed',
      );
    }
    if (head.deleted_at === null) {
      throw new ConflictError(
        'Cannot purge an active record. Soft-delete first.',
        'purge_not_soft_deleted',
      );
    }

    // Protected-entity guards. NEVER purge:
    //   - the current actor's own user row (would orphan the request
    //     mid-transaction and lock the user out)
    //   - the super_admin row (exactly one exists per the auth model;
    //     purging it leaves the platform with no full-bypass account)
    // Defense in depth: the soft-delete code paths already refuse
    // these (users-service.removeUser checks isSelf + super_admin),
    // so these rows should never appear in the recycle bin. The
    // backstop catches manual DB inserts, migration drift, and any
    // future code path that forgets the upstream check.
    if (kind === 'user') {
      if (head.actor_id && head.actor_id === actor.actorId) {
        throw new ConflictError(
          'You cannot permanently delete your own account.',
          'purge_self_forbidden',
        );
      }
      if (head.internal_user_role === 'super_admin') {
        throw new ConflictError(
          'The super admin account is protected from permanent deletion.',
          'purge_super_admin_forbidden',
        );
      }
    }
    // For 'manual' (force-delete-now), any grace state is valid.
    // For 'expired' (cron sweep), refuse to purge if the row has not
    // actually crossed the grace window: defense in depth against
    // a misconfigured cron that runs early.
    if (reason === 'expired') {
      const ageMs = Date.now() - head.deleted_at.getTime();
      if (ageMs < GRACE_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
        throw new ConflictError(
          'Grace window has not elapsed yet.',
          'purge_within_grace_window',
        );
      }
    }

    // Walk dependents in correct order. Each kind has its own graph;
    // keep the per-kind branches explicit so a future change to one
    // does not cascade unexpected behavior to the others.
    if (kind === 'user') {
      await deleteUserDependents(client, id);
    } else if (kind === 'workspace') {
      await deleteWorkspaceDependents(client, id);
    } else {
      // organization
      await deleteOrganizationDependents(client, id);
    }

    // Stamp purged_at, then DELETE in the same transaction. The
    // stamp is captured by the AFTER UPDATE audit trigger before the
    // row itself disappears on the subsequent DELETE.
    const purgedAt = new Date().toISOString();
    await client.query(
      `UPDATE ${table} SET purged_at = $2 WHERE id = $1`,
      [id, purgedAt],
    );
    await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return { kind, id, reason, purgedAt };
  });
}

// ----- Daily sweep ----------------------------------------------------

/**
 * Daily cron entry point. Finds every soft-deleted row across the three
 * kinds whose grace window has elapsed and purges them. Batched to
 * keep transactions short; per-row failures are captured in the
 * result and never abort the whole sweep. Idempotent — running twice
 * back-to-back produces the same end state (second run finds zero
 * expired rows).
 *
 * BATCH_SIZE limits how many rows of each kind we attempt per run.
 * If a backlog builds (e.g., the cron was paused for a week and 1000
 * rows are now expired), the sweep finishes the batch and the next
 * scheduled run picks up the rest. This keeps any single run bounded
 * regardless of backlog size.
 */
const BATCH_SIZE = 100;

export async function runGracePurgeSweep(
  app: FastifyInstance,
  actor: ActorContext,
): Promise<PurgeResult> {
  requirePlatformAdmin(actor);
  const startedAt = new Date();
  const purged: PurgedEntity[] = [];
  const failures: PurgeFailure[] = [];
  const skipped: PurgeSkip[] = [];

  for (const kind of ['workspace', 'user', 'organization'] as const) {
    // Workspaces first, then users, then orgs — when a parent is
    // purged later, its already-purged children's IDs simply have no
    // referents, which is the desired terminal state. Doing children
    // first also keeps each per-row transaction smaller.
    const candidates = await app.withConnection(actor, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM ${TABLE_BY_KIND[kind]}
          WHERE deleted_at IS NOT NULL
            AND purged_at IS NULL
            AND deleted_at < now() - ($1 || ' days')::interval
          ORDER BY deleted_at ASC
          LIMIT $2`,
        [String(GRACE_WINDOW_DAYS), BATCH_SIZE],
      );
      return rows.map((r) => r.id);
    });

    for (const id of candidates) {
      try {
        const result = await purgeEntity(app, actor, kind, id, 'expired');
        purged.push(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        // Conflict-class errors are "skipped, expected" — e.g., the row
        // was force-purged between the candidate scan and the actual
        // call. Treat as skip, not failure, so observability stays
        // signal-rich.
        if (error.includes('purge_already_completed')) {
          skipped.push({ kind, id, reason: 'already_purged' });
        } else if (error.includes('purge_within_grace_window')) {
          skipped.push({ kind, id, reason: 'still_in_grace' });
        } else if (error.includes('purge_not_soft_deleted')) {
          skipped.push({ kind, id, reason: 'not_soft_deleted' });
        } else if (err instanceof NotFoundError) {
          skipped.push({ kind, id, reason: 'not_found' });
        } else {
          failures.push({ kind, id, error });
        }
      }
    }
  }

  const finishedAt = new Date();
  return {
    purged,
    failures,
    skipped,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
}

// ----- Dependent-deletion helpers ------------------------------------

const TABLE_BY_KIND: Record<RecycleBinKind, string> = {
  user: 'xb_core.users',
  organization: 'xb_core.organizations',
  workspace: 'xb_core.workspaces',
};

type Client = import('pg').PoolClient;

/**
 * Run a DELETE that may target a table not present in every env
 * (legacy / not-yet-migrated). Swallows ONLY 'undefined_table'
 * (Postgres error code 42P01); every other error (FK violation,
 * permission denied, etc.) propagates so the wrapping transaction
 * rolls back and the API returns the real failure. Without this,
 * silent .catch() handlers hide FK constraint failures as if the
 * table never existed, producing baffling 500s in the outer DELETE.
 */
async function maybeDelete(
  client: Client,
  sql: string,
  params: ReadonlyArray<unknown>,
): Promise<void> {
  try {
    await client.query(sql, params as unknown[]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '42P01') return; // undefined_table
    throw err;
  }
}

/**
 * Deleting a user. Identity-only entity; sessions, tokens, and
 * permission grants are all that point at the row. Audit references
 * are column-only (no FK) so historical actor_id values survive.
 */
async function deleteUserDependents(client: Client, userId: string): Promise<void> {
  // permission grants
  await client.query(`DELETE FROM xb_core.workspace_permissions WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM xb_core.page_permissions      WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM xb_core.internal_permissions  WHERE internal_user_id = $1`, [userId]);

  // sessions + tokens (auth_tokens may not exist in every env post auth-pivot)
  await client.query(`DELETE FROM xb_core.sessions     WHERE user_id = $1`, [userId]);
  await maybeDelete(client, `DELETE FROM xb_core.auth_tokens WHERE user_id = $1`, [userId]);
}

/**
 * Deleting a workspace. Operational dependents (uploads, canonical
 * data, permission scopes) all go with it. Sessions whose
 * active_workspace_id pointed here get NULLed so the user keeps the
 * session but bounces to the picker on next page load.
 */
async function deleteWorkspaceDependents(client: Client, workspaceId: string): Promise<void> {
  // permission scopes
  await client.query(`DELETE FROM xb_core.workspace_permissions WHERE workspace_id = $1`, [workspaceId]);
  await client.query(`DELETE FROM xb_core.page_permissions      WHERE workspace_id = $1`, [workspaceId]);
  await maybeDelete(client, `DELETE FROM xb_core.workspace_permission_snapshots WHERE workspace_id = $1`, [workspaceId]);

  // canonical data; workspace-scoped rows are meaningless without
  // the workspace. Future: archive to a tombstone table instead.
  await maybeDelete(client, `DELETE FROM xb_canonical.channel_sales  WHERE workspace_id = $1`, [workspaceId]);
  await maybeDelete(client, `DELETE FROM xb_canonical.channel_ads    WHERE workspace_id = $1`, [workspaceId]);
  await maybeDelete(client, `DELETE FROM xb_canonical.sales_orders   WHERE workspace_id = $1`, [workspaceId]);
  await maybeDelete(client, `DELETE FROM xb_canonical.inventory_snapshots WHERE workspace_id = $1`, [workspaceId]);

  // identity layer (sku_aliases + unresolved_sku_rows live in xb_master, not xb_core)
  await maybeDelete(client, `DELETE FROM xb_master.sku_aliases         WHERE workspace_id = $1`, [workspaceId]);
  await maybeDelete(client, `DELETE FROM xb_master.unresolved_sku_rows WHERE workspace_id = $1`, [workspaceId]);

  // ingestion records
  await maybeDelete(client, `DELETE FROM xb_core.uploads WHERE workspace_id = $1`, [workspaceId]);

  // sessions keep living, just lose their active workspace pointer
  await client.query(
    `UPDATE xb_core.sessions SET active_workspace_id = NULL WHERE active_workspace_id = $1`,
    [workspaceId],
  );
}

/**
 * Deleting an organization. Cascades through every workspace under
 * it (each gets the workspace-dependent cleanup), then drops every
 * user (each gets the user-dependent cleanup), then the org-scoped
 * leftovers (idempotency, org-scope sessions, actors).
 */
async function deleteOrganizationDependents(client: Client, orgId: string): Promise<void> {
  // workspaces in this org — fan out per-workspace cleanup, then
  // delete the workspace row itself
  const { rows: workspaces } = await client.query<{ id: string }>(
    `SELECT id FROM xb_core.workspaces WHERE organization_id = $1`,
    [orgId],
  );
  for (const w of workspaces) {
    await deleteWorkspaceDependents(client, w.id);
    await client.query(`DELETE FROM xb_core.workspaces WHERE id = $1`, [w.id]);
  }

  // users in this org — fan out per-user cleanup, then delete the user
  const { rows: users } = await client.query<{ id: string }>(
    `SELECT id FROM xb_core.users WHERE organization_id = $1`,
    [orgId],
  );
  for (const u of users) {
    await deleteUserDependents(client, u.id);
    await client.query(`DELETE FROM xb_core.users WHERE id = $1`, [u.id]);
  }

  // org-scoped leftovers. idempotency_keys may not exist in every
  // env; the others are core schema and must exist.
  await client.query(`DELETE FROM xb_core.sessions WHERE organization_id = $1`, [orgId]);
  await maybeDelete(client, `DELETE FROM xb_core.idempotency_keys WHERE organization_id = $1`, [orgId]);
  await client.query(`DELETE FROM xb_core.actors   WHERE organization_id = $1`, [orgId]);
}
