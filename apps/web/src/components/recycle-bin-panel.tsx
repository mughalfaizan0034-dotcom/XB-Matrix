'use client';

import { useMemo, useState } from 'react';
import { Trash2, Undo2 } from 'lucide-react';
import {
  AwaitingDataState,
  Badge,
  Button,
  ConfirmDialog,
  useToast,
} from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import {
  useRecycleBin,
  useRestoreEntity,
  usePurgeEntity,
  type RecycleBinEntry,
  type RecycleBinKind,
} from '@/lib/api-recycle-bin';
import { describeError } from '@/lib/session';

/**
 * Recycle Bin operational surface.
 *
 * Lists soft-deleted users, organizations, and workspaces inside the
 * 30-day grace window. Internal managers + super admin can restore an
 * entry (clears deleted_at) or permanently delete it (calls the purge
 * orchestrator with reason='manual', triggering the same dependent
 * walk the daily cron uses).
 *
 * Direction (per project_deletion_lifecycle):
 *   - enterprise, calm, audit-aware, recoverable, lifecycle-oriented
 *   - NOT consumer-app "deleted items" / "trash dump"
 *   - destructive styling reserved for the Permanently delete action
 *   - row presentation neutral, no danger color on the body
 *
 * Generic over lifecycle metadata (deletedAt / deletedBy / purgeAt)
 * so the same panel renders consistently across all three kinds and
 * future entities can adopt the same vocabulary without redesigning
 * the surface.
 */
export function RecycleBinPanel() {
  const usersQ = useRecycleBin('user');
  const orgsQ = useRecycleBin('organization');
  const workspacesQ = useRecycleBin('workspace');

  // Merge all three lists; sort by deletedAt DESC so the most
  // recently removed sits at the top regardless of kind.
  const items = useMemo(() => {
    const all = [
      ...(usersQ.data ?? []),
      ...(orgsQ.data ?? []),
      ...(workspacesQ.data ?? []),
    ];
    return all
      .slice()
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }, [usersQ.data, orgsQ.data, workspacesQ.data]);

  const isLoading = usersQ.isLoading || orgsQ.isLoading || workspacesQ.isLoading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-base font-semibold text-foreground">
          Recycle Bin
        </h3>
        <p className="max-w-2xl text-xs text-muted-foreground">
          Users, organizations, and workspaces removed within the last 30 days.
          Restore returns the record to active state. Permanently delete
          triggers the purge orchestrator immediately, ahead of the daily
          sweep. After 30 days each entry is permanently deleted automatically.
        </p>
      </div>

      {isLoading ? (
        <SkeletonTable />
      ) : items.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-4">
          <AwaitingDataState
            headline="Recycle bin is empty"
            hint="Removed users, organizations, and workspaces appear here for 30 days before they are permanently deleted."
          />
        </div>
      ) : (
        <RecycleBinTable items={items} />
      )}
    </div>
  );
}

// ----- Table ---------------------------------------------------------

function RecycleBinTable({ items }: { items: ReadonlyArray<RecycleBinEntry> }) {
  return (
    <div className="overflow-clip rounded-md border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Item</th>
            <th className="px-4 py-2 text-left font-semibold">Type</th>
            <th className="px-4 py-2 text-left font-semibold">Deleted by</th>
            <th className="px-4 py-2 text-left font-semibold">Deleted at</th>
            <th className="px-4 py-2 text-left font-semibold">Scheduled purge</th>
            <th className="px-4 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <RecycleBinRow key={`${item.kind}:${item.id}`} entry={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecycleBinRow({ entry }: { entry: RecycleBinEntry }) {
  const toast = useToast();
  const restore = useRestoreEntity();
  const purge = usePurgeEntity();
  const [confirmPurge, setConfirmPurge] = useState(false);

  async function onRestore() {
    try {
      await restore.mutateAsync({ kind: entry.kind, id: entry.id });
      toast.push('success', `Restored ${entry.label}.`);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  async function onPurge() {
    setConfirmPurge(false);
    try {
      await purge.mutateAsync({ kind: entry.kind, id: entry.id });
      toast.push('success', `Permanently deleted ${entry.label}.`);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  const busy = restore.isPending || purge.isPending;

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-2.5">
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{entry.label}</span>
          {entry.organizationName ? (
            <span className="text-xs text-muted-foreground">
              {entry.organizationName}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <Badge tone="neutral">{TYPE_LABEL[entry.kind]}</Badge>
      </td>
      <td className="px-4 py-2.5 text-muted-foreground">
        {entry.deletedBy ?? 'System'}
      </td>
      <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
        {formatDate(entry.deletedAt)}
      </td>
      <td className="px-4 py-2.5">
        <PurgeCountdown entry={entry} />
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onRestore}
            disabled={busy}
          >
            <Undo2 className="mr-1 h-3.5 w-3.5" /> Restore
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmPurge(true)}
            disabled={busy}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Permanently delete
          </Button>
        </div>
      </td>

      <ConfirmDialog
        open={confirmPurge}
        title={`Permanently delete ${entry.label}?`}
        description={
          entry.kind === 'organization'
            ? `This will permanently delete the organization and every workspace, user, upload, and canonical record inside it. The audit trail is preserved, but the data itself cannot be recovered.`
            : entry.kind === 'workspace'
            ? `This will permanently delete the workspace and every upload, alias, and canonical record scoped to it. The audit trail is preserved, but the data itself cannot be recovered.`
            : `This will permanently delete the user account and every permission grant, session, and token tied to it. The audit trail is preserved, but the account cannot be recovered.`
        }
        confirmLabel="Permanently delete"
        cancelLabel="Cancel"
        variant="danger"
        busy={purge.isPending}
        onConfirm={onPurge}
        onClose={() => setConfirmPurge(false)}
      />
    </tr>
  );
}

// ----- Purge countdown ----------------------------------------------

function PurgeCountdown({ entry }: { entry: RecycleBinEntry }) {
  const days = entry.daysRemaining;
  // Calm by default. Reserve amber attention for the final stretch
  // (last 3 days) so the most actionable rows draw the eye without
  // making the whole list feel like an alarm.
  const tone =
    days === 0 ? 'warning' : days <= 3 ? 'warning' : 'neutral';
  const label =
    days === 0
      ? 'Purges today'
      : days === 1
      ? '1 day remaining'
      : `${days} days remaining`;
  return (
    <div className="flex flex-col">
      <span className="tabular-nums text-foreground">
        {formatDate(entry.purgeAt)}
      </span>
      <span
        className={cn(
          'mt-0.5 text-[10px] font-medium uppercase tracking-wide',
          tone === 'warning' ? 'text-warning-700' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ----- Skeleton loading state ---------------------------------------

function SkeletonTable() {
  return (
    <div className="overflow-clip rounded-md border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
        Loading recycle bin
      </div>
      <ul className="divide-y divide-border" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="flex items-center gap-3 px-4 py-3"
          >
            <div className="h-3 w-40 animate-shimmer rounded bg-muted" />
            <div className="h-3 w-16 animate-shimmer rounded bg-muted" />
            <div className="ml-auto h-3 w-24 animate-shimmer rounded bg-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----- helpers -------------------------------------------------------

const TYPE_LABEL: Record<RecycleBinKind, string> = {
  user: 'User',
  organization: 'Organization',
  workspace: 'Workspace',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
