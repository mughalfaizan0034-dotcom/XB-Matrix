# Cloud Run Deployment

These service definitions are rendered with environment substitution at deploy time. The deploy workflow (`.github/workflows/deploy-backend.yml`) replaces the `${...}` placeholders before applying.

## Placeholders

| Placeholder | Source |
|---|---|
| `${GCP_PROJECT_ID}` | repo secret |
| `${GCP_REGION}` | repo variable |
| `${ARTIFACT_REGISTRY}` | repo variable, e.g. `us-central1-docker.pkg.dev/xb-matrix-prod/xb-images` |
| `${IMAGE_TAG}` | computed in workflow (git SHA) |
| `${RUNTIME_SERVICE_ACCOUNT}` | repo variable, the runtime SA created in provisioning |
| `${CLOUD_SQL_CONNECTION_NAME}` | repo secret, e.g. `xb-matrix-prod:us-central1:xb-pg` |
| `${VPC_CONNECTOR}` | repo variable, e.g. `xb-vpc-connector` |
| `${GCS_UPLOADS_BUCKET}` / `${GCS_REPORTS_BUCKET}` | repo variables |
| `${CLOUD_TASKS_QUEUE}` / `${CLOUD_TASKS_LOCATION}` | repo variables |

## Secrets (in Secret Manager)

| Secret name | Contains |
|---|---|
| `api-database-url` | `postgresql://USER:PASS@/DB?host=/cloudsql/CONN_NAME` |
| `api-redis-url` | `redis://...` |
| `api-jwt-secret` | JWT signing secret (≥32 random bytes) |
| `ai-groq-api-key` | optional Groq key |
| `ai-openrouter-api-key` | optional OpenRouter key |

The runtime service account needs `roles/secretmanager.secretAccessor` on each.

## Apply manually

```sh
envsubst < infrastructure/cloudrun/api.service.yaml \
  | gcloud run services replace - --region=$GCP_REGION --project=$GCP_PROJECT_ID
```

Or use the CI deploy workflow (push to `main`).
