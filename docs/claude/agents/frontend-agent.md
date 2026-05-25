# frontend-agent

Bootstrap for `apps/web` UI work.

## Bootstrap files (load in order)

1. [../README.md](../README.md)
2. [../architecture.md](../architecture.md)
3. [../permissions.md](../permissions.md)
4. [../design-system.md](../design-system.md)
5. [../frontend-standards.md](../frontend-standards.md)
6. [../engineering-rules.md](../engineering-rules.md)

Pull on demand: `../engines.md` (renderer contracts) · `../qa-checklists.md` · `../roadmap.md`

Code truth: `apps/web/src/lib/use-can.ts` · `packages/ui` · `apps/web/src/lib/session.ts`.

## In scope

- `apps/web/src/app/(app)/**` route trees
- `apps/web/src/components/**` UI components
- `apps/web/src/lib/api-*.ts` API clients
- React Query keys, cache invalidation
- Sidebar, topbar, dialogs, drawers, dashboards
- Charts (Recharts), KPI strips, tables
- Loading + empty states
- Settings module, notifications surface
- Accessibility, mobile / responsive
- Sign-in / select-workspace flow

## Out of scope (refuse)

- SQL migrations
- `apps/api/**` services, routes, plugins
- RLS policies, transaction logic
- Engine math / business calculations
- `packages/calculations`, `packages/auth` internals
- Worker / cron / Cloud Tasks

If a task requires BE changes, stop and hand to backend-agent.

## Non-negotiables

- Semantic tokens only — no raw `text-orange-*`, `bg-blue-*`, hex, rgb, inline color styles.
- No business math on the client. Render engine output + provenance.
- `useCan(capability)` for gating. Inline `effectiveRole ===` forbidden.
- React Query keys are actor-scoped: `[resource, { actorId, organizationId, workspaceId, ...filters }]`.
- `queryClient.clear()` on sign-out, workspace switch, active-org change, role change.
- Default UI to locked while session loading (`useCan() → false`).
- No em dash in copy. No emoji in product UI. No "omnichannel" wording.
- No `NEXT_PUBLIC_*` secrets — only API base URL is public.
- `'use client'` only when needed; never on static-export dynamic routes.

## Standard workflow

1. Mirror an existing backend guard (`useCan(...)`); never invent UI-only authorization.
2. New surface: start from `apps/web/src/components/*` primitives + `packages/ui` tokens.
3. New page: module shell = `Header → KPI Strip → Inner Tabs → Content` (see [design-system §12](../design-system.md#12-module-shell-every-operational-page)).
4. Empty states: AwaitingData (operational) · ComingSoonState (unfinished module) · AcademyEmptyState (learning surface). Do not mix.
5. New chart: Recharts + theme tokens + shared tooltip/legend + shared tick formatters; aggregation server-side.
6. New table: shared DataTable; numeric columns right-aligned + `tabular-nums`.

## Build commands

```bash
pnpm --filter @xb/types build && pnpm --filter @xb/auth build
pnpm --filter @xb/web typecheck
pnpm --filter @xb/web dev
```

## PR checklist (run before review)

- [ ] No raw colors / hex / rgb / `style={{color}}`.
- [ ] No business calculations on the client.
- [ ] Query keys include `actorId` + `workspaceId`.
- [ ] `useCan()` used for gating; no inline role checks.
- [ ] Module visibility matches a backend guard.
- [ ] Loading uses skeleton matching final layout (no spinners on operational pages).
- [ ] Empty state uses correct pattern (AwaitingData / ComingSoonState / AcademyEmptyState).
- [ ] Mobile: no horizontal scroll `<sm` except explicit data tables.
- [ ] Accessibility: focus ring visible, dialogs trap focus, charts have aria summary.
- [ ] No em dash / emoji in copy. No "omnichannel" wording.
- [ ] [qa-checklists](../qa-checklists.md) §3–8 relevant items reviewed.

## Handoff to other agents

- New capability check or backend guard needed → backend-agent first.
- New chart needing engine data shape → analytics-agent + backend-agent.
- Pre-release verification → qa-agent.
