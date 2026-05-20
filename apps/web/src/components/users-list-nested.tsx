'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  Dialog,
  DropdownMenu,
  FormField,
  Input,
  exportRowsToCsv,
  useDataTableState,
  useToast,
  type ColumnDef,
  type DropdownMenuItem,
} from '@xb/ui';
import {
  KeyRound,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  UserPlus,
} from 'lucide-react';
import {
  useAdminResetPassword,
  useUsers,
  useUserTransition,
  type UserSummary,
} from '@/lib/api-users';
import { describeError, useSession } from '@/lib/session';
import { AddUserDialog } from '@/components/add-user-dialog';
import type { Organization } from '@/lib/api-orgs';

const STATUS_TONE: Record<UserSummary['status'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  pending_invite: 'warning',
  deactivated: 'neutral',
};

type ConfirmAction =
  | { kind: 'deactivate'; user: UserSummary }
  | { kind: 'reactivate'; user: UserSummary };

export function UsersListNested({ organization }: { organization: Organization }) {
  const { data: session } = useSession();
  const toast = useToast();
  const usersQ = useUsers({ organizationId: organization.id });
  const deactivate = useUserTransition('deactivate');
  const reactivate = useUserTransition('reactivate');

  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const [tableState, tableActions] = useDataTableState({
    storageKey: 'users-table',
    urlKey: `users.${organization.slug}`,
    defaultPageSize: 20,
  });

  const isManager = session?.isInternalManager ?? false;
  const isOrgAdmin = session?.effectiveRole === 'organization_admin';
  const canAdd = (isManager || isOrgAdmin) && organization.organizationStatus === 'active';
  const isSelf = (u: UserSummary) => session?.userId === u.id;

  function buildMenu(u: UserSummary): DropdownMenuItem[] {
    const items: DropdownMenuItem[] = [];
    if (u.status === 'active' || u.status === 'pending_invite') {
      items.push({
        key: 'reset-password',
        label: 'Reset password…',
        icon: KeyRound,
        onSelect: () => setResetTarget(u),
      });
    }
    if (u.status === 'active') {
      items.push({
        key: 'deactivate',
        label: 'Deactivate',
        icon: Pause,
        variant: 'danger',
        divider: true,
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

  async function runConfirmed() {
    if (!confirm) return;
    const u = confirm.user;
    try {
      if (confirm.kind === 'deactivate') {
        await deactivate.mutateAsync({ id: u.id, expectedRowVersion: u.rowVersion });
        toast.push('success', `Deactivated ${u.displayName}.`);
      } else {
        await reactivate.mutateAsync({ id: u.id, expectedRowVersion: u.rowVersion });
        toast.push('success', `Reactivated ${u.displayName}.`);
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
          <div className="font-mono text-xs text-muted-foreground">@{u.username}</div>
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
          u.username.toLowerCase().includes(q),
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
        { key: 'name',     header: 'Name',         value: (u) => u.displayName },
        { key: 'username', header: 'Username',     value: (u) => u.username },
        { key: 'role',     header: 'Role',         value: (u) => prettyRole(u) },
        { key: 'status',   header: 'Status',       value: (u) => u.status },
        { key: 'last',     header: 'Last sign-in', value: (u) => u.lastLoginAt ?? '' },
        { key: 'created',  header: 'Created',      value: (u) => u.createdAt },
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
        searchPlaceholder="Search by name or username"
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
            {canAdd ? (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <UserPlus className="mr-1 h-3.5 w-3.5" /> Add user
              </Button>
            ) : organization.organizationStatus !== 'active' ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                User management locked
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
              {!tableState.search && !statusFilter && canAdd ? (
                <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add the first user
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

      <AddUserDialog open={showAdd} onClose={() => setShowAdd(false)} organization={organization} />

      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        busy={deactivate.isPending || reactivate.isPending}
        variant={confirm?.kind === 'deactivate' ? 'danger' : 'default'}
        title={confirmTitle(confirm)}
        description={confirmDescription(confirm)}
        confirmLabel={confirmCta(confirm)}
      />
    </div>
  );
}

function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: UserSummary | null;
  onClose: () => void;
}) {
  const reset = useAdminResetPassword();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  useMemo(() => {
    if (target) {
      setPassword('');
      setSubmitError(null);
    }
  }, [target]);

  if (!target) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    try {
      await reset.mutateAsync({ id: target!.id, password });
      toast.push('success', `Password reset for ${target!.displayName}.`);
      onClose();
    } catch (err) {
      setSubmitError(describeError(err));
    }
  }

  return (
    <Dialog
      open
      onClose={() => (reset.isPending ? undefined : onClose())}
      title={`Reset password for ${target.displayName}`}
      description={`Set a new password for @${target.username}. Share it with them securely; they can change it after sign-in.`}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose} disabled={reset.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="reset-password-form" disabled={reset.isPending || password.length < 12}>
            {reset.isPending ? 'Resetting…' : 'Reset password'}
          </Button>
        </>
      }
    >
      <form id="reset-password-form" onSubmit={onSubmit} className="flex flex-col gap-3">
        <FormField label="New password" required hint="Minimum 12 characters.">
          {(p) => (
            <Input
              {...p}
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
              className="font-mono text-xs"
              autoFocus
            />
          )}
        </FormField>
        {submitError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {submitError}
          </div>
        ) : null}
      </form>
    </Dialog>
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
    case 'deactivate': return `Deactivate ${name}?`;
    case 'reactivate': return `Reactivate ${name}?`;
  }
}
function confirmDescription(c: ConfirmAction | null): string {
  if (!c) return '';
  switch (c.kind) {
    case 'deactivate':
      return 'Deactivated users can no longer sign in. Existing sessions stay live until they expire — use admin revoke to force sign-out everywhere immediately.';
    case 'reactivate':
      return 'Restore the user to active. They can sign in again with their existing password.';
  }
}
function confirmCta(c: ConfirmAction | null): string {
  if (!c) return 'Confirm';
  switch (c.kind) {
    case 'deactivate': return 'Deactivate';
    case 'reactivate': return 'Reactivate';
  }
}
