// ClaudeLimitsTray.exe: avvia il programma tray (ClaudeLimitsTray.ps1) dentro
// un proprio processo, così in Gestione attività compare "Claude Limits Tray"
// invece di "Windows PowerShell" e non serve la finestra nascosta di wscript.
// Compilato in locale da tray\build-exe.ps1 con il compilatore C# di Windows.

using System;
using System.IO;
using System.Management.Automation;
using System.Management.Automation.Runspaces;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Claude Limits Tray")]
[assembly: AssemblyDescription("Limiti di utilizzo di Claude nell'area di notifica")]
[assembly: AssemblyProduct("Claude Limits Tray")]
[assembly: AssemblyCompany("claude-usage-bar-mod (open source)")]
[assembly: AssemblyCopyright("MIT License")]
[assembly: AssemblyVersion(TrayHost.Version)]
[assembly: AssemblyFileVersion(TrayHost.Version)]

static class TrayHost
{
    // Sostituita da build-exe.ps1 con la versione della mod.
    public const string Version = "0.0.0.0";

    static string FindScript()
    {
        string dir = AppDomain.CurrentDomain.BaseDirectory;
        // tray\bin\ClaudeLimitsTray.exe → tray\ClaudeLimitsTray.ps1
        string[] candidates = {
            Path.Combine(dir, "ClaudeLimitsTray.ps1"),
            Path.GetFullPath(Path.Combine(dir, "..", "ClaudeLimitsTray.ps1")),
        };
        foreach (string c in candidates) if (File.Exists(c)) return c;
        return null;
    }

    static void Log(string text)
    {
        try
        {
            string file = Path.Combine(Path.GetTempPath(), "claude-tray-error.log");
            File.AppendAllText(file, "[" + DateTime.Now.ToString("s") + "] HOST: " + text + Environment.NewLine);
        }
        catch { }
    }

    [STAThread]
    static int Main()
    {
        string script = FindScript();
        if (script == null)
        {
            MessageBox.Show("ClaudeLimitsTray.ps1 non trovato accanto al programma.", "Claude Limits Tray", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        try
        {
            InitialSessionState iss = InitialSessionState.CreateDefault();
            // Solo per questo processo, come "powershell -ExecutionPolicy Bypass -File".
            iss.ExecutionPolicy = Microsoft.PowerShell.ExecutionPolicy.Bypass;
            iss.ThreadOptions = PSThreadOptions.UseCurrentThread;
            iss.ApartmentState = System.Threading.ApartmentState.STA;
            using (Runspace rs = RunspaceFactory.CreateRunspace(iss))
            {
                rs.ThreadOptions = PSThreadOptions.UseCurrentThread;
                rs.ApartmentState = System.Threading.ApartmentState.STA;
                rs.Open();
                using (PowerShell ps = PowerShell.Create())
                {
                    ps.Runspace = rs;
                    ps.AddCommand(script);
                    ps.Invoke();
                    if (ps.HadErrors)
                    {
                        foreach (ErrorRecord e in ps.Streams.Error) Log(e.ToString() + " " + e.ScriptStackTrace);
                    }
                }
            }
            return 0;
        }
        catch (Exception ex)
        {
            Log(ex.ToString());
            MessageBox.Show("Il programma si è fermato per un errore:\n\n" + ex.Message, "Claude Limits Tray", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
