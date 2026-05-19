import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import type {
  ActorContext,
  OrganizationId,
  WorkspaceId,
} from '@xb/types';
import { NotFoundError, SemanticError } from '../lib/errors.js';

export type UploadStatus = 'queued' | 'uploading' | 'validating' | 'ready' | 'failed';

export const UPLOAD_KINDS = [
  'generic',
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
  if (!actor.organizationId) {
    throw new SemanticError('Uploads require an organization context.', 'no_org');
  }
  const orgId = actor.organizationId;

  await app.assertPermission(actor, {
    organizationId: orgId,
    workspaceId: input.workspaceId,
    module: 'uploads',
    action: 'create',
  });

  // Workspace must exist + belong to the actor's org. Defense in depth
  // beyond RLS so we 404 cleanly instead of leaking via a constraint
  // violation.
  const ws = await app.pg
    .query<{ organization_id: string; workspace_status: string }>(
      `SELECT organization_id, workspace_status
         FROM xb_core.workspaces
        WHERE id = $1 AND deleted_at IS NULL`,
      [input.workspaceId],
    )
    .then((r) => r.rows[0]);
  if (!ws) throw new NotFoundError('workspace', input.workspaceId);
  if (ws.organization_id !== orgId && !actor.isInternalManager) {
    throw new NotFoundError('workspace', input.workspaceId);
  }
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
      await client.query(
        `INSERT INTO xb_core.uploads
           (id, organization_id, workspace_id, upload_kind, original_filename,
            content_type, file_size_bytes, sha256, storage_bucket, storage_object_key,
            upload_status, created_by_actor_id, updated_by_actor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ready', $11, $11)`,
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
          actor.actorId,
        ],
      );
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
