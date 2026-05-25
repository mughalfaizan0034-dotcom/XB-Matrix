# pr-template

Every PR opens with this block. Forces explicit scope so concurrent agents don't collide.

## Required block (first thing in PR description)

```md
## Scope
- <bullet>
- <bullet>

## Non-goals
- <bullet>
- <bullet>

## Architectural boundary
- <one line — which layer does the work; canonical/engine/frontend>
- <one line — what stays untouched>

## Affected domains
- <backend | frontend | qa | architecture | analytics>
- <which docs/claude/*.md change, if any>
```

## Required body sections (after the block)

```md
## Summary
- <1–3 bullets — what changed, why>

## Test plan
- [ ] <unit / typecheck / build>
- [ ] <manual UI test if frontend>
- [ ] <migration apply + rollback if schema>
- [ ] <qa-checklists.md sections relevant>

## Forbidden-patterns sweep
- [ ] No inline `effectiveRole ===` outside permissions module.
- [ ] No raw color utilities introduced.
- [ ] No workspace ID from request body.
- [ ] No nested transactions inside `withConnection`.
- [ ] No marketplace-specific code past mapper.
- [ ] No `NEXT_PUBLIC_*` secret introduced.
- [ ] No plaintext secret in any committed file (incl. comments).
```

## Rules

- **One slice per PR.** If `Scope` has bullets from two domains, split.
- **Non-goals are required.** Empty = the agent did not think about it. Write what you explicitly chose not to do.
- **Architectural boundary** must name the canonical → engine → frontend layer the change occupies. Cross-layer = split.
- **Affected domains** drives which agent reviews. More than one → backend lands first.
- Reference `docs/claude/*` sections instead of restating rules.

## Example (sales intelligence KPI service)

```md
## Scope
- Sales intelligence engine: `getWorkspaceKPIs` extended with `units_total` + `refunds_total`.
- Dashboard KPI strip rewires to consume new fields.

## Non-goals
- Chart composition (handled by analytics-agent in a follow-up).
- Forecasting integration.
- Warehouse metrics.

## Architectural boundary
- Server computes additive aggregates from `xb_canonical.channel_sales`.
- Frontend renders only; no derived math.

## Affected domains
- backend (engine + service)
- frontend (consumption rewrite)
- docs: engines.md (KPI listing)

## Summary
- New canonical-driven KPI fields wired through `/v1/intelligence/workspace-kpis`.
- Frontend strip consumes engine output + provenance.

## Test plan
- [ ] `pnpm --filter @xb/api typecheck` + tests.
- [ ] `pnpm --filter @xb/web typecheck`.
- [ ] Manual dashboard verification per [qa-checklists §12](../qa-checklists.md#12-engine-output-integrity).
- [ ] Loading state per [qa-checklists §8](../qa-checklists.md#8-loading-states).

## Forbidden-patterns sweep
- [x] No inline role checks.
- [x] No raw colors.
- [x] No body-derived workspace ID.
- [x] No nested transactions.
- [x] No marketplace branching.
- [x] No NEXT_PUBLIC secret.
- [x] No plaintext secret.
```

## Reviewer rejection grounds

- Missing block → reject before review.
- `Non-goals` empty → reject (mixed-scope risk).
- Multiple domains in `Scope` without a split plan → reject.
- Sweep checklist not completed → reject.
- Architectural boundary contradicts immutable guardrails in [engineering-rules §6](../engineering-rules.md#6-canonical--engine--frontend-the-three-layer-rule) → reject at design.
