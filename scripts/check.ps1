# Esegue validazione e test automatici senza installare nulla.
#
#   powershell -ExecutionPolicy Bypass -File scripts\check.ps1

. (Join-Path $PSScriptRoot 'common.ps1')

$cli = Get-ClaudeCli
Write-Host "CLI Claude Code $($cli.Version): $($cli.Path)"
Invoke-Claude $cli.Path @('plugin', 'validate', $ProjectRoot)
Invoke-Claude $cli.Path @('plugin', 'validate', $PluginDir)
Invoke-Claude $cli.Path @('plugin', 'test', $PluginDir)
