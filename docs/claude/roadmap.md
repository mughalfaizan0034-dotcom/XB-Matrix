# roadmap

Current sequencing snapshot. Updates land here, not in CLAUDE.md. Date: 2026-05-25.

## 1. Stabilized (shipped foundation)

- Multi-tenancy, organizations, workspaces.
- Auth: username + password, sessions, "Remember 30d" device.
- Audit logging (data + operation).
- Resolver-based permissions (5 providers, deny-default).
- CRUD lifecycle: suspend / archive / soft-delete / restore.
- Recycle Bin admin surface (Grace PR-3).
- Purge orchestrator with `super_admin` + self-row protection.
- DataTable primitives.
- Uploads foundation: 5-tab UI, GCS storage, status lifecycle.
- Validators + platform-agnostic mapper layer.
- Unresolved SKU queue + sku_aliases identity layer.
- Workspace-aware UI.
- Production infra: Cloud Run · Cloud SQL PG16 · BigQuery (`xbmatrixbq`) · GCS · Redis · Secret Manager · Cloud Tasks.
- Walmart connector (validated marketplace-agnostic contract).
- `<ComingSoonState />` primitive.
- Canonical RBAC module (`apps/api/src/lib/permissions.ts` + `apps/web/src/lib/use-can.ts`).

## 2. Active PR direction

Branch: `feat/permissions-canonical-rbac`.
- Centralizing capability guards.
- Removing inline role checks across services + UI.
- CI guard for `effectiveRole ===` outside permissions module.

## 3. Pre-engine foundations (LOCKED 10-step, skip none)

| # | Slice |
|---|---|
| 1 | Auth + cache hardening |
| 2 | Topbar cleanup |
| 3 | Permission matrix UI |
| 4 | Metric registry |
| 5 | Time engine (period grains, workspace timezone) |
| 6 | Job infra (Cloud Tasks worker patterns) |
| 7 | Currency engine |
| 8 | SKU alias hardening |
| 9 | Design system consolidation |
| 10 | Engines (begin Sales intelligence) |

## 4. Permission program — 9-slice (P1–P9)

P1 schema stabilization (admin level, migration 0021) · P2 workspace-assignment + module-grant service · P3 resolver providers wired to `workspace_permissions` + `page_permissions` · P4 radio-matrix permissions UI · P5 sidebar / route module-visibility enforcement · P6 upload / action enforcement · P7 AI permission inheritance · P8 permission audit logging · P9 preset role templates.

## 5. Intelligence program — 10-phase (A1–A10)

A1 Sales · A2 Inventory · A3 Advertising · A4 Dashboard KPI/trend · A5 Operational alerts · A6 Intelligence API consolidation · A7 AI assistant shell · A8 AI insight summaries (deterministic) · A9 AI recommendations · A10 Forecasting + automation.

Phases 1–5 deterministic before any AI layer deepens.

## 6. Upcoming phases (sequenced)

| Phase | Notes |
|---|---|
| Charts phase | Recharts; first chart = Dashboard revenue + spend trend (server-aggregated) |
| Notification backend | `notifications` table; in-app + email; ties into support tickets |
| Expenses phase | `xb_canonical.expenses` + profitability engine; unlocks Unit Economics |
| Logistics / replenishment phase | `warehouse_inventory` + `shipment_movements`; Shipments + WMS first-class |
| Support / ticketing | `support_tickets`, `support_ticket_replies`, `notifications`; status enum, internal notes, audit-on-every-action |
| Academy surface | dedicated learning experience; global search; copy diet on existing prose-heavy surfaces |
| Profile modal | small native enterprise; precedes Support |
| AI phase | shell → insights → recommendations → forecasting+automation |

## 7. Blocked / deferred

| Item | Blocker |
|---|---|
| Unit Economics module | Expenses ingestion (gated until expenses canonical lands) |
| Forecasting UI | Forecasting engine (A10) |
| Real engine implementations | Pre-engine foundations 1–9 |
| Paid AI providers | Foundation phase only ships Groq / OpenRouter / Ollama stubs |
| Stripe billing | Manual agency billing until further notice |
| Public API keys | Table exists; surface deferred |
| Multi-region failover | Not in foundation scope |
| Forgot-password UI | Deferred until Resend.com wired |
| Email-based invitations | Dormant; admins create users directly |

## 8. Operating decisions in force

- Uploads UX: operational dataset is primary, connectors/marketplaces supporting.
- Templates page = download-only + branded Download Guide PDF.
- Auth: username sign-in, no email in user flow.
- "Remove user" = soft delete, idempotent, revokes sessions. Super-admin row not removable.
- Reports fixed set: Sales · Ads · Inventory · Warehouse Inventory (coming soon).
- No "omnichannel" wording, no em dashes, no emoji in UI.
- Public repo — pre-commit secret scan + server/client env separation mandatory.

## 9. Pending operator requests (open)

- Cloud SQL pool sizing (`apps/api/src/plugins/db.ts`).
- Redis caching for hot reads (`/me`, accessible workspaces, org list).
- Expand worker for background canonical refresh / engine work.
- Session retention + JWT rotation review.
- Audit `NEXT_PUBLIC_*` env vars.
- RASP investigation (Node-level).

## 10. Reference docs (live, source of truth)

- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — full topology + resolver detail
- [`docs/schema.md`](../schema.md) — Spec 3 PG schema
- [`docs/pipeline.md`](../pipeline.md) — connectors, datasets, canonical shapes
- [`docs/engines.md`](../engines.md) — engine catalogue
- [`docs/permissions.md`](../permissions.md) — permission program
- [`sql/migrations/`](../../sql/migrations/) — live schema source of truth
- [`HANDOFF.md`](../../HANDOFF.md) — fresh-chat quick reference

## Cross-refs

[architecture](architecture.md) · [engines](engines.md) · [permissions](permissions.md)
