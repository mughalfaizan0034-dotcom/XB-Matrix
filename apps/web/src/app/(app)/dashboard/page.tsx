'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LoadingCard,
  Metric,
} from '@xb/ui';
import {
  useActiveWorkspace,
  type ActiveWorkspaceSummary,
} from '@/lib/session';
import {
  useDashboardKpis,
  type DashboardKpiBundle,
} from '@/lib/api-intelligence';

/**
 * The dashboard is the central engine's view layer, every figure on
 * this page comes from /v1/intelligence/dashboard, where the bundle
 * is computed in SQL with workspace-scoped access checks. The page
 * itself does no math: it picks fields off the payload, formats them
 * for the locale, and renders. Adding a new dashboard tile means
 * extending the engine, not the page.
 *
 * Workspace context: the dashboard cannot render without an active
 * workspace, so we route to /select-workspace whenever /me resolves
 * with no pin. While /me is still settling we hold rather than bounce
 * (transient hiccups would otherwise eject the user).
 */
export default function DashboardPage() {
  const router = useRouter();
  const { data: activeWorkspace } = useActiveWorkspace();

  useEffect(() => {
    if (activeWorkspace === null) {
      router.replace('/select-workspace?next=/dashboard');
    }
  }, [activeWorkspace, router]);

  if (!activeWorkspace) {
    // Session is still hydrating, or redirect is in flight. Render the
    // dashboard skeleton so the page does not visibly collapse before
    // the redirect lands; matches the populated layout dimensions for
    // a clean transition.
    return (
      <div className="flex flex-col gap-6 p-6 lg:p-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
        <KpiSkeletonGrid />
        <KpiSkeletonGrid />
        <KpiSkeletonGrid />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Dashboard</h1>
      <ActiveDashboard workspace={activeWorkspace} />
    </div>
  );
}

function KpiSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <LoadingCard />
      <LoadingCard />
      <LoadingCard />
      <LoadingCard />
    </div>
  );
}

function ActiveDashboard({ workspace }: { workspace: ActiveWorkspaceSummary }) {
  const kpiQ = useDashboardKpis(workspace.id, 30);
  const bundle = kpiQ.data;
  const loading = kpiQ.isLoading;

  return (
    <>
      <SalesTiles bundle={bundle} loading={loading} />
      <InventoryTiles bundle={bundle} loading={loading} />
      <CombinedTiles bundle={bundle} loading={loading} />
      <MarketplaceBreakdown bundle={bundle} loading={loading} />
      {/* No "Get started" CTA. Operational pages stay live-looking
          even with no data; tiles render zero / N/A inline, and the
          Uploads sidebar entry is the only nav into ingestion.
          Per feedback_no_onboarding_clutter. */}
    </>
  );
}

function SalesTiles({
  bundle,
  loading,
}: {
  bundle: DashboardKpiBundle | undefined;
  loading: boolean;
}) {
  if (loading) return <KpiSkeletonGrid />;
  const s = bundle?.sales;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <Metric
            label={`Revenue (${s?.windowDays ?? 30}d)`}
            value={s && s.orders > 0 ? formatMoney(s.revenue) : 'N/A'}
            hint="sum of order totals"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label={`Orders (${s?.windowDays ?? 30}d)`}
            value={(s?.orders ?? 0).toLocaleString()}
            hint={bundle ? `since ${bundle.window.from}` : 'last 30 days'}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label={`Units (${s?.windowDays ?? 30}d)`}
            value={(s?.units ?? 0).toLocaleString()}
            hint="sum of order quantity"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="Avg. order value"
            value={s?.averageOrderValue ? formatMoney(s.averageOrderValue) : 'N/A'}
            hint="revenue / orders"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InventoryTiles({
  bundle,
  loading,
}: {
  bundle: DashboardKpiBundle | undefined;
  loading: boolean;
}) {
  if (loading) return <KpiSkeletonGrid />;
  const i = bundle?.inventory;
  const hasValuation = !!i && Number(i.totalValuation) > 0;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="On hand"
            value={(i?.totalOnHand ?? 0).toLocaleString()}
            hint={i?.snapshotDate ? `as of ${i.snapshotDate}` : 'latest snapshot per SKU'}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="Distinct SKUs"
            value={(i?.distinctSkus ?? 0).toLocaleString()}
            hint="in latest inventory"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="Warehouses"
            value={(i?.distinctWarehouses ?? 0).toLocaleString()}
            hint="locations covered"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="Inventory valuation"
            value={hasValuation ? formatMoney(i!.totalValuation) : 'N/A'}
            hint={
              hasValuation
                ? `${formatPercent(i!.costCoverage)} of SKUs costed`
                : 'awaiting unit_cost in inventory feed'
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CombinedTiles({
  bundle,
  loading,
}: {
  bundle: DashboardKpiBundle | undefined;
  loading: boolean;
}) {
  if (loading) return <KpiSkeletonGrid />;
  const c = bundle?.combined;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="Stock cover"
            value={c?.stockCoverDays ? `${c.stockCoverDays} d` : 'N/A'}
            hint={c?.stockCoverDays ? 'on-hand / daily velocity' : 'awaiting sales + inventory'}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="Stockout risk"
            value={(c?.stockoutRiskSkus ?? 0).toLocaleString()}
            hint={
              bundle
                ? `SKUs under ${bundle.dosTargetDays}-day target`
                : 'SKUs below DOS target'
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="Dead stock"
            value={(c?.deadStockSkus ?? 0).toLocaleString()}
            hint="on-hand with zero sales in window"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Metric
            label="Daily velocity"
            value={
              bundle?.sales.dailyVelocity
                ? Number(bundle.sales.dailyVelocity).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })
                : 'N/A'
            }
            hint="units sold per day (window)"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function MarketplaceBreakdown({
  bundle,
  loading,
}: {
  bundle: DashboardKpiBundle | undefined;
  loading: boolean;
}) {
  if (loading || !bundle) return null;
  if (bundle.topMarketplaces.length === 0) {
    if (!bundle.salesReadiness.ready) return null;
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top marketplaces</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Marketplace</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Units</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {bundle.topMarketplaces.map((m) => (
                <tr key={m.marketplace} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">{m.marketplace}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.orders.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.units.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(m.revenue)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatPercent(m.revenueShare)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Engine-output renderers ---------------------------------------------
// These never compute, they format the bytes the engine emits.

function formatMoney(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return amount;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(share: string): string {
  const n = Number(share);
  if (!Number.isFinite(n)) return '-';
  return `${(n * 100).toFixed(0)}%`;
}

