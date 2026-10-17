# Test del programma tray, senza dipendenze (bastano Windows e PowerShell 5.1):
#
#   powershell -ExecutionPolicy Bypass -File tray\tests\run-tests.ps1
#
# Controlla la sintassi di tutti gli script, compila le parti native e prova la
# logica di tray\lib\TrayCore.ps1. Esce con codice 1 se qualcosa non va.

$ErrorActionPreference = 'Stop'
$trayDir = Split-Path -Parent $PSScriptRoot
$repo = Split-Path -Parent $trayDir
. (Join-Path $trayDir 'lib\TrayCore.ps1')
Set-TrayLanguage 'it'

$script:Passed = 0
$script:Failed = 0
function Test([string]$name, [scriptblock]$body) {
  try {
    & $body
    $script:Passed++
    Write-Host "(pass) $name"
  } catch {
    $script:Failed++
    Write-Host "(FAIL) $name — $($_.Exception.Message)" -ForegroundColor Red
  }
}
function Assert-Equal($actual, $expected, [string]$what = 'valore') {
  if ($actual -ne $expected) { throw "$what`: atteso '$expected', trovato '$actual'" }
}
function Assert-True($condition, [string]$what) { if (-not $condition) { throw "non vero: $what" } }

# --- Sintassi e compilazione ---
Test 'tutti gli script PowerShell sono validi' {
  foreach ($f in Get-ChildItem $repo -Recurse -Filter *.ps1 | Where-Object { $_.FullName -notmatch '\\(backup|node_modules)\\' }) {
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$null, [ref]$errors)
    if ($errors.Count -gt 0) { throw "$($f.Name): $($errors[0].Message) (riga $($errors[0].Extent.StartLineNumber))" }
  }
}

Test 'gli script con testo non ASCII sono salvati in UTF-8 con BOM' {
  foreach ($f in Get-ChildItem $repo -Recurse -Filter *.ps1 | Where-Object { $_.FullName -notmatch '\\(backup|node_modules)\\' }) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    $ascii = -not ($bytes | Where-Object { $_ -gt 127 } | Select-Object -First 1)
    if (-not $hasBom -and -not $ascii) { throw "$($f.Name) senza BOM: PowerShell 5.1 leggerebbe male gli accenti" }
  }
}

Test 'le parti native (C#) si compilano' {
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -Path (Join-Path $trayDir 'lib\TrayNative.cs')
  Assert-True ([ClaudeTrayUi.Native]::DpiAt(0, 0) -ge 96) 'DPI del monitor principale'
}

# --- Formattazione ---
Test 'percentuali e durate' {
  Assert-Equal (Format-Percent 42) '42%'
  Assert-Equal (Format-Percent 18.55) '18.6%'
  Assert-Equal (Format-Duration 30000) 'meno di 1 min'
  Assert-Equal (Format-Duration (2 * 3600000 + 5 * 60000)) '2 h 5 min'
  Assert-Equal (Format-Duration (3 * 86400000 + 4 * 3600000)) '3 g 4 h'
}

# --- Dati della mod ---
$Now = [DateTimeOffset]::Parse('2026-10-10T17:30:00Z').ToUnixTimeMilliseconds()
function New-Store([double]$five = 42, [double]$seven = 18.5) {
  return ('{"lastLimits":{"observedAt":1,"windows":[' +
    '{"kind":"five_hour","label":"x","percentUsed":' + $five + ',"resetsAt":"2026-10-10T20:00:00Z"},' +
    '{"kind":"seven_day","label":"y","percentUsed":' + $seven + ',"resetsAt":"2026-10-14T17:30:00Z"}],' +
    '"scoped":[{"kind":"seven_day","label":"Fable","name":"Fable","percentUsed":9,"resetsAt":"2026-10-14T17:30:00Z"}],' +
    '"credits":[{"id":"c","limit":250,"used":10,"remaining":240,"currency":"USD","expiresAt":"2026-11-05T07:59:00Z"}],' +
    '"context":{"window":1000000,"tokens":307600,"percent":31}}}') | ConvertFrom-Json
}

Test 'lettura dello store: finestre, tempo trascorso, crediti, contesto' {
  $d = ConvertFrom-StoreJson (New-Store) ($Now - 60000) $Now
  Assert-Equal $d.Windows.Count 3 'finestre'
  $five = $d.Windows[0]
  Assert-Equal $five.Kind 'five_hour'
  Assert-Equal ([math]::Round($five.Elapsed, 3)) 50 'tempo trascorso 5 ore'
  Assert-Equal $five.StartMs ($five.ResetMs - 5 * 3600000) 'inizio finestra'
  Assert-Equal $d.Windows[2].Name 'Fable'
  Assert-Equal $d.Credits[0].Remaining 240
  Assert-Equal $d.Context.Percent 31
  Assert-Equal $d.IsStale $false 'dati freschi'
  Assert-Equal (ConvertFrom-StoreJson (New-Store) ($Now - 30 * 60000) $Now).IsStale $true 'dati vecchi'
}

Test 'ripartizione del settimanale dallo store' {
  $json = ('{"lastLimits":{"observedAt":1,"windows":[{"kind":"seven_day","label":"y","percentUsed":81,"resetsAt":"2026-10-14T17:30:00Z"}],' +
    '"breakdown":[{"key":"claude_code","name":"Claude Code","percent":38},{"key":"chat","name":"Chats","percent":62},{"key":"cowork","name":"Cowork","percent":0}],"extrasAt":1},' +
    '"projectShare":{"from":1,"rows":[{"project":"ClaudeUsageBarMod","percent":70},{"project":"Frisigram2","percent":20},{"project":"","percent":10,"isOthers":true}]}}') | ConvertFrom-Json
  $d = ConvertFrom-StoreJson $json $Now $Now
  Assert-Equal (Get-BreakdownText $d) 'Settimanale: Claude Code 38% · Chat 62%' 'ripartizione (voci a 0% omesse)'
  $empty = ConvertFrom-StoreJson (New-Store) $Now $Now
  Assert-Equal (Get-BreakdownText $empty) $null 'senza ripartizione'
}

# --- Impostazioni ---
Test 'impostazioni: predefinite, valori non validi, file di una versione precedente' {
  $s = ConvertTo-TraySettings $null
  Assert-Equal $s.useItEnabled $false 'usalo o lo perdi spento di base'
  Assert-Equal $s.quietEnabled $false 'non disturbare spento di base'
  Assert-Equal $s.hotkey 'Ctrl+Alt+L'
  Assert-Equal $s.iconSource 'both'
  $old = '{"notifications":false,"thresholds":[90,75],"paceAlertPts":20,"notified":["a"],"iconSource":"seven_day"}' | ConvertFrom-Json
  $s = ConvertTo-TraySettings $old
  Assert-Equal $s.notifications $false
  Assert-Equal (@($s.thresholds) -join ',') '75,90' 'soglie ordinate'
  Assert-Equal $s.paceAlertPts 20
  Assert-Equal $s.iconSource 'seven_day'
  Assert-Equal $s.showGraph $false 'nuova voce con il valore predefinito (grafici chiusi)'
  $bad = '{"iconSource":"boh","orangeBand":-3,"quietFrom":"25:00","hotkey":"L","thresholds":[0,"x",80],"colorIcon":"si"}' | ConvertFrom-Json
  $s = ConvertTo-TraySettings $bad
  Assert-Equal $s.iconSource 'both'
  Assert-Equal $s.orangeBand 5
  Assert-Equal $s.quietFrom '23:00'
  Assert-Equal $s.hotkey 'Ctrl+Alt+L'
  Assert-Equal (@($s.thresholds) -join ',') '80'
  Assert-Equal $s.colorIcon $true
}

# --- Ritmo e icona ---
function W($kind, $pct, $el, $name = $null) { [pscustomobject]@{ Kind = $kind; Name = $name; Percent = $pct; Elapsed = $el; ResetPassed = $false } }

Test 'colore del ritmo con le soglie predefinite e personalizzate' {
  $s = ConvertTo-TraySettings $null
  Assert-Equal (Get-PaceState (W five_hour 60 50) $s) 'red'
  Assert-Equal (Get-PaceState (W five_hour 50 50) $s) 'orange'
  Assert-Equal (Get-PaceState (W five_hour 45 50) $s) 'orange'
  Assert-Equal (Get-PaceState (W five_hour 44 50) $s) 'green'
  Assert-Equal (Get-PaceState (W five_hour 44 $null) $s) 'base'
  Assert-Equal (Get-PaceState (W five_hour 0 3) $s) 'green' '0% a inizio finestra'
  Assert-Equal (Get-PaceState (W five_hour 0 0) $s) 'green' '0% a 0%'
  $s.orangeBand = 10; $s.redAbove = 3
  Assert-Equal (Get-PaceState (W five_hour 52 50) $s) 'orange' 'fino a 3 punti sopra resta arancione'
  Assert-Equal (Get-PaceState (W five_hour 54 50) $s) 'red'
  Assert-Equal (Get-PaceState (W five_hour 41 50) $s) 'orange'
  Assert-Equal (Get-PaceState (W five_hour 39 50) $s) 'green'
}

Test 'icona: il peggiore dei limiti scelti, senza i limiti per modello' {
  $s = ConvertTo-TraySettings $null
  $d = [pscustomobject]@{ Windows = @((W five_hour 10 50), (W seven_day 60 50), (W seven_day 99 50 'Fable')) }
  Assert-Equal (Get-IconState $d $s) 'red'
  $s.iconSource = 'five_hour'
  Assert-Equal (Get-IconState $d $s) 'green'
  $s.iconSource = 'both'
  $d = [pscustomobject]@{ Windows = @((W five_hour 10 50), (W seven_day 10 50), (W seven_day 99 50 'Fable')) }
  Assert-Equal (Get-IconState $d $s) 'green'
  $s.colorIcon = $false
  Assert-Equal (Get-IconState $d $s) 'base' 'icona senza colori'
  Assert-Equal (Get-IconState $null (ConvertTo-TraySettings $null)) 'base'
}

# --- Notifiche ---
Test 'non disturbare, anche a cavallo della mezzanotte' {
  $s = ConvertTo-TraySettings $null
  Assert-Equal (Test-QuietTime ([datetime]'2026-10-10 23:30') $s) $false 'spento'
  $s.quietEnabled = $true
  Assert-Equal (Test-QuietTime ([datetime]'2026-10-10 23:30') $s) $true
  Assert-Equal (Test-QuietTime ([datetime]'2026-10-10 07:59') $s) $true
  Assert-Equal (Test-QuietTime ([datetime]'2026-10-10 08:00') $s) $false
  $s.quietFrom = '13:00'; $s.quietTo = '14:30'
  Assert-Equal (Test-QuietTime ([datetime]'2026-10-10 14:00') $s) $true
  Assert-Equal (Test-QuietTime ([datetime]'2026-10-10 15:00') $s) $false
}

Test 'soglie: solo la più alta, le altre segnate; niente ripetizioni' {
  $s = ConvertTo-TraySettings $null
  $d = ConvertFrom-StoreJson (New-Store 92 10) $Now $Now
  $n = Get-Notices $d $s $Now
  Assert-Equal $n.Send.Count 1 'un avviso'
  Assert-True ($n.Send[0].Key -like 'thr|five_hour||*|90') 'soglia 90'
  Assert-Equal $n.Send[0].Title 'Limite di sessione: 92% usato'
  Assert-True ($n.Mark[0] -like 'thr|*|75') 'soglia 75 segnata'
  $s.notified = @($n.Send[0].Key) + $n.Mark
  Assert-Equal (Get-Notices $d $s $Now).Send.Count 0 'già inviato'
}

Test 'avviso di ritmo prima delle soglie' {
  $s = ConvertTo-TraySettings $null
  $d = ConvertFrom-StoreJson (New-Store 66 10) $Now $Now  # 5 ore: 66% a metà finestra
  $n = Get-Notices $d $s $Now
  Assert-Equal $n.Send.Count 1
  Assert-True ($n.Send[0].Key -like 'pace|five_hour|*') 'ritmo'
  Assert-Equal $n.Send[0].Body 'Stai consumando 16 punti più in fretta del tempo che passa.'
}

Test 'usalo o lo perdi: spento di base, poi avvisa poco prima del reset' {
  $s = ConvertTo-TraySettings $null
  $late = [DateTimeOffset]::Parse('2026-10-10T19:40:00Z').ToUnixTimeMilliseconds()  # 20 min al reset
  $d = ConvertFrom-StoreJson (New-Store 40 10) $late $late
  Assert-Equal (@((Get-Notices $d $s $late).Send | Where-Object { $_.Key -like 'useit*' })).Count 0 'spento'
  $s.useItEnabled = $true
  $n = @((Get-Notices $d $s $late).Send | Where-Object { $_.Key -like 'useit*' })
  Assert-Equal $n.Count 1 'un avviso (solo 5 ore: al settimanale mancano giorni)'
  Assert-Equal $n[0].Title 'Limite di sessione: usalo o lo perdi'
  Assert-Equal $n[0].Body 'Tra 20 min si azzera e ti resta il 60%.'
  $d = ConvertFrom-StoreJson (New-Store 70 10) $late $late
  Assert-Equal (@((Get-Notices $d $s $late).Send | Where-Object { $_.Key -like 'useit*' })).Count 0 'resta solo il 30%'
}

Test 'reset avvenuto da poco: avviso; dati vecchi: nessun avviso' {
  $s = ConvertTo-TraySettings $null
  $after = [DateTimeOffset]::Parse('2026-10-10T20:10:00Z').ToUnixTimeMilliseconds()
  $d = ConvertFrom-StoreJson (New-Store 92 10) $after $after
  $n = Get-Notices $d $s $after
  Assert-Equal $n.Send[0].Title 'Limite di sessione ripristinato'
  $stale = ConvertFrom-StoreJson (New-Store 92 95) ($Now - 3600000) $Now
  Assert-Equal (Get-Notices $stale $s $Now).Send.Count 0
}

# --- Storico e grafico ---
Test 'storico: un campione quando cambia, o ogni 10 minuti; via quelli vecchi' {
  $d = ConvertFrom-StoreJson (New-Store 42 18) $Now $Now
  $h = @(Add-HistorySamples @() $d $Now)
  Assert-Equal $h.Count 2 '5 ore + settimanale (non Fable)'
  $h = @(Add-HistorySamples $h $d ($Now + 60000))
  Assert-Equal $h.Count 2 'invariato'
  $d2 = ConvertFrom-StoreJson (New-Store 45 18) $Now $Now
  $h = @(Add-HistorySamples $h $d2 ($Now + 120000))
  Assert-Equal $h.Count 3 'cambiato il 5 ore'
  $h = @(Add-HistorySamples $h $d2 ($Now + 13 * 60000))
  Assert-Equal $h.Count 5 'dopo 10 minuti'
  $old = @([pscustomobject]@{ t = $Now - 9 * 86400000; k = 'five_hour'; r = 1; p = 1 })
  Assert-Equal @(Add-HistorySamples $old $null $Now).Count 0 'più vecchio di 8 giorni'
}

Test 'serie del grafico: da 0 all inizio, mai in discesa, fino al valore attuale' {
  $d = ConvertFrom-StoreJson (New-Store 42 18) $Now $Now
  $five = $d.Windows[0]
  $own = @(
    [pscustomobject]@{ t = $Now - 2 * 3600000; k = 'five_hour'; r = $five.ResetMs; p = 20 },
    [pscustomobject]@{ t = $Now - 3600000; k = 'five_hour'; r = $five.ResetMs + 1000; p = 15 },
    [pscustomobject]@{ t = $Now - 1800000; k = 'five_hour'; r = $five.ResetMs - 86400000; p = 99 }
  )
  $claude = @([pscustomobject]@{ t = $Now - 1200000; u = [pscustomobject]@{ fh = 80; sd = 18 } })
  $pts = @(Get-HistorySeries $five $own $claude $Now)
  Assert-Equal $pts[0].T $five.StartMs 'inizio'
  Assert-Equal $pts[0].P 0
  Assert-Equal (($pts | ForEach-Object { $_.P }) -join ',') '0,20,20,42,42' 'monotona, limitata al dato ufficiale, senza la finestra precedente'
  Assert-Equal $pts[-1].T $Now 'fine adesso'
}

Test 'proiezione al reset' {
  $d = ConvertFrom-StoreJson (New-Store 20 18) $Now $Now   # 5 ore a metà finestra
  $p = Get-Projection $d.Windows[0] $Now
  Assert-Equal ([math]::Round($p.AtReset, 3)) 40 'il doppio a fine finestra'
  Assert-Equal $p.HitsLimitMs $null
  $d = ConvertFrom-StoreJson (New-Store 80 18) $Now $Now
  $p = Get-Projection $d.Windows[0] $Now
  Assert-Equal ([math]::Round($p.AtReset, 3)) 160
  Assert-Equal $p.HitsLimitMs ($d.Windows[0].StartMs + [long](2.5 * 3600000 * 100 / 80)) 'esaurito dopo 3 h 7 min 30 s'
  $early = $d.Windows[0].StartMs + 60000
  Assert-Equal (Get-Projection (ConvertFrom-StoreJson (New-Store 5 1) $early $early).Windows[0] $early) $null 'troppo presto'
}

# --- Scorciatoia ---
Test 'scorciatoie da tastiera' {
  $hk = ConvertFrom-HotkeyText 'Ctrl+Alt+L'
  Assert-Equal $hk.Mods 3
  Assert-Equal $hk.Vk 0x4C
  Assert-Equal (ConvertFrom-HotkeyText 'Shift+Ctrl+F5').Vk 0x74
  Assert-Equal (ConvertFrom-HotkeyText 'Alt+7').Vk 0x37
  Assert-Equal (ConvertFrom-HotkeyText 'L') $null 'senza modificatori'
  Assert-Equal (ConvertFrom-HotkeyText 'Ctrl+Alt') $null 'senza tasto'
  Assert-Equal (ConvertFrom-HotkeyText 'Ctrl+L+K') $null 'due tasti'
}

# --- Versioni ---
Test 'confronto delle versioni e risposta di GitHub' {
  Assert-Equal (Test-NewerVersion 'v0.9.0' '0.8.0') $true
  Assert-Equal (Test-NewerVersion 'v0.8.0' 'v0.8.0') $false
  Assert-Equal (Test-NewerVersion 'v0.10.0' 'v0.9.9') $true
  Assert-Equal (Test-NewerVersion 'v0.8.1' 'v0.9.0') $false
  Assert-Equal (Test-NewerVersion 'latest' 'v0.9.0') $false
  $r = ConvertFrom-ReleaseJson '{"tag_name":"v0.9.0","html_url":"https://github.com/x/y/releases/tag/v0.9.0","draft":false,"prerelease":false}'
  Assert-Equal $r.Tag 'v0.9.0'
  Assert-Equal (ConvertFrom-ReleaseJson '{"tag_name":"v1.0.0-rc","prerelease":true}') $null
  Assert-Equal (ConvertFrom-ReleaseJson 'non json') $null
}

Write-Host ''
Write-Host "$script:Passed pass, $script:Failed fail"
if ($script:Failed -gt 0) { exit 1 }
