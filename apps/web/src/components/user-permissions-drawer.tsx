'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, useToast } from '@xb/ui';
import {
  useSetUserPermissions,
  useUserPermissions,
  WORKSPACE_ACCESS_LEVELS,
  type WorkspaceAccessLevel,
} from '@/lib/api-permissions';
import { describeError } from '@/lib/session';

/**
 * Per-user workspace permissions matrix, rows are the user's
 * organization workspaces, columns are None / View / Edit, exactly one
 * radio selected per row.
 *
 * Storage rule: 'none' soft-deletes the workspace_permissions row
 * server-side (missing row IS none). The UI displays 'none' as the
 * default radio for workspaces the user has never been granted.
 *
 * 'edit' is the operational admin level inside a workspace, there is
 * no separate workspace-admin radio. Platform administration stays a
 * system role.
 */
const LEVEL_LABEL: Record<WorkspaceAccessLevel, string> = {
  none: 'None',
  view: 'View',
  edit: 'Edit',
};

interface Props {
  readonly userId: string | null;
  readonly onClose: () => void;
}

export function UserPermissionsDrawer({ userId, onClose }: Props) {
  const open = userId !== null;
  const toast = useToast();
  const { data, isLoading } = useUserPermissions(userId);
  const save = useSetUserPermissions(userId ?? '');

  // Local edit state, keyed by workspaceId.
  const initial = useMemo(() => buildInitial(data?.workspaces ?? []), [data]);
  const [state, setState] = useState<Record<string, WorkspaceAccessLevel>>(initial);
  useEffect(() => setState(initial), [initial]);

  const dirty = useMemo(() => !shallowEqual(state, initial), [state, initial]);

  function setLevel(workspaceId: string, level: WorkspaceAccessLevel) {
    setState((prev) => ({ ...prev, [workspaceId]: level }));
  }
  function setAll(level: WorkspaceAccessLevel) {
    if (!data) return;
    setState(() =>
      Object.fromEntries(data.workspaces.map((w) => [w.workspaceId, level])),
    );
  }

  async function onSave() {
    if (!userId || !data) return;
    // Send only the workspaces that actually changed, minimal payload,
    // safer audit footprint.
    const diff: Record<string, WorkspaceAccessLevel> = {};
    for (const w of data.workspaces) {
      const next = state[w.workspaceId] ?? 'none';
      if (next !== w.accessLevel) diff[w.workspaceId] = next;
    }
    if (Object.keys(diff).length === 0) return;
    try {
      await save.mutateAsync(diff);
      toast.push('success', `Permissions saved for ${data.displayName}.`);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  return (
    <Drawer
      open={open}
      onClose={save.isPending ? () => undefined : onClose}
      title={data ? `Permissions, ${data.displayName}` : 'Permissions'}
      description={data ? `@${data.username} · ${data.organizationName}` : undefined}
    >
      {isLoading || !data ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : data.workspaces.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          This organization has no active workspaces to assign.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Bulk controls */}
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="mr-1">Set all workspaces to:</span>
            {WORKSPACE_ACCESS_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setAll(lvl)}
                className="rounded-md border border-border bg-background px-2 py-1 hover:bg-muted hover:text-foreground"
              >
                {LEVEL_LABEL[lvl]}
              </button>
            ))}
          </div>

          {/* Matrix */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Workspace</th>
                  {WORKSPACE_ACCESS_LEVELS.map((lvl) => (
                    <th key={lvl} className="w-20 px-2 py-2.5 text-center">
                      {LEVEL_LABEL[lvl]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.workspaces.map((w) => {
                  const current = state[w.workspaceId] ?? 'none';
                  return (
                    <tr key={w.workspaceId} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 text-foreground">{w.workspaceName}</td>
                      {WORKSPACE_ACCESS_LEVELS.map((lvl) => (
                        <td key={lvl} className="px-2 py-2.5 text-center">
                          <input
                            type="radio"
                            name={`perm-${w.workspaceId}`}
                            value={lvl}
                            checked={current === lvl}
                            onChange={() => setLevel(w.workspaceId, lvl)}
                            className="h-4 w-4 cursor-pointer accent-navy"
                            aria-label={`${w.workspaceName} ${LEVEL_LABEL[lvl]}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer key + save */}
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">None</span>, workspace hidden, no
            APIs/AI access. <span className="font-medium text-foreground">View</span> -
            read-only dashboards, reports, AI insights.{' '}
            <span className="font-medium text-foreground">Edit</span>, full operational
            access: uploads, configuration, future automations.
          </p>

          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save permissions'}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function buildInitial(
  ws: ReadonlyArray<{ workspaceId: string; accessLevel: WorkspaceAccessLevel }>,
): Record<string, WorkspaceAccessLevel> {
  const out: Record<string, WorkspaceAccessLevel> = {};
  for (const w of ws) out[w.workspaceId] = w.accessLevel;
  return out;
}

function shallowEqual(
  a: Record<string, WorkspaceAccessLevel>,
  b: Record<string, WorkspaceAccessLevel>,
): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (a[k] !== b[k]) return false;
  return true;
}
