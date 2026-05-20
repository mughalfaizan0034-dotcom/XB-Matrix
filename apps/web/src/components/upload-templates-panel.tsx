'use client';

import { Download, FileText, Info } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@xb/ui';
import { downloadCsv } from '@xb/ui';

/**
 * Downloadable CSV templates for the spec-aligned upload kinds.
 * One file per kind. Columns + sample rows are the source of truth for
 * what each validator expects — they MUST stay in lockstep with the
 * matching validator in apps/api/src/uploads/validators/amazon-*.ts.
 */

interface Template {
  readonly kind: string;
  readonly title: string;
  readonly description: string;
  readonly filename: string;
  readonly headers: ReadonlyArray<string>;
  readonly sampleRows: ReadonlyArray<ReadonlyArray<string | number>>;
  readonly notes: ReadonlyArray<string>;
}

const TEMPLATES: ReadonlyArray<Template> = [
  {
    kind: 'amazon_sales',
    title: 'Amazon sales',
    description:
      'Period-aggregated sales by (channel × SKU). Sessions, orders, units, sales, refunds — each split total + B2B.',
    filename: 'amazon_sales_template.csv',
    headers: [
      'action',
      'uid',
      'start_date',
      'end_date',
      'channel',
      'sku',
      'sessions_total',
      'sessions_b2b',
      'orders_total',
      'orders_b2b',
      'units_total',
      'units_b2b',
      'sales_total',
      'sales_b2b',
      'refunds_total',
      'refunds_b2b',
    ],
    sampleRows: [
      [
        'upsert',
        '2026-05-01-amazon_us-WIDGET-A',
        '2026-05-01',
        '2026-05-07',
        'amazon_us',
        'WIDGET-A',
        1250,
        180,
        52,
        8,
        72,
        12,
        '899.50',
        '142.40',
        '12.00',
        '0.00',
      ],
      [
        'upsert',
        '2026-05-01-amazon_us-WIDGET-B',
        '2026-05-01',
        '2026-05-07',
        'amazon_us',
        'WIDGET-B',
        832,
        45,
        28,
        3,
        28,
        3,
        '684.40',
        '73.50',
        '0.00',
        '0.00',
      ],
    ],
    notes: [
      'action: upsert | delete',
      'uid: stable, caller-supplied unique key (e.g. period-channel-sku)',
      'B2B columns must be ≤ their _total counterparts',
      'start_date ≤ end_date',
    ],
  },
  {
    kind: 'amazon_inventory',
    title: 'Amazon inventory',
    description:
      'Point-in-time inventory positions per (channel × SKU). Total + partitions (receiving / fc_transfer / reserved / damaged).',
    filename: 'amazon_inventory_template.csv',
    headers: [
      'action',
      'uid',
      'date',
      'channel',
      'sku',
      'total',
      'receiving',
      'fc_transfer',
      'reserved',
      'damaged',
    ],
    sampleRows: [
      [
        'upsert',
        '2026-05-07-amazon_us-WIDGET-A',
        '2026-05-07',
        'amazon_us',
        'WIDGET-A',
        420,
        80,
        15,
        30,
        2,
      ],
      [
        'upsert',
        '2026-05-07-amazon_us-WIDGET-B',
        '2026-05-07',
        'amazon_us',
        'WIDGET-B',
        150,
        20,
        5,
        8,
        0,
      ],
    ],
    notes: [
      'action: upsert | delete',
      'uid: stable, caller-supplied (e.g. date-channel-sku)',
      'receiving + fc_transfer + reserved + damaged must be ≤ total',
      'total = physical position; the rest are partitions of it',
    ],
  },
  {
    kind: 'amazon_ads',
    title: 'Amazon ads (PPC)',
    description:
      'Period-aggregated ad performance per campaign × SKU. Impressions, clicks, cost, attributed orders, attributed sales.',
    filename: 'amazon_ads_template.csv',
    headers: [
      'action',
      'uid',
      'start_date',
      'end_date',
      'campaign_name',
      'campaign_type',
      'sku_name',
      'impressions',
      'clicks',
      'orders',
      'total_cost',
      'sales',
      'currency',
      'platform',
      'target_platform',
    ],
    sampleRows: [
      [
        'upsert',
        '2026-05-01-WIDGET-A-SP',
        '2026-05-01',
        '2026-05-07',
        'Widget A — SP',
        'sponsored_products',
        'WIDGET-A',
        18450,
        420,
        28,
        '142.50',
        '599.40',
        'USD',
        'amazon',
        'amazon_us',
      ],
      [
        'upsert',
        '2026-05-01-WIDGET-B-SP',
        '2026-05-01',
        '2026-05-07',
        'Widget B — SP',
        'sponsored_products',
        'WIDGET-B',
        9820,
        180,
        12,
        '68.90',
        '294.30',
        'USD',
        'amazon',
        'amazon_us',
      ],
    ],
    notes: [
      'action: upsert | delete',
      'campaign_type examples: sponsored_products, sponsored_brands, sponsored_display',
      'clicks must be ≤ impressions',
      'currency: 3-letter ISO (USD, GBP, EUR…)',
      'target_platform: marketplace targeted (amazon_us, amazon_uk, …)',
    ],
  },
];

export function UploadTemplatesPanel() {
  function onDownload(t: Template) {
    const lines: string[] = [t.headers.join(',')];
    for (const row of t.sampleRows) {
      lines.push(row.map(serializeCell).join(','));
    }
    downloadCsv(lines.join('\r\n') + '\r\n', t.filename);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <p>
          Download a template, fill in your data, then upload it back via the{' '}
          <span className="font-medium text-foreground">Upload Files</span> tab. The validator
          enforces these exact columns + types — extra columns are allowed and ignored.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Card key={t.kind}>
            <CardContent className="flex h-full flex-col gap-3 pt-5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{t.title}</span>
                <Badge tone="neutral">{t.kind}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{t.description}</p>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Columns ({t.headers.length})
                </summary>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.headers.map((h) => (
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
                  {t.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </details>

              <div className="mt-auto">
                <Button size="sm" variant="outline" onClick={() => onDownload(t)}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download CSV
                </Button>
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
