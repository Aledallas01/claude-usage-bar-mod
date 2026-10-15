# Aggiornamento con un clic, avviato dal programma tray ("Aggiorna alla vX.Y.Z").
#
#  1. aspetta che il programma tray si chiuda;
#  2. scarica la nuova versione con `git pull --ff-only` (solo se la cartella
#     non ha modifiche locali: altrimenti si ferma e lo dice);
#  3. salva un backup delle impostazioni di Claude Code e aggiorna la mod
#     (scripts\update.ps1);
#  4. ricompila ClaudeLimitsTray.exe, se è installato come .exe;
#  5. riavvia il programma, che mostra l'esito in una notifica.
# Il registro dettagliato è in %APPDATA%\ClaudeLimitsTray\update.log.

param([int]$TrayPid = 0, [string]$Target = '')

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path -Parent $here
$dataDir = Join-Path $env:APPDATA 'ClaudeLimitsTray'
New-Item -ItemType Directory -Force $dataDir | Out-Null
$log = Join-Path $dataDir 'update.log'
$resultFile = Join-Path $dataDir 'update-result.json'

function Write-Log([string]$text) {
  ('[{0}] {1}' -f (Get-Date -Format 's'), $text) | Out-File -Append -Encoding utf8 $log
}

# Esegue un comando nascosto, ne scrive l'output nel registro e ne restituisce
# il codice d'uscita (in un processo a parte: gli avvisi su stderr non sono errori).
function Invoke-Logged([string]$what, [string]$exe, [string]$arguments) {
  $o = [System.IO.Path]::GetTempFileName(); $e = [System.IO.Path]::GetTempFileName()
  try {
    $p = Start-Process $exe -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $o -RedirectStandardError $e
    foreach ($line in @(Get-Content $o) + @(Get-Content $e)) { if ($line) { Write-Log "${what}: $line" } }
    return $p.ExitCode
  } finally {
    Remove-Item -LiteralPath $o, $e -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Script([string]$what, [string]$file) {
  return Invoke-Logged $what 'powershell.exe' ('-NoProfile -ExecutionPolicy Bypass -File "' + $file + '"')
}

$ok = $false
$message = ''
try {
  Write-Log "--- aggiornamento verso $Target"
  if ($TrayPid -gt 0) {
    try { Wait-Process -Id $TrayPid -Timeout 20 -ErrorAction Stop } catch { }
  }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git non trovato: installa Git o scarica la release da GitHub.' }
  if (-not (Test-Path (Join-Path $root '.git'))) { throw 'La cartella non è un clone git.' }

  $ErrorActionPreference = 'Continue'
  $dirty = & git -C $root status --porcelain --untracked-files=no 2>$null
  $ErrorActionPreference = 'Stop'
  if ($dirty) { throw 'Nella cartella ci sono modifiche non salvate: aggiornamento annullato per non perderle.' }
  if ((Invoke-Logged 'git' 'git' ('-C "' + $root + '" pull --ff-only')) -ne 0) {
    throw 'git pull --ff-only non riuscito (la cartella ha commit propri o non è collegata a GitHub).'
  }

  # Backup delle impostazioni di Claude Code prima di toccare l'installazione.
  . (Join-Path $root 'scripts\common.ps1')
  $backup = New-ConfigBackup
  Write-Log "backup: $backup"
  if ((Invoke-Script 'update' (Join-Path $root 'scripts\update.ps1')) -ne 0) {
    throw 'Aggiornamento della mod non riuscito (scripts\update.ps1).'
  }
  if (Test-Path (Join-Path $here 'bin\ClaudeLimitsTray.exe')) {
    if ((Invoke-Script 'build' (Join-Path $here 'build-exe.ps1')) -ne 0) { throw 'Compilazione di ClaudeLimitsTray.exe non riuscita.' }
  }
  $ok = $true
  Write-Log 'aggiornamento completato'
} catch {
  $message = $_.Exception.Message
  Write-Log "ERRORE: $message"
}

$result = [pscustomobject]@{ ok = $ok; target = $Target; message = $message; at = (Get-Date).ToString('s') }
[System.IO.File]::WriteAllText($resultFile, ($result | ConvertTo-Json), [System.Text.Encoding]::UTF8)

# Riavvio del programma (anche se l'aggiornamento non è riuscito).
$exe = Join-Path $here 'bin\ClaudeLimitsTray.exe'
if (Test-Path $exe) {
  Start-Process $exe
} else {
  Start-Process 'wscript.exe' -ArgumentList ('"' + (Join-Path $here 'run-hidden.vbs') + '"')
}
