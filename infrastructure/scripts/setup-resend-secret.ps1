<#
.SYNOPSIS
  Provision the GCP Secret Manager secret that holds the Resend API key for
  the xB Matrix API, and grant the runtime service account read access.

.DESCRIPTION
  Idempotent — safe to re-run when rotating the key. The secret name
  (`api-resend-api-key`) is referenced from
  infrastructure/cloudrun/api.service.yaml; do not change one without the
  other.

  Cloud Run *rejects* deploys that reference missing secrets, so this
  script MUST be run successfully BEFORE the yaml change that adds the
  RESEND_API_KEY env entry is pushed.

.PARAMETER ApiKey
  The Resend API key (starts with `re_`). Required. Will be written to a
  new secret version. Never logged.

.PARAMETER ProjectId
  GCP project id. If omitted, reads `gcloud config get project`.

.PARAMETER RuntimeServiceAccount
  Email of the Cloud Run runtime SA. If omitted, the script reads it from
  the deployed `xb-api` service.

.PARAMETER Region
  GCP region for the API service. Defaults to us-central1 (the project's
  current region per the deploy workflow).

.EXAMPLE
  # Most common usage — supply only the key:
  .\setup-resend-secret.ps1 -ApiKey re_abcdef123456789

.EXAMPLE
  # Override everything if you have multiple projects:
  .\setup-resend-secret.ps1 -ApiKey re_xxx -ProjectId my-proj -Region us-central1 `
    -RuntimeServiceAccount xb-runtime@my-proj.iam.gserviceaccount.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $ApiKey,
  [string] $ProjectId,
  [string] $RuntimeServiceAccount,
  [string] $Region = 'us-central1',
  [string] $SecretName = 'api-resend-api-key',
  [string] $ServiceName = 'xb-api'
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# 1. Sanity-check gcloud
Step 'Checking gcloud is available'
$null = & gcloud --version 2>&1
if ($LASTEXITCODE -ne 0) {
  throw 'gcloud CLI is not installed or not on PATH. Install Google Cloud SDK first.'
}

# 2. Resolve project
if (-not $ProjectId) {
  Step 'Resolving project id from gcloud config'
  $ProjectId = (& gcloud config get-value project 2>$null).Trim()
  if (-not $ProjectId) { throw 'No project set — pass -ProjectId or run `gcloud config set project ...`' }
}
Ok "project: $ProjectId"

# 3. Resolve runtime SA
if (-not $RuntimeServiceAccount) {
  Step "Reading runtime service account from Cloud Run service $ServiceName"
  $RuntimeServiceAccount = (& gcloud run services describe $ServiceName `
    --region $Region --project $ProjectId `
    --format='value(spec.template.spec.serviceAccountName)' 2>$null).Trim()
  if (-not $RuntimeServiceAccount) {
    throw "Could not read serviceAccountName from $ServiceName in $Region. Pass -RuntimeServiceAccount explicitly."
  }
}
Ok "runtime SA: $RuntimeServiceAccount"

# 4. Create the secret (idempotent)
Step "Ensuring secret '$SecretName' exists"
$existing = & gcloud secrets describe $SecretName --project $ProjectId --format='value(name)' 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
  Ok 'secret already exists; will add a new version'
} else {
  & gcloud secrets create $SecretName --project $ProjectId --replication-policy=automatic | Out-Null
  Ok 'created'
}

# 5. Add a new secret version with the API key
Step 'Adding a new secret version with the supplied API key'
# Pipe via a temp file to avoid leaking the key on the command line.
$tmp = New-TemporaryFile
try {
  Set-Content -Path $tmp.FullName -Value $ApiKey -NoNewline -Encoding ascii
  & gcloud secrets versions add $SecretName --project $ProjectId --data-file=$tmp.FullName | Out-Null
} finally {
  Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue
}
Ok 'new version added'

# 6. Grant the runtime SA secretAccessor (idempotent — gcloud no-ops if present)
Step "Granting secretAccessor on '$SecretName' to runtime SA"
& gcloud secrets add-iam-policy-binding $SecretName `
  --project $ProjectId `
  --member="serviceAccount:$RuntimeServiceAccount" `
  --role='roles/secretmanager.secretAccessor' | Out-Null
Ok 'binding ensured'

Write-Host ''
Write-Host 'Done. Next steps:' -ForegroundColor Green
Write-Host "  1. Verify the secret:   gcloud secrets versions list $SecretName --project $ProjectId"
Write-Host "  2. Push the yaml change (RESEND_API_KEY env entry) and the next deploy will pick it up."
Write-Host '  3. After redeploy, look for `email provider configured` in Cloud Run logs.'
