'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Building2, Layers, Upload as UploadIcon } from 'lucide-react';
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
  useInventory,
  useInventoryFacets,
  type InventorySnapshot,
} from '@/lib/api-inventory';

const PAGE_STORAGE = 'inventory-table';

export default function InventoryPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace } = useActiveWorkspace();

  const [tableState, tableActions] = useDataTableState({
    storageKey: PAGE_STORAGE,
    urlKey: 'inv',
    defaultPageSize: 50,
    defaultSort: { column: 'sku', direction: 'asc' },
  });

  const warehouse = (tableState.filters.warehouse as string | undefined) ?? undefined;
  const view = (tableState.filters.view as string | undefined) ?? 'latest';
  const latestOnly = view !== 'history';

  const invQ = useInventory(
    activeWorkspace
      ? {
          workspaceId: activeWorkspace.id,
          q: tableState.search.trim() || undefined,
          warehouse,
          latestOnly,
          sort: tableState.sort
            ? `${tableState.sort.direction === 'desc' ? '-' : ''}${tableState.sort.column}`
            : latestOnly
              ? 'sku'
              : '-snapshotDate',
          page: tableState.page,
          pageSize: tableState.pageSize,
        }
      : null,
  );
  const facetsQ = useInventoryFacets(activeWorkspace?.id ?? null);

  const COLUMNS: ReadonlyArray<ColumnDef<InventorySnapshot>> = useMemo(
    () => [
      {
        key: 'sku',
        header: 'SKU',
        sortKey: 'sku',
        hideable: false,
        accessor: (r) => <span className="font-mono text-xs text-foreground">{r.sku}</span>,
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        sortKey: 'warehouse',
        accessor: (r) => <Badge tone="neutral">{r.warehouseCode}</Badge>,
      },
      {
        key: 'snapshotDate',
        header: 'As of',
        sortKey: 'snapshotDate',
        accessor: (r) => (
          <span data-numeric="true" className="text-sm text-foreground">{r.snapshotDate}</span>
        ),
      },
      {
        key: 'onHand',
        header: 'On hand',
        sortKey: 'onHand',
        numeric: true,
        accessor: (r) => (
          <span data-numeric="true" className="font-medium text-foreground">
            {r.quantityOnHand.toLocaleString()}
          </span>
        ),
      },
      {
        key: 'reserved',
        header: 'Reserved',
        sortKey: 'reserved',
        numeric: true,
        accessor: (r) => (
          <span data-numeric="true" className="text-muted-foreground">
            {r.quantityReserved.toLocaleString()}
          </span>
        ),
      },
      {
        key: 'available',
        header: 'Available',
        sortKey: 'available',
        numeric: true,
        accessor: (r) => (
          <span data-numeric="true" className="font-medium text-foreground">
            {r.quantityAvailable.toLocaleString()}
          </span>
        ),
      },
      {
        key: 'inbound',
        header: 'Inbound',
        sortKey: 'inbound',
        numeric: true,
        accessor: (r) => (
          <span data-numeric="true" className="text-muted-foreground">
            {r.quantityInbound.toLocaleString()}
          </span>
        ),
      },
      {
        key: 'unitCost',
        header: 'Unit cost',
        sortKey: 'unitCost',
        numeric: true,
        accessor: (r) =>
          r.unitCost && r.currencyCode ? (
            <span data-numeric="true">{formatMoney(r.unitCost, r.currencyCode)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  if (!activeWorkspace) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <PageHeader title="Inventory" description="Workspace-scoped stock positions." />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {user?.isInternalManager
              ? 'Pick a workspace from the topbar switcher to scope inventory.'
              : 'Pick a workspace to begin.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = invQ.data?.items ?? [];
  const agg = invQ.data?.aggregates;

  function onExport() {
    if (!activeWorkspace) return;
    exportRowsToCsv(
      rows,
      [
        { key: 'sku',         header: 'SKU',          value: (r) => r.sku },
        { key: 'warehouse',   header: 'Warehouse',    value: (r) => r.warehouseCode },
        { key: 'date',        header: 'As of',        value: (r) => r.snapshotDate },
        { key: 'onHand',      header: 'On hand',      value: (r) => r.quantityOnHand },
        { key: 'reserved',    header: 'Reserved',     value: (r) => r.quantityReserved },
        { key: 'available',   header: 'Available',    value: (r) => r.quantityAvailable },
        { key: 'inbound',     header: 'Inbound',      value: (r) => r.quantityInbound },
        { key: 'unitCost',    header: 'Unit cost',    value: (r) => r.unitCost ?? '' },
        { key: 'currency',    header: 'Currency',     value: (r) => r.currencyCode ?? '' },
      ],
      `inventory-${activeWorkspace.workspaceName}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  const chips = [
    tableState.search
      ? { key: 'q', label: `Search: ${tableState.search}`, onRemove: () => tableActions.setSearch('') }
      : null,
    warehouse
      ? {
          key: 'wh',
          label: `Warehouse: ${warehouse}`,
          onRemove: () => tableActions.clearFilter('warehouse'),
        }
      : null,
    view === 'history'
      ? {
          key: 'view',
          label: 'View: full history',
          onRemove: () => tableActions.clearFilter('view'),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  return (
    <div className="flex flex-col gap-5 p-6 lg:p-8">
      <PageHeader
        title="Inventory"
        description={
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
            <span>{activeWorkspace.organizationName}</span>
            <span aria-hidden="true">·</span>
            <Layers className="h-3.5 w-3.5" />
            <span>{activeWorkspace.workspaceName}</span>
          </span>
        }
        actions={
          <Link href="/uploads">
            <Button size="sm" variant="outline">
              <UploadIcon className="mr-1 h-3.5 w-3.5" /> Upload inventory
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="SKUs"
              value={agg ? agg.distinctSkus.toLocaleString() : '—'}
              hint="distinct SKUs"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Warehouses"
              value={agg ? agg.distinctWarehouses.toLocaleString() : '—'}
              hint="locations covered"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="On hand"
              value={agg ? agg.totalOnHand.toLocaleString() : '—'}
              hint="sum of quantity_on_hand"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <Metric
              label="Valuation"
              value={agg && Number(agg.totalValuation) > 0 ? formatTotal(agg.totalValuation) : '—'}
              hint="sum where unit_cost set (mixed currencies)"
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <DataTableToolbar<InventorySnapshot>
          columns={COLUMNS}
          columnVisibility={tableState.columnVisibility}
          onColumnVisibilityChange={tableActions.setColumnVisibility}
          search={tableState.search}
          onSearchChange={tableActions.setSearch}
          searchPlaceholder="Search SKU or warehouse"
          density={tableState.density}
          onDensityChange={tableActions.setDensity}
          onExport={rows.length > 0 ? onExport : undefined}
          chips={chips}
          onClearAllFilters={chips.length > 0 ? tableActions.clearAllFilters : undefined}
          trailing={
            <>
              <DropdownMenu
                align="end"
                width="w-56"
                header={
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    View
                  </div>
                }
                trigger={
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    {latestOnly ? 'Latest per SKU' : 'Full history'}
                  </span>
                }
                items={[
                  {
                    key: 'latest',
                    label: 'Latest snapshot per SKU + warehouse',
                    trailing: latestOnly ? <span aria-hidden="true">✓</span> : null,
                    onSelect: () => tableActions.clearFilter('view'),
                  },
                  {
                    key: 'history',
                    label: 'Full history (every snapshot)',
                    trailing: !latestOnly ? <span aria-hidden="true">✓</span> : null,
                    onSelect: () => tableActions.setFilter('view', 'history'),
                  },
                ]}
              />
              <DropdownMenu
                align="end"
                width="w-56"
                header={
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Filter by warehouse
                  </div>
                }
                trigger={
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    {warehouse ? `Warehouse: ${warehouse}` : 'Warehouse'}
                  </span>
                }
                items={[
                  {
                    key: '__all__',
                    label: 'All warehouses',
                    trailing: warehouse ? null : <span aria-hidden="true">✓</span>,
                    onSelect: () => tableActions.clearFilter('warehouse'),
                  },
                  ...((facetsQ.data?.warehouses ?? []).length === 0
                    ? [{
                        key: '__none__',
                        label: 'No values yet',
                        disabled: true,
                        onSelect: () => undefined,
                      }]
                    : (facetsQ.data?.warehouses ?? []).map((w) => ({
                        key: w,
                        label: w,
                        trailing: warehouse === w ? <span aria-hidden="true">✓</span> : null,
                        onSelect: () => tableActions.setFilter('warehouse', w),
                      }))),
                ]}
              />
            </>
          }
        />

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r.id}
            loading={invQ.isLoading}
            density={tableState.density}
            sort={tableState.sort}
            onSortChange={tableActions.setSort}
            columnVisibility={tableState.columnVisibility}
            onColumnVisibilityChange={tableActions.setColumnVisibility}
            className="rounded-none border-0"
            emptyState={
              <div className="flex flex-col items-center gap-3 py-6">
                <span className="text-sm">
                  {chips.length > 0
                    ? 'No inventory rows match the current filters.'
                    : 'No inventory data yet for this workspace.'}
                </span>
                {chips.length === 0 ? (
                  <Link href="/uploads">
                    <Button size="sm" variant="outline">
                      <UploadIcon className="mr-1 h-3.5 w-3.5" /> Upload your first inventory CSV
                    </Button>
                  </Link>
                ) : null}
              </div>
            }
          />
          {invQ.data && invQ.data.total > tableState.pageSize ? (
            <DataTablePagination
              page={tableState.page}
              pageSize={tableState.pageSize}
              total={invQ.data.total}
              onPageChange={tableActions.setPage}
              onPageSizeChange={tableActions.setPageSize}
            />
          ) : null}
        </div>
      </div>
    </div>
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
    return `${n.toFixed(2)} ${currency}`;
  }
}

function formatTotal(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
