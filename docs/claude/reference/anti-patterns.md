# anti-patterns

Short concrete regressions. Each entry: **bad** → **why** → **do this instead**. Tight on purpose — agents read these to recognize the shape, not to read prose.

Owns rationale: linked doc. Owns rule: [forbidden-patterns.md](forbidden-patterns.md).

## AP-1. Inline role check in a service

**Bad**
```ts
if (actor.effectiveRole === 'super_admin' || actor.effectiveRole === 'internal_manager') {
  // ...
}
```
**Why** drift between BE + FE + reviewer; CI banned ([D-005](decisions.md)).
**Instead**
```ts
import { canManageInternalUsers } from '@/lib/permissions';
if (!canManageInternalUsers(actor)) throw new ForbiddenError();
```

---

## AP-2. UI gating without a backend mirror

**Bad** — only the React component hides the button.
**Why** disabled-button ≠ enforced-policy; a curl call still succeeds.
**Instead** — add the capability guard in `apps/api/src/lib/permissions.ts` first, then `useCan(capability)` mirrors it.

---

## AP-3. Workspace ID from request body

**Bad**
```ts
const { workspaceId, ...rest } = req.body;
await writeRow({ workspaceId, ...rest });
```
**Why** any client can target any workspace; tenancy bypass ([D-040](decisions.md)).
**Instead**
```ts
const { workspaceId } = await requireActiveWorkspace(req);
```

---

## AP-4. Nested transactions inside `withConnection`

**Bad**
```ts
await app.withConnection(actor, async (tx) => {
  await app.withConnection(actor, async (tx2) => { /* nested */ });
});
```
**Why** broke purge orchestrator; FK errors got swallowed ([D-010](decisions.md)).
**Instead** — one `withConnection` per request; pass `tx` down. If you need parallelism, model it as queued worker tasks.

---

## AP-5. Silent catch-all DB suppression

**Bad**
```ts
try { await dropRowSafely(); } catch { /* swallow */ }
```
**Why** FK violation became "missing table"; real data error invisible.
**Instead** — let the orchestrator decide. Catch only the specific class you can recover from; rethrow the rest.

---

## AP-6. Frontend computing ACOS / TACOS / DOS

**Bad**
```ts
const tacos = (spend / sales) * 100;
```
**Why** dashboards diverge from reports diverge from AI ([D-023](decisions.md)).
**Instead** — engine output via `/v1/intelligence/*`. Render `data.tacos` + provenance.

---

## AP-7. Marketplace branching past the mapper

**Bad**
```ts
if (row.platform === 'amazon') aggregateAmazon(row);
else aggregateOther(row);
```
**Why** breaks blended views; channel-agnostic core violation ([D-001](decisions.md)).
**Instead** — same engine, optional `marketplaceCode` filter. Divergence belongs in the mapper.

---

## AP-8. Raw color utilities

**Bad** — `text-orange-500`, `bg-blue-50`, `#fb7c2d`, `style={{ color: '#fff' }}`.
**Why** theme drift; banned via CI ([D-003](decisions.md)).
**Instead** — `text-accent`, `bg-surface-elevated`, `bg-accent-soft`. See [design-system §1](../design-system.md#1-semantic-tokens-only-allowed).

---

## AP-9. Spinner on an operational page

**Bad** — `<Spinner />` while data loads.
**Why** layout shift, breaks enterprise tone, hides shape of the page.
**Instead** — skeleton matching the final layout (KPI tiles, table rows, chart shells).

---

## AP-10. Empty-state CTA on an operational module

**Bad** — *"Upload your first CSV to get started!"* card on Sales page.
**Why** the module renders as a live platform shell, not a setup wizard ([no-onboarding-clutter memory]).
**Instead** — `AwaitingData` placeholder shell with `—` glyphs. Uploads happen in the Uploads module.

---

## AP-11. Page-specific KPI math

**Bad** — `dashboard/page.tsx` computes `velocity = units / days` inline.
**Why** Dashboard and Reports drift; AI can't read it; no provenance.
**Instead** — add the metric to the registry, expose via `/v1/intelligence/*`, render the field.

---

## AP-12. Re-uploading creates duplicate canonical rows

**Bad** — INSERT into `channel_sales` without ON CONFLICT.
**Why** double-counted sales; engine output silently doubles.
**Instead** — UPSERT on the full natural key. For `channel_ads`, key must include `attribution_window_days` ([D-026](decisions.md)).

---

## AP-13. Inventory sum without `inventory_state` filter

**Bad**
```sql
SELECT SUM(quantity) FROM xb_canonical.channel_inventory WHERE ...;
```
**Why** mixes available + inbound + damaged + transfer; the number is meaningless ([D-048](decisions.md)).
**Instead** — `WHERE inventory_state = 'available'` for sellable; explicit state filter always.

---

## AP-14. CASCADE on an audit FK

**Bad**
```sql
created_by_actor_id char(26) REFERENCES xb_core.actors(id) ON DELETE CASCADE
```
**Why** purging an actor wipes audit history ([D-016](decisions.md)).
**Instead** — `ON DELETE SET NULL`. Audit row stays; actor reference becomes NULL.

---

## AP-15. Reusing `deleted_at` for purge

**Bad** — set `deleted_at = now()` when hard-deleting.
**Why** loses the soft-delete window; recycle-bin state machine collapses ([D-015](decisions.md)).
**Instead** — `purged_at` is a separate field. Hard-delete also writes `record.hard_deleted` audit before the DELETE.

---

## AP-16. Query key without actor / workspace

**Bad**
```ts
useQuery({ queryKey: ['sales-trends'], queryFn: fetchSalesTrends })
```
**Why** cache reuses across actors / workspaces; data leaks on switch ([D-004](decisions.md)).
**Instead**
```ts
useQuery({
  queryKey: ['sales-trends', { actorId, organizationId, workspaceId, ...filters }],
  queryFn: () => fetchSalesTrends(filters),
})
```

---

## AP-17. Forgetting `queryClient.clear()` on workspace switch

**Bad** — only `invalidateQueries` after switch.
**Why** stale data flashes from previous workspace; tenancy illusion broken.
**Instead** — full `queryClient.clear()` on sign-out, workspace switch, active-org change, role change.

---

## AP-18. `'use client'` on a static-export dynamic route

**Bad** — `'use client'` at top of `apps/web/src/app/(app)/[id]/page.tsx`.
**Why** breaks `next export` ([D-035](decisions.md)).
**Instead** — keep the route server-side; extract interactivity into a child client component.

---

## AP-19. `NEXT_PUBLIC_*` secret

**Bad** — `NEXT_PUBLIC_API_KEY` in `apps/web/.env`.
**Why** ships to the browser; visible to any user / scraper. Repo is public.
**Instead** — keep secrets in Secret Manager + only the API service account reads them. Only the API base URL is `NEXT_PUBLIC_`.

---

## AP-20. Plaintext secret in a comment

**Bad**
```sql
-- Generated locally for password "vLFkvTfrD?KSEbEZ".
```
**Why** committed to public history; happened once, rotated. Don't.
**Instead** — communicate the value out of band; commit only the hash.

---

## AP-21. Mixed-scope PR

**Bad** — one PR that adds a migration, an engine, an FE rewrite, and a chart wrapper.
**Why** un-reviewable; breaks atomic rollback; agent ownership unclear ([D-036](decisions.md)).
**Instead** — split per layer. Migration → engine → FE consumption → chart wrapper, in order.

---

## AP-22. Engine response missing provenance

**Bad** — `{ data: { tacos: 12.3 } }` only.
**Why** numbers can't be reproduced; AI can't cite ([D-021](decisions.md)).
**Instead**
```json
{
  "data": { "tacos": 12.3 },
  "meta": { "provenance": { "engineKey": "ppc-analytics", "engineVersion": "1.0.0", "generatedAt": "...", "windowStart": "...", "windowEnd": "...", "filters": {...}, "rowCount": 12345 } }
}
```

---

## AP-23. AI prompt reading canonical or uploads

**Bad** — assistant fetches `xb_canonical.channel_sales` directly.
**Why** breaks engine-as-truth ([D-043](decisions.md)); AI invents derivations.
**Instead** — assistant calls `/v1/intelligence/*` services; consumes deterministic engine output + provenance.

---

## AP-24. Purging a protected entity through a side door

**Bad** — purge service hits `DELETE FROM users WHERE id = :targetId` without `canDeleteActor`.
**Why** self-lockout, super_admin loss ([D-031](decisions.md)).
**Instead** — every purge path runs `canDeleteActor(actor, target)` at the orchestrator boundary; backend-first, never relying on UI.

---

## AP-25. Em dash or "omnichannel" in product copy

**Bad** — "Sales — omnichannel breakdown across channels."
**Why** operator preference, enterprise tone ([D-034](decisions.md)).
**Instead** — "Sales by channel." Use commas, colons, parentheses.

## How to add

- New entry only when a regression has actually happened or is high-risk per a [decision](decisions.md).
- Keep each entry to ~10 lines including the snippet. No prose drift.
- Reference the decision ID, not the rule restated.
