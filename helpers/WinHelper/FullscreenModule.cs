// =============================================================================
//  FullscreenModule.cs — Detección de aplicaciones en pantalla completa
// -----------------------------------------------------------------------------
//  Detecta cuando un juego, reproductor de vídeo o presentación pasa a
//  pantalla completa para que Notch se oculte y no moleste ni consuma recursos.
//
//  Estrategia basada en eventos (0% CPU en reposo, sin sondeos/polling):
//    1. Registra una AppBar (SHAppBarMessage con ABM_NEW) para recibir
//       notificaciones directas del sistema: ABN_FULLSCREENAPP.
//    2. Confirma el estado con SHQueryUserNotificationState:
//       - QUNS_BUSY (2)
//       - QUNS_RUNNING_D3D_FULL_SCREEN (3)
//       - QUNS_PRESENTATION_MODE (4)
//    3. Como respaldo, escucha EVENT_SYSTEM_FOREGROUND con SetWinEventHook
//       para validar cambios de ventana activa únicamente al cambiar de app.
//
//  Salida JSON hacia Electron:
//    {"type":"fullscreen","active":true}
//    {"type":"fullscreen","active":false}
// =============================================================================

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace WinHelper;

internal static class FullscreenModule
{
    private const string WindowClassName = "NotchFullscreenListener";
    private const uint WmUser = 0x0400;
    private const uint WmAppBarCallback = WmUser + 101;

    // Constantes de AppBar (Shell32)
    private const uint AbmNew = 0x00000000;
    private const uint AbmRemove = 0x00000001;
    private const uint AbnFullScreenApp = 0x00000002;

    // Constantes de WinEvent
    private const uint EventSystemForeground = 0x0003;
    private const uint WinEventOutOfContext = 0x0000;

    // Monitor
    private const uint MonitorDefaultToNearest = 2;

    private static readonly WindowProc Procedure = WindowProcedure;
    private static readonly WinEventDelegate ForeGroundDelegate = OnForegroundChanged;

    private static Thread? _thread;
    private static IntPtr _hwnd;
    private static IntPtr _hook;
    private static bool _appBarRegistered;
    private static volatile bool _isFullscreen;
    public static bool IsFullscreen => _isFullscreen;
    private static readonly object StateLock = new();

    /// <summary>Inicia el detector de pantalla completa en su propio hilo.</summary>
    public static void Start()
    {
        lock (StateLock)
        {
            if (_thread != null) return;
            _thread = new Thread(RunMessageLoop)
            {
                Name = "NotchFullscreenDetector",
                IsBackground = true,
            };
            _thread.SetApartmentState(ApartmentState.STA);
            _thread.Start();
        }
    }

    private static void RunMessageLoop()
    {
        try
        {
            var wndClass = new WNDCLASSEX
            {
                cbSize = (uint)Marshal.SizeOf<WNDCLASSEX>(),
                lpfnWndProc = Marshal.GetFunctionPointerForDelegate(Procedure),
                hInstance = GetModuleHandle(null),
                lpszClassName = WindowClassName,
            };

            RegisterClassEx(ref wndClass);

            _hwnd = CreateWindowEx(
                0,
                WindowClassName,
                "NotchFullscreenWindow",
                0,
                0, 0, 0, 0,
                IntPtr.Zero,
                IntPtr.Zero,
                GetModuleHandle(null),
                IntPtr.Zero
            );

            if (_hwnd != IntPtr.Zero)
            {
                RegisterAppBar(_hwnd);

                // Enganchamos el evento de cambio de ventana en primer plano
                _hook = SetWinEventHook(
                    EventSystemForeground,
                    EventSystemForeground,
                    IntPtr.Zero,
                    ForeGroundDelegate,
                    0,
                    0,
                    WinEventOutOfContext
                );

                // Comprobación inicial de estado
                CheckFullscreenState(false);
            }

            while (GetMessage(out var msg, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }
        }
        catch (Exception ex)
        {
            Program.LogError($"Error en FullscreenModule: {ex.Message}");
        }
        finally
        {
            Cleanup();
        }
    }

    private static void RegisterAppBar(IntPtr hwnd)
    {
        var abd = new APPBARDATA
        {
            cbSize = (uint)Marshal.SizeOf<APPBARDATA>(),
            hWnd = hwnd,
            uCallbackMessage = WmAppBarCallback,
        };

        var result = SHAppBarMessage(AbmNew, ref abd);
        _appBarRegistered = result != UIntPtr.Zero;
    }

    private static void UnregisterAppBar(IntPtr hwnd)
    {
        if (!_appBarRegistered) return;
        var abd = new APPBARDATA
        {
            cbSize = (uint)Marshal.SizeOf<APPBARDATA>(),
            hWnd = hwnd,
        };
        SHAppBarMessage(AbmRemove, ref abd);
        _appBarRegistered = false;
    }

    private static void Cleanup()
    {
        if (_hook != IntPtr.Zero)
        {
            UnhookWinEvent(_hook);
            _hook = IntPtr.Zero;
        }

        if (_hwnd != IntPtr.Zero)
        {
            UnregisterAppBar(_hwnd);
            DestroyWindow(_hwnd);
            _hwnd = IntPtr.Zero;
        }

        UnregisterClass(WindowClassName, GetModuleHandle(null));
    }

    private static IntPtr WindowProcedure(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        if (msg == WmAppBarCallback)
        {
            if (wParam.ToInt64() == AbnFullScreenApp)
            {
                // lParam != 0 indica pantalla completa activada
                var entering = lParam != IntPtr.Zero;
                CheckFullscreenState(entering);
                return IntPtr.Zero;
            }
        }

        return DefWindowProc(hwnd, msg, wParam, lParam);
    }

    private static void OnForegroundChanged(
        IntPtr hWinEventHook,
        uint eventType,
        IntPtr hwnd,
        int idObject,
        int idChild,
        uint dwEventThread,
        uint dwmsEventTime)
    {
        // Al cambiar de ventana, verificamos si la ventana activa está en pantalla completa
        CheckFullscreenState(null);
    }

    private static void CheckFullscreenState(bool? hintEntering)
    {
        try
        {
            bool fullscreen = false;

            // 1. Verificar notificación del sistema (QUNS)
            if (SHQueryUserNotificationState(out var state) == 0)
            {
                if (state is QUERY_USER_NOTIFICATION_STATE.QUNS_RUNNING_D3D_FULL_SCREEN
                    or QUERY_USER_NOTIFICATION_STATE.QUNS_BUSY
                    or QUERY_USER_NOTIFICATION_STATE.QUNS_PRESENTATION_MODE)
                {
                    fullscreen = true;
                }
            }

            // 2. Si QUNS no es concluyente o recibimos pista de AppBar, verificar ventana en primer plano
            if (!fullscreen)
            {
                var fgHwnd = GetForegroundWindow();
                if (fgHwnd != IntPtr.Zero && !IsDesktopOrShellWindow(fgHwnd))
                {
                    if (GetWindowRect(fgHwnd, out var windowRect))
                    {
                        var hMonitor = MonitorFromWindow(fgHwnd, MonitorDefaultToNearest);
                        if (hMonitor != IntPtr.Zero)
                        {
                            var mi = new MONITORINFO { cbSize = (uint)Marshal.SizeOf<MONITORINFO>() };
                            if (GetMonitorInfo(hMonitor, ref mi))
                            {
                                // Comprueba si el rectángulo de la ventana cubre totalmente el monitor
                                if (windowRect.left <= mi.rcMonitor.left &&
                                    windowRect.top <= mi.rcMonitor.top &&
                                    windowRect.right >= mi.rcMonitor.right &&
                                    windowRect.bottom >= mi.rcMonitor.bottom)
                                {
                                    // Verificamos si no está minimizada
                                    if (!IsIconic(fgHwnd))
                                    {
                                        fullscreen = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (hintEntering.HasValue && hintEntering.Value)
            {
                fullscreen = true;
            }

            lock (StateLock)
            {
                if (fullscreen != _isFullscreen)
                {
                    _isFullscreen = fullscreen;
                    Program.Send(new { type = "fullscreen", active = fullscreen });
                }
            }
        }
        catch
        {
            // Fallo silencioso y defensivo
        }
    }

    private static bool IsDesktopOrShellWindow(IntPtr hwnd)
    {
        var className = new StringBuilder(256);
        if (GetClassName(hwnd, className, className.Capacity) > 0)
        {
            var name = className.ToString();
            return name is "Progman" or "WorkerW" or "Shell_TrayWnd" or WindowClassName;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Declaraciones Win32 / PInvoke
    // -------------------------------------------------------------------------

    private delegate IntPtr WindowProc(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);

    private delegate void WinEventDelegate(
        IntPtr hWinEventHook,
        uint eventType,
        IntPtr hwnd,
        int idObject,
        int idChild,
        uint dwEventThread,
        uint dwmsEventTime);

    [StructLayout(LayoutKind.Sequential)]
    private struct APPBARDATA
    {
        public uint cbSize;
        public IntPtr hWnd;
        public uint uCallbackMessage;
        public uint uEdge;
        public RECT rc;
        public IntPtr lParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int left;
        public int top;
        public int right;
        public int bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public uint cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASSEX
    {
        public uint cbSize;
        public uint style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string lpszMenuName;
        public string lpszClassName;
        public IntPtr hIconSm;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pt_x;
        public int pt_y;
    }

    private enum QUERY_USER_NOTIFICATION_STATE
    {
        QUNS_NOT_PRESENT = 1,
        QUNS_BUSY = 2,
        QUNS_RUNNING_D3D_FULL_SCREEN = 3,
        QUNS_PRESENTATION_MODE = 4,
        QUNS_ACCEPTS_NOTIFICATIONS = 5,
        QUNS_QUIET_TIME = 6,
        QUNS_APP = 7,
    }

    [DllImport("shell32.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern UIntPtr SHAppBarMessage(uint dwMessage, ref APPBARDATA pData);

    [DllImport("shell32.dll", CallingConvention = CallingConvention.StdCall)]
    private static extern int SHQueryUserNotificationState(out QUERY_USER_NOTIFICATION_STATE pquns);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern ushort RegisterClassEx(ref WNDCLASSEX lpwcx);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool UnregisterClass(string lpClassName, IntPtr hInstance);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateWindowEx(
        uint dwExStyle,
        string lpClassName,
        string lpWindowName,
        uint dwStyle,
        int x, int y, int nWidth, int nHeight,
        IntPtr hWndParent,
        IntPtr hMenu,
        IntPtr hInstance,
        IntPtr lpParam);

    [DllImport("user32.dll")]
    private static extern bool DestroyWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr DefWindowProc(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern sbyte GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll")]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    [DllImport("user32.dll")]
    private static extern IntPtr SetWinEventHook(
        uint eventMin,
        uint eventMax,
        IntPtr hmodWinEventProc,
        WinEventDelegate lpfnWinEventProc,
        uint idProcess,
        uint idThread,
        uint dwFlags);

    [DllImport("user32.dll")]
    private static extern bool UnhookWinEvent(IntPtr hWinEventHook);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);
}
