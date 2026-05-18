import { cn } from '../lib/cn.js';

export interface ColumnDef<T> {
  readonly key: string;
  readonly header: string;
  readonly accessor: (row: T) => React.ReactNode;
  readonly className?: string;
  readonly numeric?: boolean;
  readonly width?: string;
}

export interface DataTableProps<T> {
  readonly columns: ReadonlyArray<ColumnDef<T>>;
  readonly rows: ReadonlyArray<T>;
  readonly rowKey: (row: T) => string;
  readonly onRowClick?: (row: T) => void;
  readonly emptyState?: React.ReactNode;
  readonly loading?: boolean;
  readonly className?: string;
}

/**
 * Minimal enterprise-grade DataTable. Numeric columns get tabular-nums
 * automatically. Hover affordance + optional row click. No client-side
 * sorting yet — sorting is a server concern for paginated lists.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyState,
  loading,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                    c.numeric && 'text-right tabular-nums',
                    c.className,
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {emptyState ?? 'No rows.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-muted/40',
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-3 text-foreground',
                        c.numeric && 'text-right tabular-nums',
                        c.className,
                      )}
                    >
                      {c.accessor(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
