# Claude Limits Tray — icona nella barra delle applicazioni (area di notifica)
# che apre un popup con i limiti di utilizzo nello stile chiesto dall'utente.
#
# I dati arrivano da Claude tramite la mod "usage-time-bar": questa legge le
# risposte dell'API e salva l'ultimo stato (percentuali, orari di reset, finestra
# di contesto) in ~\.claude\plugins\store\usage-time-bar_*.json. Il programma
# legge quel file: nessuna richiesta di rete, niente credenziali, niente modifiche
# all'app di Claude. Si aggiorna quando la mod aggiorna il file (cioè mentre usi
# Claude Desktop).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:StoreDir = Join-Path $env:USERPROFILE '.claude\plugins\store'
$script:HistoryFile = Join-Path $env:APPDATA 'Claude\plan-usage-history.json'
$script:IconPath = Join-Path $PSScriptRoot 'claude-limits.ico'

$FiveHourMs = 5 * 60 * 60 * 1000
$SevenDayMs = 7 * 24 * 60 * 60 * 1000
$StaleMs = 20 * 60 * 1000  # oltre 20 min senza aggiornamenti: dati non freschi

# --- Lingua: segue la lingua di Windows (italiano o inglese) ---
$script:Lang = if ([System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName -ieq 'it') { 'it' } else { 'en' }
$script:Culture = [System.Globalization.CultureInfo]::GetCultureInfo($(if ($script:Lang -eq 'it') { 'it-IT' } else { 'en-US' }))
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
    mNotify = 'Notifiche'
    mIconSource = 'Colore dell''icona'; srcBoth = 'Entrambi i limiti (il peggiore)'
    srcFive = 'Solo limite di 5 ore'; srcSeven = 'Solo limite settimanale'
    scopedWeekly = 'Settimanale · {0}'; scopedSession = 'Sessione · {0}'
    credits = 'Crediti per sessioni cloud'; creditsLeft = '{0} di {1} rimanenti'; creditsExp = 'Scade {0}'
    nTitleThr = '{0}: {1} usato'; nBodyThr = 'Hai superato la soglia del {0}%. {1}.'
    nTitleReset = '{0} ripristinato'; nBodyReset = 'Il limite si è azzerato: puoi tornare a usare Claude a pieno ritmo.'
    nTitlePace = '{0}: sopra il ritmo'; nBodyPace = 'Stai consumando {0} punti più in fretta del tempo che passa.'
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
    mNotify = 'Notifications'
    mIconSource = 'Icon color'; srcBoth = 'Both limits (the worse one)'
    srcFive = '5-hour limit only'; srcSeven = 'Weekly limit only'
    scopedWeekly = 'Weekly · {0}'; scopedSession = 'Session · {0}'
    credits = 'Cloud session credits'; creditsLeft = '{0} of {1} remaining'; creditsExp = 'Expires {0}'
    nTitleThr = '{0}: {1} used'; nBodyThr = 'You passed the {0}% threshold. {1}.'
    nTitleReset = '{0} reset'; nBodyReset = 'The limit has reset: you can use Claude at full pace again.'
    nTitlePace = '{0}: ahead of pace'; nBodyPace = 'You are using it {0} points faster than time is passing.'
  }
}
$script:T = $script:Strings[$script:Lang]

# --- Colori (tema scuro, come il popup di Claude) ---
$ColBg = [System.Drawing.Color]::FromArgb(30, 30, 29)
$ColBorder = [System.Drawing.Color]::FromArgb(70, 70, 68)
$ColText = [System.Drawing.Color]::FromArgb(245, 244, 239)
$ColDim = [System.Drawing.Color]::FromArgb(150, 150, 145)
$ColTrack = [System.Drawing.Color]::FromArgb(58, 58, 56)
$ColBlue = [System.Drawing.Color]::FromArgb(59, 130, 246)
$ColGreen = [System.Drawing.Color]::FromArgb(76, 194, 122)
$ColRed = [System.Drawing.Color]::FromArgb(239, 91, 91)
$ColAmber = [System.Drawing.Color]::FromArgb(230, 160, 40)

# Colore del ritmo, stessa regola dell'icona: rosso sopra il ritmo, arancione
# da 0 a 5 punti sotto, verde oltre 5 punti sotto.
function Get-PaceColor($w) {
  $diff = $w.Percent - $w.Elapsed
  if ($diff -gt 0) { return $ColRed }
  if ($diff -ge -5) { return $ColAmber }
  return $ColGreen
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

# --- Lettura dei dati salvati dalla mod ---
function Get-LimitsData {
  $file = $null
  if (Test-Path $StoreDir) {
    $file = Get-ChildItem $StoreDir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'usage-time-bar_*.json' } |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
  }
  if ($null -eq $file) { return $null }

  try { $json = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } catch { return $null }
  $last = $json.lastLimits
  if ($null -eq $last -or $null -eq $last.windows) { return $null }

  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $windows = @()
  # 5 ore e settimanale, poi i limiti di un singolo modello ("Settimanale · Fable").
  $all = @($last.windows) + @($last.scoped | Where-Object { $null -ne $_ -and $_.name })
  foreach ($w in $all) {
    if ($w.kind -ne 'five_hour' -and $w.kind -ne 'seven_day') { continue }
    $dur = if ($w.kind -eq 'five_hour') { $FiveHourMs } else { $SevenDayMs }
    $resetMs = $null
    if ($w.resetsAt) { try { $resetMs = [DateTimeOffset]::Parse($w.resetsAt, [System.Globalization.CultureInfo]::InvariantCulture).ToUnixTimeMilliseconds() } catch { $resetMs = $null } }

    $elapsed = $null; $remaining = $null; $resetPassed = $false
    if ($null -ne $resetMs) {
      $start = $resetMs - $dur
      $elapsed = (Clamp01 (($now - $start) / [double]$dur)) * 100.0
      $remaining = [math]::Max(0, $resetMs - $now)
      $resetPassed = $now -ge $resetMs
    }

    $windows += [pscustomobject]@{
      Kind      = $w.kind
      Label     = [string]$w.label
      Name      = if ($w.name) { [string]$w.name } else { $null }
      Percent   = [double]$w.percentUsed
      ResetMs   = $resetMs
      Elapsed   = $elapsed
      Remaining = $remaining
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

  # Crediti a importo ("Crediti per sessioni cloud"), letti dal server dalla mod.
  $credits = @()
  foreach ($c in @($last.credits)) {
    if ($null -eq $c -or $null -eq $c.limit -or $null -eq $c.remaining) { continue }
    $expMs = $null
    if ($c.expiresAt) { try { $expMs = [DateTimeOffset]::Parse($c.expiresAt, [System.Globalization.CultureInfo]::InvariantCulture).ToUnixTimeMilliseconds() } catch { $expMs = $null } }
    $credits += [pscustomobject]@{
      Limit     = [double]$c.limit
      Used      = if ($null -ne $c.used) { [double]$c.used } else { [math]::Max(0, [double]$c.limit - [double]$c.remaining) }
      Remaining = [double]$c.remaining
      Currency  = if ($c.currency) { [string]$c.currency } else { 'USD' }
      ExpiresMs = $expMs
    }
  }

  return [pscustomobject]@{
    Windows   = $windows
    Credits   = $credits
    Context   = $ctx
    UpdatedMs = [DateTimeOffset]::new($file.LastWriteTimeUtc, [TimeSpan]::Zero).ToUnixTimeMilliseconds()
    IsStale   = ($now - [DateTimeOffset]::new($file.LastWriteTimeUtc, [TimeSpan]::Zero).ToUnixTimeMilliseconds()) -gt $StaleMs
  }
}

function Format-Money([double]$amount, [string]$currency) {
  $fmt = if ($amount -eq [math]::Floor($amount)) { '{0:0}' } else { '{0:0.00}' }
  return ([string]::Format($script:Culture, $fmt, $amount)) + ' ' + $currency
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

# --- Il popup ---
$script:Form = $null
$script:Data = $null

function Measure-PopupHeight($data) {
  $h = 14
  if ($null -ne $data.Context) { $h += 44 }
  $h += 22  # titolo "Limiti di utilizzo del piano"
  $h += $data.Windows.Count * 54
  $h += @($data.Credits).Count * 58
  $h += 8   # margine inferiore
  return $h
}

function Draw-Bar([System.Drawing.Graphics]$g, [int]$x, [int]$y, [int]$w, $win) {
  $trackBrush = New-Object System.Drawing.SolidBrush $ColTrack
  $g.FillRectangle($trackBrush, $x, $y, $w, 6)
  $usagePx = [int]([math]::Round((Clamp01 ($win.Percent / 100.0)) * $w))

  if ($null -ne $win.Elapsed -and -not $win.ResetPassed) {
    $elapsedFrac = Clamp01 ($win.Elapsed / 100.0)
    $diff = $win.Percent - $win.Elapsed
    $basePx = [int]([math]::Round([math]::Min((Clamp01 ($win.Percent/100.0)), $elapsedFrac) * $w))
    $hiPx = [int]([math]::Round([math]::Max((Clamp01 ($win.Percent/100.0)), $elapsedFrac) * $w))
    $blue = New-Object System.Drawing.SolidBrush $ColBlue
    $g.FillRectangle($blue, $x, $y, $basePx, 6)
    if ([math]::Abs($diff) -ge 0.5) {
      $segBrush = New-Object System.Drawing.SolidBrush (Get-PaceColor $win)
      $g.FillRectangle($segBrush, ($x + $basePx), $y, ($hiPx - $basePx), 6)
      $segBrush.Dispose()
    }
    # tacca del tempo trascorso
    $markX = $x + [int]([math]::Round($elapsedFrac * $w))
    $pen = New-Object System.Drawing.Pen ($ColText), 2
    $g.DrawLine($pen, $markX, ($y - 3), $markX, ($y + 9))
    $pen.Dispose(); $blue.Dispose()
  } else {
    $blue = New-Object System.Drawing.SolidBrush $ColBlue
    $g.FillRectangle($blue, $x, $y, $usagePx, 6)
    $blue.Dispose()
  }
  $trackBrush.Dispose()
}

$script:LogFile = Join-Path $env:TEMP 'claude-tray-error.log'
function On-Paint {
  param($sender, [System.Windows.Forms.PaintEventArgs]$e)
  try {
    On-PaintCore $sender $e
  } catch {
    try {
      ("[{0}] PAINT: {1}`n{2}" -f (Get-Date), $_.Exception.Message, $_.ScriptStackTrace) | Out-File -Append -Encoding utf8 $script:LogFile
      $e.Graphics.Clear([System.Drawing.Color]::FromArgb(30, 30, 29))
      $e.Graphics.DrawString(('Errore disegno: ' + $_.Exception.Message), (New-Object System.Drawing.Font('Segoe UI', 8)), [System.Drawing.Brushes]::White, 8, 8)
    } catch {}
  }
}
function On-PaintCore {
  param($sender, [System.Windows.Forms.PaintEventArgs]$e)
  $g = $e.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear($ColBg)
  $cw = [int]$sender.ClientSize.Width
  $pad = 14
  $barW = $cw - 2 * $pad

  $fTitle = New-Object System.Drawing.Font('Segoe UI', 8.5)
  $fName = New-Object System.Drawing.Font('Segoe UI', 9.5, [System.Drawing.FontStyle]::Bold)
  $fVal = New-Object System.Drawing.Font('Segoe UI', 9.5)
  $fSmall = New-Object System.Drawing.Font('Segoe UI', 8)
  $bText = New-Object System.Drawing.SolidBrush $ColText
  $bDim = New-Object System.Drawing.SolidBrush $ColDim
  $bGreen = New-Object System.Drawing.SolidBrush $ColGreen
  $bRed = New-Object System.Drawing.SolidBrush $ColRed
  $sfRight = New-Object System.Drawing.StringFormat
  $sfRight.Alignment = [System.Drawing.StringAlignment]::Far

  $t = $script:T
  $y = 10
  $data = $script:Data
  if ($null -eq $data) {
    $g.DrawString($t.noData1, $fVal, $bText, $pad, $y)
    $g.DrawString($t.noData2, $fSmall, $bDim, $pad, ($y + 22))
    return
  }

  if ($null -ne $data.Context) {
    $c = $data.Context
    $pct = if ($null -ne $c.Percent) { [int]$c.Percent } elseif ($null -ne $c.Tokens -and $c.Window -gt 0) { [int][math]::Round(($c.Tokens / $c.Window) * 100) } else { $null }
    $used = if ($null -ne $c.Tokens) { Format-Tokens $c.Tokens } else { '-' }
    $ctxRight = "$used / $(Format-Tokens $c.Window)" + $(if ($null -ne $pct) { " ($pct%)" } else { '' })
    $g.DrawString($t.context, $fTitle, $bDim, $pad, $y)
    $g.DrawString($ctxRight, $fTitle, $bDim, [single]($cw - $pad), [single]$y, $sfRight)
    $y += 20
    $ctxFrac = if ($null -ne $pct) { Clamp01 ($pct / 100.0) } else { 0 }
    $track = New-Object System.Drawing.SolidBrush $ColTrack
    $blue = New-Object System.Drawing.SolidBrush $ColBlue
    $g.FillRectangle($track, $pad, $y, $barW, 6)
    $g.FillRectangle($blue, $pad, $y, [int]([math]::Round($ctxFrac * $barW)), 6)
    $track.Dispose(); $blue.Dispose()
    $y += 22
  }

  $g.DrawString($t.title, $fTitle, $bDim, $pad, $y)
  $y += 20

  foreach ($win in $data.Windows) {
    $label = Get-WindowTitle $win
    $g.DrawString($label, $fName, $bText, $pad, $y)
    $right = (Reset-Text $win) + '   ' + (Format-Percent $win.Percent)
    $g.DrawString($right, $fVal, $bText, [single]($cw - $pad), [single]$y, $sfRight)
    $y += 22
    Draw-Bar $g $pad $y $barW $win
    $y += 14
    if ($null -ne $win.Elapsed -and -not $win.ResetPassed) {
      $diff = [math]::Round($win.Percent - $win.Elapsed)
      $bPace = New-Object System.Drawing.SolidBrush (Get-PaceColor $win)
      if ([math]::Abs($diff) -lt 1) {
        $g.DrawString($t.even, $fSmall, $bPace, [single]($cw - $pad), [single]$y, $sfRight)
      } elseif ($diff -gt 0) {
        $g.DrawString([string]::Format($t.ahead, $diff), $fSmall, $bPace, [single]($cw - $pad), [single]$y, $sfRight)
      } else {
        $g.DrawString([string]::Format($t.behind, [math]::Abs($diff)), $fSmall, $bPace, [single]($cw - $pad), [single]$y, $sfRight)
      }
      $bPace.Dispose()
    } elseif ($null -eq $win.ResetMs) {
      $g.DrawString($t.estNA, $fSmall, $bDim, $pad, $y)
    } elseif ($data.IsStale) {
      $g.DrawString($t.stale, $fSmall, $bDim, $pad, $y)
    }
    $y += 18
  }

  foreach ($c in @($data.Credits)) {
    $g.DrawString($t.credits, $fName, $bText, $pad, $y)
    $left = [string]::Format($t.creditsLeft, (Format-Money $c.Remaining $c.Currency), (Format-Money $c.Limit $c.Currency))
    $g.DrawString($left, $fVal, $bDim, [single]($cw - $pad), [single]$y, $sfRight)
    $y += 22
    $track = New-Object System.Drawing.SolidBrush $ColTrack
    $blue = New-Object System.Drawing.SolidBrush $ColBlue
    $g.FillRectangle($track, $pad, $y, $barW, 6)
    $usedFrac = if ($c.Limit -gt 0) { Clamp01 ($c.Used / $c.Limit) } else { 0 }
    $g.FillRectangle($blue, $pad, $y, [int]([math]::Round($usedFrac * $barW)), 6)
    $track.Dispose(); $blue.Dispose()
    $y += 14
    if ($null -ne $c.ExpiresMs) {
      $local = [DateTimeOffset]::FromUnixTimeMilliseconds([long]([math]::Round($c.ExpiresMs / 60000.0) * 60000)).LocalDateTime
      $g.DrawString([string]::Format($t.creditsExp, $local.ToString('d MMM HH:mm', $script:Culture)), $fSmall, $bDim, $pad, $y)
    }
    $y += 22
  }

  $borderPen = New-Object System.Drawing.Pen $ColBorder
  $g.DrawRectangle($borderPen, 0, 0, ($cw - 1), ([int]$sender.ClientSize.Height - 1))
  $borderPen.Dispose()
}

function Show-Popup {
  $script:Data = Get-LimitsData
  if ($null -eq $script:Form -or $script:Form.IsDisposed) {
    $script:Form = New-Object System.Windows.Forms.Form
    $script:Form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $script:Form.ShowInTaskbar = $false
    $script:Form.TopMost = $true
    $script:Form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $script:Form.BackColor = $ColBg
    $script:Form.Width = 384
    # doppio buffering per evitare lo sfarfallio
    $script:Form.GetType().GetProperty('DoubleBuffered', [System.Reflection.BindingFlags]'Instance,NonPublic').SetValue($script:Form, $true, $null)
    $script:Form.add_Paint({ param($s, $e) On-Paint $s $e })
    $script:Form.add_Deactivate({ $script:Form.Hide() })  # clic fuori → chiude
  }
  $h = if ($null -ne $script:Data) { Measure-PopupHeight $script:Data } else { 70 }
  $script:Form.Height = $h
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $script:Form.Left = $wa.Right - $script:Form.Width - 8
  $script:Form.Top = $wa.Bottom - $script:Form.Height - 8
  $script:Form.Invalidate()
  $script:Form.Show()
  $script:Form.Activate()
}

function Toggle-Popup {
  if ($null -ne $script:Form -and -not $script:Form.IsDisposed -and $script:Form.Visible) {
    $script:Form.Hide()
  } else {
    Show-Popup
  }
}

# --- Notifiche di Windows: soglie, ritmo e reset, una volta per finestra ---
# Impostazioni (menu del clic destro) e avvisi già inviati, in
# %APPDATA%\ClaudeLimitsTray\settings.json.
$script:SettingsDir = Join-Path $env:APPDATA 'ClaudeLimitsTray'
$script:SettingsFile = Join-Path $script:SettingsDir 'settings.json'
$script:Settings = [pscustomobject]@{ notifications = $true; thresholds = @(75, 90); paceAlertPts = 15; notified = @(); iconSource = 'both' }

function Load-Settings {
  try {
    if (Test-Path $script:SettingsFile) {
      $s = [System.IO.File]::ReadAllText($script:SettingsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
      foreach ($name in 'notifications', 'thresholds', 'paceAlertPts', 'notified', 'iconSource') {
        if ($null -ne $s.$name) { $script:Settings.$name = $s.$name }
      }
    }
  } catch { }
  $script:Settings.notified = @($script:Settings.notified)
  # both = il peggiore tra 5 ore e settimanale; five_hour / seven_day = solo quello
  if (@('both', 'five_hour', 'seven_day') -notcontains [string]$script:Settings.iconSource) { $script:Settings.iconSource = 'both' }
}

function Save-Settings {
  try {
    New-Item -ItemType Directory -Force $script:SettingsDir | Out-Null
    # Bastano gli ultimi avvisi: servono solo a non ripetere quelli della finestra in corso.
    $script:Settings.notified = @($script:Settings.notified | Select-Object -Last 60)
    [System.IO.File]::WriteAllText($script:SettingsFile, ($script:Settings | ConvertTo-Json -Depth 4), [System.Text.Encoding]::UTF8)
  } catch { }
}

function Get-WindowName($w) {
  return Get-WindowTitle $w
}

function Send-Notice([string]$key, [string]$title, [string]$body) {
  if ($script:Settings.notified -contains $key) { return }
  $script:Settings.notified = @($script:Settings.notified) + $key
  Save-Settings
  if (-not $script:Settings.notifications) { return }
  $notify.ShowBalloonTip(8000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Info)
}

function Check-Notifications {
  $data = $script:Data
  if ($null -eq $data) { return }
  $t = $script:T
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  foreach ($w in $data.Windows) {
    $name = Get-WindowName $w
    $id = "$($w.Kind)|$($w.Name)|$($w.ResetMs)"
    if ($w.ResetPassed) {
      # Reset avvenuto da poco (niente avvisi vecchi all'avvio del programma).
      if ($null -ne $w.ResetMs -and ($now - $w.ResetMs) -lt 6 * 3600000) {
        Send-Notice "reset|$id" ([string]::Format($t.nTitleReset, $name)) $t.nBodyReset
      }
      continue
    }
    if ($data.IsStale) { continue }
    # Solo la soglia più alta superata: niente raffica di avvisi all'avvio.
    $passed = @($script:Settings.thresholds | Where-Object { $w.Percent -ge $_ } | Sort-Object)
    if ($passed.Count -gt 0) {
      $thr = $passed[-1]
      foreach ($lower in $passed) {
        $k = "thr|$id|$lower"
        if ($lower -ne $thr -and $script:Settings.notified -notcontains $k) { $script:Settings.notified = @($script:Settings.notified) + $k }
      }
      Send-Notice "thr|$id|$thr" ([string]::Format($t.nTitleThr, $name, (Format-Percent $w.Percent))) ([string]::Format($t.nBodyThr, $thr, (Reset-Text $w)))
    }
    # Il ritmo è un preavviso: superata una soglia non serve più.
    if ($passed.Count -eq 0 -and $null -ne $w.Elapsed -and $script:Settings.paceAlertPts -gt 0) {
      $diff = [math]::Round($w.Percent - $w.Elapsed)
      if ($diff -ge $script:Settings.paceAlertPts) {
        Send-Notice "pace|$id" ([string]::Format($t.nTitlePace, $name)) ([string]::Format($t.nBodyPace, $diff))
      }
    }
  }
}

Load-Settings

# --- Icona nell'area di notifica ---
if (-not (Test-Path $IconPath)) {
  & (Join-Path $PSScriptRoot 'make-icon.ps1')
}
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = New-Object System.Drawing.Icon $IconPath
$notify.Text = $script:T.tip
$notify.Visible = $true
$notify.add_MouseClick({
  param($s, [System.Windows.Forms.MouseEventArgs]$e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Toggle-Popup }
})

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$miOpen = $menu.Items.Add($script:T.mShow)
$miOpen.add_Click({ Show-Popup })
$miRefresh = $menu.Items.Add($script:T.mRefresh)
$miRefresh.add_Click({ if ($null -ne $script:Form -and $script:Form.Visible) { Show-Popup } })
[void]$menu.Items.Add('-')
$miNotify = New-Object System.Windows.Forms.ToolStripMenuItem $script:T.mNotify
$miNotify.CheckOnClick = $true
$miNotify.Checked = [bool]$script:Settings.notifications
$miNotify.add_Click({ $script:Settings.notifications = $miNotify.Checked; Save-Settings })
[void]$menu.Items.Add($miNotify)
$miIconSource = New-Object System.Windows.Forms.ToolStripMenuItem $script:T.mIconSource
$script:IconSourceItems = @{}
foreach ($pair in @(@('both', $script:T.srcBoth), @('five_hour', $script:T.srcFive), @('seven_day', $script:T.srcSeven))) {
  $item = New-Object System.Windows.Forms.ToolStripMenuItem $pair[1]
  $item.Tag = $pair[0]
  $item.Checked = ($script:Settings.iconSource -eq $pair[0])
  $item.add_Click({
    param($sender, $e)
    $script:Settings.iconSource = [string]$sender.Tag
    Save-Settings
    foreach ($k in $script:IconSourceItems.Keys) { $script:IconSourceItems[$k].Checked = ($k -eq $script:Settings.iconSource) }
    $script:IconKey = ''
    Update-TrayIcon
  })
  $script:IconSourceItems[$pair[0]] = $item
  [void]$miIconSource.DropDownItems.Add($item)
}
[void]$menu.Items.Add($miIconSource)
[void]$menu.Items.Add('-')
$miExit = $menu.Items.Add($script:T.mQuit)
$miExit.add_Click({
  $notify.Visible = $false
  foreach ($h in $script:IconHandles) { [void][ClaudeTray.Native]::DestroyIcon($h) }
  $notify.Dispose()
  [System.Windows.Forms.Application]::Exit()
})
$notify.ContextMenuStrip = $menu

# Tempo reale: ogni secondo controlla se la mod ha riscritto il file dei dati
# (basta l'ora di modifica, nessuna lettura) e in quel caso ricarica subito;
# ogni 15 s ricarica comunque, per far avanzare il tempo trascorso.
$script:LastStamp = 0L
$script:LastFull = 0L

function Get-StoreStamp {
  if (-not (Test-Path $StoreDir)) { return 0L }
  $f = Get-ChildItem $StoreDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'usage-time-bar_*.json' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -eq $f) { return 0L }
  return $f.LastWriteTimeUtc.Ticks
}

function Update-Tooltip {
  $text = $script:T.tip
  if ($null -ne $script:Data) {
    $parts = foreach ($w in $script:Data.Windows) {
      $name = if ($w.Name) { $w.Name } elseif ($w.Kind -eq 'five_hour') { '5h' } else { '7d' }
      "$name $(Format-Percent $w.Percent)"
    }
    $text = 'Claude · ' + ($parts -join ' · ')
  }
  # NotifyIcon.Text accetta al massimo 63 caratteri.
  if ($text.Length -gt 63) { $text = $text.Substring(0, 63) }
  $notify.Text = $text
}

# --- Icona viva: lo stesso orologio di sempre, colorato secondo il ritmo ---
# Confronto tra utilizzo reale e tempo trascorso; di base guarda sia il limite di
# 5 ore sia il settimanale e mostra quello messo peggio (rosso > arancione >
# verde). Dal menu si può scegliere di guardarne uno solo.
#   verde     = più di 5 punti sotto il ritmo
#   arancione = da 0 a 5 punti sotto il ritmo (anche senza stima disponibile)
#   rosso     = sopra il ritmo
Add-Type -Namespace ClaudeTray -Name Native -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool DestroyIcon(System.IntPtr hIcon);'
$script:BaseIcon = $notify.Icon
$script:IconKey = 'base'
$script:IconHandles = @()

function New-ClockIcon([System.Drawing.Color]$fill) {
  # Stessa geometria di make-icon.ps1: cerchio pieno + due lancette bianche.
  $size = 32
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $br = New-Object System.Drawing.SolidBrush $fill
  $g.FillEllipse($br, 2, 2, ($size - 4), ($size - 4))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 2.4
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $cx = $size / 2; $cy = $size / 2
  $g.DrawLine($pen, $cx, $cy, $cx, ($cy - 8))
  $g.DrawLine($pen, $cx, $cy, ($cx + 6), ($cy + 1))
  $h = $bmp.GetHicon()
  $script:IconHandles += $h
  $icon = [System.Drawing.Icon]::FromHandle($h)
  $pen.Dispose(); $br.Dispose(); $g.Dispose(); $bmp.Dispose()
  return $icon
}

$script:PaceIcons = @{
  green  = New-ClockIcon ([System.Drawing.Color]::FromArgb(46, 160, 67))
  orange = New-ClockIcon ([System.Drawing.Color]::FromArgb(217, 119, 87))
  red    = New-ClockIcon ([System.Drawing.Color]::FromArgb(218, 54, 51))
}

function Get-PaceState($w) {
  if ($null -eq $w -or $null -eq $w.Elapsed -or $w.ResetPassed) { return 'base' }
  $diff = $w.Percent - $w.Elapsed   # punti: > 0 sopra il ritmo, < 0 sotto
  if ($diff -gt 0) { return 'red' }
  if ($diff -ge -5) { return 'orange' }
  return 'green'
}

$script:PaceRank = @{ base = 0; green = 1; orange = 2; red = 3 }

function Get-IconState {
  if ($null -eq $script:Data) { return 'base' }
  $kinds = if ($script:Settings.iconSource -eq 'both') { @('five_hour', 'seven_day') } else { @([string]$script:Settings.iconSource) }
  $worst = 'base'
  foreach ($kind in $kinds) {
    # Solo i limiti generali: quelli di un singolo modello (es. Fable) hanno un nome.
    $w = $script:Data.Windows | Where-Object { $_.Kind -eq $kind -and -not $_.Name } | Select-Object -First 1
    $state = Get-PaceState $w
    if ($script:PaceRank[$state] -gt $script:PaceRank[$worst]) { $worst = $state }
  }
  return $worst
}

function Update-TrayIcon {
  $state = Get-IconState
  if ($state -eq $script:IconKey) { return }
  $notify.Icon = if ($state -eq 'base') { $script:BaseIcon } else { $script:PaceIcons[$state] }
  $script:IconKey = $state
}

function Refresh-Live([bool]$force) {
  $stamp = Get-StoreStamp
  $nowTicks = [DateTime]::UtcNow.Ticks
  $periodic = ($nowTicks - $script:LastFull) -ge [TimeSpan]::FromSeconds(15).Ticks
  if (-not $force -and $stamp -eq $script:LastStamp -and -not $periodic) { return }
  $script:LastStamp = $stamp
  $script:LastFull = $nowTicks
  $script:Data = Get-LimitsData
  Update-Tooltip
  try { Update-TrayIcon } catch {
    ("[{0}] ICON: {1}" -f (Get-Date), $_.Exception.Message) | Out-File -Append -Encoding utf8 $script:LogFile
  }
  try { Check-Notifications } catch {
    ("[{0}] NOTIFY: {1}" -f (Get-Date), $_.Exception.Message) | Out-File -Append -Encoding utf8 $script:LogFile
  }
  if ($null -ne $script:Form -and -not $script:Form.IsDisposed -and $script:Form.Visible) {
    $h = if ($null -ne $script:Data) { Measure-PopupHeight $script:Data } else { 70 }
    $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $script:Form.Height = $h
    $script:Form.Top = $wa.Bottom - $script:Form.Height - 8
    $script:Form.Invalidate()
  }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.add_Tick({
  try { Refresh-Live $false } catch {
    ("[{0}] LIVE: {1}" -f (Get-Date), $_.Exception.Message) | Out-File -Append -Encoding utf8 $script:LogFile
  }
})
$timer.Start()
Refresh-Live $true

$ctx = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($ctx)
