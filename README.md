# xB Matrix

Enterprise-grade, multi-tenant AI-powered commerce intelligence platform.

> **Status:** Foundation phase. Architecture, scaffolding, auth, resolver, and database foundation only. Business logic engines (Sales / PPC / Inventory / Shipments / Forecasting) are intentionally not implemented yet.

## What it is

xB Matrix is a SaaS commerce operating system focused on:

- Sales intelligence
- PPC analytics
- Inventory forecasting
- Shipment planning
- Operational insights
- AI-powered explanations (over engine outputs only — never as source of truth)
- Reporting
- Warehouse management
- Unit economics (future)

## Tech stack

**Monorepo:** Turborepo + pnpm workspaces.

**Frontend** (`apps/web`): Next.js 14 (App Router), React 18, TypeScript, TailwindCSS, shadcn/ui, TanStack Query, TanStack Table, Recharts.

**Backend API** (`apps/api`): Node.js 20, Fastify, TypeScript, PostgreSQL 16, Redis, BigQuery, Cloud Tasks.

**Worker** (`apps/worker`): Cloud Tasks consumer for async jobs (uploads, reports, forecasts).

**Shared packages:**

| Package | Purpose |
|---|---|
| `@xb/config` | Typed env & runtime configuration |
| `@xb/types` | Shared TypeScript types |
| `@xb/auth` | Centralized resolver, session, RBAC |
| `@xb/ui` | shadcn/ui-based component library, theme |
| `@xb/calculations` | All business calculations (backend-invoked) |
| `@xb/ai` | Provider-agnostic AI layer (Groq, OpenRouter, Ollama) |

**Hosting:** GitHub Pages (web), Google Cloud Run (api + worker).

## Architectural non-negotiables

1. **Frontend renders only.** All calculations happen on the backend.
2. **No frontend authorization trust.** Backend re-checks every action.
3. **Centralized resolver.** All authorization decisions flow through one resolver in `@xb/auth`.
4. **ULID** (`char(26)`) for every primary key.
5. **`numeric(18,4)`** for all monetary values.
6. **`timestamptz` UTC** for all timestamps.
7. **Soft delete + 90-day hard purge** with audit.
8. **Audit-first / append-only** state changes.
9. **Engine version tracking** on every intelligence output.
10. **Idempotency-first** writes.
11. **PostgreSQL RLS** for org isolation, with app-level filtering as defense in depth.
12. **No frontend business calculations. Ever.**

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full rationale.

## Repository layout

```
apps/
  web/        Next.js 14 frontend
  api/        Fastify backend
  worker/     Cloud Tasks worker
packages/
  config/     Typed env + runtime config
  types/      Shared TypeScript types
  auth/       Centralized resolver + session
  ui/         Component library + theme
  calculations/  Backend-only calculations
  ai/         Provider-agnostic AI layer
infrastructure/
  docker/     Dockerfiles for api + worker
  cloudrun/   Cloud Run service definitions
docs/         Architecture, contributing, runbooks
sql/          Database migrations (Spec 3 implementation)
```

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16 (local) or Cloud SQL access
- Redis (local) or managed Redis

### Install

```sh
pnpm install
cp .env.example .env.local  # fill in values
```

### Run dev

```sh
pnpm dev                    # turbo runs all apps
pnpm --filter @xb/web dev   # web only
pnpm --filter @xb/api dev   # api only
```

### Database migrations

```sh
pnpm db:migrate            # apply pending migrations
pnpm db:rollback           # roll back last migration
```

## Design system

- **Navy** `#0F2D4B` primary, **Orange** `#F0691E` accent
- **Background** `#F8FAFC`, **Border** `#E2E8F0`
- **Text:** primary `#0F172A`, secondary `#475569`
- **Quicksand** for titles & section headings
- **Inter** for body text **and all numeric content** (with `font-variant-numeric: tabular-nums`)

UI direction: Linear, Stripe Dashboard, Retool, modern BI tools.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## License

UNLICENSED — proprietary. All rights reserved.
