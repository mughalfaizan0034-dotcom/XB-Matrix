# =============================================================================
# Reset a Cloud SQL user password to a fresh alphanumeric value and persist
# the new value to Secret Manager. Used by the foundation setup to avoid
# special-character escaping issues in PowerShell prompts.
#
# Usage:
#   .\infrastructure\local\reset-db-user.ps1 -DbUser xbmatrixapp -SecretName xb-db-password-app
# =============================================================================
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $DbUser,
  [Parameter(Mandatory = $true)] [string] $SecretName,
  [string] $Instance = 'xbmatrix-postgres',
  [string] $Project  = 'xb-matrix',
  [int]    $Length   = 24
)
$ErrorActionPreference = 'Stop'
$gcloud = 'C:\Users\mugha\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'

$bytes = New-Object byte[] $Length
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
$pw = -join ($bytes | ForEach-Object { $alphabet[$_ % 62] })

Write-Host "Setting password for $DbUser on $Instance..."
& $gcloud sql users set-password $DbUser --instance=$Instance --project=$Project --password=$pw | Out-Null
if ($LASTEXITCODE -ne 0) { throw "set-password failed" }

$existing = & $gcloud secrets list --project=$Project --filter="name~$SecretName" --format='value(name)' 2>$null
if ($existing) {
  Write-Host "Adding new version to existing secret $SecretName"
  $pw | & $gcloud secrets versions add $SecretName --project=$Project --data-file=- | Out-Null
} else {
  Write-Host "Creating new secret $SecretName"
  $pw | & $gcloud secrets create $SecretName --project=$Project --data-file=- --replication-policy=automatic | Out-Null
}

Write-Host "done: $DbUser password rotated (length=$Length), stored in Secret Manager as $SecretName"
