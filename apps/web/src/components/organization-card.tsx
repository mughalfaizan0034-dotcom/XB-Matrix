'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  ConfirmDialog,
  DropdownMenu,
  TabPanel,
  Tabs,
  useToast,
  type DropdownMenuItem,
} from '@xb/ui';
import { cn } from '@xb/ui/lib/cn';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  History,
  Pause,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react';
import {
  useOrgTransition,
  useSoftDeleteOrganization,
  type Organization,
} from '@/lib/api-orgs';
import { describeError, useSession } from '@/lib/session';
import { EditOrganizationDialog } from '@/components/edit-organization-dialog';
import { AuditTrail } from '@/components/audit-trail';
import { WorkspaceListNested } from '@/components/workspace-list-nested';

type TabKey = 'workspaces' | 'users' | 'permissions' | 'audit' | 'billing' | 'integrations';

const STATUS_TONE: Record<Organization['organizationStatus'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  archived: 'neutral',
};

type ConfirmAction = { transition: 'suspend' | 'archive' | 'softDelete' };

export function OrganizationCard({
  organization,
  expanded,
  onToggle,
}: {
  organization: Organization;
  expanded: boolean;
  onToggle: () => void;
}) {
  const toast = useToast();
  const { data: user } = useSession();
  const [tab, setTab] = useState<TabKey>('workspaces');
  const [edit, setEdit] = useState(false);
  const [audit, setAudit] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

  const suspend    = useOrgTransition('suspend');
  const reactivate = useOrgTransition('reactivate');
  const archive    = useOrgTransition('archive');
  const restore    = useOrgTransition('restore');
  const softDelete = useSoftDeleteOrganization();

  const isManager = user?.isInternalManager ?? false;
  const o = organization;

  function buildMenu(): DropdownMenuItem[] {
    const items: DropdownMenuItem[] = [
      { key: 'edit',  label: 'Edit organization',  icon: Pencil,  onSelect: () => setEdit(true) },
      { key: 'audit', label: 'View audit history', icon: History, onSelect: () => setAudit(true), divider: true },
    ];
    if (o.organizationStatus === 'active') {
      items.push({
        key: 'suspend',
        label: 'Suspend',
        icon: Pause,
        divider: true,
        onSelect: () => setConfirm({ transition: 'suspend' }),
      });
      items.push({
        key: 'archive',
        label: 'Archive',
        icon: Archive,
        onSelect: () => setConfirm({ transition: 'archive' }),
      });
    } else {
      items.push({
        key: 'reactivate',
        label: o.organizationStatus === 'suspended' ? 'Reactivate' : 'Restore to active',
        icon: Play,
        divider: true,
        onSelect: () => simpleTransition(reactivate, 'Reactivated'),
      });
    }
    if (isManager) {
      items.push({
        key: 'delete',
        label: 'Soft delete',
        icon: Trash2,
        variant: 'danger',
        divider: true,
        onSelect: () => setConfirm({ transition: 'softDelete' }),
      });
    }
    return items;
  }

  async function simpleTransition(
    mut: ReturnType<typeof useOrgTransition>,
    pastTense: string,
  ) {
    try {
      await mut.mutateAsync({ id: o.id, expectedRowVersion: o.rowVersion });
      toast.push('success', `${pastTense} ${o.displayName}.`);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  async function runConfirmed() {
    if (!confirm) return;
    try {
      if (confirm.transition === 'suspend') {
        await suspend.mutateAsync({ id: o.id, expectedRowVersion: o.rowVersion });
        toast.push('success', `Suspended ${o.displayName}.`);
      } else if (confirm.transition === 'archive') {
        await archive.mutateAsync({ id: o.id, expectedRowVersion: o.rowVersion });
        toast.push('success', `Archived ${o.displayName}.`);
      } else {
        await softDelete.mutateAsync({ id: o.id, expectedRowVersion: o.rowVersion });
        toast.push('success', `Deleted ${o.displayName}.`);
      }
      setConfirm(null);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <article
      className={cn(
        'overflow-hidden rounded-lg border bg-card transition-shadow',
        expanded ? 'border-navy/30 shadow-xb-md' : 'border-border shadow-xb-sm',
      )}
    >
      <header
        className={cn(
          'flex items-center gap-3 px-4 py-3 transition-colors',
          expanded && 'bg-navy-50/40 border-b border-border',
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Chevron className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-heading text-base font-semibold text-foreground">
                {o.displayName}
              </h3>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {o.slug}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span data-numeric="true">{o.defaultCurrencyCode}</span>
              <span aria-hidden="true">·</span>
              <span>{o.defaultTimezone}</span>
              <span aria-hidden="true">·</span>
              <span>created {formatDate(o.createdAt)}</span>
            </div>
          </div>
          <Badge tone={STATUS_TONE[o.organizationStatus]}>{o.organizationStatus}</Badge>
          {o.billingStatus !== 'not_configured' ? (
            <Badge tone={o.billingStatus === 'active' ? 'success' : 'neutral'}>
              {o.billingStatus.replace('_', ' ')}
            </Badge>
          ) : null}
        </button>

        <div className="flex flex-shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEdit(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <DropdownMenu
            align="end"
            trigger={
              <span className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                Actions
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
            }
            items={buildMenu()}
          />
        </div>
      </header>

      {expanded ? (
        <div className="px-4 pb-4 pt-2">
          <Tabs<TabKey>
            value={tab}
            onChange={setTab}
            items={[
              { key: 'workspaces',   label: 'Workspaces' },
              { key: 'users',        label: 'Users',        badge: <SoonBadge /> },
              { key: 'permissions',  label: 'Permissions',  badge: <SoonBadge /> },
              { key: 'audit',        label: 'Audit' },
              { key: 'billing',      label: 'Billing',      badge: <SoonBadge /> },
              { key: 'integrations', label: 'Integrations', badge: <SoonBadge /> },
            ]}
          >
            <TabPanel tabKey="workspaces" className="pt-4">
              <WorkspaceListNested organization={o} />
            </TabPanel>
            <TabPanel tabKey="users" className="pt-4">
              <Placeholder>
                Users management lands in the next phase. The schema (`xb_core.users` +
                `xb_core.user_invitations`) is in production; invitations, email
                verification, and password reset wire up in Phase E.2 part 2.
              </Placeholder>
            </TabPanel>
            <TabPanel tabKey="permissions" className="pt-4">
              <Placeholder>
                Permission assignment matrix (user × workspace × access_level + page
                overrides) lands alongside DB-backed resolver providers in part 2.
              </Placeholder>
            </TabPanel>
            <TabPanel tabKey="audit" className="pt-4">
              <Button size="sm" variant="outline" onClick={() => setAudit(true)}>
                <History className="mr-1.5 h-3.5 w-3.5" /> Open audit drawer
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Shows the last 50 events recorded for this organization (status
                transitions, edits, soft deletes). Workspace-level audit lives on each
                workspace's actions menu.
              </p>
            </TabPanel>
            <TabPanel tabKey="billing" className="pt-4">
              <Placeholder>
                Manual agency billing for now (no Stripe). When a billing flow is wired
                in, plan, invoices, payment methods, and tax info will live here.
              </Placeholder>
            </TabPanel>
            <TabPanel tabKey="integrations" className="pt-4">
              <Placeholder>
                Connectors (Amazon SP-API, marketplaces, ERP, 3PL) and API keys will live
                here. Schema (`xb_core.api_keys`) is provisioned; UI lands once an
                integration ships.
              </Placeholder>
            </TabPanel>
          </Tabs>
        </div>
      ) : null}

      <EditOrganizationDialog
        open={edit}
        onClose={() => setEdit(false)}
        organization={o}
      />
      <AuditTrail
        open={audit}
        onClose={() => setAudit(false)}
        entityKind="organization"
        entityId={o.id}
        entityLabel={o.displayName}
      />
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirmed}
        busy={suspend.isPending || archive.isPending || softDelete.isPending}
        variant={confirm?.transition === 'softDelete' ? 'danger' : 'default'}
        title={confirmTitle(confirm, o.displayName)}
        description={confirmDescription(confirm)}
        confirmLabel={confirmCta(confirm)}
      />
    </article>
  );
}

function SoonBadge() {
  return (
    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
      soon
    </span>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function confirmTitle(c: ConfirmAction | null, name: string): string {
  if (!c) return '';
  switch (c.transition) {
    case 'suspend':    return `Suspend ${name}?`;
    case 'archive':    return `Archive ${name}?`;
    case 'softDelete': return `Delete ${name}?`;
  }
}
function confirmDescription(c: ConfirmAction | null): string {
  if (!c) return '';
  switch (c.transition) {
    case 'suspend':
      return 'Suspended organizations sign-out all users and reject new sign-ins until reactivated. No data is lost.';
    case 'archive':
      return 'Archived items are hidden from active lists but data and audit history are preserved. You can restore later.';
    case 'softDelete':
      return 'Soft-deleted items are removed from view immediately. Data is retained for 90 days, then hard-purged. Internal managers can restore within that window.';
  }
}
function confirmCta(c: ConfirmAction | null): string {
  if (!c) return 'Confirm';
  return c.transition === 'softDelete' ? 'Delete' : c.transition === 'archive' ? 'Archive' : 'Suspend';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}
