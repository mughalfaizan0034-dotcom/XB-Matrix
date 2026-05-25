# analytics-agent

Bootstrap for KPI systems, intelligence engines, charts, reporting, forecasting.

## Bootstrap files (load in order)

1. [../README.md](../README.md)
2. [../architecture.md](../architecture.md)
3. [../engines.md](../engines.md)
4. [../data-model.md](../data-model.md)
5. [../design-system.md](../design-system.md)
6. [../frontend-standards.md](../frontend-standards.md)

Pull on demand: `../backend-standards.md` · `../engineering-rules.md` · `../roadmap.md`

Code truth: `packages/calculations` · `apps/api/src/services/intelligence-*` · `apps/api/src/lib/api-intelligence.ts` (FE client) · `apps/web/src/components/charts/*` (when present).

## In scope

- Intelligence engines (sales, inventory, advertising, dashboard KPI, alerts)
- Metric registry (canonical KPI names + formulas + units)
- Forecasting + replenishment math
- Profitability (post-Expenses phase)
- Time-grain strategy (day / week / month aggregation)
- Trend / breakdown / drilldown chart composition
- Report generation engines + report metadata
- AI insight summaries (deterministic rule output before generative)

## Out of scope (refuse)

- Schema migrations (defer to backend-agent for execution).
- Auth / RBAC capability work (defer to backend-agent).
- Sidebar / topbar / dialog behavior.
- Non-chart UI primitives.

## Non-negotiables

- **All math server-side.** Frontend renders engine output + provenance.
- Engines read `xb_canonical.*` + `xb_summary.*` only. Never raw uploads.
- Channel-agnostic. Marketplace = dimension; no `if (platform === 'amazon')` past mapper.
- Engine output carries `engine_key`, `engine_version`, `generated_at`, full provenance block (see [engines §5](../engines.md#5-provenance-block-mandatory-on-every-response)).
- Canonical stores additive metrics only. Derivation (ACOS / TACOS / ROAS / DOS / CPC / CTR / CVR / contribution margin) is engine output.
- Inventory sums always filter by `inventory_state`.
- Re-uploads UPSERT canonical on natural key including `attribution_window_days` for ads.
- Reconciliation beside canonical, never inside.
- Recharts only. Theme tokens only. Tooltip + tick formatters from shared utils.
- Aggregation server-side; chart receives the array.

## Metric registry rules

- Every KPI gets one canonical name (`sales_total`, `tacos`, `dos_blended`, …) defined once.
- Each name maps to a single engine formula + unit + display formatter.
- Page-specific calculations forbidden. Reuse the registry.
- New KPI → registry entry first, then engine wiring, then UI consumption.

## Engine I/O conventions

- Use `EngineQuery` / `InventoryEngineQuery` shapes from [engines §4](../engines.md#4-engine-contracts).
- No filters → blended. Filters → same engine + `WHERE`.
- Response wraps `{ data, meta: { provenance } }`.
- Long-running engine recompute → worker, not request path.

## Chart composition rules

- Wrapper components live in `packages/ui` / `apps/web/src/components/charts/*`.
- Tokens: `--chart-1` … `--chart-6`. No raw hex.
- Min height: 240px desktop, 200px mobile.
- Tooltip uses shared component (token-themed border + `tabular-nums`).
- Tick formatters: `formatCurrency`, `formatCompact`, `formatPercent` (one place).
- Each chart pairs with an accessible alternative (aria summary or data table fallback).
- First chart to ship: Dashboard revenue + spend trend.

## Reporting rules

- Reports = generated engine outputs, not uploaded files.
- Status enum: `ready` · `archived` (>30d, PDF gone, metadata kept) · `generating` · `failed`.
- PDF storage: GCS reports bucket, 30d lifecycle. Canonical data retained indefinitely.
- Re-generate over time produces a new report row; never overwrite prior versions.

## Forecasting rules

- Reads canonical + historical velocity by SKU × marketplace × fulfillment.
- Outputs to `xb_intelligence.forecast_outputs` with `model_metadata` + provenance.
- Frontend never recomputes a projection. Reads forecast output rows.
- Workspace `dos_target_days` + `forecast_rules` drive replenishment thresholds.

## AI boundary

- AI consumes engine output only. No raw canonical scans, no upload reads.
- AI inherits workspace + permission scope.
- AI narrative never invents numbers; deterministic rule output (`insights`) precedes generative summaries.

## Standard workflow

1. Confirm the metric belongs to the registry (or add it there first).
2. Define / extend engine in `packages/calculations` + service in `apps/api/src/services/intelligence-*`.
3. Wire FE client + chart wrapper consuming `{ data, meta.provenance }`.
4. Hand to backend-agent for migrations or RLS work.
5. Hand to frontend-agent for non-chart UI integration.
6. Hand to qa-agent for chart consistency + provenance audits.

## PR checklist (run before review)

- [ ] Every derived metric computed server-side.
- [ ] Provenance attached to every engine response.
- [ ] Inventory queries filter by `inventory_state`.
- [ ] Re-upload UPSERT keys cover every dimension (incl. `attribution_window_days` for ads).
- [ ] Recharts + theme tokens only.
- [ ] Shared tooltip / legend / tick formatters used.
- [ ] Aria summary or accessible data fallback on every chart.
- [ ] No frontend recomputation of ACOS / TACOS / ROAS / DOS / CPC / CTR / CVR.
- [ ] Report flows respect status enum + 30d archive lifecycle.
- [ ] [qa-checklists §7, §12](../qa-checklists.md) relevant items reviewed.
