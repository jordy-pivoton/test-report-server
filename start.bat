@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo  Test Report Server - start
echo  ==========================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo FOUT: Node.js staat niet in PATH.
  echo Installeer de LTS-versie van https://nodejs.org/ en start dit bestand opnieuw.
  echo.
  pause
  exit /b 1
)

rem Zelfde keuze als server.ts: standaard R:/ als die schijf bestaat, anders .\reports
rem (Zonder deze regels zou de .bat altijd .\reports forceren en R: nooit gebruiken.)
if not defined REPORTS_ROOT (
  if exist R:\ (
    set "REPORTS_ROOT=R:/"
  ) else (
    set "REPORTS_ROOT=%~dp0reports"
  )
)
if not exist "%REPORTS_ROOT%" (
  mkdir "%REPORTS_ROOT%" 2>nul
)

echo [1/4] Dependencies installeren ^(npm install^)...
call npm install
if errorlevel 1 (
  echo.
  echo npm install is mislukt.
  pause
  exit /b 1
)

echo [2/4] Project bouwen ^(npm run build^)...
call npm run build
if errorlevel 1 (
  echo.
  echo Build mislukt.
  pause
  exit /b 1
)

set "HAVE_CERT=1"
if not exist "cert\cert.pem" set "HAVE_CERT=0"
if not exist "cert\key.pem" set "HAVE_CERT=0"

if "!HAVE_CERT!"=="0" (
  echo [3/4] TLS-certificaat aanmaken...
  set "USED_MKCERT=0"
  where mkcert >nul 2>&1
  if not errorlevel 1 (
    call npm run certs:mkcert
    if not errorlevel 1 set "USED_MKCERT=1"
  )
  if "!USED_MKCERT!"=="0" (
    call npm run certs
    if errorlevel 1 (
      echo.
      echo Certificaat aanmaken mislukt.
      pause
      exit /b 1
    )
    echo [4/4] Certificaat in Windows vertrouwen ^(eenmalig, huidige gebruiker^)...
    call npm run trust-cert
    if errorlevel 1 (
      echo.
      echo WAARSCHUWING: trust-cert is mislukt. Trace-viewer kan in de browser falen.
      echo Probeer handmatig: npm run trust-cert
      echo.
    )
  ) else (
    echo [4/4] mkcert-certificaat gebruikt ^(geen aparte trust-stap nodig na mkcert -install^).
  )
) else (
  echo [3/4] Bestaande certificaatbestanden in cert\ gevonden.
  echo [4/4] ^(Sla over: certificaat aanmaken.^)
)

if not defined HTTPS_PORT set "HTTPS_PORT=3443"

echo.
echo Server start met HTTPS.
echo De browser opent straks automatisch naar https://localhost:%HTTPS_PORT%/
echo Rapporten-map: %REPORTS_ROOT%
echo.
echo Druk Ctrl+C om te stoppen.
echo.

set "USE_HTTPS=1"
rem Browser na enkele seconden (server moet eerst luisteren)
start "" cmd /c "timeout /t 4 /nobreak >nul & start "" https://localhost:%HTTPS_PORT%/"

call npm start
set "EXITCODE=%ERRORLEVEL%"
echo.
if not "%EXITCODE%"=="0" echo Server beeindigd met code %EXITCODE%.
pause
exit /b %EXITCODE%
