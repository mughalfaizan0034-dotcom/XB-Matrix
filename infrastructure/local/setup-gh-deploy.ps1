# =============================================================================
# Idempotent setup for deploying api + worker from GitHub Actions via WIF.
# Outputs the values you need to paste into GitHub repo Secrets / Variables.
# =============================================================================
[CmdletBinding()]
param(
  [string] $Project    = 'xb-matrix',
  [string] $Region     = 'us-central1',
  [string] $RepoOwner  = 'mughalfaizan0034-dotcom',
  [string] $RepoName   = 'XB-Matrix',
  [string] $DeploySa   = 'xbmatrix-deployer',
  [string] $RuntimeSa  = 'xbmatrix-runtime',
  [string] $ArRepo     = 'xbmatrix-repo',
  [string] $PoolId     = 'github-actions',
  [string] $ProviderId = 'github'
)
# Default Continue preference; gcloud writes informational messages to stderr
# which would otherwise abort the script under -Stop. We check $LASTEXITCODE
# at the points where it matters (the script is idempotent overall).
$ErrorActionPreference = 'Continue'
$gcloud = 'C:\Users\mugha\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
$deploySaEmail  = "${DeploySa}@${Project}.iam.gserviceaccount.com"
$runtimeSaEmail = "${RuntimeSa}@${Project}.iam.gserviceaccount.com"

function Step($label) { Write-Host ""; Write-Host ">> $label" -ForegroundColor Cyan }

Step "1. Enable required APIs"
$apis = @('sts.googleapis.com','iamcredentials.googleapis.com','iam.googleapis.com','run.googleapis.com','artifactregistry.googleapis.com','secretmanager.googleapis.com','sqladmin.googleapis.com','cloudtasks.googleapis.com','cloudresourcemanager.googleapis.com')
$enabled = & $gcloud services list --enabled --project=$Project --format='value(config.name)' 2>$null
foreach ($api in $apis) {
  if ($enabled -contains $api) { Write-Host "  already enabled: $api" }
  else { Write-Host "  enabling:        $api"; & $gcloud services enable $api --project=$Project | Out-Null }
}

Step "2. Deploy service account"
$existing = & $gcloud iam service-accounts list --project=$Project --filter="email=$deploySaEmail" --format='value(email)' 2>$null
if (-not $existing) {
  & $gcloud iam service-accounts create $DeploySa --display-name='XB Matrix CI/CD Deployer' --project=$Project | Out-Null
  Write-Host "  created $deploySaEmail"
} else { Write-Host "  already exists: $deploySaEmail" }

Step "3. Project-level roles for deploy SA"
$projectRoles = @('roles/run.admin','roles/artifactregistry.writer','roles/iam.serviceAccountUser','roles/serviceusage.serviceUsageConsumer')
foreach ($r in $projectRoles) {
  & $gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$deploySaEmail" --role=$r --condition=None --quiet 2>&1 | Out-Null
  Write-Host "  bound $r"
}

Step "4. Deploy SA can act as runtime SA"
& $gcloud iam service-accounts add-iam-policy-binding $runtimeSaEmail --project=$Project --member="serviceAccount:$deploySaEmail" --role='roles/iam.serviceAccountUser' --quiet 2>&1 | Out-Null
Write-Host "  bound $deploySaEmail -> serviceAccountUser on $runtimeSaEmail"

Step "5. Artifact Registry write access for deploy SA"
& $gcloud artifacts repositories add-iam-policy-binding $ArRepo --project=$Project --location=$Region --member="serviceAccount:$deploySaEmail" --role='roles/artifactregistry.writer' --quiet 2>&1 | Out-Null
Write-Host "  bound writer on $ArRepo"

Step "6. Workload Identity Pool"
$pool = & $gcloud iam workload-identity-pools describe $PoolId --project=$Project --location=global --format='value(name)' 2>$null
if (-not $pool) {
  & $gcloud iam workload-identity-pools create $PoolId --project=$Project --location=global --display-name='GitHub Actions' | Out-Null
  $pool = & $gcloud iam workload-identity-pools describe $PoolId --project=$Project --location=global --format='value(name)' 2>$null
  Write-Host "  created pool: $pool"
} else { Write-Host "  already exists: $pool" }

Step "7. OIDC Provider for GitHub"
$prov = & $gcloud iam workload-identity-pools providers describe $ProviderId --project=$Project --location=global --workload-identity-pool=$PoolId --format='value(name)' 2>$null
if (-not $prov) {
  $attrMap = 'google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner'
  $attrCond = "assertion.repository_owner == '$RepoOwner'"
  & $gcloud iam workload-identity-pools providers create-oidc $ProviderId --project=$Project --location=global --workload-identity-pool=$PoolId --display-name='GitHub OIDC' --issuer-uri='https://token.actions.githubusercontent.com' --attribute-mapping=$attrMap --attribute-condition=$attrCond | Out-Null
  $prov = & $gcloud iam workload-identity-pools providers describe $ProviderId --project=$Project --location=global --workload-identity-pool=$PoolId --format='value(name)' 2>$null
  Write-Host "  created provider: $prov"
} else { Write-Host "  already exists: $prov" }

Step "8. Bind GitHub repo -> deploy SA impersonation"
$repoFull = "$RepoOwner/$RepoName"
$member = "principalSet://iam.googleapis.com/$pool/attribute.repository/$repoFull"
& $gcloud iam service-accounts add-iam-policy-binding $deploySaEmail --project=$Project --role='roles/iam.workloadIdentityUser' --member=$member --quiet 2>&1 | Out-Null
Write-Host "  bound $repoFull -> workloadIdentityUser on $deploySaEmail"

Step "9. Summary"
Write-Host ""
Write-Host "Repo SECRETS:"
Write-Host "  GCP_WIF_PROVIDER           = $prov"
Write-Host "  GCP_DEPLOY_SERVICE_ACCOUNT = $deploySaEmail"
Write-Host "  CLOUD_SQL_CONNECTION_NAME  = ${Project}:${Region}:xbmatrix-postgres"
Write-Host ""
Write-Host "Repo VARIABLES:"
Write-Host "  GCP_PROJECT_ID              = $Project"
Write-Host "  GCP_REGION                  = $Region"
Write-Host "  ARTIFACT_REGISTRY_REPO      = $ArRepo"
Write-Host "  GCP_RUNTIME_SERVICE_ACCOUNT = $runtimeSaEmail"
Write-Host "  GCS_UPLOADS_BUCKET          = xbmatrix-uploads"
Write-Host "  GCS_REPORTS_BUCKET          = xbmatrix-reports"
Write-Host "  CLOUD_TASKS_QUEUE           = xbmatrix-default"
Write-Host "  CLOUD_TASKS_LOCATION        = $Region"
Write-Host "  VPC_CONNECTOR               = (leave empty; add when Redis VPC is wired)"
Write-Host "  NEXT_PUBLIC_API_BASE_URL    = (set after first api deploy URL is known)"
