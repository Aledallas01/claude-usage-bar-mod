# Installa la mod "usage-time-bar" per l'utente corrente (nessun privilegio
# amministrativo). Non tocca i file di Claude Desktop in C:\Program Files.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1
#
# Passi: test automatici -> validazione -> backup verificato della
# configurazione utente -> registrazione del marketplace locale (questa
# cartella) -> installazione del plugin in ambito "user".

param([switch]$SkipTests)

. (Join-Path $PSScriptRoot 'common.ps1')

$cli = Get-ClaudeCli
Write-Host "CLI Claude Code $($cli.Version): $($cli.Path)"

if (-not $SkipTests) { Invoke-Claude $cli.Path @('plugin', 'test', $PluginDir) }
Invoke-Claude $cli.Path @('plugin', 'validate', $ProjectRoot)
Invoke-Claude $cli.Path @('plugin', 'validate', $PluginDir)

$backup = New-ConfigBackup

$known = & $cli.Path plugin marketplace list 2>$null | Out-String
if ($known -notmatch [regex]::Escape($MarketplaceName)) {
  Invoke-Claude $cli.Path @('plugin', 'marketplace', 'add', $ProjectRoot, '--scope', 'user')
}
Invoke-Claude $cli.Path @('plugin', 'install', $PluginId, '--scope', 'user')

Write-Host ''
Write-Host 'Installazione completata.' -ForegroundColor Green
Write-Host "Backup della configurazione precedente: $backup"
Write-Host 'Apri una nuova sessione nella scheda Code di Claude Desktop (oppure /reload-plugins):'
Write-Host 'le barre compaiono sopra il prompt dopo la prima risposta di Claude. Comando: /usage-time'
