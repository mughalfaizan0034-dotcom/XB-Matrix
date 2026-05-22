import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import type {
  ActorContext,
  OrganizationId,
  WorkspaceId,
} from '@xb/types';
import { ConflictError, NotFoundError, SemanticError } from '../lib/errors.js';
import { requireActiveWorkspace } from './workspace-service.js';
import { getValidator } from '../uploads/validators/index.js';
import { getMapper } from '../uploads/mappers/index.js';
import { writeUnresolvedQueue } from '../uploads/mappers/helpers.js';
import type { NormalizedSale } from '../uploads/mappers/types.js';
import type { SalesPerformanceRow } from '../uploads/mappers/sales-performance.js';
import { writeChannelSales } from '../uploads/canonical/channel-sales-writer.js';

export type UploadStatus = 'queued' | 'uploading' | 'validating' | 'ready' | 'failed';

export const UPLOAD_KINDS = [
  // Generic passthrough (no parsing, no canonical) — for PDFs, unsupported
  // exports, arbitrary files.
  'generic',

  // All-channel normalized templates — the PRIMARY operational
  // upload kinds (2026-05-20 direction). One template per dataset,
  // with marketplace/platform as a column dimension. A single file
  // can carry rows from any combination of marketplaces. See
  // memory/feedback_uploads_are_operational_categories.
  'sales_performance',
  'inventory_position',
  'advertising_performance',

  // Per-marketplace ADAPTERS — keep their platform's native field
  // names at the ingestion edge for convenience when an operator
  // exports straight from the platform. The mapper translates these
  // to the same Normalized* contract the all-channel templates
  // produce. Demoted in the UI; still accessible as advanced
  // ingestion paths.
  'amazon_sales',
  'amazon_inventory',
  'amazon_ads',
  'walmart_sales',

  // LEGACY kinds shipped before the spec landed. Validators here write
  // to the temporary canonical tables (sales_orders, inventory_snapshots).
  // They stay live so existing test data isn't orphaned; bridged to the
  // new shape when canonical tables ship, then dropped.
  'sales',
  'inventory',
  'ad_spend',
  'shipments',
  'returns',
] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export interface UploadSummary {
  readonly id: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly uploadKind: UploadKind;
  readonly originalFilename: string;
  readonly contentType: string;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly storageBucket: string;
  readonly storageObjectKey: string;
  readonly uploadStatus: UploadStatus;
  readonly validationSummary: Record<string, unknown> | null;
  readonly errorMessage: string | null;
  readonly retryCount: number;
  readonly validationStartedAt: string | null;
  readonly validationCompletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdByActorId: string | null;
  readonly rowVersion: number;
}

interface UploadRow {
  id: string;
  organization_id: string;
  workspace_id: string;
  upload_kind: UploadKind;
  original_filename: string;
  content_type: string;
  file_size_bytes: string; // bigint comes back as string from pg
  sha256: string;
  storage_bucket: string;
  storage_object_key: string;
  upload_status: UploadStatus;
  validation_summary: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
  validation_started_at: Date | null;
  validation_completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by_actor_id: string | null;
  row_version: number;
}

const SELECT_UPLOAD = `
  SELECT id, organization_id, workspace_id, upload_kind, original_filename,
         content_type, file_size_bytes::text AS file_size_bytes, sha256,
         storage_bucket, storage_object_key, upload_status, validation_summary,
         error_message, retry_count, validation_started_at, validation_completed_at,
         created_at, updated_at, created_by_actor_id, row_version
    FROM xb_core.uploads
   WHERE deleted_at IS NULL
`;

function rowToUpload(r: UploadRow): UploadSummary {
  return {
    id: r.id,
    organizationId: r.organization_id,
    workspaceId: r.workspace_id,
    uploadKind: r.upload_kind,
    originalFilename: r.original_filename,
    contentType: r.content_type,
    fileSizeBytes: Number(r.file_size_bytes),
    sha256: r.sha256,
    storageBucket: r.storage_bucket,
    storageObjectKey: r.storage_object_key,
    uploadStatus: r.upload_status,
    validationSummary: r.validation_summary,
    errorMessage: r.error_message,
    retryCount: r.retry_count,
    validationStartedAt: r.validation_started_at ? r.validation_started_at.toISOString() : null,
    validationCompletedAt: r.validation_completed_at ? r.validation_completed_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    createdByActorId: r.created_by_actor_id,
    rowVersion: r.row_version,
  };
}

export interface CreateUploadInput {
  readonly workspaceId: WorkspaceId;
  readonly uploadKind: UploadKind;
  readonly originalFilename: string;
  readonly contentType: string;
  readonly body: Buffer;
}

/**
 * Persist an upload. Computes sha256 of the buffer, streams it to GCS,
 * and inserts the row in the workspace's tenant scope. Status starts at
 * `ready` because nothing actually validates yet — when per-module
 * validators land (sales, inventory, …) this transitions to `validating`
 * here and a worker job lifts it to `ready` or `failed`.
 *
 * The whole operation is best-effort transactional: if the GCS upload
 * succeeds but the DB insert fails, the row never appears and the orphan
 * object lingers in the bucket until a janitor sweep clears it. We
 * accept that trade — the alternative (insert first, upload second) is
 * worse because the user sees a row claiming to exist when the bytes
 * don't.
 */
export async function createUpload(
  app: FastifyInstance,
  actor: ActorContext,
  input: CreateUploadInput,
): Promise<UploadSummary> {
  // The organization is derived from the TARGET WORKSPACE, not the
  // actor. Internal managers / super admins have no organization of
  // their own but legitimately upload into any workspace they've
  // switched into. Org users are scoped to their own org's workspaces.
  // xb_core.workspaces is RLS-scoped — the lookup must run inside
  // withConnection so the actor's org context is set. A raw pool query
  // has no context and sees zero rows.
  const ws = await app
    .withConnection(actor, (client) =>
      client.query<{ organization_id: string; workspace_status: string }>(
        `SELECT organization_id, workspace_status
           FROM xb_core.workspaces
          WHERE id = $1 AND deleted_at IS NULL`,
        [input.workspaceId],
      ),
    )
    .then((r) => r.rows[0]);
  if (!ws) throw new NotFoundError('workspace', input.workspaceId);
  if (!actor.isInternalManager && ws.organization_id !== (actor.organizationId as string | null)) {
    throw new NotFoundError('workspace', input.workspaceId);
  }
  const orgId = ws.organization_id as OrganizationId;

  await app.assertPermission(actor, {
    organizationId: orgId,
    workspaceId: input.workspaceId,
    module: 'uploads',
    action: 'create',
  });

  if (ws.workspace_status !== 'active') {
    throw new SemanticError(
      `Cannot upload to a ${ws.workspace_status} workspace.`,
      'workspace_not_active',
    );
  }

  const id = ulid();
  const sha256 = createHash('sha256').update(input.body).digest('hex');
  const objectKey = `org/${orgId}/ws/${input.workspaceId}/uploads/${id}/${sanitizeFilename(input.originalFilename)}`;

  const uploadResult = await app.storage.upload({
    objectKey,
    contentType: input.contentType,
    body: input.body,
    metadata: {
      organizationId: orgId,
      workspaceId: input.workspaceId,
      uploadId: id,
      sha256,
    },
  });

  try {
    return await app.withConnection(actor, async (client) => {
      // Lifecycle:
      //   no validator registered → insert as 'ready'; the file is
      //     stored, nothing else to do.
      //   validator registered → insert as 'validating', run the
      //     validator (which inserts canonical rows in this same tx),
      //     then transition to 'ready' or 'failed' with the summary.
      // Either way the user sees a complete state by the time the
      // POST returns. When async workers land for large files this is
      // where the queued → handoff happens.
      const validator = getValidator(input.uploadKind);
      const initialStatus = validator ? 'validating' : 'ready';

      await client.query(
        `INSERT INTO xb_core.uploads
           (id, organization_id, workspace_id, upload_kind, original_filename,
            content_type, file_size_bytes, sha256, storage_bucket, storage_object_key,
            upload_status, validation_started_at, created_by_actor_id, updated_by_actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
        [
          id,
          orgId,
          input.workspaceId,
          input.uploadKind,
          input.originalFilename,
          input.contentType,
          uploadResult.sizeBytes,
          sha256,
          uploadResult.bucket,
          uploadResult.objectKey,
          initialStatus,
          validator ? new Date() : null,
          actor.actorId,
        ],
      );

      if (validator) {
        const result = await validator.validate({
          app,
          actor,
          client,
          uploadId: id,
          organizationId: orgId,
          workspaceId: input.workspaceId,
          buffer: input.body,
          originalFilename: input.originalFilename,
        });

        // ----- Canonical layer wiring ----------------------------------
        // Validator → mapper → channel_sales writer (+ unresolved queue),
        // all in the upload's transaction so a failed canonical write
        // rolls the upload status back to 'validating' rather than
        // ending in a partial 'ready'.
        //
        // Sales is wired now; inventory_position / advertising_performance
        // land when channel_inventory / channel_ads canonical tables
        // ship. Legacy adapters (amazon_sales / walmart_sales) wire here
        // too once their validators surface parsed rows.
        const ingestionExtra: Record<string, unknown> = {};
        if (result.ok && result.rows && input.uploadKind === 'sales_performance') {
          const mapper = getMapper(input.uploadKind);
          if (mapper) {
            const mapResult = await mapper.map({
              app,
              actor,
              client,
              organizationId: orgId,
              workspaceId: input.workspaceId,
              uploadId: id,
              uploadKind: input.uploadKind,
              rows: result.rows as ReadonlyArray<SalesPerformanceRow>,
            });
            const written = await writeChannelSales(
              app,
              client,
              actor,
              orgId,
              input.workspaceId,
              id,
              mapResult.mapped as ReadonlyArray<NormalizedSale>,
            );
            const queued = await writeUnresolvedQueue(
              app,
              client,
              actor,
              orgId,
              input.workspaceId,
              id,
              input.uploadKind,
              mapResult.unresolved,
            );
            ingestionExtra.canonical = {
              target: 'xb_canonical.channel_sales',
              mapped: mapResult.stats.mappedCount,
              unresolved: mapResult.stats.unresolvedCount,
              upserted: written.upserted,
              removed: written.removed,
              unresolvedQueued: queued.inserted,
              unresolvedTruncated: queued.truncated,
            };
          }
        }

        const summaryToWrite = {
          ...result.summary,
          extra: { ...(result.summary.extra ?? {}), ...ingestionExtra },
        };

        await client.query(
          `UPDATE xb_core.uploads
              SET upload_status = $2,
                  validation_summary = $3::jsonb,
                  validation_completed_at = now(),
                  error_message = $4,
                  updated_by_actor_id = $5
            WHERE id = $1`,
          [
            id,
            result.ok ? 'ready' : 'failed',
            JSON.stringify(summaryToWrite),
            result.errorMessage ?? null,
            actor.actorId,
          ],
        );
      }

      const { rows } = await client.query<UploadRow>(`${SELECT_UPLOAD} AND id = $1`, [id]);
      if (!rows[0]) throw new Error('inserted upload vanished');
      return rowToUpload(rows[0]);
    });
  } catch (err) {
    // DB insert failed; clean up the orphan object so the bucket doesn't
    // accumulate junk on every failed write.
    await app.storage
      .delete({ bucket: uploadResult.bucket, objectKey: uploadResult.objectKey })
      .catch((cleanupErr) =>
        app.log.warn({ cleanupErr, objectKey: uploadResult.objectKey }, 'failed to clean up orphan upload object'),
      );
    throw err;
  }
}

export interface ListUploadsOptions {
  readonly workspaceId?: WorkspaceId;
  readonly status?: UploadStatus;
  readonly q?: string;
  readonly sort?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

const UPLOAD_SORT_COLUMNS: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  filename: 'original_filename',
  status: 'upload_status',
  size: 'file_size_bytes',
  kind: 'upload_kind',
};

export interface UploadListResult {
  readonly items: ReadonlyArray<UploadSummary>;
  readonly total: number;
  readonly hasMore: boolean;
}

export async function listUploads(
  app: FastifyInstance,
  actor: ActorContext,
  opts: ListUploadsOptions = {},
): Promise<UploadListResult> {
  if (!actor.organizationId && !actor.isInternalManager) {
    return { items: [], total: 0, hasMore: false };
  }
  await app.assertPermission(actor, {
    organizationId: (actor.organizationId ?? 'platform') as OrganizationId,
    workspaceId: opts.workspaceId ?? null,
    module: 'uploads',
    action: 'view',
  });

  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 200);
  const page = Math.max(opts.page ?? 0, 0);
  const offset = page * pageSize;

  const where: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (opts.workspaceId) {
    where.push(`workspace_id = $${idx++}`);
    params.push(opts.workspaceId);
  } else if (!actor.isInternalManager && actor.organizationId) {
    where.push(`organization_id = $${idx++}`);
    params.push(actor.organizationId);
  }
  if (opts.status) {
    where.push(`upload_status = $${idx++}`);
    params.push(opts.status);
  }
  if (opts.q && opts.q.trim()) {
    where.push(`lower(original_filename) LIKE $${idx++}`);
    params.push(`%${opts.q.trim().toLowerCase()}%`);
  }
  const whereSql = where.length ? `AND ${where.join(' AND ')}` : '';

  const sortKey = (opts.sort ?? '-createdAt').replace(/^-/, '');
  const sortDesc = (opts.sort ?? '-createdAt').startsWith('-');
  const sortColumn = UPLOAD_SORT_COLUMNS[sortKey] ?? 'created_at';
  const sortDirection = sortDesc ? 'DESC' : 'ASC';

  return app.withConnection(actor, async (client) => {
    const { rows: countRows } = await client.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM xb_core.uploads WHERE deleted_at IS NULL ${whereSql}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const dataParams = [...params, pageSize, offset];
    const { rows } = await client.query<UploadRow>(
      `${SELECT_UPLOAD} ${whereSql} ORDER BY ${sortColumn} ${sortDirection}, id ${sortDirection} LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams,
    );
    const items = rows.map(rowToUpload);
    return { items, total, hasMore: offset + items.length < total };
  });
}

export async function getUpload(
  app: FastifyInstance,
  actor: ActorContext,
  id: string,
): Promise<UploadSummary | null> {
  return app.withConnection(actor, async (client) => {
    const { rows } = await client.query<UploadRow>(`${SELECT_UPLOAD} AND id = $1`, [id]);
    const row = rows[0];
    if (!row) return null;
    await app.assertPermission(actor, {
      organizationId: row.organization_id as OrganizationId,
      workspaceId: row.workspace_id as WorkspaceId,
      module: 'uploads',
      action: 'view',
    });
    return rowToUpload(row);
  });
}

/**
 * Hard-delete an upload row + its stored object. Same write-context
 * gate as retry — the operator must be in the upload's own workspace.
 * Derived canonical rows reference the upload via FK RESTRICT; if any
 * exist the delete fails with a clear error so the operator can reset
 * those first.
 */
export async function deleteUpload(
  app: FastifyInstance,
  actor: ActorContext,
  id: string,
): Promise<void> {
  await app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<UploadRow>(`${SELECT_UPLOAD} AND id = $1`, [id]);
    const row = existing[0];
    if (!row) throw new NotFoundError('upload', id);
    await app.assertPermission(actor, {
      organizationId: row.organization_id as OrganizationId,
      workspaceId: row.workspace_id as WorkspaceId,
      module: 'uploads',
      action: 'delete',
    });
    const active = await requireActiveWorkspace(app, actor, actor.sessionId, 'edit');
    if (active.workspaceId !== row.workspace_id) {
      throw new ConflictError(
        "Switch to this upload's workspace before deleting it.",
        'workspace_mismatch',
      );
    }
    try {
      await client.query(`DELETE FROM xb_core.uploads WHERE id = $1`, [id]);
    } catch (err) {
      if ((err as { code?: string }).code === '23503') {
        throw new ConflictError(
          'This upload has derived canonical rows. Reset those first, then retry.',
          'has_canonical_dependencies',
        );
      }
      throw err;
    }
    // Storage cleanup is best-effort — the row is already gone, so a
    // bucket failure becomes an orphan object for a future cleanup job
    // rather than blocking the delete.
    await app.storage
      .delete({ bucket: row.storage_bucket, objectKey: row.storage_object_key })
      .catch((cleanupErr) =>
        app.log.warn(
          { cleanupErr, uploadId: id, objectKey: row.storage_object_key },
          'failed to delete upload storage object',
        ),
      );
  });
}

/**
 * Retry: bump retry_count, clear error + validation, transition back to
 * queued. Real retry semantics (re-enqueue worker job) land when the
 * Cloud Tasks validation pipeline lands; for now this is a state reset.
 */
export async function retryUpload(
  app: FastifyInstance,
  actor: ActorContext,
  id: string,
): Promise<UploadSummary> {
  return app.withConnection(actor, async (client) => {
    const { rows: existing } = await client.query<UploadRow>(`${SELECT_UPLOAD} AND id = $1`, [id]);
    const row = existing[0];
    if (!row) throw new NotFoundError('upload', id);
    await app.assertPermission(actor, {
      organizationId: row.organization_id as OrganizationId,
      workspaceId: row.workspace_id as WorkspaceId,
      module: 'uploads',
      action: 'edit',
    });
    // Retry re-queues ingestion — a write. It must run inside the
    // upload's own workspace as the pinned session context, so a stale
    // or cross-workspace client can't trigger processing elsewhere.
    const active = await requireActiveWorkspace(app, actor, actor.sessionId, 'edit');
    if (active.workspaceId !== row.workspace_id) {
      throw new ConflictError(
        "Switch to this upload's workspace before retrying it.",
        'workspace_mismatch',
      );
    }
    if (row.upload_status !== 'failed') {
      throw new SemanticError(
        `Only failed uploads can be retried (current status: ${row.upload_status}).`,
        'not_retriable',
      );
    }
    await client.query(
      `UPDATE xb_core.uploads
          SET upload_status = 'queued',
              error_message = NULL,
              validation_summary = NULL,
              validation_started_at = NULL,
              validation_completed_at = NULL,
              retry_count = retry_count + 1,
              updated_by_actor_id = $2
        WHERE id = $1`,
      [id, actor.actorId],
    );
    const { rows } = await client.query<UploadRow>(`${SELECT_UPLOAD} AND id = $1`, [id]);
    if (!rows[0]) throw new Error('upload vanished after retry');
    return rowToUpload(rows[0]);
  });
}

/**
 * Generate a temporary download URL for an upload's original bytes. The
 * underlying object is private; this is a v4 signed URL with a short TTL
 * that the browser can fetch directly.
 */
export async function uploadDownloadUrl(
  app: FastifyInstance,
  actor: ActorContext,
  id: string,
): Promise<{ url: string; expiresAt: string }> {
  const upload = await getUpload(app, actor, id);
  if (!upload) throw new NotFoundError('upload', id);
  await app.assertPermission(actor, {
    organizationId: upload.organizationId as OrganizationId,
    workspaceId: upload.workspaceId as WorkspaceId,
    module: 'uploads',
    action: 'view',
  });
  const ttl = 15 * 60;
  const url = await app.storage.signedDownloadUrl({
    bucket: upload.storageBucket,
    objectKey: upload.storageObjectKey,
    ttlSeconds: ttl,
    filename: upload.originalFilename,
  });
  return { url, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() };
}

function sanitizeFilename(name: string): string {
  // GCS allows almost any character in object names but our key path also
  // ends up in audit metadata + logs; keeping it ASCII-safe avoids quoting
  // issues without losing meaningful information.
  return name.replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 240) || 'upload';
}
