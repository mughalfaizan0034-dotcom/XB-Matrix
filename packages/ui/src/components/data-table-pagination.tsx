'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface DataTablePaginationProps {
  /** Zero-based page number. */
  readonly page: number;
  readonly pageSize: number;
  /** Total row count when known. Pass null/undefined for cursor-based lists. */
  readonly total?: number | null;
  /** When true, "Next" is enabled regardless of total (cursor mode). */
  readonly hasMore?: boolean;
  readonly onPageChange: (next: number) => void;
  readonly onPageSizeChange?: (next: number) => void;
  readonly pageSizeOptions?: ReadonlyArray<number>;
  readonly className?: string;
}

/**
 * Standalone pagination control. The table component does not own
 * pagination state — useDataTableState does, and you pass it here.
 *
 * Supports both modes:
 *   - Total-known mode  → "Showing 1–20 of 412"
 *   - Cursor mode       → "Showing 1–20"   (next enabled when hasMore)
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
  hasMore,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: DataTablePaginationProps) {
  const totalKnown = typeof total === 'number';
  const start = page * pageSize + 1;
  const end = totalKnown ? Math.min(total!, (page + 1) * pageSize) : (page + 1) * pageSize;
  const lastPage = totalKnown ? Math.max(0, Math.ceil((total ?? 0) / pageSize) - 1) : null;

  const canPrev = page > 0;
  const canNext = totalKnown ? page < (lastPage ?? 0) : !!hasMore;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded border border-border bg-background px-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <span data-numeric="true">
          {totalKnown && total === 0
            ? '0 of 0'
            : totalKnown
              ? `${start}–${end} of ${total}`
              : `${start}–${end}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
