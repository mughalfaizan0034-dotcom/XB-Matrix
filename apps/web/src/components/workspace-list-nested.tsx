'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  DropdownMenu,
  exportRowsToCsv,
  useDataTableState,
  useToast,
  type ColumnDef,
  type DropdownMenuItem,
} from '@xb/ui';
import { useMemo } from 'react';
import {
  Archive,
  History,
  Lock,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  useWorkspaces,
  useWorkspaceTransition,
  useSoftDeleteWorkspace,
  workspaceTypeLabel,
  type Workspace,
} from '@/lib/api-workspaces';
import { describeError, useActiveWorkspace } from '@/lib/session';
import { NewWorkspaceDialog } from '@/components/new-workspace-dialog';
import { EditWorkspaceDialog } from '@/components/edit-workspace-dialog';
import { AuditTrail } from '@/components/audit-trail';
import { type Organization } from '@/lib/api-orgs';

const WS_STATUS_TONE: Record<Workspace['workspaceStatus'], 'success' | 'neutral'> = {
  active: 'success',
  archived: 'neutral',
};

type ConfirmAction = { kind: 'archive' | 'softDelete'; ws: Workspace };

export function WorkspaceListNested({ organization }: { organization: Organization }) {
  const toast = useToast();
  const wsQ = useWorkspaces({ organizationId: organization.id });
  const { data: activeWorkspace } = useActiveWorkspace();

  const [showNew, setShowNew] = useState(false);
  const [edit, setEdit] = useState<Workspace | null>(null);
  const [audit, setAudit] = useState<Workspace | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  // Reference implementation of the DataTable primitives. State lives in
  // useDataTableState: search/sort persist to URL via a per-org prefix,
  // density + column visibility persist to localStorage. Filtering and
  // sorting are client-side here because /v1/workspaces doesn't paginate
  // server-side yet (low row count per org) — when it does, this is the
  // only thing that needs to change.
  const [tableState, tableActions] = useDataTableState({
    storageKey: 'workspaces-table',
    urlKey: `ws.${organization.slug}`,
    defaultPageSize: 20,
  });

  const archive = useWorkspaceTransition('archive');
  const reactivate = useWorkspaceTransition('reactivate');
  const softDelete = useSoftDeleteWorkspace();

  const parentActive = organization.organizationStatus === 'active';

  function buildMenu(w: Workspace): DropdownMenuItem[] {
    const items: DropdownMenuItem[] = [
      { key: 'edit',  label: 'Edit',               icon: Pencil,  onSelect: () => setEdit(w) },
      { key: 'audit', label: 'View audit history', icon: History, onSelect: () => setAudit(w), divider: true },
    ];
    if (w.workspaceStatus === 'active') {
      items.push({
        key: 'archive',
        label: 'Archive',
        icon: Archive,
        onSelect: () => setConfirm({ kind: 'archive', ws: w }),
        divider: true,
      });
    } else {
      items.push({
        key: 'reactivate',
        label: 'Reactivate',
        icon: Play,
        disabled: !parentActive,
        onSelect: () => simple(reactivate, w, 'Reactivated'),
        divider: true,
      });
    }
    items.push({
      key: 'delete',
      label: 'Soft delete',
      icon: Trash2,
      variant: 'danger',
      divider: true,
      onSelect: () => setConfirm({ kind: 'softDelete', ws: w }),
    });
    return items;
  }

  async function simple(
    mut: ReturnType<typeof useWorkspaceTransition>,
    w: Workspace,
    pastTense: string,
  ) {
    try {
      await mut.mutateAsync({ id: w.id, expectedRowVersion: w.rowVersion });
      toast.push('success', `${pastTense} ${w.workspaceName}.`);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  async function runConfirmed() {
    if (!confirm) return;
    const w = confirm.ws;
    try {
      if (confirm.kind === 'archive') {
        await archive.mutateAsync({ id: w.id, expectedRowVersion: w.rowVersion });
        toast.push('success', `Archived ${w.workspaceName}.`);
      } else {
        await softDelete.mutateAsync({ id: w.id, expectedRowVersion: w.rowVersion });
        toast.push('success', `Deleted ${w.workspaceName}.`);
      }
      setConfirm(null);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  const COLUMNS: ReadonlyArray<ColumnDef<Workspace>> = [
    {
      key: 'name',
      header: 'Workspace',
      sortKey: 'workspaceName',
      hideable: false,
      accessor: (w) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium text-foreground">{w.workspaceName}</span>
          {activeWorkspace?.id === w.id ? (
            <Badge tone="info">Current</Badge>
          ) : null}
        </span>
      ),
    },
    { key: 'type',     header: 'Type',     sortKey: 'workspaceType', accessor: (w) => workspaceTypeLabel(w.workspaceType) },
    { key: 'currency', header: 'Currency', sortKey: 'defaultCurrencyCode', accessor: (w) => w.defaultCurrencyCode },
    { key: 'tz',       header: 'Timezone', sortKey: 'timezone', accessor: (w) => w.timezone },
    {
      key: 'dos',
      header: 'DOS target',
      numeric: true,
      sortKey: 'dosTargetDays',
      accessor: (w) => `${Number(w.dosTargetDays).toFixed(0)}d`,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'workspaceStatus',
      accessor: (w) => <Badge tone={WS_STATUS_TONE[w.workspaceStatus]}>{w.workspaceStatus}</Badge>,
    },
    {
      key: 'created',
      header: 'Created',
      sortKey: 'createdAt',
      accessor: (w) => (
        <span data-numeric="true" className="text-xs text-muted-foreground">
          {formatDate(w.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      hideable: false,
      accessor: (w) => (
        <DropdownMenu
          align="end"
          trigger={
            <span className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </span>
          }
          items={buildMenu(w)}
        />
      ),
    },
  ];

  // Apply search → sort → paginate over the in-memory rows. Once
  // /v1/workspaces gains server-side pagination this whole block moves
  // into the query and the table just renders what comes back.
  const allRows = wsQ.data ?? [];
  const filtered = useMemo(() => {
    const q = tableState.search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (w) =>
        w.workspaceName.toLowerCase().includes(q) ||
        (w.workspaceType ?? '').toLowerCase().includes(q) ||
        w.defaultCurrencyCode.toLowerCase().includes(q),
    );
  }, [allRows, tableState.search]);

  const sorted = useMemo(() => {
    if (!tableState.sort) return filtered;
    const { column, direction } = tableState.sort;
    const sign = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[column];
      const bv = (b as unknown as Record<string, unknown>)[column];
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * sign;
      if (bv == null) return 1 * sign;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [filtered, tableState.sort]);

  const pageStart = tableState.page * tableState.pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + tableState.pageSize);

  function onExport(): void {
    exportRowsToCsv(
      sorted, // export the filtered+sorted set, not just the current page
      [
        { key: 'name',     header: 'Workspace',  value: (w) => w.workspaceName },
        { key: 'type',     header: 'Type',       value: (w) => w.workspaceType },
        { key: 'currency', header: 'Currency',   value: (w) => w.defaultCurrencyCode },
        { key: 'tz',       header: 'Timezone',   value: (w) => w.timezone },
        { key: 'dos',      header: 'DOS target', value: (w) => Number(w.dosTargetDays) },
        { key: 'status',   header: 'Status',     value: (w) => w.workspaceStatus },
        { key: 'created',  header: 'Created',    value: (w) => w.createdAt },
      ],
      `workspaces-${organization.slug}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar<Workspace>
        columns={COLUMNS}
        columnVisibility={tableState.columnVisibility}
        onColumnVisibilityChange={tableActions.setColumnVisibility}
        search={tableState.search}
        onSearchChange={tableActions.setSearch}
        searchPlaceholder="Search workspaces"
        density={tableState.density}
        onDensityChange={tableActions.setDensity}
        onExport={allRows.length > 0 ? onExport : undefined}
        chips={
          tableState.search
            ? [{ key: 'q', label: `Search: ${tableState.search}`, onRemove: () => tableActions.setSearch('') }]
            : undefined
        }
        onClearAllFilters={tableState.search ? tableActions.clearAllFilters : undefined}
        trailing={
          parentActive ? (
            <Button size="sm" onClick={() => setShowNew(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New workspace
            </Button>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
              title={`Reactivate this organization to add workspaces`}
            >
              <Lock className="h-3 w-3" /> Workspace creation locked
            </span>
          )
        }
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <DataTable
          columns={COLUMNS}
          rows={pageRows}
          rowKey={(w) => w.id}
          loading={wsQ.isLoading}
          density={tableState.density}
          sort={tableState.sort}
          onSortChange={tableActions.setSort}
          columnVisibility={tableState.columnVisibility}
          onColumnVisibilityChange={tableActions.setColumnVisibility}
          className="rounded-none border-0"
          rowClassName={(w) => (activeWorkspace?.id === w.id ? 'bg-navy-50/60' : undefined)}
          emptyState={
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="text-sm">
                {tableState.search
                  ? 'No workspaces match the search.'
                  : 'No workspaces yet in this organization.'}
              </span>
              {!tableState.search && parentActive ? (
                <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Create the first workspace
                </Button>
              ) : !tableState.search ? (
                <span className="text-xs text-muted-foreground">
                  Reactivate the organization first to add workspaces.
                </span>
              ) : null}
            </div>
          }
        />
        {sorted.length > tableState.pageSize ? (
          <DataTablePagination
            page={tableState.page}
            pageSize={tableState.pageSize}
            total={sorted.length}
            onPageChange={tableActions.setPage}
            onPageSizeChange={tableActions.setPageSize}
          />
        ) : null}
      </div>

      <NewWorkspaceDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        organizations={[organization]}
        defaultOrganizationId={organization.id}
      />
      <EditWorkspaceDialog open={edit !== null} onClose={() => setEdit(null)} workspace={edit} />
      <AuditTrail
        open={audit !== null}
        onClose={() => setAudit(null)}
        entityKind="workspace"
        entityId={audit?.id ?? null}
        entityLabel={audit?.workspaceName ?? ''}
      />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        busy={archive.isPending || softDelete.isPending}
        variant={confirm?.kind === 'softDelete' ? 'danger' : 'default'}
        title={
          !confirm
            ? ''
            : confirm.kind === 'archive'
              ? `Archive ${confirm.ws.workspaceName}?`
              : `Delete ${confirm.ws.workspaceName}?`
        }
        description={
          !confirm
            ? ''
            : confirm.kind === 'archive'
              ? 'Archived workspaces are hidden from active lists. Data + audit history are preserved; you can restore later.'
              : 'Soft-deleted workspaces are removed from view immediately. Data is retained for 90 days, then hard-purged. Restore within the window if needed.'
        }
        confirmLabel={confirm?.kind === 'softDelete' ? 'Delete' : 'Archive'}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}
