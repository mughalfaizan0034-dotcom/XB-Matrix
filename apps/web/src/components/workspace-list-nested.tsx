'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DropdownMenu,
  useToast,
  type ColumnDef,
  type DropdownMenuItem,
} from '@xb/ui';
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
  type Workspace,
} from '@/lib/api-workspaces';
import { describeError } from '@/lib/session';
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

  const [showNew, setShowNew] = useState(false);
  const [edit, setEdit] = useState<Workspace | null>(null);
  const [audit, setAudit] = useState<Workspace | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

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
      accessor: (w) => <span className="font-medium text-foreground">{w.workspaceName}</span>,
    },
    { key: 'type',     header: 'Type',     accessor: (w) => prettyType(w.workspaceType) },
    { key: 'currency', header: 'Currency', accessor: (w) => w.defaultCurrencyCode },
    { key: 'tz',       header: 'Timezone', accessor: (w) => w.timezone },
    {
      key: 'dos',
      header: 'DOS target',
      numeric: true,
      accessor: (w) => `${Number(w.dosTargetDays).toFixed(0)}d`,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (w) => <Badge tone={WS_STATUS_TONE[w.workspaceStatus]}>{w.workspaceStatus}</Badge>,
    },
    {
      key: 'created',
      header: 'Created',
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {wsQ.data
            ? `${wsQ.data.length} workspace${wsQ.data.length === 1 ? '' : 's'}`
            : '…'}
        </p>
        {parentActive ? (
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
        )}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={wsQ.data ?? []}
        rowKey={(w) => w.id}
        loading={wsQ.isLoading}
        emptyState={
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="text-sm">No workspaces yet in this organization.</span>
            {parentActive ? (
              <Button size="sm" variant="outline" onClick={() => setShowNew(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Create the first workspace
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                Reactivate the organization first to add workspaces.
              </span>
            )}
          </div>
        }
      />

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

function prettyType(t: Workspace['workspaceType']): string {
  switch (t) {
    case 'marketplace':  return 'Marketplace';
    case 'dtc':          return 'DTC';
    case 'warehouse':    return 'Warehouse';
    case 'omni_channel': return 'Omni-channel';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}
