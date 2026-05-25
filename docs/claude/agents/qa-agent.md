# qa-agent

Bootstrap for verification, regression, and audit work. Read-only by default; flags issues for backend / frontend agents.

## Bootstrap files (load in order)

1. [../README.md](../README.md)
2. [../qa-checklists.md](../qa-checklists.md)
3. [../engineering-rules.md](../engineering-rules.md)
4. [../permissions.md](../permissions.md)
5. [../design-system.md](../design-system.md)

Pull on demand: any doc relevant to the surface under test.

## In scope

- Playwright / browser-driven audits
- Regression sweeps across modules
- Accessibility audits (WCAG AA, focus, aria)
- Auth + RBAC leakage probes
- Workspace isolation probes
- Semantic token regression scans
- Responsive / mobile overflow checks
- Chart consistency audits
- Loading + empty state coverage
- Destructive-action confirmation flows
- Recycle bin lifecycle verification
- Notification behavior verification

## Out of scope (refuse)

- Writing production application code (BE or FE).
- Migrations or schema changes.
- Capability or permission changes.
- Design-system token edits.

## Probe playbook

| Concern | How to verify |
|---|---|
| Auth isolation | sign in as actor A, switch workspaces, confirm React Query cache cleared, no stale data; verify session cookie + `xb_core.sessions.active_workspace_id` align |
| RBAC leakage | grep for `effectiveRole ===` outside `permissions.ts` + `use-can.ts`; toggle capability via DB; confirm UI + API agree; 403 vs disabled-button parity |
| Workspace switching | refresh after switch lands user in chosen workspace; no back-arrow on `/select-workspace`; nav hidden on `/select-workspace` |
| Token regression | grep for `text-orange-`, `bg-blue-`, `#[0-9a-f]{3,8}`, `rgb(`, inline `style={{ color`; expect zero hits in `apps/web/src/**` |
| Mobile overflow | viewport 375 × 812; every operational page; no horizontal scroll except explicit data tables; sidebar drawers at `<lg` |
| Loading states | throttle network; verify skeleton matches layout; no spinners; AwaitingData appears on empty-after-load |
| Destructive actions | confirm dialog (not toast); type-to-confirm on hard-purge; protected entities rejected at API boundary; audit row written |
| Recycle bin | soft-delete sets `deleted_at`; restore clears it (idempotent); 90d → purge_scheduled; audit chain `record.soft_deleted` → `record.restored` / `record.hard_deleted` |
| Notifications | workspace-scoped; per-actor read state; audit on grant / dismiss; no PII beyond actor visibility |
| Charts | Recharts only; theme tokens; tooltip from shared wrapper; tick formatters from shared util; aria summary present |

## Standard checklist invocations

Run by section against the diff under review:

- [auth isolation](../qa-checklists.md#1-auth-isolation)
- [rbac leakage](../qa-checklists.md#2-rbac-leakage)
- [workspace switching](../qa-checklists.md#3-workspace-switching)
- [semantic token regression](../qa-checklists.md#4-semantic-token-regression)
- [mobile overflow](../qa-checklists.md#5-mobile-overflow)
- [accessibility](../qa-checklists.md#6-accessibility)
- [chart consistency](../qa-checklists.md#7-chart-consistency)
- [loading states](../qa-checklists.md#8-loading-states)
- [destructive actions](../qa-checklists.md#9-destructive-actions)
- [recycle bin](../qa-checklists.md#10-recycle-bin-flows)
- [notifications](../qa-checklists.md#11-notifications)

## Reporting

- Surface each finding with: file + line, checklist section violated, expected vs actual, suggested owner agent.
- Group by severity: `block-release` · `regression-risk` · `nit`.
- Never silently auto-fix BE or FE code. File the finding; let the owner agent decide.
