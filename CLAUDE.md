# CLAUDE.md — XB Matrix project context

> **Read this file before making changes.** It captures the master
> application flow and the canonical PostgreSQL schema spec for the
> XB Matrix platform. Both sections are authoritative — any work that
> diverges from them should call that out explicitly and pause for
> sign-off.

This file has two parts:

1. **Master Application Flow & Architecture** — what the product does,
   the module structure, the user model, the data lanes, and the
   architectural rules.
2. **Spec 3: Canonical PostgreSQL Schema** — the physical schema
   definition. Tables, RLS, audit, partitioning, indexing.

The spec was provided in messages dated 2026-05-20 and supersedes any
earlier informal schema decisions made during build-out. If a recently
shipped table doesn't match these specs (e.g., `xb_canonical.sales_orders`
in the codebase vs `xb_canonical.sales_performance_period` here), the
codebase is wrong and needs to be aligned.

---

# Part 1 — Master Application Flow & Architecture

## Platform positioning

**XB Matrix — Commerce Intelligence & Operations Platform.**

A centralized SaaS platform for:

- sales intelligence
- PPC analytics
- inventory intelligence
- WMS operations
- forecasting
- replenishment planning
- shipment tracking
- unit economics
- operational recommendations

The platform is **SKU-centric**. All business intelligence is powered by
centralized backend calculation engines.

### Responsibility split

| Layer | Responsibility |
|---|---|
| Frontend | rendering data, navigation, workflows, charts, filtering |
| Backend  | calculations, forecasting, pivots, summaries, recommendations, profitability, operational intelligence |

**Foundational architectural rule:** ALL calculations are centralized in
backend services. Frontend NEVER calculates TACOS, DOS, forecasting,
profitability, recommendations, or unit economics. Frontend ONLY renders
backend-generated intelligence. This is the rule for scalability.

## Core platform hierarchy

```
Platform
   ↓
Organizations
   ↓
Workspaces
   ↓
Modules
   ↓
Pages
   ↓
Tabs
```

## User types

### 1. Internal platform users (XB Matrix operational staff)

Roles:

- **Manager** — auto EDIT access to all organizations
- **Staff** — default NONE access; managers assign view/edit per org

### 2. Organization users (client-side)

Roles:

- **Admin** — auto EDIT access to all workspaces
- **User** — default NONE access to all workspaces

## Authentication flow

### Login page fields

- Username
- Password
- Remember This Device

### Login flow

```
Login
→ validate credentials
→ restore session
→ load organizations
→ load accessible workspaces
→ load permissions
→ build sidebar
→ load dashboard
```

### Remember device flow

If enabled: long-lived refresh token + device persistence + silent session restore.

## Internal platform flow

### Internal sidebar

- Organizations
- Internal Users
- Diagnostics
- Background Jobs
- System Health

### Organizations page

Manage all customer organizations.

Table columns: Organization Name, Status, Billing Status, Users Count,
Workspaces Count, Created Date, Actions.

Actions: Open Organization, Edit Organization, Suspend, Archive.

### Internal Users page

Manage XB Matrix staff.

Table columns: Username, Display Name, Role, Assigned Organizations,
Status, Last Login, Actions.

Actions:

- **Edit User** — username, display name, password reset, deactivate
- **Manage Permissions** — opens permissions popup

### Internal permissions popup

Columns: Organization, Status, None, View, Edit. Search bar on top.

Bulk actions: Assign View to All, Assign Edit to All, Remove All Access.

## Organization user flow

### Settings module tabs

- Organization
- Workspaces
- Users
- Warehouses
- Forecast Rules
- Upload Templates
- Diagnostics

### Workspaces page

Manage operational workspaces.

Table columns: Workspace Name, Type, Users Count, Status, Created Date,
Actions.

Workspace types: `marketplace`, `dtc`, `warehouse`, `omni_channel`.

#### Create workspace fields

- Workspace Name
- Workspace Type
- Default Currency
- DOS Target
- Forecast Rules

### Users page

Manage organization users.

Table columns: Username, Display Name, Role, Accessible Workspaces,
Status, Last Login, Actions.

#### User actions

- **Edit User** — username, display name, password reset, deactivate
- **Manage Permissions**

#### Workspace permissions popup

Columns: Workspace, None, View, Edit, Custom. Search bar on top. Bulk
actions: Assign View to All, Assign Edit to All, Remove All Access.

#### Access level logic

| Level | Meaning |
|---|---|
| NONE | Workspace hidden completely |
| VIEW | View access to ALL pages |
| EDIT | Edit access to ALL pages |
| CUSTOM | System-generated only; triggered automatically when mixed page permissions exist. Cannot be manually selected. |

#### Page-level drilldown

Expandable workspace rows show a page permissions table with columns:
Page, None, View, Edit.

Pages: Dashboard, Sales, Inventory, PPC, Forecasting, Shipments, Reports,
Uploads, Unit Economics, Insights.

#### Custom access logic

```
IF all pages = View → workspace = View
IF all pages = Edit → workspace = Edit
IF mixed permissions → workspace = Custom
```

## Main application layout

### Left sidebar

Dashboard · Sales · Inventory · Shipments · PPC · Forecasting · Unit
Economics · Reports · Uploads · Insights · Settings.

### Top bar

- Organization Selector
- Workspace Selector
- Date Range Selector
- Global Search

### Global search

Search across: SKU, shipment, campaign, order, report.

## Module structure (every module)

```
Header
  ↓
KPI Strip
  ↓
Inner Tabs
  ↓
Content Area
```

---

## 1. Dashboard module

Executive command center.

### KPI strip

- Sales KPIs: Revenue, Orders, Units Sold, Sessions, Conversion
- PPC KPIs: Spend, ACOS, TACOS, ROAS
- Inventory KPIs: Available, Receiving, Reserved, FC Transfer, Low Stock
- Shipment KPIs: In Transit, Delayed, Delivered

### Dashboard tabs

Overview · Sales Trends · Inventory Health · PPC Performance ·
Recommendations.

### Content blocks

- **Alerts** — stockout risks, overstock, PPC inefficiencies, shipment delays
- **Graphs** — sales trends, PPC trends, inventory trends
- **Marketplace Breakdown**

## 2. Sales module

Demand intelligence.

### KPI strip

Revenue, Orders, Units, Sessions, Conversion, Refunds.

### Sales tabs

Overview · SKU Performance · Marketplace Analytics · Trend Analysis ·
Profitability Trends.

### SKU table columns

SKU, Revenue, Orders, Units, Sessions, Conversion, TACOS, DOS.

## 3. Inventory module

Inventory intelligence.

### KPI strip

Available, Reserved, Receiving, FC Transfer, Damaged.

### Inventory tabs

Inventory Overview · WMS · FBA Inventory · DOS Planning · Replenishment ·
Inventory Aging.

### DOS table columns

SKU, Available, DOS Actual, DOS Total, Velocity, Suggested Shipment,
Stockout Date.

## 4. Shipments module

Shipment intelligence.

### KPI strip

In Transit, Receiving, Delayed, Delivered.

### Shipment tabs

FBA Shipments · DTC Transfers · Container Tracking · Receiving ·
Shipment Planning.

### Shipment table columns

Shipment ID, Ship From, Ship To, SKU, Quantity, Transport Mode, ETA, Status.

## 5. PPC module

Advertising intelligence.

### KPI strip

Spend, Sales, ROAS, ACOS, TACOS, CTR, CPC.

### PPC tabs

Overview · Campaigns · Platform Performance · Waste Analysis · Scaling
Opportunities · Inventory-Aware PPC.

### PPC table columns

Campaign, SKU, Platform, Target Platform, Spend, Sales, ACOS, ROAS.

## 6. Forecasting module

Demand planning and replenishment.

### KPI strip

Forecasted Demand, Inventory Coverage, Reorder Requirement, Forecast Accuracy.

### Forecasting tabs

Demand Planning · Reorder Planning · Shipment Planning · Seasonal
Trends · Inventory Simulations.

## 7. Unit Economics module (future core module)

Profitability intelligence.

### KPI strip

Gross Profit, Net Profit, Margin %, ROI, Contribution Margin,
Break-even ROAS.

### Unit Economics tabs

Overview · SKU Profitability · Marketplace Profitability · Cost Structure ·
Pricing Recommendations · Profit Simulations.

### Future cost inputs

COGS · PPC spend · referral fees · FBA fees · shipping costs · prep
costs · storage fees · refunds.

### Future outputs

Suggested Pricing · Target ROI Pricing · Break-even PPC · Margin
Analysis · Contribution Margin.

## 8. Reports module

Executive report generation.

### Create report section

Controls: report type, date range, generate button. The generate button
is disabled until a date range is selected.

### Report history table columns

Generated Date, Report Type, Date Range, Status, Download, Archive Status.

### Report status values

Queued · Processing · Completed · Failed · Archived.

### Report content sections

Executive Summary · Sales Performance · Marketplace Breakdown · PPC
Performance · Inventory Health · Risks & Recommendations.

### Auto archival

Reports automatically archive after retention period. Archived reports:
metadata retained, PDF removed from storage.

## 9. Uploads module

Data ingestion center.

### Upload tabs

Upload Files · Upload History · Validation Errors · Templates ·
Processing Logs.

### Sales template columns

`action`, `uid`, `start_date`, `end_date`, `channel`, `sku`,
`sessions_total`, `sessions_b2b`, `orders_total`, `orders_b2b`,
`units_total`, `units_b2b`, `sales_total`, `sales_b2b`, `refunds_total`,
`refunds_b2b`.

### Ads template columns

`action`, `uid`, `start_date`, `end_date`, `campaign_name`,
`campaign_type`, `sku_name`, `impressions`, `clicks`, `orders`,
`total_cost`, `sales`, `currency`, `platform`, `target_platform`.

### Inventory template columns

`action`, `uid`, `date`, `channel`, `sku`, `total`, `receiving`,
`fc_transfer`, `reserved`, `damaged`.

### Shipment entity fields

`shipment_id`, `ship_from`, `ship_to`, `sku`, `quantity`,
`shipment_type`, `transport_mode`, `origin`, `destination`, `ship_date`,
`estimated_transit_days`, `estimated_receiving_days`,
`estimated_arrival_date`, `status`.

## 10. Insights module

Operational action center.

### Insight types

Stockout Risks · Overstock Risks · PPC Opportunities · Shipment
Recommendations · Forecast Warnings · Marketplace Growth Signals.

## Core backend architecture

### Raw tables

`sales_raw` · `ads_raw` · `inventory_raw` · `shipments_raw`.

### Canonical tables

`sales_performance_period` · `ppc_performance_period` ·
`inventory_positions` · `shipment_tracking`.

### Summary tables

`dashboard_summary` · `inventory_summary` · `ppc_summary` ·
`forecasting_summary` · `profitability_summary`.

### Core engines

Sales Intelligence · Inventory Intelligence · PPC Intelligence ·
Shipment Intelligence · Forecasting · Recommendation · Unit Economics.

### Core platform rule (repeat for emphasis)

ALL calculations centralized in backend services. Frontend NEVER
calculates TACOS, DOS, forecasting, profitability, recommendations, or
unit economics. Frontend ONLY renders backend-generated intelligence.

---

# Part 2 — Spec 3: Canonical PostgreSQL Schema

**Status:** Draft for review · **Version:** 1.0.0 · **Owner:** Platform
Architecture · **Depends on:** Spec 1 (Data Dictionary), Spec 2
(Permission Truth Table) · **Consumed by:** Specs 4–10, every backend
service, every migration.

## 0. Purpose

Translates Spec 1 entities into the physical PostgreSQL schema. Defines:

- DDL for every operational table
- RLS policies enforcing tenant isolation
- Audit infrastructure (triggers + application events)
- Partitioning for high-volume tables
- Indexing for known access patterns
- Soft-delete, optimistic locking, idempotency patterns
- JSONB usage boundaries
- Retention/archival policies
- Engine-version awareness for intelligence outputs
- Schema-level support for AI provider abstraction

**This spec is authoritative.** If a table/column/constraint/index
appears here, it ships. If not, it does not exist in v1. New tables
require a Spec 3 amendment, not ad-hoc migrations.

## 1. Schema-level conventions

### 1.1 Naming

| Element | Convention | Example |
|---|---|---|
| Schemas | `xb_<domain>` | `xb_core`, `xb_canonical`, `xb_summary`, `xb_audit`, `xb_ai` |
| Tables | snake_case, plural | `workspaces`, `sales_performance_period` |
| Columns | snake_case, singular | `organization_id`, `sku_normalized` |
| Index names | `idx_<table>_<columns>` | `idx_workspaces_org_id` |
| Unique indexes | `uq_<table>_<columns>` | `uq_users_email` |
| FK constraints | `fk_<table>_<ref_table>` | `fk_workspaces_organizations` |
| Check constraints | `ck_<table>_<concept>` | `ck_users_role_kind_consistency` |
| Triggers | `trg_<table>_<event>` | `trg_workspaces_audit` |
| Functions | `fn_<purpose>` | `fn_audit_row_change` |
| Sequences | not used (ULIDs only) | — |

### 1.2 Schema layout

```
xb_core         — tenancy, users, permissions, configuration
xb_master       — SKUs, warehouses, FX rates
xb_raw          — raw ingestion tables (from uploads)
xb_canonical    — normalized period-bucketed facts
xb_summary      — pre-aggregated UI-facing tables
xb_intelligence — forecasts, insights, recommendations
xb_reports      — generated reports metadata
xb_audit        — audit log (partitioned)
xb_ai           — AI infrastructure (provider registry, conversations, prompts)
```

Reasons for splitting: different backup/archive cadences per schema,
clearer ownership boundaries, simpler schema-level permission grants,
cleaner future service extraction.

### 1.3 Type standards

| Concept | Postgres type | Notes |
|---|---|---|
| Primary key | `char(26)` | ULID, never NULL |
| Foreign key | `char(26)` | Matches PK |
| Display strings | `varchar(N)` | Bounded length per Spec 1 |
| Long text | `text` | Notes, descriptions |
| Money | `numeric(18,4)` | See Spec 1 §1.4 |
| Percentage / rate | `numeric(9,6)` | Decimal fraction |
| Ratio | `numeric(12,4)` | |
| Counts | `bigint` | Future-proof |
| Days / lead times | `numeric(10,2)` | |
| Timestamps | `timestamptz` | UTC |
| Dates | `date` | Workspace-local interpretation |
| Booleans | `boolean` | Never nullable except where genuinely tri-state |
| Enums | `varchar(N)` + CHECK | Not native PG enums — see §1.4 |
| JSONB | `jsonb` | Bounded to specific extensibility purposes (§7) |
| Currency codes | `char(3)` | ISO 4217 |
| Timezone | `varchar(64)` | IANA name |

### 1.4 Enums

Native Postgres enums are **not used**. Every controlled vocabulary is
`varchar` + CHECK. Rationale: adding values to a PG enum requires
migration + locks the table; removing is effectively impossible;
`varchar + CHECK` allows additions via simple constraint replacement.

Pattern:

```sql
column_name varchar(40) NOT NULL,
CONSTRAINT ck_table_columnname CHECK (column_name IN ('value_a','value_b','value_c'))
```

### 1.5 NULL policy

- Every column is `NOT NULL` unless nullability is meaningful.
- "Empty string" and "zero" are not substitutes for NULL.
- Nullable foreign keys are explicit ("the entity may not have an X").
- `deleted_at`, `archived_at`, similar lifecycle timestamps are
  nullable by definition.

### 1.6 Time defaults

- `created_at` defaults to `now()` (UTC).
- `updated_at` is maintained by a trigger (`fn_touch_updated_at`).
- `deleted_at` is set explicitly by soft-delete operations.

### 1.7 Connection context contract

Every DB connection sets per-request context BEFORE executing queries.
RLS policies and audit triggers read these.

```sql
SET LOCAL app.current_organization_id = '<org_ulid>';
SET LOCAL app.current_actor_id        = '<actor_ulid>';
SET LOCAL app.current_actor_kind      = '<actor_kind>';
SET LOCAL app.current_request_id      = '<request_ulid>';
SET LOCAL app.current_session_id      = '<session_ulid>';
SET LOCAL app.is_internal_manager     = 'true' | 'false';
```

Rules:

- `SET LOCAL` (transaction-scoped, no pool leakage).
- Internal Manager flag enables RLS bypass (with audit).
- A connection without `app.current_organization_id` can read only
  platform-global tables.
- Missing context is a programming error, not a permission failure.

### 1.8 Standard column packs

| Pack | Columns |
|---|---|
| `PACK_TENANCY_ORG` | `organization_id char(26) NOT NULL` |
| `PACK_TENANCY_WS` | `organization_id char(26) NOT NULL, workspace_id char(26) NOT NULL` |
| `PACK_TIMESTAMPS` | `created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()` |
| `PACK_SOFT_DELETE` | `deleted_at timestamptz NULL` |
| `PACK_ACTORS` | `created_by_actor_id char(26) NULL, updated_by_actor_id char(26) NULL, deleted_by_actor_id char(26) NULL` |
| `PACK_ROW_VERSION` | `row_version integer NOT NULL DEFAULT 1` |
| `PACK_SOURCE` | `source_upload_id char(26) NULL, source_system varchar(50) NOT NULL DEFAULT 'manual_upload', ingested_at timestamptz NOT NULL DEFAULT now()` |
| `PACK_ENGINE_VERSION` | `engine_key varchar(80) NOT NULL, engine_version varchar(40) NOT NULL, generated_at timestamptz NOT NULL DEFAULT now()` |

When a DDL block says "uses: PACK_TENANCY_WS, PACK_TIMESTAMPS, …" the
columns are present with those types and defaults.

## 2. Multi-tenancy & RLS architecture

### 2.1 Two-layer enforcement

| Layer | Mechanism | Purpose |
|---|---|---|
| Application | Every query filters by `organization_id` (and `workspace_id` where applicable) | Primary correctness, performance, query planning |
| Database | RLS policies on every tenant-scoped table | Backstop against application bugs |

If the application forgets a filter, RLS prevents the leak. If RLS is
misconfigured, the app filter prevents the leak. Both must independently
be correct.

### 2.2 RLS scope

RLS enforces **organization-level isolation only**. Workspace and page
authorization remain in the resolver (Spec 2). Rationale: org isolation
is a security boundary; workspace/page authz is business logic that
changes more often; encoding resolver logic in SQL would couple the DB
to the resolver; PG performance with complex RLS degrades under load.

### 2.3 Standard RLS policy

Every tenant-scoped table receives:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;

CREATE POLICY p_<table>_tenant_isolation
  ON <table>
  USING (
    organization_id = current_setting('app.current_organization_id', true)::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK (
    organization_id = current_setting('app.current_organization_id', true)::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  );
```

- `FORCE ROW LEVEL SECURITY` applies policies even to table owners.
- `current_setting(..., true)` returns NULL if unset (no error). NULL
  fails the policy → zero rows.
- `is_internal_manager = 'true'` is the **only** RLS bypass.
- `WITH CHECK` ensures writes cannot insert into other orgs.

### 2.4 Platform-global tables (no RLS)

Cross-tenant data, read-only for normal API requests:

- `organizations` (the tenancy root itself)
- `internal_users`
- `internal_permissions` (joins internal users to orgs)
- `feature_flags` (definitions; overrides are tenant-scoped)
- `module_definitions`
- `engines` (registry)
- `ai_provider_registry`
- `ai_prompt_templates`

Access gated by role checks in the app, not RLS.

### 2.5 Workspace-scoped tables within an org

Tables with `workspace_id` are still tenant-scoped at the org level for
RLS. Workspace check happens in the resolver. RLS does not enforce
workspace isolation.

Rationale: a single user often legitimately queries multiple workspaces
(e.g., cross-workspace dashboard summary). The app/resolver layer
determines which workspaces the user can see; RLS only stops cross-org
access.

## 3. Soft delete pattern

### 3.1 Pattern

Every soft-deletable table has `deleted_at timestamptz NULL` +
`deleted_by_actor_id char(26) NULL`.

### 3.2 Default visibility

Application code reads through a query layer that adds
`WHERE deleted_at IS NULL` by default. Explicit opt-in required to see
soft-deleted rows (audit/recovery flows, manager support tools, restore
operations).

### 3.3 Soft delete triggers audit

A row update where `deleted_at` goes NULL → non-NULL generates a
`record.soft_deleted` audit entry via the audit trigger.

### 3.4 Hard purge

After 90 days, a controlled purge job hard-deletes rows where
`deleted_at < now() - interval '90 days'`. The purge job:

- Cloud Scheduler-triggered worker
- Writes `record.hard_deleted` audit entry BEFORE deletion
- Operates in batches with explicit limits
- Skips rows referenced by unarchived audit entries (preserves traceability)
- Never purges `audit_log` rows

Soft delete is **not** used on: append-only tables (audit_log, raw
upload tables, usage logs), canonical period tables (upserted via
`action=delete` in canonical transform), summary tables (rebuildable),
forecast outputs (kept indefinitely).

## 4. Optimistic locking

### 4.1 Pattern

Tables that need it carry: `row_version integer NOT NULL DEFAULT 1`.

### 4.2 Trigger

```sql
CREATE OR REPLACE FUNCTION fn_increment_row_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.row_version := OLD.row_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_<table>_row_version
  BEFORE UPDATE ON <table>
  FOR EACH ROW
  EXECUTE FUNCTION fn_increment_row_version();
```

### 4.3 API contract

PUT/PATCH endpoints on these resources require the `If-Match:
<row_version>` header. The handler:

```sql
UPDATE <table>
SET ...
WHERE id = :id
  AND row_version = :expected_row_version
  AND deleted_at IS NULL;
-- If 0 rows updated: return 409 Conflict
```

Tables with `row_version`: `workspaces`, `users`, `actors`,
`workspace_permissions`, `page_permissions`, `internal_permissions`,
`forecast_rules`, `feature_flag_overrides`, `module_enablement`,
`shipments`, `insights`, `recommendation_overrides`.

Tables explicitly without `row_version`: all append-only (audit, usage
logs, raw uploads), canonical period tables (upsert by composite key),
summary tables (rebuildable), reports (immutable post-generation except
for archival).

## 5. Audit architecture

### 5.1 Two-layer audit

| Layer | Mechanism | Captures |
|---|---|---|
| Data audit | PG trigger on tracked tables | Every INSERT/UPDATE/DELETE — before, after, actor, request |
| Operation audit | Application-layer writes | Business-meaningful events: `permission.granted`, `module.enabled`, `report.generated`, `ai_recommendation.acknowledged` |

Both write to the same `audit_log` table. Different `operation` values
distinguish them.

### 5.2 The trigger function

```sql
CREATE OR REPLACE FUNCTION fn_audit_row_change()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_id    char(26) := current_setting('app.current_actor_id', true)::char(26);
  v_actor_kind  varchar(40) := current_setting('app.current_actor_kind', true);
  v_request_id  char(26) := current_setting('app.current_request_id', true)::char(26);
  v_org_id      char(26);
  v_ws_id       char(26);
  v_entity_id   char(26);
  v_operation   varchar(80);
  v_before      jsonb;
  v_after       jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_before := to_jsonb(OLD);
    v_after := NULL;
    v_org_id := OLD.organization_id;
    v_ws_id := CASE WHEN to_jsonb(OLD) ? 'workspace_id' THEN OLD.workspace_id ELSE NULL END;
    v_operation := 'record.hard_deleted';
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := NEW.id;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    v_org_id := NEW.organization_id;
    v_ws_id := CASE WHEN to_jsonb(NEW) ? 'workspace_id' THEN NEW.workspace_id ELSE NULL END;
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_operation := 'record.soft_deleted';
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      v_operation := 'record.restored';
    ELSE
      v_operation := 'record.updated';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_entity_id := NEW.id;
    v_before := NULL;
    v_after := to_jsonb(NEW);
    v_org_id := NEW.organization_id;
    v_ws_id := CASE WHEN to_jsonb(NEW) ? 'workspace_id' THEN NEW.workspace_id ELSE NULL END;
    v_operation := 'record.created';
  END IF;

  INSERT INTO xb_audit.audit_log (
    id, organization_id, workspace_id, actor_id, actor_kind,
    operation, entity_kind, entity_id, before_state, after_state,
    metadata, occurred_at
  ) VALUES (
    gen_ulid(),
    v_org_id, v_ws_id, v_actor_id, v_actor_kind,
    v_operation, TG_TABLE_NAME, v_entity_id, v_before, v_after,
    jsonb_build_object('request_id', v_request_id, 'trigger', true),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

### 5.3 Operation audit (application layer)

For business-meaningful events, the application explicitly writes audit
entries with richer context. Operation values use the reserved list
from Spec 1 §3.4 (plus the `module.enabled`/`module.disabled` split
amendment below).

### 5.4 Spec 1 Amendment (audit operation names)

**Amendment 1.A** — Module vs Flag audit operations are now distinct:

- Previously: `feature_flag.toggled` (covered both)
- Now: `module.enabled` / `module.disabled`; `feature_flag.enabled` / `feature_flag.disabled`

### 5.5 Audit immutability

The `audit_log` table has no UPDATE or DELETE policy (RLS denies these
explicitly), no soft-delete column, is append-only by design, partitioned
by month. Hot partitions (current + previous month) live in PG; older
partitions are detached and archived to BigQuery (Spec 4).

```sql
ALTER TABLE xb_audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE xb_audit.audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY p_audit_log_no_update ON xb_audit.audit_log
  FOR UPDATE USING (false);

CREATE POLICY p_audit_log_no_delete ON xb_audit.audit_log
  FOR DELETE USING (false);

CREATE POLICY p_audit_log_read ON xb_audit.audit_log
  FOR SELECT USING (
    organization_id = current_setting('app.current_organization_id', true)::char(26)
    OR organization_id IS NULL
    OR current_setting('app.is_internal_manager', true) = 'true'
  );

CREATE POLICY p_audit_log_insert ON xb_audit.audit_log
  FOR INSERT WITH CHECK (true);
```

## 6. Partitioning strategy

### 6.1 Tables partitioned by month

| Table | Partition column | Strategy | Retention in PG |
|---|---|---|---|
| `xb_audit.audit_log` | `occurred_at` | RANGE by month | 30 days hot; older detached to BigQuery |
| `xb_canonical.sales_performance_period` | `period_start` | RANGE by month | Indefinite (operational source of truth) |
| `xb_canonical.ppc_performance_period` | `period_start` | RANGE by month | Indefinite |
| `xb_canonical.inventory_position` | `position_date` | RANGE by month | Indefinite |
| `xb_intelligence.insights` | `generated_at` | RANGE by month | 1 year hot; older archived to BigQuery |
| `xb_raw.upload_validation_errors` | `created_at` | RANGE by month | 30 days; archived with parent upload |

### 6.2 Partition naming

`<schema>.<table>_y<YYYY>m<MM>` — e.g., `xb_audit.audit_log_y2026m05`.

### 6.3 Automated partition management

Use `pg_partman`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_partman;

SELECT partman.create_parent(
  p_parent_table => 'xb_audit.audit_log',
  p_control      => 'occurred_at',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 6
);

UPDATE partman.part_config
SET retention = '30 days',
    retention_keep_table = true,
    retention_keep_index = false
WHERE parent_table = 'xb_audit.audit_log';
```

Detached partitions remain on disk until the archival job exports them
to BigQuery, after which they're dropped (Spec 4).

### 6.4 Partition-aware indexing

Indexes declared on the parent propagate to partitions automatically.

### 6.5 Querying partitioned tables

All queries must include the partition key in WHERE for partition
pruning. API endpoints querying these must enforce time bounds.

## 7. JSONB usage boundaries

JSONB is permitted in **only**:

| Table | Column | Purpose |
|---|---|---|
| `xb_audit.audit_log` | `before_state`, `after_state`, `metadata` | Append-only snapshots; analytical queries |
| `xb_intelligence.insights` | `payload` | Engine-specific structured context (DOS breakdown, confidence factors) |
| `xb_intelligence.recommendation_overrides` | `override_payload` | Why the user overrode + their alternative |
| `xb_intelligence.forecast_outputs` | `model_metadata` | Engine internals |
| `xb_raw.upload_validation_errors` | `raw_row_snapshot` | Bad row content for user debugging |
| `xb_ai.ai_messages` | `content`, `tool_calls` | LLM-shaped data |
| `xb_ai.ai_usage_logs` | `request_metadata`, `response_metadata` | Provider-shaped data |
| `xb_core.idempotency_keys` | `response_body` | Cached HTTP response |

JSONB is **prohibited** for: operational data that needs to be queried/
joined/aggregated/filtered routinely; data on which engines compute
metrics; permissions, configuration, billing; anything that should
appear in summary tables.

**Rule:** If you can imagine writing a SQL `WHERE` clause against the
field, it should be a column, not a JSONB key.

JSONB indexes only when access patterns demand:

```sql
CREATE INDEX idx_insights_payload_severity
  ON xb_intelligence.insights ((payload->>'severity_score'))
  WHERE deleted_at IS NULL;
```

## 8. Indexing strategy

### 8.1 Categories

| Category | Pattern | Examples |
|---|---|---|
| Primary | Every table has PRIMARY KEY on `id` | All |
| Tenancy | Index on `organization_id` (and `workspace_id`) | Most |
| Foreign key | Index on every FK column | All FK columns |
| Soft delete | Partial indexes `WHERE deleted_at IS NULL` | Most tables |
| Lookup | Composite indexes for known query patterns | Per-table |
| Uniqueness | Unique indexes for business uniqueness rules | Per-table |

### 8.2 Standard tenant-scoped index

```sql
CREATE INDEX idx_<table>_org ON <table> (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_<table>_org_ws ON <table> (organization_id, workspace_id) WHERE deleted_at IS NULL;
```

### 8.3 ULID sort-order indexes

ULIDs are time-ordered, so `(organization_id, id DESC)` is a natural
pagination index that doubles as a time-ordered scan:

```sql
CREATE INDEX idx_<table>_org_id_desc
  ON <table> (organization_id, id DESC)
  WHERE deleted_at IS NULL;
```

## 9. Retention & archival policy

| Data Class | PG Retention | Archive Target | Hard Delete |
|---|---|---|---|
| Audit log | 30 days hot | BigQuery (cold) | Never |
| Validation errors | Linked to upload (30d) | With upload archival | Yes, after 30d |
| Reports (PDF) | 30 days hot (GCS) | Cold GCS or removed | PDF only; metadata kept |
| Soft-deleted rows | 90 days | Audit preserves history | Yes, after 90d |
| Insights | 1 year hot | BigQuery (cold) | Never (archive instead) |
| Forecast outputs | Indefinite | None | Never |
| Canonical operational data | Indefinite | None (source of truth) | Never |
| Summary tables | Live, rebuildable | None | N/A (rebuildable) |
| AI conversations | 90 days hot | Optional BigQuery export | Configurable per org |
| AI usage logs | 1 year hot | BigQuery (cold) | Never |

**Critical rule:** Canonical commerce data is **never** deleted by
retention policies. Only logs, files, generated artifacts, and
soft-deleted records are subject to retention purges. Sales, PPC,
inventory, and shipment history persist for the life of the organization.

## 10. Table DDL — Core Schema (`xb_core`)

> Full DDL for the core tenancy, identity, permission, and configuration
> tables follows. The spec source was truncated mid-section 10.8
> (`forecast_rules`) at the 50k-char message limit. The pending content
> includes the rest of `xb_core.forecast_rules`, plus subsequent sections
> covering `xb_master`, `xb_raw`, `xb_canonical`, `xb_summary`,
> `xb_intelligence`, `xb_reports`, `xb_audit`, `xb_ai`. **Ask before
> shipping new migrations against any not-yet-specified table.**

### 10.1 `xb_core.organizations`

Platform-global. RLS not applied (the organization IS the tenancy root).

```sql
CREATE TABLE xb_core.organizations (
  id                       char(26)     PRIMARY KEY,
  display_name             varchar(200) NOT NULL,
  legal_name               varchar(200) NULL,
  slug                     varchar(64)  NOT NULL,
  organization_status      varchar(40)  NOT NULL DEFAULT 'active',
  billing_status           varchar(40)  NOT NULL DEFAULT 'not_configured',
  default_currency_code    char(3)      NOT NULL,
  default_timezone         varchar(64)  NOT NULL DEFAULT 'UTC',

  created_at               timestamptz  NOT NULL DEFAULT now(),
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  deleted_at               timestamptz  NULL,
  archived_at              timestamptz  NULL,
  suspended_at             timestamptz  NULL,

  created_by_actor_id      char(26)     NULL,
  updated_by_actor_id      char(26)     NULL,
  deleted_by_actor_id      char(26)     NULL,

  row_version              integer      NOT NULL DEFAULT 1,

  CONSTRAINT ck_organizations_status CHECK (
    organization_status IN ('active','suspended','archived')
  ),
  CONSTRAINT ck_organizations_billing CHECK (
    billing_status IN ('active','past_due','cancelled','trial','not_configured')
  ),
  CONSTRAINT ck_organizations_slug_format CHECK (slug ~ '^[a-z0-9-]{1,64}$')
);

CREATE UNIQUE INDEX uq_organizations_slug ON xb_core.organizations (slug);
CREATE INDEX idx_organizations_status ON xb_core.organizations (organization_status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_organizations_row_version
  BEFORE UPDATE ON xb_core.organizations
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();

CREATE TRIGGER trg_organizations_audit
  AFTER INSERT OR UPDATE OR DELETE ON xb_core.organizations
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();
```

### 10.2 `xb_core.actors`

The polymorphic actor abstraction. **Every entity that can perform an
action has a row here.** Users, API keys, system jobs, connectors, and
AI agents all reference actor IDs.

```sql
CREATE TABLE xb_core.actors (
  id                  char(26)     PRIMARY KEY,
  organization_id     char(26)     NULL,    -- NULL for platform-global actors

  actor_kind          varchar(40)  NOT NULL,
  display_name        varchar(200) NOT NULL,
  actor_status        varchar(40)  NOT NULL DEFAULT 'active',

  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  deleted_at          timestamptz  NULL,

  created_by_actor_id char(26)     NULL,
  updated_by_actor_id char(26)     NULL,

  row_version         integer      NOT NULL DEFAULT 1,

  CONSTRAINT ck_actors_kind CHECK (
    actor_kind IN ('internal_user','organization_user','api_key','system_job','connector','ai_agent')
  ),
  CONSTRAINT ck_actors_status CHECK (
    actor_status IN ('active','deactivated','revoked')
  ),
  CONSTRAINT fk_actors_org FOREIGN KEY (organization_id)
    REFERENCES xb_core.organizations(id)
);

CREATE INDEX idx_actors_org ON xb_core.actors (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_actors_kind ON xb_core.actors (actor_kind) WHERE deleted_at IS NULL;
CREATE INDEX idx_actors_status ON xb_core.actors (actor_status) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_actors_row_version BEFORE UPDATE ON xb_core.actors
  FOR EACH ROW EXECUTE FUNCTION fn_increment_row_version();
CREATE TRIGGER trg_actors_audit AFTER INSERT OR UPDATE OR DELETE ON xb_core.actors
  FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();
```

Design notes:

- internal user: `actor_kind='internal_user'`, `organization_id IS NULL`
- org user: `actor_kind='organization_user'`, `organization_id=<their org>`
- API key issued to an org: `actor_kind='api_key'`, `organization_id=<issuer>`
- system job: `actor_kind='system_job'`, `organization_id IS NULL` (logged per affected org via `audit_log.organization_id`)
- AI agent on behalf of org: `actor_kind='ai_agent'`, `organization_id=<on behalf of>`

### 10.3 `xb_core.users`

Users always have an associated `actor` row. `actors` carries the
identity-agnostic action-performing concept; `users` carries
human-specific auth fields.

```sql
CREATE TABLE xb_core.users (
  id                          char(26)     PRIMARY KEY,
  actor_id                    char(26)     NOT NULL UNIQUE,
  user_kind                   varchar(40)  NOT NULL,
  organization_id             char(26)     NULL,    -- NULL for internal users

  username                    varchar(120) NOT NULL,
  display_name                varchar(200) NOT NULL,
  email                       varchar(254) NOT NULL,
  password_hash               varchar(255) NOT NULL,

  internal_user_role          varchar(40)  NULL,
  organization_user_role      varchar(40)  NULL,

  user_status                 varchar(40)  NOT NULL DEFAULT 'pending_invite',
  mfa_enabled                 boolean      NOT NULL DEFAULT false,
  mfa_secret_encrypted        bytea        NULL,
  last_login_at               timestamptz  NULL,
  password_changed_at         timestamptz  NULL,

  created_at                  timestamptz  NOT NULL DEFAULT now(),
  updated_at                  timestamptz  NOT NULL DEFAULT now(),
  deleted_at                  timestamptz  NULL,

  created_by_actor_id         char(26)     NULL,
  updated_by_actor_id         char(26)     NULL,
  deleted_by_actor_id         char(26)     NULL,

  row_version                 integer      NOT NULL DEFAULT 1,

  CONSTRAINT fk_users_actor FOREIGN KEY (actor_id) REFERENCES xb_core.actors(id),
  CONSTRAINT fk_users_org FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT ck_users_kind CHECK (user_kind IN ('internal','organization')),
  CONSTRAINT ck_users_status CHECK (user_status IN ('active','deactivated','pending_invite')),
  CONSTRAINT ck_users_internal_role CHECK (
    internal_user_role IS NULL OR internal_user_role IN ('manager','staff')
  ),
  CONSTRAINT ck_users_org_role CHECK (
    organization_user_role IS NULL OR organization_user_role IN ('admin','user')
  ),
  CONSTRAINT ck_users_role_consistency CHECK (
    (user_kind = 'internal'     AND internal_user_role IS NOT NULL AND organization_user_role IS NULL AND organization_id IS NULL)
    OR
    (user_kind = 'organization' AND organization_user_role IS NOT NULL AND internal_user_role IS NULL AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_users_username ON xb_core.users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_users_email ON xb_core.users (lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_org ON xb_core.users (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_kind ON xb_core.users (user_kind) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_status ON xb_core.users (user_status) WHERE deleted_at IS NULL;
```

### 10.4 `xb_core.api_keys` (stub, future)

Created in v1 but not actively used until API access ships in a later
version. See full spec for DDL.

### 10.5 `xb_core.workspaces`

```sql
CREATE TABLE xb_core.workspaces (
  id                       char(26)      PRIMARY KEY,
  organization_id          char(26)      NOT NULL,

  workspace_name           varchar(200)  NOT NULL,
  workspace_type           varchar(40)   NOT NULL,
  workspace_status         varchar(40)   NOT NULL DEFAULT 'active',

  default_currency_code    char(3)       NOT NULL,
  timezone                 varchar(64)   NOT NULL DEFAULT 'UTC',
  dos_target_days          numeric(6,2)  NOT NULL DEFAULT 30.0,
  forecast_rule_id         char(26)      NULL,

  archived_at              timestamptz   NULL,

  -- PACK_TIMESTAMPS, PACK_SOFT_DELETE, PACK_ACTORS, PACK_ROW_VERSION

  CONSTRAINT fk_workspaces_org FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT ck_workspaces_type CHECK (workspace_type IN ('marketplace','dtc','warehouse','omni_channel')),
  CONSTRAINT ck_workspaces_status CHECK (workspace_status IN ('active','archived')),
  CONSTRAINT ck_workspaces_dos_positive CHECK (dos_target_days >= 0)
);

CREATE INDEX idx_workspaces_org ON xb_core.workspaces (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workspaces_status ON xb_core.workspaces (workspace_status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_workspaces_org_name
  ON xb_core.workspaces (organization_id, lower(workspace_name))
  WHERE deleted_at IS NULL;

-- Standard RLS policy (§2.3)
-- Standard triggers (row_version, audit)
```

### 10.6 Permission tables

Four tables — see full spec for DDL:

- `xb_core.workspace_permissions` (user × workspace × access_level)
- `xb_core.page_permissions` (user × workspace × page × access_level)
- `xb_core.internal_permissions` (internal user × org × access_level)
- `xb_core.workspace_permission_snapshots` (frozen state at archival)

### 10.7 `xb_core.warehouses`

```sql
CREATE TABLE xb_core.warehouses (
  id                   char(26)     PRIMARY KEY,
  organization_id      char(26)     NOT NULL,
  workspace_id         char(26)     NOT NULL,

  warehouse_code       varchar(64)  NOT NULL,
  display_name         varchar(200) NOT NULL,
  address_line_1       varchar(200) NULL,
  address_line_2       varchar(200) NULL,
  city                 varchar(120) NULL,
  region               varchar(120) NULL,
  postal_code          varchar(40)  NULL,
  country_code         char(2)      NULL,

  is_fba               boolean      NOT NULL DEFAULT false,
  is_active            boolean      NOT NULL DEFAULT true,

  -- PACK_TIMESTAMPS, PACK_SOFT_DELETE, PACK_ACTORS

  CONSTRAINT fk_warehouses_org FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT fk_warehouses_ws FOREIGN KEY (workspace_id) REFERENCES xb_core.workspaces(id)
);

CREATE UNIQUE INDEX uq_warehouses_ws_code
  ON xb_core.warehouses (workspace_id, lower(warehouse_code))
  WHERE deleted_at IS NULL;
CREATE INDEX idx_warehouses_org_ws
  ON xb_core.warehouses (organization_id, workspace_id)
  WHERE deleted_at IS NULL;

-- Standard RLS + audit trigger
```

### 10.8 Configuration tables

- `xb_core.module_definitions` — platform-global; module key, display
  name, description, default_enabled, is_beta
- `xb_core.module_enablement` — per org/workspace; FK to module_definitions
- `xb_core.feature_flags` — platform-global definitions
- `xb_core.feature_flag_overrides` — per org/workspace/user
- `xb_core.forecast_rules` — per workspace (SPEC TRUNCATED HERE)

> **Awaiting continuation of the spec for**: rest of `forecast_rules`,
> `xb_master.*`, `xb_raw.*`, `xb_canonical.*` (sales_performance_period,
> ppc_performance_period, inventory_position, shipment_tracking),
> `xb_summary.*`, `xb_intelligence.*`, `xb_reports.*`, `xb_audit.*`,
> `xb_ai.*`.

---

# Notes on current build state vs spec

Recent slices in the codebase shipped some tables that **do not match
the canonical names + grain in this spec**. Before continuing, those
need to be reconciled:

| Codebase today | Spec equivalent | Action |
|---|---|---|
| `xb_canonical.sales_orders` (per-order grain) | `xb_canonical.sales_performance_period` (period-aggregated by `period_start`, partitioned by month) | Replace |
| `xb_canonical.inventory_snapshots` (point-in-time, warehouse model) | `xb_canonical.inventory_position` (partitioned by `position_date`) | Replace |
| (none yet — PPC validator was reverted before commit) | `xb_canonical.ppc_performance_period` | Build per spec |
| `xb_core.uploads` (current upload registry) | Pending spec — uploads tab structure (Files / History / Validation Errors / Templates / Processing Logs) implies a richer set of tables incl. `xb_raw.upload_validation_errors` | Extend |
| Sidebar nav (10 items) | Spec adds `Forecasting`, `Insights` | Add |
| Settings tabs | Spec defines `Organization / Workspaces / Users / Warehouses / Forecast Rules / Upload Templates / Diagnostics` | Add |

The non-canonical tables (`sales_orders`, `inventory_snapshots`) still
have callers in the API + UI. A migration plan needs to:

1. Add the new canonical tables per spec
2. Build new validators that write to them using the new template column lists
3. Replace API list services + frontend pages to read the new tables
4. Bridge existing data via a one-time migration (sales_orders → sales_performance_period etc) so test uploads survive
5. Leave the old tables in place; drop in a clean follow-up once nothing references them

---

# Part 3 — Platform direction, completed state, next priorities

> Latest direction document (received 2026-05-20). The goal of this
> section is to keep future sessions on-track with the *why* behind the
> work, not just the *what*.

## Core platform philosophy

XB Matrix is **not** a dashboard app. It is a **centralized operational
intelligence platform** for ecommerce agencies and brands.

**Uploads = Inputs. Reports/Insights = Outputs.** Everything revolves
around a centralized ingestion + calculation engine pipeline.

## Canonical system flow

```
Raw Uploads
   ↓
Validation Layer
   ↓
Canonical Tables
   ↓
Summary Tables
   ↓
Calculation Engines
   ↓
Intelligence Layer
   ↓
Reports / Insights / Recommendations / Dashboards
```

**Critical rules:**

- Uploads are raw operational/business inputs.
- Dashboards/reports are generated outputs.
- All analytics derive from canonicalized data only.
- No dashboard should calculate directly from uploaded files.
- Frontend NEVER calculates business metrics; backend engines do.

## Current completed foundation (production today)

- multi-tenant architecture
- organizations
- workspaces
- auth lifecycle (sign-in / sign-out / sessions)
- invitations
- email verification
- password reset
- workspace-aware sessions
- resolver-based permission architecture
- audit logging
- Cloud Run + Cloud SQL + BigQuery + GCS infra
- workspace-aware dashboard shell (placeholder metrics)
- enterprise CRUD lifecycle (suspend / archive / soft-delete / restore)
- uploads foundation beginning (file upload + GCS storage + status lifecycle)

## Upload kinds (intended, per direction doc)

The validator registry should eventually cover:

| Kind | Purpose |
|---|---|
| `amazon_sales` | Amazon sales business reports |
| `amazon_inventory` | Amazon inventory positions |
| `amazon_ads` | Amazon advertising / PPC |
| `amazon_settlement` | Amazon settlement reports (financial) |
| `shipment` | Shipment data (FBA, DTC transfers) |
| `sku_master` | SKU master / catalog uploads |
| `warehouse_inventory` | Non-FBA warehouse inventory |
| `generic` | Passthrough storage only — PDFs / unsupported exports / arbitrary files |

Each structured upload kind needs:

- upload contract
- schema validator
- versioning
- parsing engine
- canonical transformation logic
- validation report
- audit trail
- retry / reprocess support

**Structured uploads are preferred.** Generic is fallback storage only.

## Upload lifecycle architecture

```
Upload
  ↓
Validation
  ↓
Accepted / Rejected rows
  ↓
Canonicalization
  ↓
Summary refresh
  ↓
Engine recalculation
  ↓
Dashboard refresh
  ↓
Insight generation
```

## Uploads module UI expectations

- upload queue + history
- processing statuses
- validation error viewer
- downloadable error reports
- audit logs
- workspace / org scoping
- async processing via Cloud Tasks
- GCS-backed file storage
- upload detail drawer
- reprocess / retry support (later)

## Calculation engine direction

The system is built around **centralized reusable engines**, not
page-specific calculations.

| Engine | Purpose |
|---|---|
| Sales aggregation | Period rollups, channel splits, B2B/B2C breakouts |
| Inventory health | Stockout risk, overstock, aging |
| DOS calculations | Days-of-stock per SKU per channel |
| Replenishment | Reorder quantities, shipment proposals |
| Shipment recommendation | What to ship, when, where |
| PPC analytics | ACOS, TACOS, ROAS, waste, scaling |
| Profitability | Per-SKU contribution margin, marketplace P&L |
| Forecasting | Demand projection by SKU + channel |
| Anomaly / insight | Detection + ranking of operational issues |

### Engine architectural principle

Engines operate on **canonical tables and summary tables only**.

Never:
- directly on uploaded spreadsheets
- directly inside frontend pages
- directly inside report views

### Engine architecture expectations

- versioned engines (`engine_key` + `engine_version` per Spec 3 PACK_ENGINE_VERSION)
- deterministic calculations
- async execution
- idempotent processing
- engine metadata recorded with outputs
- auditability of every engine run
- future AI augmentation (optional layer)

## Reports direction

Reports are **generated outputs from engines**, not uploaded files.

| Report | Engine source |
|---|---|
| Sales summary | Sales aggregation |
| Inventory health | Inventory health |
| Shipment recommendation | Shipment + replenishment |
| Profitability | Profitability |
| PPC | PPC analytics |
| DOS analysis | DOS + inventory |
| Executive summary | Aggregator across all engines |
| Forecast reports | Forecasting |

### Reports lifecycle

```
Engine Output
  ↓
Report Generation
  ↓
GCS Reports Bucket
  ↓
Reports Module
  ↓
Download / Archive
```

Reports auto-archive after 30 days; **analytical data remains
permanently in DB** (canonical tables never deleted by retention).

## Dashboard direction

Dashboards should become:

- workspace-aware
- engine-driven (no in-page math)
- near real-time
- operationally actionable

**Not** static chart pages.

Future dashboard blocks:

- inventory health
- low stock alerts
- replenishment recommendations
- sales velocity
- ad performance
- profitability
- operational anomalies
- AI-generated insights

## Data architecture direction

| Layer | Where |
|---|---|
| Raw tables (`xb_raw.*`) | Postgres — landing pad for upload contents |
| Canonical tables (`xb_canonical.*`) | Postgres — normalized period-bucketed facts |
| Summary tables (`xb_summary.*`) | Postgres — pre-aggregated, UI-facing |
| Intelligence tables (`xb_intelligence.*`) | Postgres — engine outputs (forecasts, insights, recs) |
| Long-term analytics | BigQuery — historical, large-scale, archive |

Postgres remains: operational source of truth, transactional layer,
active dashboard/query layer.

BigQuery eventually supports: historical analytics, large-scale
reporting, intelligence workloads, long-term archives.

## AI direction

The platform must remain **provider-agnostic**.

| Tier | Providers |
|---|---|
| Current / free-first | Groq, OpenRouter, Ollama |
| Future paid | OpenAI, Claude, Gemini, enterprise providers |

**AI is optional and pluggable.** Core platform functionality must NOT
depend on paid models.

Future AI use cases:

- operational copilots
- conversational analytics
- AI recommendations
- anomaly explanations
- inventory planning assistant
- forecasting assistant
- chatbot support

## UI/UX direction (already established)

- Enterprise operational platform — not consumer SaaS styling
- Navy / orange brand theme
- Quicksand titles, Inter body, Inter tabular numbers for all metrics
- Workspace-aware context throughout
- Nested organization / workspace management
- Enterprise overlay architecture (portaled, layered z-index)
- Scalable DataTable primitives
- Audit-first workflows
- Soft-delete lifecycle everywhere

## Next major architectural priorities (in order)

1. Enterprise DataTable foundation ✅ (shipped)
2. **Upload management system** ← in progress; needs tabs (Files / History / Validation Errors / Templates / Processing Logs) + spec-aligned validators
3. **Permissions matrix UI** ← Spec 3 §10.6 DDL exists; workspace × user × access_level with page-level overrides + Custom auto-state
4. **Workspace-scoped dashboards** ← engine-driven once engines exist
5. **Calculation engine implementation** ← awaiting Spec 3 continuation (canonical + summary table DDL)
6. **Reports generation engine** ← awaiting engine outputs
7. **Forecasting / intelligence layers**
8. **AI copilots / chatbots**

## Most important implementation rule going forward

Everything operational must flow through:

```
Upload → Canonical Data → Engine → Insight / Report / UI
```

**Avoid:**

- page-specific business logic
- spreadsheet-style calculations inside frontend components
- engines reading directly from raw uploads or summary-less canonical
- dashboards aggregating live data instead of reading pre-computed summaries

---

# Notes on this build session

Tracking what's in code today vs the spec, so future sessions don't
forget the work-in-progress:

| Area | Current state | Spec-aligned target | Status |
|---|---|---|---|
| Sales validator | columns: order_id/sku/quantity/unit_price/currency/order_date/marketplace | columns: action/uid/start_date/end_date/channel/sku/sessions×{total,b2b}/orders×{total,b2b}/units×{total,b2b}/sales×{total,b2b}/refunds×{total,b2b} | needs rewrite |
| Inventory validator | columns: sku/warehouse/snapshot_date/on_hand/reserved/available/inbound/unit_cost/currency | columns: action/uid/date/channel/sku/total/receiving/fc_transfer/reserved/damaged | needs rewrite |
| Ads / PPC validator | (reverted before commit) | columns: action/uid/start_date/end_date/campaign_name/campaign_type/sku_name/impressions/clicks/orders/total_cost/sales/currency/platform/target_platform | needs build |
| sales_orders canonical table | per-order grain, exists | `sales_performance_period` (period grain, monthly partitions) | bridge then drop |
| inventory_snapshots canonical | warehouse-point-in-time, exists | `inventory_position` (date-partitioned) | bridge then drop |
| /uploads page | 5-tab structure shipped (Files / History / Validation Errors / Templates / Processing Logs) | ✅ done | |
| Sidebar | 9 items | 11 items (+ Forecasting + Insights) | needs update |
| Settings tabs | Workspaces / Users / Permissions(soon) / Audit / Billing(soon) / Integrations(soon) | + Warehouses / Forecast Rules / Upload Templates / Diagnostics | needs update |
| Engines | none | Sales/PPC/Inventory/DOS/Replenishment/Forecasting/Profitability/Anomaly | awaiting spec continuation |

---

# Part 4 — Connector architecture clarification (CRITICAL)

> Direction received 2026-05-20. Read before designing any canonical
> table, summary table, or engine.

## The platform is multi-channel, not Amazon-only

XB Matrix is a **centralized multi-channel commerce intelligence
platform**. Amazon is the first connector because it's the easiest
operational starting point, but the platform must from day one be
architected to ingest from many platforms and produce **one unified
operational intelligence layer** on top.

Channels we already expect to support:

- **Marketplaces:** Amazon, Walmart, eBay, Etsy, Target Plus, Home
  Depot, Wayfair, Faire
- **DTC platforms:** Shopify, WooCommerce
- **Social commerce:** TikTok Shop
- **Feed-based:** Google Shopping / Merchant
- **Ad platforms:** Meta Ads, Google Ads, (Amazon Ads already)
- **Marketing:** Klaviyo / email marketing
- **Operations:** 3PL / WMS systems, ERP / accounting systems

## Where connector-specific logic IS allowed

At the **ingestion edge only**:

```
Upload → Validation → Mapping layer
   ^connector-specific from here
                       ^canonicalized from here
```

Connector-specific code lives in:
- **Upload kinds** (e.g., `amazon_sales`, `walmart_sales`, `shopify_sales`)
- **Validators** (each marketplace has slightly different report shapes)
- **CSV templates** (each platform's report format)
- **Mapping layer** (transforms platform-shaped rows → canonical entities)

Each connector owns: its template, its validator, its mapper. Adding a
new connector should not require changing canonical tables, engines,
summaries, or UI beyond a new upload kind dropdown entry.

## Where channel-agnostic architecture is REQUIRED

Everything **after** canonicalization:

- **Canonical tables** (`xb_canonical.*`)
- **Summary tables** (`xb_summary.*`)
- **Intelligence tables** (`xb_intelligence.*`)
- **Engines** (sales aggregation, PPC analytics, inventory health, DOS,
  replenishment, forecasting, profitability, anomaly detection)
- **Reports** generated from engine outputs
- **Dashboard / module views** that read from summary tables

These layers must NOT contain Amazon-specific assumptions. An engine
that says "if (platform === 'amazon') …" is a smell — pull the
divergence into the mapping layer instead.

## Suggested canonical naming (when DDL ships)

The current spec uses names like `sales_performance_period`. With the
multi-channel clarification, generalize to channel-prefixed entities:

| Connector edge | Canonical layer |
|---|---|
| `amazon_sales`, `walmart_sales`, `shopify_sales` | `channel_sales` |
| `amazon_inventory`, `walmart_inventory`, … | `channel_inventory` |
| `amazon_ads`, `meta_ads`, `google_ads` | `channel_ads` |
| `amazon_settlement`, `walmart_settlement` | `channel_settlement` |
| `3pl_inventory`, `wms_inventory` | `warehouse_inventory` |
| `fba_inventory` (subset of amazon_inventory) | `fulfillment_inventory` |
| (analytics from various) | `traffic_performance` |
| SKU master uploads from any source | `catalog_master` |

## Source metadata attached everywhere

Every canonical / summary / intelligence row carries source metadata so
operators can answer "where did this number come from":

| Column | Purpose |
|---|---|
| `source_platform` | `amazon` / `walmart` / `shopify` / `meta_ads` / … |
| `source_account` | The specific seller/merchant account on that platform |
| `source_workspace_id` | Which xB workspace ingested it |
| `source_report_type` | `business_report`, `inventory_ledger`, `ads_search_term`, … |
| `source_upload_id` | The xb_core.uploads row that produced this canonical row |
| `ingested_at` | When canonicalization happened |
| `engine_key` / `engine_version` | (intelligence rows) which engine + version produced this |

Spec 3's `PACK_SOURCE` already encodes most of this for canonical
tables. The engine version pack covers intelligence outputs. The
**critical addition** is `source_platform` — Spec 3 §10.x will need to
specify this on every canonical + intelligence table.

## Goal — what this enables

| Capability | What channel-agnostic canonical enables |
|---|---|
| Unified inventory coverage | Sum across Amazon + Shopify + Walmart for one SKU |
| Blended TACOS | Total ad spend / total sales across all ad platforms |
| Cross-channel sales velocity | One SKU's daily run-rate summed across all sales channels |
| Centralized replenishment forecasting | Forecast aggregated demand → propose shipments per warehouse |
| Unified profitability engine | Per-SKU margin including all marketplace fees + all ad costs + COGS |
| All-channel operational dashboards | One dashboard, one truth, regardless of how many connectors |

## Implementation rules for this session and beyond

1. **Connector boundary is the mapping layer.** Validators may inspect
   platform-shaped fields (e.g., Amazon's `b2b_total` split). After
   the mapper, those distinctions must either be normalized away or
   carried as channel-agnostic dimensions.

2. **No `if (platform === 'amazon')` in engines.** If platform-specific
   handling is needed in an engine, pull it back to the mapper or add
   a normalized indicator column the engine reads (e.g., `is_fba`
   boolean instead of `platform === 'amazon' && warehouse_code LIKE
   'FBA-%'`).

3. **Engines operate on `channel_*` tables, not platform-specific
   ones.** If a new connector ships and an engine needs no changes,
   the architecture is right.

4. **UI is connector-agnostic except where genuinely connector-specific
   (e.g., upload templates).** Tables, dashboards, reports show
   canonical entities with source as a dimension/filter.

5. **The Amazon validators shipped today (`amazon-sales`,
   `amazon-inventory`, `amazon-ads`) are correctly scoped to the
   ingestion edge.** When the second platform's validator ships (e.g.,
   `walmart-sales`), they'll sit side-by-side under
   `apps/api/src/uploads/validators/`. A future refactor may move
   each connector into its own subdirectory (e.g.,
   `uploads/connectors/amazon/sales.ts`) for clarity once the second
   platform lands — premature today.

## Effect on currently-shipped work

| Shipped | Status given clarification |
|---|---|
| `amazon_sales` / `amazon_inventory` / `amazon_ads` upload kinds + validators | ✅ correctly scoped to ingestion edge |
| `amazon_*_template.csv` downloadable templates | ✅ same |
| Legacy `sales_orders` + `inventory_snapshots` canonical tables | ❌ wrong on TWO counts now — wrong shape AND wrong naming. Replace with `channel_sales` + `channel_inventory` when Spec 3 ships canonical DDL. Bridge existing data via mapper. |
| Legacy `sales` / `inventory` / `ad_spend` validators (still active) | ⚠️ legacy compat only; their canonical writes still violate the channel-agnostic rule. Either disable canonical writes now or wait for the bridge migration to land. |

**No code changes required this turn** — the clarification is
forward-looking. Future canonical / engine work follows the rules
above.

---

# Part 5 — SKU-centric data model + dimensional drill-down (CRITICAL)

> Direction received 2026-05-20. Builds on Part 4. Read before
> designing any canonical row shape, summary table, engine, or
> SKU-detail UI.

## The SKU is the central operational entity

**Everything in XB Matrix orbits the normalized SKU.** A single SKU
simultaneously exists across many channels, many inventory pools,
many ad platforms, many regions. The canonical layer must collapse
that fragmentation into a single SKU identity so the user — and the
engines — can see the SKU as one operational thing.

### The reality the architecture must model

A SKU may simultaneously exist as a sellable item on:

- Amazon US, Amazon CA, Amazon UK, Amazon DE, …
- Shopify
- Walmart
- TikTok Shop
- eBay
- Etsy / Faire / Target Plus / Home Depot / Wayfair / …

Inventory for that same SKU may simultaneously live in:

- FBA US, FBA CA, FBA UK, …
- FBM (merchant-fulfilled)
- 3PL pools (per provider)
- Owned warehouses (per location)
- Retail / wholesale inventory pools
- Inbound / in-transit (per warehouse, per arrival date)

Ad spend for that same SKU may simultaneously flow from:

- Amazon Ads (SP, SB, SD), per marketplace
- Walmart Connect
- Meta Ads
- Google Ads (Shopping, Search, PMax)
- TikTok Ads
- (Klaviyo / email later)

## What the engine and UX must support — both at the same time

For any selected SKU, the user expects to see:

| Mode | What it shows |
|---|---|
| **Blended / global** (default) | Total across all channels / locations / ad sources — blended sales, total inventory, blended ad spend, unified DOS, total profitability, centralized replenishment recommendation |
| **Filtered / drill-down** | Same metric scoped to one dimension — Amazon-only, Walmart-only, FBA-only, US-only, Meta Ads only, one warehouse, … |

Example for one SKU:

| | Blended | Amazon US | Walmart | Shopify |
|---|---|---|---|---|
| Units sold (30d) | 5,000 | 1,500 | 800 | 2,700 |
| Sessions | … | 12k | n/a | 4k |
| Ad spend | $2,300 | $1,400 (Amazon Ads) | $200 (Walmart Connect) | $700 (Meta + Google) |

Inventory view:

| Pool | Units |
|---|---|
| FBA US | 400 |
| FBA CA | 200 |
| Shopify warehouse | 150 |
| 3PL East | 300 |
| **Total** | **1,050** |

The engine computes unified DOS off the blended units sold + total
inventory. The user can drill in to ask "what's my DOS just for FBA
US given just Amazon US sales velocity?" — the same engine answers it,
just with different `WHERE` clauses on the canonical data.

## Foundational dimensions on every canonical row

These are **not optional metadata** — they are first-class columns
that engines + summaries + UIs depend on. Every canonical row carries:

| Dimension | Type | Source | Examples |
|---|---|---|---|
| `sku_normalized` | `varchar(200)` | normalized via `xb_master.sku_aliases` | `WIDGET-A` |
| `marketplace_code` | `varchar(80)` | from upload `channel` column | `amazon_us`, `amazon_uk`, `walmart`, `shopify`, `tiktok_shop` |
| `region_code` | `char(2)` or `varchar(8)` | derived from marketplace | `US`, `CA`, `UK`, `DE` |
| `fulfillment_type` | `varchar(40)` | derived or supplied | `fba`, `fbm`, `dtc`, `3pl`, `retail` |
| `inventory_location_code` | `varchar(120)` | inventory-table-only | `FBA-US`, `FBA-CA`, `WH-NJ`, `3PL-LAX-01` |
| `ad_platform_code` | `varchar(80)` | ads-table-only | `amazon_ads`, `meta_ads`, `google_ads`, `tiktok_ads` |
| `source_platform` | `varchar(80)` | from connector identity | `amazon`, `walmart`, `shopify`, `meta_ads`, `google_ads` |
| `source_account` | `varchar(200)` | seller/merchant account id | `A1B2C3` (Amazon merchant ID) |
| `source_upload_id` | `char(26)` | provenance | FK to `xb_core.uploads.id` |

The engines never care which channel a row came from in code. They
compose blended views by aggregating over rows; they compose filtered
views by adding a `WHERE` on the matching dimension.

## SKU identity normalization (`xb_master.sku_aliases`)

The same product often has different SKU codes per platform:

- Amazon ASIN: `B0C123XYZ`
- Amazon seller SKU: `WIDGET-A-US-PRIME`
- Walmart item ID: `WMT-447721`
- Shopify variant ID: `gid://shopify/ProductVariant/4982`
- Internal SKU: `WIDGET-A`

`xb_master.sku_aliases` maps any platform's SKU code → the canonical
`sku_normalized`. Validators look up the alias during mapping; the
canonical row stores the normalized SKU. Without this, the same
physical product appears as several SKUs in dashboards and engines
double-count inventory + sales.

Spec 3 §10 hasn't covered `xb_master` yet. When it does, this table
is foundational and must land early.

## Canonical schema implication — broader than just `channel_*`

Part 4 already said canonical tables should be channel-agnostic with
generic names. Part 5 adds: the **column shape** must explicitly
carry all the dimensions above. Sketching what the eventual canonical
sales table looks like:

```sql
CREATE TABLE xb_canonical.channel_sales (
  id                       char(26)       PRIMARY KEY,
  organization_id          char(26)       NOT NULL,
  workspace_id             char(26)       NOT NULL,

  -- Core entity
  sku_normalized           varchar(200)   NOT NULL,

  -- Operational dimensions (every row carries these)
  marketplace_code         varchar(80)    NOT NULL,    -- amazon_us, walmart, shopify, ...
  region_code              varchar(8)     NOT NULL,    -- US, CA, UK, DE
  fulfillment_type         varchar(40)    NULL,        -- fba, fbm, dtc, 3pl (when known per row)

  -- Period grain (period-aggregated by week/day)
  period_start             date           NOT NULL,
  period_end               date           NOT NULL,
  period_grain             varchar(20)    NOT NULL,    -- 'day' | 'week' | 'month'

  -- Metrics (B2B + total split)
  sessions_total           bigint         NOT NULL,
  sessions_b2b             bigint         NOT NULL DEFAULT 0,
  orders_total             bigint         NOT NULL,
  orders_b2b               bigint         NOT NULL DEFAULT 0,
  units_total              bigint         NOT NULL,
  units_b2b                bigint         NOT NULL DEFAULT 0,
  sales_total              numeric(18,4)  NOT NULL,
  sales_b2b                numeric(18,4)  NOT NULL DEFAULT 0,
  refunds_total            numeric(18,4)  NOT NULL DEFAULT 0,
  refunds_b2b              numeric(18,4)  NOT NULL DEFAULT 0,
  currency_code            char(3)        NOT NULL,

  -- Provenance (PACK_SOURCE expanded)
  source_platform          varchar(80)    NOT NULL,    -- amazon, walmart, shopify
  source_account           varchar(200)   NULL,
  source_report_type       varchar(80)    NULL,        -- business_report, ...
  source_upload_id         char(26)       NULL,
  source_row_uid           varchar(200)   NULL,        -- upload-supplied uid for idempotency
  ingested_at              timestamptz    NOT NULL DEFAULT now(),

  -- Standard packs (PACK_TIMESTAMPS, PACK_SOFT_DELETE not applied;
  -- canonical period tables are upsert-by-composite-key per Spec 3 §3)
  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),

  -- Composite uniqueness so re-uploading the same (sku, marketplace,
  -- period) replaces instead of duplicating.
  CONSTRAINT uq_channel_sales_natural UNIQUE (
    workspace_id, sku_normalized, marketplace_code, region_code,
    fulfillment_type, period_start, period_end, source_platform, source_account
  )
);

-- Hot scans: per-SKU blended (no marketplace filter), per-channel filtered,
-- per-period range, per-region.
CREATE INDEX idx_channel_sales_ws_sku_period ON xb_canonical.channel_sales
  (workspace_id, sku_normalized, period_start DESC);
CREATE INDEX idx_channel_sales_ws_marketplace_period ON xb_canonical.channel_sales
  (workspace_id, marketplace_code, period_start DESC);
CREATE INDEX idx_channel_sales_ws_region_period ON xb_canonical.channel_sales
  (workspace_id, region_code, period_start DESC);
-- Partition by month on period_start per Spec 3 §6
```

`channel_inventory` and `channel_ads` follow the same pattern with
their own metric columns + `inventory_location_code` /
`ad_platform_code` as additional dimensions.

## Engine I/O contract

Every engine takes:

```typescript
interface EngineQuery {
  workspaceId: WorkspaceId;
  // Mandatory time window
  periodStart: Date;
  periodEnd: Date;
  // Optional filters — any combination
  skuNormalized?: string;
  marketplaceCode?: string;
  regionCode?: string;
  fulfillmentType?: string;
  inventoryLocationCode?: string;
  adPlatformCode?: string;
}
```

Engines return blended results by default; filters narrow the
aggregation. The SAME engine answers "blended DOS for SKU X" and
"FBA-US-only DOS for SKU X" — the only difference is which filters
are passed.

## SKU-detail UX implication

The eventual SKU detail page is the canonical example:

```
/sku/[sku_normalized]
   ↓
  [blended KPI strip]
   ↓
  [filter chips: marketplace | region | fulfillment | ad platform | warehouse]
   ↓
  [tabs: Sales | Inventory | Ads | DOS | Profitability]
   ↓
  [each tab renders both blended and a per-dimension breakdown table]
```

The same component reads the same canonical tables; chips change the
`WHERE` clause passed to the engine.

## Implementation rules

1. **Every canonical table carries the full dimension set** relevant
   to its data: sales gets marketplace/region/fulfillment; inventory
   gets location/fulfillment; ads gets ad_platform. SKU dimension is
   on every row that's SKU-scoped.

2. **Validators must capture dimensional fields** during ingestion.
   The Amazon validators already do this (`channel`, `target_platform`).
   Future connectors (Walmart, Shopify) must do the same with their
   platform's equivalents.

3. **The mapper is where dimensional normalization happens:**
   marketplace `amazon_us` stays as-is; `Amazon.com` becomes
   `amazon_us`; region `US` is derived from marketplace; fulfillment
   `FBA-US` becomes `fulfillment_type='fba' + inventory_location_code='FBA-US'`.

4. **Engines NEVER read raw upload data** — they read canonical with
   filter parameters and aggregate.

5. **Summary tables are pre-aggregated blended views** with the same
   dimension columns, so dashboard tiles for "total across all
   channels" don't require live SUMs across millions of rows.

6. **Frontend filter UI is a single component** taking a list of
   active dimensions and emitting filter objects. The same component
   appears on dashboards, SKU details, sales view, inventory view,
   PPC view.

## Effect on currently-shipped work

| Area | Status given Part 5 |
|---|---|
| `amazon-sales` validator (carries `channel` column) | ✅ correct — channel field is captured at ingestion |
| `amazon-inventory` validator (carries `channel`) | ✅ correct |
| `amazon-ads` validator (carries `platform` + `target_platform`) | ✅ correct |
| Legacy `sales_orders` table | ❌ missing dimensional columns; replace with `channel_sales` per above |
| Legacy `inventory_snapshots` table | ❌ missing dimensional columns; replace with `channel_inventory` |
| Legacy `/sales` page | reads `sales_orders` — will be rebuilt against `channel_sales` with the dimensional filter UI |
| Legacy `/inventory` page | same as above |
| Dashboard tiles | currently read blended sales/inventory aggregates → architecturally consistent; values flow correctly once canonical tables ship |
| Engines | none yet; this section defines their I/O contract |

**No code changes this turn.** This document update locks in the
data model that all future canonical / engine / UI work follows.

---

# Part 6 — Inventory + WMS orchestration: SKU as the global operational entity

> Direction received 2026-05-20. Sharpens Part 5 specifically for
> inventory + replenishment + forecasting. Read before designing any
> inventory canonical row, WMS feature, or any engine that touches
> inventory.

## Position: XB Matrix is a commerce + inventory operating system

Inventory in XB Matrix is **not** a marketplace report viewer. It's a
centralized inventory orchestration layer that:

- Aggregates every inventory pool the customer owns (FBA per country,
  FBM, multiple 3PLs, owned warehouses, retail, inbound, in-transit)
- Aggregates every sales channel that drains those pools
- Aggregates every ad platform driving demand into those pools
- Computes one **SKU-level** operational truth: how much is available
  globally, how much is sellable per channel, what needs to move where,
  what needs to be reordered

The engine never thinks "Amazon inventory" or "Shopify inventory."
It thinks **"total operational inventory position for SKU X across
the business"** — and answers filtered questions by adding a `WHERE`,
not by switching schemas.

## Inventory dimensions (every `xb_canonical.channel_inventory` row carries these)

Building on Part 5's dimension set, inventory rows additionally need:

| Dimension | Type | Purpose |
|---|---|---|
| `sku_normalized` | `varchar(200)` | Same as Part 5 — the SKU is the entity |
| `marketplace_code` | `varchar(80)` | Where it's listed for sale (`amazon_us`, `shopify`, `walmart`, …) — nullable for warehouse-only inventory not yet allocated to a marketplace |
| `region_code` | `varchar(8)` | `US`, `CA`, `UK`, … |
| `inventory_location_code` | `varchar(120)` | Physical pool: `FBA-US`, `FBA-CA`, `WH-NJ`, `3PL-LAX-01`, `RETAIL-SHELF`, … |
| `fulfillment_type` | `varchar(40)` | `fba`, `fbm`, `3pl`, `owned_warehouse`, `retail`, `dropship` |
| `inventory_state` | `varchar(40)` | `available`, `reserved`, `inbound`, `damaged`, `transfer`, `processing`, `unsellable` |
| `ownership` | `varchar(40)` | `owned`, `consigned`, `partner` — for inventory the org doesn't fully own |
| `linked_shipment_id` | `char(26)` | When the units are in-transit, link to the originating shipment (FK to `xb_canonical.shipment_tracking`) |
| `position_date` | `date` | Point-in-time snapshot the row represents |

The `quantity` column on each row is "units in this exact (sku ×
marketplace × location × state × ownership)" — so a single SKU with
units in FBA-US available, FBA-US reserved, FBA-CA available, and
3PL-LAX inbound produces 4 rows.

This shape is **denormalized for query speed**. The engine reads
billions of these rows by `WHERE` on whichever dimension it cares
about; aggregating over `quantity` answers any operational question.

## Inventory states (controlled vocabulary)

| State | Meaning | Counts toward "sellable now"? |
|---|---|---|
| `available` | On hand and ready to ship | ✅ |
| `reserved` | Committed to open orders, not yet shipped | ❌ (already promised) |
| `inbound` | In transit toward this location, not yet receivable | ❌ |
| `damaged` | Unsellable due to damage | ❌ |
| `transfer` | Mid-move between two locations the org owns | ❌ at destination, ❌ at source |
| `processing` | At a fulfillment node but not yet shelved (FBA receiving, 3PL putaway) | ❌ |
| `unsellable` | Catch-all for FBA "unfulfillable" / quarantined | ❌ |

Engines compute "sellable supply" as the sum where `inventory_state =
'available'`. "Pipeline supply" includes `inbound` + `transfer` +
`processing` with their expected arrival dates.

## Canonical questions the inventory engine must answer

For any SKU, scoped by any combination of dimensions, the engine
returns:

| Question | Computation |
|---|---|
| Total inventory globally | `SUM(quantity)` across all rows for the SKU |
| Sellable inventory globally | `SUM(quantity) WHERE state='available'` |
| Sellable inventory per marketplace | Same, with `marketplace_code` filter |
| Pipeline supply (inbound + transfer) | `SUM(quantity) WHERE state IN ('inbound','transfer','processing')` |
| Blended DOS | sellable inventory ÷ (units sold per day from `channel_sales` over same scope) |
| Per-marketplace DOS | Same filtered by `marketplace_code` |
| Which marketplace stocks out first | Per-marketplace DOS, ranked ascending |
| Transfer recommendation (warehouse → FBA US) | If owned-warehouse `available` is high AND FBA-US `available` is low AND FBA-US 7-day velocity is high → propose move |
| Reorder recommendation (from supplier) | If total pipeline + sellable < (lead-time-days × blended velocity × safety factor) → propose PO |
| True blended demand velocity | `units` aggregated across all `channel_sales` rows for the SKU over the window |
| SKU profitability after blended ad spend | (sum sales − sum refunds) / sum units − sum ad-spend / sum units − COGS |

Every one of these reads canonical tables with a `WHERE` and an
aggregation — no platform-specific code paths.

## Engine I/O contract for inventory (extends Part 5's `EngineQuery`)

```typescript
interface InventoryEngineQuery {
  workspaceId: WorkspaceId;
  asOf: Date;                    // point-in-time snapshot anchor
  windowDays: number;            // velocity lookback (default 30)
  // Filters — any combination, all optional
  skuNormalized?: string;
  marketplaceCode?: string;
  regionCode?: string;
  fulfillmentType?: string;
  inventoryLocationCode?: string;
  state?: ReadonlyArray<InventoryState>;
}
```

Engine returns a normalized result:

```typescript
interface InventoryPosition {
  skuNormalized: string;
  sellable: number;              // state='available' sum
  pipeline: {                    // future-arriving supply
    inbound: number;
    transfer: number;
    processing: number;
    earliestArrivalDate: Date | null;
  };
  reserved: number;
  damagedOrUnsellable: number;
  velocityPerDay: number;        // from channel_sales over window
  dosBlended: number | null;     // sellable / velocityPerDay
  byDimension?: {                // optional per-dimension breakdown
    marketplace?: Array<{ marketplace_code: string; sellable: number; velocity: number; dos: number | null }>;
    location?: Array<{ inventory_location_code: string; sellable: number; reserved: number }>;
  };
}
```

The SAME engine answers blended ("no filters") and drill-down
("`marketplace_code = 'amazon_us'`") variants by changing the SQL
predicates. No second engine, no marketplace-specific code.

## Replenishment recommendation flow

```
For each (workspace × SKU):
  1. Aggregate sellable inventory per marketplace
  2. Aggregate velocity per marketplace over the lookback window
  3. Compute marketplace-level DOS
  4. Identify low-DOS marketplaces (below workspace.dos_target_days)
  5. Identify high-inventory pools the org owns (warehouse + 3PL)
  6. Match: which pool can feed which marketplace (geography + fulfillment compatibility)
  7. Propose:
     - Transfer X units from warehouse_code=WH-NJ → marketplace=amazon_us
     - Reorder Y units from supplier when (pipeline + sellable) <
       (lead-time × velocity × safety_factor)
```

All of step 1–6 are SQL aggregations over canonical tables with the
right filters. Step 7 is the engine's recommendation output, stored
in `xb_intelligence.recommendations` with full provenance.

## Implementation rules (extend Parts 4 + 5)

1. **`channel_inventory` is the single inventory canonical table.**
   Every pool — FBA, FBM, 3PL, owned warehouse, retail — lands here,
   distinguished by `fulfillment_type` + `inventory_location_code`.
   There is NOT a separate `fba_inventory` table.

2. **`inventory_state` is mandatory on every row.** Sums over
   inventory without filtering on state are meaningless. The engine
   API requires callers to specify which states they want, or returns
   a structured breakdown by state.

3. **`shipment_tracking` links to inventory.** Inbound + transfer rows
   in `channel_inventory` carry `linked_shipment_id` so the engine can
   compute expected arrival dates accurately. Without this, "DOS
   including pipeline" can't be honest.

4. **`xb_master.warehouses` is the source of truth for warehouse
   identity.** The `inventory_location_code` is an FK into it. The
   warehouse master knows: region, address, is_fba boolean,
   parent_org. The engine joins to it for region-based aggregations.

5. **`xb_master.sku_aliases` (Part 5) handles SKU normalization
   across platforms.** Inventory rows store `sku_normalized` resolved
   at canonicalization time — never the platform-specific code.

6. **Frontend never aggregates inventory.** The dashboard tile,
   SKU-detail tab, and inventory list all read engine output for the
   same `InventoryEngineQuery` shape. Add a filter chip → re-run the
   engine query → render. No client-side `Math.max(…)` over rows.

## Effect on currently-shipped work

| Area | Status given Part 6 |
|---|---|
| `amazon-inventory` validator (captures `channel`, `total`, `receiving`, `fc_transfer`, `reserved`, `damaged`) | ✅ correct shape at the edge. When canonicalization lands, the mapper splits these into multiple `channel_inventory` rows (one per state: `available`/`reserved`/etc) with `fulfillment_type='fba'` + `inventory_location_code='FBA-' || region`. |
| Future Walmart / Shopify / 3PL inventory validators | All map into the same `channel_inventory` table; their templates carry whatever the source platform exposes; the mapper normalizes onto the shared dimension set. |
| Legacy `inventory_snapshots` table | ❌ even more wrong now — flat per-(sku, warehouse) shape can't represent state granularity (`available` vs `reserved` vs `inbound`). Replace, don't extend. |
| Inventory KPI strip (planned: Available / Reserved / Receiving / FC Transfer / Damaged) | Maps 1:1 to inventory states once canonical lands. UI just reads engine output. |
| Forecasting / Replenishment engines (not built) | I/O contract above is binding when they ship. |
| Dashboard tiles | "Available" + "Stock cover" tiles are already engine-output shape, just reading from temporary canonical today. Re-pointing to `channel_inventory` engine output is a clean swap. |

**No code changes this turn.** This locks in inventory orchestration
shape that all future canonical / engine / UI work for inventory,
WMS, replenishment, forecasting, and SKU-detail follows.


---

# Part 7 — Recent operating decisions (2026-05-21)

Concise log of decisions that override earlier sections. Newest wins.

## Uploads — single all-channel file per dataset

There are NO per-marketplace uploads or templates. One normalized file
per operational dataset:

- **Sales Performance** — `sales_performance`
- **Inventory Position** — `inventory_position`
- **Advertising Performance** — `advertising_performance`

Every marketplace's rows go in the SAME file. The `marketplace` column
(sales/inventory) and `platform` + `target_marketplace` columns (ads)
are what the internal engine uses for all math — blended TACOS,
all-channel DOS, per-channel slicing. Per-marketplace upload kinds
(`amazon_sales`, `walmart_sales`, …) and "adapter" templates are
removed from the UI. Validators/mappers for them may remain in the
backend tree but are not surfaced.

Templates page shows download buttons ONLY. All guidance moves into a
separate branded **Download Guide** PDF — no inline metadata walls.

## Auth — username-first, no email

- Sign-in is **username + password**. No email anywhere in the user
  flow. `email` column is nullable + unused; remove legacy email code
  (invitations, verification, forgot/reset-password) as encountered.
- Admins **create users directly** (username, display name, password,
  retype password, role). No invitation/email roundtrip.
- "Remember this device" → 30-day session; default 7 days.
- No forgot-password in the UI. Admins reset passwords directly.

## Role hierarchy (5 tiers)

```
super_admin        — exactly ONE. Provisioned only via DB migration.
                     NOT creatable from any API/UI. Full bypass.
internal_manager   — creates internal_staff + org roles. Full bypass.
                     Cannot create super_admin or another manager.
internal_staff     — platform-wide read.
organization_admin — full access within own org; manages its users.
organization_user  — operational access within own org.
```

User-management actions are labelled **"Remove user"** (soft delete),
not "Deactivate".

## Reports — fixed set

Only: **Sales Report, Ads Report, Inventory Report, Warehouse
Inventory (coming soon)**. No forecasting page — DOS targets are
captured at workspace creation and a future internal engine consumes
them. Remove any other report types.

## Style directive

Keep UI lean. No metadata walls, no speculative "planned" lists in the
operator-facing UI. Operational dataset first; everything else trimmed.
