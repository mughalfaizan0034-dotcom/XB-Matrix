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
  Upload as UploadIcon,
} from 'lucide-react';
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
import { useWorkspaces } from '@/lib/api-workspaces';
import {
  useRetryUpload,
  useUploads,
  type UploadStatus,
  type UploadSummary,
} from '@/lib/api-uploads';
import { UPLOAD_KIND_META } from '@/lib/upload-kind-labels';
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

/**
 * Uploads module.
 *
 * Workspace context behavior:
 *   - Active workspace pinned → page is fully operational. New uploads
 *     go to that workspace; history / errors / logs scoped to it.
 *   - "All workspaces" (no active workspace) → page renders in
 *     read-only cross-workspace mode. History / Validation Errors /
 *     Templates / Processing Logs all work. Only the New Upload
 *     mutation is gated, because creating a file requires choosing
 *     exactly one workspace to write into.
 *
 * Rationale: operations managers regularly need cross-workspace
 * visibility (monitoring, validation oversight, audit) without first
 * pinning a single workspace. Forcing a workspace selection to even
 * see the module is operational friction that doesn't match how the
 * rest of the platform is heading (CLAUDE.md Part 1 — "operational
 * control center" direction).
 */
export default function UploadsPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace } = useActiveWorkspace();
  const crossWorkspace = !activeWorkspace;

  const [tableState, tableActions] = useDataTableState({
    storageKey: UPLOAD_PAGE_STORAGE,
    urlKey: 'uploads',
    defaultPageSize: 20,
    defaultSort: { column: 'createdAt', direction: 'desc' },
  });

  const statusFilter = (tableState.filters.status as UploadStatus | undefined) ?? undefined;
  const workspaceFilter = (tableState.filters.workspaceId as string | undefined) ?? undefined;

  // Workspace catalog for the cross-workspace view's filter + name
  // resolution. Skips the request when a single workspace is pinned —
  // we already have its name on `activeWorkspace`.
  const workspacesQ = useWorkspaces({});
  const workspaceById = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workspacesQ.data ?? []) m.set(w.id, w.workspaceName);
    if (activeWorkspace) m.set(activeWorkspace.id, activeWorkspace.workspaceName);
    return m;
  }, [workspacesQ.data, activeWorkspace]);

  const uploadsQ = useUploads({
    // In cross-workspace mode pass undefined — backend lists across the
    // actor's accessible scope (org for org users, platform-wide for
    // internal managers). Workspace filter chip narrows it further.
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
    () => {
      const cols: Array<ColumnDef<UploadSummary>> = [
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
      ];
      // Workspace column only renders in cross-workspace mode — when a
      // workspace is pinned, every row belongs to the same one and the
      // column would be pure noise.
      if (crossWorkspace) {
        cols.push({
          key: 'workspace',
          header: 'Workspace',
          accessor: (u) => {
            const name = workspaceById.get(u.workspaceId);
            return name ? (
              <span className="text-sm text-foreground">{name}</span>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">{u.workspaceId.slice(0, 8)}…</span>
            );
          },
        });
      }
      cols.push(
        {
          key: 'kind',
          header: 'Category · source',
          sortKey: 'kind',
          accessor: (u) => {
            const meta = UPLOAD_KIND_META[u.uploadKind];
            return (
              <div className="flex flex-col leading-tight">
                <span className="text-sm text-foreground">{meta.categoryLabel}</span>
                <span className="text-[10px] text-muted-foreground">
                  {meta.platformLabel}
                  {meta.legacy ? ' · legacy' : ''}
                </span>
              </div>
            );
          },
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
      );
      return cols;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [crossWorkspace, workspaceById],
  );

  const rows = uploadsQ.data?.items ?? [];

  function onExport() {
    exportRowsToCsv(
      rows,
      [
        { key: 'filename',     header: 'Filename',     value: (u) => u.originalFilename },
        { key: 'workspace',    header: 'Workspace',    value: (u) => workspaceById.get(u.workspaceId) ?? u.workspaceId },
        { key: 'category',     header: 'Category',     value: (u) => UPLOAD_KIND_META[u.uploadKind].categoryLabel },
        { key: 'source',       header: 'Source format', value: (u) => UPLOAD_KIND_META[u.uploadKind].platformLabel },
        { key: 'kind',         header: 'Kind (id)',    value: (u) => u.uploadKind },
        { key: 'contentType',  header: 'Content type', value: (u) => u.contentType },
        { key: 'size',         header: 'Size (bytes)', value: (u) => u.fileSizeBytes },
        { key: 'status',       header: 'Status',       value: (u) => u.uploadStatus },
        { key: 'retries',      header: 'Retries',      value: (u) => u.retryCount },
        { key: 'sha256',       header: 'SHA-256',      value: (u) => u.sha256 },
        { key: 'createdAt',    header: 'Created',      value: (u) => u.createdAt },
      ],
      `uploads-${activeWorkspace?.workspaceName ?? 'all-workspaces'}-${new Date().toISOString().slice(0, 10)}.csv`,
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
    crossWorkspace && workspaceFilter
      ? {
          key: 'workspace',
          label: `Workspace: ${workspaceById.get(workspaceFilter) ?? workspaceFilter.slice(0, 8)}`,
          onRemove: () => tableActions.clearFilter('workspaceId'),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  // Header subtitle: pinned workspace gets the org/workspace breadcrumb;
  // cross-workspace mode shows a clear "all workspaces" indicator with
  // the actor's effective scope (org name or platform-wide for managers).
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
      <span>All workspaces · cross-org view</span>
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
              title="Uploads write into one workspace — pick one to continue."
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

      {/* Active-context banner — operators need an unambiguous signal
          of WHERE their data will land, especially when bouncing
          between workspaces. Only shown when a workspace is pinned;
          cross-workspace mode is its own clear state via the subtitle. */}
      {activeWorkspace ? (
        <div className="flex items-center gap-3 rounded-md border border-navy/20 bg-navy/[0.04] px-4 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-navy text-white">
            <Layers className="h-3.5 w-3.5" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Uploading into
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

      <Tabs<'files' | 'history' | 'errors' | 'templates' | 'logs'>
        defaultValue={crossWorkspace ? 'history' : 'files'}
        items={[
          { key: 'files',     label: 'Upload Files' },
          { key: 'history',   label: 'Upload History' },
          { key: 'errors',    label: 'Validation Errors' },
          { key: 'templates', label: 'Templates' },
          { key: 'logs',      label: 'Processing Logs' },
        ]}
      >
        {/* ---- Upload Files ----------------------------------------- */}
        <TabPanel tabKey="files" className="pt-4">
          <div className="flex flex-col gap-3">
            <Card>
              <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-foreground">New upload</div>
                  <p className="text-xs text-muted-foreground">
                    {crossWorkspace
                      ? 'Uploads write into one workspace. Pick a workspace below to start a new upload — history and templates stay available here without one.'
                      : 'Drop a CSV / XLSX / JSON. Max 32 MB. Pick the matching kind so the right validator runs.'}
                  </p>
                </div>
                {crossWorkspace ? (
                  <Link
                    href="/select-workspace?next=/uploads"
                    className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-xs font-medium text-white hover:bg-navy/90"
                  >
                    <UploadIcon className="h-3.5 w-3.5" /> Pick a workspace
                  </Link>
                ) : (
                  <Button size="sm" onClick={() => setShowUpload(true)}>
                    <UploadIcon className="mr-1 h-3.5 w-3.5" /> Upload a file
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Recent uploads — five most recent in the current scope.
                In cross-workspace mode this shows the five most recent
                across every accessible workspace. */}
            <Card>
              <CardContent className="pt-5">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {crossWorkspace ? 'Recent uploads (across workspaces)' : 'Recent uploads'}
                </div>
                {rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {crossWorkspace
                      ? 'No uploads across your accessible workspaces yet.'
                      : 'No uploads yet for this workspace.'}
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
                            {crossWorkspace ? (
                              <>
                                {workspaceById.get(u.workspaceId) ?? u.workspaceId.slice(0, 8)}
                                {' · '}
                              </>
                            ) : null}
                            {UPLOAD_KIND_META[u.uploadKind].compactLabel} · {formatDateTime(u.createdAt)}
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

        {/* ---- Upload History --------------------------------------- */}
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
                <div className="flex items-center gap-1.5">
                  {/* Workspace filter only available in cross-workspace mode. */}
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
                        ...((workspacesQ.data ?? []).map((w) => ({
                          key: w.id,
                          label: w.workspaceName,
                          trailing: workspaceFilter === w.id ? <span aria-hidden="true">✓</span> : null,
                          onSelect: () => tableActions.setFilter('workspaceId', w.id),
                        }))),
                      ]}
                    />
                  ) : null}
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
                  <div className="flex flex-col items-center gap-3 py-6">
                    <span className="text-sm">
                      {chips.length > 0
                        ? 'No uploads match the current filters.'
                        : crossWorkspace
                          ? 'No uploads across your accessible workspaces yet.'
                          : 'No uploads yet for this workspace.'}
                    </span>
                    {chips.length === 0 && !crossWorkspace ? (
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

        {/* ---- Validation Errors ------------------------------------ */}
        <TabPanel tabKey="errors" className="pt-4">
          <UploadValidationErrorsPanel
            uploads={rows}
            onOpenDetail={(id) => setOpenUploadId(id)}
          />
        </TabPanel>

        {/* ---- Templates (workspace-independent) -------------------- */}
        <TabPanel tabKey="templates" className="pt-4">
          <UploadTemplatesPanel />
        </TabPanel>

        {/* ---- Processing Logs (placeholder) ------------------------ */}
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
        entities; canonical insertion lands once Spec 3 canonical tables ship.
        {crossWorkspace && user?.isInternalManager ? (
          <>
            {' '}You're viewing every workspace you have access to — internal-manager
            scope.
          </>
        ) : null}{' '}
        See{' '}
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
