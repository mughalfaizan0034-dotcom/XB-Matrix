# XB Matrix — Session Handoff

Pointer doc for starting a fresh chat with full context. Read this end-to-end
first, then `CLAUDE.md` for architecture, then the open items below.

---

## Repo & owner

- Repo: `mughalfaizan0034-dotcom/XB-Matrix` (main branch deploys to GH Pages + Cloud Run).
- Local path: `T:\Projects\XB Matrix`
- Working dir is Windows; both Bash and PowerShell tools available.
- Owner: Faizan (`mughalfaizan034@gmail.com`).
- Latest commit shipped: **V0.16.1** (`8978035`) — sidebar nav rename PPC → Advertisements.

---

## Sign-in credentials

- Super admin (the only one — locked from API/UI creation):
  - **Username**: `faizan`
  - **Password**: COMPROMISED (see Urgent #1 below). Rotate immediately via the
    `reset:admin` CLI.

To rotate / recover access:
```bash
pnpm --filter @xb/api reset:admin -- --list
pnpm --filter @xb/api reset:admin -- --username faizan --password '<NEW>'
```
CLI requires `DATABASE_URL` pointing at the production Cloud SQL via the Cloud
SQL Auth Proxy (or local).

---

## URGENT — must address first

### 1. Plaintext password leak (GitGuardian alert)

`sql/migrations/0017_reset_super_admin.sql` line 14 contains the plaintext
super-admin password in a comment:
```sql
-- Generated locally for password "vLFkvTfrD?KSEbEZ".
```
This is now in public git history. Required steps:

1. Edit `0017_reset_super_admin.sql` to strip the plaintext from the comment.
2. Add migration `0020_rotate_super_admin_password.sql` that resets the
   `faizan` user's `password_hash` to a fresh scrypt hash (generated locally,
   plaintext NEVER committed). Use the same pattern as 0017 minus the leak.
3. Communicate the new password to the operator out of band; do not log it.
4. Optional: rewrite git history to scrub the old commit (BFG / filter-repo).
   The user has not yet authorized this — discuss before doing it.

### 2. Workspace selection doesn't survive refresh

User reports they keep landing on `/select-workspace` on every refresh. After
V0.15.1 the backend writes `xb_core.sessions.active_workspace_id` inside the
same transaction as the UPDATE, so persistence SHOULD work — verify this is
actually deploying and persisting by:
- Run `SELECT id, active_workspace_id, revoked_at, expires_at FROM xb_core.sessions WHERE user_id = '<faizan-user-id>' ORDER BY last_seen_at DESC LIMIT 5;`
- Check that `active_workspace_id` is populated after a switch.
- If yes → frontend bug; trace `/v1/auth/me` response on refresh.
- If null → backend regression; check `selectActiveWorkspace` in
  `apps/api/src/services/workspace-service.ts`.

User also wants:
- **No back-arrow button** on `/select-workspace` (currently present at the top
  of `apps/web/src/app/(app)/select-workspace/page.tsx`).
- Sign-in lands on `/select-workspace` with nav hidden (already done via
  `apps/web/src/components/app-shell.tsx`).
- Once a workspace is picked, user stays in that workspace; refresh must NOT
  bounce back to picker.

### 3. Generic upload removed from dialog but the file is empty

User wants no generic uploads. Verify `apps/web/src/components/upload-dialog.tsx`
`KIND_OPTIONS` array does not include `generic`. Also confirm the backend
still accepts `generic` only as a fallback for legacy rows (keep registered
in `UPLOAD_KINDS` so display still works).

---

## Recent direction (newest wins) — see CLAUDE.md Part 7 for full text

- **Uploads**: single normalized file per dataset (`sales_performance`,
  `inventory_position`, `advertising_performance`). Marketplace is a column
  inside the file. No per-marketplace upload kinds in the UI. Templates page
  is **download-only** plus a separate **Download Guide** button that
  produces a branded PDF via `apps/web/src/lib/upload-guide-pdf.ts`.
- **Dataset labels** in UI: "Sales Report", "Inventory Report", "Ads Report",
  "Warehouse Inventory (coming soon)". DO NOT use the word
  "omnichannel" anywhere user-facing.
- **Auth**: username sign-in (no email anywhere in the user flow). Email
  column on `xb_core.users` is nullable; legacy email code paths (invitations,
  forgot-password, email verification) are dormant but still in the tree.
  Remove them as encountered. "Remember this device" → 30-day session.
- **Roles** (5 tiers): `super_admin` (exactly ONE, migration-provisioned
  only, NOT creatable via API) > `internal_manager` > `internal_staff` >
  `organization_admin` > `organization_user`. RLS bypass flag
  (`isInternalManager`) is true for super_admin AND internal_manager;
  super-admin-only checks use `effectiveRole === 'super_admin'`.
- **User management**: action is **"Remove user"** (soft delete, idempotent,
  no row_version, revokes sessions). The super-admin row cannot be removed.
- **Workspace type**: optional, controlled select — Marketplace / DTC /
  Warehouse / General. UI-constrained; DB column stays nullable.
- **Sign-in page**: footer "Powered by Xcelerate Brands" linking
  `https://www.xceleratebrands.com/`.

---

## Pending operator requests (not yet implemented)

These came in just before the handoff and are open work:

1. **Connection pooling** — Cloud SQL pool sizing review on `pg.Pool` in
   `apps/api/src/plugins/db.ts`. Currently defaults; size based on Cloud Run
   instance count × per-instance concurrency.
2. **Caching layer** — wrap hot reads (`/me`, accessible workspaces,
   organization list) in Redis (already provisioned). Cache keys scoped per
   actor + per-org. Invalidate on writes.
3. **Background sync** — long-running canonical refresh / engine work moves
   off the request path into Cloud Tasks workers (worker app exists; expand
   it). Re-use the GCS-backed upload pipeline pattern.
4. **Session retention security** — review the 30-day remember-device flow.
   Cookie + session row TTLs must align; rotate the JWT secret on
   compromise; document.
5. **API secrets in backend only** — audit any `NEXT_PUBLIC_*` env var; only
   the API base URL should be public. All credentials live in Secret Manager
   and only the runtime API service account can read them.
6. **RASP** — runtime application self-protection. Investigate a Node-level
   tool (Snyk Runtime, Datadog ASM, Dynatrace, or build minimal in-process
   anomaly detection). Decide scope first.

---

## Repo geography

```
apps/
  api/           Fastify backend (Cloud Run)
    src/
      cli/       seed-admin, reset-admin
      plugins/   db, redis, auth-cookie, audit-context, storage, email
      routes/    auth, workspaces, organizations, users, uploads,
                 sku-aliases, unresolved-sku, bootstrap, invitations (dormant)
      services/  auth, users, workspace, upload, sku-alias,
                 unresolved-queue, bootstrap, session, token, invitations
      uploads/
        validators/  sales-performance, inventory-position, advertising-performance,
                     amazon-*, walmart-sales (adapters), csv-helpers
        mappers/     sales-performance, inventory-position, advertising-performance,
                     amazon-*, walmart-sales, helpers, types
  web/           Next.js 14 static export → GitHub Pages
    src/
      app/(app)/   authenticated routes (dashboard, sales, ppc, inventory,
                   shipments, uploads, reports, unit-economics, sku-aliases,
                   settings, settings/bootstrap, select-workspace)
      app/sign-in/ public sign-in (username + remember device)
      components/  sidebar, topbar, app-shell, protected, workspace-switcher,
                   add-user-dialog, upload-dialog, upload-templates-panel,
                   new/edit-workspace-dialog, users-list-nested, ...
      lib/         api-*, session, upload-guide-pdf, upload-kind-labels
packages/
  types/   @xb/types — shared types (Actor, EffectiveRole, branded ids)
  auth/    @xb/auth  — resolver + RuleProvider
  ui/      @xb/ui    — design system primitives (DataTable, Dialog, ...)
  config/  @xb/config — env loader
sql/migrations/  0001..0019 (next will be 0020)
```

Important: `@xb/types` and `@xb/auth` consumers import from `dist/`. After
editing those packages you must `pnpm --filter @xb/types build` (and
`@xb/auth build`) before typechecking the apps.

---

## Quick reference — common commands

```bash
# Typecheck
pnpm --filter @xb/api typecheck
pnpm --filter @xb/web typecheck

# Rebuild shared packages after type changes
pnpm --filter @xb/types build && pnpm --filter @xb/auth build

# Dev
pnpm --filter @xb/api dev      # API on :3000
pnpm --filter @xb/web dev      # web on :3001

# Migrations (run via deploy workflow against Cloud SQL)
pnpm --filter @xb/api db:status
pnpm --filter @xb/api db:migrate
pnpm --filter @xb/api db:rollback

# Recovery
pnpm --filter @xb/api reset:admin -- --list
pnpm --filter @xb/api reset:admin -- --username faizan --password '<NEW>'
```

---

## Memory + CLAUDE.md

Long-form persistent context lives in:

- `CLAUDE.md` — full architecture (Parts 1–7). Part 7 has the most recent
  operating decisions. **Always read CLAUDE.md before changing architecture.**
- `~/.claude/projects/.../memory/MEMORY.md` — auto-memory index. Saved
  memories:
  - `feedback_mapping_pipeline.md` — Connectors → Validators → Mappers →
    Resolution → Canonical → Summary → Engines → UI
  - `feedback_unresolved_queue_is_core.md`
  - `feedback_connectors_are_just_ingestion.md`
  - `feedback_uploads_are_operational_categories.md`
  - `feedback_ui_hierarchy_operational_first.md`
  - `feedback_auth_direction.md`

---

## Style & working preferences (learned from this session)

- Operator wants UI **lean** — no metadata walls, no speculative "planned"
  lists in operator-facing UI. They have called extra decoration "trash".
  Default to fewer fields, less prose.
- Operational dataset is always the primary entity; connectors/marketplaces
  are supporting columns inside the data, never separate UI tabs.
- Decisive single-pass commits. Don't fragment a slice into many "patch"
  bumps; ship a coherent V0.x.y with everything related.
- Never put secrets in committed files. Even in comments. Even temporarily.
  Use `--password` CLI args; tell the operator the value in chat.
- After making type changes in `packages/*`, REBUILD those packages before
  typechecking the apps — consumers read from `dist/`.

---

## How to resume — first prompt in a new chat

> Read `HANDOFF.md` then `CLAUDE.md` (especially Part 7). The latest shipped
> version is V0.16.1 (`8978035`). My active super-admin is `faizan` — the
> previous password is compromised per `HANDOFF.md` URGENT #1, please address
> that first along with the workspace-refresh persistence bug. Then continue
> the foundation roadmap (pooling, caching, background sync, secrets, RASP)
> per the same doc.
