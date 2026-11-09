<#
  run-targets.ps1 — start the local apps that redteam tests, each in its own
  window so you can watch the logs. LOCAL / TEST ONLY. Never point these at prod.

  Usage (from the redteam repo root):
    ./scripts/run-targets.ps1                 # start all targets
    ./scripts/run-targets.ps1 minmatside      # just one
    ./scripts/run-targets.ps1 minaksjeportal

  After the windows are up and the health check passes, run the attack tool:
    npm run attack -- minmatside              # free dry run
#>

param(
  [string[]]$Targets = @('minmatside', 'minaksjeportal')
)

$ErrorActionPreference = 'Stop'
$projects = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)  # "Other Projects"

function Start-AppWindow {
  param([string]$Title, [string]$WorkDir, [string]$Command)
  if (-not (Test-Path $WorkDir)) {
    Write-Host "  SKIP $Title — mappen finnes ikke: $WorkDir" -ForegroundColor Yellow
    return
  }
  Write-Host "  Starter $Title ..." -ForegroundColor Cyan
  Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$WorkDir'; $Command"
  )
}

function Wait-ForUrl {
  param([string]$Url, [int]$TimeoutSec = 60)
  Write-Host "  Venter på $Url ..." -NoNewline
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
      Write-Host " OK" -ForegroundColor Green; return $true
    } catch {
      if ($_.Exception.Response) { Write-Host " OK (svarer)" -ForegroundColor Green; return $true }
      Start-Sleep -Milliseconds 800; Write-Host "." -NoNewline
    }
  }
  Write-Host " tidsavbrudd" -ForegroundColor Yellow; return $false
}

Write-Host "redteam — starter lokale testmål (LOCAL/TEST ONLY)" -ForegroundColor White

if ($Targets -contains 'minmatside') {
  $dir = Join-Path $projects 'minmatside'
  Write-Host "`n[minmatside] localhost:3000" -ForegroundColor White
  if (Test-Path $dir) {
    # Seed the redteam test users into the LOCAL db before starting.
    Write-Host "  Seeder testbrukere (lokal db) ..." -ForegroundColor Cyan
    Push-Location $dir
    try { npm run db:seed-redteam } catch { Write-Host "  (seed hoppet over: $($_.Exception.Message))" -ForegroundColor Yellow }
    Pop-Location
  }
  Start-AppWindow -Title 'minmatside (3000)' -WorkDir $dir -Command 'npm run dev'
}

if ($Targets -contains 'minaksjeportal') {
  $dir = Join-Path $projects 'minaksjeportal'
  Write-Host "`n[minaksjeportal] api localhost:4001, frontend localhost:3001" -ForegroundColor White
  if ((Test-Path $dir) -and -not (Test-Path (Join-Path $dir '.env.local'))) {
    Write-Host "  ADVARSEL: ingen .env.local — backend kan mangle nøkler/test-db." -ForegroundColor Yellow
    Write-Host "  Kopier .env.example → .env.local og fyll inn TEST-verdier først." -ForegroundColor Yellow
  }
  Start-AppWindow -Title 'minaksjeportal api (4001)'      -WorkDir $dir -Command 'npm run dev:api'
  Start-AppWindow -Title 'minaksjeportal frontend (3001)' -WorkDir $dir -Command 'npm run dev:frontend'
}

Write-Host "`nHelsesjekk:" -ForegroundColor White
if ($Targets -contains 'minmatside')     { Wait-ForUrl 'http://localhost:3000' | Out-Null }
if ($Targets -contains 'minaksjeportal') { Wait-ForUrl 'http://localhost:4001' | Out-Null; Wait-ForUrl 'http://localhost:3001' | Out-Null }

Write-Host "`nKlart. Appene kjører i egne vinduer. Lukk vinduet for å stoppe en app." -ForegroundColor Green
Write-Host "Neste: npm run attack -- minmatside   (gratis prøvekjøring)" -ForegroundColor Green
