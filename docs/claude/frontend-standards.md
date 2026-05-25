# frontend-standards

`apps/web` conventions. Companion: [design-system](design-system.md).

## 1. React Query

- Single `QueryClient` per app shell.
- **Actor-scoped query keys** — required structure:
  ```ts
  [resource, { actorId, organizationId, workspaceId, ...filters }]
  ```
- Stale time: 60s default. KPI / engine reads can go higher (5m) when paired with explicit invalidation.
- Mutation success → `invalidateQueries({ queryKey: [resource] })` scoped to the same workspace.

### Forbidden

- Cross-actor cache reuse.
- Keys without `actorId` + `workspaceId` for workspace-scoped data.
- `staleTime: Infinity` on session-derived data.

## 2. `queryClient.clear()`

Call on:
- Sign-out
- Workspace switch
- Active-org change (internal users)
- Role / permission change observed via `/v1/auth/me`

Never partial-invalidate when actor identity changes — clear everything.

## 3. Session

- `useSession()` from `apps/web/src/lib/session.ts` is the only source for the authenticated user.
- `useSession()` hydrates from `/v1/auth/me`. SSR-safe shape.
- Treat undefined session as "loading" (default locked). Never assume null = unauthenticated until query resolves.
- `useCan()` returns `false` while loading; UI stays locked.

## 4. Authorization in UI

- Use `useCan(capability)` for gating. Never inline role checks.
- Disabled buttons + missing nav items must mirror the backend guard. A 403 is a bug if the UI showed the action.
- Module visibility in sidebar driven by capability + workspace permissions resolved server-side.

## 5. Loading states

- Skeleton match the final layout. No spinners on operational pages.
- Per-card skeleton on KPI strips. Per-row skeleton on tables.
- No flicker on workspace switch — show layout shell + skeleton, then data.
- Empty data ≠ loading. Use AwaitingData when query resolved + empty.

## 6. Tables

- Built on the shared DataTable primitive (`packages/ui`).
- Server-side pagination, sort, filter. No client-side aggregation on > 100 rows.
- Column shape: `header`, `accessor`, `cell`, `align`, `width`. Numeric columns right-aligned + `tabular-nums`.
- Row actions: kebab menu, never inline icon clusters.
- Empty: AwaitingData inside the table body, full-bleed.

## 7. Dashboards / KPI strips

- 3–6 KPI cards per row, fixed height.
- Card receives engine output + provenance. Never recompute on the client.
- Trend / chart components below KPI strip, lazy-loaded.
- All chart aggregation server-side. See [engines §12](engines.md#12-frontend-rules).

## 8. Charts

- Library: Recharts (locked).
- Composition: `ResponsiveContainer` → typed chart wrapper from `packages/ui`.
- Theme tokens only (`--chart-1` … `--chart-6`).
- Tooltip + legend in token-driven shared components.
- Tick formatter shared util: `formatCurrency`, `formatCompact`, `formatPercent`.

## 9. Sidebar / topbar

- Sidebar = capability-driven module list (see [design-system §14](design-system.md#14-sidebar--topbar)).
- Topbar = workspace switcher · global search (future) · profile menu.
- No back-arrow on `/select-workspace`.
- Sidebar hidden on sign-in + `/select-workspace`.

## 10. Routing

- App Router (`apps/web/src/app/(app)/...`).
- Static export — dynamic routes use server components or generate-static-params.
- `'use client'` only when interactivity required. Avoid on static-export dynamic routes (will break export).
- Landing route = auth-aware redirect, no marketing surface.

## 11. Forms

- React Hook Form + zod resolver.
- Server validation = source of truth; client validation = UX mirror.
- Submit disables until valid + idle. Always pass `Idempotency-Key` on writes.
- Error from server surfaces on the specific field (`setError`), not as a toast alone.

## 12. Toasts / dialogs

- Toast for transient (success / error). Dialog for destructive confirmation.
- Destructive copy: "Permanently delete", "Move to recycle bin", "Restore". See [design-system §11](design-system.md#11-badge-vocabulary).
- Confirm by typing the entity name on hard-purge.

## 13. Accessibility

- WCAG AA contrast on text + interactive states.
- Keyboard reachable: every action; focus ring visible.
- Forms: `<label>` + `aria-describedby` on errors.
- Charts: `aria-label` summary + accessible data table fallback.
- Dialogs trap focus; ESC closes; restored focus on close.

## 14. Mobile / responsive

- Breakpoints: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.
- Tables collapse to stacked cards `<md`.
- Sidebar → drawer `<lg`.
- KPI strip wraps 2-up `<md`, 1-up `<sm`.
- No horizontal scroll `<sm` except explicit data tables (shadow indicators).

## 15. State management

- Server state → React Query.
- Client UI state → `useState` / `useReducer` co-located.
- Cross-page client state → tiny Zustand stores only when needed (sidebar collapse, modal stacks). No global app store.
- Persisted client state via `use-persisted-string` / `use-persisted-set` hooks.

## 16. API client

- One module per resource (`apps/web/src/lib/api-*.ts`).
- Returns typed response from `packages/types` + thin error shape.
- 401 → redirect to sign-in. 403 → surface "no access" page (component, not toast). 409 → resolve via row_version refetch.
- Idempotency-Key generated client-side (ULID) on every mutation.

## 17. Performance

- Lazy-load module pages (`next/dynamic` where appropriate).
- Skeleton-then-stream. Never block the whole shell on a single query.
- `tabular-nums` on every metric cell to prevent layout shift.

## Cross-refs

[design-system](design-system.md) · [engineering-rules](engineering-rules.md) · [permissions](permissions.md) · [qa-checklists](qa-checklists.md)
