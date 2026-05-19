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
              <ValidationSummaryRenderer summary={upload.validationSummary} />
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

/**
 * Renders any validator's summary blob. The common envelope shape
 * (rowsParsed/Accepted/Rejected, columns, errors) is rendered as a
 * structured panel for every kind. The opaque `extra` block falls
 * through to a typed renderer when we recognize it (e.g., sales gets
 * total amount, date range, distinct SKUs).
 */
function ValidationSummaryRenderer({ summary }: { summary: Record<string, unknown> }) {
  const s = summary as Partial<{
    rowsParsed: number;
    rowsAccepted: number;
    rowsRejected: number;
    columnsDetected: string[];
    columnsMissing: string[];
    errors: Array<{ row: number; column?: string; message: string }>;
    extra: Record<string, unknown>;
  }>;

  const hasStandardShape = typeof s.rowsParsed === 'number';
  if (!hasStandardShape) {
    // Unknown shape — fall back to raw JSON so the data is still inspectable.
    return (
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
        {JSON.stringify(summary, null, 2)}
      </pre>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <SummaryStat label="Parsed" value={(s.rowsParsed ?? 0).toLocaleString()} />
        <SummaryStat
          label="Accepted"
          value={(s.rowsAccepted ?? 0).toLocaleString()}
          tone={s.rowsAccepted ? 'success' : 'neutral'}
        />
        <SummaryStat
          label="Rejected"
          value={(s.rowsRejected ?? 0).toLocaleString()}
          tone={s.rowsRejected ? 'danger' : 'neutral'}
        />
      </div>

      <SalesExtraPanel extra={s.extra} />

      {s.columnsMissing && s.columnsMissing.length > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <div className="font-semibold">Missing required columns</div>
          <div className="mt-1 font-mono">{s.columnsMissing.join(', ')}</div>
        </div>
      ) : null}

      {s.columnsDetected && s.columnsDetected.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Detected columns ({s.columnsDetected.length})
          </summary>
          <div className="mt-1 break-all font-mono text-[11px] text-foreground">
            {s.columnsDetected.join(', ')}
          </div>
        </details>
      ) : null}

      {s.errors && s.errors.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Errors ({s.errors.length} shown
            {typeof s.rowsRejected === 'number' && s.rowsRejected > s.errors.length
              ? ` of ${s.rowsRejected}`
              : ''}
            )
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/20 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5">Row</th>
                  <th className="px-3 py-1.5">Column</th>
                  <th className="px-3 py-1.5">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.errors.map((e, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {e.row > 0 ? e.row : '—'}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-foreground">{e.column ?? '—'}</td>
                    <td className="px-3 py-1.5 text-foreground">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success' ? 'text-emerald-700' : tone === 'danger' ? 'text-red-700' : 'text-foreground';
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

/**
 * Sales-specific extras (totalGrossAmount, distinctSkus, dateRange).
 * Renders nothing when the upload isn't sales-kind or those fields
 * aren't present — safe to call for every validator's summary.
 */
function SalesExtraPanel({ extra }: { extra?: Record<string, unknown> }) {
  if (!extra) return null;
  const total = extra.totalGrossAmount;
  const distinctSkus = extra.distinctSkus;
  const dateRange = extra.dateRange as { from?: string; to?: string } | null | undefined;
  const note = extra.note;

  const hasAny =
    typeof total === 'string' ||
    typeof distinctSkus === 'number' ||
    (dateRange && (dateRange.from || dateRange.to));

  if (!hasAny && !note) return null;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs">
      {typeof total === 'string' ? (
        <KeyValue label="Gross amount" value={total} />
      ) : null}
      {typeof distinctSkus === 'number' ? (
        <KeyValue label="Distinct SKUs" value={distinctSkus.toLocaleString()} />
      ) : null}
      {dateRange && dateRange.from && dateRange.to ? (
        <KeyValue label="Date range" value={`${dateRange.from} → ${dateRange.to}`} />
      ) : null}
      {typeof note === 'string' ? (
        <p className="mt-2 text-muted-foreground">{note}</p>
      ) : null}
    </div>
  );
}

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
