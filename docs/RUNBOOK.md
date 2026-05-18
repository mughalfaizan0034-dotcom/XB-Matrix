# Runbook (foundation phase)

> Operational playbook for the foundation phase. As engines and ingestion land, add per-module sections here.

## Deploys

### Backend (api + worker)

Triggered by push to `main` touching `apps/api/**`, `apps/worker/**`, shared packages, `sql/**`, or `infrastructure/**`. See `.github/workflows/deploy-backend.yml`.

Required repo secrets:

| Name | Purpose |
|---|---|
| `GCP_WIF_PROVIDER` | Workload Identity Federation provider resource name |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | SA email used by the workflow to assume WIF |
| `CLOUD_SQL_CONNECTION_NAME` | `project:region:instance` |

Required repo variables:

| Name | Purpose |
|---|---|
| `GCP_PROJECT_ID` | GCP project hosting api+worker |
| `GCP_REGION` | e.g. `us-central1` |
| `ARTIFACT_REGISTRY_REPO` | repo inside Artifact Registry, e.g. `xb-images` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | runtime SA email used by Cloud Run services |
| `GCS_UPLOADS_BUCKET` | uploads bucket name |
| `GCS_REPORTS_BUCKET` | reports bucket name |
| `CLOUD_TASKS_QUEUE` | Cloud Tasks queue name |
| `CLOUD_TASKS_LOCATION` | Cloud Tasks location |
| `VPC_CONNECTOR` | Serverless VPC Access connector name |
| `NEXT_PUBLIC_API_BASE_URL` | public API URL the web app calls |

Required Secret Manager entries:

- `api-database-url`, `api-redis-url`, `api-jwt-secret`
- `ai-groq-api-key`, `ai-openrouter-api-key` (optional)

Grant the runtime SA `roles/secretmanager.secretAccessor` on each.

### Frontend (web)

Triggered by push to `main` touching `apps/web/**` or shared frontend packages. See `.github/workflows/deploy-web.yml`. Deploys static export to GitHub Pages.

Repo variable: `NEXT_PUBLIC_API_BASE_URL`.

The site lives at `https://<owner>.github.io/xb-matrix/` (with `WEB_BASE_PATH=/xb-matrix`). If you switch to a custom domain, blank `WEB_BASE_PATH`.

## Migrations

- Migrations run **manually** for now (not in deploy workflow). To run against production: from a workstation with Cloud SQL Auth Proxy:
  ```sh
  cloud-sql-proxy ${GCP_PROJECT_ID}:${GCP_REGION}:xb-pg &
  DATABASE_URL=postgresql://USER:PASS@localhost:5432/xbmatrix pnpm db:migrate
  ```
- Status: `pnpm db:status`
- Rollback (local only): `pnpm db:rollback`

When a migrations gating workflow lands, this section moves to the deploy workflow.

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

### Run a one-off SQL

Use Cloud SQL Auth Proxy locally with read-only credentials when possible. Avoid `psql` directly against production with write creds.

### Clear a stuck task

Cloud Tasks console → queue → pause → drop or replay messages. Worker idempotency ensures re-delivery is safe (when implemented).

## On-call

> When on-call goes live, link the rotation here and add the paging policy.
