# Funzioni condivise da install-tray.ps1 e uninstall-tray.ps1. Tutto a livello
# utente (HKCU e cartelle del profilo): nessun permesso di amministratore.

$script:UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\ClaudeLimitsTray'
$script:StartupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'Claude Limiti.lnk'
$script:RepoUrl = 'https://github.com/Aledallas01/claude-usage-bar-mod'

# Chiude il programma tray, sia come .exe sia come script PowerShell.
function Stop-TrayProcesses {
  $count = 0
  Get-Process -Name 'ClaudeLimitsTray' -ErrorAction SilentlyContinue | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force; $count++ } catch { }
  }
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'ClaudeLimitsTray\.ps1' -and $_.ProcessId -ne $PID } |
    ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force; $count++ } catch { } }
  if ($count -gt 0) { Start-Sleep -Milliseconds 500 }
  return $count
}

# Voce in Impostazioni → App → App installate (solo per l'utente corrente).
function Register-UninstallEntry([string]$trayDir, [string]$exe, [string]$version) {
  $uninstall = Join-Path $trayDir 'uninstall-tray.ps1'
  $icon = if ($exe -and (Test-Path $exe)) { $exe } else { Join-Path $trayDir 'claude-limits.ico' }
  $sizeKb = [int]((Get-ChildItem $trayDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1KB)
  New-Item -Path $script:UninstallKey -Force | Out-Null
  $values = [ordered]@{
    DisplayName          = 'Claude Limits Tray'
    DisplayVersion       = $version
    Publisher            = 'claude-usage-bar-mod (open source)'
    DisplayIcon          = $icon
    InstallLocation      = $trayDir
    InstallDate          = (Get-Date -Format 'yyyyMMdd')
    URLInfoAbout         = $script:RepoUrl
    HelpLink             = $script:RepoUrl
    UninstallString      = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + $uninstall + '" -FromSettings'
    QuietUninstallString = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $uninstall + '"'
  }
  foreach ($k in $values.Keys) { Set-ItemProperty -Path $script:UninstallKey -Name $k -Value $values[$k] }
  foreach ($k in 'NoModify', 'NoRepair') { New-ItemProperty -Path $script:UninstallKey -Name $k -Value 1 -PropertyType DWord -Force | Out-Null }
  New-ItemProperty -Path $script:UninstallKey -Name 'EstimatedSize' -Value $sizeKb -PropertyType DWord -Force | Out-Null
}

function Remove-UninstallEntry {
  if (Test-Path $script:UninstallKey) { Remove-Item -Path $script:UninstallKey -Recurse -Force; return $true }
  return $false
}

function Get-TrayVersion([string]$trayDir) {
  try { return [string]((Get-Content (Join-Path (Split-Path -Parent $trayDir) 'plugin\.claude-plugin\plugin.json') -Raw | ConvertFrom-Json).version) } catch { return '0.0.0' }
}
