# Rimuove l'icona "Claude — limiti": chiude il programma e toglie l'avvio
# automatico. Non resta nulla in esecuzione né all'accesso.
#
#   powershell -ExecutionPolicy Bypass -File tray\uninstall-tray.ps1

$ErrorActionPreference = 'Stop'

# 1. scorciatoia di avvio automatico
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Claude Limiti.lnk'
if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host "Rimossa: $lnk" }

# 2. processi in esecuzione (powershell che esegue ClaudeLimitsTray.ps1)
$killed = 0
Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -match 'ClaudeLimitsTray\.ps1' } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force; $killed++ } catch {} }
Write-Host "Programma chiuso ($killed process)." -ForegroundColor Green
Write-Host 'Se l''icona resta visibile un attimo, sparisce passandoci sopra il mouse.'
