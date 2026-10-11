# Genera l'icona dell'area di notifica (un piccolo quadrante con lancetta,
# nei colori di Claude): claude-limits.ico, accanto a questo script.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot 'claude-limits.ico'
$size = 32
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# cerchio pieno arancione Claude
$orange = [System.Drawing.Color]::FromArgb(217, 119, 87)
$br = New-Object System.Drawing.SolidBrush $orange
$g.FillEllipse($br, 2, 2, ($size - 4), ($size - 4))
$br.Dispose()

# quadrante bianco: due lancette
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 2.4
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$cx = $size / 2; $cy = $size / 2
$g.DrawLine($pen, $cx, $cy, $cx, ($cy - 8))       # lancetta dei minuti (su)
$g.DrawLine($pen, $cx, $cy, ($cx + 6), ($cy + 1))  # lancetta delle ore (destra)
$pen.Dispose()

$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create($out)
$icon.Save($fs)
$fs.Close()
$icon.Dispose(); $g.Dispose(); $bmp.Dispose()
Write-Host "Icona creata: $out"
