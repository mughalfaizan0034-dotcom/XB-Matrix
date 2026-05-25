# lifecycle-states

Canonical operational state machines. One row per domain. Prevents naming drift across BE columns, UI badges, and reviewers.

Status legend: `live` = shipped · `partial` = surface exists, states evolving · `planned` = not yet implemented (write the contract before code).

## Index

| Domain | States | Backend column | Status |
|---|---|---|---|
| Deletion | `active → soft_deleted → purge_scheduled → purged` | `deleted_at` / `purged_at` (NULL/NOT NULL) | live |
| Organization | `active → suspended → archived` | `organization_status` + `deleted_at` | live |
| Workspace | `active → archived` (+ `soft_deleted` / `purged` via deletion) | `workspace_status` + `deleted_at` / `purged_at` | live |
| User | `pending_invite → active → deactivated` (+ `soft_deleted` / `purged`) | `user_status` + `deleted_at` / `purged_at` | live |
| Actor | `active → deactivated → revoked` | `actor_status` | live |
| Session | `active → revoked` / `active → expired` | `revoked_at`, `expires_at`, `last_seen_at` | live |
| Upload | `pending → validating → mapping → loaded` / `failed` | `upload_status` | live |
| Unresolved SKU row | `open → resolved` / `dismissed` | `resolution_status` | partial |
| Report | `generating → ready → archived` / `failed` | `report_status` + `generated_at` | partial |
| Engine run | `pending → running → succeeded` / `failed` | `engine_run_status` | planned |
| Recommendation | `proposed → acknowledged → applied` / `dismissed` | `recommendation_status` | planned |
| Notification | `unread → read → dismissed` (+ `archived` after retention) | `notification_status` + `read_at` | partial |
| Support ticket | `open → working → waiting_for_customer → resolved → closed → archived` | `ticket_status` | planned |
| Feature flag | `off → on` (with optional `partial` rollout) | `flag_status` + per-scope override | live |
| Billing | `not_configured → trial → active → past_due → cancelled` | `billing_status` | live |
| Forecast output | `generated → superseded → archived` | `forecast_status` + `generated_at` | planned |
| Shipment movement | `planned → in_transit → received → cancelled` | `movement_status` | planned |

## Rules (apply to every domain)

- States are `varchar + CHECK`. Never native PG enum ([D-013](decisions.md)).
- Each state has exactly one badge token in [design-system §11](../design-system.md#11-badge-vocabulary). Do not invent per-domain badge colors.
- Transitions are explicit service calls; never silent UPDATEs scattered across the codebase.
- Each transition emits an operation-audit event (`<domain>.<verb>`) — see [backend-standards §7](../backend-standards.md#7-audit-philosophy).
- Soft-deletable domains carry **both** `deleted_at` and `purged_at` ([D-015](decisions.md)). Do not collapse.
- Status fields read from DB; UI never derives state from missing columns.

## Per-domain detail

### Deletion (canonical lifecycle)

| State | Condition | Emits |
|---|---|---|
| `active` | `deleted_at IS NULL` AND `purged_at IS NULL` | — |
| `soft_deleted` | `deleted_at IS NOT NULL` AND `purged_at IS NULL` | `record.soft_deleted` |
| `purge_scheduled` | `deleted_at < now() - 90d`, queued for orchestrator | (worker-internal) |
| `purged` | `purged_at IS NOT NULL` | `record.hard_deleted` (before DELETE) |

Restore (`soft_deleted → active`): clears `deleted_at`; emits `record.restored`. Idempotent.

### Organization

| State | `organization_status` | Notes |
|---|---|---|
| `active` | `'active'` | normal operation |
| `suspended` | `'suspended'` | reads/writes blocked at capability layer; data retained |
| `archived` | `'archived'` | read-only; surfaces hidden from non-internal actors |

Suspension and archive are independent of deletion. A suspended org can still be soft-deleted.

### Workspace

| State | `workspace_status` | Notes |
|---|---|---|
| `active` | `'active'` | normal |
| `archived` | `'archived'` | snapshot taken in `workspace_permission_snapshots` |

Plus deletion overlay. Workspace `archived_at` is its own timestamp (separate from `deleted_at`).

### User

| State | `user_status` | Notes |
|---|---|---|
| `pending_invite` | `'pending_invite'` | legacy — admins now create users directly ([D-029](decisions.md)) |
| `active` | `'active'` | can sign in |
| `deactivated` | `'deactivated'` | sessions revoked; cannot sign in |

Plus deletion overlay. "Remove user" = soft-delete + revoke sessions + emit `record.soft_deleted`.

### Actor

| State | `actor_status` | Notes |
|---|---|---|
| `active` | `'active'` | normal |
| `deactivated` | `'deactivated'` | non-human actors paused (API key disabled, connector off) |
| `revoked` | `'revoked'` | API key invalidated permanently |

### Session

| State | Condition |
|---|---|
| `active` | `revoked_at IS NULL` AND `expires_at > now()` |
| `revoked` | `revoked_at IS NOT NULL` |
| `expired` | `expires_at <= now()` |

Workspace switch writes `active_workspace_id` inside the same transaction ([D-040](decisions.md)).

### Upload

| State | `upload_status` | Next |
|---|---|---|
| `pending` | direct-to-GCS upload accepted, worker not started | `validating` |
| `validating` | validator running | `mapping` / `failed` |
| `mapping` | mapper running, `resolveSku()` per row | `loaded` / `failed` |
| `loaded` | canonical rows UPSERTed | terminal |
| `failed` | terminal | — |

Validation errors land in `xb_raw.upload_validation_errors` with `raw_row_snapshot`.

### Unresolved SKU row

| State | `resolution_status` | Notes |
|---|---|---|
| `open` | needs resolution | default |
| `resolved` | mapped to `sku_normalized` | emits `sku_alias.created` |
| `dismissed` | operator chose to skip | terminal |

First-class operator workflow ([D-025](decisions.md)). Expect AI-assist + confidence + bulk apply later.

### Report

| State | `report_status` | Notes |
|---|---|---|
| `generating` | worker producing PDF | |
| `ready` | PDF in GCS, downloadable | ≤ 30d |
| `archived` | > 30d, PDF purged, metadata kept | derive from `generated_at` if not stored |
| `failed` | terminal | |

Reports are engine outputs, not uploaded files ([D-041](decisions.md)).

### Engine run (planned)

| State | Notes |
|---|---|
| `pending` | queued, not started |
| `running` | engine executing |
| `succeeded` | output written to `xb_intelligence.*` with provenance |
| `failed` | terminal; surface error to caller |

Stamps `engine_key`, `engine_version`, `generated_at` ([D-022](decisions.md)).

### Recommendation (planned)

| State | Notes |
|---|---|
| `proposed` | engine wrote it; not yet seen |
| `acknowledged` | operator opened it; audit `ai_recommendation.acknowledged` |
| `applied` | operator executed the suggested action |
| `dismissed` | terminal |

### Notification (partial)

| State | Notes |
|---|---|
| `unread` | default; `read_at IS NULL` |
| `read` | `read_at IS NOT NULL` |
| `dismissed` | hidden from default list |
| `archived` | post-retention storage |

Workspace-scoped; per-actor read state.

### Support ticket (planned)

```
open → working → waiting_for_customer → resolved → closed → archived
```

Internal-only notes separate from public replies. RLS org-isolated. Audit on every transition.

### Feature flag

| State | Notes |
|---|---|
| `off` | default |
| `on` | platform-wide |
| `partial` | per-scope override row in `feature_flag_overrides` |

Operation audit: `feature_flag.enabled` / `feature_flag.disabled`.

### Billing

| State | `billing_status` | Notes |
|---|---|---|
| `not_configured` | default for new orgs | |
| `trial` | trial window | |
| `active` | paid | |
| `past_due` | overdue | reads continue; writes may be gated later |
| `cancelled` | terminal until reactivated | |

Stripe integration deferred; manual agency billing for now.

### Forecast output (planned)

| State | Notes |
|---|---|
| `generated` | active forecast |
| `superseded` | newer forecast for same scope exists |
| `archived` | aged out, BigQuery only |

Each forecast row carries `model_metadata` JSONB + provenance.

### Shipment movement (planned)

| State | Notes |
|---|---|
| `planned` | proposed transfer / reorder |
| `in_transit` | shipped, not received |
| `received` | inventory updated, terminal |
| `cancelled` | terminal |

## How to add a new lifecycle

1. Define the states in this file FIRST (architecture-agent).
2. Add CHECK constraint in the migration.
3. Map each state to a badge token in [design-system §11](../design-system.md#11-badge-vocabulary).
4. Define transition audit events.
5. Then backend-agent implements the service transitions.
6. Then frontend-agent consumes the badge tokens.
