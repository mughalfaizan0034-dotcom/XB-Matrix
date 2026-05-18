# Runbook (foundation phase)

> Operational playbook for the foundation phase. As engines and ingestion land, add per-module sections here.

## Database users

Two distinct PostgreSQL roles. Never blur the line.

| Role | Used by | Privileges | Password stored as |
|---|---|---|---|
| `postgres` | migrations (`pnpm db:migrate`), admin one-offs | Cloud SQL `cloudsqlsuperuser` member — full DDL | `xb-db-password-postgres` |
| `xbmatrixapp` | api + worker runtime traffic | Only the explicit grants from migration `0007`: USAGE on every `xb_*` schema, CRUD on operational schemas, SELECT+INSERT on `xb_audit.audit_log`, no DDL, no `CREATE DATABASE/SCHEMA/ROLE`, no `cloudsqlsuperuser` membership | `xb-db-password-app` |

Migration `0007_runtime_user_grants.sql` is what enforces the runtime role's privileges. Re-run after any schema change that introduces a new operational schema. New tables inside existing operational schemas pick up grants automatically via `ALTER DEFAULT PRIVILEGES`.

### Rotate a DB password

Both rotations share one PowerShell script. The script generates a fresh alphanumeric password, sets it on the Cloud SQL user, and adds a new version to the corresponding Secret Manager secret. You then update the `DATABASE_URL` consumer (local `.env` or the `api-database-url` secret in production).

```powershell
# Runtime user
.\infrastructure\local\reset-db-user.ps1 -DbUser xbmatrixapp -SecretName xb-db-password-app

# Migration user
.\infrastructure\local\reset-db-user.ps1 -DbUser postgres    -SecretName xb-db-password-postgres
```

After rotating `xbmatrixapp`, you must also update the production `api-database-url` secret — see [Update production DATABASE_URL after app-user rotation](#update-production-database_url-after-app-user-rotation).

## Deploys

### Backend (api + worker)

Triggered by push to `main` touching `apps/api/**`, `apps/worker/**`, shared packages, `sql/**`, or `infrastructure/**`. See `.github/workflows/deploy-backend.yml`.

Required repo secrets:

| Name | Purpose |
|---|---|
| `GCP_WIF_PROVIDER` | Workload Identity Federation provider resource name |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | SA email used by the workflow to assume WIF |
| `CLOUD_SQL_CONNECTION_NAME` | `xb-matrix:us-central1:xbmatrix-postgres` |

Required repo variables:

| Name | Purpose |
|---|---|
| `GCP_PROJECT_ID` | `xb-matrix` |
| `GCP_REGION` | `us-central1` |
| `ARTIFACT_REGISTRY_REPO` | repo inside Artifact Registry, e.g. `xb-images` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | `xbmatrix-runtime@xb-matrix.iam.gserviceaccount.com` |
| `GCS_UPLOADS_BUCKET` | uploads bucket name |
| `GCS_REPORTS_BUCKET` | reports bucket name |
| `CLOUD_TASKS_QUEUE` | Cloud Tasks queue name |
| `CLOUD_TASKS_LOCATION` | Cloud Tasks location |
| `VPC_CONNECTOR` | Serverless VPC Access connector name (required to reach Redis on private IP) |
| `NEXT_PUBLIC_API_BASE_URL` | public API URL the web app calls |

Required Secret Manager entries (all bound to the runtime SA with `roles/secretmanager.secretAccessor`):

| Secret | Value format |
|---|---|
| `api-database-url` | `postgresql://xbmatrixapp:<pw>@/xbmatrix?host=/cloudsql/xb-matrix:us-central1:xbmatrix-postgres` |
| `api-redis-url` | `redis://10.7.249.43:6379` (private VPC IP — Cloud Run uses VPC connector) |
| `api-jwt-secret` | random 48-byte base64 |
| `ai-groq-api-key` | optional |
| `ai-openrouter-api-key` | optional |

The runtime SA also needs project-level: `roles/cloudsql.client`, `roles/secretmanager.secretAccessor`, `roles/run.invoker`, plus whatever else specific features require (BigQuery, Storage, Cloud Tasks).

### Frontend (web)

Triggered by push to `main` touching `apps/web/**` or shared frontend packages. See `.github/workflows/deploy-web.yml`. Deploys static export to GitHub Pages.

Repo variable: `NEXT_PUBLIC_API_BASE_URL`.

The site lives at `https://<owner>.github.io/xb-matrix/` (with `WEB_BASE_PATH=/xb-matrix`). If you switch to a custom domain, blank `WEB_BASE_PATH`.

## Migrations

Migrations are run **manually** by an operator (not in the deploy workflow yet). The workflow that adds a migration-gate step lands later.

### Local dev

```powershell
# 1. Start Cloud SQL Auth Proxy in a separate terminal
cloud-sql-proxy --address 127.0.0.1 --port 5432 xb-matrix:us-central1:xbmatrix-postgres

# 2. Make sure apps/api/.env has DATABASE_URL pointed at 127.0.0.1:5432 with the postgres user
#    DATABASE_URL=postgresql://postgres:<pw>@127.0.0.1:5432/xbmatrix?sslmode=disable

# 3. Apply
pnpm db:migrate
pnpm db:status
pnpm db:rollback  # local dev only
```

### Production

Same shape, but with care:

1. Open a temporary Cloud SQL Auth Proxy from an operator workstation.
2. Pull the **postgres** password from Secret Manager:
   ```powershell
   $pw = (gcloud secrets versions access latest --secret=xb-db-password-postgres --project=xb-matrix).Trim()
   ```
3. Apply via `pnpm db:migrate` with `DATABASE_URL` set to use the `postgres` user.
4. Never use the `xbmatrixapp` user for migrations — it has no DDL rights by design.

### Update production DATABASE_URL after app-user rotation

After rotating `xbmatrixapp`'s password (which writes a new version to `xb-db-password-app`), the `api-database-url` secret still points at the old password. Rewrite it:

```powershell
$gcloud = 'C:\Users\mugha\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
$pw  = (& $gcloud secrets versions access latest --secret=xb-db-password-app --project=xb-matrix).Trim()
$dsn = 'postgresql://xbmatrixapp:' + $pw + '@/xbmatrix?host=/cloudsql/xb-matrix:us-central1:xbmatrix-postgres'
$dsn | & $gcloud secrets versions add api-database-url --project=xb-matrix --data-file=-
```

Then redeploy the api + worker (`gh workflow run deploy-backend.yml` or push a no-op commit). Cloud Run picks up `latest` on the next revision.

## Health checks

| Service | Liveness | Readiness |
|---|---|---|
| api | `GET /health/live` | `GET /health/ready` (checks PG + Redis) |
| worker | `GET /health/live` | `GET /health/ready` (checks PG + Redis) |

Cloud Run startup probe uses `/health/ready`; liveness uses `/health/live`.

## Logs

Cloud Run → Logs Explorer. Filter by `resource.labels.service_name = "xb-api"` or `"xb-worker"`. Every log line carries the request ID (`x-request-id` header, propagated via `requestId` plugin).

## Common operational tasks

### Rotate JWT secret

1. Generate new 32+ random bytes.
2. Add as a new version to Secret Manager: `gcloud secrets versions add api-jwt-secret --data-file=-`.
3. Redeploy api (Cloud Run picks up `latest`). All existing sessions invalidate.

### Run a one-off SQL against production

Use Cloud SQL Auth Proxy locally as the `postgres` user only when you genuinely need DDL. For SELECTs, use `xbmatrixapp` so RLS context behaves the same as runtime traffic — set the connection context first:

```sql
SET LOCAL app.current_organization_id = '<org_ulid>';
SET LOCAL app.current_actor_id        = '<actor_ulid>';
SET LOCAL app.current_actor_kind      = 'internal_user';
SET LOCAL app.is_internal_manager     = 'true';
```

Without those, every `xb_*` table filtered by RLS returns zero rows — by design.

### Clear a stuck task

Cloud Tasks console → queue → pause → drop or replay messages. Worker idempotency ensures re-delivery is safe (when implemented).

## On-call

> When on-call goes live, link the rotation here and add the paging policy.
