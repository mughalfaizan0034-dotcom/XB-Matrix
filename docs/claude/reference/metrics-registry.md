# metrics-registry

Single source of KPI truth. One row per metric. BE, FE, AI, and docs reference by ID. Per [D-023](decisions.md), frontend never derives — every cell here is authoritative for what an engine produces.

Layer legend: `canonical` = additive, stored in `xb_canonical.*` · `engine` = derived in service / engine output · `summary` = pre-aggregated in `xb_summary.*` · `planned` = contract only.

Status legend: `live` · `partial` (engine partly wired) · `planned`.

## Index

### Canonical (additive, stored)

| ID | Name | Source table | Grain | Aggregation | Null rule | Format | Status | Description (AI-safe) |
|---|---|---|---|---|---|---|---|---|
| M-001 | `sessions_total` | `channel_sales` | period (day/week/month) | SUM | non-null, 0 default | compact int | live | Total visitor sessions to product detail pages. |
| M-002 | `sessions_b2b` | `channel_sales` | period | SUM | nullable (some channels don't split) | compact int | live | B2B subset of sessions. |
| M-003 | `orders_total` | `channel_sales` | period | SUM | non-null | compact int | live | Distinct orders placed in period. |
| M-004 | `orders_b2b` | `channel_sales` | period | SUM | nullable | compact int | live | B2B subset of orders. |
| M-005 | `units_total` | `channel_sales` | period | SUM | non-null | compact int | live | Units sold in period. |
| M-006 | `units_b2b` | `channel_sales` | period | SUM | nullable | compact int | live | B2B subset of units. |
| M-007 | `sales_total` | `channel_sales` | period | SUM | non-null | currency | live | Gross sales revenue. Currency on row. |
| M-008 | `sales_b2b` | `channel_sales` | period | SUM | nullable | currency | live | B2B subset of gross sales. |
| M-009 | `refunds_total` | `channel_sales` | period | SUM | non-null | currency | live | Refund value in period. |
| M-010 | `refunds_b2b` | `channel_sales` | period | SUM | nullable | currency | live | B2B subset of refunds. |
| M-020 | `impressions` | `channel_ads` | period × window | SUM | non-null | compact int | live | Ad impressions per attribution window. |
| M-021 | `clicks` | `channel_ads` | period × window | SUM | non-null | compact int | live | Ad clicks per attribution window. |
| M-022 | `attributed_orders` | `channel_ads` | period × window | SUM | non-null | compact int | live | Orders attributed to ads in the window. |
| M-023 | `spend` | `channel_ads` | period × window | SUM | non-null | currency | live | Ad spend per attribution window. |
| M-024 | `attributed_sales` | `channel_ads` | period × window | SUM | non-null | currency | live | Sales attributed to ads in the window. |
| M-040 | `inventory_quantity` | `channel_inventory` | point-in-time × state | SUM (filtered by state) | non-null | compact int | live | Raw quantity by `(sku × marketplace × location × state × ownership)`. **Never sum without `inventory_state` filter** ([D-048](decisions.md)). |

### Engine (derived; computed in `/v1/intelligence/*`)

| ID | Name | Formula | Reads | Grain | Owner engine | Null rule | Format | Status | Description (AI-safe) |
|---|---|---|---|---|---|---|---|---|---|
| M-100 | `acos` | `spend / attributed_sales` | M-023, M-024 | period × window | ppc-analytics | null if `attributed_sales = 0` | percent (4 dp internal, 2 dp UI) | partial | Ad Cost of Sales — ad spend over attributed sales. Per attribution window. |
| M-101 | `roas` | `attributed_sales / spend` | M-023, M-024 | period × window | ppc-analytics | null if `spend = 0` | ratio (×) | partial | Return on Ad Spend. |
| M-102 | `tacos` | `spend / sales_total` | M-023, M-007 | period × window | ppc-analytics | null if `sales_total = 0` | percent | partial | Total Ad Cost of Sales — ad spend over total sales (not just attributed). |
| M-103 | `cpc` | `spend / clicks` | M-023, M-021 | period × window | ppc-analytics | null if `clicks = 0` | currency | planned | Cost per click. |
| M-104 | `ctr` | `clicks / impressions` | M-021, M-020 | period × window | ppc-analytics | null if `impressions = 0` | percent | planned | Click-through rate. |
| M-105 | `cvr` | `attributed_orders / clicks` | M-022, M-021 | period × window | ppc-analytics | null if `clicks = 0` | percent | planned | Conversion rate. |
| M-120 | `velocity_per_day` | `units_total / window_days` | M-005 | window (default 30d) | inventory-health | null if window has no sales | decimal (2 dp) | planned | Units sold per day over the lookback. |
| M-121 | `sellable` | `SUM(quantity) WHERE inventory_state='available'` | M-040 | point-in-time | inventory-health | non-null, 0 default | compact int | planned | Stock available to sell now. |
| M-122 | `pipeline_inbound` | `SUM(quantity) WHERE inventory_state='inbound'` | M-040 | point-in-time | inventory-health | non-null, 0 default | compact int | planned | Stock in transit to a location. |
| M-123 | `pipeline_transfer` | `SUM(quantity) WHERE inventory_state='transfer'` | M-040 | point-in-time | inventory-health | non-null, 0 default | compact int | planned | Stock mid-move between owned locations. |
| M-124 | `pipeline_processing` | `SUM(quantity) WHERE inventory_state='processing'` | M-040 | point-in-time | inventory-health | non-null, 0 default | compact int | planned | Stock in FBA receiving / 3PL putaway. |
| M-125 | `reserved` | `SUM(quantity) WHERE inventory_state='reserved'` | M-040 | point-in-time | inventory-health | non-null, 0 default | compact int | planned | Promised to open orders. |
| M-126 | `damaged_unsellable` | `SUM(quantity) WHERE inventory_state IN ('damaged','unsellable')` | M-040 | point-in-time | inventory-health | non-null, 0 default | compact int | planned | Stock not sellable due to damage / FBA unfulfillable. |
| M-130 | `dos_blended` | `sellable / velocity_per_day` | M-121, M-120 | point-in-time + window | inventory-health | null if `velocity_per_day = 0` | decimal (1 dp) | planned | Days of stock at current velocity (blended across marketplaces). |
| M-131 | `dos_by_marketplace` | per-marketplace `sellable / velocity` | M-121, M-120 (filtered) | point-in-time + window × marketplace | inventory-health | null if velocity = 0 | decimal (1 dp) | planned | Marketplace-scoped DOS for replenishment decisions. |
| M-140 | `refund_rate` | `refunds_total / sales_total` | M-009, M-007 | period | sales-aggregation | null if `sales_total = 0` | percent | planned | Refunds as share of gross sales. |
| M-160 | `gross_profit` | `sales_total - cogs - fees` | M-007 + expenses canonical | period | profitability | null if expenses missing | currency | planned | Sales minus COGS minus channel fees. **Gated on Expenses phase.** |
| M-161 | `contribution_margin` | `gross_profit - variable_costs` | M-160 + expenses | period | profitability | null if expenses missing | percent | planned | Margin after variable costs; per-SKU / marketplace. **Gated on Expenses phase.** |
| M-162 | `net_profit` | `gross_profit - spend - fixed_allocations` | M-160, M-023 + expenses | period | profitability | null if expenses missing | currency | planned | Bottom-line per scope. **Gated on Expenses phase.** |
| M-163 | `fully_loaded_tacos` | `(spend + allocated_overhead) / sales_total` | M-023, M-007 + expenses | period | profitability | null if components missing | percent | planned | TACOS including allocated platform costs. **Gated on Expenses phase.** |

## Display format reference

| Format | Util | Notes |
|---|---|---|
| `compact int` | `formatCompact(value)` | `12.3K`, `1.4M`; right-aligned + `tabular-nums` |
| `currency` | `formatCurrency(value, currency)` | symbol from row currency or workspace default; 0 dp on KPI cards, 2 dp in drilldowns |
| `percent` | `formatPercent(value)` | engine stores decimal fraction (`0.123`), UI renders `12.3%` |
| `ratio (×)` | `formatRatio(value)` | `3.5×` |
| `decimal (N dp)` | `formatDecimal(value, dp)` | `12.7` days, `1.42` units |

All formatters live in `apps/web/src/lib/format.ts` (one place). Charts use the same util via shared tick formatters.

## Conventions (apply to every row)

- **Server computes.** Adding a row here is a contract for the engine to fulfill. Frontend never derives ([D-023](decisions.md)).
- **One canonical name.** Same `name` used in code, API responses, audit logs, docs, AI prompts. No synonyms.
- **Currency stays on the row.** Engine output is in workspace `default_currency_code`; converted from `xb_master.fx_rates` per period.
- **Inventory metrics ALWAYS filter by `inventory_state`** ([D-048](decisions.md)).
- **Attribution-window metrics carry the window** in their context, never collapsed. `acos` for 7d ≠ `acos` for 14d ([D-026](decisions.md)).
- **Engine output carries provenance** ([D-021](decisions.md)).
- **AI description** must be safe to read aloud — no formulas referencing internal column names, no engine-internal jargon. One sentence.

## How to add a metric

1. architecture-agent or analytics-agent proposes the row here FIRST.
2. Assign next ID in its block (canonical / engine). Never renumber.
3. backend-agent implements / extends the engine; FE strip / chart consumes by ID name.
4. New formatter? Add to `apps/web/src/lib/format.ts` first; reference from the row.
5. Mark `live` only when an `/v1/intelligence/*` endpoint actually returns it with provenance.

## Anti-duplication

Before adding:
- Is the same value already an existing metric with a filter? Use a filter, not a new metric. (e.g. `dos_by_marketplace` is `dos_blended` filtered.)
- Is the value derivable from two existing metrics? Don't store — derive in the engine.
- Is the value page-specific? Reject — page-specific math is forbidden ([D-046](decisions.md)).
