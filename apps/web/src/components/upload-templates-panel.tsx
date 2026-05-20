'use client';

import { Download, FileText, Layers } from 'lucide-react';
import { Badge, Button, Card, CardContent, downloadCsv } from '@xb/ui';
import { generateUploadGuidePdf, type GuideDataset } from '@/lib/upload-guide-pdf';

/**
 * Templates panel — download-only.
 *
 * One normalized template per operational dataset. Every marketplace's
 * rows go in the same file; the marketplace column drives the engine's
 * math. No per-marketplace templates.
 *
 * The panel itself is intentionally minimal — just download buttons.
 * All guidance (columns, validation rules, how the engine reads the
 * file) lives in the branded "Download guide" PDF.
 */

interface Dataset {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly filename: string;
  readonly headers: ReadonlyArray<string>;
  readonly sampleRows: ReadonlyArray<ReadonlyArray<string | number>>;
  readonly validationRules: ReadonlyArray<string>;
  readonly comingSoon?: boolean;
}

const DATASETS: ReadonlyArray<Dataset> = [
  {
    id: 'sales_performance',
    title: 'Sales Report',
    description:
      'Period sales by SKU across every channel — sessions, orders, units, revenue, refunds. Put Amazon, Walmart, Shopify, TikTok Shop, eBay, Etsy rows in one file; the marketplace column distinguishes them.',
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
      ['add', '2026-05-01-walmart.com-WIDGET-A', '2026-05-01', '2026-05-07',
       'fbm', 'walmart.com', 'WIDGET-A',
       640, 0, 22, 0, 24, 0, '312.40', '0.00', '0.00', '0.00'],
      ['add', '2026-05-01-shopify-WIDGET-A', '2026-05-01', '2026-05-07',
       'dtc', 'shopify', 'WIDGET-A',
       890, 0, 41, 0, 51, 0, '688.00', '0.00', '12.00', '0.00'],
    ],
    validationRules: [
      'action is one of add / update / remove.',
      'uid is a stable unique key per row (e.g. period-marketplace-sku).',
      'start_date is on or before end_date.',
      'All metric columns are zero or greater.',
      'Each b2b column is less than or equal to its _total counterpart.',
      'marketplace examples: amazon.com, amazon.ca, walmart.com, shopify, tiktokshop, ebay.com, etsy.com.',
    ],
  },
  {
    id: 'inventory_position',
    title: 'Inventory Report',
    description:
      'Point-in-time inventory per SKU across every pool — FBA per country, FBM, owned warehouses, 3PL, retail. One file; the marketplace column distinguishes each pool.',
    filename: 'inventory_position_template.csv',
    headers: ['action', 'uid', 'date', 'channel', 'marketplace', 'sku', 'total', 'receiving', 'fc_transfer', 'reserved', 'damaged'],
    sampleRows: [
      ['add', '2026-05-07-amazon.com-WIDGET-A', '2026-05-07', 'fba', 'amazon.com', 'WIDGET-A', 420, 80, 15, 30, 2],
      ['add', '2026-05-07-walmart.com-WIDGET-A', '2026-05-07', 'fbm', 'walmart.com', 'WIDGET-A', 95, 25, 0, 4, 0],
      ['add', '2026-05-07-warehouse-WIDGET-A', '2026-05-07', 'owned', 'warehouse', 'WIDGET-A', 1200, 0, 0, 0, 6],
    ],
    validationRules: [
      'action is one of add / update / remove.',
      'date is a valid calendar date (the snapshot date).',
      'All quantities are zero or greater.',
      'receiving + fc_transfer + reserved + damaged does not exceed total.',
      'marketplace examples: amazon.com, amazon.ca, walmart.com, warehouse, 3pl, retail.',
    ],
  },
  {
    id: 'advertising_performance',
    title: 'Ads Report',
    description:
      'Period ad spend + attributed sales per campaign / SKU. One file across every ad platform — the platform column is the ad source, target_marketplace is where the spend drove demand.',
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
      ['add', '2026-05-01-meta-WIDGET-A', '2026-05-01', '2026-05-07',
       'Widget A — Prospecting', 'social', 'meta.com', 'shopify', 'WIDGET-A',
       42100, 380, 14, '210.00', '420.00', 'USD'],
    ],
    validationRules: [
      'action is one of add / update / remove.',
      'clicks does not exceed impressions.',
      'total_cost and sales are zero or greater.',
      'start_date is on or before end_date.',
      'currency is a 3-letter ISO code.',
      'platform examples: amazonads.com, walmartconnect.com, meta.com, googleads.com, tiktokads.com.',
    ],
  },
  {
    id: 'warehouse_inventory',
    title: 'Warehouse Inventory',
    description:
      'Dedicated non-marketplace warehouse stock feed. Lands in the same inventory intelligence layer.',
    filename: '',
    headers: [],
    sampleRows: [],
    validationRules: [],
    comingSoon: true,
  },
];

export function UploadTemplatesPanel() {
  function onDownloadTemplate(d: Dataset): void {
    const lines: string[] = [d.headers.join(',')];
    for (const row of d.sampleRows) {
      lines.push(row.map(serializeCell).join(','));
    }
    downloadCsv(lines.join('\r\n') + '\r\n', d.filename);
  }

  function onDownloadGuide(): void {
    const guide: GuideDataset[] = DATASETS.map((d) => ({
      title: d.title,
      description: d.description,
      columns: d.headers,
      validationRules: d.validationRules,
      comingSoon: d.comingSoon,
    }));
    generateUploadGuidePdf(guide);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          One template per dataset. Fill it, then upload from the Upload Files tab.
        </p>
        <Button size="sm" variant="outline" onClick={onDownloadGuide}>
          <FileText className="mr-1 h-3.5 w-3.5" />
          Download guide
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DATASETS.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex h-full flex-col gap-3 pt-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-navy/10 text-navy">
                  <Layers className="h-4 w-4" />
                </span>
                <span className="font-medium text-foreground">{d.title}</span>
                {d.comingSoon ? <Badge tone="neutral">coming soon</Badge> : null}
              </div>
              <p className="flex-1 text-xs text-muted-foreground">{d.description}</p>
              <div>
                {d.comingSoon ? (
                  <Button size="sm" variant="outline" disabled>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Template coming soon
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onDownloadTemplate(d)}>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    Download CSV
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
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
