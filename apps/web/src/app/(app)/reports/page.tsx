'use client';

import Link from 'next/link';
import { ArrowRight, FileBarChart2 } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@xb/ui';
import { useActiveWorkspace } from '@/lib/session';
import { useReportRegistry } from '@/lib/api-intelligence';
import { EngineView } from '@/components/engine-view';

/**
 * Reports — engine-published output catalog.
 *
 * The engine emits a fixed registry of operational reports keyed to
 * the workspace's available data. Each entry carries an `available`
 * flag the engine computes from canonical-row counts, so the same UI
 * surfaces freshly-shippable reports automatically as connectors and
 * templates land. The page does not derive availability itself.
 */
export default function ReportsPage() {
  const { data: ws } = useActiveWorkspace();
  const q = useReportRegistry(ws?.id ?? null);

  return (
    <EngineView title="Reports" subtitle="Generated reports — engine outputs only." loading={q.isLoading || (!!ws && !q.data)}>
      {q.data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CountBadge label="Sales rows" value={q.data.counts.salesRows} />
            <CountBadge label="Inventory rows" value={q.data.counts.inventoryRows} />
            <CountBadge label="Ads rows" value={q.data.counts.adsRows} />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {q.data.reports.map((r) => (
              <Card key={r.key}>
                <CardContent className="flex flex-col gap-3 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FileBarChart2 className="h-4 w-4 text-navy" />
                      <h3 className="font-heading text-sm font-semibold text-foreground">
                        {r.title}
                      </h3>
                    </div>
                    <Badge tone={r.available ? 'success' : 'neutral'}>
                      {r.available ? 'Available' : 'Coming soon'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{r.description}</p>
                  <div>
                    {r.available ? (
                      <Link href={r.href}>
                        <Button size="sm" variant="outline">
                          Open report <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Ships when the engine has data to compute.
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            All figures inside each report are computed by the central intelligence engine on
            canonical tables. The frontend never recalculates a KPI — it renders engine output.
          </p>
        </div>
      ) : null}
    </EngineView>
  );
}

function CountBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
