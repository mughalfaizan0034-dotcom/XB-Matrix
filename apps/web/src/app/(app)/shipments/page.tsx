'use client';

import { Card, CardContent, Metric } from '@xb/ui';
import { useActiveWorkspace } from '@/lib/session';
import { useShipmentsReadiness } from '@/lib/api-intelligence';
import { EngineView } from '@/components/engine-view';

/**
 * Shipments, replenishment engine view.
 *
 * The replenishment engine consumes inventory + sales-velocity (the
 * shared cross-engine signals already computed for the dashboard) plus
 * supplier lead times and a shipments template that ship in a later
 * slice. Today the engine emits a readiness/preview block: counts of
 * at-risk and dead-stock SKUs, plus the workspace's DOS target -
 * exactly the inputs the engine will operate on.
 */
export default function ShipmentsPage() {
  const { data: ws } = useActiveWorkspace();
  const q = useShipmentsReadiness(ws?.id ?? null);
  const data = q.data;

  return (
    <EngineView
      title="Shipments"
      subtitle="Replenishment proposals, coming soon."
      loading={q.isLoading || (!!ws && !data)}
      readiness={data?.readiness}
      emptyStateBody={
        data ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <Metric label="SKUs at risk" value={data.preview.skusAtRisk.toLocaleString()} hint={`vs ${data.preview.dosTargetDays}-day target`} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Metric label="Dead-stock SKUs" value={data.preview.skusDeadStock.toLocaleString()} hint="on-hand, zero velocity" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <Metric label="DOS target" value={`${data.preview.dosTargetDays} d`} hint="workspace setting" />
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
