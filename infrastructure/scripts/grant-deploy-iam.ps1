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
  [string] $DeployServiceAccount,
  [string] $ProjectId,
  [string] $SecretName = 'api-database-url'
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

Step 'Checking gcloud is available'
$null = & gcloud --version 2>&1
if ($LASTEXITCODE -ne 0) { throw 'gcloud CLI is not installed or not on PATH.' }

if (-not $ProjectId) {
  Step 'Resolving project id from gcloud config'
  $ProjectId = (& gcloud config get-value project 2>$null).Trim()
  if (-not $ProjectId) { throw 'No project set — pass -ProjectId or run `gcloud config set project ...`' }
}
Ok "project: $ProjectId"

# Auto-discover the deploy SA if not explicitly supplied. GitHub Actions
# Secrets are write-only in the UI (you cannot read the value back after
# saving) so users hit this script with the original value lost.
# Heuristic: list SAs whose email looks like a deployer / CI runner.
if (-not $DeployServiceAccount) {
  Step 'No -DeployServiceAccount provided; looking for likely candidates'
  $raw = & gcloud iam service-accounts list --project=$ProjectId --format='value(email)' 2>$null
  $all = if ($raw) { $raw -split "`n" | Where-Object { $_ } } else { @() }
  $candidates = $all | Where-Object {
    $_ -match 'deploy|deployer|github|actions|gha|ci-' -and
    $_ -notmatch 'runtime|app|worker'
  }
  if ($candidates.Count -eq 0) {
    Write-Host ''
    Write-Host 'No obvious deploy SA found. All service accounts in this project:' -ForegroundColor Yellow
    foreach ($e in $all) { Write-Host "  $e" }
    Write-Host ''
    throw 'Re-run with -DeployServiceAccount <email> picked from the list above.'
  }
  if ($candidates.Count -gt 1) {
    Write-Host ''
    Write-Host 'Multiple deploy-like SAs found:' -ForegroundColor Yellow
    foreach ($e in $candidates) { Write-Host "  $e" }
    Write-Host ''
    throw 'Re-run with -DeployServiceAccount <email> picked from the list above.'
  }
  $DeployServiceAccount = $candidates[0]
  Warn "auto-picked: $DeployServiceAccount"
  Warn 'If that is wrong, abort with Ctrl+C and re-run with -DeployServiceAccount.'
  Start-Sleep -Seconds 3
}
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
