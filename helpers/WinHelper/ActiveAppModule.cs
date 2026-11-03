// =============================================================================
//  ActiveAppModule.cs — Seguimiento de ventana activa y pegado en la app (Fase 14)
// -----------------------------------------------------------------------------
//  Detecta la aplicación en primer plano previa para:
//    1. Mostrar el chip de contexto «Viendo {AppName}» en la caja de comandos de IA.
//    2. Recordar el HWND de la ventana anterior para restaurar el foco y enviar
//       Ctrl+V con SendInput cuando el usuario pulsa «Pegar en la app».
// =============================================================================

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace WinHelper;

internal static class ActiveAppModule
{
    private const uint InputKeyboard = 1;
    private const uint KeyEventFKeyUp = 0x0002;
    private const ushort VkControl = 0x11;
    private const ushort VkKeyC = 0x43;
    private const ushort VkKeyV = 0x56;

    private static IntPtr _lastAppHwnd;
    private static string _lastAppName = "";
    private static string _lastAppTitle = "";
    private static volatile bool _enabled;
    private static readonly object SyncLock = new();

    public static void Start()
    {
        // El seguimiento se activa cuando Notch lo solicita ("foreground on")
    }

    public static void OnForegroundChanged(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) return;

        try
        {
            // Ignorar ventanas del sistema / shell
            var className = new StringBuilder(256);
            if (GetClassName(hwnd, className, className.Capacity) > 0)
            {
                var cls = className.ToString();
                if (cls is "Progman" or "WorkerW" or "Shell_TrayWnd" or "NotchKeyboardListener" or "NotchFullscreenDetector")
                {
                    return;
                }
            }

            // Obtener el proceso de la ventana
            GetWindowThreadProcessId(hwnd, out var pid);
            if (pid == 0) return;

            using var proc = Process.GetProcessById((int)pid);
            var procName = proc.ProcessName;

            // Ignorar ventanas de Notch y de Electron
            if (procName.Equals("electron", StringComparison.OrdinalIgnoreCase) ||
                procName.Equals("notch", StringComparison.OrdinalIgnoreCase) ||
                procName.Equals("WinHelper", StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            var title = "";
            try { title = proc.MainWindowTitle; } catch { }

            lock (SyncLock)
            {
                _lastAppHwnd = hwnd;
                _lastAppName = procName;
                _lastAppTitle = title;
            }

            if (_enabled)
            {
                Program.Send(new
                {
                    type = "foreground",
                    appName = FriendlyAppName(procName),
                    rawName = procName,
                    title
                });
            }
        }
        catch
        {
            // Proceso cerrado o sin permisos de acceso
        }
    }

    public static bool TryRunCommand(string command, string? argument)
    {
        switch (command)
        {
            case "foreground":
                switch (argument?.Trim().ToLowerInvariant())
                {
                    case "on":
                        _enabled = true;
                        EmitCurrent();
                        break;
                    case "off":
                        _enabled = false;
                        break;
                    default:
                        Program.LogError("Uso: foreground on | foreground off");
                        break;
                }
                return true;

            case "get-foreground":
                EmitCurrent();
                return true;

            case "paste-to-app":
                PasteToLastApp();
                return true;

            case "copy-selection":
                CopySelection();
                return true;

            default:
                return false;
        }
    }

    private static void EmitCurrent()
    {
        lock (SyncLock)
        {
            Program.Send(new
            {
                type = "foreground",
                appName = FriendlyAppName(_lastAppName),
                rawName = _lastAppName,
                title = _lastAppTitle
            });
        }
    }

    public static void PasteToLastApp()
    {
        IntPtr targetHwnd;
        lock (SyncLock)
        {
            targetHwnd = _lastAppHwnd;
        }

        if (targetHwnd != IntPtr.Zero && IsWindow(targetHwnd))
        {
            ForceForeground(targetHwnd);
            Thread.Sleep(80); // Breve espera para que Windows transfiera el foco activo
        }

        SendKeyCombination(VkControl, VkKeyV);
    }

    public static void CopySelection()
    {
        SendKeyCombination(VkControl, VkKeyC);
    }

    private static void ForceForeground(IntPtr targetHwnd)
    {
        try
        {
            var currentFg = GetForegroundWindow();
            var currentThread = GetWindowThreadProcessId(currentFg, out _);
            var targetThread = GetWindowThreadProcessId(targetHwnd, out _);
            var myThread = GetCurrentThreadId();

            if (currentThread != targetThread && currentThread != 0 && targetThread != 0)
            {
                AttachThreadInput(myThread, targetThread, true);
                AttachThreadInput(currentThread, targetThread, true);
                SetForegroundWindow(targetHwnd);
                BringWindowToTop(targetHwnd);
                AttachThreadInput(currentThread, targetThread, false);
                AttachThreadInput(myThread, targetThread, false);
            }
            else
            {
                SetForegroundWindow(targetHwnd);
                BringWindowToTop(targetHwnd);
            }
        }
        catch
        {
            SetForegroundWindow(targetHwnd);
        }
    }

    private static void SendKeyCombination(ushort modifier, ushort key)
    {
        var inputs = new INPUT[4];

        // Modifier Down
        inputs[0] = new INPUT
        {
            type = InputKeyboard,
            u = new InputUnion
            {
                ki = new KEYBDINPUT { wVk = modifier, wScan = 0, dwFlags = 0, time = 0, dwExtraInfo = IntPtr.Zero }
            }
        };

        // Key Down
        inputs[1] = new INPUT
        {
            type = InputKeyboard,
            u = new InputUnion
            {
                ki = new KEYBDINPUT { wVk = key, wScan = 0, dwFlags = 0, time = 0, dwExtraInfo = IntPtr.Zero }
            }
        };

        // Key Up
        inputs[2] = new INPUT
        {
            type = InputKeyboard,
            u = new InputUnion
            {
                ki = new KEYBDINPUT { wVk = key, wScan = 0, dwFlags = KeyEventFKeyUp, time = 0, dwExtraInfo = IntPtr.Zero }
            }
        };

        // Modifier Up
        inputs[3] = new INPUT
        {
            type = InputKeyboard,
            u = new InputUnion
            {
                ki = new KEYBDINPUT { wVk = modifier, wScan = 0, dwFlags = KeyEventFKeyUp, time = 0, dwExtraInfo = IntPtr.Zero }
            }
        };

        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
    }

    private static string FriendlyAppName(string processName)
    {
        if (string.IsNullOrWhiteSpace(processName)) return "Ventana previa";
        var lower = processName.ToLowerInvariant();
        return lower switch
        {
            "chrome" => "Google Chrome",
            "msedge" => "Microsoft Edge",
            "firefox" => "Mozilla Firefox",
            "code" => "Visual Studio Code",
            "devenv" => "Visual Studio",
            "notepad" => "Bloc de notas",
            "notepad++" => "Notepad++",
            "spotify" => "Spotify",
            "discord" => "Discord",
            "slack" => "Slack",
            "explorer" => "Explorador de archivos",
            "windowsterminal" => "Terminal de Windows",
            "powershell" => "PowerShell",
            "cmd" => "Símbolo del sistema",
            "word" or "winword" => "Microsoft Word",
            "excel" => "Microsoft Excel",
            "teams" => "Microsoft Teams",
            _ => char.ToUpperInvariant(processName[0]) + processName.Substring(1)
        };
    }

    // -------------------------------------------------------------------------
    // Win32 P/Invoke
    // -------------------------------------------------------------------------

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint nInputs, [MarshalAs(UnmanagedType.LPArray), In] INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, [MarshalAs(UnmanagedType.Bool)] bool fAttach);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
}
