'use client';

import { Badge } from '@xb/ui';
import {
  usePlatformAudit,
  usePlatformBilling,
  usePlatformDiagnostics,
  usePlatformFeatureFlags,
} from '@/lib/api-platform';

/**
 * Read-only diagnostic surfaces for internal managers. Backs the
 * Platform Audit / Feature Flags / Diagnostics / Billing Ops /
 * System Integrations sections in Settings. All math happens server-
 * side, these components are pure renderers.
 */

// ---------- Platform Audit ----------

export function PlatformAuditPanel() {
  const { data, isLoading, isError } = usePlatformAudit(150);
  return (
    <SectionShell
      title="Platform Audit"
      description="Last 30 days of operation + data-change events across every organization. Recent events at the top."
    >
      {isLoading ? (
        <SkeletonRows />
      ) : isError ? (
        <ErrorState message="Could not load audit events." />
      ) : !data || data.length === 0 ? (
        <EmptyState message="No audit events in the last 30 days." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Operation</th>
                <th className="px-4 py-2.5">Entity</th>
                <th className="px-4 py-2.5">Org</th>
                <th className="px-4 py-2.5">Actor</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-xs text-muted-foreground" data-numeric="true">
                    {formatDateTime(e.occurredAt)}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{e.operation}</td>
                  <td className="px-4 py-2 text-xs text-foreground">
                    <span className="font-mono">{e.entityKind}</span>
                    {e.entityId ? (
                      <span className="ml-1 font-mono text-muted-foreground">
                        {e.entityId.slice(0, 8)}…
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {e.organizationId ? `${e.organizationId.slice(0, 8)}…` : '-'}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    <span className="font-mono">{e.actorKind}</span>
                    {e.actorId ? (
                      <span className="ml-1 font-mono">{e.actorId.slice(0, 8)}…</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionShell>
  );
}

// ---------- Diagnostics ----------

export function PlatformDiagnosticsPanel() {
  const { data, isLoading, isError } = usePlatformDiagnostics();
  return (
    <SectionShell
      title="Diagnostics"
      description="Live platform health for support and on-call. Updates every 30 seconds."
    >
      {isLoading ? (
        <SkeletonRows />
      ) : isError || !data ? (
        <ErrorState message="Could not load diagnostics." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatusTile
              label="API"
              value={formatUptime(data.api.uptime)}
              hint={data.api.nodeVersion}
              tone="success"
            />
            <StatusTile
              label="Database"
              value={data.database.connected ? 'connected' : 'down'}
              hint={data.database.latencyMs !== null ? `${data.database.latencyMs} ms` : '-'}
              tone={data.database.connected ? 'success' : 'danger'}
            />
            <StatusTile
              label="Redis"
              value={data.redis.status}
              hint="cache / rate limits"
              tone={data.redis.status === 'ready' ? 'success' : 'warning'}
            />
            <StatusTile
              label="Object storage"
              value={data.storage.configured ? 'configured' : 'unconfigured'}
              hint="GCS uploads + reports"
              tone={data.storage.configured ? 'success' : 'warning'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <CountTile label="Organizations" value={data.counts.organizations} />
            <CountTile label="Workspaces" value={data.counts.workspaces} />
            <CountTile label="Users" value={data.counts.users} />
            <CountTile label="Uploads" value={data.counts.uploads} />
            <CountTile label="Audit (30d)" value={data.counts.auditEvents30d} />
            <CountTile label="channel_sales rows" value={data.counts.channelSalesRows} />
          </div>
        </div>
      )}
    </SectionShell>
  );
}

// ---------- Billing Ops ----------

const BILLING_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  past_due: 'danger',
  trial: 'warning',
  cancelled: 'neutral',
  not_configured: 'neutral',
};

export function PlatformBillingPanel() {
  const { data, isLoading, isError } = usePlatformBilling();
  return (
    <SectionShell
      title="Billing Ops"
      description="Manual invoicing tracker. Billing happens outside the platform, this view shows each tenant's current standing for reconciliation."
    >
      {isLoading ? (
        <SkeletonRows />
      ) : isError ? (
        <ErrorState message="Could not load billing data." />
      ) : !data || data.length === 0 ? (
        <EmptyState message="No organizations yet." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Organization</th>
                <th className="px-4 py-2.5">Slug</th>
                <th className="px-4 py-2.5">Currency</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Billing</th>
                <th className="px-4 py-2.5">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-foreground">{o.displayName}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{o.slug}</td>
                  <td className="px-4 py-2 font-mono text-xs text-foreground" data-numeric="true">
                    {o.defaultCurrencyCode}
                  </td>
                  <td className="px-4 py-2">
                    <Badge
                      tone={o.organizationStatus === 'active' ? 'success' : o.organizationStatus === 'suspended' ? 'warning' : 'neutral'}
                    >
                      {o.organizationStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={BILLING_TONE[o.billingStatus] ?? 'neutral'}>
                      {o.billingStatus.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground" data-numeric="true">
                    {formatDate(o.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Billing flows through manual agency invoicing for now. Update an
        organization's <code className="font-mono">billing_status</code> via its actions menu when an invoice is paid, past-due, or cancelled.
      </p>
    </SectionShell>
  );
}

// ---------- Feature Flags ----------

export function PlatformFeatureFlagsPanel() {
  const { data, isLoading, isError } = usePlatformFeatureFlags();
  return (
    <SectionShell
      title="Feature Flags"
      description="Platform-wide and per-scope rollout controls. Read-only, flag definitions live in the catalog migration."
    >
      {isLoading ? (
        <SkeletonRows />
      ) : isError || !data ? (
        <ErrorState message="Could not load feature flags." />
      ) : (
        <>
          {data.registered.length === 0 ? (
            <EmptyState message="No flags registered yet." />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Key</th>
                    <th className="px-4 py-2.5">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {data.registered.map((f) => (
                    <tr key={f.key} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{f.key}</td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{data.note}</p>
        </>
      )}
    </SectionShell>
  );
}

// ---------- System Integrations ----------

export function PlatformIntegrationsPanel() {
  return (
    <SectionShell
      title="System Integrations"
      description="External data feeds into XB Matrix."
    >
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
        <p className="text-sm text-foreground">
          All ingestion currently flows through the <strong>Uploads</strong> module, CSV ingestion is the only active channel.
        </p>
        <p className="mx-auto mt-2 max-w-xl text-xs text-muted-foreground">
          Direct connectors (Amazon SP-API / Walmart / Shopify / Meta Ads / Google Ads), scheduled syncs, webhook ingestion, and ERP/3PL feeds will surface here as they ship. The downstream pipeline already treats every source identically, adding a connector adds a validator + mapper at the ingestion edge only.
        </p>
        <span className="mt-3 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          reserved for future updates
        </span>
      </div>
    </SectionShell>
  );
}

// ---------- Shared primitives ----------

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function StatusTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'danger'
        ? 'border-red-200 bg-red-50'
        : tone === 'warning'
          ? 'border-amber-200 bg-amber-50'
          : 'border-border bg-card';
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-md border border-border bg-muted/30" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
