# Schema — Spec 3: Canonical PostgreSQL Schema

> Authoritative physical schema. **Source of truth for migrations is
> [`sql/migrations/`](../sql/migrations/)** — if a shipped migration
> diverges from this doc, reconcile explicitly. New tables require a
> Spec 3 amendment, not ad-hoc migrations.
>
> Spec source was truncated mid-§10.8 (`forecast_rules`) at the 50k-char
> message limit. Sections past that (`xb_master`, `xb_raw`,
> `xb_canonical`, `xb_summary`, `xb_intelligence`, `xb_reports`,
> `xb_audit`, `xb_ai`) are not yet specified — ask before shipping
> migrations against them. Canonical table *shapes* are sketched in
> [`pipeline.md`](pipeline.md).

## Schema layout

```
xb_core         tenancy, users, permissions, configuration
xb_master       SKUs, warehouses, FX rates
xb_raw          raw ingestion tables (from uploads)
xb_canonical    normalized period-bucketed facts
xb_summary      pre-aggregated UI-facing tables
xb_intelligence forecasts, insights, recommendations
xb_reports      generated reports metadata
xb_audit        audit log (partitioned by month)
xb_ai           AI infrastructure (provider registry, conversations, prompts)
```

## 1. Conventions

### Naming

| Element | Convention | Example |
|---|---|---|
| Schemas | `xb_<domain>` | `xb_core` |
| Tables | snake_case, plural | `sales_performance_period` |
| Columns | snake_case, singular | `organization_id` |
| Index | `idx_<table>_<columns>` | `idx_workspaces_org_id` |
| Unique index | `uq_<table>_<columns>` | `uq_users_email` |
| FK constraint | `fk_<table>_<ref_table>` | `fk_workspaces_organizations` |
| Check constraint | `ck_<table>_<concept>` | `ck_users_role_kind_consistency` |
| Trigger | `trg_<table>_<event>` | `trg_workspaces_audit` |
| Function | `fn_<purpose>` | `fn_audit_row_change` |

### Types

| Concept | Postgres type | Notes |
|---|---|---|
| Primary / foreign key | `char(26)` | ULID, never NULL. No sequences. |
| Display strings | `varchar(N)` | Bounded per Spec 1 |
| Long text | `text` | |
| Money | `numeric(18,4)` | |
| Percentage / rate | `numeric(9,6)` | Decimal fraction |
| Ratio | `numeric(12,4)` | |
| Counts | `bigint` | |
| Days / lead times | `numeric(10,2)` | |
| Timestamps | `timestamptz` | UTC |
| Dates | `date` | Workspace-local interpretation |
| Enums | `varchar(N)` + CHECK | Native PG enums NOT used |
| JSONB | `jsonb` | Bounded to §7 purposes |
| Currency codes | `char(3)` | ISO 4217 |
| Timezone | `varchar(64)` | IANA name |

**Enums** are `varchar` + `CHECK (col IN (...))`. Native PG enums are not
used — adding values locks the table; removal is impossible.

**NULL policy:** every column is `NOT NULL` unless nullability is
meaningful. Empty string / zero are not substitutes for NULL.

**Time defaults:** `created_at DEFAULT now()`; `updated_at` maintained by
`fn_touch_updated_at` trigger; `deleted_at` set explicitly by soft delete.

### Connection context contract (§1.7)

Every DB connection sets per-request context before queries — RLS and
audit triggers read these. Enforced by `withConnection(actor, work)` in
`apps/api/src/plugins/audit-context.ts`.

```sql
SET LOCAL app.current_organization_id = '<org_ulid>';
SET LOCAL app.current_actor_id        = '<actor_ulid>';
SET LOCAL app.current_actor_kind      = '<actor_kind>';
SET LOCAL app.current_request_id      = '<request_ulid>';
SET LOCAL app.current_session_id      = '<session_ulid>';
SET LOCAL app.is_internal_manager     = 'true' | 'false';
```

`SET LOCAL` = transaction-scoped, no pool leakage. Missing context is a
programming error; a connection without `current_organization_id` reads
only platform-global tables.

### Standard column packs

| Pack | Columns |
|---|---|
| `PACK_TENANCY_ORG` | `organization_id char(26) NOT NULL` |
| `PACK_TENANCY_WS` | `+ workspace_id char(26) NOT NULL` |
| `PACK_TIMESTAMPS` | `created_at, updated_at timestamptz NOT NULL DEFAULT now()` |
| `PACK_SOFT_DELETE` | `deleted_at timestamptz NULL` |
| `PACK_ACTORS` | `created_by_actor_id, updated_by_actor_id, deleted_by_actor_id char(26) NULL` |
| `PACK_ROW_VERSION` | `row_version integer NOT NULL DEFAULT 1` |
| `PACK_SOURCE` | `source_upload_id char(26) NULL, source_system varchar(50) NOT NULL DEFAULT 'manual_upload', ingested_at timestamptz NOT NULL DEFAULT now()` |
| `PACK_ENGINE_VERSION` | `engine_key varchar(80), engine_version varchar(40), generated_at timestamptz DEFAULT now()` |

## 2. Multi-tenancy & RLS

Two independent layers: (1) **application** filters every query by
`organization_id` (+ `workspace_id`); (2) **database** RLS backstops it.
Both must independently be correct.

RLS enforces **organization-level isolation only**. Workspace/page authz
stays in the resolver (Spec 2). A user often legitimately queries
multiple workspaces — RLS only stops cross-org access.

Standard policy on every tenant-scoped table:

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
CREATE POLICY p_<t>_tenant_isolation ON <t>
  USING (
    organization_id = current_setting('app.current_organization_id', true)::char(26)
    OR current_setting('app.is_internal_manager', true) = 'true'
  )
  WITH CHECK ( <same> );
```

`is_internal_manager = 'true'` is the **only** RLS bypass.

**Platform-global tables (no RLS):** `organizations`, `internal_users`,
`internal_permissions`, `feature_flags`, `module_definitions`, `engines`,
`ai_provider_registry`, `ai_prompt_templates`. Access gated by app role
checks.

## 3. Soft delete

Soft-deletable tables: `deleted_at timestamptz NULL` +
`deleted_by_actor_id`. Query layer adds `WHERE deleted_at IS NULL` by
default. NULL→non-NULL transition emits `record.soft_deleted` audit.
After 90 days a controlled batch purge job hard-deletes (writes
`record.hard_deleted` first; never purges `audit_log`).

**Not** soft-deleted: append-only tables (audit_log, raw uploads, usage
logs), canonical period tables (upsert by composite key), summary tables
(rebuildable), forecast outputs (kept indefinitely).

## 4. Optimistic locking

Tables that need it carry `row_version integer NOT NULL DEFAULT 1`,
incremented by `fn_increment_row_version()` BEFORE UPDATE. PUT/PATCH on
these resources require `If-Match: <row_version>`; the UPDATE includes
`AND row_version = :expected` — 0 rows updated → `409 Conflict`.

Tables with `row_version`: `workspaces`, `users`, `actors`,
`workspace_permissions`, `page_permissions`, `internal_permissions`,
`forecast_rules`, `feature_flag_overrides`, `module_enablement`,
`shipments`, `insights`, `recommendation_overrides`.

Without `row_version`: append-only, canonical period tables, summary
tables, reports.

## 5. Audit

Two layers, same `xb_audit.audit_log` table:

- **Data audit** — `fn_audit_row_change()` trigger on tracked tables;
  captures INSERT/UPDATE/DELETE before/after/actor/request. UPDATE with
  `deleted_at` NULL→non-NULL → `record.soft_deleted`; reverse →
  `record.restored`.
- **Operation audit** — application writes business events
  (`permission.granted`, `module.enabled`/`module.disabled`,
  `feature_flag.enabled`/`disabled`, `report.generated`,
  `ai_recommendation.acknowledged`).

`audit_log` is append-only: RLS denies UPDATE/DELETE, no soft-delete
column, partitioned by month.

## 6. Partitioning

RANGE-by-month partitions via `pg_partman`, named
`<schema>.<table>_y<YYYY>m<MM>`. All queries must include the partition
key in WHERE for pruning; API endpoints enforce time bounds.

| Table | Partition col | PG retention |
|---|---|---|
| `xb_audit.audit_log` | `occurred_at` | 30d hot → BigQuery |
| `xb_canonical.sales_performance_period` | `period_start` | indefinite |
| `xb_canonical.ppc_performance_period` | `period_start` | indefinite |
| `xb_canonical.inventory_position` | `position_date` | indefinite |
| `xb_intelligence.insights` | `generated_at` | 1y hot → BigQuery |
| `xb_raw.upload_validation_errors` | `created_at` | 30d |

## 7. JSONB boundaries

JSONB permitted ONLY in: `audit_log.{before_state,after_state,metadata}`,
`insights.payload`, `recommendation_overrides.override_payload`,
`forecast_outputs.model_metadata`,
`upload_validation_errors.raw_row_snapshot`,
`ai_messages.{content,tool_calls}`,
`ai_usage_logs.{request_metadata,response_metadata}`,
`idempotency_keys.response_body`.

**Rule:** if you can imagine a SQL `WHERE` against the field, it is a
column, not a JSONB key. Prohibited for operational data, metrics
inputs, permissions, configuration, billing.

## 8. Indexing

Every table: PK on `id`. Tenant-scoped tables:

```sql
CREATE INDEX idx_<t>_org ON <t> (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_<t>_org_ws ON <t> (organization_id, workspace_id) WHERE deleted_at IS NULL;
-- ULIDs are time-ordered → (organization_id, id DESC) doubles as pagination + time scan
CREATE INDEX idx_<t>_org_id_desc ON <t> (organization_id, id DESC) WHERE deleted_at IS NULL;
```

Index every FK column. Partial indexes `WHERE deleted_at IS NULL`.

## 9. Retention

| Data class | PG retention | Archive | Hard delete |
|---|---|---|---|
| Audit log | 30d hot | BigQuery | Never |
| Validation errors | 30d (with upload) | — | Yes |
| Reports (PDF) | 30d hot (GCS) | cold/removed | PDF only; metadata kept |
| Soft-deleted rows | 90d | audit preserves | Yes |
| Insights | 1y hot | BigQuery | Never |
| Forecast outputs | indefinite | — | Never |
| Canonical commerce data | indefinite | — | **Never** |
| Summary tables | live, rebuildable | — | N/A |
| AI conversations | 90d hot | optional BigQuery | configurable |
| AI usage logs | 1y hot | BigQuery | Never |

**Canonical commerce data (sales, PPC, inventory, shipment history) is
never deleted by retention.** Only logs, files, generated artifacts, and
soft-deleted records are purged.

## 10. Core DDL (`xb_core`)

### organizations (platform-global, no RLS)

```sql
CREATE TABLE xb_core.organizations (
  id                    char(26)     PRIMARY KEY,
  display_name          varchar(200) NOT NULL,
  legal_name            varchar(200) NULL,
  slug                  varchar(64)  NOT NULL,
  organization_status   varchar(40)  NOT NULL DEFAULT 'active',
  billing_status        varchar(40)  NOT NULL DEFAULT 'not_configured',
  default_currency_code char(3)      NOT NULL,
  default_timezone      varchar(64)  NOT NULL DEFAULT 'UTC',
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  deleted_at            timestamptz  NULL,
  archived_at           timestamptz  NULL,
  suspended_at          timestamptz  NULL,
  created_by_actor_id   char(26)     NULL,
  updated_by_actor_id   char(26)     NULL,
  deleted_by_actor_id   char(26)     NULL,
  row_version           integer      NOT NULL DEFAULT 1,
  CONSTRAINT ck_organizations_status  CHECK (organization_status IN ('active','suspended','archived')),
  CONSTRAINT ck_organizations_billing CHECK (billing_status IN ('active','past_due','cancelled','trial','not_configured')),
  CONSTRAINT ck_organizations_slug_format CHECK (slug ~ '^[a-z0-9-]{1,64}$')
);
CREATE UNIQUE INDEX uq_organizations_slug ON xb_core.organizations (slug);
```

### actors

Polymorphic action-performing entity. Every user/API-key/system-job/
connector/AI-agent has an `actors` row.

```sql
CREATE TABLE xb_core.actors (
  id                  char(26)     PRIMARY KEY,
  organization_id     char(26)     NULL,   -- NULL for platform-global actors
  actor_kind          varchar(40)  NOT NULL,
  display_name        varchar(200) NOT NULL,
  actor_status        varchar(40)  NOT NULL DEFAULT 'active',
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  deleted_at          timestamptz  NULL,
  created_by_actor_id char(26)     NULL,
  updated_by_actor_id char(26)     NULL,
  row_version         integer      NOT NULL DEFAULT 1,
  CONSTRAINT ck_actors_kind   CHECK (actor_kind IN ('internal_user','organization_user','api_key','system_job','connector','ai_agent')),
  CONSTRAINT ck_actors_status CHECK (actor_status IN ('active','deactivated','revoked')),
  CONSTRAINT fk_actors_org FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id)
);
```

- internal user → `internal_user`, `organization_id IS NULL`
- org user → `organization_user`, `organization_id = their org`
- API key → `api_key`, `organization_id = issuer`
- system job → `system_job`, `organization_id IS NULL`
- AI agent → `ai_agent`, `organization_id = on behalf of`

### users

Always has an `actors` row. `actors` = identity-agnostic action concept;
`users` = human-specific auth fields.

```sql
CREATE TABLE xb_core.users (
  id                     char(26)     PRIMARY KEY,
  actor_id               char(26)     NOT NULL UNIQUE,
  user_kind              varchar(40)  NOT NULL,
  organization_id        char(26)     NULL,   -- NULL for internal users
  username               varchar(120) NOT NULL,
  display_name           varchar(200) NOT NULL,
  email                  varchar(254) NOT NULL,   -- nullable in practice (auth pivot)
  password_hash          varchar(255) NOT NULL,
  internal_user_role     varchar(40)  NULL,
  organization_user_role varchar(40)  NULL,
  user_status            varchar(40)  NOT NULL DEFAULT 'pending_invite',
  mfa_enabled            boolean      NOT NULL DEFAULT false,
  mfa_secret_encrypted   bytea        NULL,
  last_login_at          timestamptz  NULL,
  password_changed_at    timestamptz  NULL,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  deleted_at             timestamptz  NULL,
  created_by_actor_id    char(26)     NULL,
  updated_by_actor_id    char(26)     NULL,
  deleted_by_actor_id    char(26)     NULL,
  row_version            integer      NOT NULL DEFAULT 1,
  CONSTRAINT fk_users_actor FOREIGN KEY (actor_id) REFERENCES xb_core.actors(id),
  CONSTRAINT fk_users_org   FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT ck_users_kind   CHECK (user_kind IN ('internal','organization')),
  CONSTRAINT ck_users_status CHECK (user_status IN ('active','deactivated','pending_invite')),
  CONSTRAINT ck_users_role_consistency CHECK (
    (user_kind='internal'     AND internal_user_role IS NOT NULL AND organization_user_role IS NULL AND organization_id IS NULL)
    OR
    (user_kind='organization' AND organization_user_role IS NOT NULL AND internal_user_role IS NULL AND organization_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_users_username ON xb_core.users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_users_email    ON xb_core.users (lower(email))    WHERE deleted_at IS NULL;
```

> Role vocabulary has since expanded to 5 tiers (see CLAUDE.md) —
> `super_admin` / `internal_manager` / `internal_staff` /
> `organization_admin` / `organization_user`. Reconcile the role CHECKs
> against the latest migration.

### workspaces

```sql
CREATE TABLE xb_core.workspaces (
  id                    char(26)      PRIMARY KEY,
  organization_id       char(26)      NOT NULL,
  workspace_name        varchar(200)  NOT NULL,
  workspace_type        varchar(40)   NULL,   -- optional; UI-controlled vocabulary
  workspace_status      varchar(40)   NOT NULL DEFAULT 'active',
  default_currency_code char(3)       NOT NULL,
  timezone              varchar(64)   NOT NULL DEFAULT 'UTC',
  dos_target_days       numeric(6,2)  NOT NULL DEFAULT 30.0,
  forecast_rule_id      char(26)      NULL,
  archived_at           timestamptz   NULL,
  -- PACK_TIMESTAMPS, PACK_SOFT_DELETE, PACK_ACTORS, PACK_ROW_VERSION
  CONSTRAINT fk_workspaces_org FOREIGN KEY (organization_id) REFERENCES xb_core.organizations(id),
  CONSTRAINT ck_workspaces_status CHECK (workspace_status IN ('active','archived')),
  CONSTRAINT ck_workspaces_dos_positive CHECK (dos_target_days >= 0)
);
CREATE UNIQUE INDEX uq_workspaces_org_name ON xb_core.workspaces (organization_id, lower(workspace_name)) WHERE deleted_at IS NULL;
```

> `workspace_type` was originally a CHECK enum, then made free-text
> (migration 0019), and is now an **optional, UI-controlled select**
> (Marketplace / DTC / Warehouse / General). The DB column stays
> nullable varchar with no CHECK — the vocabulary is enforced in the web
> dialogs only.

### Other `xb_core` tables

- `api_keys` — stub, created v1, unused until API access ships.
- `warehouses` — per org/workspace; code, address, `is_fba`, `is_active`.
- `workspace_permissions` — user × workspace × access_level.
- `page_permissions` — user × workspace × page × access_level.
- `internal_permissions` — internal user × org × access_level.
- `workspace_permission_snapshots` — frozen state at archival.
- `module_definitions` (platform-global) / `module_enablement` (per org/ws).
- `feature_flags` (platform-global) / `feature_flag_overrides` (per scope).
- `forecast_rules` — per workspace.

Access-level vocabulary: `NONE` (hidden) / `VIEW` / `EDIT` / `CUSTOM`
(system-generated when page permissions are mixed; never manually
selected).
