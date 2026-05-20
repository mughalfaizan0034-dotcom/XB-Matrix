'use client';

import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Badge, Card, CardContent } from '@xb/ui';
import type { UploadSummary } from '@/lib/api-uploads';

/**
 * Lists uploads with status='failed' and surfaces their first error
 * samples + a link into the detail drawer for the full list. Lives in
 * its own tab in the Uploads module so a user trying to diagnose a
 * failed upload doesn't have to filter the main table by status.
 */
interface Props {
  readonly uploads: ReadonlyArray<UploadSummary>;
  readonly onOpenDetail: (id: string) => void;
}

export function UploadValidationErrorsPanel({ uploads, onOpenDetail }: Props) {
  const failed = useMemo(
    () => uploads.filter((u) => u.uploadStatus === 'failed'),
    [uploads],
  );

  if (failed.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No failed uploads in the current view. Failed uploads from prior workspaces or older
          dates won't show here — broaden the date filter on the History tab to see more.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {failed.map((u) => {
        const summary = u.validationSummary as
          | { errors?: Array<{ row: number; column?: string; message: string }>; rowsRejected?: number }
          | null;
        const errors = summary?.errors ?? [];
        const rejected = summary?.rowsRejected ?? errors.length;
        const shown = errors.slice(0, 5);

        return (
          <Card key={u.id}>
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(u.id)}
                      className="font-medium text-foreground hover:text-navy"
                    >
                      {u.originalFilename}
                    </button>
                    <Badge tone="danger">failed</Badge>
                    <Badge tone="neutral">{u.uploadKind}</Badge>
                    <span className="text-xs text-muted-foreground">
                      uploaded {formatDateTime(u.createdAt)}
                    </span>
                  </div>
                  {u.errorMessage ? (
                    <p className="mt-1 text-sm text-destructive">{u.errorMessage}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {rejected.toLocaleString()} row{rejected === 1 ? '' : 's'} rejected
                    {errors.length > 0 ? ` · showing ${shown.length} of ${errors.length} error samples` : ''}
                  </p>

                  {shown.length > 0 ? (
                    <table className="mt-2 min-w-full text-xs">
                      <thead className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-3">Row</th>
                          <th className="py-1 pr-3">Column</th>
                          <th className="py-1">Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {shown.map((e, i) => (
                          <tr key={i}>
                            <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">
                              {e.row > 0 ? e.row : '—'}
                            </td>
                            <td className="py-1 pr-3 font-mono text-foreground">{e.column ?? '—'}</td>
                            <td className="py-1 text-foreground">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}

                  {errors.length > shown.length ? (
                    <button
                      type="button"
                      onClick={() => onOpenDetail(u.id)}
                      className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      View all {errors.length} errors in detail →
                    </button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
