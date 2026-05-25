# engineering-rules

Canonical engineering constraints. Violations get caught in PR review or CI guards.

## 1. PR discipline

- **Atomic PRs**. One slice per PR. Forbidden mixes: migration + mapper, mapper + engine, engine + UI, backend + frontend refactor.
- Conventional-commit style (`feat`, `fix`, `chore`, `refactor`, `docs`).
- Update relevant `docs/claude/*` + auto-memory `MEMORY.md` as decisions solidify.
- Backend correctness first. UI cannot ship ahead of the backend guard.
- Replace, don't layer. Retire generic pathways once a typed canonical replacement ships.

## 2. Forbidden patterns (CI-bannable)

- Inline role checks: `actor.effectiveRole === '...'` / `user.effectiveRole === '...'` outside `apps/api/src/lib/permissions.ts` + `apps/web/src/lib/use-can.ts`.
- Raw color utilities (`text-orange-500`, `bg-blue-50`, hex, rgb). Use semantic tokens.
- Hardcoded marketplace branches: `if (platform === 'amazon')` past the mapper.
- Frontend-derived authorization. UI gating must mirror a backend guard.
- Workspace ID from request body for tenancy. Always `requireActiveWorkspace()`.
- Frontend business math (ACOS / TACOS / DOS / ROAS / profitability / forecasts).
- Em dashes in user-facing copy. Emoji in UI.
- `NEXT_PUBLIC_*` secrets. Only public API base URL is public.
- Client component on a static-export dynamic route.
- Secrets in committed files (incl. comments). Repo is **public**.

## 3. Transactions + DB

- Every DB call goes through `withConnection(actor, work)` in `apps/api/src/plugins/audit-context.ts`. No direct `app.pg.query`.
- **No nested transactions** inside `app.withConnection`. The helper runs one transaction; nest at your peril.
- No silent catch-all DB suppression. Don't swallow FK errors as "missing table". Let the orchestrator decide.
- `SET LOCAL` only (transaction-scoped). No `SET` without LOCAL — pool leakage.
- Migrations: one slice each, idempotent where safe, never destructive without an explicit rollback path. See [backend-standards §3](backend-standards.md#3-migrations).
- Optimistic locking: any mutable resource with `row_version` requires `If-Match` → 409 on mismatch.

## 4. Capability guards

- New capability lands in one file: `apps/api/src/lib/permissions.ts`. Mirror in `apps/web/src/lib/use-can.ts` same PR.
- No re-deriving role logic in services.
- Locked addition sequence in [permissions §11](permissions.md#11-capability-addition-sequence-locked). Never invert.

## 5. Workspace derivation

- Backend writes derive workspace from active session via `requireActiveWorkspace()`.
- Frontend reads include active workspace in query keys (see [frontend-standards §1](frontend-standards.md#1-react-query)).
- Workspace switch invalidates all workspace-scoped caches.

## 6. Canonical → engine → frontend (the three-layer rule)

| Layer | Stores / does |
|---|---|
| Canonical | additive facts only |
| Engine | derivation, aggregation, ratios, versioned output |
| Frontend | renders engine output + provenance |

Every ingestion + engine PR reviewed against this first.

## 7. Public-repo security hygiene

- Pre-commit secret scan mandatory.
- `apps/api/src/config/env.ts` ↔ `apps/web/src/lib/env.ts` server/client env split.
- Every intelligence / canonical PR checked for RBAC + org-isolation leak.
- Treat every diff as if scraping crawlers will index it.

## 8. Ingestion + mapper rules

- Connector-specific code lives only in templates / validators / mappers.
- After mapper: channel-agnostic. No platform branches.
- Validators capture dimensional fields. Mapper normalizes onto shared dimension set.
- Re-upload safety: UPSERT on natural key, never duplicate canonical rows.
- Unresolved-SKU rows are operational workflow, not error scaffolding.

## 9. Deletion + purge

- Centralized purge orchestrator. No per-service ad-hoc deletes.
- `deleted_at` ≠ `purged_at`. Separate fields, separate states.
- Audit FKs `ON DELETE SET NULL`, never CASCADE.
- Protected entities (self row, super_admin) never purgeable; enforce backend-first.
- See [data-model §6](data-model.md#6-deletion-lifecycle-canonical) for the full state machine.

## 10. Audit

- Data audit = trigger; never disable for "speed".
- Operation audit = explicit app writes. Required on every grant, role change, purge, restore, report generation, AI recommendation acknowledgement.
- `audit_log` is append-only; no UPDATE/DELETE policy.

## 11. AI

- AI reads engine output only. No raw uploads, no raw canonical scans.
- AI inherits workspace + permission scope.
- AI never overrides numbers. Narrative only.
- AI prompts + responses logged to `xb_ai.ai_messages` + `ai_usage_logs`.

## 12. Semantic tokens

- Tokens defined in `packages/ui`. All app code consumes tokens, never raw Tailwind colors.
- Chart colors via `--chart-*` tokens. See [design-system §7](design-system.md#7-charts-recharts).
- Adding a token = PR against `packages/ui` first.

## 13. Cross-package builds

- `packages/types` + `packages/auth` consumers import from `dist/`.
- After type changes: `pnpm --filter @xb/types build && pnpm --filter @xb/auth build` before typechecking apps.

## 14. Standard governance audit prompts (every PR)

- Any hardcoded color? Any raw `orange-*`?
- Any mixed scopes (FE + BE in same PR)?
- Actor-unsafe query key?
- Workspace ID from `req.body`?
- Em dash in copy? Emoji?
- Frontend secret?
- Client component on a static-export dynamic route?

## Cross-refs

[architecture](architecture.md) · [permissions](permissions.md) · [backend-standards](backend-standards.md) · [frontend-standards](frontend-standards.md) · [design-system](design-system.md) · [qa-checklists](qa-checklists.md)
