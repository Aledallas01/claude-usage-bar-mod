# Installa l'icona "Claude — limiti" nell'area di notifica.
#
#   powershell -ExecutionPolicy Bypass -File tray\install-tray.ps1
#
# Cosa fa (tutto a livello utente, nessun permesso di amministratore):
#  1. crea l'icona claude-limits.ico;
#  2. aggiunge una scorciatoia nella cartella Esecuzione automatica, così
#     l'icona ricompare a ogni accesso a Windows (salta con -NoStartup);
#  3. avvia subito il programma.
# Non tocca Claude Desktop né alcun file di sistema. Si disinstalla con
# uninstall-tray.ps1.

param([switch]$NoStartup)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$vbs = Join-Path $here 'run-hidden.vbs'

# 1. icona
& (Join-Path $here 'make-icon.ps1')

# 2. avvio automatico
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'Claude Limiti.lnk'
if (-not $NoStartup) {
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($lnk)
  $sc.TargetPath = 'wscript.exe'
  $sc.Arguments = '"' + $vbs + '"'
  $sc.WorkingDirectory = $here
  $sc.IconLocation = (Join-Path $here 'claude-limits.ico')
  $sc.Description = 'Mostra i limiti di utilizzo di Claude nell''area di notifica'
  $sc.Save()
  Write-Host "Avvio automatico aggiunto: $lnk" -ForegroundColor Green
} else {
  Write-Host 'Avvio automatico saltato (-NoStartup).' -ForegroundColor Yellow
}

# 3. avvio immediato (nascosto)
Start-Process 'wscript.exe' -ArgumentList ('"' + $vbs + '"')
Write-Host ''
Write-Host 'Fatto. Cerca l''icona arancione con l''orologio in basso a destra,' -ForegroundColor Green
Write-Host 'vicino all''orologio (potrebbe essere sotto la freccetta ^ "icone nascoste").'
Write-Host 'Clic sinistro = apri/chiudi il popup. Clic destro = menu (Aggiorna, Esci).'
Write-Host 'Suggerimento: trascina l''icona dalla freccetta ^ sulla barra per tenerla sempre visibile.'
