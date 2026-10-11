# Funzioni condivise dagli script di installazione e disinstallazione.

$ErrorActionPreference = 'Stop'

$Script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$Script:PluginDir = Join-Path $ProjectRoot 'plugin'
$Script:PluginId = 'usage-time-bar@usage-time-bar-local'
$Script:MarketplaceName = 'usage-time-bar-local'
$Script:BackupRoot = Join-Path $ProjectRoot 'backup'
$Script:MinVersion = [version]'2.1.295'

# File di configurazione utente che `claude plugin` modifica.
$Script:TouchedFiles = @(
  (Join-Path $env:USERPROFILE '.claude\settings.json'),
  (Join-Path $env:USERPROFILE '.claude\plugins\installed_plugins.json'),
  (Join-Path $env:USERPROFILE '.claude\plugins\known_marketplaces.json')
)

# Trova la CLI Claude Code usata dall'app desktop (le mod a moduli richiedono
# la 2.1.295 o successiva; quella nel PATH può essere più vecchia).
function Get-ClaudeCli {
  $candidates = @()
  $desktop = Join-Path $env:APPDATA 'Claude\claude-code'
  if (Test-Path $desktop) {
    $candidates += Get-ChildItem $desktop -Recurse -Filter claude.exe -ErrorAction SilentlyContinue |
      ForEach-Object { $_.FullName }
  }
  $onPath = Get-Command claude -ErrorAction SilentlyContinue
  if ($onPath) { $candidates += $onPath.Source }

  $best = $null
  foreach ($path in $candidates) {
    $text = (& $path --version 2>$null | Select-Object -First 1)
    if ($text -match '^(\d+\.\d+\.\d+)') {
      $v = [version]$Matches[1]
      if ($v -ge $MinVersion -and ($null -eq $best -or $v -gt $best.Version)) {
        $best = [pscustomobject]@{ Path = $path; Version = $v }
      }
    }
  }
  if ($null -eq $best) {
    throw "Nessuna CLI Claude Code >= $MinVersion trovata. Aggiorna Claude Desktop e riprova."
  }

  return $best
}

function Invoke-Claude([string]$Cli, [string[]]$Arguments) {
  Write-Host "> claude $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $Cli @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Comando fallito (codice $LASTEXITCODE): claude $($Arguments -join ' ')" }
}

# Copia i file toccati in backup\<data>\ con un manifest di hash SHA-256.
function New-ConfigBackup {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $dir = Join-Path $BackupRoot $stamp
  New-Item -ItemType Directory -Force $dir | Out-Null
  $manifest = @()
  foreach ($file in $TouchedFiles) {
    $entry = [ordered]@{ path = $file; existed = (Test-Path $file); sha256 = $null; copy = $null }
    if ($entry.existed) {
      $copy = Join-Path $dir ((Split-Path -Leaf $file) + '.bak')
      Copy-Item -LiteralPath $file -Destination $copy
      $entry.sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash
      $entry.copy = $copy
      if ((Get-FileHash -Algorithm SHA256 -LiteralPath $copy).Hash -ne $entry.sha256) {
        throw "Backup non verificato: $file"
      }
    }
    $manifest += [pscustomobject]$entry
  }
  $manifest | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $dir 'manifest.json')
  Write-Host "Backup verificato in $dir" -ForegroundColor Green

  return $dir
}
