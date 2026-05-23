import type { AcademyArticle } from '../types.js';

/**
 * Upload Templates — the seed article for the Academy.
 *
 * Operational pages link here via small "Learn more" affordances; this
 * article is where every explanation about the upload templates
 * (formerly inlined on the Uploads page) now lives. Keep updates here
 * authoritative — do not duplicate this content on operational
 * surfaces.
 */
function Body() {
  return (
    <div className="prose-academy">
      <p className="lead">
        XB Matrix ingests every operational dataset through one normalized
        template per dataset. One file can carry rows from any combination
        of marketplaces — marketplace / platform is a column dimension,
        never a per-marketplace template.
      </p>

      <h2>The three operational datasets</h2>
      <p>
        Three templates cover every operator workflow today. Each one is
        an additive primitive feed — derived metrics like ACOS, TACOS,
        margin, cover-days never appear in the template. Those are engine
        outputs computed from these primitives.
      </p>

      <Dataset
        title="Sales Performance"
        purpose="Period sales by SKU across every channel — sessions, orders, units, revenue, refunds."
        columns={[
          'action', 'uid', 'start_date', 'end_date', 'channel',
          'marketplace', 'sku',
          'sessions_total', 'sessions_b2b',
          'orders_total', 'orders_b2b',
          'units_total', 'units_b2b',
          'sales_total', 'sales_b2b',
          'refunds_total', 'refunds_b2b',
        ]}
        notes={[
          <>
            <code>marketplace</code> is the row-level dimension —{' '}
            <code>amazon.com</code>, <code>amazon.ca</code>,{' '}
            <code>walmart.com</code>, <code>shopify</code>,{' '}
            <code>tiktokshop</code>, <code>ebay.com</code>,{' '}
            <code>etsy.com</code>. Mix marketplaces freely in one file.
          </>,
          <>
            Each metric splits into <code>_total</code> and{' '}
            <code>_b2b</code>. B2B values must be ≤ total.
          </>,
        ]}
      />

      <Dataset
        title="Inventory Position"
        purpose="Point-in-time inventory per SKU across every pool — FBA per country, FBM, owned warehouses, 3PL, retail."
        columns={[
          'action', 'uid', 'date', 'channel',
          'marketplace', 'sku',
          'total', 'receiving', 'fc_transfer', 'reserved', 'damaged',
        ]}
        notes={[
          <>
            <code>marketplace</code> covers the marketplace pools{' '}
            (<code>amazon.com</code>, <code>walmart.com</code>) plus the
            non-marketplace pools (<code>warehouse</code>, <code>3pl</code>,{' '}
            <code>retail</code>) — they all land in the same inventory
            intelligence layer.
          </>,
          <>
            The five state columns split <code>total</code> on-hand into
            available / receiving / fc_transfer / reserved / damaged. The
            engine computes sellable on-hand from these.
          </>,
        ]}
      />

      <Dataset
        title="Advertising Performance"
        purpose="Period ad spend + attributed sales per campaign / SKU. One file across every ad platform — the platform column is the ad source, target_marketplace is where the spend drove demand."
        columns={[
          'action', 'uid', 'start_date', 'end_date',
          'campaign_name', 'campaign_type',
          'platform', 'target_marketplace', 'sku_name',
          'impressions', 'clicks', 'orders', 'total_cost', 'sales', 'currency',
          'attribution_window_days',
        ]}
        notes={[
          <>
            <code>platform</code> is the ad source —{' '}
            <code>amazonads.com</code>, <code>walmartconnect.com</code>,{' '}
            <code>meta.com</code>, <code>googleads.com</code>,{' '}
            <code>tiktokads.com</code>. <code>target_marketplace</code> is
            where the spend drove demand. Off-Amazon spend driving Amazon
            traffic looks like <code>platform=meta.com</code> +{' '}
            <code>target_marketplace=amazon.com</code>.
          </>,
          <>
            <code>attribution_window_days</code> is optional. When present
            it must be an integer in <code>[1, 90]</code>. Common values:
            1, 7, 14, 30. The engine pivots ACOS / TACOS / ROAS per
            window when set; blank rows are included in every window as
            a "best available" fallback.
          </>,
          <>
            Brand or aggregate-campaign rows can carry{' '}
            <code>sku_name = ALL</code> or <code>*</code> — the engine
            aggregates spend at the campaign level without falsely
            attributing it to a single SKU.
          </>,
        ]}
      />

      <h2>Action column lifecycle</h2>
      <ul>
        <li>
          <code>add</code> — insert the row. Re-uploading the same
          natural key upserts (no duplicate row).
        </li>
        <li>
          <code>update</code> — same as add. Both upsert on the natural
          key.
        </li>
        <li>
          <code>remove</code> — delete the row at the natural key.
        </li>
      </ul>
      <p>
        Legacy templates that use <code>upsert</code> /{' '}
        <code>delete</code> still validate; they're treated as{' '}
        <code>update</code> / <code>remove</code>.
      </p>

      <h2>How a row becomes intelligence</h2>
      <ol>
        <li>
          The validator parses the file, type-checks columns, and rejects
          rows with errors row-by-row.
        </li>
        <li>
          The mapper normalizes provider-specific names into channel-
          agnostic dimensions (<code>ad_platform_code</code>,{' '}
          <code>target_marketplace_code</code>, etc.) and resolves any
          SKU code into the workspace's canonical{' '}
          <code>sku_normalized</code>.
        </li>
        <li>
          The writer upserts the normalized row into the canonical table
          (<code>channel_sales</code>, <code>channel_ads</code>) on the
          natural key.
        </li>
        <li>
          The intelligence engine reads canonical rows, computes derived
          metrics (ACOS, TACOS, stock cover, etc.), and emits them with
          provenance to the dashboard, reports, and module pages.
        </li>
      </ol>

      <h2>Common gotchas</h2>
      <ul>
        <li>
          <strong>Mixed currencies</strong> in one file are accepted, but
          aggregate revenue numbers are reported raw — the engine doesn't
          FX-convert. Filter by currency when comparing across regions.
        </li>
        <li>
          <strong>Unknown SKU codes</strong> land in the unresolved-SKU
          queue. Resolve them by adding an alias in{' '}
          <em>SKU Aliases</em>; subsequent uploads then map cleanly.
        </li>
        <li>
          <strong>Re-uploads</strong> overwrite existing rows on the
          natural key. To roll back a bad upload, re-upload the same
          rows with <code>action=remove</code>.
        </li>
      </ul>
    </div>
  );
}

interface DatasetProps {
  readonly title: string;
  readonly purpose: string;
  readonly columns: ReadonlyArray<string>;
  readonly notes: ReadonlyArray<React.ReactNode>;
}

function Dataset({ title, purpose, columns, notes }: DatasetProps) {
  return (
    <section>
      <h3>{title}</h3>
      <p>{purpose}</p>
      <pre className="academy-columns">
        <code>{columns.join(', ')}</code>
      </pre>
      <ul>
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </section>
  );
}

export const uploadTemplatesArticle: AcademyArticle = {
  meta: {
    slug: 'upload-templates',
    title: 'Upload Templates',
    section: 'Data Pipeline',
    summary:
      'The three operational dataset templates (Sales, Inventory, Advertising), their columns, the action lifecycle, and how a row becomes engine intelligence.',
    tags: [
      'upload', 'template', 'csv', 'sales performance',
      'inventory position', 'advertising performance',
      'attribution', 'sku', 'marketplace', 'platform',
    ],
  },
  Body,
};
