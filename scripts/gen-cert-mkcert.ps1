# Generates cert/key with mkcert (trusted locally after: mkcert -install).
# https://github.com/FiloSottile/mkcert
$ErrorActionPreference = "Stop"
if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  Write-Host "mkcert not found. Install it, then run: mkcert -install" -ForegroundColor Yellow
  Write-Host "  winget install -e --id FiloSottile.mkcert" -ForegroundColor Gray
  Write-Host "  choco install mkcert" -ForegroundColor Gray
  exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $repoRoot "cert"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
Push-Location $certDir
try {
  mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1
} finally {
  Pop-Location
}
Write-Host ""
Write-Host "Wrote cert\cert.pem and cert\key.pem (mkcert). No extra trust step needed if mkcert -install was run." -ForegroundColor Green
