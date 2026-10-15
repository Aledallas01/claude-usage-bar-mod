# Installa l'icona "Claude — limiti" nell'area di notifica.
#
#   powershell -ExecutionPolicy Bypass -File tray\install-tray.ps1
#
# Cosa fa (tutto a livello utente, nessun permesso di amministratore):
#  1. crea l'icona claude-limits.ico;
#  2. chiude un'eventuale copia già aperta;
#  3. compila tray\bin\ClaudeLimitsTray.exe (in Gestione attività compare come
#     "Claude Limits Tray"); se non riesce usa lo script come prima (-NoExe per
#     saltare questo passo);
#  4. aggiunge una scorciatoia nella cartella Esecuzione automatica, così
#     l'icona ricompare a ogni accesso a Windows (salta con -NoStartup);
#  5. aggiunge "Claude Limits Tray" in Impostazioni → App → App installate, da
#     dove si può disinstallare;
#  6. avvia subito il programma.
# Non tocca Claude Desktop né alcun file di sistema. Si disinstalla con
# uninstall-tray.ps1 (o da App installate).

param([switch]$NoStartup, [switch]$NoExe)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$vbs = Join-Path $here 'run-hidden.vbs'
$exe = Join-Path $here 'bin\ClaudeLimitsTray.exe'
. (Join-Path $here 'lib\TrayInstall.ps1')

# 1. icona
& (Join-Path $here 'make-icon.ps1')

# 2. l'exe aperto non si potrebbe sovrascrivere
$stopped = Stop-TrayProcesses
if ($stopped -gt 0) { Write-Host "Chiusa la copia già aperta ($stopped processo/i)." }

# 3. eseguibile
$useExe = $false
if (-not $NoExe) {
  try {
    & (Join-Path $here 'build-exe.ps1')
    $useExe = Test-Path $exe
  } catch {
    Write-Host "Eseguibile non creato ($($_.Exception.Message)): uso lo script PowerShell." -ForegroundColor Yellow
  }
}

# 4. avvio automatico
if (-not $NoStartup) {
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($StartupLink)
  if ($useExe) {
    $sc.TargetPath = $exe
    $sc.Arguments = ''
  } else {
    $sc.TargetPath = 'wscript.exe'
    $sc.Arguments = '"' + $vbs + '"'
  }
  $sc.WorkingDirectory = $here
  $sc.IconLocation = (Join-Path $here 'claude-limits.ico')
  $sc.Description = 'Mostra i limiti di utilizzo di Claude nell''area di notifica'
  $sc.Save()
  Write-Host "Avvio automatico aggiunto: $StartupLink" -ForegroundColor Green
} else {
  Write-Host 'Avvio automatico saltato (-NoStartup).' -ForegroundColor Yellow
}

# 5. voce in App installate
Register-UninstallEntry $here $(if ($useExe) { $exe } else { $null }) (Get-TrayVersion $here)
Write-Host 'Aggiunto in Impostazioni → App → App installate: "Claude Limits Tray".' -ForegroundColor Green

# 6. avvio immediato (nascosto)
if ($useExe) { Start-Process $exe } else { Start-Process 'wscript.exe' -ArgumentList ('"' + $vbs + '"') }
Write-Host ''
Write-Host 'Fatto. Cerca l''icona con l''orologio in basso a destra,' -ForegroundColor Green
Write-Host 'vicino all''orologio (potrebbe essere sotto la freccetta ^ "icone nascoste").'
Write-Host 'Clic sinistro o Ctrl+Alt+L = apri/chiudi il popup. Clic destro = menu e impostazioni.'
Write-Host 'Suggerimento: trascina l''icona dalla freccetta ^ sulla barra per tenerla sempre visibile.'
