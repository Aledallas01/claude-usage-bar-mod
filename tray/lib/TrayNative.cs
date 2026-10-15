// Parti native del programma tray, compilate all'avvio con Add-Type:
// menu scuro, angoli arrotondati, DPI per monitor, scorciatoia globale.

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace ClaudeTrayUi
{
    public class DarkColors : ProfessionalColorTable
    {
        static readonly Color Bg = Color.FromArgb(30, 30, 29);
        static readonly Color Hover = Color.FromArgb(52, 52, 50);
        public override Color ToolStripDropDownBackground { get { return Bg; } }
        public override Color ImageMarginGradientBegin { get { return Bg; } }
        public override Color ImageMarginGradientMiddle { get { return Bg; } }
        public override Color ImageMarginGradientEnd { get { return Bg; } }
        public override Color MenuBorder { get { return Color.FromArgb(70, 70, 68); } }
        public override Color MenuItemBorder { get { return Hover; } }
        public override Color MenuItemSelected { get { return Hover; } }
        public override Color SeparatorDark { get { return Color.FromArgb(58, 58, 56); } }
        public override Color SeparatorLight { get { return Bg; } }
        public override Color CheckBackground { get { return Bg; } }
        public override Color CheckSelectedBackground { get { return Hover; } }
        public override Color CheckPressedBackground { get { return Hover; } }
    }

    /// Menu scuro come il popup: voce evidenziata con angoli arrotondati, testo
    /// chiaro, segno di spunta arancione. Scale = DPI del monitor / 96.
    public class DarkRenderer : ToolStripProfessionalRenderer
    {
        public float Scale = 1f;

        public DarkRenderer() : base(new DarkColors()) { this.RoundedEdges = false; }

        int S(float v) { return (int)Math.Round(v * Scale); }

        static GraphicsPath Rounded(Rectangle r, int rad)
        {
            int d = Math.Max(2, rad * 2);
            GraphicsPath p = new GraphicsPath();
            p.AddArc(r.Left, r.Top, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            if (!e.Item.Selected || !e.Item.Enabled) return;
            Rectangle r = new Rectangle(S(5), 1, e.Item.Width - S(11), e.Item.Height - 3);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (GraphicsPath p = Rounded(r, S(5)))
            using (SolidBrush b = new SolidBrush(Color.FromArgb(52, 52, 50)))
            {
                e.Graphics.FillPath(b, p);
            }
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            Color accent = e.Item.Tag as string == "accent" ? Color.FromArgb(230, 135, 104) : Color.FromArgb(245, 244, 239);
            e.TextColor = e.Item.Enabled ? accent : Color.FromArgb(150, 150, 145);
            base.OnRenderItemText(e);
        }

        protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
        {
            e.ArrowColor = Color.FromArgb(150, 150, 145);
            base.OnRenderArrow(e);
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            int y = e.Item.Height / 2;
            using (Pen pen = new Pen(Color.FromArgb(58, 58, 56)))
            {
                e.Graphics.DrawLine(pen, S(12), y, e.Item.Width - S(12), y);
            }
        }

        protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
        {
            Rectangle r = e.ImageRectangle;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (Pen pen = new Pen(Color.FromArgb(217, 119, 87), 2f * Scale))
            {
                pen.StartCap = LineCap.Round;
                pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;
                float cx = r.Left + r.Width / 2f;
                float cy = r.Top + r.Height / 2f;
                float k = Scale;
                e.Graphics.DrawLines(pen, new PointF[] {
                    new PointF(cx - 5f * k, cy),
                    new PointF(cx - 1.5f * k, cy + 3.5f * k),
                    new PointF(cx + 5f * k, cy - 4f * k) });
            }
        }

        protected override void OnRenderImageMargin(ToolStripRenderEventArgs e)
        {
            using (SolidBrush b = new SolidBrush(Color.FromArgb(30, 30, 29)))
            {
                e.Graphics.FillRectangle(b, e.AffectedBounds);
            }
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            using (Pen pen = new Pen(Color.FromArgb(70, 70, 68)))
            {
                e.Graphics.DrawRectangle(pen, 0, 0, e.ToolStrip.Width - 1, e.ToolStrip.Height - 1);
            }
        }
    }

    public static class Dwm
    {
        [DllImport("dwmapi.dll")]
        static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        /// Angoli arrotondati di Windows 11 (senza effetto sulle versioni precedenti).
        public static void Round(IntPtr hwnd)
        {
            int pref = 2;
            try { DwmSetWindowAttribute(hwnd, 33, ref pref, 4); } catch { }
        }

        /// Barra del titolo scura, dello stesso colore della finestra.
        public static void DarkTitle(IntPtr hwnd, Color caption, Color border)
        {
            int on = 1;
            try { if (DwmSetWindowAttribute(hwnd, 20, ref on, 4) != 0) DwmSetWindowAttribute(hwnd, 19, ref on, 4); } catch { }
            int cap = caption.R | (caption.G << 8) | (caption.B << 16);
            int bor = border.R | (border.G << 8) | (border.B << 16);
            try { DwmSetWindowAttribute(hwnd, 35, ref cap, 4); } catch { }
            try { DwmSetWindowAttribute(hwnd, 34, ref bor, 4); } catch { }
        }
    }

    static class Shapes
    {
        public static GraphicsPath Rounded(RectangleF r, float rad)
        {
            float d = Math.Max(1f, Math.Min(rad * 2f, Math.Min(r.Width, r.Height)));
            GraphicsPath p = new GraphicsPath();
            p.AddArc(r.Left, r.Top, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Top, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.Left, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static readonly Color Accent = Color.FromArgb(217, 119, 87);
        public static readonly Color AccentHover = Color.FromArgb(230, 135, 104);
        public static readonly Color Field = Color.FromArgb(45, 45, 43);
        public static readonly Color FieldHover = Color.FromArgb(55, 55, 53);
        public static readonly Color Line = Color.FromArgb(70, 70, 68);
        public static readonly Color Text = Color.FromArgb(245, 244, 239);
        public static readonly Color Dim = Color.FromArgb(150, 150, 145);
    }

    /// Base dei controlli disegnati a mano: doppio buffer, sfondo del contenitore.
    public class PaintedControl : Control
    {
        protected bool hover;

        public PaintedControl()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.Selectable, true);
            Cursor = Cursors.Hand;
            TabStop = true;
            ForeColor = Shapes.Text;
        }

        protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnGotFocus(EventArgs e) { Invalidate(); base.OnGotFocus(e); }
        protected override void OnLostFocus(EventArgs e) { Invalidate(); base.OnLostFocus(e); }

        protected Graphics Begin(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(BackColor);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            return g;
        }

        protected void FocusRing(Graphics g, RectangleF r, float rad)
        {
            if (!Focused || !ShowFocusCues) return;
            using (GraphicsPath p = Shapes.Rounded(r, rad))
            using (Pen pen = new Pen(Color.FromArgb(160, Shapes.Accent), 1.5f)) g.DrawPath(pen, p);
        }
    }

    /// Finestra che si mostra e si clicca senza prendere il focus: il popup dei
    /// grafici resta accanto a quello dei limiti senza chiuderlo.
    public class NoActivateForm : Form
    {
        public NoActivateForm()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.ExStyle |= 0x08000000 | 0x00000080; // WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW
                return cp;
            }
        }
    }

    /// Pannello con angoli arrotondati (le "schede" delle impostazioni).
    public class RoundPanel : Panel
    {
        public int Radius = 8;
        public Color FillColor = Color.FromArgb(39, 39, 37);
        public Color BorderColor = Color.FromArgb(52, 52, 50);

        public RoundPanel()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        }

        protected override void OnPaintBackground(PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.Clear(Parent != null ? Parent.BackColor : BackColor);
            g.SmoothingMode = SmoothingMode.AntiAlias;
            RectangleF r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (GraphicsPath p = Shapes.Rounded(r, Radius))
            using (SolidBrush b = new SolidBrush(FillColor))
            using (Pen pen = new Pen(BorderColor))
            {
                g.FillPath(b, p);
                g.DrawPath(pen, p);
            }
        }
    }

    /// Interruttore on/off in stile Windows 11.
    public class ToggleSwitch : PaintedControl
    {
        bool on;
        public event EventHandler CheckedChanged;

        public bool Checked
        {
            get { return on; }
            set
            {
                if (on == value) return;
                on = value;
                Invalidate();
                EventHandler h = CheckedChanged;
                if (h != null) h(this, EventArgs.Empty);
            }
        }

        protected override void OnClick(EventArgs e) { Focus(); Checked = !Checked; base.OnClick(e); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Space) { Checked = !Checked; e.Handled = true; }
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = Begin(e);
            RectangleF r = new RectangleF(2f, 2f, Width - 4f, Height - 4f);
            float rad = r.Height / 2f;
            using (GraphicsPath p = Shapes.Rounded(r, rad))
            {
                if (on)
                {
                    using (SolidBrush b = new SolidBrush(hover ? Shapes.AccentHover : Shapes.Accent)) g.FillPath(b, p);
                }
                else
                {
                    using (SolidBrush b = new SolidBrush(hover ? Shapes.FieldHover : Shapes.Field)) g.FillPath(b, p);
                    using (Pen pen = new Pen(Color.FromArgb(130, 130, 125), 1f)) g.DrawPath(pen, p);
                }
            }
            float pad = r.Height * 0.22f;
            float d = r.Height - 2f * pad;
            float x = on ? r.Right - pad - d : r.Left + pad;
            using (SolidBrush k = new SolidBrush(on ? Color.White : Color.FromArgb(200, 200, 195)))
                g.FillEllipse(k, x, r.Top + pad, d, d);
            FocusRing(g, new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), (Height - 1f) / 2f);
        }
    }

    /// Numero con i pulsanti − e + (rotellina e frecce funzionano).
    public class Stepper : PaintedControl
    {
        int value, min, max = 100, zone;
        public string Suffix = "";
        public event EventHandler ValueChanged;
        readonly Timer repeat = new Timer();
        int repeatStep;

        public Stepper()
        {
            repeat.Tick += delegate { repeat.Interval = 60; Value = value + repeatStep; };
        }

        public int Minimum { get { return min; } set { min = value; Value = this.value; } }
        public int Maximum { get { return max; } set { max = value; Value = this.value; } }

        public int Value
        {
            get { return value; }
            set
            {
                int v = Math.Max(min, Math.Min(max, value));
                if (v == this.value) return;
                this.value = v;
                Invalidate();
                EventHandler h = ValueChanged;
                if (h != null) h(this, EventArgs.Empty);
            }
        }

        int ZoneAt(int x) { int w = Height; if (x < w) return -1; if (x > Width - w) return 1; return 0; }

        protected override void OnMouseMove(MouseEventArgs e) { int z = ZoneAt(e.X); if (z != zone) { zone = z; Invalidate(); } base.OnMouseMove(e); }
        protected override void OnMouseLeave(EventArgs e) { zone = 0; base.OnMouseLeave(e); }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            Focus();
            int z = ZoneAt(e.X);
            if (z != 0 && e.Button == MouseButtons.Left)
            {
                Value = value + z;
                repeatStep = z;
                repeat.Interval = 400;
                repeat.Start();
            }
            base.OnMouseDown(e);
        }

        protected override void OnMouseUp(MouseEventArgs e) { repeat.Stop(); base.OnMouseUp(e); }
        protected override void OnMouseWheel(MouseEventArgs e) { Value = value + (e.Delta > 0 ? 1 : -1); base.OnMouseWheel(e); }

        protected override bool IsInputKey(Keys k) { return k == Keys.Up || k == Keys.Down || base.IsInputKey(k); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Up || e.KeyCode == Keys.Right) { Value = value + 1; e.Handled = true; }
            else if (e.KeyCode == Keys.Down || e.KeyCode == Keys.Left) { Value = value - 1; e.Handled = true; }
            else if (e.KeyCode == Keys.PageUp) { Value = value + 10; e.Handled = true; }
            else if (e.KeyCode == Keys.PageDown) { Value = value - 10; e.Handled = true; }
            base.OnKeyDown(e);
        }

        protected override void Dispose(bool disposing) { if (disposing) repeat.Dispose(); base.Dispose(disposing); }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = Begin(e);
            RectangleF r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            float rad = Height * 0.22f;
            using (GraphicsPath p = Shapes.Rounded(r, rad))
            using (SolidBrush b = new SolidBrush(Shapes.Field))
            using (Pen pen = new Pen(Shapes.Line))
            {
                g.FillPath(b, p);
                g.DrawPath(pen, p);
            }
            int w = Height;
            for (int side = -1; side <= 1; side += 2)
            {
                RectangleF zr = side < 0 ? new RectangleF(3, 3, w - 6, Height - 6) : new RectangleF(Width - w + 3, 3, w - 6, Height - 6);
                bool atLimit = side < 0 ? value <= min : value >= max;
                if (zone == side && !atLimit)
                    using (GraphicsPath p = Shapes.Rounded(zr, rad * 0.8f))
                    using (SolidBrush b = new SolidBrush(Shapes.FieldHover)) g.FillPath(b, p);
                float cx = zr.Left + zr.Width / 2f, cy = zr.Top + zr.Height / 2f, k = Height * 0.16f;
                using (Pen pen = new Pen(atLimit ? Color.FromArgb(90, 90, 86) : Shapes.Text, Math.Max(1.5f, Height / 20f)))
                {
                    pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round;
                    g.DrawLine(pen, cx - k, cy, cx + k, cy);
                    if (side > 0) g.DrawLine(pen, cx, cy - k, cx, cy + k);
                }
            }
            using (StringFormat sf = new StringFormat())
            using (SolidBrush tb = new SolidBrush(ForeColor))
            {
                sf.Alignment = StringAlignment.Center;
                sf.LineAlignment = StringAlignment.Center;
                g.DrawString(value.ToString() + Suffix, Font, tb, new RectangleF(w, 0, Width - 2 * w, Height), sf);
            }
            FocusRing(g, r, rad);
        }
    }

    /// Scelta tra poche opzioni affiancate (es. Entrambi | 5 ore | Settimanale).
    public class Segmented : PaintedControl
    {
        string[] items = new string[0];
        int sel, hot = -1;
        public event EventHandler SelectedIndexChanged;

        public string[] Items { get { return items; } set { items = value ?? new string[0]; Invalidate(); } }

        public int SelectedIndex
        {
            get { return sel; }
            set
            {
                if (value < 0 || value >= items.Length || value == sel) return;
                sel = value;
                Invalidate();
                EventHandler h = SelectedIndexChanged;
                if (h != null) h(this, EventArgs.Empty);
            }
        }

        int IndexAt(int x) { return items.Length == 0 ? -1 : Math.Max(0, Math.Min(items.Length - 1, x * items.Length / Math.Max(1, Width))); }

        protected override void OnMouseMove(MouseEventArgs e) { int i = IndexAt(e.X); if (i != hot) { hot = i; Invalidate(); } base.OnMouseMove(e); }
        protected override void OnMouseLeave(EventArgs e) { hot = -1; base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { Focus(); SelectedIndex = IndexAt(e.X); base.OnMouseDown(e); }
        protected override bool IsInputKey(Keys k) { return k == Keys.Left || k == Keys.Right || base.IsInputKey(k); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Left) { SelectedIndex = sel - 1; e.Handled = true; }
            else if (e.KeyCode == Keys.Right) { SelectedIndex = sel + 1; e.Handled = true; }
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = Begin(e);
            RectangleF r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            float rad = Height * 0.22f;
            using (GraphicsPath p = Shapes.Rounded(r, rad))
            using (SolidBrush b = new SolidBrush(Shapes.Field))
            using (Pen pen = new Pen(Shapes.Line))
            {
                g.FillPath(b, p);
                g.DrawPath(pen, p);
            }
            if (items.Length == 0) return;
            float w = (Width - 6f) / items.Length;
            using (StringFormat sf = new StringFormat())
            {
                sf.Alignment = StringAlignment.Center;
                sf.LineAlignment = StringAlignment.Center;
                sf.Trimming = StringTrimming.EllipsisCharacter;
                sf.FormatFlags = StringFormatFlags.NoWrap;
                for (int i = 0; i < items.Length; i++)
                {
                    RectangleF cell = new RectangleF(3f + i * w, 3f, w, Height - 6f);
                    if (i == sel || i == hot)
                        using (GraphicsPath p = Shapes.Rounded(cell, rad * 0.8f))
                        using (SolidBrush b = new SolidBrush(i == sel ? Shapes.Accent : Shapes.FieldHover)) g.FillPath(b, p);
                    using (SolidBrush tb = new SolidBrush(i == sel ? Color.White : ForeColor))
                        g.DrawString(items[i], Font, tb, cell, sf);
                }
            }
            FocusRing(g, r, rad);
        }
    }

    /// Menu laterale della finestra delle impostazioni.
    public class NavList : PaintedControl
    {
        string[] items = new string[0];
        int sel, hot = -1;
        public int ItemHeight = 40;
        public event EventHandler SelectedIndexChanged;

        public string[] Items { get { return items; } set { items = value ?? new string[0]; Invalidate(); } }

        public int SelectedIndex
        {
            get { return sel; }
            set
            {
                if (value < 0 || value >= items.Length || value == sel) return;
                sel = value;
                Invalidate();
                EventHandler h = SelectedIndexChanged;
                if (h != null) h(this, EventArgs.Empty);
            }
        }

        int IndexAt(int y) { int i = y / Math.Max(1, ItemHeight); return i >= 0 && i < items.Length ? i : -1; }

        protected override void OnMouseMove(MouseEventArgs e) { int i = IndexAt(e.Y); if (i != hot) { hot = i; Invalidate(); } base.OnMouseMove(e); }
        protected override void OnMouseLeave(EventArgs e) { hot = -1; base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { int i = IndexAt(e.Y); if (i >= 0) SelectedIndex = i; base.OnMouseDown(e); }
        protected override bool IsInputKey(Keys k) { return k == Keys.Up || k == Keys.Down || base.IsInputKey(k); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Up) { SelectedIndex = sel - 1; e.Handled = true; }
            else if (e.KeyCode == Keys.Down) { SelectedIndex = sel + 1; e.Handled = true; }
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = Begin(e);
            float pad = ItemHeight * 0.3f;
            using (StringFormat sf = new StringFormat())
            {
                sf.LineAlignment = StringAlignment.Center;
                sf.Trimming = StringTrimming.EllipsisCharacter;
                sf.FormatFlags = StringFormatFlags.NoWrap;
                for (int i = 0; i < items.Length; i++)
                {
                    RectangleF r = new RectangleF(4f, i * ItemHeight + 2f, Width - 8f, ItemHeight - 4f);
                    if (i == sel || i == hot)
                        using (GraphicsPath p = Shapes.Rounded(r, ItemHeight * 0.15f))
                        using (SolidBrush b = new SolidBrush(i == sel ? Color.FromArgb(48, 48, 46) : Color.FromArgb(40, 40, 38))) g.FillPath(b, p);
                    if (i == sel)
                        using (GraphicsPath p = Shapes.Rounded(new RectangleF(r.Left, r.Top + r.Height * 0.28f, Math.Max(3f, ItemHeight * 0.08f), r.Height * 0.44f), 1.5f))
                        using (SolidBrush b = new SolidBrush(Shapes.Accent)) g.FillPath(b, p);
                    using (SolidBrush tb = new SolidBrush(i == sel ? Shapes.Text : Color.FromArgb(200, 200, 195)))
                        g.DrawString(items[i], Font, tb, new RectangleF(r.Left + pad, r.Top, r.Width - pad, r.Height), sf);
                }
            }
            if (Focused && ShowFocusCues && sel >= 0)
                FocusRing(g, new RectangleF(4f, sel * ItemHeight + 2f, Width - 8f, ItemHeight - 4f), ItemHeight * 0.15f);
        }
    }

    /// Pulsante arrotondato; Primary = arancione. Funziona come AcceptButton / CancelButton.
    public class RoundButton : PaintedControl, IButtonControl
    {
        public bool Primary;
        bool pressed;
        DialogResult result = DialogResult.None;

        public DialogResult DialogResult { get { return result; } set { result = value; } }
        public void NotifyDefault(bool value) { }
        public void PerformClick() { OnClick(EventArgs.Empty); }

        protected override void OnClick(EventArgs e)
        {
            base.OnClick(e);
            Form f = FindForm();
            if (f != null && result != DialogResult.None) f.DialogResult = result;
        }

        protected override void OnMouseDown(MouseEventArgs e) { pressed = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Space || e.KeyCode == Keys.Enter) { PerformClick(); e.Handled = true; }
            base.OnKeyDown(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            Graphics g = Begin(e);
            RectangleF r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            float rad = Height * 0.2f;
            Color fill = Primary ? (hover ? Shapes.AccentHover : Shapes.Accent) : (hover ? Shapes.FieldHover : Shapes.Field);
            if (pressed) fill = ControlPaint.Dark(fill, 0.05f);
            if (!Enabled) fill = Color.FromArgb(40, 40, 38);
            using (GraphicsPath p = Shapes.Rounded(r, rad))
            using (SolidBrush b = new SolidBrush(fill))
            {
                g.FillPath(b, p);
                if (!Primary) using (Pen pen = new Pen(Shapes.Line)) g.DrawPath(pen, p);
            }
            using (StringFormat sf = new StringFormat())
            using (SolidBrush tb = new SolidBrush(!Enabled ? Shapes.Dim : (Primary ? Color.White : ForeColor)))
            {
                sf.Alignment = StringAlignment.Center;
                sf.LineAlignment = StringAlignment.Center;
                sf.FormatFlags = StringFormatFlags.NoWrap;
                g.DrawString(Text, Font, tb, new RectangleF(0, 0, Width, Height), sf);
            }
            FocusRing(g, r, rad);
        }

        protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }
        protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }
    }

    public static class Native
    {
        [DllImport("user32.dll")]
        public static extern bool DestroyIcon(IntPtr hIcon);

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [DllImport("user32.dll")]
        static extern uint GetDpiForSystem();

        [StructLayout(LayoutKind.Sequential)]
        struct POINT { public int X; public int Y; }

        [DllImport("user32.dll")]
        static extern IntPtr MonitorFromPoint(POINT pt, uint flags);

        [DllImport("shcore.dll")]
        static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

        /// Testo nitido a 125-150%: DPI per monitor (v2), altrimenti di sistema.
        /// Va chiamata prima di creare qualsiasi finestra.
        public static string EnableDpiAwareness()
        {
            try { if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return "per-monitor-v2"; } catch { }
            try { if (SetProcessDPIAware()) return "system"; } catch { }
            return "unchanged";
        }

        /// DPI del monitor che contiene il punto (in pixel dello schermo).
        public static int DpiAt(int x, int y)
        {
            try
            {
                POINT p; p.X = x; p.Y = y;
                IntPtr mon = MonitorFromPoint(p, 2);
                uint dx, dy;
                if (mon != IntPtr.Zero && GetDpiForMonitor(mon, 0, out dx, out dy) == 0 && dx > 0) return (int)dx;
            }
            catch { }
            try { return (int)GetDpiForSystem(); } catch { }
            return 96;
        }
    }

    /// Scorciatoia globale (RegisterHotKey) su una finestra solo-messaggi.
    public class HotKeyWindow : NativeWindow, IDisposable
    {
        [DllImport("user32.dll", SetLastError = true)]
        static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll")]
        static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        const int WM_HOTKEY = 0x0312;
        const uint MOD_NOREPEAT = 0x4000;
        bool registered;

        public event EventHandler Pressed;

        public HotKeyWindow()
        {
            CreateParams cp = new CreateParams();
            cp.Parent = new IntPtr(-3); // HWND_MESSAGE
            CreateHandle(cp);
        }

        public bool IsRegistered { get { return registered; } }

        /// false se la combinazione è già usata da un altro programma.
        public bool Register(uint modifiers, uint vk)
        {
            Unregister();
            registered = RegisterHotKey(Handle, 1, modifiers | MOD_NOREPEAT, vk);
            return registered;
        }

        public void Unregister()
        {
            if (registered) { UnregisterHotKey(Handle, 1); registered = false; }
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY)
            {
                EventHandler h = Pressed;
                if (h != null) h(this, EventArgs.Empty);
                return;
            }
            base.WndProc(ref m);
        }

        public void Dispose()
        {
            Unregister();
            if (Handle != IntPtr.Zero) DestroyHandle();
        }
    }
}
