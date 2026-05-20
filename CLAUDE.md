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
4. Drop the temporary tables in a clean follow-up migration once nothing references them
