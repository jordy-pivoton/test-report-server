# Adds cert/cert.pem to the current user's Trusted Root store so Chrome/Edge trust
# this dev server on https://localhost (self-signed). Dev-only — do not use untrusted PEMs.
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$certPath = Join-Path $repoRoot "cert\cert.pem"

if (-not (Test-Path -LiteralPath $certPath)) {
  Write-Host "Missing $certPath — run: npm run certs" -ForegroundColor Red
  exit 1
}

Write-Host "Installing certificate into Current User > Trusted Root Certification Authorities..."
Write-Host "File: $certPath"
certutil -user -addstore -f "Root" $certPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
Write-Host ""
Write-Host "Done. Close Chrome tabs for localhost:3443 and open the URL again (or restart the browser)." -ForegroundColor Green
