# Logica del programma tray senza interfaccia: lettura dei dati della mod,
# impostazioni, ritmo, notifiche, storico per il grafico, versioni.
# La usano ClaudeLimitsTray.ps1 e i test (tray\tests\run-tests.ps1).

$script:FiveHourMs = 5 * 60 * 60 * 1000
$script:SevenDayMs = 7 * 24 * 60 * 60 * 1000
$script:StaleMs = 20 * 60 * 1000  # oltre 20 min senza aggiornamenti: dati non freschi
$script:SameWindowMs = 10 * 60 * 1000  # reset più vicini di così: stessa finestra

# --- Lingua: segue la lingua di Windows (italiano o inglese) ---
$script:Strings = @{
  it = @{
    context = 'Finestra di contesto'; title = 'Limiti di utilizzo del piano · ritmo'
    five = 'Limite di sessione'; seven = 'Settimanale · tutti i modelli'
    resetsIn = 'Si ripristina tra {0}'; resetsAt = 'Si azzera {0}'; resetNA = 'reset non comunicato'; already = 'già ripristinato'
    less = 'meno di 1 min'; ud = 'g'; uh = 'h'; um = 'min'; sep = ' '
    behind = '{0} pt sotto il ritmo'; ahead = '{0} pt sopra il ritmo'; even = 'in linea con il ritmo'
    estNA = 'stima non disponibile (reset non comunicato)'; stale = 'dati non aggiornati — apri Claude Desktop'
    noData1 = 'Nessun dato dai limiti.'; noData2 = 'Apri Claude Desktop: i dati compaiono dopo la prima risposta.'
    mShow = 'Mostra i limiti'; mRefresh = 'Aggiorna'; mQuit = 'Esci'; tip = 'Claude — limiti di utilizzo'
    mNotify = 'Notifiche'; mSettings = 'Impostazioni…'; mUpdateTo = 'Aggiorna alla {0}'
    mIconSource = 'Colore dell''icona'; srcBoth = 'Entrambi i limiti (il peggiore)'
    srcFive = 'Solo limite di 5 ore'; srcSeven = 'Solo limite settimanale'
    scopedWeekly = 'Settimanale · {0}'; scopedSession = 'Sessione · {0}'
    credits = 'Crediti per sessioni cloud'; creditsLeft = '{0} di {1} rimanenti'; creditsExp = 'Scade {0}'
    nTitleThr = '{0}: {1} usato'; nBodyThr = 'Hai superato la soglia del {0}%. {1}.'
    nTitleReset = '{0} ripristinato'; nBodyReset = 'Il limite si è azzerato: puoi tornare a usare Claude a pieno ritmo.'
    nTitlePace = '{0}: sopra il ritmo'; nBodyPace = 'Stai consumando {0} punti più in fretta del tempo che passa.'
    nTitleUseIt = '{0}: usalo o lo perdi'; nBodyUseIt = 'Tra {0} si azzera e ti resta il {1}.'
    nTitleUpdate = 'Nuova versione {0}'; nBodyUpdate = 'Clicca qui (o usa il menu "Aggiorna alla {0}") per aggiornare mod e programma.'
    nTitleUpdated = 'Aggiornato alla {0}'; nBodyUpdated = 'Nella scheda Code di Claude digita /reload-plugins per caricare la nuova mod.'
    nTitleUpdateFail = 'Aggiornamento non riuscito'; nBodyUpdateFail = '{0} Dettagli in update.log.'
    updNoGit = 'La cartella non è un clone git: scarica la release da GitHub.'
    nTitleHotkey = 'Scorciatoia non disponibile'; nBodyHotkey = '{0} è già usata da un altro programma: scegline un''altra nelle impostazioni.'
    winTitle = 'Impostazioni — Claude Limits Tray'; winVersion = 'Versione {0}'
    chartTitle = 'Andamento dei limiti'; chartSub = 'Utilizzo reale contro il ritmo ideale'; chartNow = 'adesso'; chartTip = 'Grafici'
    chartUsed = '{0} usato'; chartNone = 'Nessun grafico: serve l''orario di reset dei limiti.'
    projUnder = 'Al ritmo attuale arrivi a circa {0} al reset.'; projOver = 'Al ritmo attuale esaurisci il limite {0} (tra {1}).'
    projNA = 'Proiezione disponibile dopo un po'' di utilizzo.'
    legReal = 'utilizzo reale'; legIdeal = 'ritmo ideale'; legProj = 'proiezione'
    navIcon = 'Icona'; navPopup = 'Popup'; navNotify = 'Notifiche'; navUseIt = 'Usalo o lo perdi'; navUpdates = 'Aggiornamenti'
    pIcon = 'Il colore dell''orologio nella barra confronta l''utilizzo con il tempo trascorso.'
    pPopup = 'Cosa mostra il popup e come aprirlo.'
    pNotify = 'Avvisi di Windows sui limiti di 5 ore e settimanale.'
    pUseIt = 'Un promemoria quando un limite sta per azzerarsi e ne hai usato poco.'
    pUpdates = 'Le nuove versioni arrivano dalle release pubbliche su GitHub.'
    cColorIcon = 'Icona colorata'; dColorIcon = 'Verde sotto il ritmo, arancione vicino, rosso sopra.'
    cSource = 'Limite che decide il colore'; dSource = 'Con "Entrambi" vince il peggiore.'
    segBoth = 'Entrambi'; segFive = '5 ore'; segSeven = 'Settimanale'
    cOrange = 'Arancione'; dOrange = 'Fino a quanti punti sotto il ritmo.'
    cRed = 'Rosso'; dRed = 'Oltre quanti punti sopra il ritmo.'
    cGraph = 'Grafici insieme ai limiti'; dGraph = 'Apri il popup dei grafici ogni volta (o dall''icona in basso a destra).'
    cHotkeyOn = 'Scorciatoia da tastiera'; dHotkeyOn = 'Apre e chiude il popup da qualsiasi programma.'
    cHotkey = 'Combinazione'; dHotkey = 'Clicca nel campo e premi i tasti.'
    cNotify = 'Notifiche'; dNotify = 'Soglie, ritmo e reset dei limiti.'
    cThresholds = 'Soglie di utilizzo'; dThresholds = 'Percentuali separate da virgola, es. 75, 90.'
    cPace = 'Avviso di ritmo'; dPace = 'Punti sopra il ritmo (0 = mai).'
    cQuiet = 'Non disturbare'; dQuiet = 'Nessun avviso nella fascia oraria qui sotto.'
    cQuietRange = 'Fascia oraria'; dQuietRange = 'Anche a cavallo della mezzanotte.'
    cUseIt = 'Usalo o lo perdi'; dUseIt = 'Es. "Tra 30 min si azzera e ti resta il 60%".'
    cUseItFive = 'Preavviso limite di 5 ore'; dUseItFive = 'Minuti prima del reset.'
    cUseItSeven = 'Preavviso settimanale'; dUseItSeven = 'Ore prima del reset.'
    cUseItMin = 'Quota rimasta'; dUseItMin = 'Avvisa solo se resta almeno questa percentuale.'
    cUpdates = 'Controllo automatico'; dUpdates = 'All''avvio e ogni 6 ore.'
    cVersion = 'Versione installata: {0}'
    cGithub = 'Progetto su GitHub'; dGithub = 'Codice, istruzioni e note di rilascio.'; btnOpen = 'Apri'
    cData = 'Impostazioni e storico'; btnFolder = 'Apri cartella'
    cNewVersion = 'Nuova versione disponibile'; dNewVersion = 'Aggiorna mod e programma con un clic.'
    sCheckNow = 'Controlla ora'; sUpToDate = 'Sei aggiornato.'; sAvailable = 'Disponibile la {0}.'; sCheckFail = 'Controllo non riuscito.'; sChecking = 'Controllo…'
    btnReset = 'Predefinite'; btnCancel = 'Annulla'; btnSave = 'Salva'
  }
  en = @{
    context = 'Context window'; title = 'Plan usage limits · pace'
    five = 'Session limit'; seven = 'Weekly · all models'
    resetsIn = 'Resets in {0}'; resetsAt = 'Resets {0}'; resetNA = 'reset not reported'; already = 'already reset'
    less = 'less than 1 min'; ud = 'd'; uh = 'h'; um = 'm'; sep = ''
    behind = '{0} pts behind pace'; ahead = '{0} pts ahead of pace'; even = 'on pace'
    estNA = 'estimate unavailable (reset not reported)'; stale = 'data not updated — open Claude Desktop'
    noData1 = 'No usage data.'; noData2 = "Open Claude Desktop: data appears after Claude's first reply."
    mShow = 'Show limits'; mRefresh = 'Refresh'; mQuit = 'Quit'; tip = 'Claude — usage limits'
    mNotify = 'Notifications'; mSettings = 'Settings…'; mUpdateTo = 'Update to {0}'
    mIconSource = 'Icon color'; srcBoth = 'Both limits (the worse one)'
    srcFive = '5-hour limit only'; srcSeven = 'Weekly limit only'
    scopedWeekly = 'Weekly · {0}'; scopedSession = 'Session · {0}'
    credits = 'Cloud session credits'; creditsLeft = '{0} of {1} remaining'; creditsExp = 'Expires {0}'
    nTitleThr = '{0}: {1} used'; nBodyThr = 'You passed the {0}% threshold. {1}.'
    nTitleReset = '{0} reset'; nBodyReset = 'The limit has reset: you can use Claude at full pace again.'
    nTitlePace = '{0}: ahead of pace'; nBodyPace = 'You are using it {0} points faster than time is passing.'
    nTitleUseIt = '{0}: use it or lose it'; nBodyUseIt = 'It resets in {0} and you still have {1} left.'
    nTitleUpdate = 'New version {0}'; nBodyUpdate = 'Click here (or use the menu "Update to {0}") to update the mod and the app.'
    nTitleUpdated = 'Updated to {0}'; nBodyUpdated = 'In Claude''s Code tab type /reload-plugins to load the new mod.'
    nTitleUpdateFail = 'Update failed'; nBodyUpdateFail = '{0} Details in update.log.'
    updNoGit = 'The folder is not a git clone: download the release from GitHub.'
    nTitleHotkey = 'Shortcut unavailable'; nBodyHotkey = '{0} is already used by another app: pick another one in the settings.'
    winTitle = 'Settings — Claude Limits Tray'; winVersion = 'Version {0}'
    chartTitle = 'Limits over time'; chartSub = 'Real usage against the ideal pace'; chartNow = 'now'; chartTip = 'Charts'
    chartUsed = '{0} used'; chartNone = 'No charts: the limits'' reset time is needed.'
    projUnder = 'At this pace you reach about {0} by the reset.'; projOver = 'At this pace you run out {0} (in {1}).'
    projNA = 'Projection available after some usage.'
    legReal = 'real usage'; legIdeal = 'ideal pace'; legProj = 'projection'
    navIcon = 'Icon'; navPopup = 'Popup'; navNotify = 'Notifications'; navUseIt = 'Use it or lose it'; navUpdates = 'Updates'
    pIcon = 'The clock color in the taskbar compares usage with the time elapsed.'
    pPopup = 'What the popup shows and how to open it.'
    pNotify = 'Windows notifications about the 5-hour and weekly limits.'
    pUseIt = 'A reminder when a limit is about to reset and you have used little of it.'
    pUpdates = 'New versions come from the public releases on GitHub.'
    cColorIcon = 'Colored icon'; dColorIcon = 'Green behind pace, orange close, red ahead.'
    cSource = 'Limit that sets the color'; dSource = 'With "Both" the worse one wins.'
    segBoth = 'Both'; segFive = '5-hour'; segSeven = 'Weekly'
    cOrange = 'Orange'; dOrange = 'Up to how many points behind pace.'
    cRed = 'Red'; dRed = 'Above how many points ahead of pace.'
    cGraph = 'Charts with the limits'; dGraph = 'Open the charts popup every time (or from the bottom-right icon).'
    cHotkeyOn = 'Keyboard shortcut'; dHotkeyOn = 'Opens and closes the popup from any app.'
    cHotkey = 'Combination'; dHotkey = 'Click the field and press the keys.'
    cNotify = 'Notifications'; dNotify = 'Thresholds, pace and limit resets.'
    cThresholds = 'Usage thresholds'; dThresholds = 'Comma-separated percentages, e.g. 75, 90.'
    cPace = 'Pace warning'; dPace = 'Points ahead of pace (0 = never).'
    cQuiet = 'Do not disturb'; dQuiet = 'No notifications in the time range below.'
    cQuietRange = 'Time range'; dQuietRange = 'Can span midnight.'
    cUseIt = 'Use it or lose it'; dUseIt = 'E.g. "It resets in 30 min and you still have 60% left".'
    cUseItFive = '5-hour limit lead time'; dUseItFive = 'Minutes before the reset.'
    cUseItSeven = 'Weekly lead time'; dUseItSeven = 'Hours before the reset.'
    cUseItMin = 'Quota left'; dUseItMin = 'Only warn if at least this much is left.'
    cUpdates = 'Automatic check'; dUpdates = 'At startup and every 6 hours.'
    cVersion = 'Installed version: {0}'
    cGithub = 'Project on GitHub'; dGithub = 'Code, instructions and release notes.'; btnOpen = 'Open'
    cData = 'Settings and history'; btnFolder = 'Open folder'
    cNewVersion = 'New version available'; dNewVersion = 'Update the mod and the app in one click.'
    sCheckNow = 'Check now'; sUpToDate = 'You are up to date.'; sAvailable = '{0} is available.'; sCheckFail = 'Check failed.'; sChecking = 'Checking…'
    btnReset = 'Defaults'; btnCancel = 'Cancel'; btnSave = 'Save'
  }
}

function Set-TrayLanguage([string]$lang) {
  $script:Lang = if ($lang -eq 'it') { 'it' } else { 'en' }
  $script:Culture = [System.Globalization.CultureInfo]::GetCultureInfo($(if ($script:Lang -eq 'it') { 'it-IT' } else { 'en-US' }))
  $script:T = $script:Strings[$script:Lang]
}

# --- Formattazione (stessa logica della mod) ---
function Format-Tokens([double]$n) {
  if ($n -lt 0) { return '-' }
  if ($n -ge 1e6) { $v = [math]::Round($n / 1e6, 1); return (($v -as [string]) -replace '\.0$', '') + 'M' }
  if ($n -ge 1e3) { $v = [math]::Round($n / 1e3, 1); return (($v -as [string]) -replace '\.0$', '') + 'k' }
  return [string][math]::Round($n)
}
function Format-Percent([double]$p) {
  $r = [math]::Round($p, 1)
  if ($r -eq [math]::Floor($r)) { return ([string][int]$r) + '%' }
  return ($r.ToString([System.Globalization.CultureInfo]::InvariantCulture)) + '%'
}
function Format-Duration([double]$ms) {
  $t = $script:T
  if ($ms -lt 60000) { return $t.less }
  $d = [math]::Floor($ms / 86400000)
  $h = [math]::Floor(($ms % 86400000) / 3600000)
  $m = [math]::Floor(($ms % 3600000) / 60000)
  $s = $t.sep
  if ($d -gt 0) { if ($h -gt 0) { return "$d$s$($t.ud) $h$s$($t.uh)" } else { return "$d$s$($t.ud)" } }
  if ($h -gt 0) { if ($m -gt 0) { return "$h$s$($t.uh) $m$s$($t.um)" } else { return "$h$s$($t.uh)" } }
  return "$m$s$($t.um)"
}
function Clamp01([double]$v) { return [math]::Max(0.0, [math]::Min(1.0, $v)) }
function Get-NowMs { return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function ConvertTo-EpochMs($iso) {
  if (-not $iso) { return $null }
  try { return [DateTimeOffset]::Parse([string]$iso, [System.Globalization.CultureInfo]::InvariantCulture).ToUnixTimeMilliseconds() } catch { return $null }
}

function Format-Money([double]$amount, [string]$currency) {
  $fmt = if ($amount -eq [math]::Floor($amount)) { '{0:0}' } else { '{0:0.00}' }
  return ([string]::Format($script:Culture, $fmt, $amount)) + ' ' + $currency
}

# --- Lettura dei dati salvati dalla mod ---
function Get-StoreFile([string]$storeDir) {
  if (-not (Test-Path $storeDir)) { return $null }
  return Get-ChildItem $storeDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'usage-time-bar_*.json' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

function Get-LimitsData([string]$storeDir) {
  $file = Get-StoreFile $storeDir
  if ($null -eq $file) { return $null }
  try { $json = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } catch { return $null }
  $updated = [DateTimeOffset]::new($file.LastWriteTimeUtc, [TimeSpan]::Zero).ToUnixTimeMilliseconds()
  return ConvertFrom-StoreJson $json $updated (Get-NowMs)
}

# Il contenuto dello store della mod → finestre (5 ore, settimanale, per
# modello), crediti, contesto. `updatedMs`: ora di scrittura del file.
function ConvertFrom-StoreJson($json, [long]$updatedMs, [long]$now) {
  $last = $json.lastLimits
  if ($null -eq $last -or $null -eq $last.windows) { return $null }

  $windows = @()
  $all = @($last.windows) + @($last.scoped | Where-Object { $null -ne $_ -and $_.name })
  foreach ($w in $all) {
    if ($w.kind -ne 'five_hour' -and $w.kind -ne 'seven_day') { continue }
    $dur = if ($w.kind -eq 'five_hour') { $script:FiveHourMs } else { $script:SevenDayMs }
    $resetMs = ConvertTo-EpochMs $w.resetsAt

    $elapsed = $null; $remaining = $null; $resetPassed = $false; $startMs = $null
    if ($null -ne $resetMs) {
      $startMs = $resetMs - $dur
      $elapsed = (Clamp01 (($now - $startMs) / [double]$dur)) * 100.0
      $remaining = [math]::Max(0, $resetMs - $now)
      $resetPassed = $now -ge $resetMs
    }

    $windows += [pscustomobject]@{
      Kind        = $w.kind
      Label       = [string]$w.label
      Name        = if ($w.name) { [string]$w.name } else { $null }
      Percent     = [double]$w.percentUsed
      ResetMs     = $resetMs
      StartMs     = $startMs
      Elapsed     = $elapsed
      Remaining   = $remaining
      ResetPassed = $resetPassed
    }
  }
  if ($windows.Count -eq 0) { return $null }

  $ctx = $null
  if ($last.context -and $last.context.window) {
    $ctx = [pscustomobject]@{
      Window  = [double]$last.context.window
      Tokens  = if ($null -ne $last.context.tokens) { [double]$last.context.tokens } else { $null }
      Percent = if ($null -ne $last.context.percent) { [double]$last.context.percent } else { $null }
    }
  }

  $credits = @()
  foreach ($c in @($last.credits)) {
    if ($null -eq $c -or $null -eq $c.limit -or $null -eq $c.remaining) { continue }
    $credits += [pscustomobject]@{
      Limit     = [double]$c.limit
      Used      = if ($null -ne $c.used) { [double]$c.used } else { [math]::Max(0, [double]$c.limit - [double]$c.remaining) }
      Remaining = [double]$c.remaining
      Currency  = if ($c.currency) { [string]$c.currency } else { 'USD' }
      ExpiresMs = ConvertTo-EpochMs $c.expiresAt
    }
  }

  return [pscustomobject]@{
    Windows   = $windows
    Credits   = $credits
    Context   = $ctx
    UpdatedMs = $updatedMs
    IsStale   = ($now - $updatedMs) -gt $script:StaleMs
  }
}

function Get-WindowTitle($w) {
  $t = $script:T
  if ($w.Name) { return [string]::Format($(if ($w.Kind -eq 'five_hour') { $t.scopedSession } else { $t.scopedWeekly }), $w.Name) }
  if ($w.Kind -eq 'five_hour') { return $t.five }
  return $t.seven
}

function Reset-Text($w) {
  $t = $script:T
  if ($null -eq $w.ResetMs) { return $t.resetNA }
  if ($w.ResetPassed) { return $t.already }
  if ($w.Kind -eq 'five_hour') { return [string]::Format($t.resetsIn, (Format-Duration $w.Remaining)) }
  # Al minuto più vicino, come il popup di Claude (11:59:59.7 -> 12:00).
  $local = [DateTimeOffset]::FromUnixTimeMilliseconds([long]([math]::Round($w.ResetMs / 60000.0) * 60000)).LocalDateTime
  $day = $local.ToString('ddd', $script:Culture)
  return [string]::Format($t.resetsAt, ($day + ' ' + $local.ToString('HH:mm')))
}

# --- Impostazioni ---
# In %APPDATA%\ClaudeLimitsTray\settings.json; ogni voce mancante o non valida
# prende il valore predefinito.
function Get-DefaultSettings {
  return [pscustomobject]@{
    notifications   = $true
    thresholds      = @(75, 90)
    paceAlertPts    = 15
    notified        = @()
    iconSource      = 'both'      # both = il peggiore tra 5 ore e settimanale
    colorIcon       = $true
    orangeBand      = 5           # arancione da 0 a 5 punti sotto il ritmo
    redAbove        = 0           # rosso oltre 0 punti sopra il ritmo
    showGraph       = $false     # popup dei grafici: si apre dall'icona in basso a destra
    useItEnabled    = $false      # "usalo o lo perdi": spento di base
    useItFiveMin    = 30
    useItSevenHours = 12
    useItMinLeft    = 40
    quietEnabled    = $false
    quietFrom       = '23:00'
    quietTo         = '08:00'
    hotkeyEnabled   = $true
    hotkey          = 'Ctrl+Alt+L'
    checkUpdates    = $true
    lastUpdateCheck = 0
  }
}

function Get-Number($value, [double]$min, [double]$max, [double]$fallback) {
  $n = 0.0
  if ($null -eq $value -or -not [double]::TryParse([string]$value, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$n)) { return $fallback }
  if ([double]::IsNaN($n) -or $n -lt $min -or $n -gt $max) { return $fallback }
  return $n
}

function Test-ClockText([string]$s) { return $s -match '^([01]?\d|2[0-3]):[0-5]\d$' }

# Impostazioni lette dal file (o $null) → impostazioni complete e valide.
function ConvertTo-TraySettings($raw) {
  $s = Get-DefaultSettings
  if ($null -eq $raw) { return $s }
  $d = Get-DefaultSettings
  foreach ($name in 'notifications', 'colorIcon', 'showGraph', 'useItEnabled', 'quietEnabled', 'hotkeyEnabled', 'checkUpdates') {
    if ($raw.$name -is [bool]) { $s.$name = $raw.$name }
  }
  if ($null -ne $raw.thresholds) {
    $thr = @(@($raw.thresholds) | ForEach-Object { Get-Number $_ 1 100 -1 } | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
    $s.thresholds = $thr
  }
  $s.paceAlertPts = Get-Number $raw.paceAlertPts 0 100 $d.paceAlertPts
  $s.orangeBand = Get-Number $raw.orangeBand 0 50 $d.orangeBand
  $s.redAbove = Get-Number $raw.redAbove 0 50 $d.redAbove
  $s.useItFiveMin = Get-Number $raw.useItFiveMin 1 299 $d.useItFiveMin
  $s.useItSevenHours = Get-Number $raw.useItSevenHours 1 167 $d.useItSevenHours
  $s.useItMinLeft = Get-Number $raw.useItMinLeft 1 100 $d.useItMinLeft
  $s.lastUpdateCheck = Get-Number $raw.lastUpdateCheck 0 1e15 0
  if (@('both', 'five_hour', 'seven_day') -contains [string]$raw.iconSource) { $s.iconSource = [string]$raw.iconSource }
  if (Test-ClockText ([string]$raw.quietFrom)) { $s.quietFrom = [string]$raw.quietFrom }
  if (Test-ClockText ([string]$raw.quietTo)) { $s.quietTo = [string]$raw.quietTo }
  if ($null -ne (ConvertFrom-HotkeyText ([string]$raw.hotkey))) { $s.hotkey = [string]$raw.hotkey }
  if ($null -ne $raw.notified) { $s.notified = @(@($raw.notified) | ForEach-Object { [string]$_ }) }
  return $s
}

# --- Ritmo e colore dell'icona ---
# diff = utilizzo − tempo trascorso (punti): rosso oltre redAbove, arancione da
# 0 a orangeBand punti sotto (o fino a redAbove sopra), verde più sotto.
function Get-PaceState($w, $settings) {
  if ($null -eq $w -or $null -eq $w.Elapsed -or $w.ResetPassed) { return 'base' }
  $diff = $w.Percent - $w.Elapsed
  if ($diff -gt $settings.redAbove) { return 'red' }
  if ($diff -ge (-1 * $settings.orangeBand)) { return 'orange' }
  return 'green'
}

$script:PaceRank = @{ base = 0; green = 1; orange = 2; red = 3 }

# Stato dell'icona: il peggiore tra i limiti scelti (iconSource). I limiti di un
# singolo modello (es. Fable) non contano.
function Get-IconState($data, $settings) {
  if ($null -eq $data -or -not $settings.colorIcon) { return 'base' }
  $kinds = if ($settings.iconSource -eq 'both') { @('five_hour', 'seven_day') } else { @([string]$settings.iconSource) }
  $worst = 'base'
  foreach ($kind in $kinds) {
    $w = $data.Windows | Where-Object { $_.Kind -eq $kind -and -not $_.Name } | Select-Object -First 1
    $state = Get-PaceState $w $settings
    if ($script:PaceRank[$state] -gt $script:PaceRank[$worst]) { $worst = $state }
  }
  return $worst
}

# --- Notifiche ---
function ConvertTo-Minutes([string]$hhmm) {
  $p = $hhmm.Split(':')
  return [int]$p[0] * 60 + [int]$p[1]
}

# true se l'ora locale cade nella fascia "non disturbare" (anche a cavallo
# della mezzanotte, es. 23:00–08:00).
function Test-QuietTime([datetime]$local, $settings) {
  if (-not $settings.quietEnabled) { return $false }
  $from = ConvertTo-Minutes $settings.quietFrom
  $to = ConvertTo-Minutes $settings.quietTo
  $m = $local.Hour * 60 + $local.Minute
  if ($from -eq $to) { return $false }
  if ($from -lt $to) { return ($m -ge $from -and $m -lt $to) }
  return ($m -ge $from -or $m -lt $to)
}

# Avvisi da mandare ora: Send = @({Key, Title, Body}) non ancora inviati;
# Mark = chiavi da segnare come inviate senza avviso (soglie più basse
# superate insieme a una più alta).
function Get-Notices($data, $settings, [long]$now) {
  $t = $script:T
  $send = @(); $mark = @()
  if ($null -eq $data) { return [pscustomobject]@{ Send = $send; Mark = $mark } }
  $sent = @($settings.notified)
  foreach ($w in $data.Windows) {
    $name = Get-WindowTitle $w
    $id = "$($w.Kind)|$($w.Name)|$($w.ResetMs)"
    if ($w.ResetPassed) {
      # Reset avvenuto da poco (niente avvisi vecchi all'avvio del programma).
      if ($null -ne $w.ResetMs -and ($now - $w.ResetMs) -lt 6 * 3600000) {
        $send += [pscustomobject]@{ Key = "reset|$id"; Title = [string]::Format($t.nTitleReset, $name); Body = $t.nBodyReset }
      }
      continue
    }
    if ($data.IsStale) { continue }
    # Solo la soglia più alta superata: niente raffica di avvisi all'avvio.
    $passed = @($settings.thresholds | Where-Object { $w.Percent -ge $_ } | Sort-Object)
    if ($passed.Count -gt 0) {
      $thr = $passed[-1]
      foreach ($lower in $passed) { if ($lower -ne $thr) { $mark += "thr|$id|$lower" } }
      $send += [pscustomobject]@{
        Key = "thr|$id|$thr"
        Title = [string]::Format($t.nTitleThr, $name, (Format-Percent $w.Percent))
        Body = [string]::Format($t.nBodyThr, $thr, (Reset-Text $w))
      }
    }
    # Il ritmo è un preavviso: superata una soglia non serve più.
    if ($passed.Count -eq 0 -and $null -ne $w.Elapsed -and $settings.paceAlertPts -gt 0) {
      $diff = [math]::Round($w.Percent - $w.Elapsed)
      if ($diff -ge $settings.paceAlertPts) {
        $send += [pscustomobject]@{ Key = "pace|$id"; Title = [string]::Format($t.nTitlePace, $name); Body = [string]::Format($t.nBodyPace, $diff) }
      }
    }
    # Usalo o lo perdi: poco prima del reset ne resta ancora tanto.
    if ($settings.useItEnabled -and -not $w.Name -and $null -ne $w.Remaining -and $w.Remaining -gt 0) {
      $lead = if ($w.Kind -eq 'five_hour') { $settings.useItFiveMin * 60000 } else { $settings.useItSevenHours * 3600000 }
      $left = [math]::Max(0, 100 - $w.Percent)
      if ($w.Remaining -le $lead -and $left -ge $settings.useItMinLeft) {
        $send += [pscustomobject]@{
          Key = "useit|$id"
          Title = [string]::Format($t.nTitleUseIt, $name)
          Body = [string]::Format($t.nBodyUseIt, (Format-Duration $w.Remaining), (Format-Percent $left))
        }
      }
    }
  }
  $send = @($send | Where-Object { $sent -notcontains $_.Key })
  $mark = @($mark | Where-Object { $sent -notcontains $_ })
  return [pscustomobject]@{ Send = $send; Mark = $mark }
}

# --- Storico per il grafico ---
# Campioni propri in %APPDATA%\ClaudeLimitsTray\history.json:
#   { t: ora (ms), k: five_hour|seven_day, r: reset (ms), p: percentuale }
# più, se c'è, lo storico che salva Claude Desktop (plan-usage-history.json:
# { t, u: { fh, sd } }).
$script:HistoryKeepMs = 8 * 24 * 3600000

# Aggiunge i campioni nuovi: quando la percentuale cambia, o ogni 10 minuti.
function Add-HistorySamples([object[]]$samples, $data, [long]$now) {
  $list = New-Object System.Collections.ArrayList
  foreach ($s in @($samples)) { if ($null -ne $s -and ($now - [long]$s.t) -le $script:HistoryKeepMs) { [void]$list.Add($s) } }
  if ($null -eq $data) { return $list.ToArray() }
  foreach ($w in $data.Windows) {
    if ($w.Name -or $null -eq $w.ResetMs -or $w.ResetPassed) { continue }
    $lastOne = $null
    for ($i = $list.Count - 1; $i -ge 0; $i--) { if ($list[$i].k -eq $w.Kind) { $lastOne = $list[$i]; break } }
    $changed = $null -eq $lastOne -or [double]$lastOne.p -ne $w.Percent -or [math]::Abs([long]$lastOne.r - $w.ResetMs) -ge $script:SameWindowMs
    if ($changed -or ($now - [long]$lastOne.t) -ge 600000) {
      [void]$list.Add([pscustomobject]@{ t = $now; k = $w.Kind; r = [long]$w.ResetMs; p = $w.Percent })
    }
  }
  return $list.ToArray()
}

# Punti (T = ora ms, P = %) della finestra $w, da inizio finestra ad adesso:
# parte da 0 all'inizio, non scende mai (dentro una finestra l'utilizzo cresce),
# finisce sul valore attuale.
function Get-HistorySeries($w, [object[]]$own, [object[]]$claude, [long]$now) {
  if ($null -eq $w.StartMs -or $w.ResetPassed) { return @() }
  $start = [long]$w.StartMs
  $raw = New-Object System.Collections.ArrayList
  foreach ($s in @($own)) {
    if ($null -eq $s -or $s.k -ne $w.Kind) { continue }
    if ([math]::Abs([long]$s.r - $w.ResetMs) -ge $script:SameWindowMs) { continue }
    if ([long]$s.t -lt $start -or [long]$s.t -gt $now) { continue }
    [void]$raw.Add([pscustomobject]@{ T = [long]$s.t; P = [double]$s.p })
  }
  $field = if ($w.Kind -eq 'five_hour') { 'fh' } else { 'sd' }
  foreach ($s in @($claude)) {
    if ($null -eq $s -or $null -eq $s.u -or $null -eq $s.u.$field) { continue }
    if ([long]$s.t -lt $start -or [long]$s.t -gt $now) { continue }
    [void]$raw.Add([pscustomobject]@{ T = [long]$s.t; P = [double]$s.u.$field })
  }
  $points = @([pscustomobject]@{ T = $start; P = 0.0 })
  $max = 0.0
  foreach ($p in ($raw | Sort-Object T)) {
    # Mai sopra il valore attuale: un campione vecchio di un'altra fonte non
    # deve far salire la curva oltre il dato ufficiale.
    $v = [math]::Min([double]$w.Percent, [math]::Max($max, $p.P))
    $max = $v
    $points += [pscustomobject]@{ T = $p.T; P = $v }
  }
  $points += [pscustomobject]@{ T = $now; P = [math]::Max($max, [double]$w.Percent) }
  return $points
}

# Proiezione lineare al ritmo medio della finestra fin qui: percentuale al reset
# e, se supera il 100%, quando si esaurisce. $null se è troppo presto (meno del
# 10% della finestra trascorso o meno dell'1% usato): la stima ballerebbe troppo.
function Get-Projection($w, [long]$now) {
  if ($null -eq $w.StartMs -or $w.ResetPassed) { return $null }
  $span = [double]$w.ResetMs - [double]$w.StartMs
  $frac = ($now - [double]$w.StartMs) / $span
  if ($frac -lt 0.1 -or $w.Percent -lt 1) { return $null }
  $atReset = $w.Percent / [math]::Min(1.0, $frac)
  $hits = $null
  if ($atReset -gt 100) { $hits = [long]([double]$w.StartMs + $span * $frac * 100.0 / $w.Percent) }
  return [pscustomobject]@{ AtReset = $atReset; HitsLimitMs = $hits }
}

# --- Scorciatoia da tastiera ---
# "Ctrl+Alt+L" → @{ Mods = MOD_CONTROL|MOD_ALT; Key = 'L'; Vk = 0x4C }.
function ConvertFrom-HotkeyText([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  $mods = 0; $key = $null
  foreach ($part in ($text -split '\+' | ForEach-Object { $_.Trim() })) {
    switch -Regex ($part) {
      '^(?i)(ctrl|control)$' { $mods = $mods -bor 2; continue }
      '^(?i)alt$' { $mods = $mods -bor 1; continue }
      '^(?i)shift$' { $mods = $mods -bor 4; continue }
      '^(?i)win$' { $mods = $mods -bor 8; continue }
      default { if ($null -ne $key) { return $null }; $key = $part }
    }
  }
  if ($null -eq $key -or $mods -eq 0) { return $null }
  $vk = $null
  if ($key -match '^[A-Za-z0-9]$') { $vk = [int][char]$key.ToUpperInvariant() }
  elseif ($key -match '^(?i)F([1-9]|1[0-2])$') { $vk = 0x6F + [int]$Matches[1] }
  if ($null -eq $vk) { return $null }
  return [pscustomobject]@{ Mods = $mods; Key = $key.ToUpperInvariant(); Vk = $vk }
}

# --- Versioni ---
# "v0.9.0" / "0.10.1" → [version]; $null se non è una versione.
function ConvertTo-TrayVersion([string]$s) {
  if ($s -match '^\s*v?(\d+)\.(\d+)(?:\.(\d+))?') {
    $patch = if ($Matches[3]) { [int]$Matches[3] } else { 0 }
    return [version]::new([int]$Matches[1], [int]$Matches[2], $patch)
  }
  return $null
}

# true se la release $remote è più nuova di $local.
function Test-NewerVersion([string]$remote, [string]$local) {
  $r = ConvertTo-TrayVersion $remote
  $l = ConvertTo-TrayVersion $local
  if ($null -eq $r) { return $false }
  if ($null -eq $l) { return $true }
  return $r -gt $l
}

# Risposta di GitHub (releases/latest) → @{ Tag; Url } o $null.
function ConvertFrom-ReleaseJson([string]$text) {
  try { $j = $text | ConvertFrom-Json } catch { return $null }
  if ($null -eq $j -or -not $j.tag_name -or $j.draft -or $j.prerelease) { return $null }
  return [pscustomobject]@{ Tag = [string]$j.tag_name; Url = [string]$j.html_url }
}
