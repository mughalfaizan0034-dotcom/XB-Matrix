<#
.SYNOPSIS
  Provision the api-database-admin-url Secret Manager secret used by the
  deploy-backend workflow's Apply pending DB migrations step.

.DESCRIPTION
  The runtime DSN (api-database-url) connects as the least-privileged
  application user (xbmatrixapp). That user intentionally cannot run
  DDL (migration 0007 revokes CREATE on schema public). The migrate
  step therefore needs a SEPARATE, admin-capable DSN — that's what
  api-database-admin-url holds.

  This script constructs the admin DSN from the postgres user's
  credentials and the existing api-database-url secret (for the host
  + db name), then writes it to Secret Manager and grants the deploy
  service account read access. Idempotent — re-run any time the
  postgres password rotates.

.PARAMETER PostgresPassword
  Password for the `postgres` role on the Cloud SQL instance. Required.
  Won't be logged.

.PARAMETER PostgresUser
  PostgreSQL admin role. Defaults to `postgres`.

.PARAMETER ProjectId
  GCP project id. Defaults to `gcloud config get project`.

.PARAMETER DeployServiceAccount
  Email of the deploy SA. Auto-discovered when omitted (same heuristic
  as grant-deploy-iam.ps1).

.EXAMPLE
  .\setup-migrations-secret.ps1 -PostgresPassword '<paste-here>'
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $PostgresPassword,
  [string] $PostgresUser = 'postgres',
  [string] $ProjectId,
  [string] $DeployServiceAccount,
  [string] $RuntimeSecretName = 'api-database-url',
  [string] $AdminSecretName = 'api-database-admin-url'
)

$ErrorActionPreference = 'Stop'

function Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

Step 'Checking gcloud'
$null = & gcloud --version 2>&1
if ($LASTEXITCODE -ne 0) { throw 'gcloud CLI is not installed or not on PATH.' }

if (-not $ProjectId) {
  $ProjectId = (& gcloud config get-value project 2>$null).Trim()
  if (-not $ProjectId) { throw 'No project set — pass -ProjectId.' }
}
Ok "project: $ProjectId"

# Auto-discover deploy SA the same way grant-deploy-iam.ps1 does.
if (-not $DeployServiceAccount) {
  Step 'Looking up deploy service account'
  $raw = & gcloud iam service-accounts list --project=$ProjectId --format='value(email)' 2>$null
  $all = if ($raw) { $raw -split "`n" | Where-Object { $_ } } else { @() }
  $candidates = $all | Where-Object {
    $_ -match 'deploy|deployer|github|actions|gha|ci-' -and
    $_ -notmatch 'runtime|app|worker'
  }
  if ($candidates.Count -ne 1) {
    Write-Host ''
    if ($candidates.Count -eq 0) {
      Write-Host 'No obvious deploy SA found. All service accounts:' -ForegroundColor Yellow
      foreach ($e in $all) { Write-Host "  $e" }
    } else {
      Write-Host 'Multiple candidates:' -ForegroundColor Yellow
      foreach ($e in $candidates) { Write-Host "  $e" }
    }
    throw 'Re-run with -DeployServiceAccount <email>.'
  }
  $DeployServiceAccount = $candidates[0]
  Ok "auto-picked deploy SA: $DeployServiceAccount"
}

# Derive host + db name from the existing runtime DSN so we don't have
# to re-ask for them. The format is the Cloud SQL connector form:
#   postgresql://user:pass@/db?host=/cloudsql/PROJECT:REGION:INSTANCE
Step "Reading existing runtime DSN ($RuntimeSecretName) for host + db name"
$runtimeUrl = & gcloud secrets versions access latest `
  --secret=$RuntimeSecretName --project=$ProjectId 2>$null
if (-not $runtimeUrl) {
  throw "$RuntimeSecretName secret not found. The runtime DSN must exist first; this script reuses its host + db name."
}
# Mask sensitive values regardless of host (the runtime password is in there too).
Write-Host "::add-mask::$runtimeUrl" -NoNewline

$dbName = ($runtimeUrl -replace '^postgresql://[^@]*@/([^?]*).*', '$1')
$hostPart = ($runtimeUrl -replace '^.*\?host=([^&]*).*', '$1')
if (-not $dbName -or -not $hostPart) {
  throw "Could not parse db name + host from runtime DSN. Expected postgresql://user:pass@/db?host=/cloudsql/..."
}
Ok "db: $dbName"
Ok "host: $hostPart"

# URL-encode the password so special chars (! @ # $ : / etc) don't
# break the DSN parser. The minimum set that PostgreSQL DSN parsers
# choke on:  : / ? # [ ] @ ! $ & ' ( ) * + , ; =  plus space.
Add-Type -AssemblyName System.Web
$encodedPass = [System.Web.HttpUtility]::UrlEncode($PostgresPassword)

$adminUrl = "postgresql://${PostgresUser}:${encodedPass}@/${dbName}?host=${hostPart}&sslmode=disable"
Write-Host "::add-mask::$adminUrl" -NoNewline

Step "Ensuring secret '$AdminSecretName' exists"
$exists = & gcloud secrets describe $AdminSecretName --project=$ProjectId --format='value(name)' 2>$null
if ($LASTEXITCODE -eq 0 -and $exists) {
  Ok 'secret already exists — will add a new version'
} else {
  & gcloud secrets create $AdminSecretName --project=$ProjectId --replication-policy=automatic | Out-Null
  Ok 'created'
}

Step 'Adding a new secret version with the admin DSN'
$tmp = New-TemporaryFile
try {
  Set-Content -Path $tmp.FullName -Value $adminUrl -NoNewline -Encoding ascii
  & gcloud secrets versions add $AdminSecretName --project=$ProjectId --data-file=$tmp.FullName | Out-Null
} finally {
  Remove-Item $tmp.FullName -Force -ErrorAction SilentlyContinue
}
Ok 'new version added'

Step "Granting secretAccessor on '$AdminSecretName' to deploy SA"
& gcloud secrets add-iam-policy-binding $AdminSecretName `
  --project=$ProjectId `
  --member="serviceAccount:$DeployServiceAccount" `
  --role='roles/secretmanager.secretAccessor' | Out-Null
Ok 'binding ensured'

Write-Host ''
Write-Host 'Done. Next:' -ForegroundColor Green
Write-Host '  Trigger any backend deploy (push a backend-tracked change or'
Write-Host '  re-run the workflow). The migrate step will pick up the secret'
Write-Host '  and apply pending migrations.'
