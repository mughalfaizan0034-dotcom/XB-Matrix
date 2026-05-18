# Contributing to xB Matrix

## Local setup

```sh
# 1. Install pnpm (one-time)
npm i -g pnpm@9

# 2. Install deps
pnpm install

# 3. Copy env files
cp .env.example .env.local
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Run a local Postgres 16 + Redis (Docker is fine):
#    docker run -d --name xb-pg     -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
#    docker run -d --name xb-redis  -p 6379:6379 redis:7

# 5. Apply migrations
pnpm db:migrate

# 6. Dev all apps
pnpm dev
```

| App | URL |
|---|---|
| web | http://localhost:3000 |
| api | http://localhost:4000 |
| worker | http://localhost:4100 |

## Architectural rules — read these before opening a PR

See [ARCHITECTURE.md](ARCHITECTURE.md). The short list:

- Frontend renders only — **no** business calculations on the frontend.
- All authorization goes through the resolver in `packages/auth`. No ad-hoc permission checks.
- ULID (`char(26)`) for IDs. `numeric(18,4)` for money. `timestamptz` UTC for time.
- Tenant-scoped tables have RLS. App still filters by `organization_id`. Defense in depth.
- Use `app.withConnection(actor, work)` — never call `app.pg.query` directly from a route handler.
- Soft delete with `deleted_at`. Hard purge happens after 90 days, via worker + audit.
- Every numeric value in the UI uses `tabular-nums`. The `Metric` component and `<table>` elements do this by default.
- Engine outputs always carry `engine_key`, `engine_version`, `generated_at`.

## Workflow

1. Branch off `main` (`git checkout -b feat/<short-name>`).
2. Make changes. Run `pnpm typecheck` and `pnpm build` locally.
3. Open a PR. Fill in the PR template checklist.
4. CI runs typecheck + lint + build. Merge when green and reviewed.

## SQL migrations

- Files live in `sql/migrations/<NNNN>_<name>.sql` (lexical-order).
- Each migration is wrapped in a transaction by the runner.
- All DDL must be idempotent (`CREATE … IF NOT EXISTS`, `DROP … IF EXISTS`).
- New tables follow Spec 3 conventions (column packs, RLS, triggers).
- New tables that hold tenant data MUST enable + force RLS.
- Down migrations (`.down.sql`) are for local dev only — production is forward-only.

## Coding conventions

- TypeScript strict mode, ESM throughout.
- Imports: type-only imports use `import type { … }`.
- Function exports preferred over default exports.
- No `any` without a comment explaining why.
- No console.log — use `app.log.info|warn|error|debug`.
- Branded types (`ActorId`, `Money`, etc.) over raw strings/numbers wherever they cross a boundary.

## Where stuff lives

| What | Where |
|---|---|
| New table | `sql/migrations/<NNNN>_…sql` + add Spec 3 amendment |
| New API route | `apps/api/src/routes/` + register in `server.ts` |
| New worker task type | `apps/worker/src/routes/tasks.ts` + handler |
| New authorization rule | `packages/auth/src/providers/` |
| New shared component | `packages/ui/src/components/` |
| New money helper | `packages/calculations/src/money.ts` |
| New AI provider | `packages/ai/src/providers/` |

## Commits

- Conventional-ish: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`. Short subject. Body explains *why*.
- One logical change per commit.
