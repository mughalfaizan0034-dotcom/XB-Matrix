# Engines — Calculation & Intelligence Layer

Centralized, reusable backend engines. **Not page-specific calculations.**
The frontend never computes business metrics — it renders engine output.

> Status: no engines implemented yet (foundation phase). This doc is the
> binding I/O contract for when they ship. Engine versioning, the
> `Engine<Input, Output>` interface, and `makeEngineRunMeta()` live in
> [`packages/calculations`](../packages/calculations/) — see
> [`ARCHITECTURE.md`](ARCHITECTURE.md) §8.

## Principles

1. Engines operate on **canonical + summary tables only** — never raw
   uploads, never inside frontend pages or report views.
2. Channel-agnostic — no `if (platform === 'amazon')`. Marketplace/
   platform is a filter dimension, not a code branch.
3. Deterministic, idempotent, async, versioned (`engine_key` +
   `engine_version` recorded with every output).
4. Blended by default; filtered views are the same engine with extra
   `WHERE` predicates — never a second engine.
5. Auditable — every engine run is recorded.

## Engine catalogue

| Engine | Purpose |
|---|---|
| Sales aggregation | period rollups, channel splits, B2B/B2C breakouts |
| Inventory health | stockout risk, overstock, aging |
| DOS | days-of-stock per SKU per channel |
| Replenishment | reorder quantities, shipment proposals |
| Shipment recommendation | what to ship, when, where |
| PPC analytics | ACOS, TACOS, ROAS, waste, scaling |
| Profitability | per-SKU contribution margin, marketplace P&L |
| Forecasting | demand projection by SKU + channel |
| Anomaly / insight | detection + ranking of operational issues |

## Generic engine query

```typescript
interface EngineQuery {
  workspaceId: WorkspaceId;
  periodStart: Date;            // mandatory time window
  periodEnd: Date;
  // optional filters — any combination narrows the aggregation
  skuNormalized?: string;
  marketplaceCode?: string;
  regionCode?: string;
  fulfillmentType?: string;
  inventoryLocationCode?: string;
  adPlatformCode?: string;
}
```

No filters → blended result across all channels/locations. Filters →
the same metric scoped to one dimension.

## Inventory engine

```typescript
interface InventoryEngineQuery {
  workspaceId: WorkspaceId;
  asOf: Date;
  windowDays: number;           // velocity lookback, default 30
  skuNormalized?: string;
  marketplaceCode?: string;
  regionCode?: string;
  fulfillmentType?: string;
  inventoryLocationCode?: string;
  state?: ReadonlyArray<InventoryState>;
}

interface InventoryPosition {
  skuNormalized: string;
  sellable: number;                       // state='available' sum
  pipeline: {
    inbound: number; transfer: number; processing: number;
    earliestArrivalDate: Date | null;
  };
  reserved: number;
  damagedOrUnsellable: number;
  velocityPerDay: number;                 // from channel_sales over window
  dosBlended: number | null;              // sellable / velocityPerDay
  byDimension?: {
    marketplace?: Array<{ marketplace_code: string; sellable: number; velocity: number; dos: number | null }>;
    location?: Array<{ inventory_location_code: string; sellable: number; reserved: number }>;
  };
}
```

Sums over inventory **must** filter by `inventory_state` — unfiltered
sums are meaningless. "Sellable" = `state='available'`; "pipeline" =
`inbound + transfer + processing` with expected arrival dates.

## Replenishment flow

For each `(workspace × SKU)`:

1. Aggregate sellable inventory per marketplace.
2. Aggregate velocity per marketplace over the lookback window.
3. Compute marketplace-level DOS.
4. Identify low-DOS marketplaces (below `workspace.dos_target_days`).
5. Identify high-inventory owned pools (warehouse + 3PL).
6. Match pools → marketplaces (geography + fulfillment compatibility).
7. Propose: transfers (warehouse → marketplace) and reorders (supplier)
   when `pipeline + sellable < lead_time × velocity × safety_factor`.

Steps 1–6 are SQL aggregations over canonical tables. Step 7 output is
stored in `xb_intelligence.recommendations` with full provenance.

## Reports

Reports are generated **outputs of engines**, not uploaded files.

| Report | Engine source |
|---|---|
| Sales Report | Sales aggregation |
| Ads Report | PPC analytics |
| Inventory Report | Inventory health |
| Warehouse Inventory | Inventory health (coming soon) |

Lifecycle: engine output → report generation → GCS reports bucket →
Reports module → download / archive. Reports auto-archive after 30 days
(PDF removed, metadata kept); analytical data stays permanently in
canonical tables.

## AI augmentation

AI explains engine outputs; AI is never the source of truth. Contract:
engine → numbers, AI → narrative over numbers. Provider-agnostic
(`packages/ai`); free providers (Groq, OpenRouter, Ollama) first, paid
ones drop in later. Core platform must not depend on paid models.
