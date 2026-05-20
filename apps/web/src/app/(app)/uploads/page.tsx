'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, Layers, MoreHorizontal, Plus, RefreshCcw, Upload as UploadIcon } from 'lucide-react';
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
  PageHeader,
  TabPanel,
  Tabs,
  useDataTableState,
  useToast,
  type ColumnDef,
  type DropdownMenuItem,
} from '@xb/ui';
import { UploadTemplatesPanel } from '@/components/upload-templates-panel';
import { UploadValidationErrorsPanel } from '@/components/upload-validation-errors-panel';
import { useActiveWorkspace, useSession, describeError } from '@/lib/session';
import {
  useRetryUpload,
  useUploads,
  type UploadStatus,
  type UploadSummary,
} from '@/lib/api-uploads';
import { UploadDialog } from '@/components/upload-dialog';
import { UploadDetailDrawer } from '@/components/upload-detail-drawer';

const STATUS_TONE: Record<UploadStatus, 'success' | 'warning' | 'neutral' | 'danger'> = {
  queued:     'neutral',
  uploading:  'warning',
  validating: 'warning',
  ready:      'success',
  failed:     'danger',
};

const STATUS_LABEL: Record<UploadStatus, string> = {
  queued:     'queued',
  uploading:  'uploading',
  validating: 'validating',
  ready:      'ready',
  failed:     'failed',
};

const UPLOAD_PAGE_STORAGE = 'uploads-table';

export default function UploadsPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace } = useActiveWorkspace();
  const [tableState, tableActions] = useDataTableState({
    storageKey: UPLOAD_PAGE_STORAGE,
    urlKey: 'uploads',
    defaultPageSize: 20,
    defaultSort: { column: 'createdAt', direction: 'desc' },
  });

  const statusFilter = (tableState.filters.status as UploadStatus | undefined) ?? undefined;

  const uploadsQ = useUploads(
    activeWorkspace
      ? {
          workspaceId: activeWorkspace.id,
          q: tableState.search.trim() || undefined,
          status: statusFilter,
          sort: tableState.sort
            ? `${tableState.sort.direction === 'desc' ? '-' : ''}${tableState.sort.column}`
            : '-createdAt',
          page: tableState.page,
          pageSize: tableState.pageSize,
        }
      : undefined,
  );

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
      { key: 'open', label: 'Open details', onSelect: () => setOpenUploadId(u.id) },
    ];
    if (u.uploadStatus === 'failed') {
      items.push({
        key: 'retry',
        label: 'Retry',
        icon: RefreshCcw,
        divider: true,
        onSelect: () => onRetry(u),
      });
    }
    return items;
  }

  const COLUMNS: ReadonlyArray<ColumnDef<UploadSummary>> = useMemo(
    () => [
      {
        key: 'filename',
        header: 'File',
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
            <span className="block text-[11px] text-muted-foreground">{u.contentType}</span>
          </button>
        ),
      },
      {
        key: 'kind',
        header: 'Kind',
        sortKey: 'kind',
        accessor: (u) => <span className="text-sm text-foreground capitalize">{u.uploadKind.replace('_', ' ')}</span>,
      },
      {
        key: 'size',
        header: 'Size',
        sortKey: 'size',
        numeric: true,
        accessor: (u) => <span data-numeric="true">{humanSize(u.fileSizeBytes)}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        sortKey: 'status',
        accessor: (u) => <Badge tone={STATUS_TONE[u.uploadStatus]}>{STATUS_LABEL[u.uploadStatus]}</Badge>,
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
        key: 'createdAt',
        header: 'Uploaded',
        sortKey: 'createdAt',
        accessor: (u) => (
          <span data-numeric="true" className="text-xs text-muted-foreground">
            {formatDateTime(u.createdAt)}
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
    ],
    // Intentionally empty: buildRowMenu reads from refs (retry mutation,
    // toast); recreating the columns on every render would defeat memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!activeWorkspace) {
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <PageHeader
          title="Uploads"
          description="Raw dataset ingestion. Uploads are workspace-scoped and feed the canonical pipeline."
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {user?.isInternalManager
              ? 'Pick a workspace from the topbar switcher to see and create uploads.'
              : 'Pick a workspace to begin.'}
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = uploadsQ.data?.items ?? [];

  function onExport() {
    exportRowsToCsv(
      rows,
      [
        { key: 'filename',     header: 'Filename',     value: (u) => u.originalFilename },
        { key: 'kind',         header: 'Kind',         value: (u) => u.uploadKind },
        { key: 'contentType',  header: 'Content type', value: (u) => u.contentType },
        { key: 'size',         header: 'Size (bytes)', value: (u) => u.fileSizeBytes },
        { key: 'status',       header: 'Status',       value: (u) => u.uploadStatus },
        { key: 'retries',      header: 'Retries',      value: (u) => u.retryCount },
        { key: 'sha256',       header: 'SHA-256',      value: (u) => u.sha256 },
        { key: 'createdAt',    header: 'Created',      value: (u) => u.createdAt },
      ],
      `uploads-${activeWorkspace!.workspaceName}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  const chips = [
    tableState.search
      ? { key: 'q', label: `Search: ${tableState.search}`, onRemove: () => tableActions.setSearch('') }
      : null,
    statusFilter
      ? {
          key: 'status',
          label: `Status: ${statusFilter}`,
          onRemove: () => tableActions.clearFilter('status'),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  // Tabs follow the spec (Part 1 §Uploads): Files / History / Validation
  // Errors / Templates / Processing Logs. Files = new-upload affordance +
  // recent uploads (compact). History = full filterable/sortable DataTable.
  // Validation Errors = drill into failed uploads. Templates = downloadable
  // CSV templates. Processing Logs = (placeholder) per-upload event log.
  return (
    <div className="flex flex-col gap-5 p-6 lg:p-8">
      <PageHeader
        title="Uploads"
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
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New upload
          </Button>
        }
      />

      <Tabs<'files' | 'history' | 'errors' | 'templates' | 'logs'>
        defaultValue="files"
        items={[
          { key: 'files',     label: 'Upload Files' },
          { key: 'history',   label: 'Upload History' },
          { key: 'errors',    label: 'Validation Errors' },
          { key: 'templates', label: 'Templates' },
          { key: 'logs',      label: 'Processing Logs' },
        ]}
      >
        {/* ---- Upload Files: new upload + most recent --------------- */}
        <TabPanel tabKey="files" className="pt-4">
          <div className="flex flex-col gap-3">
            <Card>
              <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-foreground">New upload</div>
                  <p className="text-xs text-muted-foreground">
                    Drop a CSV / XLSX / JSON. Max 32 MB. Pick the matching kind so the right
                    validator runs.
                  </p>
                </div>
                <Button size="sm" onClick={() => setShowUpload(true)}>
                  <UploadIcon className="mr-1 h-3.5 w-3.5" /> Upload a file
                </Button>
              </CardContent>
            </Card>

            {/* Recent uploads (compact list) — last 5, sortable by created_at desc.
                Full filterable view lives in the History tab. */}
            <Card>
              <CardContent className="pt-5">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent uploads
                </div>
                {rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No uploads yet for this workspace.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {rows.slice(0, 5).map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                        <button
                          type="button"
                          onClick={() => setOpenUploadId(u.id)}
                          className="min-w-0 flex-1 text-left hover:text-navy"
                        >
                          <div className="truncate text-sm font-medium text-foreground">{u.originalFilename}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {u.uploadKind} · {formatDateTime(u.createdAt)}
                          </div>
                        </button>
                        <Badge tone={STATUS_TONE[u.uploadStatus]}>{STATUS_LABEL[u.uploadStatus]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabPanel>

        {/* ---- Upload History: full DataTable ----------------------- */}
        <TabPanel tabKey="history" className="pt-4">
      <div className="flex flex-col gap-3">
        <DataTableToolbar<UploadSummary>
          columns={COLUMNS}
          columnVisibility={tableState.columnVisibility}
          onColumnVisibilityChange={tableActions.setColumnVisibility}
          search={tableState.search}
          onSearchChange={tableActions.setSearch}
          searchPlaceholder="Search by filename"
          density={tableState.density}
          onDensityChange={tableActions.setDensity}
          onExport={rows.length > 0 ? onExport : undefined}
          chips={chips}
          onClearAllFilters={chips.length > 0 ? tableActions.clearAllFilters : undefined}
          trailing={
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
                ...(['queued', 'uploading', 'validating', 'ready', 'failed'] as const).map((s) => ({
                  key: s,
                  label: STATUS_LABEL[s],
                  trailing: statusFilter === s ? <span aria-hidden="true">✓</span> : null,
                  onSelect: () => tableActions.setFilter('status', s),
                })),
              ]}
            />
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
              <div className="flex flex-col items-center gap-3 py-6">
                <span className="text-sm">
                  {tableState.search || statusFilter
                    ? 'No uploads match the current filters.'
                    : 'No uploads yet for this workspace.'}
                </span>
                {!tableState.search && !statusFilter ? (
                  <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
                    <UploadIcon className="mr-1 h-3.5 w-3.5" /> Upload the first file
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
      </div>
        </TabPanel>

        {/* ---- Validation Errors --------------------------------- */}
        <TabPanel tabKey="errors" className="pt-4">
          <UploadValidationErrorsPanel
            uploads={rows}
            onOpenDetail={(id) => setOpenUploadId(id)}
          />
        </TabPanel>

        {/* ---- Templates ----------------------------------------- */}
        <TabPanel tabKey="templates" className="pt-4">
          <UploadTemplatesPanel />
        </TabPanel>

        {/* ---- Processing Logs (placeholder) -------------------- */}
        <TabPanel tabKey="logs" className="pt-4">
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Per-upload processing logs (validation runs, canonicalization jobs, retry attempts)
              land here once async workers ship. Until then, lifecycle events are visible in each
              upload's detail drawer.
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>

      <UploadDialog open={showUpload} onClose={() => setShowUpload(false)} />
      <UploadDetailDrawer
        uploadId={openUploadId}
        onClose={() => setOpenUploadId(null)}
      />

      <p className="text-xs text-muted-foreground">
        Files are stored privately in your workspace's bucket. Spec-aligned validators
        (amazon_sales, amazon_inventory, amazon_ads, walmart_sales) validate the
        templates; the mapping layer translates rows to platform-agnostic normalized
        entities; canonical insertion lands once Spec 3 canonical tables ship. See{' '}
        <Link href="/settings" className="underline-offset-2 hover:underline">
          Settings
        </Link>{' '}
        to manage workspaces.
      </p>
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
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
