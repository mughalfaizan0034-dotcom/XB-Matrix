'use client';

import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  RefreshCcw,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Drawer, useToast } from '@xb/ui';
import {
  fetchUploadDownloadUrl,
  useRetryUpload,
  useUpload,
  type UploadStatus,
  type UploadSummary,
} from '@/lib/api-uploads';
import { describeError } from '@/lib/session';

const STATUS_TONE: Record<UploadStatus, 'success' | 'warning' | 'neutral' | 'danger'> = {
  queued:     'neutral',
  uploading:  'warning',
  validating: 'warning',
  ready:      'success',
  failed:     'danger',
};

const STATUS_ICON: Record<UploadStatus, React.ComponentType<{ className?: string }>> = {
  queued:     Clock,
  uploading:  Loader2,
  validating: Loader2,
  ready:      CheckCircle2,
  failed:     XCircle,
};

interface Props {
  readonly uploadId: string | null;
  readonly onClose: () => void;
}

export function UploadDetailDrawer({ uploadId, onClose }: Props) {
  const open = uploadId !== null;
  const { data: upload, isLoading } = useUpload(uploadId);
  const retry = useRetryUpload();
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    if (!upload) return;
    setDownloading(true);
    try {
      const url = await fetchUploadDownloadUrl(upload.id);
      // Open in a new tab — the signed URL triggers a download via
      // content-disposition so the user gets a save dialog.
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast.push('error', describeError(err));
    } finally {
      setDownloading(false);
    }
  }

  async function onRetry() {
    if (!upload) return;
    try {
      await retry.mutateAsync(upload.id);
      toast.push('success', 'Retry queued.');
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={upload ? upload.originalFilename : 'Upload'}
      description={upload ? `Uploaded ${formatDateTime(upload.createdAt)}` : undefined}
    >
      {isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : !upload ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Upload not found.</div>
      ) : (
        <div className="flex flex-col gap-5">
          <StatusBlock upload={upload} />

          <Section title="File">
            <KeyValue label="Filename" value={upload.originalFilename} mono />
            <KeyValue label="Content type" value={upload.contentType} />
            <KeyValue label="Size" value={humanSize(upload.fileSizeBytes)} />
            <KeyValue label="SHA-256" value={upload.sha256} mono truncate />
            <KeyValue label="Kind" value={upload.uploadKind} />
          </Section>

          <Section title="Lifecycle">
            <KeyValue label="Created" value={formatDateTime(upload.createdAt)} />
            <KeyValue label="Updated" value={formatDateTime(upload.updatedAt)} />
            <KeyValue label="Retries" value={String(upload.retryCount)} />
            {upload.validationStartedAt ? (
              <KeyValue label="Validation started" value={formatDateTime(upload.validationStartedAt)} />
            ) : null}
            {upload.validationCompletedAt ? (
              <KeyValue label="Validation finished" value={formatDateTime(upload.validationCompletedAt)} />
            ) : null}
          </Section>

          {upload.errorMessage ? (
            <Section title="Error">
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>{upload.errorMessage}</div>
              </div>
            </Section>
          ) : null}

          {upload.validationSummary ? (
            <Section title="Validation summary">
              {/* Opaque blob — per-module validators define the shape. The
                  drawer just renders a readable snapshot until a future
                  slice adds a typed renderer per upload kind. */}
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
                {JSON.stringify(upload.validationSummary, null, 2)}
              </pre>
            </Section>
          ) : (
            <Section title="Validation">
              <p className="text-xs text-muted-foreground">
                No validator is wired for <code className="font-mono">{upload.uploadKind}</code> yet —
                files are stored but not parsed. Per-module validators land with each business
                module (sales, inventory, ad spend).
              </p>
            </Section>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button size="sm" variant="outline" onClick={onDownload} disabled={downloading}>
              <Download className="mr-1 h-3.5 w-3.5" />
              {downloading ? 'Preparing…' : 'Download original'}
            </Button>
            {upload.uploadStatus === 'failed' ? (
              <Button size="sm" variant="outline" onClick={onRetry} disabled={retry.isPending}>
                <RefreshCcw className="mr-1 h-3.5 w-3.5" />
                {retry.isPending ? 'Queuing…' : 'Retry'}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function StatusBlock({ upload }: { upload: UploadSummary }) {
  const Icon = STATUS_ICON[upload.uploadStatus];
  const spinning = upload.uploadStatus === 'uploading' || upload.uploadStatus === 'validating';
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
      <Icon className={spinning ? 'h-4 w-4 animate-spin text-muted-foreground' : 'h-4 w-4 text-muted-foreground'} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground capitalize">
            {upload.uploadStatus.replace('_', ' ')}
          </span>
          <Badge tone={STATUS_TONE[upload.uploadStatus]}>{upload.uploadStatus}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {STATUS_DESCRIPTION[upload.uploadStatus]}
        </div>
      </div>
    </div>
  );
}

const STATUS_DESCRIPTION: Record<UploadStatus, string> = {
  queued:     'Waiting to be picked up for processing.',
  uploading:  'Bytes are streaming to storage.',
  validating: 'Running validation against the registered schema.',
  ready:      'Stored successfully and available for downstream pipelines.',
  failed:     'Something went wrong — see the error message below. You can retry.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function KeyValue({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-baseline gap-3 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={[
          'text-foreground',
          mono ? 'font-mono text-xs' : '',
          truncate ? 'truncate' : 'break-all',
        ].join(' ')}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
