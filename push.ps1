# ============================================================================
#  push.ps1  -  Aenderungen am DP-Quiz-Tool zu GitHub hochladen
#
#  Schritte:
#    1. Quiz-Manifest neu bauen (erkennt neue quiz_*.json)
#    2. Optional: Karteikarten aus dem Obsidian-Vault neu einlesen
#    3. git add / commit / push
#
#  Aufruf:
#    - Doppelklick auf push.bat   (einfachste Variante), ODER
#    - im Terminal:  ./push.ps1            (fragt nach Commit-Nachricht)
#                    ./push.ps1 "Nachricht" (Nachricht direkt mitgeben)
# ============================================================================

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Have-Node { [bool](Get-Command node -ErrorAction SilentlyContinue) }

Write-Host ""
Write-Host "=== DP-Quiz-Tool: Push nach GitHub ===" -ForegroundColor Cyan
Write-Host ""

# --- 1. Quiz-Manifest neu bauen --------------------------------------------
if (Have-Node) {
  Write-Host "[1/3] Quiz-Manifest neu bauen ..." -ForegroundColor Yellow
  try { node tools/build-quiz-manifest.mjs | Out-Null; Write-Host "      OK" -ForegroundColor Green }
  catch { Write-Host "      uebersprungen (Fehler beim Manifest-Bau)" -ForegroundColor DarkYellow }
} else {
  Write-Host "[1/3] node nicht gefunden - Manifest-Schritt uebersprungen" -ForegroundColor DarkYellow
}

# --- 2. Karteikarten optional neu einlesen ---------------------------------
if (Have-Node) {
  $ans = Read-Host "[2/3] Karteikarten aus dem Vault neu einlesen? (j/N)"
  if ($ans -match '^(j|J|y|Y)') {
    Write-Host "      Vault wird geparst ..." -ForegroundColor Yellow
    try { node tools/parse-karteikarten.mjs | Out-Null; Write-Host "      OK" -ForegroundColor Green }
    catch { Write-Host "      Fehler beim Parsen - bestehende Karteikarten bleiben unveraendert" -ForegroundColor DarkYellow }
  } else {
    Write-Host "      uebersprungen" -ForegroundColor DarkGray
  }
}

# --- 3. git add / commit / push --------------------------------------------
Write-Host "[3/3] Aenderungen pruefen ..." -ForegroundColor Yellow
git add -A

$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
  Write-Host ""
  Write-Host "Keine Aenderungen vorhanden - nichts zu pushen." -ForegroundColor Green
  Write-Host ""
  if ($Host.Name -eq 'ConsoleHost') { Read-Host "Enter zum Schliessen" }
  exit 0
}

Write-Host ""
Write-Host "Folgende Dateien werden committet:" -ForegroundColor Cyan
git status --short
Write-Host ""

# Commit-Nachricht: Argument > Eingabe > Standard mit Zeitstempel
$msg = if ($args.Count -gt 0) { $args[0] } else { Read-Host "Commit-Nachricht (Enter = automatisch)" }
if ([string]::IsNullOrWhiteSpace($msg)) {
  $msg = "Update " + (Get-Date -Format "yyyy-MM-dd HH:mm")
}

git -c core.autocrlf=true commit -m $msg | Out-Null
Write-Host "Commit erstellt: $msg" -ForegroundColor Green

Write-Host "Push nach GitHub ..." -ForegroundColor Yellow
git push
Write-Host ""
Write-Host "Fertig. GitHub Pages baut in ~1 Minute neu." -ForegroundColor Green
Write-Host "https://chaosfx.github.io/dp-quiz-tool/" -ForegroundColor Cyan
Write-Host ""

if ($Host.Name -eq 'ConsoleHost') { Read-Host "Enter zum Schliessen" }
