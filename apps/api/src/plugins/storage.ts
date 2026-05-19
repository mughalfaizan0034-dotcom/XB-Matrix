import fp from 'fastify-plugin';
import { Storage } from '@google-cloud/storage';

/**
 * GCS storage decoration. ADC (Application Default Credentials) — works
 * both on Cloud Run (the runtime service account is used automatically)
 * and locally (gcloud auth application-default login).
 *
 * Surfaces a minimal `app.storage` interface so service-layer code doesn't
 * depend on the @google-cloud/storage type surface directly; this keeps
 * the upload service swappable (S3, local fs in tests) without a rewrite.
 */
export interface StorageClient {
  readonly uploadsBucket: string;
  upload(input: {
    objectKey: string;
    contentType: string;
    body: Buffer | NodeJS.ReadableStream;
    metadata?: Record<string, string>;
  }): Promise<{ bucket: string; objectKey: string; sizeBytes: number }>;
  delete(input: { bucket: string; objectKey: string }): Promise<void>;
  /**
   * Generate a v4 signed URL for downloading an object. Used by the
   * upload detail drawer to let the user re-download what they sent.
   * 15-minute TTL by default — short enough to not need careful
   * authorization on re-share.
   */
  signedDownloadUrl(input: {
    bucket: string;
    objectKey: string;
    ttlSeconds?: number;
    filename?: string;
  }): Promise<string>;
}

export const storagePlugin = fp(async (app) => {
  const uploadsBucket = process.env.GCS_UPLOADS_BUCKET;
  if (!uploadsBucket) {
    app.log.warn(
      'GCS_UPLOADS_BUCKET not set — upload routes will fail at runtime. Set it in api.service.yaml for prod and .env for local.',
    );
  }
  const gcs = new Storage();

  const client: StorageClient = {
    uploadsBucket: uploadsBucket ?? '',
    async upload({ objectKey, contentType, body, metadata }) {
      if (!uploadsBucket) throw new Error('GCS_UPLOADS_BUCKET not configured');
      const bucket = gcs.bucket(uploadsBucket);
      const file = bucket.file(objectKey);
      if (Buffer.isBuffer(body)) {
        await file.save(body, {
          contentType,
          resumable: false,
          metadata: { metadata },
        });
        return { bucket: uploadsBucket, objectKey, sizeBytes: body.byteLength };
      }
      // Streamed upload — buffer is preferred for files small enough to
      // fit in memory (true for typical CSV/XLSX). We keep the stream
      // path so we don't have to convert when callers already have one.
      await new Promise<void>((resolve, reject) => {
        const stream = file.createWriteStream({
          contentType,
          resumable: false,
          metadata: { metadata },
        });
        body.pipe(stream).on('finish', resolve).on('error', reject);
      });
      const [meta] = await file.getMetadata();
      return { bucket: uploadsBucket, objectKey, sizeBytes: Number(meta.size ?? 0) };
    },
    async delete({ bucket, objectKey }) {
      await gcs.bucket(bucket).file(objectKey).delete({ ignoreNotFound: true });
    },
    async signedDownloadUrl({ bucket, objectKey, ttlSeconds = 900, filename }) {
      const [url] = await gcs
        .bucket(bucket)
        .file(objectKey)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + ttlSeconds * 1000,
          responseDisposition: filename
            ? `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`
            : undefined,
        });
      return url;
    },
  };

  app.decorate('storage', client);
});

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageClient;
  }
}
