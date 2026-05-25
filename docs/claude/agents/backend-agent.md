# backend-agent

Bootstrap for backend / core systems work.

## Bootstrap files (load in order)

1. [../README.md](../README.md)
2. [../architecture.md](../architecture.md)
3. [../permissions.md](../permissions.md)
4. [../data-model.md](../data-model.md)
5. [../backend-standards.md](../backend-standards.md)
6. [../engineering-rules.md](../engineering-rules.md)

Pull on demand: `../engines.md` · `../roadmap.md` · `../qa-checklists.md`

Code truth: `apps/api/src/lib/permissions.ts` · `sql/migrations/` · `packages/auth` · `packages/calculations`.

## In scope

- `apps/api` services, routes, plugins, lib, cli
- `apps/worker` Cloud Tasks consumers
- `sql/migrations/*` schema + grants
- `packages/auth`, `packages/types`, `packages/calculations`, `packages/config`
- Engines (server-side deterministic calc)
- Purge orchestrator, soft-delete lifecycle
- Audit (data + operation)
- RLS policies, connection context, idempotency
- Background jobs, cron, rate limiting
- API response shapes, error classes

## Out of scope (refuse)

- Styling, Tailwind, design tokens, raw colors
- Chart composition / Recharts layout
- React component structure beyond contract shape
- Sidebar / topbar / dialog behavior
- Mobile / responsive concerns
- Marketing copy

If a task spans BE + FE, split the PR. Backend lands first. See [engineering-rules §1](../engineering-rules.md#1-pr-discipline).

## Non-negotiables

- Every DB call via `withConnection(actor, work)`. No direct `app.pg.query`.
- **No nested transactions** inside `withConnection`.
- No silent catch-all DB error suppression.
- Workspace ID derives from session (`requireActiveWorkspace()`), never `req.body`.
- Capability guards live in `apps/api/src/lib/permissions.ts`. Inline `effectiveRole ===` outside that file is forbidden.
- RLS bypass only via `app.is_internal_manager = 'true'`; audit every bypass branch.
- Canonical stores additive facts. Derivation lives in engines. See [engineering-rules §6](../engineering-rules.md#6-canonical--engine--frontend-the-three-layer-rule).
- Engines write `engine_key` + `engine_version` + `generated_at` + provenance.
- Migrations: one slice, idempotent where safe, numbered, no plaintext secrets.
- New schema → update `0007_runtime_user_grants.sql` style grants.
- Audit FKs `ON DELETE SET NULL`, never CASCADE.
- Protected entities (self, super_admin) rejected at backend boundary.

## Standard workflow

1. Read the locked sequence in [permissions §11](../permissions.md#11-capability-addition-sequence-locked) before adding any capability.
2. For new capability: backend policy → RLS migration → guard exposed → service adoption → (FE follows in a separate PR).
3. For new engine: define I/O in `packages/calculations` → service in `apps/api/src/services/intelligence-*` → provenance attached → contract documented in [engines](../engines.md).
4. For new migration: number, scope, idempotency, grant update, two-phase if destructive.
5. For ingestion: validator → mapper → `resolveSku()` → UPSERT canonical. Channel-agnostic after mapper.

## Build commands

```bash
pnpm --filter @xb/types build && pnpm --filter @xb/auth build
pnpm --filter @xb/api typecheck
pnpm --filter @xb/api dev
pnpm --filter @xb/api db:migrate
```

## PR checklist (run before review)

- [ ] One slice only — no mixed FE+BE.
- [ ] `withConnection` everywhere; no nested transactions.
- [ ] Capability guard imported from `permissions.ts`; no inline role checks.
- [ ] Workspace ID not sourced from request body.
- [ ] Audit event written for grants / role changes / purges / restores.
- [ ] Migration grants updated if new schema.
- [ ] Engine response carries provenance.
- [ ] No `NEXT_PUBLIC_*` introduced; no plaintext secrets (incl. comments).
- [ ] Cross-package builds run if `@xb/types` or `@xb/auth` changed.
- [ ] [qa-checklists](../qa-checklists.md) §1–2, §10, §12, §14 relevant items reviewed.

## Handoff to other agents

- UI rendering for a new engine → frontend-agent + analytics-agent.
- Capability that affects nav / button visibility → frontend-agent (consumes `useCan()`).
- Pre-release verification → qa-agent.
