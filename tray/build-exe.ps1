# Compila tray\bin\ClaudeLimitsTray.exe dal sorgente tray\host\TrayHost.cs con il
# compilatore C# incluso in Windows (.NET Framework 4). Niente da scaricare,
# nessun permesso di amministratore.
#
#   powershell -ExecutionPolicy Bypass -File tray\build-exe.ps1

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path -Parent $here
$outDir = Join-Path $here 'bin'
$exe = Join-Path $outDir 'ClaudeLimitsTray.exe'
$icon = Join-Path $here 'claude-limits.ico'

$csc = Join-Path ([System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'csc.exe'
if (-not (Test-Path $csc)) { throw "Compilatore C# non trovato: $csc" }
$sma = [System.Management.Automation.PSObject].Assembly.Location

# Versione del file = versione della mod (plugin.json).
$version = '0.0.0'
try { $version = [string]((Get-Content (Join-Path $root 'plugin\.claude-plugin\plugin.json') -Raw | ConvertFrom-Json).version) } catch { }
if ($version -notmatch '^\d+\.\d+\.\d+$') { $version = '0.0.0' }

if (-not (Test-Path $icon)) { & (Join-Path $here 'make-icon.ps1') }
New-Item -ItemType Directory -Force $outDir | Out-Null

$src = [System.IO.File]::ReadAllText((Join-Path $here 'host\TrayHost.cs'), [System.Text.Encoding]::UTF8)
$src = $src.Replace('Version = "0.0.0.0"', ('Version = "' + $version + '.0"'))
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('ClaudeLimitsTray-' + [guid]::NewGuid().ToString('N') + '.cs')
[System.IO.File]::WriteAllText($tmp, $src, (New-Object System.Text.UTF8Encoding($true)))
try {
  $out = & $csc /nologo /utf8output /target:winexe /optimize+ "/out:$exe" "/win32icon:$icon" "/win32manifest:$(Join-Path $here 'host\app.manifest')" "/r:$sma" /r:System.Windows.Forms.dll $tmp 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Compilazione non riuscita (il programma è aperto? chiudilo e riprova):`n$($out -join "`n")" }
} finally {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}
Write-Host "Creato $exe (versione $version)" -ForegroundColor Green
