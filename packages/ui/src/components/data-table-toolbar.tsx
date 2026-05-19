'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Columns3,
  Download,
  LayoutGrid,
  Rows3,
  Search,
  X,
} from 'lucide-react';
import { cn } from '../lib/cn.js';
import { DropdownMenu, type DropdownMenuItem } from './dropdown-menu.js';
import type { ColumnDef, Density } from './data-table.js';

export interface FilterChip {
  readonly key: string;
  readonly label: string;
  readonly onRemove?: () => void;
}

export interface DataTableToolbarProps<T> {
  /** Mirror of the columns passed to DataTable — used by the column-visibility menu. */
  readonly columns: ReadonlyArray<ColumnDef<T>>;
  readonly columnVisibility?: Record<string, boolean>;
  readonly onColumnVisibilityChange?: (next: Record<string, boolean>) => void;

  // Search ------------------------------------------------------------
  readonly search?: string;
  readonly onSearchChange?: (next: string) => void;
  readonly searchPlaceholder?: string;
  /** Debounce in ms for the onSearchChange callback. Defaults to 250. */
  readonly searchDebounceMs?: number;

  // Density -----------------------------------------------------------
  readonly density?: Density;
  readonly onDensityChange?: (next: Density) => void;

  // Filter chips ------------------------------------------------------
  readonly chips?: ReadonlyArray<FilterChip>;
  readonly onClearAllFilters?: () => void;

  // Bulk actions (rendered when at least one row is selected) ---------
  readonly selectedCount?: number;
  readonly bulkActions?: React.ReactNode;

  // Export ------------------------------------------------------------
  readonly onExport?: () => void;
  readonly exportLabel?: string;

  // Custom right-side slot for anything else (e.g., "New record" button)
  readonly trailing?: React.ReactNode;
}

/**
 * Toolbar primitive for tables. Pair with DataTable + useDataTableState.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ [search]   [chip] [chip] [Clear]    [bulk] [density] [⋮] [+] │
 *   └──────────────────────────────────────────────────────────────┘
 */
export function DataTableToolbar<T>({
  columns,
  columnVisibility,
  onColumnVisibilityChange,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  searchDebounceMs = 250,
  density = 'comfortable',
  onDensityChange,
  chips,
  onClearAllFilters,
  selectedCount = 0,
  bulkActions,
  onExport,
  exportLabel = 'Export CSV',
  trailing,
}: DataTableToolbarProps<T>) {
  // Local debounce so typing in the search box doesn't fire a network
  // request per keystroke. Mirrors the controlled prop on mount/change.
  const [draft, setDraft] = useState(search ?? '');
  const externalSearch = useRef(search ?? '');
  useEffect(() => {
    if (search !== externalSearch.current) {
      externalSearch.current = search ?? '';
      setDraft(search ?? '');
    }
  }, [search]);
  useEffect(() => {
    if (!onSearchChange) return;
    if (draft === externalSearch.current) return;
    const t = window.setTimeout(() => {
      externalSearch.current = draft;
      onSearchChange(draft);
    }, searchDebounceMs);
    return () => window.clearTimeout(t);
  }, [draft, onSearchChange, searchDebounceMs]);

  const hideableColumns = columns.filter((c) => c.hideable !== false);
  const columnMenuItems: DropdownMenuItem[] = hideableColumns.map((c) => {
    const visible = columnVisibility?.[c.key] !== false;
    return {
      key: `col-${c.key}`,
      label: c.header,
      trailing: visible ? <span aria-hidden="true">✓</span> : null,
      onSelect: () => {
        if (!onColumnVisibilityChange) return;
        onColumnVisibilityChange({ ...(columnVisibility ?? {}), [c.key]: !visible });
      },
    };
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange ? (
          <div className="relative max-w-sm flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          {selectedCount > 0 ? (
            <div className="flex items-center gap-1.5 rounded-md border border-navy/30 bg-navy-50 px-2.5 py-1 text-xs text-navy-800">
              <span className="font-medium">{selectedCount} selected</span>
              {bulkActions}
            </div>
          ) : null}

          {onDensityChange ? (
            <button
              type="button"
              aria-label={density === 'compact' ? 'Switch to comfortable density' : 'Switch to compact density'}
              title={density === 'compact' ? 'Comfortable density' : 'Compact density'}
              onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {density === 'compact' ? <LayoutGrid className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
            </button>
          ) : null}

          {onColumnVisibilityChange && hideableColumns.length > 0 ? (
            <DropdownMenu
              align="end"
              width="w-56"
              header={
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Show columns
                </div>
              }
              trigger={
                <span
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Columns"
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  Columns
                </span>
              }
              items={columnMenuItems}
            />
          ) : null}

          {onExport ? (
            <button
              type="button"
              onClick={onExport}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              {exportLabel}
            </button>
          ) : null}

          {trailing}
        </div>
      </div>

      {chips && chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-foreground"
            >
              {chip.label}
              {chip.onRemove ? (
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remove ${chip.label}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              ) : null}
            </span>
          ))}
          {onClearAllFilters ? (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="ml-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
