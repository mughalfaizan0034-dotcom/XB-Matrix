'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  useToast,
  type DropdownMenuItem,
} from '@xb/ui';
import { KeyRound, MoreHorizontal, Play, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import {
  useInternalUsers,
  useRemoveUser,
  useUserTransition,
  type UserSummary,
} from '@/lib/api-users';
import { describeError, useSession } from '@/lib/session';
import { AddUserDialog } from '@/components/add-user-dialog';
import { ResetPasswordDialog } from '@/components/users-list-nested';

/**
 * Internal Users, XB Matrix platform staff (super_admin /
 * internal_manager / internal_staff). This is the platform-administration
 * layer, deliberately separate from per-organization (tenant) users.
 * Internal users operate cross-org and have no organization.
 *
 * Visible to internal users only; create/remove gated to super_admin and
 * internal_manager (internal_staff is read-only).
 */
const STATUS_TONE: Record<UserSummary['status'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  pending_invite: 'warning',
  deactivated: 'neutral',
};

type ConfirmAction =
  | { kind: 'remove'; user: UserSummary }
  | { kind: 'reactivate'; user: UserSummary };

export function InternalUsersPanel() {
  const { data: session } = useSession();
  const toast = useToast();
  const usersQ = useInternalUsers();
  const reactivate = useUserTransition('reactivate');
  const remove = useRemoveUser();

  const [showAdd, setShowAdd] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  // Only super_admin / internal_manager manage platform staff.
  const canManage =
    session?.effectiveRole === 'super_admin' || session?.effectiveRole === 'internal_manager';
  const isSelf = (u: UserSummary) => session?.userId === u.id;

  const rows = useMemo(
    () => [...(usersQ.data ?? [])].sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [usersQ.data],
  );

  function buildMenu(u: UserSummary): DropdownMenuItem[] {
    if (!canManage) return [];
    const items: DropdownMenuItem[] = [];
    if (u.status === 'active' || u.status === 'pending_invite') {
      items.push({
        key: 'reset-password',
        label: 'Reset password…',
        icon: KeyRound,
        onSelect: () => setResetTarget(u),
      });
    }
    if (u.status === 'deactivated') {
      items.push({
        key: 'reactivate',
        label: 'Reactivate',
        icon: Play,
        onSelect: () => setConfirm({ kind: 'reactivate', user: u }),
      });
    }
    // The single super_admin row cannot be removed; nor can you remove
    // yourself.
    items.push({
      key: 'remove',
      label: 'Remove user',
      icon: Trash2,
      variant: 'danger',
      divider: items.length > 0,
      disabled: isSelf(u) || u.internalRole === 'super_admin',
      onSelect: () => setConfirm({ kind: 'remove', user: u }),
    });
    return items;
  }

  async function runConfirmed() {
    if (!confirm) return;
    const u = confirm.user;
    try {
      if (confirm.kind === 'remove') {
        await remove.mutateAsync({ id: u.id, organizationId: null });
        toast.push('success', `Removed ${u.displayName}.`);
      } else {
        await reactivate.mutateAsync({ id: u.id, expectedRowVersion: u.rowVersion });
        toast.push('success', `Reactivated ${u.displayName}.`);
      }
      setConfirm(null);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>
            Platform staff, cross-organization administrators. Not tied to any tenant.
          </span>
        </div>
        {canManage ? (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Add internal user
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5">User</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Last sign-in</th>
              <th className="w-12 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {usersQ.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading internal users…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No internal users yet.
                </td>
              </tr>
            ) : (
              rows.map((u) => {
                const menu = buildMenu(u);
                return (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{u.displayName}</div>
                      <div className="font-mono text-xs text-muted-foreground">@{u.username}</div>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{prettyInternalRole(u)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[u.status]}>{u.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground" data-numeric="true">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'never'}
                    </td>
                    <td className="px-4 py-2.5">
                      {menu.length === 0 ? null : (
                        <DropdownMenu
                          align="end"
                          trigger={
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </span>
                          }
                          items={menu}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <AddUserDialog open={showAdd} onClose={() => setShowAdd(false)} scope="internal" />

      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        busy={remove.isPending || reactivate.isPending}
        variant={confirm?.kind === 'remove' ? 'danger' : 'default'}
        title={
          !confirm
            ? ''
            : confirm.kind === 'remove'
              ? `Remove ${confirm.user.displayName}?`
              : `Reactivate ${confirm.user.displayName}?`
        }
        description={
          !confirm
            ? ''
            : confirm.kind === 'remove'
              ? 'The internal user is removed and can no longer sign in. Every active session is revoked immediately. Audit history is preserved.'
              : 'Restore the user to active. They can sign in again with their existing password.'
        }
        confirmLabel={confirm?.kind === 'remove' ? 'Remove user' : 'Reactivate'}
      />
    </div>
  );
}

function prettyInternalRole(u: UserSummary): string {
  if (u.internalRole === 'super_admin') return 'Super admin';
  if (u.internalRole === 'manager') return 'Internal manager';
  if (u.internalRole === 'staff') return 'Internal staff';
  // Defensive, an organization user should never appear in this list.
  return 'Internal user';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}
