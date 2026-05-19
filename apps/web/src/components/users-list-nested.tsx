'use client';

import { useState } from 'react';
import { useMemo } from 'react';
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
import {
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  useUsers,
  useUserTransition,
  useResendInvitation,
  useRevokeInvitation,
  type UserSummary,
} from '@/lib/api-users';
import { describeError, useSession } from '@/lib/session';
import { InviteUserDialog } from '@/components/invite-user-dialog';
import type { Organization } from '@/lib/api-orgs';

const STATUS_TONE: Record<UserSummary['status'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  pending_invite: 'warning',
  deactivated: 'neutral',
};

type ConfirmAction =
  | { kind: 'deactivate'; user: UserSummary }
  | { kind: 'reactivate'; user: UserSummary }
  | { kind: 'revoke-invite'; user: UserSummary };

export function UsersListNested({ organization }: { organization: Organization }) {
  const { data: session } = useSession();
  const toast = useToast();
  const usersQ = useUsers({ organizationId: organization.id });
  const deactivate = useUserTransition('deactivate');
  const reactivate = useUserTransition('reactivate');
  const resend = useResendInvitation();
  const revokeInv = useRevokeInvitation();

  const [showInvite, setShowInvite] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  // Same DataTable primitives as workspaces: per-org URL prefix so each
  // org's user table keeps its own sort/search/filter independently.
  // /v1/users isn't paginated server-side yet (small row counts per org);
  // when it gains paging this is the only place that needs to change.
  const [tableState, tableActions] = useDataTableState({
    storageKey: 'users-table',
    urlKey: `users.${organization.slug}`,
    defaultPageSize: 20,
  });

  const isManager = session?.isInternalManager ?? false;
  const isOrgAdmin = session?.effectiveRole === 'organization_admin';
  const canInvite = (isManager || isOrgAdmin) && organization.organizationStatus === 'active';
  const isSelf = (u: UserSummary) => session?.userId === u.id;

  function buildMenu(u: UserSummary): DropdownMenuItem[] {
    const items: DropdownMenuItem[] = [];
    if (u.status === 'pending_invite') {
      items.push({
        key: 'resend',
        label: 'Resend invitation',
        icon: RefreshCcw,
        onSelect: () => onResend(u),
      });
      items.push({
        key: 'revoke',
        label: 'Revoke invitation',
        icon: Trash2,
        variant: 'danger',
        divider: true,
        onSelect: () => setConfirm({ kind: 'revoke-invite', user: u }),
      });
      return items;
    }
    if (u.status === 'active') {
      items.push({
        key: 'deactivate',
        label: 'Deactivate',
        icon: Pause,
        disabled: isSelf(u),
        onSelect: () => setConfirm({ kind: 'deactivate', user: u }),
      });
    } else if (u.status === 'deactivated') {
      items.push({
        key: 'reactivate',
        label: 'Reactivate',
        icon: Play,
        onSelect: () => setConfirm({ kind: 'reactivate', user: u }),
      });
    }
    return items;
  }

  async function onResend(u: UserSummary) {
    try {
      await resend.mutateAsync(u.id);
      toast.push('success', `Invitation resent to ${u.email}.`);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  async function runConfirmed() {
    if (!confirm) return;
    const u = confirm.user;
    try {
      if (confirm.kind === 'deactivate') {
        await deactivate.mutateAsync({ id: u.id, expectedRowVersion: u.rowVersion });
        toast.push('success', `Deactivated ${u.displayName}.`);
      } else if (confirm.kind === 'reactivate') {
        await reactivate.mutateAsync({ id: u.id, expectedRowVersion: u.rowVersion });
        toast.push('success', `Reactivated ${u.displayName}.`);
      } else {
        await revokeInv.mutateAsync({ id: u.id, organizationId: u.organizationId });
        toast.push('success', `Revoked invitation for ${u.email}.`);
      }
      setConfirm(null);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  const COLUMNS: ReadonlyArray<ColumnDef<UserSummary>> = [
    {
      key: 'name',
      header: 'User',
      sortKey: 'displayName',
      hideable: false,
      accessor: (u) => (
        <div>
          <div className="font-medium text-foreground">{u.displayName}</div>
          <div className="text-xs text-muted-foreground">{u.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortKey: 'role',
      accessor: (u) => prettyRole(u),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      accessor: (u) => <Badge tone={STATUS_TONE[u.status]}>{u.status.replace('_', ' ')}</Badge>,
    },
    {
      key: 'verified',
      header: 'Email verified',
      sortKey: 'verified',
      accessor: (u) => (
        <span className="text-xs text-muted-foreground">
          {u.emailVerifiedAt ? '✓ verified' : '— pending'}
        </span>
      ),
    },
    {
      key: 'last',
      header: 'Last sign-in',
      sortKey: 'lastLoginAt',
      accessor: (u) => (
        <span data-numeric="true" className="text-xs text-muted-foreground">
          {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '48px',
      hideable: false,
      accessor: (u) =>
        buildMenu(u).length === 0 ? null : (
          <DropdownMenu
            align="end"
            trigger={
              <span className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </span>
            }
            items={buildMenu(u)}
          />
        ),
    },
  ];

  // Client-side search + filter + sort + paginate over the in-memory
  // /v1/users response. Same shape as WorkspaceListNested — when
  // /v1/users gains server-side paging, the only block that needs to
  // change is this one.
  const allRows = usersQ.data ?? [];
  const statusFilter = tableState.filters.status as UserSummary['status'] | undefined;

  const filtered = useMemo(() => {
    let rows: ReadonlyArray<UserSummary> = allRows;
    if (statusFilter) rows = rows.filter((u) => u.status === statusFilter);
    const q = tableState.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [allRows, statusFilter, tableState.search]);

  const sorted = useMemo(() => {
    if (!tableState.sort) return filtered;
    const { column, direction } = tableState.sort;
    const sign = direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av: unknown;
      let bv: unknown;
      if (column === 'role') {
        av = prettyRole(a);
        bv = prettyRole(b);
      } else if (column === 'verified') {
        av = a.emailVerifiedAt ?? '';
        bv = b.emailVerifiedAt ?? '';
      } else if (column === 'lastLoginAt') {
        av = a.lastLoginAt ?? '';
        bv = b.lastLoginAt ?? '';
      } else {
        av = (a as unknown as Record<string, unknown>)[column];
        bv = (b as unknown as Record<string, unknown>)[column];
      }
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * sign;
      if (bv == null) return 1 * sign;
      return String(av).localeCompare(String(bv)) * sign;
    });
  }, [filtered, tableState.sort]);

  const pageStart = tableState.page * tableState.pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + tableState.pageSize);

  function onExport(): void {
    exportRowsToCsv(
      sorted,
      [
        { key: 'name',     header: 'Name',          value: (u) => u.displayName },
        { key: 'email',    header: 'Email',         value: (u) => u.email },
        { key: 'role',     header: 'Role',          value: (u) => prettyRole(u) },
        { key: 'status',   header: 'Status',        value: (u) => u.status },
        { key: 'verified', header: 'Email verified', value: (u) => (u.emailVerifiedAt ? 'yes' : 'no') },
        { key: 'last',     header: 'Last sign-in',  value: (u) => u.lastLoginAt ?? '' },
        { key: 'created',  header: 'Created',       value: (u) => u.createdAt },
      ],
      `users-${organization.slug}-${new Date().toISOString().slice(0, 10)}.csv`,
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

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar<UserSummary>
        columns={COLUMNS}
        columnVisibility={tableState.columnVisibility}
        onColumnVisibilityChange={tableActions.setColumnVisibility}
        search={tableState.search}
        onSearchChange={tableActions.setSearch}
        searchPlaceholder="Search by name or email"
        density={tableState.density}
        onDensityChange={tableActions.setDensity}
        onExport={allRows.length > 0 ? onExport : undefined}
        chips={chips}
        onClearAllFilters={chips.length > 0 ? tableActions.clearAllFilters : undefined}
        trailing={
          <>
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
                  {statusFilter ? `Status: ${statusFilter.replace('_', ' ')}` : 'Status'}
                </span>
              }
              items={[
                {
                  key: 'all',
                  label: 'All statuses',
                  trailing: statusFilter ? null : <span aria-hidden="true">✓</span>,
                  onSelect: () => tableActions.clearFilter('status'),
                },
                ...(['active', 'pending_invite', 'deactivated'] as const).map((s) => ({
                  key: s,
                  label: s.replace('_', ' '),
                  trailing: statusFilter === s ? <span aria-hidden="true">✓</span> : null,
                  onSelect: () => tableActions.setFilter('status', s),
                })),
              ]}
            />
            {canInvite ? (
              <Button size="sm" onClick={() => setShowInvite(true)}>
                <UserPlus className="mr-1 h-3.5 w-3.5" /> Invite user
              </Button>
            ) : organization.organizationStatus !== 'active' ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                Invitations locked
              </span>
            ) : null}
          </>
        }
      />

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <DataTable
          columns={COLUMNS}
          rows={pageRows}
          rowKey={(u) => u.id}
          loading={usersQ.isLoading}
          density={tableState.density}
          sort={tableState.sort}
          onSortChange={tableActions.setSort}
          columnVisibility={tableState.columnVisibility}
          onColumnVisibilityChange={tableActions.setColumnVisibility}
          className="rounded-none border-0"
          emptyState={
            <div className="flex flex-col items-center gap-3 py-6">
              <span className="text-sm">
                {tableState.search || statusFilter
                  ? 'No users match the current filters.'
                  : 'No users yet in this organization.'}
              </span>
              {!tableState.search && !statusFilter && canInvite ? (
                <Button size="sm" variant="outline" onClick={() => setShowInvite(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Invite the first user
                </Button>
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

      <InviteUserDialog open={showInvite} onClose={() => setShowInvite(false)} organization={organization} />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        busy={deactivate.isPending || reactivate.isPending || revokeInv.isPending}
        variant={
          confirm?.kind === 'deactivate' || confirm?.kind === 'revoke-invite' ? 'danger' : 'default'
        }
        title={confirmTitle(confirm)}
        description={confirmDescription(confirm)}
        confirmLabel={confirmCta(confirm)}
      />
    </div>
  );
}

function prettyRole(u: UserSummary): string {
  if (u.userKind === 'internal') {
    return u.internalRole === 'manager' ? 'Internal manager' : 'Internal staff';
  }
  return u.orgRole === 'admin' ? 'Organization admin' : 'Organization user';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function confirmTitle(c: ConfirmAction | null): string {
  if (!c) return '';
  const name = c.user.displayName;
  switch (c.kind) {
    case 'deactivate':    return `Deactivate ${name}?`;
    case 'reactivate':    return `Reactivate ${name}?`;
    case 'revoke-invite': return `Revoke invitation for ${name}?`;
  }
}
function confirmDescription(c: ConfirmAction | null): string {
  if (!c) return '';
  switch (c.kind) {
    case 'deactivate':
      return 'Deactivated users can no longer sign in. Existing sessions stay live until they expire — use admin revoke to force sign-out everywhere immediately.';
    case 'reactivate':
      return 'Restore the user to active. They can sign in again with their existing password.';
    case 'revoke-invite':
      return 'Invalidates the invitation link and removes the pending user record. You can invite the same email again later.';
  }
}
function confirmCta(c: ConfirmAction | null): string {
  if (!c) return 'Confirm';
  switch (c.kind) {
    case 'deactivate':    return 'Deactivate';
    case 'reactivate':    return 'Reactivate';
    case 'revoke-invite': return 'Revoke';
  }
}
