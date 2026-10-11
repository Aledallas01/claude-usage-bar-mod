# Disinstalla la mod e rimuove il marketplace locale.
#
#   powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1 -RestoreBackup
#
# -RestoreBackup ripristina inoltre i file di configurazione dall'ultimo backup
# creato da install.ps1, dopo averne verificato l'hash SHA-256. Usalo solo se
# dopo l'installazione non hai cambiato altre impostazioni di Claude Code:
# il ripristino riporta quei file esattamente com'erano prima.

param([switch]$RestoreBackup)

. (Join-Path $PSScriptRoot 'common.ps1')

$cli = Get-ClaudeCli

$installed = & $cli.Path plugin list 2>$null | Out-String
if ($installed -match 'usage-time-bar') {
  Invoke-Claude $cli.Path @('plugin', 'uninstall', $PluginId, '--scope', 'user')
} else {
  Write-Host 'Plugin non installato: niente da disinstallare.'
}

$known = & $cli.Path plugin marketplace list 2>$null | Out-String
if ($known -match [regex]::Escape($MarketplaceName)) {
  Invoke-Claude $cli.Path @('plugin', 'marketplace', 'remove', $MarketplaceName)
}

if ($RestoreBackup) {
  $latest = Get-ChildItem $BackupRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
  if ($null -eq $latest) { throw "Nessun backup trovato in $BackupRoot" }
  $manifest = Get-Content (Join-Path $latest.FullName 'manifest.json') -Raw | ConvertFrom-Json
  foreach ($entry in $manifest) {
    if ($entry.existed) {
      if ((Get-FileHash -Algorithm SHA256 -LiteralPath $entry.copy).Hash -ne $entry.sha256) {
        throw "Backup corrotto, ripristino annullato: $($entry.copy)"
      }
    }
  }
  foreach ($entry in $manifest) {
    if ($entry.existed) {
      Copy-Item -LiteralPath $entry.copy -Destination $entry.path -Force
      Write-Host "Ripristinato $($entry.path)"
    } elseif (Test-Path $entry.path) {
      Write-Host "Il file $($entry.path) non esisteva prima dell'installazione: lasciato com'è." -ForegroundColor Yellow
    }
  }
}

Write-Host 'Disinstallazione completata. Riavvia la sessione nella scheda Code (o /reload-plugins).' -ForegroundColor Green
