'use client';

import { useMemo } from 'react';
import { ChevronDown, Check, Layers, Globe } from 'lucide-react';
import { DropdownMenu, useToast, type DropdownMenuItem } from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import { describeError, useActiveWorkspace, useSession } from '@/lib/session';
import {
  useAccessibleWorkspaces,
  useSetActiveWorkspace,
  type AccessibleWorkspace,
} from '@/lib/api-workspaces-switch';

/**
 * Topbar workspace switcher. Hidden when the session has no accessible
 * workspaces yet (org just created, internal user with nothing assigned).
 */
export function WorkspaceSwitcher() {
  const { data: user } = useSession();
  const { data: active } = useActiveWorkspace();
  const { data: accessible, isLoading } = useAccessibleWorkspaces();
  const setActive = useSetActiveWorkspace();
  const toast = useToast();

  const grouped = useMemo(() => groupByOrganization(accessible ?? []), [accessible]);

  if (!user) return null;
  if (!isLoading && (!accessible || accessible.length === 0)) return null;

  async function onPick(workspaceId: string | null, label: string) {
    try {
      await setActive.mutateAsync(workspaceId);
      toast.push('success', workspaceId ? `Switched to ${label}.` : 'Cleared active workspace.');
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  const items: DropdownMenuItem[] = [];

  if (active) {
    items.push({
      key: 'clear',
      label: 'All workspaces',
      icon: Globe,
      onSelect: () => onPick(null, ''),
    });
  }

  grouped.forEach((group, groupIdx) => {
    const needsDivider = items.length > 0 || groupIdx > 0;
    group.workspaces.forEach((ws, wsIdx) => {
      const isActive = ws.id === active?.id;
      items.push({
        key: `ws-${ws.id}`,
        label: ws.workspaceName,
        description: group.organizationName,
        divider: needsDivider && wsIdx === 0,
        trailing: isActive ? <Check className="h-3.5 w-3.5" /> : null,
        onSelect: () => onPick(ws.id, ws.workspaceName),
      });
    });
  });

  const triggerLabel = active ? active.workspaceName : 'All workspaces';
  const triggerOrg = active?.organizationName ?? (user.isInternalManager ? 'cross-org view' : '');

  return (
    <DropdownMenu
      align="start"
      width="w-72"
      header={
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {user.isInternalManager ? 'All organizations' : 'Workspaces'}
        </div>
      }
      trigger={
        <span
          className={cn(
            'flex max-w-[240px] items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm transition-colors',
            'hover:bg-muted',
          )}
        >
          <Layers className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="min-w-0 text-left leading-tight">
            <span className="block truncate text-xs font-medium text-foreground">{triggerLabel}</span>
            {triggerOrg ? (
              <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {triggerOrg}
              </span>
            ) : null}
          </span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </span>
      }
      items={items}
    />
  );
}

function groupByOrganization(
  workspaces: ReadonlyArray<AccessibleWorkspace>,
): ReadonlyArray<{ organizationId: string; organizationName: string; workspaces: AccessibleWorkspace[] }> {
  const map = new Map<string, { organizationId: string; organizationName: string; workspaces: AccessibleWorkspace[] }>();
  for (const ws of workspaces) {
    const existing = map.get(ws.organizationId);
    if (existing) {
      existing.workspaces.push(ws);
    } else {
      map.set(ws.organizationId, {
        organizationId: ws.organizationId,
        organizationName: ws.organizationName,
        workspaces: [ws],
      });
    }
  }
  return [...map.values()];
}
