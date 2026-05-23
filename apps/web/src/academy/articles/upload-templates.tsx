import type { AcademyArticle } from '../types.js';
import {
  CodeBlock,
  CommonMistakes,
  ExampleWorkflow,
  HowItWorks,
  Note,
  Overview,
  QA,
  QAItem,
  Related,
  WhyItMatters,
} from '../sections.js';

/**
 * Upload Templates, the seed article that demonstrates the canonical
 * doc-style article structure for Academy. Subsequent articles compose
 * the same Section primitives in the same order.
 */
function Body() {
  return (
    <>
      <Overview>
        <p>
          XB Matrix ingests every operational dataset through one
          normalized template per dataset. One file can carry rows from
          any combination of marketplaces, marketplace and platform are
          row-level columns, never a per-marketplace template.
        </p>
        <p>
          There are four downloadable templates today: Sales Report,
          Inventory Report, Ads Report, and (Coming Soon) Warehouse
          Inventory. Three additional templates (COGs, Case Pack
          Details, SKU Status) are visible in the modal and ship as
          their canonical writers land.
        </p>
      </Overview>

      <WhyItMatters>
        <p>
          The template is the contract between operator and engine. A
          correctly shaped file flows from validator to mapper to
          canonical table to engine in a single pass, and the
          intelligence layer is computed deterministically on top. A
          mis-shaped file rejects row-by-row with operator-readable
          errors before any canonical write happens. Either way, the
          downstream engine never sees ambiguous data.
        </p>
      </WhyItMatters>

      <HowItWorks>
        <p>
          Every template carries an <code>action</code> column that
          drives a tiny lifecycle:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <code>add</code>: insert the row. Re-uploading the same
            natural key upserts (no duplicate).
          </li>
          <li>
            <code>update</code>: same as add. Both upsert on the natural
            key.
          </li>
          <li>
            <code>remove</code>: delete the row at the natural key.
          </li>
        </ul>
        <p>
          Legacy templates that use <code>upsert</code> or{' '}
          <code>delete</code> still validate. They are treated as{' '}
          <code>update</code> and <code>remove</code> internally.
        </p>

        <h3 className="mt-2 font-heading text-sm font-semibold text-foreground">
          The three operational datasets today
        </h3>

        <p>
          <strong>Sales Performance</strong> captures period sales by
          SKU across every channel: sessions, orders, units, sales, and
          refunds, each split <code>_total</code> and <code>_b2b</code>.
          The marketplace column distinguishes Amazon, Walmart, Shopify,
          TikTok Shop, eBay, and Etsy rows in one file.
        </p>
        <CodeBlock>
{`action, uid, start_date, end_date, channel, marketplace, sku,
sessions_total, sessions_b2b, orders_total, orders_b2b,
units_total, units_b2b, sales_total, sales_b2b,
refunds_total, refunds_b2b`}
        </CodeBlock>

        <p>
          <strong>Inventory Position</strong> captures point-in-time
          inventory per SKU across every pool: FBA per country, FBM,
          owned warehouses, 3PL, retail.
        </p>
        <CodeBlock>
{`action, uid, date, channel, marketplace, sku,
total, receiving, fc_transfer, reserved, damaged`}
        </CodeBlock>

        <p>
          <strong>Advertising Performance</strong> captures period ad
          spend plus attributed sales per campaign and SKU. The
          platform column is the ad source. The
          target_marketplace column is where the spend drove demand.
          Off-Amazon spend driving Amazon looks like{' '}
          <code>platform=meta.com</code> +{' '}
          <code>target_marketplace=amazon.com</code>.
        </p>
        <CodeBlock>
{`action, uid, start_date, end_date, campaign_name, campaign_type,
platform, target_marketplace, sku_name,
impressions, clicks, orders, total_cost, sales, currency,
attribution_window_days`}
        </CodeBlock>

        <Note>
          <code>attribution_window_days</code> is optional on the Ads
          template. When present it must be an integer in [1, 90].
          Common values: 1, 7, 14, 30. The engine pivots ACOS, TACOS,
          ROAS by window when set. Blank rows are included in every
          window as a best-available fallback.
        </Note>

        <h3 className="mt-2 font-heading text-sm font-semibold text-foreground">
          End-to-end ingestion
        </h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            The validator parses the file, type-checks columns, and
            rejects rows with errors row-by-row.
          </li>
          <li>
            The mapper normalizes provider-specific names into channel-
            agnostic dimensions (<code>ad_platform_code</code>,{' '}
            <code>target_marketplace_code</code>, and so on) and
            resolves each SKU code into the workspace's canonical{' '}
            <code>sku_normalized</code>.
          </li>
          <li>
            The writer upserts the normalized row into the canonical
            table on the natural key.
          </li>
          <li>
            The intelligence engine reads canonical rows, computes
            derived metrics (ACOS, TACOS, stock cover, and so on), and
            emits them with provenance to the dashboard, reports, and
            module pages.
          </li>
        </ol>
      </HowItWorks>

      <ExampleWorkflow>
        <p>
          An operator wants to ingest three days of Amazon and Walmart
          sales for SKU <code>WIDGET-A</code>:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Open <strong>Uploads</strong>, click{' '}
            <strong>Download Template</strong>, pick Sales Report.
          </li>
          <li>
            Fill three rows in the downloaded CSV. Use{' '}
            <code>marketplace=amazon.com</code> on one row and{' '}
            <code>marketplace=walmart.com</code> on another. Same file.
          </li>
          <li>
            Click <strong>New upload</strong>, upload the file.
          </li>
          <li>
            Validator runs in the upload's transaction. If a row is
            malformed it shows up in the upload detail drawer with the
            offending column and message.
          </li>
          <li>
            On success the mapper resolves SKUs and the writer upserts
            rows into <code>xb_canonical.channel_sales</code>. The
            dashboard's revenue tile picks up the new numbers on its
            next refresh.
          </li>
        </ol>
      </ExampleWorkflow>

      <CommonMistakes>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Mixed currencies in one file.</strong> Accepted, but
            aggregate revenue is reported raw. The engine does not
            FX-convert. Filter by currency when comparing across
            regions.
          </li>
          <li>
            <strong>Unknown SKU codes.</strong> Land in the unresolved
            SKU queue. Resolve them by adding an alias in{' '}
            <em>SKU Aliases</em>. Subsequent uploads then map cleanly.
          </li>
          <li>
            <strong>Treating re-uploads as duplicates.</strong> Re-
            uploads overwrite existing rows on the natural key. To roll
            back a bad upload, re-upload the same rows with{' '}
            <code>action=remove</code>.
          </li>
          <li>
            <strong>Inventing a marketplace string.</strong> Use the
            canonical values from the template comments (
            <code>amazon.com</code>, <code>amazon.ca</code>,{' '}
            <code>walmart.com</code>, <code>shopify</code>,{' '}
            <code>tiktokshop</code>, <code>ebay.com</code>,{' '}
            <code>etsy.com</code>). Free-text values become unresolved
            facets.
          </li>
        </ul>
      </CommonMistakes>

      <QA>
        <QAItem question="Why is marketplace a column instead of a separate template per marketplace?">
          One canonical layer means one engine. The same TACOS, stock
          cover, and contribution-margin logic runs across every
          marketplace because every row carries the dimension. Adding a
          new marketplace tomorrow does not require a new schema, just
          a new value in the column.
        </QAItem>
        <QAItem question="What is the difference between platform and target_marketplace on the Ads template?">
          The platform is the ad source: amazonads.com, meta.com,
          googleads.com, and so on. The target_marketplace is where the
          spend drove demand: amazon.com, walmart.com, shopify. Meta
          spend driving Amazon traffic looks like platform=meta.com plus
          target_marketplace=amazon.com.
        </QAItem>
        <QAItem question="Why is attribution_window_days a row dimension?">
          Amazon emits the same campaign-period at multiple attribution
          windows (1d, 7d, 14d, 30d). Storing the window as a dimension
          lets the engine pivot ACOS, ROAS, and TACOS per analysis
          without baking a connector decision into the warehouse. The
          column is optional today and nullable on canonical.
        </QAItem>
        <QAItem question="What happens to rows that fail validation?">
          They are rejected row-by-row with column-scoped error
          messages. The upload's status becomes failed and the offending
          rows are visible in the detail drawer. Successful rows of the
          same file are NOT written, validation is all-or-nothing per
          upload to keep canonical state consistent.
        </QAItem>
      </QA>

      <Related
        links={[
          {
            slug: 'sku-normalization',
            title: 'SKU Normalization',
            summary: 'Alias maps, the unresolved queue, resolution rules.',
          },
          {
            slug: 'marketplace-and-platform-mapping',
            title: 'Marketplace & Platform Mapping',
            summary: 'What each dimension means and when to use which.',
          },
          {
            slug: 'canonical-data-model',
            title: 'Canonical Data Model',
            summary: 'The channel_sales, channel_ads, channel_inventory layer.',
          },
          {
            slug: 'upload-examples',
            title: 'Upload Examples',
            summary: 'Sample rows for every template.',
          },
        ]}
      />
    </>
  );
}

export const uploadTemplatesArticle: AcademyArticle = {
  meta: {
    slug: 'upload-templates',
    title: 'Upload Templates',
    category: 'Upload Templates',
    summary:
      'The operational templates, their columns, the action lifecycle, and how a row becomes engine intelligence.',
    tags: [
      'upload',
      'template',
      'csv',
      'sales performance',
      'inventory position',
      'advertising performance',
      'attribution',
      'sku',
      'marketplace',
      'platform',
    ],
  },
  Body,
};
