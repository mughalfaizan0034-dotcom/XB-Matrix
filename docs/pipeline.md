# Pipeline — Ingestion to Canonical

How operational data enters XB Matrix and becomes channel-agnostic
canonical facts.

```
Connectors / Uploads / APIs
  → Validators        (schema-shape check, per source format)
  → Mappers           (platform-shaped rows → normalized entities)
  → SKU Resolution    (resolveSku via xb_master.sku_aliases)
  → Normalized Entities
  → Canonical Tables  (xb_canonical.* — channel-agnostic)
  → Summary Layers    (xb_summary.* — pre-aggregated)
  → Engines           (see engines.md)
  → Insights / Reports / WMS / Forecasting / UI
```

**The connector boundary is the mapping layer.** Everything before the
mapper may be platform-shaped; everything after is channel-agnostic.
Adding a new connector must not change canonical tables, engines,
summaries, or UI beyond a new source format.

## 1. Operational datasets

There are **three operational datasets**, not per-marketplace kinds.
One upload file may contain many marketplaces/platforms at once;
marketplace/platform is a **row-level column**, never the upload kind.

| Dataset | Purpose |
|---|---|
| Sales Performance | period sales: sessions, orders, units, sales, refunds (total + B2B) |
| Inventory Position | inventory by SKU × marketplace/location × state |
| Advertising Performance | campaign spend, clicks, orders, sales by platform |

UI labels: "Sales Report", "Inventory Report", "Ads Report",
"Warehouse Inventory (coming soon)". Do not present uploads as
marketplace-specific reports — the operational dataset is primary, the
source format is secondary.

## 2. Templates

Single normalized file per dataset. Templates page is download-only;
guidance lives in a separate branded Download Guide PDF
(`apps/web/src/lib/upload-guide-pdf.ts`).

**Sales Performance**
```
action, uid, start_date, end_date, channel,
marketplace,            -- amazon.com, amazon.ca, walmart.com, shopify, tiktokshop, ebay.com, etsy.com
sku,
sessions_total, sessions_b2b, orders_total, orders_b2b,
units_total, units_b2b, sales_total, sales_b2b,
refunds_total, refunds_b2b
```

**Inventory Position**
```
action, uid, date, channel,
marketplace,            -- amazon.com, amazon.ca, walmart.com, warehouse, 3pl, retail
sku,
total, receiving, fc_transfer, reserved, damaged
```

**Advertising Performance**
```
action, uid, start_date, end_date, campaign_name, campaign_type,
platform,                -- amazonads.com, walmartconnect.com, meta.com, googleads.com, tiktokads.com
target_marketplace,      -- amazon.com, amazon.ca, walmart.com, shopify, tiktokshop
sku_name,
impressions, clicks, orders, total_cost, sales, currency,
attribution_window_days  -- OPTIONAL. integer in [1, 90]. blank → null.
                         -- first-class dimension on channel_ads so the
                         -- engine pivots ACOS / TACOS / ROAS by window
                         -- (1d / 7d / 14d / 30d) without baking a
                         -- connector decision into canonical.
```

## 3. Connectors

CSV upload is the first connector mechanism; API / webhook / feed
connectors follow. The downstream pipeline never knows the source
mechanism — a connector only owns its template, validator, and mapper.

Validators live under `apps/api/src/uploads/validators/`. A connector
may inspect platform-specific fields at validation time (e.g. Amazon's
B2B split); after the mapper those distinctions are normalized away or
carried as channel-agnostic dimensions.

The Walmart sales connector validated this architecture: it reused the
same `NormalizedSale` contract, unresolved queue, `resolveSku()`, and
mapping lifecycle with **zero** downstream changes.

## 4. SKU identity (`xb_master.sku_aliases`)

The same physical product has different codes per platform (Amazon
ASIN/seller-SKU, Walmart item ID, Shopify variant ID, internal SKU).
`sku_aliases` maps any platform code → canonical `sku_normalized`.
Mappers call `resolveSku()` during mapping; canonical rows store the
normalized SKU, never the platform code. Without this, one product
appears as several SKUs and inventory/sales double-count.

**The normalized SKU is the core operational entity.** One SKU spans
many marketplaces, warehouses, fulfillment pools, ad platforms, and
regions. The system later aggregates blended sales, blended inventory,
blended ad spend, unified DOS, replenishment, transfer planning,
forecasting, and profitability across all of them.

## 5. Unresolved SKU queue (`xb_master.unresolved_sku_rows`)

When `resolveSku()` cannot match an incoming code, the row lands in the
unresolved queue. This is **operational workflow, not scaffolding** —
expect it to grow assignment, AI-assist, confidence scoring, and bulk
resolution. Treat it as a first-class operator surface.

## 6. Canonical dimensions

Every SKU-scoped canonical row carries a first-class dimension set
(columns, not metadata) that engines, summaries, and UIs depend on:

| Dimension | Applies to | Examples |
|---|---|---|
| `sku_normalized` | all SKU rows | `WIDGET-A` |
| `marketplace_code` | sales, inventory | `amazon_us`, `walmart`, `shopify` |
| `region_code` | sales, inventory | `US`, `CA`, `UK` |
| `fulfillment_type` | sales, inventory | `fba`, `fbm`, `dtc`, `3pl`, `retail` |
| `inventory_location_code` | inventory | `FBA-US`, `WH-NJ`, `3PL-LAX-01` |
| `inventory_state` | inventory | see §7 |
| `ad_platform_code` | ads | `amazon_ads`, `meta_ads`, `google_ads` |
| `source_platform` | all | `amazon`, `walmart`, `shopify`, `meta_ads` |
| `source_account` | all | seller/merchant account id |
| `source_upload_id` | all | FK to `xb_core.uploads.id` |

Marketplace/platform is a **source dimension**, never a separate system.
Engines aggregate over rows for blended views and add a `WHERE` for
filtered views — no platform-specific code paths.

## 7. Canonical table shapes (`xb_canonical.*`)

Channel-agnostic, generically named. Sketches — full DDL pending Spec 3
continuation.

### channel_sales

Period-grain (`day`/`week`/`month`), partitioned monthly on
`period_start`. Carries the dimension set + metrics
`sessions/orders/units/sales/refunds` each split `_total` / `_b2b`,
`currency_code`, and `PACK_SOURCE`. Natural-key uniqueness on
`(workspace_id, sku_normalized, marketplace_code, region_code,
fulfillment_type, period_start, period_end, source_platform,
source_account)` so re-uploads upsert rather than duplicate.

### channel_inventory

Point-in-time on `position_date`, partitioned monthly. One row per
`(sku × marketplace × inventory_location_code × inventory_state ×
ownership)` with a `quantity`. `linked_shipment_id` ties inbound/transfer
rows to `shipment_tracking`.

**Inventory states** (controlled vocabulary):

| State | Counts as sellable? |
|---|---|
| `available` | ✅ |
| `reserved` | ❌ promised to open orders |
| `inbound` | ❌ in transit |
| `damaged` | ❌ |
| `transfer` | ❌ mid-move between owned locations |
| `processing` | ❌ FBA receiving / 3PL putaway |
| `unsellable` | ❌ FBA unfulfillable / quarantined |

`channel_inventory` is the **single** inventory table — FBA, FBM, 3PL,
owned warehouse, retail all land here, distinguished by
`fulfillment_type` + `inventory_location_code`. No separate
`fba_inventory`.

### channel_ads

Period-grain like sales. Shipped in migration 0023.

Dimensions:
- `ad_platform_code` — provider class (`amazon_ads`, `walmart_connect`,
  `meta_ads`, `google_ads`, `tiktok_ads`, …). The spender.
- `target_marketplace_code` — what the spend drove into
  (`amazon_us`, `walmart`, `shopify`). Lets the engine answer
  "off-Amazon spend driving Amazon traffic" without a join.
- `region_code`
- `campaign_name`, `campaign_type` (current mapper output);
  `campaign_id`, `ad_group_id`, `ad_group_name`, `ad_id`,
  `targeting_type`, `placement` (forward-looking, populated when API
  ingestion lands).
- `sku_normalized` (NULL for brand / aggregate campaigns).
- **`attribution_window_days`** — first-class dimension. Amazon and
  others emit the same campaign-period at 1d / 7d / 14d / 30d
  windows; storing the window as a dimension lets the engine pivot
  per analysis (TACOS over 14d, ROAS over 7d, …) without baking a
  connector decision into the warehouse. Nullable for the legacy
  mapper shape; the mapper PR adding window extraction is a separate
  atomic slice.

Additive metrics ONLY: `impressions`, `clicks`, `attributed_orders`,
`spend`, `attributed_sales`, `currency_code`. Derived metrics — ACOS,
ROAS, CPC, CTR, CVR, TACOS — are engine outputs computed in
`intelligence-service`. Canonical never derives.

Natural-key uniqueness includes `attribution_window_days` and every
dimension, so re-uploads of the same period at the same window UPSERT
rather than duplicate.

## 8. Legacy reconciliation

Non-canonical tables shipped early and need replacement:

| Codebase today | Replace with | How |
|---|---|---|
| `xb_canonical.sales_orders` (per-order) | `channel_sales` | bridge data via mapper, then drop |
| `xb_canonical.inventory_snapshots` (warehouse point-in-time) | `channel_inventory` | bridge then drop |

Leave the old tables until nothing references them; drop in a clean
follow-up.

## 9. Implementation rules

1. Connector-specific code lives only in templates / validators /
   mappers. After the mapper, everything is channel-agnostic.
2. No `if (platform === 'amazon')` past the mapper — pull divergence
   into the mapper or add a normalized indicator column.
3. Engines read `channel_*` tables, never raw uploads or
   summary-less data.
4. Validators capture dimensional fields at ingestion; the mapper
   normalizes them onto the shared dimension set.
5. Frontend never aggregates — it reads engine/summary output.
