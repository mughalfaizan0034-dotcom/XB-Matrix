<#
.SYNOPSIS
  Grant the GitHub Actions deploy service account the IAM roles it needs
  to run pending DB migrations as part of the deploy workflow.

.DESCRIPTION
  The deploy-backend workflow runs Cloud SQL Auth Proxy + pnpm db:migrate
  before deploying the new Cloud Run revision. That requires two roles
  on the DEPLOY service account (separate from the runtime SA):

    1. roles/cloudsql.client                — use Cloud SQL Auth Proxy
    2. roles/secretmanager.secretAccessor   — read api-database-url

  Idempotent: gcloud no-ops if the binding already exists.

.PARAMETER DeployServiceAccount
  Email of the deploy SA. Find this in the GitHub repo settings under
  Secrets and variables → Actions → GCP_DEPLOY_SERVICE_ACCOUNT.
  Required.

.PARAMETER ProjectId
  GCP project id. Defaults to `gcloud config get project`.

.PARAMETER SecretName
  Name of the database URL secret. Defaults to `api-database-url`
  (matches the workflow + api.service.yaml).

.EXAMPLE
  .\grant-deploy-iam.ps1 -DeployServiceAccount xb-deployer@xb-matrix.iam.gserviceaccount.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $DeployServiceAccount,
  [string] $ProjectId,
  [string] $SecretName = 'api-database-url'
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }

Step 'Checking gcloud is available'
$null = & gcloud --version 2>&1
if ($LASTEXITCODE -ne 0) { throw 'gcloud CLI is not installed or not on PATH.' }

if (-not $ProjectId) {
  Step 'Resolving project id from gcloud config'
  $ProjectId = (& gcloud config get-value project 2>$null).Trim()
  if (-not $ProjectId) { throw 'No project set — pass -ProjectId or run `gcloud config set project ...`' }
}
Ok "project: $ProjectId"
Ok "deploy SA: $DeployServiceAccount"

Step "Granting roles/cloudsql.client at the project level"
& gcloud projects add-iam-policy-binding $ProjectId `
  --member="serviceAccount:$DeployServiceAccount" `
  --role='roles/cloudsql.client' `
  --condition=None | Out-Null
Ok 'cloudsql.client ensured'

Step "Granting roles/secretmanager.secretAccessor on $SecretName"
& gcloud secrets add-iam-policy-binding $SecretName `
  --project=$ProjectId `
  --member="serviceAccount:$DeployServiceAccount" `
  --role='roles/secretmanager.secretAccessor' | Out-Null
Ok 'secretmanager.secretAccessor ensured'

Write-Host ''
Write-Host 'Done. Next:' -ForegroundColor Green
Write-Host "  Re-run the failed deploy-backend workflow from the GitHub Actions UI,"
Write-Host "  or push any change to a backend-tracked path to trigger a new run."
Write-Host '  The Apply pending DB migrations step should now succeed.'
