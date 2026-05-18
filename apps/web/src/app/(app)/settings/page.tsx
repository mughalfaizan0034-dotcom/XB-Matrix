'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardContent, DataTable, PageHeader } from '@xb/ui';
import type { ColumnDef } from '@xb/ui';
import { useSession } from '@/lib/session';
import { useOrganizations, type Organization } from '@/lib/api-orgs';
import { useWorkspaces, type Workspace } from '@/lib/api-workspaces';
import { NewOrganizationDialog } from '@/components/new-organization-dialog';
import { NewWorkspaceDialog } from '@/components/new-workspace-dialog';
import { Plus } from 'lucide-react';

const STATUS_TONE: Record<Organization['organizationStatus'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  archived: 'neutral',
};

const WS_STATUS_TONE: Record<Workspace['workspaceStatus'], 'success' | 'neutral'> = {
  active: 'success',
  archived: 'neutral',
};

const ORG_COLUMNS: ReadonlyArray<ColumnDef<Organization>> = [
  { key: 'name',     header: 'Organization', accessor: (o) => (
      <div>
        <div className="font-medium text-foreground">{o.displayName}</div>
        <div className="text-xs text-muted-foreground">{o.slug}</div>
      </div>
    ) },
  { key: 'currency', header: 'Currency', accessor: (o) => o.defaultCurrencyCode },
  { key: 'tz',       header: 'Timezone', accessor: (o) => o.defaultTimezone },
  { key: 'status',   header: 'Status', accessor: (o) => (
      <Badge tone={STATUS_TONE[o.organizationStatus]}>{o.organizationStatus}</Badge>
    ) },
  { key: 'billing',  header: 'Billing', accessor: (o) => (
      <Badge tone={o.billingStatus === 'active' ? 'success' : 'neutral'}>{o.billingStatus.replace('_', ' ')}</Badge>
    ) },
  { key: 'created',  header: 'Created', accessor: (o) => (
      <span data-numeric="true" className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</span>
    ) },
];

const WS_COLUMNS: ReadonlyArray<ColumnDef<Workspace>> = [
  { key: 'name', header: 'Workspace', accessor: (w) => (
      <div className="font-medium text-foreground">{w.workspaceName}</div>
    ) },
  { key: 'type',     header: 'Type', accessor: (w) => prettyType(w.workspaceType) },
  { key: 'currency', header: 'Currency', accessor: (w) => w.defaultCurrencyCode },
  { key: 'tz',       header: 'Timezone', accessor: (w) => w.timezone },
  { key: 'dos',      header: 'DOS target', numeric: true, accessor: (w) => Number(w.dosTargetDays).toFixed(0) + 'd' },
  { key: 'status',   header: 'Status', accessor: (w) => (
      <Badge tone={WS_STATUS_TONE[w.workspaceStatus]}>{w.workspaceStatus}</Badge>
    ) },
  { key: 'created',  header: 'Created', accessor: (w) => (
      <span data-numeric="true" className="text-xs text-muted-foreground">{formatDate(w.createdAt)}</span>
    ) },
];

export default function SettingsPage() {
  const { data: user } = useSession();
  const orgs = useOrganizations();
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  const wsFilterOrg = orgFilter ?? (orgs.data?.[0]?.id ?? null);
  const workspaces = useWorkspaces({ organizationId: wsFilterOrg });
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [showNewWs, setShowNewWs] = useState(false);

  const isManager = user?.isInternalManager ?? false;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Organizations, workspaces, users, and permissions."
      />

      {/* Organizations */}
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Organizations</h2>
            <p className="text-sm text-muted-foreground">
              {isManager
                ? 'All tenants on the platform. Internal managers only.'
                : 'Your organization.'}
            </p>
          </div>
          {isManager ? (
            <Button onClick={() => setShowNewOrg(true)} size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" /> New organization
            </Button>
          ) : null}
        </div>
        <DataTable
          columns={ORG_COLUMNS}
          rows={orgs.data ?? []}
          rowKey={(o) => o.id}
          loading={orgs.isLoading}
          emptyState={
            isManager ? 'No organizations yet. Click "New organization" to add one.' : 'No organization assigned.'
          }
          onRowClick={(o) => setOrgFilter(o.id)}
        />
      </section>

      {/* Workspaces */}
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Workspaces</h2>
            <p className="text-sm text-muted-foreground">
              {wsFilterOrg
                ? `Workspaces in ${orgs.data?.find((o) => o.id === wsFilterOrg)?.displayName ?? 'selected organization'}.`
                : 'Select an organization above to manage its workspaces.'}
            </p>
          </div>
          {wsFilterOrg ? (
            <Button onClick={() => setShowNewWs(true)} size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" /> New workspace
            </Button>
          ) : null}
        </div>
        <DataTable
          columns={WS_COLUMNS}
          rows={workspaces.data ?? []}
          rowKey={(w) => w.id}
          loading={workspaces.isLoading}
          emptyState="No workspaces yet."
        />
      </section>

      {/* Coming next */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Next:</span> Users + permissions management
            land in the next phase. Today you can create the tenant skeleton and the system records
            every change in the audit log.
          </div>
        </CardContent>
      </Card>

      <NewOrganizationDialog open={showNewOrg} onClose={() => setShowNewOrg(false)} />
      <NewWorkspaceDialog
        open={showNewWs}
        onClose={() => setShowNewWs(false)}
        organizations={orgs.data ?? []}
        defaultOrganizationId={wsFilterOrg}
      />
    </div>
  );
}

function prettyType(t: Workspace['workspaceType']): string {
  switch (t) {
    case 'marketplace':  return 'Marketplace';
    case 'dtc':          return 'DTC';
    case 'warehouse':    return 'Warehouse';
    case 'omni_channel': return 'Omni-channel';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}
