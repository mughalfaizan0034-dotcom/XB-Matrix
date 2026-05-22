'use client';

import { Card, CardContent, Metric } from '@xb/ui';
import { useActiveWorkspace } from '@/lib/session';
import { useUnitEconomicsSummary } from '@/lib/api-intelligence';
import { EngineView } from '@/components/engine-view';

/**
 * Unit Economics — engine view of per-SKU margin readiness.
 *
 * The full unit economics engine needs landed cost, marketplace fees,
 * and returns — none of which are templated yet. Until those land the
 * engine emits an honest "inputs available" snapshot: the share of
 * SKUs that already carry unit cost and a recent selling price. The
 * frontend never derives a per-unit margin; that ships when the
 * engine ships.
 */
export default function UnitEconomicsPage() {
  const { data: ws } = useActiveWorkspace();
  const q = useUnitEconomicsSummary(ws?.id ?? null);
  const data = q.data;

  return (
    <EngineView
      title="Unit Economics"
      subtitle="Per-unit contribution & landed cost — engine-computed."
      loading={q.isLoading || (!!ws && !data)}
      readiness={data?.readiness}
      emptyStateBody={
        data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <Metric label="Total SKUs" value={data.inputs.totalSkus.toLocaleString()} hint="in this workspace" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Metric label="With unit cost" value={data.inputs.skusWithUnitCost.toLocaleString()} hint="needed for COGS" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Metric label="With selling price" value={data.inputs.skusWithSellingPrice.toLocaleString()} hint="from recent orders" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Metric
                  label="Engine readiness"
                  value={`${(Number(data.inputs.readinessShare) * 100).toFixed(0)}%`}
                  hint="SKUs with both inputs"
                />
              </CardContent>
            </Card>
          </div>
        ) : null
      }
    >
      {null}
    </EngineView>
  );
}
