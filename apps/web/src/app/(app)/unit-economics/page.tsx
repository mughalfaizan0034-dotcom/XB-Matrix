'use client';

import { Badge, Card, CardContent, PageHeader } from '@xb/ui';
import { LineChart, PieChart, Receipt, Scale } from 'lucide-react';

/**
 * Unit Economics, locked as Coming Soon.
 *
 * The platform ingests sales + ads today but no expense data
 * (COGS, landed cost, marketplace/fulfillment fees, marketing
 * allocations, overhead). Without those inputs, any per-unit
 * margin surface would be misleading or incomplete, so the engine
 * derivations stay hidden behind this Coming Soon shell until the
 * Expenses ingestion phase ships (see project_expenses_and_unit_economics
 * memory).
 *
 * The /v1/intelligence/unit-economics endpoint still exists and still
 * reports input readiness, but it's deliberately NOT surfaced here -
 * the page must communicate "not yet measurable" rather than "almost
 * there", so operators don't read the current data as financially
 * authoritative.
 *
 * No engine math. No partial derivations. No onboarding/tutorial
 * clutter per feedback_no_onboarding_clutter.
 */
export default function UnitEconomicsPage() {
  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <PageHeader
        title="Unit Economics"
        actions={<Badge tone="warning">Coming soon</Badge>}
      />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <h2 className="font-heading text-sm font-semibold text-foreground">
            Profitability ships with the Expenses ingestion phase.
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            True per-unit margin requires landed cost, marketplace fees,
            fulfillment costs, marketing allocations, and operational
            overhead, none of which are ingested yet. Surfacing partial
            calculations now would risk treating incomplete data as
            financially authoritative, so the module stays locked until
            those inputs land.
          </p>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          When unlocked, this module will surface
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PreviewTile
            icon={Scale}
            title="Contribution margin"
            body="Net contribution per unit after COGS, fees, fulfillment, and returns."
          />
          <PreviewTile
            icon={Receipt}
            title="Fully-loaded TACOS"
            body="Spend ÷ net revenue (after fees and returns), beyond the current top-line TACOS."
          />
          <PreviewTile
            icon={LineChart}
            title="Channel profitability"
            body="Per-marketplace and per-ad-platform margin contribution, blended and split."
          />
          <PreviewTile
            icon={PieChart}
            title="SKU profitability"
            body="Per-SKU gross + net margin, ranked, with portfolio share."
          />
          <PreviewTile
            icon={LineChart}
            title="Brand profitability"
            body="Brand-level margin rollups for portfolio-level reporting."
          />
          <PreviewTile
            icon={Receipt}
            title="Warehouse-adjusted margin"
            body="Storage and 3PL handling reflected in per-unit economics."
          />
        </div>
      </section>
    </div>
  );
}

function PreviewTile({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-navy/10 text-navy">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
