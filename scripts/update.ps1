# Porta l'installazione alla versione attuale della cartella plugin\.
#
#   powershell -ExecutionPolicy Bypass -File scripts\update.ps1
#
# Le sessioni della scheda Code caricano all'avvio la copia in
# ~\.claude\plugins\cache\usage-time-bar\usage-time-bar\<versione>\.
# Dopo una modifica al codice: alza "version" in plugin\.claude-plugin\plugin.json,
# esegui questo script, poi apri una nuova sessione (o /reload-plugins).

param([switch]$SkipTests)

. (Join-Path $PSScriptRoot 'common.ps1')

$cli = Get-ClaudeCli
Write-Host "CLI Claude Code $($cli.Version): $($cli.Path)"

if (-not $SkipTests) { Invoke-Claude $cli.Path @('plugin', 'test', $PluginDir) }
Invoke-Claude $cli.Path @('plugin', 'validate', $PluginDir)

$manifest = Get-Content (Join-Path $PluginDir '.claude-plugin\plugin.json') -Raw | ConvertFrom-Json
$version = [string]$manifest.version
$cacheDir = Join-Path $env:USERPROFILE ".claude\plugins\cache\$MarketplaceName\usage-time-bar\$version"

# Installazione con il vecchio nome del marketplace: la rifà con il nuovo.
if (Remove-LegacyInstall $cli.Path) {
  New-ConfigBackup | Out-Null
  Invoke-Claude $cli.Path @('plugin', 'marketplace', 'add', $ProjectRoot, '--scope', 'user')
  Invoke-Claude $cli.Path @('plugin', 'install', $PluginId, '--scope', 'user')
}

Invoke-Claude $cli.Path @('plugin', 'update', $PluginId)

if (-not (Test-Path $cacheDir)) {
  Write-Host "Nessuna copia $version in cache: reinstallo dalla cartella." -ForegroundColor Yellow
  Invoke-Claude $cli.Path @('plugin', 'uninstall', $PluginId, '--scope', 'user')
  Invoke-Claude $cli.Path @('plugin', 'install', $PluginId, '--scope', 'user')
}

# Verifica che la copia caricata dalle sessioni coincida con la cartella.
$mismatch = @()
foreach ($file in Get-ChildItem $PluginDir -Recurse -File | Where-Object { $_.FullName -notmatch '\\\.claude-plugin\\types\\|\\tests\\' }) {
  $rel = $file.FullName.Substring($PluginDir.Length)
  $copy = Join-Path $cacheDir $rel
  if (-not (Test-Path $copy) -or (Get-FileHash $copy).Hash -ne (Get-FileHash $file.FullName).Hash) { $mismatch += $rel }
}
if ($mismatch.Count -gt 0) {
  throw "La copia in cache non coincide con la cartella per: $($mismatch -join ', ')"
}

Write-Host ''
Write-Host "Installazione aggiornata alla $version (copia verificata in $cacheDir)." -ForegroundColor Green
Write-Host 'Apri una nuova sessione nella scheda Code, oppure digita /reload-plugins in quella aperta.'
