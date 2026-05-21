'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, PageHeader, TabPanel, Tabs } from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import { FlaskConical, Plus, Search } from 'lucide-react';
import { useActiveWorkspace, useSession } from '@/lib/session';
import { useOrganizations, type Organization } from '@/lib/api-orgs';
import { OrganizationCard } from '@/components/organization-card';
import { NewOrganizationDialog } from '@/components/new-organization-dialog';
import { InternalUsersPanel } from '@/components/internal-users-panel';
import { usePersistedStringSet } from '@/lib/use-persisted-set';
import { usePersistedString } from '@/lib/use-persisted-string';
import { useScrolledPast } from '@/lib/use-scrolled';

const EXPANDED_STORAGE_KEY = 'xb.settings.orgs.expanded';
const FILTER_STORAGE_KEY = 'xb.settings.orgs.filter';
const SECTION_STORAGE_KEY = 'xb.settings.section';

/**
 * Settings has two permission domains, kept deliberately separate:
 *
 *  - Organizations  → customer/tenant management (workspaces, org users,
 *    permissions, audit, billing, integrations). Layer 2.
 *  - Internal Users → XB Matrix platform staff. Cross-org platform
 *    administration. Layer 1.
 *
 * Internal staff see the full platform-admin section nav; organization
 * users only ever see their own organization.
 */
type Section =
  | 'organizations'
  | 'internal-users'
  | 'platform-audit'
  | 'feature-flags'
  | 'diagnostics'
  | 'billing-ops'
  | 'system-integrations';

const SECTIONS: ReadonlyArray<Section> = [
  'organizations',
  'internal-users',
  'platform-audit',
  'feature-flags',
  'diagnostics',
  'billing-ops',
  'system-integrations',
];

const SOON_SECTIONS: ReadonlyArray<Section> = [
  'platform-audit',
  'feature-flags',
  'diagnostics',
  'billing-ops',
  'system-integrations',
];

export default function SettingsPage() {
  const { data: user } = useSession();
  const isInternal = user?.userKind === 'internal';

  const [sectionRaw, setSection] = usePersistedString(SECTION_STORAGE_KEY, 'organizations');
  const section: Section = SECTIONS.includes(sectionRaw as Section)
    ? (sectionRaw as Section)
    : 'organizations';
  // Organization users never have access to platform-admin sections.
  const activeSection: Section = isInternal ? section : 'organizations';

  const [showNewOrg, setShowNewOrg] = useState(false);
  const isManager = user?.isInternalManager ?? false;

  const [sentinelRef, scrolled] = useScrolledPast();

  return (
    <div className="flex flex-col">
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />

      <div
        className={cn(
          'sticky top-0 z-20 bg-background/90 backdrop-blur transition-shadow duration-150',
          scrolled ? 'border-b border-border shadow-xb-md' : 'border-b border-transparent',
        )}
      >
        <div className="px-6 pb-4 pt-6 lg:px-8 lg:pt-8">
          <PageHeader
            title="Settings"
            description={
              isInternal
                ? 'Customer tenancy and XB Matrix platform administration.'
                : 'Your organization, workspaces, and users.'
            }
            actions={
              activeSection === 'organizations' && isManager ? (
                <div className="flex items-center gap-2">
                  <Link
                    href="/settings/bootstrap"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Bootstrap / testing tools (internal-manager only)"
                  >
                    <FlaskConical className="h-3.5 w-3.5" /> Bootstrap tools
                  </Link>
                  <Button onClick={() => setShowNewOrg(true)} size="sm">
                    <Plus className="mr-1 h-3.5 w-3.5" /> New organization
                  </Button>
                </div>
              ) : null
            }
          />
        </div>
      </div>

      <div className="px-6 py-4 lg:px-8">
        {isInternal ? (
          <Tabs<Section>
            value={activeSection}
            onChange={(s) => setSection(s)}
            items={[
              { key: 'organizations',      label: 'Organizations' },
              { key: 'internal-users',     label: 'Internal Users' },
              { key: 'platform-audit',     label: 'Platform Audit',     badge: <SoonBadge /> },
              { key: 'feature-flags',      label: 'Feature Flags',      badge: <SoonBadge /> },
              { key: 'diagnostics',        label: 'Diagnostics',        badge: <SoonBadge /> },
              { key: 'billing-ops',        label: 'Billing Ops',        badge: <SoonBadge /> },
              { key: 'system-integrations',label: 'System Integrations',badge: <SoonBadge /> },
            ]}
          >
            <TabPanel tabKey="organizations" className="pt-4">
              <OrganizationsSection isManager={isManager} onCreate={() => setShowNewOrg(true)} />
            </TabPanel>
            <TabPanel tabKey="internal-users" className="pt-4">
              <InternalUsersPanel />
            </TabPanel>
            {SOON_SECTIONS.map((s) => (
              <TabPanel key={s} tabKey={s} className="pt-4">
                <SectionPlaceholder section={s} />
              </TabPanel>
            ))}
          </Tabs>
        ) : (
          // Organization users get the Organizations section directly —
          // no platform-admin nav.
          <OrganizationsSection isManager={isManager} onCreate={() => setShowNewOrg(true)} />
        )}
      </div>

      <NewOrganizationDialog open={showNewOrg} onClose={() => setShowNewOrg(false)} />
    </div>
  );
}

function OrganizationsSection({
  isManager,
  onCreate,
}: {
  isManager: boolean;
  onCreate: () => void;
}) {
  const { data: activeWorkspace } = useActiveWorkspace();
  const [filter, setFilter] = usePersistedString(FILTER_STORAGE_KEY, '');
  const orgs = useOrganizations({ q: filter.trim() || undefined, pageSize: 200 });
  const [expanded, setExpanded] = usePersistedStringSet(EXPANDED_STORAGE_KEY);
  const visible = orgs.data?.items ?? [];
  const total = orgs.data?.total ?? 0;

  // Exactly one organization → expand it automatically.
  useEffect(() => {
    if (visible.length === 1 && expanded.size === 0) {
      const only = visible[0]!;
      setExpanded((cur) => {
        cur.add(only.id);
        return cur;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length === 1 ? visible[0]?.id : null]);

  // Expand the active workspace's parent org so the user lands in context.
  useEffect(() => {
    if (!activeWorkspace) return;
    if (expanded.has(activeWorkspace.organizationId)) return;
    setExpanded((cur) => {
      cur.add(activeWorkspace.organizationId);
      return cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.organizationId]);

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

  const showToolbar = total > 1 || filter.length > 0;

  return (
    <div className="flex flex-col gap-3 pb-6">
      {showToolbar ? (
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

      {orgs.isLoading ? (
        <CardSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState isManager={isManager} filtered={filter.length > 0} onCreate={onCreate} />
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
  );
}

const SECTION_COPY: Record<Section, { title: string; body: string }> = {
  organizations: { title: 'Organizations', body: '' },
  'internal-users': { title: 'Internal Users', body: '' },
  'platform-audit': {
    title: 'Platform Audit',
    body: 'Cross-organization audit access — every tenant action, status transition, and security event in one platform-wide trail.',
  },
  'feature-flags': {
    title: 'Feature Flags',
    body: 'Platform-wide and per-organization feature rollout controls. Schema (xb_core.feature_flags) is provisioned; UI lands with the rollout tooling.',
  },
  diagnostics: {
    title: 'Diagnostics',
    body: 'Platform health, pipeline status, connector probes, and operational diagnostics for support and engineering.',
  },
  'billing-ops': {
    title: 'Billing Ops',
    body: 'Cross-organization billing oversight — agency billing status, invoices, and account standing. Distinct from per-org billing.',
  },
  'system-integrations': {
    title: 'System Integrations',
    body: 'Platform-level integrations and API key issuance shared across organizations.',
  },
};

function SectionPlaceholder({ section }: { section: Section }) {
  const copy = SECTION_COPY[section];
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      <h3 className="font-heading text-sm font-semibold text-foreground">{copy.title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{copy.body}</p>
      <span className="mt-3 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        coming soon
      </span>
    </div>
  );
}

function SoonBadge() {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
      soon
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-muted/30" />
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
