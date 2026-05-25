# forbidden-patterns

Single compact list. Ready for CI/QA agent consumption. Each rule has a search pattern (where applicable) + the doc that owns the rationale.

## A. Authorization

| # | Pattern | Search | Owner |
|---|---|---|---|
| A1 | Inline role checks | `effectiveRole\s*===` outside `apps/api/src/lib/permissions.ts` + `apps/web/src/lib/use-can.ts` | [permissions](../permissions.md) |
| A2 | UI-only authorization (no backend mirror) | manual review | [permissions](../permissions.md) |
| A3 | Re-deriving role logic in services | `isSuperAdmin\|isInternalManager\|isInternalStaff` defined outside permissions module | [permissions](../permissions.md) |
| A4 | Resolver bypass via raw `SET LOCAL app.is_internal_manager='true'` outside permitted flows | grep migrations + services | [permissions](../permissions.md) |
| A5 | Trusting client role flag | `req\.body\.role\|req\.body\.effectiveRole` | [permissions](../permissions.md) |

## B. Tenancy + workspace

| # | Pattern | Search | Owner |
|---|---|---|---|
| B1 | Workspace ID from request body | `req\.body\.workspaceId\|body\.workspace_id` outside admin platform flows | [engineering-rules](../engineering-rules.md) |
| B2 | Organization ID from request body for tenancy | `req\.body\.organizationId` outside platform-admin flows | [engineering-rules](../engineering-rules.md) |
| B3 | Direct `app.pg.query` outside `withConnection` | `app\.pg\.query` | [backend-standards](../backend-standards.md) |
| B4 | Missing actor scope in React Query key | manual review of `queryKey: [...]` shape | [frontend-standards](../frontend-standards.md) |
| B5 | Cross-actor cache reuse | `queryClient\.clear` not called on sign-out / workspace switch | [frontend-standards](../frontend-standards.md) |

## C. Database + transactions

| # | Pattern | Search | Owner |
|---|---|---|---|
| C1 | Nested transactions inside `withConnection` | `BEGIN\|withConnection` inside another `withConnection` block | [backend-standards](../backend-standards.md) |
| C2 | `SET` without `LOCAL` | `SET\s+app\.` (must always be `SET LOCAL`) | [data-model](../data-model.md) |
| C3 | Silent catch-all DB suppression | `catch.*\{\s*\}\|catch.*\/\/\s*ignore` near DB calls | [engineering-rules](../engineering-rules.md) |
| C4 | Swallowing FK errors as "missing table" | manual review | [backend-standards](../backend-standards.md) |
| C5 | CASCADE on audit FKs | grep migrations for `REFERENCES.*ON DELETE CASCADE` near audit columns | [data-model](../data-model.md) |
| C6 | Native PG enum types | `CREATE TYPE.*AS ENUM` | [data-model](../data-model.md) |
| C7 | UPDATE/DELETE on `audit_log` | grep migrations + services | [data-model](../data-model.md) |

## D. Calculation discipline

| # | Pattern | Search | Owner |
|---|---|---|---|
| D1 | Frontend business math | grep `apps/web/src` for ACOS / TACOS / DOS / ROAS / velocity / margin formulas | [engines](../engines.md) |
| D2 | Engines reading raw uploads | grep engine services for `xb_raw` reads | [engines](../engines.md) |
| D3 | Engine output without provenance | manual review of response shape | [engines](../engines.md) |
| D4 | Inventory sum without `inventory_state` filter | grep `channel_inventory` queries | [engines](../engines.md) |
| D5 | Canonical writes with derived metrics | grep mappers + canonical writes for ratio / percent columns | [data-model](../data-model.md) |

## E. Channel-agnostic core

| # | Pattern | Search | Owner |
|---|---|---|---|
| E1 | Marketplace branching past mapper | `if\s*\(\s*platform\s*===\|switch\s*\(\s*marketplace` outside `apps/api/src/uploads/` | [architecture](../architecture.md) |
| E2 | Marketplace-specific tables | new tables named `amazon_*`, `walmart_*`, `shopify_*` outside connector scope | [architecture](../architecture.md) |
| E3 | Per-marketplace upload kinds in UI | `KIND_OPTIONS` containing marketplace names | [architecture](../architecture.md) |

## F. Design / theming

| # | Pattern | Search | Owner |
|---|---|---|---|
| F1 | Raw Tailwind color utilities | `text-orange-\|bg-orange-\|text-blue-\|bg-blue-\|text-red-\|bg-red-\|text-green-\|bg-green-` | [design-system](../design-system.md) |
| F2 | Hex / rgb in code | `#[0-9a-fA-F]{3,8}\b\|rgb\(\|rgba\(` outside theme token defs | [design-system](../design-system.md) |
| F3 | Inline color styles | `style=\{\{[^}]*color` | [design-system](../design-system.md) |
| F4 | Em dash in product copy | `—` in `apps/web/src/**` | [design-system](../design-system.md) |
| F5 | Emoji in product UI | unicode emoji range in `apps/web/src/**` | [design-system](../design-system.md) |
| F6 | "omnichannel" wording | grep `apps/web/src` (case-insensitive) | [design-system](../design-system.md) |
| F7 | Non-Recharts chart library | `react-chartjs\|d3\|nivo` in `apps/web/package.json` | [design-system](../design-system.md) |
| F8 | KPI without `tabular-nums` | manual review | [design-system](../design-system.md) |

## G. Frontend hygiene

| # | Pattern | Search | Owner |
|---|---|---|---|
| G1 | `NEXT_PUBLIC_*` secret | grep `NEXT_PUBLIC_` for non-public values | [engineering-rules](../engineering-rules.md) |
| G2 | `'use client'` on static-export dynamic route | route under `[...]` with `'use client'` directive | [frontend-standards](../frontend-standards.md) |
| G3 | `staleTime: Infinity` on session-derived data | grep React Query options | [frontend-standards](../frontend-standards.md) |
| G4 | Spinner on operational page | grep `Spinner\|<Loader` in `apps/web/src/app/(app)` | [design-system](../design-system.md) |
| G5 | "Upload your first CSV" CTA on operational page | grep CTA copy in `apps/web/src/app/(app)` | [design-system](../design-system.md) |

## H. Repo + PR

| # | Pattern | Search | Owner |
|---|---|---|---|
| H1 | Plaintext secret in committed file (incl. comments) | pre-commit secret scan | [engineering-rules](../engineering-rules.md) |
| H2 | Mixed-scope PR (FE + BE) | git diff scope review | [engineering-rules](../engineering-rules.md) |
| H3 | Renamed `_var` instead of deleted unused | manual review | top-level CLAUDE.md |
| H4 | `// removed` comments for removed code | grep diff | top-level CLAUDE.md |
| H5 | Force-pushing to main / master | branch-protect rule | [engineering-rules](../engineering-rules.md) |
| H6 | `--no-verify` on commit | pre-commit hook config | [engineering-rules](../engineering-rules.md) |

## I. Deletion + purge

| # | Pattern | Search | Owner |
|---|---|---|---|
| I1 | Per-service ad-hoc hard-delete | grep for `DELETE FROM xb_` outside purge service | [backend-standards](../backend-standards.md) |
| I2 | Conflating `deleted_at` and `purged_at` | grep services for assignment | [data-model](../data-model.md) |
| I3 | Purging super_admin / self row | manual review of `canDeleteActor` callers | [permissions](../permissions.md) |
| I4 | Missing audit on destructive change | manual review | [backend-standards](../backend-standards.md) |

## J. AI boundaries

| # | Pattern | Search | Owner |
|---|---|---|---|
| J1 | AI reading raw uploads | grep `packages/ai` for `xb_raw` access | [engines](../engines.md) |
| J2 | AI reading canonical directly | grep `packages/ai` for `xb_canonical` access | [engines](../engines.md) |
| J3 | AI overriding engine numbers | manual review | [engines](../engines.md) |
| J4 | Core feature requiring paid AI provider | grep `packages/ai` configs | [roadmap](../roadmap.md) |

## CI lift candidates (suggested order)

1. A1 (inline role check) — high signal, easy regex.
2. F1–F3 (raw colors / hex / rgb).
3. B3 (direct `app.pg.query`).
4. C2 (`SET` without `LOCAL`).
5. F4–F6 (em dash / emoji / "omnichannel").
6. E1 (marketplace branching past mapper).
7. C5 (CASCADE on audit FKs) — migration linter.
8. G1 (`NEXT_PUBLIC_` audit).
