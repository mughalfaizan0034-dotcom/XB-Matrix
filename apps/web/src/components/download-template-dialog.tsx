'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Download,
  FileText,
  Layers,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  downloadCsv,
} from '@xb/ui';
import { generateUploadGuidePdf, type GuideDataset } from '@/lib/upload-guide-pdf';

/**
 * Download Template dialog, enterprise modal that replaces the
 * old Uploads-page Templates tab + grid.
 *
 * Minimal copy by design: each dataset row carries the title, a tight
 * one-line summary, and a Download CSV action. Concept explanations
 * (column meanings, validation rules, ingestion philosophy) live in
 * the Academy article at /academy/upload-templates, linked from the
 * footer. The Download guide PDF stays available for offline reference.
 */

interface TemplateRow {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly filename: string;
  readonly headers: ReadonlyArray<string>;
  readonly sampleRows: ReadonlyArray<ReadonlyArray<string | number>>;
  readonly comingSoon?: boolean;
}

const TEMPLATES: ReadonlyArray<TemplateRow> = [
  {
    id: 'sales_performance',
    title: 'Sales Report',
    summary: 'Period sales by SKU across every channel.',
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
  },
  {
    id: 'inventory_position',
    title: 'Inventory Report',
    summary: 'Point-in-time inventory per SKU across every pool.',
    filename: 'inventory_position_template.csv',
    headers: ['action', 'uid', 'date', 'channel', 'marketplace', 'sku', 'total', 'receiving', 'fc_transfer', 'reserved', 'damaged'],
    sampleRows: [
      ['add', '2026-05-07-amazon.com-WIDGET-A', '2026-05-07', 'fba', 'amazon.com', 'WIDGET-A', 420, 80, 15, 30, 2],
      ['add', '2026-05-07-walmart.com-WIDGET-A', '2026-05-07', 'fbm', 'walmart.com', 'WIDGET-A', 95, 25, 0, 4, 0],
      ['add', '2026-05-07-warehouse-WIDGET-A', '2026-05-07', 'owned', 'warehouse', 'WIDGET-A', 1200, 0, 0, 0, 6],
    ],
  },
  {
    id: 'advertising_performance',
    title: 'Ads Report',
    summary: 'Period ad spend + attributed sales across every ad platform.',
    filename: 'advertising_performance_template.csv',
    headers: [
      'action', 'uid', 'start_date', 'end_date', 'campaign_name', 'campaign_type',
      'platform', 'target_marketplace', 'sku_name',
      'impressions', 'clicks', 'orders', 'total_cost', 'sales', 'currency',
      'attribution_window_days',
    ],
    sampleRows: [
      ['add', '2026-05-01-amazonads-WIDGET-A', '2026-05-01', '2026-05-07',
       'Widget A, SP', 'sponsored_products', 'amazonads.com', 'amazon.com', 'WIDGET-A',
       18450, 420, 28, '142.50', '599.40', 'USD', 14],
      ['add', '2026-05-01-meta-WIDGET-A', '2026-05-01', '2026-05-07',
       'Widget A, Prospecting', 'social', 'meta.com', 'shopify', 'WIDGET-A',
       42100, 380, 14, '210.00', '420.00', 'USD', 7],
    ],
  },
  {
    id: 'warehouse_inventory',
    title: 'Warehouse Inventory',
    summary: 'Dedicated non-marketplace warehouse stock feed.',
    filename: '',
    headers: [],
    sampleRows: [],
    comingSoon: true,
  },
  {
    id: 'cogs',
    title: 'COGs Report',
    summary: 'SKU-level cost inputs for profitability + unit economics.',
    filename: '',
    headers: [],
    sampleRows: [],
    comingSoon: true,
  },
  {
    id: 'case_pack_details',
    title: 'Case Pack Details',
    summary: 'Box / pallet packaging constraints for replenishment + shipment planning.',
    filename: '',
    headers: [],
    sampleRows: [],
    comingSoon: true,
  },
  {
    id: 'sku_status',
    title: 'SKU Status',
    summary: 'Active / discontinued flag, keeps analytics intact while excluding from replenishment.',
    filename: '',
    headers: [],
    sampleRows: [],
    comingSoon: true,
  },
];

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function DownloadTemplateDialog({ open, onClose }: Props) {
  function onDownloadTemplate(t: TemplateRow): void {
    const lines: string[] = [t.headers.join(',')];
    for (const row of t.sampleRows) lines.push(row.map(serializeCell).join(','));
    downloadCsv(lines.join('\r\n') + '\r\n', t.filename);
  }

  function onDownloadGuide(): void {
    const guide: GuideDataset[] = TEMPLATES.filter((t) => !t.comingSoon).map((t) => ({
      title: t.title,
      description: t.summary,
      columns: t.headers,
      validationRules: [],
      comingSoon: t.comingSoon,
    }));
    generateUploadGuidePdf(guide);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Download template"
      description="Pick the operational dataset, fill the file, then upload it."
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Link
            href="/academy/upload-templates"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Learn more in Academy
            <ArrowRight className="h-3 w-3" />
          </Link>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onDownloadGuide}>
              <FileText className="mr-1 h-3.5 w-3.5" />
              Download guide PDF
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <ul className="flex flex-col gap-1.5">
        {TEMPLATES.map((t) => (
          <li key={t.id}>
            <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-navy/10 text-navy">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{t.title}</span>
                  {t.comingSoon ? <Badge tone="neutral">Coming soon</Badge> : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">{t.summary}</p>
              </div>
              {t.comingSoon ? (
                <Button size="sm" variant="outline" disabled>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Soon
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => onDownloadTemplate(t)}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  CSV
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function serializeCell(v: string | number): string {
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
