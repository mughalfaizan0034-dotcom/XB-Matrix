'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle, Metric } from '@xb/ui';
import { useActiveWorkspace } from '@/lib/session';
import {
  useAdvertisingSummary,
  type AdvertisingKpis as AdvertisingKpisShape,
  type AdvertisingPlatformBreakdownEntry,
} from '@/lib/api-intelligence';
import { EngineView } from '@/components/engine-view';

/**
 * Advertisements (PPC) — engine-output view of campaign performance.
 *
 * Every figure comes from /v1/intelligence/advertising, which is
 * computed server-side from xb_canonical.channel_ads (additive
 * primitives) joined to channel_sales (for TACOS denominator). The
 * page is a pure renderer — no divides, no sums, no derived metrics.
 *
 * Attribution window defaults to 14 days (industry-standard reporting
 * window). The engine pivots ACOS / TACOS / ROAS / CPC / CTR / CVR
 * around that window; an `attributionWindowDays` query param (1..90)
 * surfaces other windows when needed.
 */
export default function PpcPage() {
  const { data: ws } = useActiveWorkspace();
  const q = useAdvertisingSummary(ws?.id ?? null, 30);
  const data = q.data;

  return (
    <EngineView
      title="Advertisements"
      subtitle="Spend, ACOS, TACOS, ROAS — engine-computed."
      loading={q.isLoading || (!!ws && !data)}
      readiness={data?.readiness}
      emptyStateBody={
        <ul className="list-disc space-y-1 pl-5">
          <li>Spend &amp; impressions per ad platform</li>
          <li>Click-through and cost-per-click</li>
          <li>ACOS = spend ÷ attributed sales</li>
          <li>TACOS = spend ÷ total marketplace revenue (channel_sales join)</li>
          <li>ROAS = attributed sales ÷ spend</li>
          <li>CVR = attributed orders ÷ clicks</li>
        </ul>
      }
    >
      {data ? (
        <>
          <WindowBanner
            window={data.window}
            attributionWindowDays={data.attributionWindowDays}
            byAdPlatformCount={data.byAdPlatform.length}
          />
          <Kpis data={data.kpis} />
          {data.byAdPlatform.length > 0 ? (
            <PlatformBreakdown entries={data.byAdPlatform} />
          ) : null}
        </>
      ) : null}
    </EngineView>
  );
}

function WindowBanner({
  window: w,
  attributionWindowDays,
  byAdPlatformCount,
}: {
  window: { from: string; to: string };
  attributionWindowDays: number;
  byAdPlatformCount: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 pt-5 text-sm text-muted-foreground">
        <span>
          Window <span className="font-medium text-foreground">{w.from} → {w.to}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5">
          Attribution
          <Badge tone="info">{attributionWindowDays}d</Badge>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {byAdPlatformCount > 0
            ? `${byAdPlatformCount} ad platform${byAdPlatformCount === 1 ? '' : 's'}`
            : 'no platform breakdown'}
        </span>
      </CardContent>
    </Card>
  );
}

function Kpis({ data }: { data: AdvertisingKpisShape }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Spend" value={data.spend} format="money" />
      <Tile label="Attributed sales" value={data.attributedSales} format="money" />
      <Tile label="ACOS" value={data.acos} format="percent" hint="spend ÷ attributed sales" />
      <Tile label="TACOS" value={data.tacos} format="percent" hint="spend ÷ total revenue" />
      <Tile label="ROAS" value={data.roas} format="ratio" hint="× return on ad spend" />
      <Tile label="CVR" value={data.cvr} format="percent" hint="attributed orders ÷ clicks" />
      <Tile label="Impressions" value={data.impressions} format="int" />
      <Tile label="Clicks" value={data.clicks} format="int" />
      <Tile label="CTR" value={data.ctr} format="percent" hint="clicks ÷ impressions" />
      <Tile label="CPC" value={data.cpc} format="money" hint="spend ÷ clicks" />
      <Tile label="Orders" value={data.orders} format="int" hint="attributed" />
    </div>
  );
}

function PlatformBreakdown({
  entries,
}: {
  entries: ReadonlyArray<AdvertisingPlatformBreakdownEntry>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>By ad platform</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2 text-right">Impressions</th>
                <th className="px-3 py-2 text-right">Clicks</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Spend</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">ACOS</th>
                <th className="px-3 py-2 text-right">ROAS</th>
                <th className="px-3 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.adPlatformCode} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">{e.adPlatformCode}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.impressions.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.clicks.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.attributedOrders.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatValue(e.spend, 'money')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatValue(e.attributedSales, 'money')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatValue(e.acos, 'percent')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatValue(e.roas, 'ratio')}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatValue(e.spendShare, 'percent')}
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

function Tile({
  label,
  value,
  format,
  hint,
}: {
  label: string;
  value: string | number | null;
  format: 'money' | 'percent' | 'int' | 'ratio';
  hint?: string;
}) {
  const display = formatValue(value, format);
  return (
    <Card>
      <CardContent className="pt-6">
        <Metric label={label} value={display} hint={hint} />
      </CardContent>
    </Card>
  );
}

function formatValue(
  v: string | number | null,
  format: 'money' | 'percent' | 'int' | 'ratio',
): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  switch (format) {
    case 'money':
      return n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case 'percent':
      return `${(n * 100).toFixed(1)}%`;
    case 'ratio':
      return `${n.toFixed(2)}×`;
    case 'int':
      return n.toLocaleString();
  }
}
