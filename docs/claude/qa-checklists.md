# qa-checklists

Reusable audit prompts. Run the relevant section against any PR before approval.

## 1. Auth isolation

- [ ] Every workspace-scoped query filters by `(organization_id, workspace_id)`.
- [ ] Workspace ID derived from session, never `req.body`.
- [ ] Sign-out invalidates session row + clears React Query cache.
- [ ] 30d "Remember device" cookie + session TTLs align.
- [ ] Internal-manager bypass writes operation audit (`platform_admin.*`).
- [ ] No `NEXT_PUBLIC_*` secret. Only API base URL is public.
- [ ] Pre-commit secret scan passes.

## 2. RBAC leakage

- [ ] No inline `effectiveRole === ...` outside `apps/api/src/lib/permissions.ts` + `apps/web/src/lib/use-can.ts`.
- [ ] New capability defined in `permissions.ts` first; mirrored in `use-can.ts` same PR.
- [ ] UI gating mirrors a backend guard (no UI-only authorization).
- [ ] Disabled buttons + nav match the 403 response shape.
- [ ] Super_admin row never deletable (verify in `canDeleteActor`).
- [ ] Self-lockout enforced (actor cannot delete self).
- [ ] Manager cannot create another manager.
- [ ] Internal_staff has read-only platform access.

## 3. Workspace switching

- [ ] Active workspace persists across refresh.
- [ ] Switch triggers `queryClient.clear()`.
- [ ] No data from previous workspace visible after switch.
- [ ] `/select-workspace` has no back-arrow.
- [ ] Sign-in lands on `/select-workspace` with sidebar hidden.
- [ ] `xb_core.sessions.active_workspace_id` updated inside the same transaction as switch.

## 4. Semantic token regression

- [ ] No raw color utilities (`text-orange-*`, `bg-blue-*`, hex, rgb) introduced.
- [ ] All chart colors via `--chart-*` tokens.
- [ ] No inline `style={{ color }}` for theme colors.
- [ ] Badges use shared vocabulary (see [design-system §11](design-system.md#11-badge-vocabulary)).
- [ ] No em dash in product copy.
- [ ] No emoji in product UI.
- [ ] No "omnichannel" wording in customer-facing text.

## 5. Mobile overflow

- [ ] No horizontal scroll `<sm` except explicit data tables.
- [ ] Sidebar drawer behavior `<lg`.
- [ ] Tables collapse to stacked cards `<md`.
- [ ] KPI strip wraps 2-up `<md`, 1-up `<sm`.
- [ ] Dialogs fit viewport on smallest supported width (375px).

## 6. Accessibility

- [ ] WCAG AA contrast on text + interactive states.
- [ ] Keyboard reach for every action; focus ring visible.
- [ ] Form fields associated with `<label>` + `aria-describedby` on errors.
- [ ] Dialogs trap focus; ESC closes; focus restored.
- [ ] Charts have `aria-label` summary or accessible data fallback.

## 7. Chart consistency

- [ ] Recharts only.
- [ ] Theme tokens only (no raw hex).
- [ ] Tooltip + legend from shared `packages/ui` wrappers.
- [ ] Tick formatters from shared util.
- [ ] Aggregation server-side.
- [ ] `ResponsiveContainer` + min-height respected (240px desktop / 200px mobile).
- [ ] Provenance attached to the response feeding the chart.

## 8. Loading states

- [ ] Skeleton matches final layout.
- [ ] No spinners on operational pages.
- [ ] Per-card skeletons on KPI strips.
- [ ] Per-row skeletons on tables.
- [ ] Empty (post-load) renders AwaitingData, not skeleton.
- [ ] `useCan()` returns false during load; UI starts locked.

## 9. Destructive actions

- [ ] Confirmation dialog (not toast) for soft-delete + purge.
- [ ] Hard-purge requires typing the entity name.
- [ ] Copy: "Move to recycle bin" / "Restore" / "Permanently delete".
- [ ] Protected entities (self, super_admin) rejected at backend boundary.
- [ ] Audit event written before destructive change.
- [ ] No CASCADE deletes — explicit handling per resource.

## 10. Recycle bin flows

- [ ] Soft-delete sets `deleted_at`, leaves `purged_at` NULL, increments `row_version`.
- [ ] Restore clears `deleted_at` (idempotent).
- [ ] 90d retention → `purge_scheduled` then orchestrator.
- [ ] Audit trail preserved (`record.soft_deleted` → `record.restored` or `record.hard_deleted`).
- [ ] Audit FKs `ON DELETE SET NULL`, not CASCADE.
- [ ] Purge orchestrator surfaces FK errors (no swallow-as-missing-table).
- [ ] Nested transactions absent from purge code.

## 11. Notifications

- [ ] Workspace-scoped (`organization_id` + `workspace_id`).
- [ ] Read state per actor, not global.
- [ ] Audit on grant / change / dismiss.
- [ ] No PII in the notification body beyond what the actor can already see.
- [ ] Email send is best-effort; in-app row is source of truth.

## 12. Engine output integrity

- [ ] Response includes `provenance` (engine_key, engine_version, generated_at, window, filters, rowCount).
- [ ] Filters narrow same engine; no platform-branching code path.
- [ ] No frontend recomputation of derived metrics.
- [ ] Inventory sums filter by `inventory_state`.
- [ ] Re-uploads UPSERT canonical, never duplicate.

## 13. Ingestion (uploads)

- [ ] Validator captures full dimensional row.
- [ ] Mapper normalizes onto canonical dimensions, runs `resolveSku()`.
- [ ] Unresolved rows go to `xb_master.unresolved_sku_rows`.
- [ ] Channel-agnostic after mapper (no `if (platform === 'amazon')`).
- [ ] Idempotent on re-upload.

## 14. Migration safety

- [ ] Numbered, not gapped.
- [ ] One slice (no schema + backfill mix unless atomic).
- [ ] Idempotent where safe.
- [ ] Grant updates for any new schema (`0007_runtime_user_grants` style).
- [ ] Drop/swap is two-phase across migrations.
- [ ] Plaintext secrets absent (including comments).

## 15. AI integration

- [ ] Workspace + permission scope inherited.
- [ ] AI reads only engine output, never raw canonical.
- [ ] No fabricated numbers in narrative.
- [ ] AI prompts + responses logged to `xb_ai.ai_messages` + `ai_usage_logs`.
- [ ] No paid-provider dependency in core path.

## 16. Cross-build sanity

- [ ] `pnpm --filter @xb/types build` + `pnpm --filter @xb/auth build` if those packages changed.
- [ ] `pnpm --filter @xb/api typecheck` passes.
- [ ] `pnpm --filter @xb/web typecheck` passes.
- [ ] No mixed-scope PR (FE + BE bundled).
- [ ] Conventional-commit message.

## 17. Standard governance prompts (every PR)

- [ ] Hardcoded color?
- [ ] Mixed scope?
- [ ] Actor-unsafe query key?
- [ ] Workspace ID from request body?
- [ ] Em dash / emoji?
- [ ] Frontend secret?
- [ ] Client component on a static-export dynamic route?
- [ ] Inline role check?

## Cross-refs

[engineering-rules](engineering-rules.md) · [permissions](permissions.md) · [design-system](design-system.md) · [frontend-standards](frontend-standards.md) · [backend-standards](backend-standards.md)
