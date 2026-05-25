# decisions

Locked architectural decisions. One line each. Closes old debates so they don't reopen across chats.

Status legend: `locked` = re-opening requires architecture-agent review · `provisional` = subject to revision · `superseded` = replaced (see Replaced-by).

| ID | Decision | Status | Rationale | Home |
|---|---|---|---|---|
| D-001 | Marketplace is a row dimension, not a system | locked | Prevent siloed architecture; one engine answers blended + filtered | [architecture](../architecture.md) |
| D-002 | Deterministic engines before AI | locked | Auditability + operational truth; AI narrates engine output, never derives | [engines](../engines.md) |
| D-003 | Semantic tokens only (no raw colors) | locked | Single source of theme truth; banned via CI | [design-system](../design-system.md) |
| D-004 | Actor-scoped React Query keys mandatory | locked | Prevent cache leakage across actors / workspaces | [frontend-standards](../frontend-standards.md) |
| D-005 | Capabilities, not roles | locked | One canonical guard module; inline `effectiveRole ===` banned | [permissions](../permissions.md) |
| D-006 | Single super_admin, migration-provisioned only | locked | Singleton root identity; never API-creatable | [permissions](../permissions.md) |
| D-007 | RLS bypass only via `app.is_internal_manager='true'` | locked | One audited bypass; no per-table exceptions | [data-model](../data-model.md) |
| D-008 | RLS = org isolation only; workspace authz in resolver | locked | Users legitimately span workspaces; RLS would over-block | [data-model](../data-model.md) |
| D-009 | `withConnection(actor, work)` is the sole DB entry point | locked | Required to set `app.current_*` settings for RLS + audit | [backend-standards](../backend-standards.md) |
| D-010 | No nested transactions inside `withConnection` | locked | Past incident: nested tx + swallowed FK errors masked purge bug | [backend-standards](../backend-standards.md) |
| D-011 | ULID `char(26)` PKs; no sequences | locked | Time-ordered, distributed-safe, doubles as pagination | [data-model](../data-model.md) |
| D-012 | `numeric(18,4)` for money | locked | Avoid float drift; matches Spec 3 | [data-model](../data-model.md) |
| D-013 | Enums = `varchar + CHECK`, never native PG enum | locked | Adding values doesn't lock the table; removal possible | [data-model](../data-model.md) |
| D-014 | Soft-delete + 90d purge lifecycle | locked | Recoverability + audit preservation | [data-model](../data-model.md) |
| D-015 | `deleted_at` ≠ `purged_at` (separate fields, separate states) | locked | State machine clarity for recycle bin + orchestrator | [data-model](../data-model.md) |
| D-016 | Audit FKs `ON DELETE SET NULL`, never CASCADE | locked | Preserve audit trail through purges | [data-model](../data-model.md) |
| D-017 | Optimistic locking via `row_version` + `If-Match` → 409 | locked | Conflict surfaces explicitly to caller | [data-model](../data-model.md) |
| D-018 | `Idempotency-Key` on every write endpoint | locked | Re-delivery safety for tasks + retries | [backend-standards](../backend-standards.md) |
| D-019 | `audit_log` is append-only (RLS denies UPDATE/DELETE) | locked | Tamper-evidence | [architecture](../architecture.md) |
| D-020 | Canonical stores additive metrics only | locked | Derivation lives in engines; reconciliation beside, not inside | [data-model](../data-model.md) |
| D-021 | Engine response carries provenance | locked | Reproducibility: numbers trace to engine + version + window | [engines](../engines.md) |
| D-022 | `engine_key` + `engine_version` + `generated_at` on every engine row | locked | Versioned outputs; never silent overwrite | [engines](../engines.md) |
| D-023 | Frontend renders only; never computes business metrics | locked | One math layer; one source of truth | [engineering-rules](../engineering-rules.md) |
| D-024 | `resolveSku()` runs in mapper; canonical stores `sku_normalized` only | locked | One product across all platforms; no double-count | [architecture](../architecture.md) |
| D-025 | Unresolved SKU rows are first-class operator workflow | locked | Expect assignment / AI-assist / confidence / bulk resolution | [architecture](../architecture.md) |
| D-026 | `attribution_window_days` is a first-class canonical dimension on `channel_ads` | locked | Same campaign-period exists at 1d/7d/14d/30d; engine pivots without re-ingest | [data-model](../data-model.md) |
| D-027 | `brand_normalized` is optional + nullable, no aliasing in v1 | locked | Brand is a useful dimension; alias graph deferred | [data-model](../data-model.md) |
| D-028 | One operational dataset upload kind per concept (Sales / Inventory / Ads) | locked | Marketplace is a column inside the file, not a separate kind | [architecture](../architecture.md) |
| D-029 | Username sign-in; no email in user flow | locked | Direct admin add-user; Resend integration deferred | [roadmap](../roadmap.md) |
| D-030 | "Remember device" → 30d session, default 7d | locked | Operator request | [roadmap](../roadmap.md) |
| D-031 | Self row + super_admin never purgeable | locked | Identity protection; enforced backend-first | [permissions](../permissions.md) |
| D-032 | Recharts is the chart library | locked | One chart stack; consistent theme + a11y | [design-system](../design-system.md) |
| D-033 | Quicksand headings + Inter body + `tabular-nums` on metrics | locked | Type system + prevents metric layout shift | [design-system](../design-system.md) |
| D-034 | No em dashes / emoji / "omnichannel" in product UI | locked | Operator preference; enterprise tone | [design-system](../design-system.md) |
| D-035 | `'use client'` forbidden on static-export dynamic routes | locked | Breaks Next.js static export | [frontend-standards](../frontend-standards.md) |
| D-036 | One slice per PR (atomic) | locked | Prevents scope drift; reviewable diffs | [engineering-rules](../engineering-rules.md) |
| D-037 | Backend correctness ships before UI; capability guard before `useCan()` consumer | locked | UI can't drift ahead of policy | [engineering-rules](../engineering-rules.md) |
| D-038 | Centralized purge orchestrator; no per-service ad-hoc deletes | locked | Protection rules + audit centralized | [backend-standards](../backend-standards.md) |
| D-039 | Public repo posture: pre-commit secret scan + server/client env separation | locked | Repo is public; assume crawlers index every diff | [engineering-rules](../engineering-rules.md) |
| D-040 | Workspace ID derives from session via `requireActiveWorkspace()`, never request body | locked | Tenancy is server state | [engineering-rules](../engineering-rules.md) |
| D-041 | Reports = generated engine outputs, not uploaded files | locked | Closes "upload my Q1 report" debate | [engines](../engines.md) |
| D-042 | AI inherits active workspace + permission scope | locked | No cross-workspace reasoning; no cross-org leakage | [permissions](../permissions.md) |
| D-043 | AI consumes engine output only, never raw uploads / canonical | locked | Deterministic numbers, narrative-only LLM role | [engines](../engines.md) |
| D-044 | Free AI providers only in core path (Groq / OpenRouter / Ollama) | locked | Core platform must not depend on paid models | [engines](../engines.md) |
| D-045 | Hot vs cold memory split (`current-state.md` vs the rest) | locked | Fresh chats reload < 10KB; everything else demand-loaded | [README](../README.md) |
| D-046 | Single intelligence layer (`/v1/intelligence/*`) feeds dashboards + reports + alerts + AI | locked | No page-specific math; one service catalogue | [engines](../engines.md) |
| D-047 | `<ComingSoonState />` for unfinished modules — full-page primitive, no roadmap copy | locked | Product-anticipation moment, not disclaimer | [design-system](../design-system.md) |
| D-048 | Inventory sums always filter by `inventory_state` | locked | Unfiltered sums are meaningless (mixes sellable + in-transit + damaged) | [engines](../engines.md) |
| D-049 | Workspace type is UI-only optional select (Marketplace / DTC / Warehouse / General) | locked | DB column stays nullable varchar; no CHECK | [architecture](../architecture.md) |
| D-050 | Internal_staff = platform-wide read; never writes | locked | Operational visibility without escalation risk | [permissions](../permissions.md) |
| D-051 | Internal_manager cannot create another internal_manager | locked | Role-escalation cap; only super_admin can | [permissions](../permissions.md) |

## How to use

- **Reviewer reference.** If a PR contradicts a `locked` row, reject and link to the row.
- **Re-opening a decision.** Open an architecture-agent thread; if changed, update the row with `superseded`, add a new row, and link via "Replaced by D-NNN".
- **Adding a decision.** Only the architecture-agent adds rows. New ID = max(ID) + 1. Never renumber.
- **CI seed.** Each `locked` row that can be machine-checked maps to a forbidden-pattern entry — see [forbidden-patterns.md](forbidden-patterns.md).
