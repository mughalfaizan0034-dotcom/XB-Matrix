# docs/claude — agent governance layer

Compact operational memory for Claude agents working on XB Matrix. Load this file first; pull the linked docs as needed.

## Memory taxonomy

| Type | Lives in | Update cadence |
|---|---|---|
| **Hot memory** (active branch state) | [current-state.md](current-state.md) | per PR merge / priority shift |
| **Cold memory** (architecture, rules, standards) | the rest of `docs/claude/**` | rarely; only when a rule actually changes |
| **Reference** (vocab, forbidden patterns, conventions, PR template) | [reference/](reference/) | rarely |
| **Agent bootstraps** | [agents/](agents/) | when an agent's scope evolves |

Read order at chat start: this README → relevant agent file in [agents/](agents/) → `current-state.md` → topic docs as needed.

## Bootstrap instruction (paste into new chats)

> Read `docs/claude/README.md`, then your assigned agent bootstrap file in `docs/claude/agents/`, then `docs/claude/current-state.md` before proceeding.

Pick the agent file from [`docs/claude/agents/`](agents/) that matches the work:

| Agent | File | Use when |
|---|---|---|
| Backend / Core Systems | [agents/backend-agent.md](agents/backend-agent.md) | migrations, services, routes, engines, purge, RLS, audit, workers |
| Frontend / App Shell | [agents/frontend-agent.md](agents/frontend-agent.md) | UI, dashboards, settings, notifications, accessibility, responsive |
| QA / Audit | [agents/qa-agent.md](agents/qa-agent.md) | regression sweeps, leakage probes, token + a11y audits |
| Architecture / Governance | [agents/architecture-agent.md](agents/architecture-agent.md) | roadmap, data modeling, AI boundaries, governance edits (no code) |
| Analytics / Charts | [agents/analytics-agent.md](agents/analytics-agent.md) | KPIs, metric registry, engines, charts, reporting, forecasting |

Each agent file lists its required bootstrap docs + forbidden scope. Stay inside the lane; hand off when the work crosses a boundary.

## How to use

- Each doc is **dense rules + tables**, not prose. Optimized for fast reload into AI context.
- No duplication: each rule lives in one doc; others cross-link.
- Source of truth precedence: `sql/migrations/` (schema) → `apps/api/src/lib/permissions.ts` (RBAC) → `docs/claude/*` → other `docs/*` → `CLAUDE.md`.
- If a doc disagrees with the live code, the code wins — update the doc same PR.

## File index

### Hot

| File | Purpose |
|---|---|
| [current-state.md](current-state.md) | active branch, current priority, recent merges, blockers |

### Cold — architecture + standards

| File | Purpose | Load for |
|---|---|---|
| [architecture.md](architecture.md) | system philosophy, canonical pipeline, security model, AI boundaries | every agent |
| [permissions.md](permissions.md) | RBAC philosophy, capability guards, RLS, forbidden patterns | backend, FE, QA |
| [data-model.md](data-model.md) | schemas, conventions, canonical tables, lifecycle, retention | backend, engines |
| [engines.md](engines.md) | deterministic engines, roadmap, server-side calc rules | engines, analytics |
| [design-system.md](design-system.md) | semantic tokens, KPI / chart / motion / empty-state rules | frontend, charts |
| [frontend-standards.md](frontend-standards.md) | React Query, auth UI, tables, dashboards, mobile | frontend |
| [backend-standards.md](backend-standards.md) | services, routes, migrations, audit, purge, worker | backend |
| [engineering-rules.md](engineering-rules.md) | PR discipline, forbidden patterns, governance prompts | every agent |
| [qa-checklists.md](qa-checklists.md) | reusable audit checklists | QA, reviewer |
| [roadmap.md](roadmap.md) | sequenced priorities + phases | planning |

### Reference (machine-oriented)

| File | Purpose |
|---|---|
| [reference/terminology.md](reference/terminology.md) | canonical vocabulary (one term, one definition, one home) |
| [reference/decisions.md](reference/decisions.md) | locked architectural decisions (ID + rationale); closes old debates |
| [reference/anti-patterns.md](reference/anti-patterns.md) | bad → why → instead; concrete regression shapes |
| [reference/forbidden-patterns.md](reference/forbidden-patterns.md) | compact rule list + grep patterns; CI lift candidates |
| [reference/lifecycle-states.md](reference/lifecycle-states.md) | canonical state machines per domain (upload, deletion, workspace, …) |
| [reference/metrics-registry.md](reference/metrics-registry.md) | KPI catalogue: formula, source, grain, null rule, format, AI-safe description |
| [reference/conventions.md](reference/conventions.md) | naming + format rules across schema, routes, queries, KPIs, charts, hooks |
| [reference/pr-template.md](reference/pr-template.md) | required PR scope / non-goals / boundary block |

### Agent bootstraps

See [agents/](agents/) — one file per specialization.

## Agent specializations

Each bootstrap file in [`agents/`](agents/) names its required reads + forbidden scope. Summary:

| Agent | Required | Forbidden |
|---|---|---|
| backend-agent | architecture · permissions · data-model · backend-standards · engineering-rules | UI styling, charts, design tokens |
| frontend-agent | architecture · permissions · design-system · frontend-standards · engineering-rules | migrations, transactions, RLS |
| qa-agent | qa-checklists · engineering-rules · permissions · design-system | writing production code |
| architecture-agent | architecture · roadmap · engineering-rules · permissions · data-model | any code (docs + plans only) |
| analytics-agent | engines · data-model · design-system · frontend-standards | auth / RBAC changes, schema migrations |

## Canonical terminology (use consistently)

- **Canonical** = `xb_canonical.*` (additive facts).
- **Engine** = deterministic service producing versioned output.
- **Intelligence layer** = `/v1/intelligence/*` services; single source for KPIs / reports / alerts / AI.
- **Workspace context** = `(organization_id, workspace_id)` derived from session.
- **Actor** = `xb_core.actors` row; identity used for audit + RLS.
- **Capability** = named permission in `apps/api/src/lib/permissions.ts`.
- **Provenance** = `{engine_key, engine_version, generated_at, window, filters, rowCount}` on every engine response.
- **Soft-deleted** vs **purged**: separate states, separate fields (`deleted_at` ≠ `purged_at`).
- **Marketplace** = row-level dimension, never a system.

## Cross-file rules (no duplication)

| Topic | Lives in | Linked from |
|---|---|---|
| Capability guards | permissions §5 | engineering-rules, backend-standards |
| Three-layer rule (canonical/engine/frontend) | engineering-rules §6 | architecture, engines |
| Deletion lifecycle | data-model §6 | backend-standards, qa-checklists |
| Semantic tokens | design-system §1–2 | engineering-rules, frontend-standards |
| Workspace derivation | engineering-rules §5 | permissions, backend-standards, frontend-standards |
| Audit (two layers) | architecture §12 | backend-standards §7 (operation events) |
| RLS policy shape | data-model §4 | permissions §8, backend-standards §5 |

## Live source-of-truth references

- [`sql/migrations/`](../../sql/migrations/) — schema truth
- [`apps/api/src/lib/permissions.ts`](../../apps/api/src/lib/permissions.ts) — RBAC truth
- [`apps/web/src/lib/use-can.ts`](../../apps/web/src/lib/use-can.ts) — FE mirror of RBAC
- [`packages/auth`](../../packages/auth/) — resolver + providers
- [`packages/calculations`](../../packages/calculations/) — engine interface + run meta
- [`packages/ui`](../../packages/ui/) — semantic tokens + primitives
- [`docs/schema.md`](../schema.md) — long-form Spec 3
- [`docs/pipeline.md`](../pipeline.md) — long-form ingestion + canonical shapes
- [`docs/engines.md`](../engines.md) — long-form engine catalogue
- [`docs/permissions.md`](../permissions.md) — long-form permission program
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — long-form topology
- [`HANDOFF.md`](../../HANDOFF.md) — fresh-chat operational state
- [`CLAUDE.md`](../../CLAUDE.md) — top-level architectural brief

## When to update these docs

- Active-branch / priority shift → [current-state.md](current-state.md) (hot).
- Architectural decision shifts → architecture / engineering-rules.
- New capability or RBAC rule → permissions (+ mirror `use-can.ts` same PR).
- New canonical table / migration touching shape → data-model.
- Engine added or contract changed → engines.
- Theme / token / chart / motion change → design-system.
- New FE convention → frontend-standards.
- New BE convention → backend-standards.
- Roadmap re-sequencing → roadmap.
- New audit pattern → qa-checklists.
- New term / banned synonym → reference/terminology.
- New forbidden pattern → reference/forbidden-patterns.
- New naming or format rule → reference/conventions.
- New locked architectural decision → reference/decisions (architecture-agent only; never renumber).
- Newly observed regression shape → reference/anti-patterns (link the decision ID, don't restate rules).
- New lifecycle / state machine → reference/lifecycle-states FIRST (before migration / service code).
- New KPI → reference/metrics-registry FIRST (assign ID, never renumber); engine + UI follow.

Edits to these docs ship as `docs:` PRs. Every PR uses the [reference/pr-template.md](reference/pr-template.md) block. Memory updates in `MEMORY.md` follow.
