# Claude Limits Tray — icona nella barra delle applicazioni (area di notifica)
# che apre un popup con i limiti di utilizzo nello stile chiesto dall'utente.
#
# I dati arrivano da Claude tramite la mod "usage-time-bar": questa legge le
# risposte dell'API e salva l'ultimo stato (percentuali, orari di reset, finestra
# di contesto) in ~\.claude\plugins\store\usage-time-bar_*.json. Il programma
# legge quel file: niente credenziali, nessuna modifica all'app di Claude.
# L'unica richiesta di rete è il controllo delle nuove versioni su GitHub
# (pagina pubblica delle release), che si spegne dalle impostazioni.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

. (Join-Path $PSScriptRoot 'lib\TrayCore.ps1')
Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -Path (Join-Path $PSScriptRoot 'lib\TrayNative.cs')

# Una sola copia in esecuzione.
$createdNew = $false
$script:Mutex = New-Object System.Threading.Mutex($true, 'Local\ClaudeLimitsTray', [ref]$createdNew)
if (-not $createdNew) { return }

# Testo nitido a 125-150% e su più monitor: va fatto prima di ogni finestra.
$script:DpiMode = [ClaudeTrayUi.Native]::EnableDpiAwareness()
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:RepoRoot = Split-Path -Parent $PSScriptRoot
$script:StoreDir = Join-Path $env:USERPROFILE '.claude\plugins\store'
$script:ClaudeHistoryFile = Join-Path $env:APPDATA 'Claude\plan-usage-history.json'
$script:IconPath = Join-Path $PSScriptRoot 'claude-limits.ico'
$script:DataDir = Join-Path $env:APPDATA 'ClaudeLimitsTray'
$script:SettingsFile = Join-Path $script:DataDir 'settings.json'
$script:HistoryFile = Join-Path $script:DataDir 'history.json'
$script:UpdateResultFile = Join-Path $script:DataDir 'update-result.json'
$script:LogFile = Join-Path $env:TEMP 'claude-tray-error.log'
$script:ReleaseApi = 'https://api.github.com/repos/Aledallas01/claude-usage-bar-mod/releases/latest'

function Write-TrayLog([string]$what, $err) {
  try {
    $msg = if ($err -is [System.Management.Automation.ErrorRecord]) { $err.Exception.Message + "`n" + $err.ScriptStackTrace } else { [string]$err }
    ("[{0}] {1}: {2}" -f (Get-Date), $what, $msg) | Out-File -Append -Encoding utf8 $script:LogFile
  } catch { }
}

Set-TrayLanguage $(if ([System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName -ieq 'it') { 'it' } else { 'en' })

# --- Colori (tema scuro, come il popup di Claude) ---
$ColBg = [System.Drawing.Color]::FromArgb(30, 30, 29)
$ColPanel = [System.Drawing.Color]::FromArgb(40, 40, 38)
$ColField = [System.Drawing.Color]::FromArgb(45, 45, 43)
$ColBorder = [System.Drawing.Color]::FromArgb(70, 70, 68)
$ColText = [System.Drawing.Color]::FromArgb(245, 244, 239)
$ColDim = [System.Drawing.Color]::FromArgb(150, 150, 145)
$ColTrack = [System.Drawing.Color]::FromArgb(58, 58, 56)
$ColBlue = [System.Drawing.Color]::FromArgb(59, 130, 246)
$ColGreen = [System.Drawing.Color]::FromArgb(76, 194, 122)
$ColRed = [System.Drawing.Color]::FromArgb(239, 91, 91)
$ColAmber = [System.Drawing.Color]::FromArgb(230, 160, 40)
$ColAccent = [System.Drawing.Color]::FromArgb(217, 119, 87)

# Font in pixel (a 96 DPI): il disegno viene poi scalato per il monitor.
function New-PxFont([double]$pt, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular, [double]$scale = 1.0) {
  return New-Object System.Drawing.Font('Segoe UI', [single]($pt * 96.0 / 72.0 * $scale), $style, [System.Drawing.GraphicsUnit]::Pixel)
}

# Scala del monitor sotto il mouse (1 = 100%, 1.25, 1.5 ...).
function Get-ScaleAt([System.Drawing.Point]$p) { return [ClaudeTrayUi.Native]::DpiAt($p.X, $p.Y) / 96.0 }

# Angolo vicino alla barra delle applicazioni del monitor che contiene $p.
function Get-CornerPlacement([System.Drawing.Point]$p, [int]$w, [int]$h, [double]$scale) {
  $screen = [System.Windows.Forms.Screen]::FromPoint($p)
  $wa = $screen.WorkingArea; $b = $screen.Bounds
  $m = [int][math]::Round(8 * $scale)
  $left = $wa.Right - $w - $m; $top = $wa.Bottom - $h - $m
  if ($wa.Top -gt $b.Top) { $top = $wa.Top + $m }             # barra in alto
  elseif ($wa.Left -gt $b.Left) { $left = $wa.Left + $m }      # barra a sinistra
  return New-Object System.Drawing.Rectangle($left, $top, $w, $h)
}

# --- Impostazioni ---
function Load-Settings {
  $raw = $null
  try { if (Test-Path $script:SettingsFile) { $raw = [System.IO.File]::ReadAllText($script:SettingsFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json } } catch { }
  $script:Settings = ConvertTo-TraySettings $raw
}

function Save-Settings {
  try {
    New-Item -ItemType Directory -Force $script:DataDir | Out-Null
    # Bastano gli ultimi avvisi: servono solo a non ripetere quelli della finestra in corso.
    $script:Settings.notified = @($script:Settings.notified | Select-Object -Last 80)
    [System.IO.File]::WriteAllText($script:SettingsFile, ($script:Settings | ConvertTo-Json -Depth 4), [System.Text.Encoding]::UTF8)
  } catch { Write-TrayLog 'SETTINGS' $_ }
}

Load-Settings

# --- Storico (grafico) ---
$script:OwnHistory = @()
$script:ClaudeHistory = @()
$script:ClaudeHistoryStamp = 0L
try {
  if (Test-Path $script:HistoryFile) { $script:OwnHistory = @(([System.IO.File]::ReadAllText($script:HistoryFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json).samples) }
} catch { $script:OwnHistory = @() }

function Update-History {
  $before = @($script:OwnHistory).Count
  $script:OwnHistory = @(Add-HistorySamples $script:OwnHistory $script:Data (Get-NowMs))
  if ($script:OwnHistory.Count -ne $before) {
    try {
      New-Item -ItemType Directory -Force $script:DataDir | Out-Null
      $json = [pscustomobject]@{ version = 1; samples = $script:OwnHistory } | ConvertTo-Json -Depth 4 -Compress
      [System.IO.File]::WriteAllText($script:HistoryFile, $json, [System.Text.Encoding]::UTF8)
    } catch { Write-TrayLog 'HISTORY' $_ }
  }
  # Storico di Claude Desktop: riletto solo quando cambia.
  try {
    if (Test-Path $script:ClaudeHistoryFile) {
      $stamp = (Get-Item $script:ClaudeHistoryFile).LastWriteTimeUtc.Ticks
      if ($stamp -ne $script:ClaudeHistoryStamp) {
        $script:ClaudeHistoryStamp = $stamp
        $script:ClaudeHistory = @(([System.IO.File]::ReadAllText($script:ClaudeHistoryFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json).samples)
      }
    }
  } catch { $script:ClaudeHistory = @() }
}

# --- Il popup ---
$script:Form = $null
$script:Data = $null
$script:Scale = 1.0
$script:HiddenAt = [datetime]::MinValue
$PopupWidth = 384
$GraphHeight = 34

# Il grafico c'è solo per 5 ore e settimanale con il reset noto.
function Test-CanGraph($w) { return -not $w.Name -and $null -ne $w.StartMs -and -not $w.ResetPassed }
function Test-HasGraph($w) { return $script:Settings.showGraph -and (Test-CanGraph $w) }

# Pulsante "Mostra grafici" accanto al titolo (coordinate a 96 DPI).
$script:GraphBtn = [System.Drawing.RectangleF]::Empty
$script:GraphBtnHover = $false

function Draw-GraphButton([System.Drawing.Graphics]$g, [single]$right, [single]$y, [System.Drawing.Font]$font) {
  $text = if ($script:Settings.showGraph) { $script:T.gHide } else { $script:T.gShow }
  $tw = $g.MeasureString($text, $font).Width
  $w = [single]($tw + 30); $h = [single]18
  $r = New-Object System.Drawing.RectangleF(($right - $w), ($y - 1), $w, $h)
  $script:GraphBtn = $r
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $h
  $path.AddArc($r.Left, $r.Top, $d, $d, 90, 180)
  $path.AddArc(($r.Right - $d), $r.Top, $d, $d, 270, 180)
  $path.CloseFigure()
  $fill = New-Object System.Drawing.SolidBrush $(if ($script:GraphBtnHover) { $ColTrack } else { $ColField })
  $pen = New-Object System.Drawing.Pen $(if ($script:Settings.showGraph) { $ColAccent } else { $ColBorder })
  $g.FillPath($fill, $path); $g.DrawPath($pen, $path)
  # tre barrette: l'icona del grafico
  $bars = New-Object System.Drawing.SolidBrush $(if ($script:Settings.showGraph) { $ColAccent } else { $ColDim })
  $bx = $r.Left + 8; $by = $r.Bottom - 5
  foreach ($i in 0, 1, 2) { $bh = 3 + 2.5 * $i; $g.FillRectangle($bars, [single]($bx + $i * 3.2), [single]($by - $bh), [single]2.2, [single]$bh) }
  $tb = New-Object System.Drawing.SolidBrush $ColText
  $g.DrawString($text, $font, $tb, ($r.Left + 18), ($r.Top + 1.5))
  foreach ($o in $fill, $pen, $bars, $tb, $path) { $o.Dispose() }
}

function Switch-Graphs {
  $script:Settings.showGraph = -not $script:Settings.showGraph
  Save-Settings
  Place-Popup
  $script:Form.Invalidate()
}

function Measure-PopupHeight($data) {
  if ($null -eq $data) { return 70 }
  $h = 14
  if ($null -ne $data.Context) { $h += 44 }
  $h += 22  # titolo "Limiti di utilizzo del piano"
  foreach ($w in $data.Windows) { $h += 54; if (Test-HasGraph $w) { $h += $GraphHeight + 14 } }
  $h += @($data.Credits).Count * 58
  $h += 8   # margine inferiore
  return $h
}

function Get-PaceColor($w) {
  switch (Get-PaceState $w $script:Settings) { 'red' { return $ColRed } 'green' { return $ColGreen } default { return $ColAmber } }
}

function Draw-Bar([System.Drawing.Graphics]$g, [int]$x, [int]$y, [int]$w, $win) {
  $trackBrush = New-Object System.Drawing.SolidBrush $ColTrack
  $g.FillRectangle($trackBrush, $x, $y, $w, 6)
  $usagePx = [int]([math]::Round((Clamp01 ($win.Percent / 100.0)) * $w))
  $blue = New-Object System.Drawing.SolidBrush $ColBlue
  if ($null -ne $win.Elapsed -and -not $win.ResetPassed) {
    $elapsedFrac = Clamp01 ($win.Elapsed / 100.0)
    $diff = $win.Percent - $win.Elapsed
    $basePx = [int]([math]::Round([math]::Min((Clamp01 ($win.Percent / 100.0)), $elapsedFrac) * $w))
    $hiPx = [int]([math]::Round([math]::Max((Clamp01 ($win.Percent / 100.0)), $elapsedFrac) * $w))
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
    $pen.Dispose()
  } else {
    $g.FillRectangle($blue, $x, $y, $usagePx, 6)
  }
  $blue.Dispose(); $trackBrush.Dispose()
}

# Mini grafico della finestra: utilizzo reale nel tempo (blu) contro il ritmo
# ideale (diagonale tratteggiata da 0% all'inizio a 100% al reset).
function Draw-Graph([System.Drawing.Graphics]$g, [int]$x, [int]$y, [int]$w, [int]$h, $win) {
  $now = Get-NowMs
  $start = [double]$win.StartMs
  $span = [double]$win.ResetMs - $start
  if ($span -le 0) { return }
  $panel = New-Object System.Drawing.SolidBrush $ColPanel
  $g.FillRectangle($panel, $x, $y, $w, $h)
  $panel.Dispose()
  $px = { param([double]$t) [single]($x + (Clamp01 (($t - $start) / $span)) * $w) }
  $py = { param([double]$p) [single]($y + $h - (Clamp01 ($p / 100.0)) * $h) }

  # ritmo ideale
  $ideal = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(140, $ColDim)), 1
  $ideal.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
  $g.DrawLine($ideal, [single]$x, [single]($y + $h), [single]($x + $w), [single]$y)
  $ideal.Dispose()

  # utilizzo reale
  $series = @(Get-HistorySeries $win $script:OwnHistory $script:ClaudeHistory $now)
  if ($series.Count -ge 2) {
    $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    foreach ($p in $series) { $pts.Add((New-Object System.Drawing.PointF((& $px $p.T), (& $py $p.P)))) }
    $last = $pts[$pts.Count - 1]
    $area = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    $area.AddRange($pts)
    $area.Add((New-Object System.Drawing.PointF($last.X, [single]($y + $h))))
    $area.Add((New-Object System.Drawing.PointF([single]$x, [single]($y + $h))))
    $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(55, $ColBlue))
    $g.FillPolygon($fill, $area.ToArray())
    $fill.Dispose()
    $line = New-Object System.Drawing.Pen $ColBlue, 1.6
    $line.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawLines($line, $pts.ToArray())
    $line.Dispose()
    $dot = New-Object System.Drawing.SolidBrush (Get-PaceColor $win)
    $g.FillEllipse($dot, [single]($last.X - 2.5), [single]($last.Y - 2.5), [single]5, [single]5)
    $dot.Dispose()
  }

  # adesso
  $nowX = & $px $now
  $nowPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, $ColText)), 1
  $nowPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dot
  $g.DrawLine($nowPen, $nowX, [single]$y, $nowX, [single]($y + $h))
  $nowPen.Dispose()
}

function On-Paint {
  param($sender, [System.Windows.Forms.PaintEventArgs]$e)
  try {
    On-PaintCore $sender $e
  } catch {
    try {
      Write-TrayLog 'PAINT' $_
      $e.Graphics.ResetTransform()
      $e.Graphics.Clear($ColBg)
      $e.Graphics.DrawString(('Errore disegno: ' + $_.Exception.Message), (New-PxFont 8 -scale $script:Scale), [System.Drawing.Brushes]::White, 8, 8)
    } catch {}
  }
}

function On-PaintCore {
  param($sender, [System.Windows.Forms.PaintEventArgs]$e)
  $g = $e.Graphics
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear($ColBg)
  # Tutto è disegnato a 96 DPI e scalato per il monitor (125%, 150% ...).
  $s = [single]$script:Scale
  $g.ScaleTransform($s, $s)
  $cw = [int][math]::Round($sender.ClientSize.Width / $s)
  $ch = [int][math]::Round($sender.ClientSize.Height / $s)
  $pad = 14
  $barW = $cw - 2 * $pad

  $fTitle = New-PxFont 8.5
  $fName = New-PxFont 9.5 ([System.Drawing.FontStyle]::Bold)
  $fVal = New-PxFont 9.5
  $fSmall = New-PxFont 8
  $bText = New-Object System.Drawing.SolidBrush $ColText
  $bDim = New-Object System.Drawing.SolidBrush $ColDim
  $sfRight = New-Object System.Drawing.StringFormat
  $sfRight.Alignment = [System.Drawing.StringAlignment]::Far

  $t = $script:T
  $y = 10
  $data = $script:Data
  if ($null -eq $data) {
    $g.DrawString($t.noData1, $fVal, $bText, $pad, $y)
    $g.DrawString($t.noData2, $fSmall, $bDim, $pad, ($y + 22))
  } else {
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
    $script:GraphBtn = [System.Drawing.RectangleF]::Empty
    if (@($data.Windows | Where-Object { Test-CanGraph $_ }).Count -gt 0) {
      Draw-GraphButton $g ([single]($cw - $pad)) ([single]$y) $fSmall
    }
    $y += 20

    foreach ($win in $data.Windows) {
      $g.DrawString((Get-WindowTitle $win), $fName, $bText, $pad, $y)
      $right = (Reset-Text $win) + '   ' + (Format-Percent $win.Percent)
      $g.DrawString($right, $fVal, $bText, [single]($cw - $pad), [single]$y, $sfRight)
      $y += 22
      Draw-Bar $g $pad $y $barW $win
      $y += 14
      if ($null -ne $win.Elapsed -and -not $win.ResetPassed) {
        $diff = [math]::Round($win.Percent - $win.Elapsed)
        $bPace = New-Object System.Drawing.SolidBrush (Get-PaceColor $win)
        $text = if ([math]::Abs($diff) -lt 1) { $t.even } elseif ($diff -gt 0) { [string]::Format($t.ahead, $diff) } else { [string]::Format($t.behind, [math]::Abs($diff)) }
        $g.DrawString($text, $fSmall, $bPace, [single]($cw - $pad), [single]$y, $sfRight)
        $bPace.Dispose()
      } elseif ($null -eq $win.ResetMs) {
        $g.DrawString($t.estNA, $fSmall, $bDim, $pad, $y)
      } elseif ($data.IsStale) {
        $g.DrawString($t.stale, $fSmall, $bDim, $pad, $y)
      }
      $y += 18
      if (Test-HasGraph $win) {
        Draw-Graph $g $pad ($y + 2) $barW $GraphHeight $win
        $y += $GraphHeight + 14
      }
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
  }

  $g.ResetTransform()
  $borderPen = New-Object System.Drawing.Pen $ColBorder
  $g.DrawRectangle($borderPen, 0, 0, ($sender.ClientSize.Width - 1), ($sender.ClientSize.Height - 1))
  $borderPen.Dispose()
  foreach ($o in $fTitle, $fName, $fVal, $fSmall, $bText, $bDim, $sfRight) { $o.Dispose() }
}

# Dimensioni e posizione: scala del monitor sotto il mouse, angolo vicino alla
# barra delle applicazioni di quel monitor.
function Place-Popup {
  $s = $script:Scale
  $w = [int][math]::Round($PopupWidth * $s)
  $h = [int][math]::Round((Measure-PopupHeight $script:Data) * $s)
  $script:Form.Bounds = Get-CornerPlacement $script:PopupAnchor $w $h $s
}

function Show-Popup {
  $script:Data = Get-LimitsData $script:StoreDir
  Update-History
  $script:PopupAnchor = [System.Windows.Forms.Cursor]::Position
  $script:Scale = Get-ScaleAt $script:PopupAnchor
  if ($null -eq $script:Form -or $script:Form.IsDisposed) {
    $script:Form = New-Object System.Windows.Forms.Form
    $script:Form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
    $script:Form.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
    $script:Form.ShowInTaskbar = $false
    $script:Form.TopMost = $true
    $script:Form.KeyPreview = $true
    $script:Form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
    $script:Form.BackColor = $ColBg
    # doppio buffering per evitare lo sfarfallio
    $script:Form.GetType().GetProperty('DoubleBuffered', [System.Reflection.BindingFlags]'Instance,NonPublic').SetValue($script:Form, $true, $null)
    $script:Form.add_Paint({ param($s, $e) On-Paint $s $e })
    $script:Form.add_Deactivate({ $script:HiddenAt = [datetime]::UtcNow; $script:Form.Hide() })  # clic fuori → chiude
    $script:Form.add_KeyDown({ param($s, $e) if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) { $script:Form.Hide() } })
    $script:Form.add_Shown({ param($s, $e) [ClaudeTrayUi.Dwm]::Round($s.Handle) })
    $script:Form.add_MouseMove({
      param($s, $e)
      $over = $script:GraphBtn.Contains([single]($e.X / $script:Scale), [single]($e.Y / $script:Scale))
      if ($over -ne $script:GraphBtnHover) {
        $script:GraphBtnHover = $over
        $s.Cursor = if ($over) { [System.Windows.Forms.Cursors]::Hand } else { [System.Windows.Forms.Cursors]::Default }
        $s.Invalidate()
      }
    })
    $script:Form.add_MouseLeave({ param($s, $e) if ($script:GraphBtnHover) { $script:GraphBtnHover = $false; $s.Cursor = [System.Windows.Forms.Cursors]::Default; $s.Invalidate() } })
    $script:Form.add_MouseClick({
      param($s, $e)
      if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left -and $script:GraphBtn.Contains([single]($e.X / $script:Scale), [single]($e.Y / $script:Scale))) {
        try { Switch-Graphs } catch { Write-TrayLog 'GRAPH' $_ }
      }
    })
  }
  Place-Popup
  $script:Form.Invalidate()
  $script:Form.Show()
  $script:Form.Activate()
  [void][ClaudeTrayUi.Native]::SetForegroundWindow($script:Form.Handle)
}

function Toggle-Popup([bool]$fromHotkey) {
  if ($null -ne $script:Form -and -not $script:Form.IsDisposed -and $script:Form.Visible) {
    $script:Form.Hide()
    return
  }
  # Il clic sull'icona chiude il popup (perde il focus) un attimo prima di
  # arrivare qui: in quel caso non va riaperto.
  if (-not $fromHotkey -and ([datetime]::UtcNow - $script:HiddenAt).TotalMilliseconds -lt 300) { return }
  Show-Popup
}

# --- Icona nell'area di notifica ---
if (-not (Test-Path $script:IconPath)) {
  & (Join-Path $PSScriptRoot 'make-icon.ps1')
}
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = New-Object System.Drawing.Icon $script:IconPath
$notify.Text = $script:T.tip
$notify.Visible = $true
$notify.add_MouseClick({
  param($s, [System.Windows.Forms.MouseEventArgs]$e)
  if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Toggle-Popup $false }
})

# Avvisi: uno alla volta. $script:BalloonAction dice cosa fare al clic.
$script:BalloonAction = $null
function Show-Balloon([string]$title, [string]$body, [string]$action = $null) {
  $script:BalloonAction = $action
  $notify.ShowBalloonTip(8000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Info)
}
$notify.add_BalloonTipClicked({ if ($script:BalloonAction -eq 'update') { Start-SelfUpdate } elseif ($script:BalloonAction -eq 'popup') { Show-Popup } })
$notify.add_BalloonTipClosed({ $script:BalloonAction = $null })

# --- Notifiche di Windows: soglie, ritmo, reset, "usalo o lo perdi" ---
function Check-Notifications {
  $result = Get-Notices $script:Data $script:Settings (Get-NowMs)
  $changed = $false
  foreach ($k in $result.Mark) { $script:Settings.notified = @($script:Settings.notified) + $k; $changed = $true }
  if (-not $script:Settings.notifications) {
    # Spente: li segno come già visti, così riaccendendole non arriva una raffica.
    foreach ($n in $result.Send) { $script:Settings.notified = @($script:Settings.notified) + $n.Key; $changed = $true }
  } elseif ($result.Send.Count -gt 0 -and -not (Test-QuietTime (Get-Date) $script:Settings)) {
    # Non disturbare: restano in attesa e arrivano alla fine della fascia, se valgono ancora.
    $n = $result.Send[0]
    $script:Settings.notified = @($script:Settings.notified) + $n.Key
    $changed = $true
    Show-Balloon $n.Title $n.Body 'popup'
  }
  if ($changed) { Save-Settings }
}

# --- Icona viva: lo stesso orologio di sempre, colorato secondo il ritmo ---
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

function Update-TrayIcon {
  $state = Get-IconState $script:Data $script:Settings
  if ($state -eq $script:IconKey) { return }
  $notify.Icon = if ($state -eq 'base') { $script:BaseIcon } else { $script:PaceIcons[$state] }
  $script:IconKey = $state
}

function Get-SummaryText {
  if ($null -eq $script:Data) { return $script:T.tip }
  $parts = foreach ($w in $script:Data.Windows) {
    $name = if ($w.Name) { $w.Name } elseif ($w.Kind -eq 'five_hour') { '5h' } else { '7d' }
    "$name $(Format-Percent $w.Percent)"
  }
  return 'Claude · ' + ($parts -join ' · ')
}

function Update-Tooltip {
  $text = Get-SummaryText
  # NotifyIcon.Text accetta al massimo 63 caratteri.
  if ($text.Length -gt 63) { $text = $text.Substring(0, 63) }
  $notify.Text = $text
}

# --- Scorciatoia da tastiera (di base Ctrl+Alt+L) ---
$script:HotKey = New-Object ClaudeTrayUi.HotKeyWindow
$script:HotKey.add_Pressed({ try { Toggle-Popup $true } catch { Write-TrayLog 'HOTKEY' $_ } })

function Register-TrayHotkey([bool]$warn) {
  $script:HotKey.Unregister()
  if (-not $script:Settings.hotkeyEnabled) { return }
  $hk = ConvertFrom-HotkeyText $script:Settings.hotkey
  if ($null -eq $hk) { return }
  if (-not $script:HotKey.Register([uint32]$hk.Mods, [uint32]$hk.Vk) -and $warn) {
    Show-Balloon $script:T.nTitleHotkey ([string]::Format($script:T.nBodyHotkey, $script:Settings.hotkey))
  }
}

# --- Aggiornamenti da GitHub ---
# Versione installata: la più alta tra quella della mod (plugin.json) e l'ultimo
# tag della cartella git. La release più recente si legge dalla pagina pubblica
# delle release; nessun dato dell'utente viene inviato.
function Invoke-Hidden([string]$exe, [string]$arguments) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo $exe, $arguments
  $psi.CreateNoWindow = $true
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEnd()
  [void]$p.WaitForExit(5000)
  if ($p.ExitCode -ne 0) { return $null }
  return $out.Trim()
}

function Get-LocalVersion {
  $best = $null
  try { $best = [string]((Get-Content (Join-Path $script:RepoRoot 'plugin\.claude-plugin\plugin.json') -Raw | ConvertFrom-Json).version) } catch { }
  try {
    if (Test-Path (Join-Path $script:RepoRoot '.git')) {
      $tag = Invoke-Hidden 'git' ('-C "' + $script:RepoRoot + '" describe --tags --abbrev=0')
      if ($tag -and (Test-NewerVersion $tag $best)) { $best = $tag }
    }
  } catch { }
  $v = ConvertTo-TrayVersion $best
  if ($null -eq $v) { return '?' }
  return 'v' + $v.ToString(3)
}

$script:LocalVersion = Get-LocalVersion
$script:Update = $null          # release più nuova: @{ Tag; Url }
$script:UpdateTask = $null      # richiesta in corso
$script:UpdateStatus = ''       # testo per la finestra delle impostazioni
$script:NextUpdateCheck = [datetime]::UtcNow.AddSeconds(20)

function Start-UpdateCheck {
  if ($null -ne $script:UpdateTask) { return }
  try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12
    $wc = New-Object System.Net.WebClient
    $wc.Headers['User-Agent'] = 'ClaudeLimitsTray'
    $wc.Headers['Accept'] = 'application/vnd.github+json'
    # Nessun callback su altri thread: il risultato si legge dal timer.
    $script:UpdateTask = $wc.DownloadStringTaskAsync($script:ReleaseApi)
    $script:UpdateStatus = $script:T.sChecking
  } catch {
    $script:UpdateStatus = $script:T.sCheckFail
    Write-TrayLog 'UPDATE' $_
  }
}

function Complete-UpdateCheck {
  $task = $script:UpdateTask
  if ($null -eq $task -or -not $task.IsCompleted) { return }
  $script:UpdateTask = $null
  if ($task.IsFaulted -or $task.IsCanceled) {
    $script:UpdateStatus = $script:T.sCheckFail
    if ($task.Exception) { Write-TrayLog 'UPDATE' $task.Exception.GetBaseException().Message }
    return
  }
  $rel = ConvertFrom-ReleaseJson $task.Result
  if ($null -eq $rel) { $script:UpdateStatus = $script:T.sCheckFail; return }
  if (Test-NewerVersion $rel.Tag $script:LocalVersion) {
    $script:Update = $rel
    $script:UpdateStatus = [string]::Format($script:T.sAvailable, $rel.Tag)
    $script:MiUpdate.Text = [string]::Format($script:T.mUpdateTo, $rel.Tag)
    $script:MiUpdate.Visible = $true
    $script:MiUpdateSep.Visible = $true
    $key = "update|$($rel.Tag)"
    if ($script:Settings.notified -notcontains $key -and $script:Settings.notifications -and -not (Test-QuietTime (Get-Date) $script:Settings)) {
      $script:Settings.notified = @($script:Settings.notified) + $key
      Save-Settings
      Show-Balloon ([string]::Format($script:T.nTitleUpdate, $rel.Tag)) ([string]::Format($script:T.nBodyUpdate, $rel.Tag)) 'update'
    }
  } else {
    $script:Update = $null
    $script:UpdateStatus = $script:T.sUpToDate
    $script:MiUpdate.Visible = $false
    $script:MiUpdateSep.Visible = $false
  }
}

# Un clic: chiude il programma e lascia fare a self-update.ps1 (git pull,
# aggiornamento della mod con backup, nuovo .exe, riavvio del programma).
function Start-SelfUpdate {
  if ($null -eq $script:Update) { return }
  if (-not (Test-Path (Join-Path $script:RepoRoot '.git'))) {
    Start-Process $script:Update.Url
    Show-Balloon $script:T.nTitleUpdateFail $script:T.updNoGit
    return
  }
  $updater = Join-Path $PSScriptRoot 'self-update.ps1'
  $arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -TrayPid {1} -Target "{2}"' -f $updater, $PID, $script:Update.Tag
  Start-Process 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden
  Exit-Tray
}

function Show-UpdateResult {
  if (-not (Test-Path $script:UpdateResultFile)) { return }
  try {
    $r = [System.IO.File]::ReadAllText($script:UpdateResultFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    Remove-Item -LiteralPath $script:UpdateResultFile -Force
    if ($r.ok) { Show-Balloon ([string]::Format($script:T.nTitleUpdated, $r.target)) $script:T.nBodyUpdated }
    else { Show-Balloon $script:T.nTitleUpdateFail ([string]::Format($script:T.nBodyUpdateFail, $r.message)) }
  } catch { Write-TrayLog 'UPDATE-RESULT' $_ }
}

function Exit-Tray {
  try { $script:Timer.Stop() } catch { }
  $notify.Visible = $false
  try { $script:HotKey.Dispose() } catch { }
  foreach ($h in $script:IconHandles) { [void][ClaudeTrayUi.Native]::DestroyIcon($h) }
  $notify.Dispose()
  try { $script:Mutex.ReleaseMutex() } catch { }
  [System.Windows.Forms.Application]::Exit()
}

# --- Menu del clic destro (scuro, come il popup) ---
$script:Renderer = New-Object ClaudeTrayUi.DarkRenderer

function New-MenuItem([string]$text) {
  return New-Object System.Windows.Forms.ToolStripMenuItem $text
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$menu.Renderer = $script:Renderer
$menu.BackColor = $ColBg
$menu.ForeColor = $ColText
$menu.ShowImageMargin = $false
$menu.ShowCheckMargin = $true

$script:MiHeader = New-Object System.Windows.Forms.ToolStripLabel $script:T.tip
$script:MiHeader.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
$miOpen = New-MenuItem $script:T.mShow
$miOpen.add_Click({ Show-Popup })
$miRefresh = New-MenuItem $script:T.mRefresh
$miRefresh.add_Click({ Refresh-Live $true; if ($null -ne $script:Form -and $script:Form.Visible) { Show-Popup } })
$script:MiNotify = New-MenuItem $script:T.mNotify
$script:MiNotify.CheckOnClick = $true
$script:MiNotify.Checked = [bool]$script:Settings.notifications
$script:MiNotify.add_Click({ $script:Settings.notifications = $script:MiNotify.Checked; Save-Settings })

$miIconSource = New-MenuItem $script:T.mIconSource
$miIconSource.DropDown.Renderer = $script:Renderer
$miIconSource.DropDown.BackColor = $ColBg
$miIconSource.DropDown.ForeColor = $ColText
$miIconSource.DropDown.ShowImageMargin = $false
$miIconSource.DropDown.ShowCheckMargin = $true
$miIconSource.DropDown.add_Opened({ param($s, $e) [ClaudeTrayUi.Dwm]::Round($s.Handle) })
$script:IconSourceItems = @{}
foreach ($pair in @(@('both', $script:T.srcBoth), @('five_hour', $script:T.srcFive), @('seven_day', $script:T.srcSeven))) {
  $item = New-MenuItem $pair[1]
  $item.Tag = $pair[0]
  $item.add_Click({
    param($sender, $e)
    $script:Settings.iconSource = [string]$sender.Tag
    Save-Settings
    Sync-MenuChecks
    $script:IconKey = ''
    Update-TrayIcon
  })
  $script:IconSourceItems[$pair[0]] = $item
  [void]$miIconSource.DropDownItems.Add($item)
}
$miSettings = New-MenuItem $script:T.mSettings
$miSettings.add_Click({ Show-SettingsWindow })
$script:MiUpdateSep = New-Object System.Windows.Forms.ToolStripSeparator
$script:MiUpdate = New-MenuItem ''
$script:MiUpdate.Tag = 'accent'
$script:MiUpdate.add_Click({ Start-SelfUpdate })
$script:MiUpdate.Visible = $false
$script:MiUpdateSep.Visible = $false
$miExit = New-MenuItem $script:T.mQuit
$miExit.add_Click({ Exit-Tray })

$menu.Items.AddRange([System.Windows.Forms.ToolStripItem[]]@(
  $script:MiHeader,
  (New-Object System.Windows.Forms.ToolStripSeparator),
  $miOpen, $miRefresh,
  (New-Object System.Windows.Forms.ToolStripSeparator),
  $script:MiNotify, $miIconSource, $miSettings,
  $script:MiUpdateSep, $script:MiUpdate,
  (New-Object System.Windows.Forms.ToolStripSeparator),
  $miExit))

function Sync-MenuChecks {
  $script:MiNotify.Checked = [bool]$script:Settings.notifications
  foreach ($k in $script:IconSourceItems.Keys) { $script:IconSourceItems[$k].Checked = ($k -eq $script:Settings.iconSource) }
}

# Misure del menu per il monitor dove si apre.
function Set-MenuScale([double]$s) {
  $script:Renderer.Scale = [single]$s
  $font = New-PxFont 9.5 -scale $s
  $menu.Font = $font
  $miIconSource.DropDown.Font = $font
  $menu.Padding = New-Object System.Windows.Forms.Padding(0, [int](6 * $s), 0, [int](6 * $s))
  $itemPad = New-Object System.Windows.Forms.Padding([int](4 * $s), [int](5 * $s), [int](14 * $s), [int](5 * $s))
  foreach ($i in @($menu.Items) + @($miIconSource.DropDownItems)) { if ($i -is [System.Windows.Forms.ToolStripMenuItem]) { $i.Padding = $itemPad } }
  $script:MiHeader.Font = New-PxFont 9 ([System.Drawing.FontStyle]::Bold) $s
  $script:MiHeader.Padding = New-Object System.Windows.Forms.Padding([int](8 * $s), [int](2 * $s), [int](14 * $s), [int](4 * $s))
}

$menu.add_Opening({
  try {
    Set-MenuScale (Get-ScaleAt ([System.Windows.Forms.Cursor]::Position))
    $script:MiHeader.Text = Get-SummaryText
    Sync-MenuChecks
  } catch { Write-TrayLog 'MENU' $_ }
})
$menu.add_Opened({ try { [ClaudeTrayUi.Dwm]::Round($menu.Handle) } catch { } })
$notify.ContextMenuStrip = $menu

# --- Finestra "Impostazioni" ---
# Una finestra vera (barra del titolo scura, icona nella barra delle
# applicazioni), con un menu laterale e una scheda per ogni opzione, nello stile
# delle Impostazioni di Windows 11. Le modifiche valgono con "Salva".
$script:SettingsWin = $null
$ColSide = [System.Drawing.Color]::FromArgb(24, 24, 23)
$ColCard = [System.Drawing.Color]::FromArgb(39, 39, 37)
$ColCardLine = [System.Drawing.Color]::FromArgb(52, 52, 50)

function S([double]$v) { return [int][math]::Round($v * $script:DlgScale) }

function New-Label([string]$text, [double]$pt, [System.Drawing.Color]$color, [System.Drawing.Color]$back, [int]$x, [int]$y, [int]$w = 0, [int]$h = 0, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text
  $l.ForeColor = $color
  $l.BackColor = $back
  $l.UseMnemonic = $false
  $l.Font = New-PxFont $pt $style $script:DlgScale
  $l.Location = New-Object System.Drawing.Point((S $x), (S $y))
  if ($w -gt 0) { $l.AutoSize = $false; $l.AutoEllipsis = $true; $l.Size = New-Object System.Drawing.Size((S $w), (S $h)) } else { $l.AutoSize = $true }
  return $l
}

# Campo di testo arrotondato (la casella vera è dentro: .Controls[0]).
function New-Field([string]$value, [int]$w) {
  $box = New-Object ClaudeTrayUi.RoundPanel
  $box.FillColor = [System.Drawing.Color]::FromArgb(45, 45, 43)
  $box.BorderColor = $ColBorder
  $box.BackColor = $box.FillColor
  $box.Radius = S 6
  $box.Size = New-Object System.Drawing.Size((S $w), (S 32))
  $tb = New-Object System.Windows.Forms.TextBox
  $tb.BorderStyle = [System.Windows.Forms.BorderStyle]::None
  $tb.BackColor = $box.FillColor
  $tb.ForeColor = $ColText
  $tb.Font = New-PxFont 9.5 -scale $script:DlgScale
  $tb.TextAlign = [System.Windows.Forms.HorizontalAlignment]::Center
  $tb.Text = $value
  $tb.Width = $box.Width - (S 16)
  $tb.Location = New-Object System.Drawing.Point((S 8), [int](($box.Height - $tb.PreferredHeight) / 2))
  $box.Controls.Add($tb)
  $tb.add_Enter({ param($s, $e) $s.Parent.BorderColor = $ColAccent; $s.Parent.Invalidate() })
  $tb.add_Leave({ param($s, $e) $s.Parent.BorderColor = $ColBorder; $s.Parent.Invalidate() })
  return $box
}

function Set-FieldError($box, [bool]$bad) {
  $box.BorderColor = if ($bad) { $ColRed } else { $ColBorder }
  $box.Invalidate()
}

function New-Toggle([int]$w = 44) {
  $c = New-Object ClaudeTrayUi.ToggleSwitch
  $c.Size = New-Object System.Drawing.Size((S $w), (S 22))
  return $c
}

function New-Stepper([int]$min, [int]$max, [string]$suffix = '') {
  $c = New-Object ClaudeTrayUi.Stepper
  $c.Minimum = $min; $c.Maximum = $max; $c.Suffix = $suffix
  $c.Font = New-PxFont 9.5 -scale $script:DlgScale
  $c.Size = New-Object System.Drawing.Size((S 124), (S 32))
  return $c
}

function New-RoundButton([string]$text, [int]$w, [bool]$primary = $false) {
  $b = New-Object ClaudeTrayUi.RoundButton
  $b.Text = $text
  $b.Primary = $primary
  $b.Font = New-PxFont 9.5 -scale $script:DlgScale
  $b.Size = New-Object System.Drawing.Size((S $w), (S 34))
  return $b
}

# Una pagina: titolo grande, descrizione, poi le schede una sotto l'altra.
function New-Page([string]$title, [string]$desc) {
  $p = New-Object System.Windows.Forms.Panel
  $p.BackColor = $ColBg
  $p.Location = New-Object System.Drawing.Point((S 220), 0)
  $p.Size = New-Object System.Drawing.Size((S 560), (S 500))
  $p.Visible = $false
  $p.Tag = @{ Y = 104 }
  $p.Controls.Add((New-Label $title 15 $ColText $ColBg 32 24 0 0 ([System.Drawing.FontStyle]::Bold)))
  $p.Controls.Add((New-Label $desc 9 $ColDim $ColBg 32 62 496 36))
  return $p
}

# Scheda: titolo e descrizione a sinistra, controllo a destra.
function Add-Card($page, [string]$title, [string]$desc, $control) {
  $card = New-Object ClaudeTrayUi.RoundPanel
  $card.FillColor = $ColCard
  $card.BorderColor = $ColCardLine
  $card.BackColor = $ColCard
  $card.Radius = S 8
  $card.Location = New-Object System.Drawing.Point((S 32), (S $page.Tag.Y))
  $card.Size = New-Object System.Drawing.Size((S 496), (S 66))
  $textW = 496 - 40 - [int][math]::Ceiling($control.Width / $script:DlgScale)
  $card.Controls.Add((New-Label $title 9.5 $ColText $ColCard 16 13 $textW 20))
  if ($desc) { $card.Controls.Add((New-Label $desc 8.5 $ColDim $ColCard 16 34 $textW 20)) }
  $control.BackColor = $ColCard
  $control.Location = New-Object System.Drawing.Point(($card.Width - (S 16) - $control.Width), [int](($card.Height - $control.Height) / 2))
  $card.Controls.Add($control)
  $page.Controls.Add($card)
  $page.Tag.Y += 74
  return $card
}

# Contenitore trasparente per due campi affiancati ("23:00 – 08:00").
function New-Pair($left, [string]$sep, $right) {
  $p = New-Object System.Windows.Forms.Panel
  $p.BackColor = $ColCard
  $p.Size = New-Object System.Drawing.Size(($left.Width + $right.Width + (S 28)), $left.Height)
  $left.Location = New-Object System.Drawing.Point(0, 0)
  $right.Location = New-Object System.Drawing.Point(($left.Width + (S 28)), 0)
  $dash = New-Label $sep 9.5 $ColDim $ColCard 0 0 28 32
  $dash.Location = New-Object System.Drawing.Point($left.Width, 0)
  $dash.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
  $p.Controls.AddRange([System.Windows.Forms.Control[]]@($left, $dash, $right))
  return $p
}

# Testo "75, 90" → @(75, 90); $null se non valido.
function ConvertFrom-ThresholdText([string]$text) {
  $out = @()
  foreach ($part in ($text -split '[,; ]+' | Where-Object { $_ -ne '' })) {
    $n = 0
    if (-not [int]::TryParse($part.Trim().TrimEnd('%'), [ref]$n) -or $n -lt 1 -or $n -gt 100) { return $null }
    $out += $n
  }
  return @($out | Sort-Object -Unique)
}

function Set-WindowValues($c, $s) {
  $c.ColorIcon.Checked = [bool]$s.colorIcon
  $c.Source.SelectedIndex = [array]::IndexOf(@('both', 'five_hour', 'seven_day'), [string]$s.iconSource)
  $c.Orange.Value = [int]$s.orangeBand
  $c.Red.Value = [int]$s.redAbove
  $c.Graph.Checked = [bool]$s.showGraph
  $c.HotkeyOn.Checked = [bool]$s.hotkeyEnabled
  $c.Hotkey.Text = [string]$s.hotkey
  $c.NotifyOn.Checked = [bool]$s.notifications
  $c.Thresholds.Text = (@($s.thresholds) | ForEach-Object { [string][int]$_ }) -join ', '
  $c.Pace.Value = [int]$s.paceAlertPts
  $c.Quiet.Checked = [bool]$s.quietEnabled
  $c.QuietFrom.Text = [string]$s.quietFrom
  $c.QuietTo.Text = [string]$s.quietTo
  $c.UseIt.Checked = [bool]$s.useItEnabled
  $c.UseItFive.Value = [int]$s.useItFiveMin
  $c.UseItSeven.Value = [int]$s.useItSevenHours
  $c.UseItMin.Value = [int]$s.useItMinLeft
  $c.Updates.Checked = [bool]$s.checkUpdates
}

function Show-SettingsPage([int]$i) {
  for ($k = 0; $k -lt $script:SW.Pages.Count; $k++) { $script:SW.Pages[$k].Visible = ($k -eq $i) }
}

function Update-SettingsStatus {
  $c = $script:SW
  if ($null -eq $c -or $c.Window.IsDisposed) { return }
  $c.Status.Text = $script:UpdateStatus
  $c.UpdateCard.Visible = $null -ne $script:Update
  if ($null -ne $script:Update) { $c.UpdateNow.Text = [string]::Format($script:T.mUpdateTo, $script:Update.Tag) }
}

# Controlla i campi; se uno non va lo segna in rosso e mostra la sua pagina.
function Save-SettingsWindow {
  $c = $script:SW
  $thr = ConvertFrom-ThresholdText $c.Thresholds.Text
  $hk = ConvertFrom-HotkeyText $c.Hotkey.Text
  $checks = @(
    @{ Bad = ($null -eq $thr -or @($thr).Count -eq 0); Box = $c.ThresholdsBox; Page = 2 },
    @{ Bad = -not (Test-ClockText $c.QuietFrom.Text); Box = $c.QuietFromBox; Page = 2 },
    @{ Bad = -not (Test-ClockText $c.QuietTo.Text); Box = $c.QuietToBox; Page = 2 },
    @{ Bad = ($null -eq $hk); Box = $c.HotkeyBox; Page = 1 }
  )
  $first = $null
  foreach ($k in $checks) { Set-FieldError $k.Box $k.Bad; if ($k.Bad -and $null -eq $first) { $first = $k } }
  if ($null -ne $first) { $c.Nav.SelectedIndex = $first.Page; $first.Box.Controls[0].Focus(); return }

  $s = $script:Settings
  $s.colorIcon = $c.ColorIcon.Checked
  $s.iconSource = @('both', 'five_hour', 'seven_day')[[math]::Max(0, $c.Source.SelectedIndex)]
  $s.orangeBand = [double]$c.Orange.Value
  $s.redAbove = [double]$c.Red.Value
  $s.showGraph = $c.Graph.Checked
  $s.hotkeyEnabled = $c.HotkeyOn.Checked
  $s.hotkey = $c.Hotkey.Text
  $s.notifications = $c.NotifyOn.Checked
  $s.thresholds = @($thr)
  $s.paceAlertPts = [double]$c.Pace.Value
  $s.quietEnabled = $c.Quiet.Checked
  $s.quietFrom = $c.QuietFrom.Text
  $s.quietTo = $c.QuietTo.Text
  $s.useItEnabled = $c.UseIt.Checked
  $s.useItFiveMin = [double]$c.UseItFive.Value
  $s.useItSevenHours = [double]$c.UseItSeven.Value
  $s.useItMinLeft = [double]$c.UseItMin.Value
  $wasChecking = $s.checkUpdates
  $s.checkUpdates = $c.Updates.Checked
  if ($s.checkUpdates -and -not $wasChecking) { $script:NextUpdateCheck = [datetime]::UtcNow }
  Save-Settings
  Sync-MenuChecks
  $script:IconKey = ''
  Update-TrayIcon
  if ($null -ne $script:Form -and -not $script:Form.IsDisposed -and $script:Form.Visible) { Place-Popup; $script:Form.Invalidate() }
  $script:HotkeyWarn = $true
  $c.Window.Close()
}

function Show-SettingsWindow {
  if ($null -ne $script:SettingsWin -and -not $script:SettingsWin.IsDisposed) {
    $script:SettingsWin.WindowState = [System.Windows.Forms.FormWindowState]::Normal
    $script:SettingsWin.Activate()
    return
  }
  $t = $script:T
  $anchor = [System.Windows.Forms.Cursor]::Position
  $script:DlgScale = Get-ScaleAt $anchor
  $script:HotkeyWarn = $false

  $f = New-Object System.Windows.Forms.Form
  $f.Text = $t.winTitle
  $f.Icon = New-Object System.Drawing.Icon $script:IconPath
  $f.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
  $f.MaximizeBox = $false
  $f.AutoScaleMode = [System.Windows.Forms.AutoScaleMode]::None
  $f.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $f.ShowInTaskbar = $true
  $f.KeyPreview = $true
  $f.BackColor = $ColBg
  $f.ForeColor = $ColText
  $f.Font = New-PxFont 9.5 -scale $script:DlgScale
  $f.ClientSize = New-Object System.Drawing.Size((S 780), (S 572))
  $wa = [System.Windows.Forms.Screen]::FromPoint($anchor).WorkingArea
  $f.Location = New-Object System.Drawing.Point(($wa.X + [int](($wa.Width - $f.Width) / 2)), ($wa.Y + [int](($wa.Height - $f.Height) / 2)))
  $f.add_HandleCreated({ param($s, $e) [ClaudeTrayUi.Dwm]::DarkTitle($s.Handle, $ColBg, $ColBorder) })
  $script:SettingsWin = $f
  $c = @{ Window = $f; Pages = @() }
  $script:SW = $c

  # Menu laterale
  $side = New-Object System.Windows.Forms.Panel
  $side.BackColor = $ColSide
  $side.Location = New-Object System.Drawing.Point(0, 0)
  $side.Size = New-Object System.Drawing.Size((S 220), $f.ClientSize.Height)
  $logo = New-Object System.Windows.Forms.PictureBox
  $logo.SizeMode = [System.Windows.Forms.PictureBoxSizeMode]::Zoom
  $logo.Image = (New-Object System.Drawing.Icon $script:IconPath, 64, 64).ToBitmap()
  $logo.BackColor = $ColSide
  $logo.Location = New-Object System.Drawing.Point((S 20), (S 24))
  $logo.Size = New-Object System.Drawing.Size((S 30), (S 30))
  $side.Controls.Add($logo)
  $side.Controls.Add((New-Label 'Claude Limits Tray' 10 $ColText $ColSide 58 22 156 20 ([System.Drawing.FontStyle]::Bold)))
  $side.Controls.Add((New-Label ([string]::Format($t.winVersion, $script:LocalVersion)) 8 $ColDim $ColSide 58 42 156 18))
  $nav = New-Object ClaudeTrayUi.NavList
  $nav.BackColor = $ColSide
  $nav.Font = New-PxFont 9.5 -scale $script:DlgScale
  $nav.ItemHeight = S 40
  $nav.Items = [string[]]@($t.navIcon, $t.navPopup, $t.navNotify, $t.navUseIt, $t.navUpdates)
  $nav.Location = New-Object System.Drawing.Point((S 10), (S 84))
  $nav.Size = New-Object System.Drawing.Size((S 200), (S (40 * 5)))
  $nav.add_SelectedIndexChanged({ Show-SettingsPage $script:SW.Nav.SelectedIndex })
  $side.Controls.Add($nav)
  $c.Nav = $nav

  # 1. Icona
  $p = New-Page $t.navIcon $t.pIcon
  $c.ColorIcon = New-Toggle; [void](Add-Card $p $t.cColorIcon $t.dColorIcon $c.ColorIcon)
  $c.Source = New-Object ClaudeTrayUi.Segmented
  $c.Source.Items = [string[]]@($t.segBoth, $t.segFive, $t.segSeven)
  $c.Source.Font = New-PxFont 9 -scale $script:DlgScale
  $c.Source.Size = New-Object System.Drawing.Size((S 240), (S 32))
  [void](Add-Card $p $t.cSource $t.dSource $c.Source)
  $c.Orange = New-Stepper 0 50 ' pt'; [void](Add-Card $p $t.cOrange $t.dOrange $c.Orange)
  $c.Red = New-Stepper 0 50 ' pt'; [void](Add-Card $p $t.cRed $t.dRed $c.Red)
  $c.Pages += $p

  # 2. Popup
  $p = New-Page $t.navPopup $t.pPopup
  $c.Graph = New-Toggle; [void](Add-Card $p $t.cGraph $t.dGraph $c.Graph)
  $c.HotkeyOn = New-Toggle; [void](Add-Card $p $t.cHotkeyOn $t.dHotkeyOn $c.HotkeyOn)
  $c.HotkeyBox = New-Field 'Ctrl+Alt+L' 170
  $c.Hotkey = $c.HotkeyBox.Controls[0]
  $c.Hotkey.ReadOnly = $true
  $c.Hotkey.BackColor = $c.HotkeyBox.FillColor
  $c.Hotkey.Cursor = [System.Windows.Forms.Cursors]::Hand
  # Mentre si sceglie la combinazione, quella attuale non deve scattare.
  $c.Hotkey.add_Enter({ $script:HotKey.Unregister() })
  $c.Hotkey.add_Leave({ Register-TrayHotkey $false })
  $c.Hotkey.add_KeyDown({
    param($s, $e)
    $k = $e.KeyCode
    $isKey = ($k -ge [System.Windows.Forms.Keys]::A -and $k -le [System.Windows.Forms.Keys]::Z) -or ($k -ge [System.Windows.Forms.Keys]::D0 -and $k -le [System.Windows.Forms.Keys]::D9) -or ($k -ge [System.Windows.Forms.Keys]::F1 -and $k -le [System.Windows.Forms.Keys]::F12)
    if ($isKey -and ($e.Control -or $e.Alt -or $e.Shift)) {
      $parts = @()
      if ($e.Control) { $parts += 'Ctrl' }
      if ($e.Alt) { $parts += 'Alt' }
      if ($e.Shift) { $parts += 'Shift' }
      $name = [string]$k
      if ($name -match '^D(\d)$') { $name = $Matches[1] }
      $s.Text = ($parts + $name) -join '+'
      Set-FieldError $s.Parent $false
      $e.SuppressKeyPress = $true
      $e.Handled = $true
    }
  })
  [void](Add-Card $p $t.cHotkey $t.dHotkey $c.HotkeyBox)
  $c.Pages += $p

  # 3. Notifiche
  $p = New-Page $t.navNotify $t.pNotify
  $c.NotifyOn = New-Toggle; [void](Add-Card $p $t.cNotify $t.dNotify $c.NotifyOn)
  $c.ThresholdsBox = New-Field '75, 90' 130
  $c.Thresholds = $c.ThresholdsBox.Controls[0]
  [void](Add-Card $p $t.cThresholds $t.dThresholds $c.ThresholdsBox)
  $c.Pace = New-Stepper 0 100 ' pt'; [void](Add-Card $p $t.cPace $t.dPace $c.Pace)
  $c.Quiet = New-Toggle; [void](Add-Card $p $t.cQuiet $t.dQuiet $c.Quiet)
  $c.QuietFromBox = New-Field '23:00' 76
  $c.QuietToBox = New-Field '08:00' 76
  $c.QuietFrom = $c.QuietFromBox.Controls[0]
  $c.QuietTo = $c.QuietToBox.Controls[0]
  [void](Add-Card $p $t.cQuietRange $t.dQuietRange (New-Pair $c.QuietFromBox '–' $c.QuietToBox))
  $c.Pages += $p

  # 4. Usalo o lo perdi
  $p = New-Page $t.navUseIt $t.pUseIt
  $c.UseIt = New-Toggle; [void](Add-Card $p $t.cUseIt $t.dUseIt $c.UseIt)
  $c.UseItFive = New-Stepper 1 299 ' min'; [void](Add-Card $p $t.cUseItFive $t.dUseItFive $c.UseItFive)
  $c.UseItSeven = New-Stepper 1 167 ' h'; [void](Add-Card $p $t.cUseItSeven $t.dUseItSeven $c.UseItSeven)
  $c.UseItMin = New-Stepper 1 100 '%'; [void](Add-Card $p $t.cUseItMin $t.dUseItMin $c.UseItMin)
  $c.Pages += $p

  # 5. Aggiornamenti
  $p = New-Page $t.navUpdates $t.pUpdates
  $c.Updates = New-Toggle; [void](Add-Card $p $t.cUpdates $t.dUpdates $c.Updates)
  $checkNow = New-RoundButton $t.sCheckNow 150
  $checkNow.add_Click({ Start-UpdateCheck; Update-SettingsStatus })
  $versionCard = Add-Card $p ([string]::Format($t.cVersion, $script:LocalVersion)) ' ' $checkNow
  $c.Status = $versionCard.Controls[1]
  $openGit = New-RoundButton $t.btnOpen 150
  $openGit.add_Click({ Start-Process 'https://github.com/Aledallas01/claude-usage-bar-mod' })
  [void](Add-Card $p $t.cGithub $t.dGithub $openGit)
  $openData = New-RoundButton $t.btnFolder 150
  $openData.add_Click({ New-Item -ItemType Directory -Force $script:DataDir | Out-Null; Start-Process 'explorer.exe' -ArgumentList ('"' + $script:DataDir + '"') })
  [void](Add-Card $p $t.cData $script:DataDir $openData)
  $c.UpdateNow = New-RoundButton '' 190 $true
  $c.UpdateNow.add_Click({ $script:SW.Window.Close(); Start-SelfUpdate })
  $c.UpdateCard = Add-Card $p $t.cNewVersion $t.dNewVersion $c.UpdateNow
  $c.Pages += $p

  # Piede: Predefinite | Annulla Salva
  $foot = New-Object System.Windows.Forms.Panel
  $foot.BackColor = $ColBg
  $foot.Location = New-Object System.Drawing.Point((S 220), (S 500))
  $foot.Size = New-Object System.Drawing.Size((S 560), (S 72))
  $foot.add_Paint({ param($s, $e) $pen = New-Object System.Drawing.Pen $ColCardLine; $e.Graphics.DrawLine($pen, (S 32), 0, $s.Width - (S 32), 0); $pen.Dispose() })
  $bReset = New-RoundButton $t.btnReset 130
  $bReset.Location = New-Object System.Drawing.Point((S 32), (S 20))
  $bReset.add_Click({ Set-WindowValues $script:SW (Get-DefaultSettings) })
  $bSave = New-RoundButton $t.btnSave 120 $true
  $bSave.Location = New-Object System.Drawing.Point(($foot.Width - (S 32) - $bSave.Width), (S 20))
  $bSave.add_Click({ Save-SettingsWindow })
  $bCancel = New-RoundButton $t.btnCancel 120
  $bCancel.Location = New-Object System.Drawing.Point(($bSave.Left - (S 10) - $bCancel.Width), (S 20))
  $bCancel.add_Click({ $script:SW.Window.Close() })
  $foot.Controls.AddRange([System.Windows.Forms.Control[]]@($bReset, $bCancel, $bSave))
  $f.CancelButton = $bCancel

  $f.Controls.Add($side)
  foreach ($pg in $c.Pages) { $f.Controls.Add($pg) }
  $f.Controls.Add($foot)
  Set-WindowValues $c $script:Settings
  Show-SettingsPage 0
  Update-SettingsStatus

  # Lo stato del controllo versioni si aggiorna mentre la finestra è aperta.
  $c.Timer = New-Object System.Windows.Forms.Timer
  $c.Timer.Interval = 500
  $c.Timer.add_Tick({ Update-SettingsStatus })
  $c.Timer.Start()
  $f.add_FormClosed({
    $script:SW.Timer.Stop(); $script:SW.Timer.Dispose()
    Register-TrayHotkey $script:HotkeyWarn
    $script:SettingsWin = $null
  })
  $f.Show()
  $f.Activate()
  [void][ClaudeTrayUi.Native]::SetForegroundWindow($f.Handle)
}

# --- Tempo reale ---
# Ogni secondo controlla se la mod ha riscritto il file dei dati (basta l'ora di
# modifica, nessuna lettura) e in quel caso ricarica subito; ogni 15 s ricarica
# comunque, per far avanzare il tempo trascorso.
$script:LastStamp = 0L
$script:LastFull = 0L

function Get-StoreStamp {
  $f = Get-StoreFile $script:StoreDir
  if ($null -eq $f) { return 0L }
  return $f.LastWriteTimeUtc.Ticks
}

function Refresh-Live([bool]$force) {
  Complete-UpdateCheck
  if ($script:Settings.checkUpdates -and [datetime]::UtcNow -ge $script:NextUpdateCheck) {
    $script:NextUpdateCheck = [datetime]::UtcNow.AddHours(6)
    Start-UpdateCheck
  }
  $stamp = Get-StoreStamp
  $nowTicks = [DateTime]::UtcNow.Ticks
  $periodic = ($nowTicks - $script:LastFull) -ge [TimeSpan]::FromSeconds(15).Ticks
  if (-not $force -and $stamp -eq $script:LastStamp -and -not $periodic) { return }
  $script:LastStamp = $stamp
  $script:LastFull = $nowTicks
  $script:Data = Get-LimitsData $script:StoreDir
  Update-Tooltip
  try { Update-History } catch { Write-TrayLog 'HISTORY' $_ }
  try { Update-TrayIcon } catch { Write-TrayLog 'ICON' $_ }
  try { Check-Notifications } catch { Write-TrayLog 'NOTIFY' $_ }
  if ($null -ne $script:Form -and -not $script:Form.IsDisposed -and $script:Form.Visible) {
    Place-Popup
    $script:Form.Invalidate()
  }
}

$script:Timer = New-Object System.Windows.Forms.Timer
$script:Timer.Interval = 1000
$script:Timer.add_Tick({
  try { Refresh-Live $false } catch { Write-TrayLog 'LIVE' $_ }
})
$script:Timer.Start()
Refresh-Live $true
Register-TrayHotkey $true
Show-UpdateResult

$ctx = New-Object System.Windows.Forms.ApplicationContext
[System.Windows.Forms.Application]::Run($ctx)
