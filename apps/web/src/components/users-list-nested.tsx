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
      accessor: (u) => prettyRole(u),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (u) => <Badge tone={STATUS_TONE[u.status]}>{u.status.replace('_', ' ')}</Badge>,
    },
    {
      key: 'verified',
      header: 'Email verified',
      accessor: (u) => (
        <span className="text-xs text-muted-foreground">
          {u.emailVerifiedAt ? '✓ verified' : '— pending'}
        </span>
      ),
    },
    {
      key: 'last',
      header: 'Last sign-in',
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {usersQ.data
            ? `${usersQ.data.length} user${usersQ.data.length === 1 ? '' : 's'}`
            : '…'}
        </p>
        {canInvite ? (
          <Button size="sm" onClick={() => setShowInvite(true)}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Invite user
          </Button>
        ) : !canInvite && organization.organizationStatus !== 'active' ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
            Invitations locked
          </span>
        ) : null}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={usersQ.data ?? []}
        rowKey={(u) => u.id}
        loading={usersQ.isLoading}
        emptyState={
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="text-sm">No users yet in this organization.</span>
            {canInvite ? (
              <Button size="sm" variant="outline" onClick={() => setShowInvite(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Invite the first user
              </Button>
            ) : null}
          </div>
        }
      />

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
