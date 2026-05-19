'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef as TanstackColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useMemo } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../lib/cn.js';

/**
 * Column descriptor — the existing project API. The `key` doubles as the
 * stable column id used by TanStack Table for visibility/order state.
 */
export interface ColumnDef<T> {
  readonly key: string;
  readonly header: string;
  readonly accessor: (row: T) => React.ReactNode;
  readonly className?: string;
  readonly numeric?: boolean;
  readonly width?: string;
  /** When set, the header becomes a sort affordance. Sorting itself is
   * server-driven — the table just emits onSortChange when the user clicks. */
  readonly sortKey?: string;
  /** When false, the column visibility menu does not list this column
   * (e.g., row-actions column should always show). Defaults to true. */
  readonly hideable?: boolean;
}

export type Density = 'compact' | 'comfortable';

export interface SortState {
  readonly column: string;
  readonly direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  readonly columns: ReadonlyArray<ColumnDef<T>>;
  readonly rows: ReadonlyArray<T>;
  readonly rowKey: (row: T) => string;
  readonly onRowClick?: (row: T) => void;
  readonly emptyState?: React.ReactNode;
  readonly errorState?: React.ReactNode;
  readonly loading?: boolean;
  readonly className?: string;
  readonly rowClassName?: (row: T) => string | undefined;

  // -- Density --------------------------------------------------------
  readonly density?: Density;

  // -- Sorting (server-driven) ----------------------------------------
  /** Current sort state. */
  readonly sort?: SortState | null;
  /** Called when the user clicks a sortable column header. */
  readonly onSortChange?: (next: SortState | null) => void;

  // -- Column visibility (controlled, optional) ------------------------
  readonly columnVisibility?: Record<string, boolean>;
  readonly onColumnVisibilityChange?: (next: Record<string, boolean>) => void;

  // -- Row selection (controlled, optional) ----------------------------
  /** When true, prepends a checkbox column and enables selection. */
  readonly selectable?: boolean;
  /** Set of selected row keys (rowKey results). */
  readonly selectedRowKeys?: ReadonlyArray<string>;
  readonly onSelectedRowKeysChange?: (next: string[]) => void;

  // -- Loading ---------------------------------------------------------
  /** How many skeleton rows to render while loading. Defaults to 5. */
  readonly skeletonRows?: number;

  // -- Sticky header (default true) ------------------------------------
  readonly stickyHeader?: boolean;
}

/**
 * Enterprise data table — server-driven by default.
 *
 * Architectural choices:
 *   - TanStack Table is used for *structure* (rows, columns, visibility,
 *     selection state). Sort, filter, search, and pagination are all
 *     server-driven (manualX flags), so the table never silently mutates
 *     the dataset the caller passes in.
 *   - The existing minimal API (columns/rows/rowKey/loading/emptyState/
 *     rowClassName) keeps working unchanged. New features are opt-in via
 *     additional props.
 *   - Selection + visibility are controlled state — useDataTableState
 *     manages them with URL + localStorage persistence so reloads (and
 *     shared links) restore the user's view.
 *
 * Companion primitives:
 *   - DataTableToolbar — search, density, column visibility, bulk actions.
 *   - DataTablePagination — page size, prev/next, total count.
 *   - useDataTableState — sort/filter/page/search state + URL sync.
 *   - exportRowsToCsv — single-file CSV export of the rows you pass.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyState,
  errorState,
  loading,
  className,
  rowClassName,
  density = 'comfortable',
  sort = null,
  onSortChange,
  columnVisibility,
  onColumnVisibilityChange,
  selectable = false,
  selectedRowKeys,
  onSelectedRowKeysChange,
  skeletonRows = 5,
  stickyHeader = true,
}: DataTableProps<T>) {
  // Convert our ColumnDef[] into TanStack's shape. TanStack uses `id` as the
  // stable column key; we use our `key` for that, which doubles as the
  // visibility/order identifier.
  const tanstackColumns: TanstackColumnDef<T>[] = useMemo(
    () =>
      columns.map((c) => ({
        id: c.key,
        header: c.header,
        cell: (info) => c.accessor(info.row.original),
        enableHiding: c.hideable !== false,
      })),
    [columns],
  );

  // Selection state is keyed by row id. Translate to/from string[] for the
  // controlled-prop ergonomics callers prefer.
  const rowSelection: RowSelectionState = useMemo(() => {
    if (!selectable || !selectedRowKeys) return {};
    const map: RowSelectionState = {};
    for (const k of selectedRowKeys) map[k] = true;
    return map;
  }, [selectable, selectedRowKeys]);

  const visibility: VisibilityState = useMemo(
    () => columnVisibility ?? {},
    [columnVisibility],
  );

  // Mirror our SortState into TanStack's SortingState — purely so the
  // table instance knows what arrow to draw on the header. Sorting is
  // server-driven (manualSorting), so this never reorders the rows.
  const sorting: SortingState = useMemo(
    () => (sort ? [{ id: sort.column, desc: sort.direction === 'desc' }] : []),
    [sort],
  );

  const table = useReactTable({
    data: rows as T[],
    columns: tanstackColumns,
    state: { rowSelection, columnVisibility: visibility, sorting },
    enableRowSelection: selectable,
    enableMultiRowSelection: selectable,
    enableSorting: !!onSortChange,
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    getRowId: (row) => rowKey(row),
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: (updater) => {
      if (!onSelectedRowKeysChange) return;
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      onSelectedRowKeysChange(Object.keys(next).filter((k) => next[k]));
    },
    onColumnVisibilityChange: (updater) => {
      if (!onColumnVisibilityChange) return;
      const next = typeof updater === 'function' ? updater(visibility) : updater;
      onColumnVisibilityChange(next);
    },
  });

  // We only consult `table` for *state* (selection map, visibility); we
  // render the table body ourselves so column className/numeric/width still
  // come from our ColumnDef.
  const visibleColumns = columns.filter((c) => visibility[c.key] !== false);
  const colSpan = visibleColumns.length + (selectable ? 1 : 0);
  const rowPadY = density === 'compact' ? 'py-1.5' : 'py-3';
  const headerPadY = density === 'compact' ? 'py-1.5' : 'py-2.5';

  function handleHeaderSort(col: ColumnDef<T>): void {
    if (!col.sortKey || !onSortChange) return;
    const same = sort?.column === col.sortKey;
    if (!same) {
      onSortChange({ column: col.sortKey, direction: 'asc' });
      return;
    }
    // Cycle asc → desc → off
    if (sort?.direction === 'asc') onSortChange({ column: col.sortKey, direction: 'desc' });
    else onSortChange(null);
  }

  const allRowKeys = useMemo(() => rows.map((r) => rowKey(r)), [rows, rowKey]);
  const allSelected = selectable && allRowKeys.length > 0 && allRowKeys.every((k) => rowSelection[k]);
  const someSelected = selectable && !allSelected && allRowKeys.some((k) => rowSelection[k]);

  function toggleAll(): void {
    if (!selectable || !onSelectedRowKeysChange) return;
    onSelectedRowKeysChange(allSelected ? [] : allRowKeys);
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead
            className={cn(
              'bg-muted/40',
              stickyHeader && 'sticky top-0 z-[1]',
            )}
          >
            <tr>
              {selectable ? (
                <th className={cn('px-3 text-left', headerPadY)} style={{ width: '32px' }}>
                  <input
                    type="checkbox"
                    aria-label={allSelected ? 'Deselect all' : 'Select all'}
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-navy"
                  />
                </th>
              ) : null}
              {visibleColumns.map((c) => {
                const isSorted = !!sort && sort.column === c.sortKey;
                const SortIcon = !c.sortKey
                  ? null
                  : !isSorted
                    ? ArrowUpDown
                    : sort!.direction === 'asc'
                      ? ArrowUp
                      : ArrowDown;
                return (
                  <th
                    key={c.key}
                    className={cn(
                      'px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                      headerPadY,
                      c.numeric && 'text-right tabular-nums',
                      c.sortKey && onSortChange && 'cursor-pointer select-none hover:text-foreground',
                      c.className,
                    )}
                    style={c.width ? { width: c.width } : undefined}
                    onClick={c.sortKey ? () => handleHeaderSort(c) : undefined}
                  >
                    <span className={cn('inline-flex items-center gap-1', c.numeric && 'flex-row-reverse')}>
                      {c.header}
                      {SortIcon ? (
                        <SortIcon
                          className={cn(
                            'h-3 w-3 transition-opacity',
                            isSorted ? 'opacity-100 text-foreground' : 'opacity-50',
                          )}
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              renderSkeleton({ colSpan, rows: skeletonRows, padY: rowPadY })
            ) : errorState ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-destructive">
                  {errorState}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {emptyState ?? 'No rows.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((tanstackRow) => {
                const row = tanstackRow.original;
                const id = tanstackRow.id;
                const isSelected = !!rowSelection[id];
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-muted/40',
                      isSelected && 'bg-navy-50/40',
                      rowClassName?.(row),
                    )}
                  >
                    {selectable ? (
                      <td className={cn('px-3', rowPadY)} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={isSelected ? 'Deselect row' : 'Select row'}
                          checked={isSelected}
                          onChange={() => {
                            const next = isSelected
                              ? Object.keys(rowSelection).filter((k) => k !== id && rowSelection[k])
                              : [...Object.keys(rowSelection).filter((k) => rowSelection[k]), id];
                            onSelectedRowKeysChange?.(next);
                          }}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-navy"
                        />
                      </td>
                    ) : null}
                    {visibleColumns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'px-4 text-foreground',
                          rowPadY,
                          c.numeric && 'text-right tabular-nums',
                          c.className,
                        )}
                      >
                        {/* flexRender keeps us aligned with TanStack's row model for
                            future virtualization without changing the cell API. */}
                        {flexRender(
                          tanstackRow.getVisibleCells().find((cell) => cell.column.id === c.key)?.column.columnDef
                            .cell,
                          tanstackRow.getVisibleCells().find((cell) => cell.column.id === c.key)?.getContext() ?? ({} as never),
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderSkeleton({
  colSpan,
  rows,
  padY,
}: {
  colSpan: number;
  rows: number;
  padY: string;
}): React.ReactNode {
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={`sk-${i}`}>
      <td colSpan={colSpan} className={cn('px-4', padY)}>
        <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
      </td>
    </tr>
  ));
}
