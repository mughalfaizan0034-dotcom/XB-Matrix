# data-model

Canonical schema rules. Authoritative DDL lives in [`sql/migrations/`](../../sql/migrations/) and [`docs/schema.md`](../schema.md). This doc is the agent-facing summary.

## 1. Schemas

```
xb_core         tenancy, users, permissions, config
xb_master       SKUs, warehouses, FX rates, sku_aliases, unresolved queues
xb_raw          raw ingestion (upload rows + validation errors)
xb_canonical    normalized period-bucketed facts (additive only)
xb_summary      pre-aggregated, rebuildable
xb_intelligence forecasts, insights, recommendations (engine outputs)
xb_reports      generated report metadata
xb_audit        audit_log (monthly partitions, append-only)
xb_ai           providers, conversations, prompts, usage
```

## 2. Conventions

| Concept | Type | Notes |
|---|---|---|
| PK / FK | `char(26)` | ULID, never NULL |
| Money | `numeric(18,4)` | |
| Percent / rate | `numeric(9,6)` | decimal fraction |
| Counts | `bigint` | |
| Days | `numeric(10,2)` | |
| Timestamps | `timestamptz` | UTC |
| Enums | `varchar(N)` + CHECK | NEVER native PG enum |
| Currency | `char(3)` | ISO 4217 |
| Timezone | `varchar(64)` | IANA |
| JSONB | bounded use only | see §10 |

Naming: schemas `xb_<domain>`, tables snake_case plural, columns snake_case singular. Indexes `idx_<t>_<cols>`, unique `uq_<t>_<cols>`, FK `fk_<t>_<ref>`, check `ck_<t>_<concept>`, trigger `trg_<t>_<event>`, function `fn_<purpose>`.

## 3. Standard column packs

| Pack | Columns |
|---|---|
| `PACK_TENANCY_ORG` | `organization_id` |
| `PACK_TENANCY_WS` | `+ workspace_id` |
| `PACK_TIMESTAMPS` | `created_at`, `updated_at` |
| `PACK_SOFT_DELETE` | `deleted_at` |
| `PACK_ACTORS` | `created_by_actor_id`, `updated_by_actor_id`, `deleted_by_actor_id` |
| `PACK_ROW_VERSION` | `row_version int default 1` |
| `PACK_SOURCE` | `source_upload_id`, `source_system`, `ingested_at` |
| `PACK_ENGINE_VERSION` | `engine_key`, `engine_version`, `generated_at` |

NULL policy: every column NOT NULL unless nullability is meaningful. Empty string / zero ≠ NULL.

## 4. Multi-tenancy + RLS

- App filter: every query by `organization_id` (+ `workspace_id`).
- DB backstop: RLS policy on `organization_id` reading `app.current_organization_id`. Bypass = `app.is_internal_manager = 'true'`.
- Workspace authz NOT in RLS — handled by resolver.
- Platform-global (no RLS): `organizations`, `internal_users`, `internal_permissions`, `feature_flags`, `module_definitions`, `engines`, `ai_*`.

## 5. Optimistic locking

`row_version int NOT NULL DEFAULT 1`. `fn_increment_row_version()` BEFORE UPDATE. PUT/PATCH require `If-Match: <row_version>`; UPDATE `WHERE row_version = :expected`. 0 rows → 409.

Tables with `row_version`: `workspaces`, `users`, `actors`, `workspace_permissions`, `page_permissions`, `internal_permissions`, `forecast_rules`, `feature_flag_overrides`, `module_enablement`, `shipments`, `insights`, `recommendation_overrides`.

Without `row_version`: append-only, canonical period tables, summary tables, reports.

## 6. Deletion lifecycle (canonical)

| State | Fields |
|---|---|
| `active` | `deleted_at IS NULL`, `purged_at IS NULL` |
| `soft_deleted` | `deleted_at IS NOT NULL`, recoverable |
| `purge_scheduled` | `deleted_at` + 90d elapsed, queued for purge orchestrator |
| `purged` | `purged_at IS NOT NULL`, audit FKs `ON DELETE SET NULL` |

- Separate `deleted_at` + `purged_at`. Never reuse one for both.
- Centralized purge orchestrator. Per-service ad-hoc deletes forbidden.
- Audit FKs → `ON DELETE SET NULL`, never CASCADE.
- Protected entities (self row, `super_admin`) never purgeable — enforced backend-first.
- UI copy: "Move to recycle bin" / "Restore" / "Permanently delete".
- Distinct from legal/compliance erasure (separate workflow).

Exempt from soft-delete: `audit_log`, raw uploads, usage logs, canonical period tables (UPSERT by composite key), summary tables (rebuildable), forecast outputs.

## 7. Canonical tables (`xb_canonical.*`)

Additive facts only. No derivation. Engines compute on top.

### channel_sales (period-grain, monthly partition on `period_start`)

Dimensions: `sku_normalized`, `marketplace_code`, `region_code`, `fulfillment_type`, `brand_normalized` (nullable), `source_platform`, `source_account`.

Metrics (additive): `sessions_total/_b2b`, `orders_total/_b2b`, `units_total/_b2b`, `sales_total/_b2b`, `refunds_total/_b2b`, `currency_code`.

Natural key UNIQUE: `(workspace_id, sku_normalized, marketplace_code, region_code, fulfillment_type, period_start, period_end, source_platform, source_account)`.

### channel_inventory (point-in-time on `position_date`, monthly partition)

One row per `(sku × marketplace × inventory_location_code × inventory_state × ownership)` with `quantity`. `linked_shipment_id` ties inbound/transfer rows to shipment movements.

Single inventory table — FBA, FBM, 3PL, owned warehouse, retail all here, distinguished by `fulfillment_type` + `inventory_location_code`. No separate `fba_inventory`.

Inventory states (controlled vocab):

| State | Sellable |
|---|---|
| `available` | ✅ |
| `reserved` | ❌ promised to open orders |
| `inbound` | ❌ in transit |
| `damaged` | ❌ |
| `transfer` | ❌ mid-move |
| `processing` | ❌ FBA receiving / 3PL putaway |
| `unsellable` | ❌ FBA unfulfillable / quarantined |

### channel_ads (period-grain, monthly partition)

Dimensions: `ad_platform_code`, `target_marketplace_code`, `region_code`, `campaign_name`, `campaign_type`, `sku_normalized` (nullable for brand campaigns), `brand_normalized` (nullable), **`attribution_window_days`** (first-class dimension; nullable for legacy).

Additive metrics ONLY: `impressions`, `clicks`, `attributed_orders`, `spend`, `attributed_sales`, `currency_code`. Derived metrics (ACOS/TACOS/ROAS/CPC/CTR/CVR) = engine outputs.

Natural key includes `attribution_window_days` + every dimension. Re-uploads UPSERT.

### expenses (gated — Expenses phase)

`xb_canonical.expenses` — additive expense rows by SKU / marketplace / brand / category / period. Feeds profitability engine.

## 8. SKU identity (`xb_master.sku_aliases`)

- Maps platform code (Amazon ASIN/seller-SKU, Walmart item ID, Shopify variant, internal SKU) → `sku_normalized`.
- `resolveSku()` runs in mapper. Canonical stores `sku_normalized` only.
- No aliasing for `brand_normalized` in v1.

## 9. Unresolved queues (`xb_master.unresolved_sku_rows`)

- First-class operator workflow.
- Expect assignment, AI-assist, confidence scoring, bulk resolution.
- Not scaffolding — protect this surface in roadmap planning.

## 10. JSONB boundaries

Permitted only:
- `audit_log.{before_state, after_state, metadata}`
- `insights.payload`
- `recommendation_overrides.override_payload`
- `forecast_outputs.model_metadata`
- `upload_validation_errors.raw_row_snapshot`
- `ai_messages.{content, tool_calls}`
- `ai_usage_logs.{request_metadata, response_metadata}`
- `idempotency_keys.response_body`

Rule: if you can imagine a `WHERE` against the field, it is a column, not a JSONB key.

## 11. Partitioning + retention

| Table | Partition col | Retention |
|---|---|---|
| `xb_audit.audit_log` | `occurred_at` | 30d hot → BigQuery |
| `xb_canonical.channel_sales` | `period_start` | indefinite |
| `xb_canonical.channel_ads` | `period_start` | indefinite |
| `xb_canonical.channel_inventory` | `position_date` | indefinite |
| `xb_intelligence.insights` | `generated_at` | 1y hot → BigQuery |
| `xb_raw.upload_validation_errors` | `created_at` | 30d |

Reports PDF: 30d hot (GCS), metadata kept. Soft-deleted rows: 90d → purge. AI conversations: 90d. AI usage logs: 1y → BigQuery. Canonical commerce data: NEVER deleted by retention.

## 12. Currency normalization

- Each canonical row stores `currency_code` (ISO 4217).
- FX conversion lives in `xb_master.fx_rates` (per day, per source).
- Engines convert at query time using workspace `default_currency_code` + period FX.
- Frontend never converts.

## 13. Time-grain strategy

- Canonical = period-grain (day / week / month) with `period_start` + `period_end`.
- UPSERT on natural key including period bounds.
- Engines re-aggregate from day-grain when possible.
- Inventory = point-in-time on `position_date`.

## 14. Workspace settings driving math

- `workspaces.dos_target_days numeric(6,2)` — replenishment threshold.
- `workspaces.default_currency_code` — engine output currency.
- `workspaces.timezone` — period-boundary interpretation.
- `forecast_rules` — per-workspace forecast configuration.

## 15. Legacy reconciliation

| Old | Replace with | Status |
|---|---|---|
| `xb_canonical.sales_orders` | `channel_sales` | bridge via mapper, drop when unused |
| `xb_canonical.inventory_snapshots` | `channel_inventory` | bridge via mapper, drop when unused |

Layer-replace, never co-evolve.

## Cross-refs

[architecture](architecture.md) · [engines](engines.md) · [backend-standards](backend-standards.md) · `docs/schema.md` · `docs/pipeline.md`
