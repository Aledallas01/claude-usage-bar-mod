# Rimuove l'icona "Claude — limiti": chiude il programma, toglie l'avvio
# automatico, la voce in App installate e l'eseguibile compilato. Non resta
# nulla in esecuzione né all'accesso. La mod di Claude resta installata (per
# toglierla: scripts\uninstall.ps1).
#
#   powershell -ExecutionPolicy Bypass -File tray\uninstall-tray.ps1 [-RemoveData]
#
# -RemoveData    cancella anche impostazioni e storico (%APPDATA%\ClaudeLimitsTray)
# -FromSettings  usato da App installate: alla fine mostra un messaggio

param([switch]$RemoveData, [switch]$FromSettings)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
. (Join-Path $here 'lib\TrayInstall.ps1')

# 1. scorciatoia di avvio automatico
if (Test-Path $StartupLink) { Remove-Item $StartupLink -Force; Write-Host "Rimossa: $StartupLink" }

# 2. processi in esecuzione
$killed = Stop-TrayProcesses
Write-Host "Programma chiuso ($killed processo/i)." -ForegroundColor Green

# 3. voce in App installate
if (Remove-UninstallEntry) { Write-Host 'Tolto da App installate.' }

# 4. eseguibile compilato
$exe = Join-Path $here 'bin\ClaudeLimitsTray.exe'
if (Test-Path $exe) { Remove-Item -LiteralPath $exe -Force; Write-Host "Rimosso: $exe" }

# 5. dati (solo se richiesto)
$dataDir = Join-Path $env:APPDATA 'ClaudeLimitsTray'
if ($RemoveData -and (Test-Path $dataDir)) { Remove-Item -LiteralPath $dataDir -Recurse -Force; Write-Host "Rimossi impostazioni e storico: $dataDir" }

Write-Host 'Se l''icona resta visibile un attimo, sparisce passandoci sopra il mouse.'
if ($FromSettings) {
  Add-Type -AssemblyName System.Windows.Forms
  $msg = "Claude Limits Tray è stato rimosso.`n`nRestano la cartella $(Split-Path -Parent $here) e la mod di Claude: per togliere anche la mod esegui scripts\uninstall.ps1."
  [void][System.Windows.Forms.MessageBox]::Show($msg, 'Claude Limits Tray')
}
