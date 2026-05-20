'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Building2, Layers, ArrowRight, Upload as UploadIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Metric,
  useToast,
} from '@xb/ui';
import {
  describeError,
  useActiveWorkspace,
  useSession,
  type ActiveWorkspaceSummary,
} from '@/lib/session';
import {
  useAccessibleWorkspaces,
  useSetActiveWorkspace,
  type AccessibleWorkspace,
} from '@/lib/api-workspaces-switch';
import { useSalesOrders } from '@/lib/api-sales';
import { useInventory } from '@/lib/api-inventory';

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

export default function DashboardPage() {
  const { data: user } = useSession();
  const { data: activeWorkspace, isLoading: activeLoading } = useActiveWorkspace();
  const { data: accessible } = useAccessibleWorkspaces();

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
        {activeWorkspace ? (
          <p className="text-sm text-muted-foreground">
            Operational overview for{' '}
            <span className="font-medium text-foreground">{activeWorkspace.workspaceName}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span>{activeWorkspace.organizationName}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {user?.isInternalManager
              ? 'Pick a workspace from the topbar to scope the view.'
              : 'Pick a workspace to begin.'}
          </p>
        )}
      </div>

      {activeLoading ? null : activeWorkspace ? (
        <ActiveDashboard workspace={activeWorkspace} />
      ) : (
        <NoWorkspaceState
          accessible={accessible ?? []}
          isManager={user?.isInternalManager ?? false}
        />
      )}
    </div>
  );
}

function ActiveDashboard({ workspace }: { workspace: ActiveWorkspaceSummary }) {
  // Stable 30-day window keyed off "today" — recomputes per mount, which
  // is fine for dashboard purposes (no need to be reactive across midnight).
  const { dateFrom, dateTo } = useMemo(() => {
    const today = new Date();
    const since = new Date(today.getTime() - DAYS_30_MS + 24 * 60 * 60 * 1000); // 30 days inclusive
    return {
      dateFrom: since.toISOString().slice(0, 10),
      dateTo: today.toISOString().slice(0, 10),
    };
  }, []);

  const salesQ = useSalesOrders({
    workspaceId: workspace.id,
    dateFrom,
    dateTo,
    // pageSize=1 — we only need aggregates, not the row data. Saves
    // bandwidth on workspaces with large order volumes.
    page: 0,
    pageSize: 1,
  });
  const invQ = useInventory({
    workspaceId: workspace.id,
    page: 0,
    pageSize: 1,
  });

  const sales = salesQ.data?.aggregates;
  const inv = invQ.data?.aggregates;

  // Days of stock cover = on-hand / (units sold per day over 30d).
  // Honest fallback: '—' when we don't have both halves.
  const stockCoverDays = useMemo(() => {
    if (!sales || !inv) return null;
    if (sales.totalQuantity <= 0 || inv.totalOnHand <= 0) return null;
    const dailyVelocity = sales.totalQuantity / 30;
    return inv.totalOnHand / dailyVelocity;
  }, [sales, inv]);

  const salesEmpty = !!sales && sales.totalOrders === 0;
  const invEmpty = !!inv && inv.totalOnHand === 0 && inv.distinctSkus === 0;

  return (
    <>
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-100 text-navy">
                <Layers className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{workspace.workspaceName}</span>
                  <Badge tone="info">{prettyType(workspace.workspaceType)}</Badge>
                  <Badge tone={workspace.workspaceStatus === 'active' ? 'success' : 'neutral'}>
                    {workspace.workspaceStatus}
                  </Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  <span>{workspace.organizationName}</span>
                </div>
              </div>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Manage workspace <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Revenue (30d)"
              value={
                salesQ.isLoading
                  ? '—'
                  : sales && sales.totalOrders > 0
                    ? formatTotal(sales.totalGross)
                    : '0'
              }
              hint={salesQ.isLoading ? 'loading…' : 'sum of total_price; mixed currencies shown raw'}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Orders (30d)"
              value={salesQ.isLoading ? '—' : (sales?.totalOrders ?? 0).toLocaleString()}
              hint={`since ${dateFrom}`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Units (30d)"
              value={salesQ.isLoading ? '—' : (sales?.totalQuantity ?? 0).toLocaleString()}
              hint="sum of order quantity"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Stock cover"
              value={
                stockCoverDays !== null
                  ? `${stockCoverDays.toFixed(1)} d`
                  : '—'
              }
              hint={
                stockCoverDays !== null
                  ? 'on-hand ÷ (units/30d)'
                  : !sales || !inv
                    ? 'loading…'
                    : 'needs sales + inventory data'
              }
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="On hand"
              value={invQ.isLoading ? '—' : (inv?.totalOnHand ?? 0).toLocaleString()}
              hint="latest snapshot per SKU"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Distinct SKUs"
              value={invQ.isLoading ? '—' : (inv?.distinctSkus ?? 0).toLocaleString()}
              hint="in latest inventory"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Warehouses"
              value={invQ.isLoading ? '—' : (inv?.distinctWarehouses ?? 0).toLocaleString()}
              hint="locations covered"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Metric
              label="Inventory valuation"
              value={
                invQ.isLoading
                  ? '—'
                  : inv && Number(inv.totalValuation) > 0
                    ? formatTotal(inv.totalValuation)
                    : '—'
              }
              hint={
                invQ.isLoading
                  ? 'loading…'
                  : inv && Number(inv.totalValuation) > 0
                    ? 'sum where unit_cost set'
                    : 'add unit_cost to your inventory CSV'
              }
            />
          </CardContent>
        </Card>
      </div>

      {(salesEmpty && invEmpty) ? (
        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              No data in this workspace yet. Upload a sales or inventory CSV to start populating the
              dashboard.
            </p>
            <Link href="/uploads">
              <Button size="sm" variant="outline">
                <UploadIcon className="mr-1 h-3.5 w-3.5" /> Open Uploads
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function NoWorkspaceState({
  accessible,
  isManager,
}: {
  accessible: ReadonlyArray<AccessibleWorkspace>;
  isManager: boolean;
}) {
  const toast = useToast();
  const setActive = useSetActiveWorkspace();

  async function pick(ws: AccessibleWorkspace) {
    try {
      await setActive.mutateAsync(ws.id);
      toast.push('success', `Switched to ${ws.workspaceName}.`);
    } catch (err) {
      toast.push('error', describeError(err));
    }
  }

  if (accessible.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">
            {isManager
              ? 'No active workspaces exist yet. Create one from Settings to get started.'
              : 'You do not have access to any workspaces yet. Ask your organization admin to invite you to one.'}
          </p>
          <div className="mt-4">
            <Link href="/settings">
              <Button size="sm" variant="outline">
                Open Settings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Up to 6 quick-pick cards so users can land on a workspace in one click
  // without having to hunt down the topbar switcher.
  const quickPicks = accessible.slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pick a workspace</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickPicks.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => pick(ws)}
              disabled={setActive.isPending}
              className="flex flex-col items-start gap-1 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:border-navy/40 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">{ws.workspaceName}</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                <span>{ws.organizationName}</span>
                <span aria-hidden="true">·</span>
                <span>{prettyType(ws.workspaceType)}</span>
              </span>
            </button>
          ))}
        </div>
        {accessible.length > quickPicks.length ? (
          <p className="mt-3 text-xs text-muted-foreground">
            +{accessible.length - quickPicks.length} more —{' '}
            <Link href="/select-workspace" className="underline-offset-2 hover:underline">
              view all
            </Link>
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Workspace type is a free-text optional label.
function prettyType(t: AccessibleWorkspace['workspaceType']): string {
  return t?.trim() || 'Workspace';
}

function formatTotal(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
