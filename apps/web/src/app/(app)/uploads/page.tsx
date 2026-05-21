'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Building2,
  Globe2,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCcw,
} from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  DropdownMenu,
  exportRowsToCsv,
  PageHeader,
  TabPanel,
  Tabs,
  useDataTableState,
  useToast,
  type ColumnDef,
  type DropdownMenuItem,
} from '@xb/ui';
import { UploadTemplatesPanel } from '@/components/upload-templates-panel';
import { useActiveWorkspace, useSession, describeError } from '@/lib/session';
import { useWorkspaces } from '@/lib/api-workspaces';
import {
  useRetryUpload,
  useUploads,
  type UploadStatus,
  type UploadSummary,
} from '@/lib/api-uploads';
import { UPLOAD_KIND_META, type UploadCategory } from '@/lib/upload-kind-labels';
import { UploadDialog } from '@/components/upload-dialog';
import { UploadDetailDrawer } from '@/components/upload-detail-drawer';

/**
 * Uploads — ingestion operations console.
 *
 * Not a file manager: each row is one ingestion event tracked through
 * its lifecycle (queued → validating → processing → success/failed).
 * Validation errors and processing detail live inline (the detail
 * drawer), not in separate tabs. Long term this same monitor will also
 * surface API syncs, scheduled imports, connector runs and webhook
 * ingestion — architected as "ingestion operations", not "uploads".
 */
const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
  queued:          'neutral',
  uploading:       'warning',
  validating:      'warning',
  processing:      'warning',
  unresolved:      'warning',
  partial_success: 'warning',
  ready:           'success',
  success:         'success',
  failed:          'danger',
};

const STATUS_FILTERS: ReadonlyArray<UploadStatus> = [
  'queued',
  'uploading',
  'validating',
  'ready',
  'failed',
];

const REPORT_TYPE_LABEL: Record<UploadCategory, string> = {
  sales:       'Sales',
  inventory:   'Inventory',
  advertising: 'Advertising',
  warehouse:   'Warehouse',
  settlement:  'Settlement',
  forecast:    'Forecasting',
  other:       'Generic',
};

// Filterable report types. Settlement / Forecasting / Generic are
// intentionally NOT offered as filters:
//   - Generic isn't a report category — it's an absence of one.
//   - Settlement isn't an ingestion surface we collect from customers.
//   - Forecasting flows the other way (we share forecasts with the
//     user, not the reverse).
// REPORT_TYPE_LABEL still covers every category so legacy/generic rows
// render correctly in the table cell.
const REPORT_TYPE_ORDER: ReadonlyArray<UploadCategory> = [
  'sales',
  'inventory',
  'advertising',
  'warehouse',
];

export default function UploadsPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace } = useActiveWorkspace();
  const crossWorkspace = !activeWorkspace;

  const [tableState, tableActions] = useDataTableState({
    storageKey: 'uploads-table',
    urlKey: 'uploads',
    defaultPageSize: 20,
    defaultSort: { column: 'createdAt', direction: 'desc' },
  });

  const statusFilter = (tableState.filters.status as UploadStatus | undefined) ?? undefined;
  const reportFilter = (tableState.filters.reportType as UploadCategory | undefined) ?? undefined;
  const workspaceFilter = (tableState.filters.workspaceId as string | undefined) ?? undefined;

  // Workspace catalog — names for the cross-workspace column + filter.
  const workspacesQ = useWorkspaces({});
  const workspaceById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workspacesQ.data ?? []) m.set(w.id, w.workspaceName);
    if (activeWorkspace) m.set(activeWorkspace.id, activeWorkspace.workspaceName);
    return m;
  }, [workspacesQ.data, activeWorkspace]);

  const uploadsQ = useUploads({
    workspaceId: activeWorkspace?.id ?? workspaceFilter,
    q: tableState.search.trim() || undefined,
    status: statusFilter,
    sort: tableState.sort
      ? `${tableState.sort.direction === 'desc' ? '-' : ''}${tableState.sort.column}`
      : '-createdAt',
    page: tableState.page,
    pageSize: tableState.pageSize,
  });

  const [showUpload, setShowUpload] = useState(false);
  const [openUploadId, setOpenUploadId] = useState<string | null>(null);
  const retry = useRetryUpload();
  const toast = useToast();

  async function onRetry(u: UploadSummary) {
    try {
      await retry.mutateAsync(u.id);
      toast.push('success', 'Retry queued.');
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  function buildRowMenu(u: UploadSummary): DropdownMenuItem[] {
    const items: DropdownMenuItem[] = [
      { key: 'open', label: 'Inspect ingestion', onSelect: () => setOpenUploadId(u.id) },
    ];
    if (u.uploadStatus === 'failed') {
      items.push({
        key: 'retry',
        label: 'Retry ingestion',
        icon: RefreshCcw,
        divider: true,
        onSelect: () => onRetry(u),
      });
    }
    return items;
  }

  const COLUMNS: ReadonlyArray<ColumnDef<UploadSummary>> = useMemo(() => {
    const cols: Array<ColumnDef<UploadSummary>> = [
      {
        key: 'createdAt',
        header: 'Upload date',
        sortKey: 'createdAt',
        accessor: (u) => (
          <span data-numeric="true" className="text-xs text-muted-foreground">
            {formatDateTime(u.createdAt)}
          </span>
        ),
      },
      {
        key: 'reportType',
        header: 'Report type',
        sortKey: 'kind',
        accessor: (u) => {
          const meta = UPLOAD_KIND_META[u.uploadKind];
          return (
            <div className="flex flex-col leading-tight">
              <span className="text-sm text-foreground">{REPORT_TYPE_LABEL[meta.category]}</span>
              {meta.adapter || meta.legacy ? (
                <span className="text-[10px] text-muted-foreground">{meta.platformLabel}</span>
              ) : null}
            </div>
          );
        },
      },
    ];
    if (crossWorkspace) {
      cols.push({
        key: 'workspace',
        header: 'Workspace',
        accessor: (u) => {
          const name = workspaceById.get(u.workspaceId);
          return name ? (
            <span className="text-sm text-foreground">{name}</span>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">
              {u.workspaceId.slice(0, 8)}…
            </span>
          );
        },
      });
    }
    cols.push(
      {
        key: 'filename',
        header: 'File name',
        sortKey: 'filename',
        hideable: false,
        accessor: (u) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenUploadId(u.id);
            }}
            className="text-left font-medium text-foreground hover:text-navy"
          >
            <span className="block truncate">{u.originalFilename}</span>
          </button>
        ),
      },
      {
        key: 'rows',
        header: 'Rows',
        numeric: true,
        accessor: (u) => {
          const vs = vsummary(u);
          return (
            <span data-numeric="true" className="text-xs text-foreground">
              {typeof vs?.rowsParsed === 'number' ? vs.rowsParsed.toLocaleString() : '—'}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: 'Status',
        sortKey: 'status',
        accessor: (u) => (
          <Badge tone={STATUS_TONE[u.uploadStatus] ?? 'neutral'}>
            {u.uploadStatus.replace('_', ' ')}
          </Badge>
        ),
      },
      {
        key: 'summary',
        header: 'Summary',
        accessor: (u) => <span className="text-xs text-muted-foreground">{summaryText(u)}</span>,
      },
      {
        key: 'errors',
        header: 'Errors',
        accessor: (u) => {
          const errs = errorCount(u);
          if (errs === null) {
            return u.uploadStatus === 'failed' ? (
              <Badge tone="danger">parse error</Badge>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            );
          }
          return errs > 0 ? (
            <Badge tone="danger">{errs.toLocaleString()}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">0</span>
          );
        },
      },
      {
        key: 'retries',
        header: 'Retries',
        numeric: true,
        accessor: (u) => (
          <span data-numeric="true" className="text-xs text-muted-foreground">
            {u.retryCount}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '48px',
        hideable: false,
        accessor: (u) => (
          <DropdownMenu
            align="end"
            trigger={
              <span className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </span>
            }
            items={buildRowMenu(u)}
          />
        ),
      },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossWorkspace, workspaceById]);

  // Report-type filtering is client-side over the current page — the
  // API has no kind-category filter yet (low row counts per workspace).
  const allRows = uploadsQ.data?.items ?? [];
  const rows = useMemo(
    () =>
      reportFilter
        ? allRows.filter((u) => UPLOAD_KIND_META[u.uploadKind].category === reportFilter)
        : allRows,
    [allRows, reportFilter],
  );

  function onExport() {
    exportRowsToCsv(
      rows,
      [
        { key: 'createdAt',  header: 'Upload date',  value: (u) => u.createdAt },
        { key: 'reportType', header: 'Report type',  value: (u) => REPORT_TYPE_LABEL[UPLOAD_KIND_META[u.uploadKind].category] },
        { key: 'workspace',  header: 'Workspace',    value: (u) => workspaceById.get(u.workspaceId) ?? u.workspaceId },
        { key: 'filename',   header: 'File name',    value: (u) => u.originalFilename },
        { key: 'rows',       header: 'Rows',         value: (u) => vsummary(u)?.rowsParsed ?? '' },
        { key: 'status',     header: 'Status',       value: (u) => u.uploadStatus },
        { key: 'summary',    header: 'Summary',      value: (u) => summaryText(u) },
        { key: 'errors',     header: 'Errors',       value: (u) => errorCount(u) ?? '' },
        { key: 'retries',    header: 'Retries',      value: (u) => u.retryCount },
      ],
      `ingestion-${activeWorkspace?.workspaceName ?? 'all-workspaces'}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  const chips = [
    tableState.search
      ? { key: 'q', label: `Search: ${tableState.search}`, onRemove: () => tableActions.setSearch('') }
      : null,
    statusFilter
      ? { key: 'status', label: `Status: ${statusFilter}`, onRemove: () => tableActions.clearFilter('status') }
      : null,
    reportFilter
      ? {
          key: 'reportType',
          label: `Type: ${REPORT_TYPE_LABEL[reportFilter]}`,
          onRemove: () => tableActions.clearFilter('reportType'),
        }
      : null,
    crossWorkspace && workspaceFilter
      ? {
          key: 'workspace',
          label: `Workspace: ${workspaceById.get(workspaceFilter) ?? workspaceFilter.slice(0, 8)}`,
          onRemove: () => tableActions.clearFilter('workspaceId'),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  const subtitle = activeWorkspace ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Building2 className="h-3.5 w-3.5" />
      <span>{activeWorkspace.organizationName}</span>
      <span aria-hidden="true">·</span>
      <Layers className="h-3.5 w-3.5" />
      <span>{activeWorkspace.workspaceName}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Globe2 className="h-3.5 w-3.5" />
      <span>All workspaces · read-only ingestion monitor</span>
    </span>
  );

  return (
    <div className="flex flex-col gap-5 p-6 lg:p-8">
      <PageHeader
        title="Uploads"
        description={subtitle}
        actions={
          crossWorkspace ? (
            <Link
              href="/select-workspace?next=/uploads"
              className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy/90"
              title="Ingestion writes into one workspace — pick one to continue."
            >
              <Plus className="h-3.5 w-3.5" /> Pick a workspace to upload
            </Link>
          ) : (
            <Button size="sm" onClick={() => setShowUpload(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New upload
            </Button>
          )
        }
      />

      {/* Active write-context banner — operators need an unambiguous
          signal of where ingested data lands. */}
      {activeWorkspace ? (
        <div className="flex items-center gap-3 rounded-md border border-navy/20 bg-navy/[0.04] px-4 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-navy text-white">
            <Layers className="h-3.5 w-3.5" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Ingesting into
            </span>
            <span className="text-sm text-foreground">
              <span className="font-medium">{activeWorkspace.workspaceName}</span>
              <span className="mx-1.5 text-muted-foreground">·</span>
              <span className="text-muted-foreground">{activeWorkspace.organizationName}</span>
            </span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
            workspace-scoped
          </span>
        </div>
      ) : null}

      <Tabs<'history' | 'templates'>
        defaultValue="history"
        items={[
          { key: 'history',   label: 'Upload History' },
          { key: 'templates', label: 'Templates' },
        ]}
      >
        {/* ---- Upload History — the ingestion monitor ---------------- */}
        <TabPanel tabKey="history" className="pt-4">
          <div className="flex flex-col gap-3">
            <DataTableToolbar<UploadSummary>
              columns={COLUMNS}
              columnVisibility={tableState.columnVisibility}
              onColumnVisibilityChange={tableActions.setColumnVisibility}
              search={tableState.search}
              onSearchChange={tableActions.setSearch}
              searchPlaceholder="Search by file name"
              density={tableState.density}
              onDensityChange={tableActions.setDensity}
              onExport={rows.length > 0 ? onExport : undefined}
              chips={chips}
              onClearAllFilters={chips.length > 0 ? tableActions.clearAllFilters : undefined}
              trailing={
                <div className="flex items-center gap-1.5">
                  {/* Report type */}
                  <DropdownMenu
                    align="end"
                    width="w-52"
                    header={
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Filter by report type
                      </div>
                    }
                    trigger={
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                        {reportFilter ? `Type: ${REPORT_TYPE_LABEL[reportFilter]}` : 'Report type'}
                      </span>
                    }
                    items={[
                      {
                        key: '__all__',
                        label: 'All report types',
                        trailing: reportFilter ? null : <span aria-hidden="true">✓</span>,
                        onSelect: () => tableActions.clearFilter('reportType'),
                      },
                      ...REPORT_TYPE_ORDER.map((c) => ({
                        key: c,
                        label: REPORT_TYPE_LABEL[c],
                        trailing: reportFilter === c ? <span aria-hidden="true">✓</span> : null,
                        onSelect: () => tableActions.setFilter('reportType', c),
                      })),
                    ]}
                  />
                  {/* Workspace (cross-workspace mode only) */}
                  {crossWorkspace ? (
                    <DropdownMenu
                      align="end"
                      width="w-64"
                      header={
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Filter by workspace
                        </div>
                      }
                      trigger={
                        <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                          {workspaceFilter
                            ? `Workspace: ${workspaceById.get(workspaceFilter) ?? workspaceFilter.slice(0, 8)}`
                            : 'Workspace'}
                        </span>
                      }
                      items={[
                        {
                          key: '__all__',
                          label: 'All workspaces',
                          trailing: workspaceFilter ? null : <span aria-hidden="true">✓</span>,
                          onSelect: () => tableActions.clearFilter('workspaceId'),
                        },
                        ...(workspacesQ.data ?? []).map((w) => ({
                          key: w.id,
                          label: w.workspaceName,
                          trailing: workspaceFilter === w.id ? <span aria-hidden="true">✓</span> : null,
                          onSelect: () => tableActions.setFilter('workspaceId', w.id),
                        })),
                      ]}
                    />
                  ) : null}
                  {/* Status */}
                  <DropdownMenu
                    align="end"
                    width="w-48"
                    header={
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Filter by status
                      </div>
                    }
                    trigger={
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                        {statusFilter ? `Status: ${statusFilter}` : 'Status'}
                      </span>
                    }
                    items={[
                      {
                        key: 'all',
                        label: 'All statuses',
                        trailing: statusFilter ? null : <span aria-hidden="true">✓</span>,
                        onSelect: () => tableActions.clearFilter('status'),
                      },
                      ...STATUS_FILTERS.map((s) => ({
                        key: s,
                        label: s.replace('_', ' '),
                        trailing: statusFilter === s ? <span aria-hidden="true">✓</span> : null,
                        onSelect: () => tableActions.setFilter('status', s),
                      })),
                    ]}
                  />
                </div>
              }
            />

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <DataTable
                columns={COLUMNS}
                rows={rows}
                rowKey={(u) => u.id}
                loading={uploadsQ.isLoading}
                density={tableState.density}
                sort={tableState.sort}
                onSortChange={tableActions.setSort}
                columnVisibility={tableState.columnVisibility}
                onColumnVisibilityChange={tableActions.setColumnVisibility}
                className="rounded-none border-0"
                onRowClick={(u) => setOpenUploadId(u.id)}
                emptyState={
                  <div className="flex flex-col items-center gap-3 py-8">
                    <span className="text-sm">
                      {chips.length > 0
                        ? 'No ingestion events match the current filters.'
                        : crossWorkspace
                          ? 'No ingestion events across your accessible workspaces yet.'
                          : 'No ingestion events in this workspace yet.'}
                    </span>
                    {chips.length === 0 && !crossWorkspace ? (
                      <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> New upload
                      </Button>
                    ) : null}
                  </div>
                }
              />
              {uploadsQ.data && uploadsQ.data.total > tableState.pageSize ? (
                <DataTablePagination
                  page={tableState.page}
                  pageSize={tableState.pageSize}
                  total={uploadsQ.data.total}
                  onPageChange={tableActions.setPage}
                  onPageSizeChange={tableActions.setPageSize}
                />
              ) : null}
            </div>

            <p className="text-xs text-muted-foreground">
              Each row is one ingestion event: CSV → validation → mapping → unresolved-SKU
              handling → normalization → canonical layer. Click a row to inspect validation
              errors and processing detail. Status updates refresh automatically.
              {crossWorkspace && user?.isInternalManager
                ? ' Cross-org view — every workspace you can access.'
                : ''}
            </p>
          </div>
        </TabPanel>

        {/* ---- Templates -------------------------------------------- */}
        <TabPanel tabKey="templates" className="pt-4">
          <UploadTemplatesPanel />
        </TabPanel>
      </Tabs>

      <UploadDialog open={showUpload} onClose={() => setShowUpload(false)} />
      <UploadDetailDrawer uploadId={openUploadId} onClose={() => setOpenUploadId(null)} />
    </div>
  );
}

// --- ingestion summary derivation ------------------------------------

interface VSummary {
  readonly rowsParsed?: number;
  readonly rowsAccepted?: number;
  readonly rowsRejected?: number;
  readonly errors?: ReadonlyArray<unknown>;
  readonly columnsMissing?: ReadonlyArray<string>;
}

function vsummary(u: UploadSummary): VSummary | null {
  return (u.validationSummary as VSummary | null) ?? null;
}

/** Operational one-liner for the Summary column. */
function summaryText(u: UploadSummary): string {
  if (u.errorMessage) return u.errorMessage;
  const vs = vsummary(u);
  if (vs && typeof vs.rowsParsed === 'number') {
    const accepted = vs.rowsAccepted ?? 0;
    const rejected = vs.rowsRejected ?? 0;
    if (rejected > 0) {
      return `${accepted.toLocaleString()} accepted · ${rejected.toLocaleString()} rejected`;
    }
    return `${vs.rowsParsed.toLocaleString()} rows · all accepted`;
  }
  if (u.uploadStatus === 'queued' || u.uploadStatus === 'uploading') return 'Awaiting validation';
  if (u.uploadStatus === 'validating') return 'Validating…';
  return '—';
}

/** Error count for the Errors column; null when unknown / not validated. */
function errorCount(u: UploadSummary): number | null {
  const vs = vsummary(u);
  if (vs && typeof vs.rowsRejected === 'number') return vs.rowsRejected;
  return null;
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
