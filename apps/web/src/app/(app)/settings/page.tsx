'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, PageHeader } from '@xb/ui';
import { Plus, Search } from 'lucide-react';
import { useSession } from '@/lib/session';
import { useOrganizations, type Organization } from '@/lib/api-orgs';
import { OrganizationCard } from '@/components/organization-card';
import { NewOrganizationDialog } from '@/components/new-organization-dialog';
import { usePersistedStringSet } from '@/lib/use-persisted-set';
import { usePersistedString } from '@/lib/use-persisted-string';

const EXPANDED_STORAGE_KEY = 'xb.settings.orgs.expanded';
const FILTER_STORAGE_KEY = 'xb.settings.orgs.filter';

export default function SettingsPage() {
  const { data: user } = useSession();
  const orgs = useOrganizations();
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [filter, setFilter] = usePersistedString(FILTER_STORAGE_KEY, '');
  const [expanded, setExpanded] = usePersistedStringSet(EXPANDED_STORAGE_KEY);
  const isManager = user?.isInternalManager ?? false;

  // If there's exactly one organization, expand it automatically — that's the
  // common case for organization users and there's no reason to make them click.
  useEffect(() => {
    if (orgs.data?.length === 1 && expanded.size === 0) {
      const only = orgs.data[0]!;
      setExpanded((cur) => {
        cur.add(only.id);
        return cur;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgs.data]);

  const visible = useMemo(() => {
    if (!orgs.data) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return orgs.data;
    return orgs.data.filter(
      (o) =>
        o.displayName.toLowerCase().includes(q) ||
        o.slug.includes(q) ||
        (o.legalName ?? '').toLowerCase().includes(q),
    );
  }, [orgs.data, filter]);

  function toggleExpand(o: Organization) {
    setExpanded((cur) => {
      if (cur.has(o.id)) cur.delete(o.id);
      else cur.add(o.id);
      return cur;
    });
  }

  function expandAll() {
    setExpanded((cur) => {
      visible.forEach((o) => cur.add(o.id));
      return cur;
    });
  }
  function collapseAll() {
    setExpanded(() => new Set());
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Tenants and operational configuration. Each organization expands to manage workspaces, users, permissions, audit, billing, and integrations."
        actions={
          isManager ? (
            <Button onClick={() => setShowNewOrg(true)} size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" /> New organization
            </Button>
          ) : null
        }
      />

      {orgs.data && orgs.data.length > 1 ? (
        <div className="flex items-center gap-2">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter organizations"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            />
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={expandAll}
              className="rounded px-2 py-1 hover:bg-muted hover:text-foreground"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded px-2 py-1 hover:bg-muted hover:text-foreground"
            >
              Collapse all
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {orgs.isLoading ? (
          <CardSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            isManager={isManager}
            filtered={filter.length > 0}
            onCreate={() => setShowNewOrg(true)}
          />
        ) : (
          visible.map((o) => (
            <OrganizationCard
              key={o.id}
              organization={o}
              expanded={expanded.has(o.id)}
              onToggle={() => toggleExpand(o)}
            />
          ))
        )}
      </div>

      <NewOrganizationDialog open={showNewOrg} onClose={() => setShowNewOrg(false)} />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="h-16 animate-pulse rounded-lg border border-border bg-muted/30"
        />
      ))}
    </div>
  );
}

function EmptyState({
  isManager,
  filtered,
  onCreate,
}: {
  isManager: boolean;
  filtered: boolean;
  onCreate: () => void;
}) {
  if (filtered) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        No organizations match the filter.
      </div>
    );
  }
  if (isManager) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No organizations yet. Create the first tenant to get started.
        </p>
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New organization
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
      No organization assigned to your account.
    </div>
  );
}
