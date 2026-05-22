'use client';

import { Card, CardContent, Metric } from '@xb/ui';
import { useActiveWorkspace } from '@/lib/session';
import { useAdvertisingSummary } from '@/lib/api-intelligence';
import { EngineView } from '@/components/engine-view';

/**
 * Advertisements (PPC) — engine-output view of campaign performance.
 *
 * Every figure comes from /v1/intelligence/advertising, which is
 * computed server-side. The page is a renderer. The advertising
 * canonical table hasn't shipped yet, so readiness.ready=false is
 * the expected state today — the same UI flips to populated values
 * the moment the engine is wired to xb_canonical advertising rows.
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
          <li>Spend &amp; impressions per campaign</li>
          <li>Click-through and cost-per-click</li>
          <li>ACOS = spend ÷ attributed sales</li>
          <li>TACOS = spend ÷ total marketplace revenue</li>
          <li>ROAS = attributed sales ÷ spend</li>
        </ul>
      }
    >
      {data ? <AdvertisingKpis data={data.kpis} /> : null}
    </EngineView>
  );
}

function AdvertisingKpis({ data }: { data: NonNullable<ReturnType<typeof useAdvertisingSummary>['data']>['kpis'] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Spend" value={data.spend} format="money" />
      <Tile label="Attributed sales" value={data.attributedSales} format="money" />
      <Tile label="ACOS" value={data.acos} format="percent" />
      <Tile label="TACOS" value={data.tacos} format="percent" />
      <Tile label="ROAS" value={data.roas} format="ratio" hint="× return on ad spend" />
      <Tile label="Impressions" value={data.impressions} format="int" />
      <Tile label="Clicks" value={data.clicks} format="int" />
      <Tile label="CTR" value={data.ctr} format="percent" />
    </div>
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
