'use client';

import { useState } from 'react';
import { Download, FileText, Info, Layers } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@xb/ui';
import { downloadCsv } from '@xb/ui';

/**
 * Templates panel — grouped by operational category, not by marketplace.
 *
 * The user-facing entity is the business operation (Sales Performance,
 * Inventory Position, Advertising Performance, …). Marketplaces /
 * platforms are SOURCE FORMATS feeding each category. Same operational
 * data may flow in from Amazon, Walmart, Shopify, TikTok Shop, … —
 * the UI must reflect that downstream the platform aggregates ALL of
 * them into one centralized intelligence layer.
 *
 * Implementation today: per-platform validators are still distinct
 * upload kinds underneath (amazon_sales, walmart_sales, …) so the
 * existing parser pipeline keeps working. The UI groups them under
 * their operational category as "supported source formats". A future
 * canonical phase replaces them with one normalized kind per category;
 * the mapping layer already produces the marketplace-agnostic
 * Normalized* shape that consumes them, so engines/dashboards never
 * see the per-platform kinds.
 */

interface SourceFormat {
  readonly kind: string;             // current per-platform upload kind
  readonly platform: string;         // display label, e.g. "Amazon"
  readonly description: string;
  readonly filename: string;
  readonly headers: ReadonlyArray<string>;
  readonly sampleRows: ReadonlyArray<ReadonlyArray<string | number>>;
  readonly notes: ReadonlyArray<string>;
}

interface OperationalCategory {
  readonly id: string;
  readonly title: string;             // "Sales Performance"
  readonly summary: string;            // what business question this answers
  readonly canonicalEntity: string;    // e.g. "channel_sales"
  readonly dimensions: ReadonlyArray<string>; // marketplace / region / fulfillment / ad_platform / ...
  readonly formats: ReadonlyArray<SourceFormat>;
  readonly comingSoon?: boolean;
}

const CATEGORIES: ReadonlyArray<OperationalCategory> = [
  {
    id: 'sales',
    title: 'Sales Performance',
    summary:
      'Period-aggregated sales by SKU across every selling channel — sessions, orders, units, revenue, refunds. The same SKU may show up across Amazon US, Amazon CA, Walmart, Shopify, TikTok Shop in one upload.',
    canonicalEntity: 'channel_sales',
    dimensions: ['marketplace', 'region', 'period', 'sku', 'fulfillment'],
    formats: [
      {
        kind: 'amazon_sales',
        platform: 'Amazon',
        description:
          'Amazon Business Report shape. Sessions, orders, units, sales, refunds — each split total + B2B per (channel × SKU × period).',
        filename: 'amazon_sales_template.csv',
        headers: [
          'action', 'uid', 'start_date', 'end_date', 'channel', 'sku',
          'sessions_total', 'sessions_b2b', 'orders_total', 'orders_b2b',
          'units_total', 'units_b2b', 'sales_total', 'sales_b2b',
          'refunds_total', 'refunds_b2b',
        ],
        sampleRows: [
          ['upsert', '2026-05-01-amazon_us-WIDGET-A', '2026-05-01', '2026-05-07',
           'amazon_us', 'WIDGET-A',
           1250, 180, 52, 8, 72, 12, '899.50', '142.40', '12.00', '0.00'],
          ['upsert', '2026-05-01-amazon_us-WIDGET-B', '2026-05-01', '2026-05-07',
           'amazon_us', 'WIDGET-B',
           832, 45, 28, 3, 28, 3, '684.40', '73.50', '0.00', '0.00'],
        ],
        notes: [
          'action: upsert | delete',
          'uid: stable, caller-supplied (e.g. period-channel-sku)',
          'B2B columns must be ≤ their _total counterparts',
          'start_date ≤ end_date',
        ],
      },
      {
        kind: 'walmart_sales',
        platform: 'Walmart',
        description:
          'Walmart Item Performance shape. Walmart-native fields (item_id / gtin / page_views / gmv); the mapper translates to the same canonical sales shape Amazon produces.',
        filename: 'walmart_sales_template.csv',
        headers: [
          'action', 'uid', 'start_date', 'end_date', 'marketplace',
          'item_id', 'gtin', 'page_views', 'orders', 'units',
          'gmv', 'refunds', 'currency',
        ],
        sampleRows: [
          ['upsert', '2026-05-01-walmart_us-WMT-1001', '2026-05-01', '2026-05-07',
           'walmart_us', 'WMT-1001', '0012345678905',
           940, 38, 46, '612.40', '8.00', 'USD'],
          ['upsert', '2026-05-01-walmart_us-WMT-1002', '2026-05-01', '2026-05-07',
           'walmart_us', 'WMT-1002', '0012345678912',
           612, 21, 21, '478.20', '0.00', 'USD'],
        ],
        notes: [
          'item_id resolves to your platform_sku alias',
          'gtin (UPC/EAN) is an optional fallback — products already mapped on Amazon by UPC resolve here automatically',
          'orders ≤ page_views',
        ],
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory Position',
    summary:
      'Point-in-time inventory positions per SKU across every pool — FBA per country, FBM, 3PL, owned warehouses, retail. Each pool reports total + per-state partitions (available / reserved / inbound / transfer / damaged).',
    canonicalEntity: 'channel_inventory',
    dimensions: ['marketplace', 'region', 'fulfillment_type', 'inventory_location', 'inventory_state'],
    formats: [
      {
        kind: 'amazon_inventory',
        platform: 'Amazon (FBA)',
        description:
          'Amazon FBA inventory ledger shape — one row per (channel × SKU × date) with total + receiving / fc_transfer / reserved / damaged partitions.',
        filename: 'amazon_inventory_template.csv',
        headers: ['action', 'uid', 'date', 'channel', 'sku', 'total', 'receiving', 'fc_transfer', 'reserved', 'damaged'],
        sampleRows: [
          ['upsert', '2026-05-07-amazon_us-WIDGET-A', '2026-05-07', 'amazon_us', 'WIDGET-A', 420, 80, 15, 30, 2],
          ['upsert', '2026-05-07-amazon_us-WIDGET-B', '2026-05-07', 'amazon_us', 'WIDGET-B', 150, 20, 5, 8, 0],
        ],
        notes: [
          'receiving + fc_transfer + reserved + damaged ≤ total',
          'total = physical position; the rest are partitions of it',
          'Mapper splits each row into one canonical row per inventory_state',
        ],
      },
    ],
  },
  {
    id: 'advertising',
    title: 'Advertising Performance',
    summary:
      'Period-aggregated ad spend + attributed sales per campaign / SKU / ad platform. Amazon Ads, Walmart Connect, Meta Ads, Google Ads all aggregate into one blended TACOS once they flow in.',
    canonicalEntity: 'channel_ads',
    dimensions: ['ad_platform', 'target_marketplace', 'region', 'campaign', 'sku'],
    formats: [
      {
        kind: 'amazon_ads',
        platform: 'Amazon Ads',
        description:
          'Sponsored Products / Brands / Display reports. Impressions, clicks, cost, attributed orders + sales per (campaign × SKU × period).',
        filename: 'amazon_ads_template.csv',
        headers: [
          'action', 'uid', 'start_date', 'end_date', 'campaign_name', 'campaign_type',
          'sku_name', 'impressions', 'clicks', 'orders',
          'total_cost', 'sales', 'currency', 'platform', 'target_platform',
        ],
        sampleRows: [
          ['upsert', '2026-05-01-WIDGET-A-SP', '2026-05-01', '2026-05-07',
           'Widget A — SP', 'sponsored_products', 'WIDGET-A',
           18450, 420, 28, '142.50', '599.40', 'USD', 'amazon', 'amazon_us'],
          ['upsert', '2026-05-01-WIDGET-B-SP', '2026-05-01', '2026-05-07',
           'Widget B — SP', 'sponsored_products', 'WIDGET-B',
           9820, 180, 12, '68.90', '294.30', 'USD', 'amazon', 'amazon_us'],
        ],
        notes: [
          'clicks ≤ impressions',
          'target_platform: marketplace the spend drove into (amazon_us, amazon_uk, …)',
          'Aggregate campaign rows (no single SKU) may use ALL / * for sku_name',
        ],
      },
    ],
  },
  {
    id: 'warehouse_inventory',
    title: 'Warehouse Inventory',
    summary:
      'Non-FBA inventory pools — owned warehouses, 3PLs, retail. Feeds the same canonical inventory layer as marketplace inventory; the dimension distinguishes them (fulfillment_type, inventory_location_code).',
    canonicalEntity: 'channel_inventory',
    dimensions: ['inventory_location', 'fulfillment_type', 'inventory_state', 'ownership'],
    formats: [],
    comingSoon: true,
  },
  {
    id: 'settlement',
    title: 'Settlement',
    summary:
      'Marketplace financial settlements — fees, deductions, payouts. Drives the profitability engine alongside sales + ad spend + COGS.',
    canonicalEntity: 'channel_settlement',
    dimensions: ['marketplace', 'account', 'settlement_period', 'fee_type'],
    formats: [],
    comingSoon: true,
  },
  {
    id: 'forecast_input',
    title: 'Forecast Input',
    summary:
      'Operator-supplied forecast adjustments, promotion calendars, seasonality overrides. Feeds the forecasting engine alongside historical sales velocity.',
    canonicalEntity: 'forecast_inputs',
    dimensions: ['sku', 'period', 'adjustment_type'],
    formats: [],
    comingSoon: true,
  },
];

export function UploadTemplatesPanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <p>
          The product entity is the <span className="font-medium text-foreground">operational dataset</span> —
          Sales Performance, Inventory Position, Advertising Performance, and so on. Each one accepts
          many ingestion paths underneath (Amazon, Walmart, Shopify, future API connectors, normalized
          ERP/BI exports). Every path lands in the same centralized intelligence layer, so engines,
          dashboards, and reports never see "Amazon vs Walmart" — they see one blended view of your
          business with marketplace as a filter dimension.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {CATEGORIES.map((c) => (
          <CategoryCard key={c.id} category={c} />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: OperationalCategory }) {
  // Detail panel is collapsed by default — the operational dataset
  // header is the primary content; the per-connector template is
  // supplementary, expand-to-see.
  const [openFormat, setOpenFormat] = useState<string | null>(null);

  return (
    <Card>
      {/* ─── Primary: operational dataset identity ────────────────
          Larger heading, summary, canonical entity, dimensions. This
          is what the operator should anchor their mental model on —
          the connector strip below is a supporting affordance. */}
      <CardHeader className="flex flex-col gap-2 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy/10 text-navy">
              <Layers className="h-4 w-4" />
            </span>
            <div className="flex flex-col">
              <CardTitle className="text-base">{category.title}</CardTitle>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Operational dataset
              </span>
            </div>
          </div>
          {category.comingSoon ? (
            <Badge tone="neutral">coming soon</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{category.summary}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide">Canonical</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
              {category.canonicalEntity}
            </code>
          </span>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide">Dimensions</span>
            {category.dimensions.map((d) => (
              <code key={d} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {d}
              </code>
            ))}
          </span>
        </div>
      </CardHeader>

      {/* ─── Secondary: compatible ingestion formats ───────────────
          Visually demoted — separator, small label, slim chip row,
          collapsed detail. Frames every connector as one of many
          ingestion paths into the same dataset, not the entity. */}
      <CardContent className="pt-0">
        <div className="border-t border-border pt-3">
          {category.formats.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide">
                Compatible ingestion formats
              </div>
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4">
                Ingestion paths land here as connectors ship — manual templates first,
                then direct API connectors, normalized ERP/BI exports, and webhook syncs.
                The operational dataset is already designed around its dimensions, so
                engines and dashboards will pick it up the moment data starts flowing.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Compatible ingestion formats
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {category.formats.length} available · more connectors planned
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {category.formats.map((f) => {
                  const isOpen = openFormat === f.kind;
                  return (
                    <button
                      key={f.kind}
                      type="button"
                      onClick={() => setOpenFormat(isOpen ? null : f.kind)}
                      className={
                        isOpen
                          ? 'rounded-md border border-navy bg-navy/5 px-2 py-1 text-[11px] font-medium text-navy'
                          : 'rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground'
                      }
                    >
                      {f.platform}
                    </button>
                  );
                })}
              </div>

              {openFormat ? (
                <SourceFormatDetail
                  format={category.formats.find((f) => f.kind === openFormat)!}
                />
              ) : (
                <div className="text-[11px] text-muted-foreground">
                  Pick a format above to see its columns, sample rows, and download its CSV template.
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SourceFormatDetail({ format }: { format: SourceFormat }) {
  function onDownload() {
    const lines: string[] = [format.headers.join(',')];
    for (const row of format.sampleRows) {
      lines.push(row.map(serializeCell).join(','));
    }
    downloadCsv(lines.join('\r\n') + '\r\n', format.filename);
  }

  // Supplementary drawer — visually framed as "details about an
  // ingestion path", never as a primary entity.
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">
              <span className="text-[10px] font-semibold uppercase tracking-wide">Ingestion path</span>
              <span className="ml-1.5 text-foreground">{format.platform}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{format.description}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download className="mr-1 h-3.5 w-3.5" />
          Download CSV
        </Button>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Columns ({format.headers.length})
        </summary>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {format.headers.map((h) => (
            <code
              key={h}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
            >
              {h}
            </code>
          ))}
        </div>
      </details>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Validation notes
        </summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-foreground">
          {format.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function serializeCell(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
