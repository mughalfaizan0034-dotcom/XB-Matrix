# engines

Deterministic calculation layer. Frontend renders engine output only. See [architecture §10](architecture.md#10-engines--deterministic-before-ai) and [data-model](data-model.md).

## 1. Principles

- Operate on `xb_canonical.*` + `xb_summary.*` only. Never raw uploads.
- Channel-agnostic. Blended by default. Filters narrow the same engine; never branch.
- Deterministic, idempotent, async, **versioned** (`engine_key`, `engine_version`, `generated_at`).
- Output written to `xb_intelligence.*` with full provenance.
- AI consumes engine output. AI never derives metrics, never invents numbers.

## 2. Single intelligence service layer

`/v1/intelligence/*` — one service feeds dashboards · reports · alerts · AI. Page-specific math is forbidden.

Representative services (workspace-scoped, deterministic):
```
getWorkspaceKPIs()         getInventoryRisks()
getSalesTrends()           getLowDosSkus()
getAdvertisingPerformance() getHighTacosSkus()
getMarketplaceBreakdowns() getRefundAnomalies()
getTopMovers()             getDecliningSkus()
getLowPerformingProducts()
```

## 3. Engine roadmap (sequenced)

| # | Engine | Reads | Writes / Output |
|---|---|---|---|
| 1 | Sales intelligence | `channel_sales` | KPI / trend / breakdown service |
| 2 | Inventory intelligence | `channel_inventory` | sellable / pipeline / DOS |
| 3 | Advertising intelligence | `channel_ads` | ACOS / TACOS / ROAS / CPC / CTR / CVR (by attribution window) |
| 4 | Dashboard KPI / trend | 1–3 | unified KPI service |
| 5 | Operational alerts | 1–3 | rule-based insight feed |
| 6 | Intelligence APIs | 1–5 | consolidated service catalogue |
| 7 | AI assistant shell | engine outputs | workspace-scoped streaming chat |
| 8 | AI insight summaries | 1–5 | deterministic insight narratives |
| 9 | AI recommendations | engines + canonical | inventory/ads/sales/pricing recs |
| 10 | Forecasting + automation | canonical + outputs | demand projection + automated actions |

Phases 1–5 = deterministic. AI lands on top of stable engine output. Each phase manually verified for correctness + workspace isolation before next.

## 4. Engine contracts

### Generic query

```ts
interface EngineQuery {
  workspaceId: WorkspaceId;
  periodStart: Date;
  periodEnd: Date;
  skuNormalized?: string;
  marketplaceCode?: string;
  regionCode?: string;
  fulfillmentType?: string;
  inventoryLocationCode?: string;
  adPlatformCode?: string;
  targetMarketplaceCode?: string;
  attributionWindowDays?: number;
  brandNormalized?: string;
}
```

No filters → blended. Filters → same engine + WHERE.

### Inventory query

```ts
interface InventoryEngineQuery {
  workspaceId: WorkspaceId;
  asOf: Date;
  windowDays: number;   // velocity lookback, default 30
  skuNormalized?: string;
  marketplaceCode?: string;
  inventoryLocationCode?: string;
  state?: InventoryState[];
}
```

Sums **must** filter by `inventory_state`. Unfiltered sums are meaningless. "Sellable" = `state='available'`.

## 5. Provenance block (mandatory on every response)

```ts
provenance: {
  engineKey: string;
  engineVersion: string;
  generatedAt: ISODateTime;
  windowStart: Date;
  windowEnd: Date;
  filters: Record<string, string | null>;
  rowCount: number;
}
```

Missing provenance = engine response rejected.

## 6. Replenishment flow

Per `(workspace × SKU)`:
1. Aggregate sellable inventory per marketplace.
2. Aggregate velocity per marketplace over lookback.
3. Compute marketplace-level DOS.
4. Identify low-DOS marketplaces (< `workspace.dos_target_days`).
5. Identify high-inventory owned pools (warehouse + 3PL).
6. Match pools → marketplaces (geography + fulfillment compatibility).
7. Propose transfers + reorders when `pipeline + sellable < lead_time × velocity × safety_factor`.

Steps 1–6 = SQL over canonical. Step 7 → `xb_intelligence.recommendations` with provenance.

## 7. Profitability (Expenses phase)

Gated on `xb_canonical.expenses` landing. Engine derivations: gross profit, net profit, contribution margin, fully-loaded TACOS, per-SKU / marketplace / brand profitability. All server-side. Unit Economics module = ComingSoonState until then.

## 8. Forecasting

- Reads canonical + historical velocity by SKU × marketplace × fulfillment.
- Outputs → `xb_intelligence.forecast_outputs` with model metadata + provenance.
- Frontend never recomputes a projection; always reads forecast output.

## 9. Warehouse orchestration (logistics phase)

New canonical tables: `xb_canonical.warehouse_inventory`, `xb_canonical.shipment_movements`. Engines: shipment recommendation, transfer planning, putaway, replenishment loop. Live control plane, not upload UI. Multi-phase workstream — see [roadmap](roadmap.md).

## 10. Reports

Reports = generated outputs of engines, not uploaded files.

| Report | Engine source |
|---|---|
| Sales Report | Sales intelligence |
| Ads Report | Advertising intelligence |
| Inventory Report | Inventory intelligence |
| Warehouse Inventory | Inventory intelligence (coming soon) |

Statuses: `ready` (PDF downloadable, ≤30d) · `archived` (>30d, metadata only) · `generating` · `failed`. PDF in GCS reports bucket with 30d lifecycle. Canonical data retained indefinitely.

## 11. Server-side calculation rules

- ACOS, TACOS, ROAS, CPC, CTR, CVR, DOS, velocity, refund rate, contribution margin — engine outputs only.
- Canonical stores **additive** metrics. Derivation lives in the engine.
- Re-uploads UPSERT on natural keys; never duplicate canonical rows.
- Reconciliation lives **beside** canonical, never inside it.

## 12. Frontend rules

- No business math. Period.
- Renders engine response + provenance.
- Loading: skeleton; never partial calculation.
- Error: surface engine error + retry. Never silently compute fallback.

## Cross-refs

[architecture](architecture.md) · [data-model](data-model.md) · [backend-standards](backend-standards.md) · [roadmap](roadmap.md)
