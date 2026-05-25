# current-state

Hot operational memory. Short. Reflects the active branch only. Update at PR merge / re-sequencing — not on every commit.

> Cold memory (architecture, rules, standards) lives in the rest of `docs/claude/*`. Read this file last for context **right now**, then dive into the relevant cold-memory doc.

**Last updated:** 2026-05-25

## Active branch

`feat/permissions-canonical-rbac`

## Active PR direction

Centralize RBAC into a single canonical module.

- **Backend:** `apps/api/src/lib/permissions.ts` — capability guards (`canManageInternalUsers`, `canViewOrganizations`, `canAccessPlatformAdmin`, `canCreateUserWithRole`, `canDeleteActor`, `hasOrgScope`).
- **Frontend mirror:** `apps/web/src/lib/use-can.ts` — `useCan(capability)` + `can(user, capability)` + `canDeleteActor(user, target)`.
- **In-flight edits:** `apps/api/src/services/users-service.ts`, `apps/web/src/app/(app)/settings/page.tsx`, `apps/web/src/components/{add-user-dialog,internal-users-panel,sidebar}.tsx` — removing inline `effectiveRole ===` in favor of capability guards.
- **Follow-up planned:** CI guard banning `effectiveRole ===` outside the permissions module.

## Current priority (this slice)

1. Land canonical RBAC module + mirror.
2. Replace remaining inline role checks across services + UI.
3. Add CI guard for inline role checks (see [forbidden-patterns A1](reference/forbidden-patterns.md#a-authorization)).

## Recent stabilization (merged, last 12 commits)

| PR | What |
|---|---|
| #50 | Purge: protect self-row + super_admin from permanent deletion |
| #49 | Purge: drop nested transaction + stop swallowing FK errors |
| #48 | `<ComingSoonState />` primitive for unfinished modules |
| #47 | Landing route → auth-aware redirect, no marketing surface |
| #46 | Recycle Bin admin surface (Grace PR-3) |
| #45 | Audit-findings sweep from recent merge wave |
| #44 | Grace-purge orchestrator + force-delete-now + sweep endpoint |
| #43 | Drop Academy from left nav (single-source from topbar Help) |
| #42 | Retire raw orange palette from Tailwind preset |
| #41 | Simplify topbar actions, unify academy branding |
| #40 | Migrate consumers to semantic tokens + raw-color CI guard |
| #35 | Notification center shell |

## Next priority (after current slice)

Pre-engine foundations (locked 10-step) — see [roadmap §3](roadmap.md#3-pre-engine-foundations-locked-10-step-skip-none):

1. Auth + cache hardening
2. Topbar cleanup
3. Permission matrix UI ← P4 of permission program
4. Metric registry
5. Time engine
6. Job infra
7. Currency engine
8. SKU alias hardening
9. Design system consolidation
10. Engines begin (Sales intelligence)

## Blocked / deferred (current)

| Item | Blocker |
|---|---|
| Unit Economics module | Expenses ingestion (canonical not landed) |
| Forecasting UI | Forecasting engine (A10) |
| Real engine implementations | Pre-engine foundations 1–9 |
| Paid AI providers | Foundation phase: Groq / OpenRouter / Ollama stubs only |
| Forgot-password UI | Deferred until Resend wired |
| Email invitations | Dormant; admins create users directly |

## Open operator requests (carry-over)

- Cloud SQL pool sizing (`apps/api/src/plugins/db.ts`).
- Redis caching for hot reads (`/me`, accessible workspaces, org list).
- Worker expansion for canonical refresh / engine work.
- Session retention + JWT rotation review.
- Audit `NEXT_PUBLIC_*` env vars.
- RASP investigation.

## Coordination notes

- Repo is **public**. Pre-commit secret scan required on every PR.
- Cross-package builds: rebuild `@xb/types` + `@xb/auth` before app typecheck.
- Active platform: Windows + PowerShell primary, Bash also available.
- Super_admin = `faizan` (singleton); rotate via `pnpm --filter @xb/api reset:admin`.

## How to update this file

- On PR merge: bump stabilization table + remove the row from "active".
- On priority shift: rewrite §"Current priority" + §"Next priority".
- On unblock: move from "Blocked" to "Active" or "Next priority".
- Bump **Last updated** date.
- Keep it under ~120 lines. If it grows, push detail into [roadmap](roadmap.md).
