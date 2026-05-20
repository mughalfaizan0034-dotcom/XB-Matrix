'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  Search,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  PageHeader,
  Select,
  useToast,
} from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import { describeError, useActiveWorkspace, useSession } from '@/lib/session';
import {
  useAccessibleWorkspaces,
  useSetActiveWorkspace,
  type AccessibleWorkspace,
} from '@/lib/api-workspaces-switch';

/**
 * Full-page workspace picker. Linked from the topbar switcher's
 * "View all" footer and used as a fallback navigation target when
 * a workspace-scoped module is opened without an active workspace.
 *
 * Layout: search + sort header, then a collapsible org→workspace
 * tree. Selecting a workspace persists it via setActive and routes
 * the user to ?next= (defaults to /dashboard).
 */
export default function SelectWorkspacePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <PickerInner />
    </Suspense>
  );
}

type Sort = 'org' | 'recent';

function PickerInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get('next') || '/dashboard';

  const { data: user } = useSession();
  const { data: active } = useActiveWorkspace();
  const { data: accessible, isLoading } = useAccessibleWorkspaces();
  const setActive = useSetActiveWorkspace();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('org');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pickingId, setPickingId] = useState<string | null>(null);

  const grouped = useMemo(() => groupByOrganization(accessible ?? [], sort), [accessible, sort]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grouped;
    return grouped
      .map((g) => {
        const orgMatch = g.organizationName.toLowerCase().includes(q);
        const matchingWs = g.workspaces.filter(
          (w) =>
            w.workspaceName.toLowerCase().includes(q) ||
            w.workspaceType.toLowerCase().includes(q),
        );
        // If the org name matches, keep all its workspaces; otherwise
        // keep only matching workspaces. Drop the group if nothing left.
        if (orgMatch) return g;
        if (matchingWs.length > 0) return { ...g, workspaces: matchingWs };
        return null;
      })
      .filter((g): g is NonNullable<typeof g> => g !== null);
  }, [grouped, query]);

  // Auto-expand all groups when searching so matches are visible
  // immediately. Auto-expand the active workspace's org on first load.
  useEffect(() => {
    if (query.trim()) {
      setExpanded(new Set(filteredGroups.map((g) => g.organizationId)));
    }
  }, [query, filteredGroups]);
  useEffect(() => {
    if (active && expanded.size === 0) {
      setExpanded(new Set([active.organizationId]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.organizationId]);
  // If exactly one org is accessible, expand it by default.
  useEffect(() => {
    if (grouped.length === 1 && expanded.size === 0) {
      setExpanded(new Set([grouped[0]!.organizationId]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.length === 1 ? grouped[0]?.organizationId : null]);

  function toggleOrg(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pick(ws: AccessibleWorkspace) {
    setPickingId(ws.id);
    try {
      await setActive.mutateAsync(ws.id);
      toast.push('success', `Switched to ${ws.workspaceName}.`);
      router.replace(next);
    } catch (err) {
      toast.push('error', describeError(err));
      setPickingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex items-center gap-3">
        <Link
          href={next}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <PageHeader
          title="Select a workspace"
          description={
            user?.isInternalManager
              ? 'Switch between any workspace in any organization. You can change this at any time from the topbar switcher.'
              : 'Switch between your available workspaces. You can change this at any time from the topbar switcher.'
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspaces or organizations"
            autoFocus
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort</span>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="h-9 w-44"
          >
            <option value="org">Organization (A–Z)</option>
            <option value="recent">Recently created</option>
          </Select>
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <SkeletonList />
          ) : filteredGroups.length === 0 ? (
            <EmptyState query={query} isManager={user?.isInternalManager ?? false} />
          ) : (
            <ul className="divide-y divide-border">
              {filteredGroups.map((group) => {
                const isExpanded = expanded.has(group.organizationId);
                const hasActiveWs = group.workspaces.some((w) => w.id === active?.id);
                return (
                  <li key={group.organizationId}>
                    <button
                      type="button"
                      onClick={() => toggleOrg(group.organizationId)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">
                          {group.organizationName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {group.workspaces.length} workspace
                          {group.workspaces.length === 1 ? '' : 's'}
                          {hasActiveWs ? ' · current' : ''}
                        </span>
                      </span>
                    </button>

                    {isExpanded ? (
                      <ul className="divide-y divide-border border-t border-border bg-muted/10">
                        {group.workspaces.map((ws) => {
                          const isActive = ws.id === active?.id;
                          const isPicking = pickingId === ws.id;
                          return (
                            <li key={ws.id}>
                              <button
                                type="button"
                                disabled={setActive.isPending}
                                onClick={() => pick(ws)}
                                className={cn(
                                  'flex w-full items-center gap-3 px-4 py-2.5 pl-12 text-left transition-colors',
                                  isActive
                                    ? 'bg-navy-50/60 text-foreground'
                                    : 'text-foreground hover:bg-muted/60',
                                  setActive.isPending && !isPicking && 'opacity-50',
                                )}
                              >
                                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">
                                    {ws.workspaceName}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {prettyType(ws.workspaceType)}
                                  </span>
                                </span>
                                {isActive ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-navy">
                                    <Check className="h-3.5 w-3.5" /> Current
                                  </span>
                                ) : isPicking ? (
                                  <span className="text-xs text-muted-foreground">Switching…</span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Don't see what you need?{' '}
        <Link href="/settings" className="underline-offset-2 hover:underline">
          Manage organizations and workspaces in Settings
        </Link>
        .
      </p>
    </div>
  );
}

function groupByOrganization(
  workspaces: ReadonlyArray<AccessibleWorkspace>,
  sort: Sort,
): ReadonlyArray<{ organizationId: string; organizationName: string; workspaces: AccessibleWorkspace[] }> {
  const map = new Map<string, { organizationId: string; organizationName: string; workspaces: AccessibleWorkspace[] }>();
  for (const ws of workspaces) {
    const existing = map.get(ws.organizationId);
    if (existing) existing.workspaces.push(ws);
    else map.set(ws.organizationId, {
      organizationId: ws.organizationId,
      organizationName: ws.organizationName,
      workspaces: [ws],
    });
  }
  const groups = [...map.values()];
  // Workspaces within each group always sorted alphabetically — sort
  // only changes the org order.
  for (const g of groups) {
    g.workspaces.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
  }
  if (sort === 'org') {
    groups.sort((a, b) => a.organizationName.localeCompare(b.organizationName));
  }
  // 'recent' sort isn't available on AccessibleWorkspace yet — endpoint
  // doesn't return createdAt. Falls back to org order with a TODO.
  return groups;
}

// Workspace type is a free-text optional label.
function prettyType(t: AccessibleWorkspace['workspaceType']): string {
  return t?.trim() || 'Workspace';
}

function SkeletonList() {
  return (
    <ul className="divide-y divide-border">
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-4 py-3">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted/60" />
          <div className="mt-2 h-3 w-1/5 animate-pulse rounded bg-muted/40" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ query, isManager }: { query: string; isManager: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">
        {query
          ? `No workspaces or organizations match "${query}".`
          : isManager
            ? 'No active workspaces exist yet. Create one from Settings to get started.'
            : 'You do not have access to any workspaces yet. Ask your organization admin to invite you to one.'}
      </p>
      <Link href="/settings">
        <Button size="sm" variant="outline">
          Open Settings
        </Button>
      </Link>
    </div>
  );
}
