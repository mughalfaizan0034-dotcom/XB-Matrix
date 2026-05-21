import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { WorkspaceId } from '@xb/types';
import {
  createUpload,
  getUpload,
  listUploads,
  retryUpload,
  uploadDownloadUrl,
  UPLOAD_KINDS,
  type UploadKind,
  type UploadStatus,
} from '../services/upload-service.js';
import { requireActiveWorkspace } from '../services/workspace-service.js';
import { NotFoundError, SemanticError } from '../lib/errors.js';
import { ok } from '../lib/http-helpers.js';

const ULID = z.string().length(26);

const ListQuery = z.object({
  workspaceId: ULID.optional(),
  status: z.enum(['queued', 'uploading', 'validating', 'ready', 'failed']).optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().min(0).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

const IdParam = z.object({ id: ULID });

/**
 * 32 MB cap — comfortably under Cloud Run's request size limit and
 * sufficient for typical CSV/XLSX exports. Files beyond this need
 * resumable / signed-URL uploads, which we'll add when an actual module
 * requires it (e.g., shipment label batches with images).
 */
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  // Register the multipart parser scoped to this route group so the
  // platform-wide body-parser limit doesn't apply to other endpoints.
  await app.register((await import('@fastify/multipart')).default, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1, // one file per request — keeps the lifecycle obvious
      fields: 10,
    },
  });

  app.get('/', async (req) => {
    const actor = req.requireActor();
    const q = ListQuery.parse(req.query);
    const result = await listUploads(app, actor, {
      ...q,
      workspaceId: q.workspaceId as WorkspaceId | undefined,
    });
    return ok(
      {
        items: result.items,
        page: { cursor: null, hasMore: result.hasMore, total: result.total },
      },
      req.id,
    );
  });

  app.get('/:id', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const upload = await getUpload(app, actor, id);
    if (!upload) throw new NotFoundError('upload', id);
    return ok({ upload }, req.id);
  });

  app.get('/:id/download-url', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const { url, expiresAt } = await uploadDownloadUrl(app, actor, id);
    return ok({ url, expiresAt }, req.id);
  });

  /**
   * POST multipart/form-data:
   *   file (required) — the file
   *   kind (optional) — upload kind, defaults to `generic`
   *
   * The target workspace is NOT taken from the request — it is the
   * session's active workspace, resolved server-side via
   * requireActiveWorkspace. A client in "All workspaces" mode (no
   * active workspace) cannot create uploads; this is the read-only
   * guarantee for global mode and the no-leakage guarantee for writes.
   *
   * The multipart parser streams the file into a buffer here. For files
   * approaching MAX_UPLOAD_BYTES this is fine — Cloud Run gives us
   * 512MB memory per request and we cap at 32MB. Larger files will need
   * signed-URL upload (browser → GCS direct) which we'll add when a
   * concrete module requires it.
   */
  app.post('/', async (req, res) => {
    const actor = req.requireActor();
    if (!req.isMultipart()) {
      throw new SemanticError('Expected multipart/form-data.', 'not_multipart');
    }

    // Resolve the write context before consuming the file body, so an
    // upload with no pinned workspace fails fast without buffering.
    const { workspaceId } = await requireActiveWorkspace(app, actor, actor.sessionId);

    let kindRaw: string | undefined;
    let filePart: {
      buffer: Buffer;
      filename: string;
      mimetype: string;
    } | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'field') {
        // workspaceId from the client is intentionally ignored — the
        // write target is the session's active workspace, never a
        // client-supplied value.
        if (part.fieldname === 'kind') kindRaw = String(part.value);
      } else if (part.type === 'file') {
        if (filePart) {
          // Drain remaining parts before throwing so the connection closes cleanly.
          await part.toBuffer().catch(() => undefined);
          throw new SemanticError('Only one file per upload.', 'too_many_files');
        }
        const buf = await part.toBuffer();
        filePart = {
          buffer: buf,
          filename: part.filename || 'upload',
          mimetype: part.mimetype || 'application/octet-stream',
        };
      }
    }

    if (!filePart) throw new SemanticError('No file provided.', 'no_file');

    // CSV-only ingestion — this is a structured pipeline, not document
    // storage. Extension is the reliable gate; browser MIME for CSV is
    // inconsistent. Rejects XLSX / PDF / images / archives.
    if (!filePart.filename.toLowerCase().endsWith('.csv')) {
      throw new SemanticError(
        'Only .csv files are accepted. Export spreadsheets or reports to CSV first.',
        'non_csv_upload',
      );
    }

    const kind: UploadKind = (UPLOAD_KINDS as ReadonlyArray<string>).includes(kindRaw ?? '')
      ? (kindRaw as UploadKind)
      : 'generic';

    const upload = await createUpload(app, actor, {
      workspaceId,
      uploadKind: kind,
      originalFilename: filePart.filename,
      contentType: filePart.mimetype,
      body: filePart.buffer,
    });
    res.status(201);
    return ok({ upload }, req.id);
  });

  app.post('/:id/retry', async (req) => {
    const actor = req.requireActor();
    const { id } = IdParam.parse(req.params);
    const upload = await retryUpload(app, actor, id);
    return ok({ upload }, req.id);
  });
};

// Re-export for callers that want the literal status union without importing
// the service module directly.
export type { UploadKind, UploadStatus };
