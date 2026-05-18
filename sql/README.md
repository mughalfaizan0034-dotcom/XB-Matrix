# SQL Migrations

Migrations live in `sql/migrations/`. They are applied by the migrations runner in `apps/api/src/db/migrate.ts`.

## Naming

```
<version>_<name>.sql           # forward migration (required)
<version>_<name>.down.sql      # rollback (optional, local-dev only)
```

`version` is a zero-padded integer (`0001`, `0002`, …). Files are applied in lexical order.

## Rules (from Spec 3 §20)

1. Forward-only in production. Down migrations are local-dev convenience.
2. Idempotent (`CREATE … IF NOT EXISTS`, `DROP … IF EXISTS`).
3. Each migration is wrapped in a single transaction by the runner.
4. Reviewed and approved before merging.
5. Blocking changes (e.g., `NOT NULL` on populated columns) are multi-step.
6. `CREATE INDEX CONCURRENTLY` in production (cannot run in a transaction — file a separate non-transactional migration when needed).

## Usage

```sh
pnpm db:migrate     # apply pending
pnpm db:rollback    # roll back last
pnpm db:status      # list applied/pending
```

## Current foundation set

| Version | File | What it does |
|---|---|---|
| 0001 | `0001_extensions_and_schemas.sql` | Required extensions + all `xb_*` schemas |
| 0002 | `0002_functions.sql` | `gen_ulid()`, `fn_increment_row_version()`, `fn_audit_row_change()` |
| 0003 | `0003_audit_log.sql` | `xb_audit.audit_log` (partitioned by month) + RLS + initial partitions |
| 0004 | `0004_core_tenancy.sql` | `organizations`, `actors`, `users` |
| 0005 | `0005_core_workspaces.sql` | `workspaces`, `idempotency_keys` |
| 0006 | `0006_core_permissions.sql` | `workspace_permissions`, `page_permissions`, `internal_permissions`, `workspace_permission_snapshots` |

Canonical / intelligence / AI / reports / master schemas are intentionally empty in this phase.
