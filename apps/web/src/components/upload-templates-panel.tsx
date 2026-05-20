'use client';

import { useState } from 'react';
import { ChevronRight, Download, Info, Layers } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@xb/ui';
import { downloadCsv } from '@xb/ui';

/**
 * Templates panel — operational-dataset-first.
 *
 * Each card represents one OPERATIONAL DATASET (Sales Performance,
 * Inventory Position, Advertising Performance, …). The card's
 * visual weight goes to:
 *
 *   1. The dataset identity (title, summary, canonical entity, dimensions)
 *   2. Required attributes (what every row must carry)
 *   3. Validation rules (what every row must satisfy)
 *   4. Compatible ingestion connectors (small supporting line — names only)
 *   5. Per-connector template downloads (collapsed by default)
 *
 * Marketplaces / connectors are NOT separate entities. They are
 * ingestion paths into the same dataset. See CLAUDE.md
 * "uploads are operational categories" + "UI hierarchy: operational
 * first" memories.
 */

interface SourceFormat {
  readonly kind: string;             // current per-platform upload kind
  readonly platform: string;         // display label, e.g. "Amazon"
  readonly description: string;
  readonly filename: string;
  readonly headers: ReadonlyArray<string>;
  readonly sampleRows: ReadonlyArray<ReadonlyArray<string | number>>;
}

interface OperationalCategory {
  readonly id: string;
  readonly title: string;              // "Sales Performance"
  readonly summary: string;
  readonly canonicalEntity: string;    // e.g. "channel_sales"
  readonly dimensions: ReadonlyArray<string>;
  readonly requiredAttributes: ReadonlyArray<string>;
  readonly validationRules: ReadonlyArray<string>;
  /** Ingestion paths feeding this dataset. */
  readonly formats: ReadonlyArray<SourceFormat>;
  /** Future ingestion modes the operator can expect (API connectors, …). */
  readonly futureIngestion: ReadonlyArray<string>;
  readonly comingSoon?: boolean;
}

const CATEGORIES: ReadonlyArray<OperationalCategory> = [
  {
    id: 'sales',
    title: 'Sales Performance',
    summary:
      'Period-aggregated sales by SKU across every selling channel — sessions, orders, units, revenue, refunds. One file can mix Amazon US, Amazon CA, Walmart, Shopify, TikTok Shop rows; the marketplace lives as a column.',
    canonicalEntity: 'channel_sales',
    dimensions: ['marketplace', 'region', 'period', 'sku', 'fulfillment'],
    requiredAttributes: [
      'normalized SKU identifier',
      'marketplace / channel code',
      'period (start_date, end_date)',
      'units, orders, revenue',
      'currency (ISO 4217)',
    ],
    validationRules: [
      'action ∈ add / update / remove (lifecycle-aware, replay-safe)',
      'start_date ≤ end_date',
      'all metric columns ≥ 0',
      'B2B split columns ≤ their _total counterparts',
      'currency is a 3-letter ISO code',
    ],
    formats: [
      {
        kind: 'sales_performance',
        platform: 'Omnichannel (recommended)',
        description:
          'One normalized template covering every sales channel. Mix Amazon, Walmart, Shopify, TikTok Shop, eBay, Etsy rows in a single upload — the marketplace column distinguishes them, and downstream engines see one blended sales fact per SKU.',
        filename: 'sales_performance_template.csv',
        headers: [
          'action', 'uid', 'start_date', 'end_date', 'channel', 'marketplace', 'sku',
          'sessions_total', 'sessions_b2b', 'orders_total', 'orders_b2b',
          'units_total', 'units_b2b', 'sales_total', 'sales_b2b',
          'refunds_total', 'refunds_b2b',
        ],
        sampleRows: [
          ['add', '2026-05-01-amazon.com-WIDGET-A', '2026-05-01', '2026-05-07',
           'fba', 'amazon.com', 'WIDGET-A',
           1250, 180, 52, 8, 72, 12, '899.50', '142.40', '12.00', '0.00'],
          ['add', '2026-05-01-amazon.ca-WIDGET-A', '2026-05-01', '2026-05-07',
           'fba', 'amazon.ca', 'WIDGET-A',
           320, 0, 14, 0, 20, 0, '241.80', '0.00', '0.00', '0.00'],
          ['add', '2026-05-01-walmart.com-WIDGET-A', '2026-05-01', '2026-05-07',
           'fbm', 'walmart.com', 'WIDGET-A',
           640, 0, 22, 0, 24, 0, '312.40', '0.00', '0.00', '0.00'],
          ['add', '2026-05-01-shopify-WIDGET-A', '2026-05-01', '2026-05-07',
           'dtc', 'shopify', 'WIDGET-A',
           890, 0, 41, 0, 51, 0, '688.00', '0.00', '12.00', '0.00'],
          ['add', '2026-05-01-tiktokshop-WIDGET-A', '2026-05-01', '2026-05-07',
           'dtc', 'tiktokshop', 'WIDGET-A',
           412, 0, 18, 0, 22, 0, '275.50', '0.00', '0.00', '0.00'],
        ],
      },
      {
        kind: 'amazon_sales',
        platform: 'Amazon adapter',
        description:
          'Optional convenience adapter for the Amazon Business Report native shape (no marketplace column; channel field used instead). Mapper translates rows into the same canonical sales shape the omnichannel template produces.',
        filename: 'amazon_sales_template.csv',
        headers: [
          'action', 'uid', 'start_date', 'end_date', 'channel', 'sku',
          'sessions_total', 'sessions_b2b', 'orders_total', 'orders_b2b',
          'units_total', 'units_b2b', 'sales_total', 'sales_b2b',
          'refunds_total', 'refunds_b2b',
        ],
        sampleRows: [
          ['add', '2026-05-01-amazon_us-WIDGET-A', '2026-05-01', '2026-05-07',
           'amazon_us', 'WIDGET-A',
           1250, 180, 52, 8, 72, 12, '899.50', '142.40', '12.00', '0.00'],
        ],
      },
      {
        kind: 'walmart_sales',
        platform: 'Walmart adapter',
        description:
          'Optional convenience adapter for Walmart Item Performance shape (item_id / gtin / page_views / gmv). Mapper translates to the same canonical sales shape.',
        filename: 'walmart_sales_template.csv',
        headers: [
          'action', 'uid', 'start_date', 'end_date', 'marketplace',
          'item_id', 'gtin', 'page_views', 'orders', 'units',
          'gmv', 'refunds', 'currency',
        ],
        sampleRows: [
          ['add', '2026-05-01-walmart_us-WMT-1001', '2026-05-01', '2026-05-07',
           'walmart_us', 'WMT-1001', '0012345678905',
           940, 38, 46, '612.40', '8.00', 'USD'],
        ],
      },
    ],
    futureIngestion: [
      'Shopify, TikTok Shop, eBay, Etsy templates',
      'Direct API connectors (Amazon SP-API, Walmart API, Shopify, TikTok)',
      'Normalized ERP / BI exports (already in canonical shape)',
      'Scheduled syncs + webhook ingestion',
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory Position',
    summary:
      'Point-in-time inventory positions per SKU across every pool — FBA per country, FBM, 3PL, owned warehouses, retail. Each pool reports total + per-state partitions (available / reserved / inbound / transfer / damaged).',
    canonicalEntity: 'channel_inventory',
    dimensions: ['marketplace', 'region', 'fulfillment_type', 'inventory_location', 'inventory_state'],
    requiredAttributes: [
      'normalized SKU identifier',
      'inventory location code (FBA-US, WH-NJ, 3PL-LAX-01, …)',
      'snapshot date',
      'per-state quantities (available, reserved, inbound, transfer, damaged)',
    ],
    validationRules: [
      'action ∈ add / update / remove',
      'all quantities ≥ 0',
      'sum of partition states ≤ total physical position',
      'snapshot date is a valid calendar date',
    ],
    formats: [
      {
        kind: 'inventory_position',
        platform: 'Omnichannel (recommended)',
        description:
          'One normalized template covering every inventory pool. Mix Amazon FBA per country, Walmart FBM, owned warehouses, 3PL pools, retail stock in a single upload — the marketplace column distinguishes the pool, and downstream engines see one blended inventory position per SKU.',
        filename: 'inventory_position_template.csv',
        headers: ['action', 'uid', 'date', 'channel', 'marketplace', 'sku', 'total', 'receiving', 'fc_transfer', 'reserved', 'damaged'],
        sampleRows: [
          ['add', '2026-05-07-amazon.com-WIDGET-A', '2026-05-07', 'fba', 'amazon.com', 'WIDGET-A', 420, 80, 15, 30, 2],
          ['add', '2026-05-07-amazon.ca-WIDGET-A', '2026-05-07', 'fba', 'amazon.ca', 'WIDGET-A', 180, 40, 0, 10, 0],
          ['add', '2026-05-07-walmart.com-WIDGET-A', '2026-05-07', 'fbm', 'walmart.com', 'WIDGET-A', 95, 25, 0, 4, 0],
          ['add', '2026-05-07-warehouse-WIDGET-A', '2026-05-07', 'owned', 'warehouse', 'WIDGET-A', 1200, 0, 0, 0, 6],
          ['add', '2026-05-07-3pl-WIDGET-A', '2026-05-07', '3pl', '3pl', 'WIDGET-A', 240, 0, 0, 0, 0],
        ],
      },
      {
        kind: 'amazon_inventory',
        platform: 'Amazon FBA adapter',
        description:
          'Optional adapter for Amazon FBA inventory ledger native shape (no marketplace column; channel field used instead). Mapper translates to the same canonical inventory shape.',
        filename: 'amazon_inventory_template.csv',
        headers: ['action', 'uid', 'date', 'channel', 'sku', 'total', 'receiving', 'fc_transfer', 'reserved', 'damaged'],
        sampleRows: [
          ['add', '2026-05-07-amazon_us-WIDGET-A', '2026-05-07', 'amazon_us', 'WIDGET-A', 420, 80, 15, 30, 2],
        ],
      },
    ],
    futureIngestion: [
      'Walmart / Shopify FBM templates',
      '3PL connectors (ShipBob, ShipMonk, Deliverr, …)',
      'Owned-warehouse WMS feeds',
      'Direct API: Amazon SP-API inventory ledger, Shopify Inventory Levels',
    ],
  },
  {
    id: 'advertising',
    title: 'Advertising Performance',
    summary:
      'Period-aggregated ad spend + attributed sales per campaign / SKU / ad platform. Amazon Ads, Walmart Connect, Meta Ads, Google Ads all aggregate into one blended TACOS once they flow in.',
    canonicalEntity: 'channel_ads',
    dimensions: ['ad_platform', 'target_marketplace', 'region', 'campaign', 'sku'],
    requiredAttributes: [
      'campaign name + type',
      'ad platform code (amazon_ads, meta_ads, google_ads, …)',
      'target marketplace (where the spend drove into)',
      'period (start_date, end_date)',
      'impressions, clicks, cost, attributed sales',
      'currency',
    ],
    validationRules: [
      'action ∈ add / update / remove',
      'clicks ≤ impressions',
      'cost ≥ 0, attributed_sales ≥ 0',
      'start_date ≤ end_date',
      'aggregate campaign rows may carry sku=ALL when no single SKU applies',
    ],
    formats: [
      {
        kind: 'advertising_performance',
        platform: 'Omnichannel (recommended)',
        description:
          'One normalized template covering every ad platform. Mix Amazon Ads, Walmart Connect, Meta Ads, Google Ads, TikTok Ads campaigns in a single upload. The platform column identifies the ad source; target_marketplace identifies where the spend drove demand — both matter for blended TACOS.',
        filename: 'advertising_performance_template.csv',
        headers: [
          'action', 'uid', 'start_date', 'end_date', 'campaign_name', 'campaign_type',
          'platform', 'target_marketplace', 'sku_name',
          'impressions', 'clicks', 'orders', 'total_cost', 'sales', 'currency',
        ],
        sampleRows: [
          ['add', '2026-05-01-amazonads-WIDGET-A', '2026-05-01', '2026-05-07',
           'Widget A — SP', 'sponsored_products', 'amazonads.com', 'amazon.com', 'WIDGET-A',
           18450, 420, 28, '142.50', '599.40', 'USD'],
          ['add', '2026-05-01-walmartconnect-WIDGET-A', '2026-05-01', '2026-05-07',
           'Widget A — WMT', 'sponsored_search', 'walmartconnect.com', 'walmart.com', 'WIDGET-A',
           6240, 130, 9, '78.40', '198.00', 'USD'],
          ['add', '2026-05-01-meta-WIDGET-A', '2026-05-01', '2026-05-07',
           'Widget A — Prospecting', 'social', 'meta.com', 'shopify', 'WIDGET-A',
           42100, 380, 14, '210.00', '420.00', 'USD'],
          ['add', '2026-05-01-google-WIDGET-A', '2026-05-01', '2026-05-07',
           'Widget A — Brand', 'search', 'googleads.com', 'shopify', 'WIDGET-A',
           5400, 95, 11, '64.00', '275.00', 'USD'],
          ['add', '2026-05-01-tiktok-WIDGET-A', '2026-05-01', '2026-05-07',
           'Widget A — Discovery', 'social', 'tiktokads.com', 'tiktokshop', 'WIDGET-A',
           28000, 280, 7, '95.00', '180.00', 'USD'],
        ],
      },
      {
        kind: 'amazon_ads',
        platform: 'Amazon Ads adapter',
        description:
          'Optional adapter for Amazon Ads native shape (uses platform/target_platform field names instead of target_marketplace). Mapper translates to the same canonical ads shape.',
        filename: 'amazon_ads_template.csv',
        headers: [
          'action', 'uid', 'start_date', 'end_date', 'campaign_name', 'campaign_type',
          'sku_name', 'impressions', 'clicks', 'orders',
          'total_cost', 'sales', 'currency', 'platform', 'target_platform',
        ],
        sampleRows: [
          ['add', '2026-05-01-WIDGET-A-SP', '2026-05-01', '2026-05-07',
           'Widget A — SP', 'sponsored_products', 'WIDGET-A',
           18450, 420, 28, '142.50', '599.40', 'USD', 'amazon', 'amazon_us'],
        ],
      },
    ],
    futureIngestion: [
      'Walmart Connect, Meta Ads, Google Ads, TikTok Ads templates',
      'Direct API connectors (Amazon Ads API, Meta Marketing API, Google Ads API)',
      'Klaviyo / email-marketing attribution feeds',
    ],
  },
  {
    id: 'warehouse_inventory',
    title: 'Warehouse Inventory',
    summary:
      'Non-FBA inventory pools — owned warehouses, 3PLs, retail. Feeds the same canonical inventory layer as marketplace inventory; the dimension distinguishes them (fulfillment_type, inventory_location_code).',
    canonicalEntity: 'channel_inventory',
    dimensions: ['inventory_location', 'fulfillment_type', 'inventory_state', 'ownership'],
    requiredAttributes: [
      'normalized SKU identifier',
      'warehouse / location code',
      'fulfillment type (owned_warehouse / 3pl / retail / dropship)',
      'snapshot date',
      'per-state quantities',
      'ownership (owned / consigned / partner)',
    ],
    validationRules: [
      'action ∈ add / update / remove',
      'all quantities ≥ 0',
      'warehouse code matches a registered warehouse in xb_master.warehouses',
    ],
    formats: [],
    futureIngestion: [
      'CSV templates per WMS vendor',
      'Direct integrations with common 3PLs and WMS systems',
      'ERP inventory sync (NetSuite, SAP, Brightpearl, …)',
    ],
    comingSoon: true,
  },
  {
    id: 'settlement',
    title: 'Settlement Data',
    summary:
      'Marketplace financial settlements — fees, deductions, payouts. Drives the profitability engine alongside sales + ad spend + COGS.',
    canonicalEntity: 'channel_settlement',
    dimensions: ['marketplace', 'account', 'settlement_period', 'fee_type'],
    requiredAttributes: [
      'marketplace / account',
      'settlement period',
      'per-fee-type amounts',
      'net payout',
      'currency',
    ],
    validationRules: [
      'action ∈ add / update / remove',
      'fee subtotals reconcile to gross - deductions = net',
      'currency is a 3-letter ISO code',
    ],
    formats: [],
    futureIngestion: [
      'Amazon Settlement Report CSV',
      'Walmart Settlement extract',
      'Direct API: SP-API Finances, Walmart Settlement endpoint',
    ],
    comingSoon: true,
  },
  {
    id: 'forecast_input',
    title: 'Forecast Inputs',
    summary:
      'Operator-supplied forecast adjustments, promotion calendars, seasonality overrides. Feeds the forecasting engine alongside historical sales velocity.',
    canonicalEntity: 'forecast_inputs',
    dimensions: ['sku', 'period', 'adjustment_type'],
    requiredAttributes: [
      'normalized SKU identifier (or "ALL" for global adjustments)',
      'period (start_date, end_date)',
      'adjustment type (promotion / seasonality / event / manual_override)',
      'adjustment magnitude (multiplier or absolute units)',
    ],
    validationRules: [
      'action ∈ add / update / remove',
      'adjustment magnitudes must be non-negative when expressed as multipliers',
      'period bounds must not overlap with another adjustment of the same type for the same SKU',
    ],
    formats: [],
    futureIngestion: [
      'CSV templates for each adjustment type',
      'Promotion calendar import from marketing tools',
      'Direct integration with merchandising planning systems',
    ],
  },
];

export function UploadTemplatesPanel() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <p>
          The product entity is the <span className="font-medium text-foreground">operational dataset</span> —
          Sales Performance, Inventory Position, Advertising Performance, and so on. Every dataset
          accepts many ingestion paths underneath (manual CSV per platform, future API connectors,
          normalized ERP/BI exports). All paths land in the same centralized intelligence layer, so
          engines + dashboards never see "Amazon vs Walmart" — they see one blended view with
          marketplace as a filter dimension.
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
  return (
    <Card>
      {/* ─── Primary: operational dataset identity ──────────────── */}
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
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-0">
        {/* Canonical entity + dimensions */}
        <Section label="Canonical entity">
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
            {category.canonicalEntity}
          </code>
        </Section>

        <Section label="Dimensions">
          <ChipList items={category.dimensions} />
        </Section>

        <Section label="Required attributes">
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm text-foreground">
            {category.requiredAttributes.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Section>

        <Section label="Validation rules">
          <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm text-foreground">
            {category.validationRules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>

        {/* ─── Secondary: compatible ingestion connectors ────────
            Single supporting line listing connectors as names, with
            an expandable "Download templates" subsection underneath.
            No competing tabs — the dataset is the entity. */}
        <Section
          label="Compatible ingestion connectors"
          hint={
            category.formats.length === 0
              ? 'Ingestion paths land here as connectors ship.'
              : `${category.formats.length} available today · more planned`
          }
        >
          {category.formats.length === 0 ? null : (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-foreground">
              {category.formats.map((f, i) => (
                <span key={f.kind}>
                  {f.platform}
                  {i < category.formats.length - 1 ? <span className="text-muted-foreground"> · </span> : null}
                </span>
              ))}
            </div>
          )}

          {category.futureIngestion.length > 0 ? (
            <div className="mt-1.5 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Planned:</span>{' '}
              {category.futureIngestion.join(' · ')}
            </div>
          ) : null}
        </Section>

        {/* Downloadable templates — collapsed by default */}
        {category.formats.length > 0 ? <TemplateDownloads formats={category.formats} /> : null}
      </CardContent>
    </Card>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function ChipList({ items }: { items: ReadonlyArray<string> }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((d) => (
        <code key={d} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">
          {d}
        </code>
      ))}
    </div>
  );
}

function TemplateDownloads({ formats }: { formats: ReadonlyArray<SourceFormat> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/30 hover:text-foreground"
      >
        <span className="font-medium">
          Downloadable templates{' '}
          <span className="text-muted-foreground">({formats.length})</span>
        </span>
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? (
        <ul className="divide-y divide-border border-t border-border">
          {formats.map((f) => (
            <TemplateRow key={f.kind} format={f} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TemplateRow({ format }: { format: SourceFormat }) {
  function onDownload() {
    const lines: string[] = [format.headers.join(',')];
    for (const row of format.sampleRows) {
      lines.push(row.map(serializeCell).join(','));
    }
    downloadCsv(lines.join('\r\n') + '\r\n', format.filename);
  }
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 text-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-foreground">
            <span className="font-medium">{format.platform}</span>{' '}
            <span className="text-muted-foreground">— {format.description}</span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download className="mr-1 h-3.5 w-3.5" />
          CSV
        </Button>
      </div>
      <details className="text-[11px]">
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
    </li>
  );
}

function serializeCell(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
