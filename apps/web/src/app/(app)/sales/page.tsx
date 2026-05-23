'use client';

import { useMemo } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  DropdownMenu,
  exportRowsToCsv,
  Metric,
  PageHeader,
  useDataTableState,
  type ColumnDef,
} from '@xb/ui';
import { useActiveWorkspace, useSession } from '@/lib/session';
import {
  useSalesFacets,
  useSalesOrders,
  type SalesOrder,
} from '@/lib/api-sales';

const SALES_PAGE_STORAGE = 'sales-table';

export default function SalesPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace } = useActiveWorkspace();

  const [tableState, tableActions] = useDataTableState({
    storageKey: SALES_PAGE_STORAGE,
    urlKey: 'sales',
    defaultPageSize: 50,
    defaultSort: { column: 'orderDate', direction: 'desc' },
  });

  const dateFrom    = (tableState.filters.dateFrom as string | undefined) ?? undefined;
  const dateTo      = (tableState.filters.dateTo as string | undefined) ?? undefined;
  const marketplace = (tableState.filters.marketplace as string | undefined) ?? undefined;
  const channel     = (tableState.filters.channel as string | undefined) ?? undefined;

  const salesQ = useSalesOrders(
    activeWorkspace
      ? {
          workspaceId: activeWorkspace.id,
          q: tableState.search.trim() || undefined,
          dateFrom,
          dateTo,
          marketplace,
          channel,
          sort: tableState.sort
            ? `${tableState.sort.direction === 'desc' ? '-' : ''}${tableState.sort.column}`
            : '-orderDate',
          page: tableState.page,
          pageSize: tableState.pageSize,
        }
      : null,
  );
  const facetsQ = useSalesFacets(activeWorkspace?.id ?? null);

  const COLUMNS: ReadonlyArray<ColumnDef<SalesOrder>> = useMemo(
    () => [
      {
        key: 'orderDate',
        header: 'Date',
        sortKey: 'orderDate',
        hideable: false,
        accessor: (s) => <span data-numeric="true" className="text-sm text-foreground">{s.orderDate}</span>,
      },
      {
        key: 'orderId',
        header: 'Order',
        sortKey: 'orderId',
        accessor: (s) => <span className="font-mono text-xs text-foreground">{s.orderId}</span>,
      },
      {
        key: 'sku',
        header: 'SKU',
        sortKey: 'sku',
        accessor: (s) => <span className="font-mono text-xs text-foreground">{s.sku}</span>,
      },
      {
        key: 'qty',
        header: 'Qty',
        sortKey: 'quantity',
        numeric: true,
        accessor: (s) => <span data-numeric="true">{s.quantity.toLocaleString()}</span>,
      },
      {
        key: 'unitPrice',
        header: 'Unit',
        sortKey: 'unitPrice',
        numeric: true,
        accessor: (s) => (
          <span data-numeric="true">{formatMoney(s.unitPrice, s.currencyCode)}</span>
        ),
      },
      {
        key: 'total',
        header: 'Total',
        sortKey: 'totalPrice',
        numeric: true,
        accessor: (s) => (
          <span data-numeric="true" className="font-medium text-foreground">
            {formatMoney(s.totalPrice, s.currencyCode)}
          </span>
        ),
      },
      {
        key: 'marketplace',
        header: 'Marketplace',
        sortKey: 'marketplace',
        accessor: (s) =>
          s.marketplace ? (
            <Badge tone="neutral">{s.marketplace}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          ),
      },
      {
        key: 'channel',
        header: 'Channel',
        sortKey: 'channel',
        accessor: (s) => (
          <span className="text-xs text-muted-foreground">{s.channel ?? '-'}</span>
        ),
      },
    ],
    [],
  );

  if (!activeWorkspace) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <PageHeader
          title="Sales"
          description="Workspace-scoped canonical sales orders."
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {user?.isInternalManager
              ? 'Pick a workspace from the topbar switcher to scope sales data.'
              : 'Pick a workspace to begin.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = salesQ.data?.items ?? [];
  const agg = salesQ.data?.aggregates;

  function onExport() {
    if (!activeWorkspace) return; // narrowing for TS; guarded by parent early-return
    exportRowsToCsv(
      rows,
      [
        { key: 'orderDate',   header: 'Date',         value: (s) => s.orderDate },
        { key: 'orderId',     header: 'Order ID',     value: (s) => s.orderId },
        { key: 'sku',         header: 'SKU',          value: (s) => s.sku },
        { key: 'quantity',    header: 'Qty',          value: (s) => s.quantity },
        { key: 'unitPrice',   header: 'Unit price',   value: (s) => s.unitPrice },
        { key: 'totalPrice',  header: 'Total price',  value: (s) => s.totalPrice },
        { key: 'currency',    header: 'Currency',     value: (s) => s.currencyCode },
        { key: 'marketplace', header: 'Marketplace',  value: (s) => s.marketplace ?? '' },
        { key: 'channel',     header: 'Channel',      value: (s) => s.channel ?? '' },
      ],
      `sales-${activeWorkspace.workspaceName}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  const chips = [
    tableState.search
      ? { key: 'q', label: `Search: ${tableState.search}`, onRemove: () => tableActions.setSearch('') }
      : null,
    dateFrom
      ? { key: 'from', label: `From: ${dateFrom}`, onRemove: () => tableActions.clearFilter('dateFrom') }
      : null,
    dateTo
      ? { key: 'to', label: `To: ${dateTo}`, onRemove: () => tableActions.clearFilter('dateTo') }
      : null,
    marketplace
      ? {
          key: 'mp',
          label: `Marketplace: ${marketplace}`,
          onRemove: () => tableActions.clearFilter('marketplace'),
        }
      : null,
    channel
      ? {
          key: 'ch',
          label: `Channel: ${channel}`,
          onRemove: () => tableActions.clearFilter('channel'),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  return (
    <div className="flex flex-col gap-5 p-6 lg:p-8">
      <PageHeader title="Sales" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Orders (filtered)"
              value={agg ? agg.totalOrders.toLocaleString() : '-'}
              hint={salesQ.isLoading ? 'loading…' : `over current view`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Units"
              value={agg ? agg.totalQuantity.toLocaleString() : '-'}
              hint="sum of quantity"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Gross"
              value={agg ? formatMoneyTotal(agg.totalGross) : '-'}
              hint="sum of total_price (mixed currencies shown raw)"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <DataTableToolbar<SalesOrder>
          columns={COLUMNS}
          columnVisibility={tableState.columnVisibility}
          onColumnVisibilityChange={tableActions.setColumnVisibility}
          search={tableState.search}
          onSearchChange={tableActions.setSearch}
          searchPlaceholder="Search order ID or SKU"
          density={tableState.density}
          onDensityChange={tableActions.setDensity}
          onExport={rows.length > 0 ? onExport : undefined}
          chips={chips}
          onClearAllFilters={chips.length > 0 ? tableActions.clearAllFilters : undefined}
          trailing={
            <>
              <DateRangeMenu
                from={dateFrom}
                to={dateTo}
                onChange={(from, to) => {
                  tableActions.setFilter('dateFrom', from ?? null);
                  tableActions.setFilter('dateTo', to ?? null);
                }}
              />
              <FacetMenu
                label="Marketplace"
                current={marketplace}
                options={facetsQ.data?.marketplaces ?? []}
                onPick={(v) => tableActions.setFilter('marketplace', v)}
              />
              <FacetMenu
                label="Channel"
                current={channel}
                options={facetsQ.data?.channels ?? []}
                onPick={(v) => tableActions.setFilter('channel', v)}
              />
            </>
          }
        />

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(s) => s.id}
            loading={salesQ.isLoading}
            density={tableState.density}
            sort={tableState.sort}
            onSortChange={tableActions.setSort}
            columnVisibility={tableState.columnVisibility}
            onColumnVisibilityChange={tableActions.setColumnVisibility}
            className="rounded-none border-0"
            emptyState={
              <div className="py-6 text-center text-sm text-muted-foreground">
                {chips.length > 0
                  ? 'No orders match the current filters.'
                  : 'Awaiting sales data.'}
              </div>
            }
          />
          {salesQ.data && salesQ.data.total > tableState.pageSize ? (
            <DataTablePagination
              page={tableState.page}
              pageSize={tableState.pageSize}
              total={salesQ.data.total}
              onPageChange={tableActions.setPage}
              onPageSizeChange={tableActions.setPageSize}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FacetMenu({
  label,
  current,
  options,
  onPick,
}: {
  label: string;
  current: string | undefined;
  options: ReadonlyArray<string>;
  onPick: (value: string | null) => void;
}) {
  return (
    <DropdownMenu
      align="end"
      width="w-56"
      header={
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Filter by {label.toLowerCase()}
        </div>
      }
      trigger={
        <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
          {current ? `${label}: ${current}` : label}
        </span>
      }
      items={[
        {
          key: '__all__',
          label: `All ${label.toLowerCase()}s`,
          trailing: current ? null : <span aria-hidden="true">✓</span>,
          onSelect: () => onPick(null),
        },
        ...(options.length === 0
          ? [{
              key: '__none__',
              label: 'No values yet',
              disabled: true,
              onSelect: () => undefined,
            }]
          : options.map((v) => ({
              key: v,
              label: v,
              trailing: current === v ? <span aria-hidden="true">✓</span> : null,
              onSelect: () => onPick(v),
            }))),
      ]}
    />
  );
}

function DateRangeMenu({
  from,
  to,
  onChange,
}: {
  from?: string;
  to?: string;
  onChange: (from: string | null, to: string | null) => void;
}) {
  function pickRange(days: number) {
    const today = new Date();
    const since = new Date(today);
    since.setUTCDate(today.getUTCDate() - days);
    onChange(since.toISOString().slice(0, 10), today.toISOString().slice(0, 10));
  }
  const label = from && to ? `${from} → ${to}` : from ? `From ${from}` : to ? `To ${to}` : 'Date range';
  return (
    <DropdownMenu
      align="end"
      width="w-48"
      header={
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Date range
        </div>
      }
      trigger={
        <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
          {label}
        </span>
      }
      items={[
        { key: '7',  label: 'Last 7 days',  onSelect: () => pickRange(6) },
        { key: '30', label: 'Last 30 days', onSelect: () => pickRange(29) },
        { key: '90', label: 'Last 90 days', onSelect: () => pickRange(89) },
        { key: '365', label: 'Last 12 months', onSelect: () => pickRange(364), divider: true },
        { key: 'clear', label: 'Clear range', onSelect: () => onChange(null, null), divider: true },
      ]}
    />
  );
}

function formatMoney(amount: string, currency: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Unknown currency code, fall back to plain number with code suffix.
    return `${n.toFixed(2)} ${currency}`;
  }
}

function formatMoneyTotal(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  // No currency on the summary tile because rows may span currencies;
  // showing the raw sum is more honest than picking one.
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
