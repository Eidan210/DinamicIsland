// =============================================================================
//  KeyboardModule.cs — Gestos de teclado globales con Raw Input (Fase 11)
// -----------------------------------------------------------------------------
//  Detecta combinaciones clave del teclado sin interponerse en el camino de las
//  pulsaciones ni registrar texto (privacidad total: NUNCA se guardan teclas):
//    • shift-down y shift-up (Shift izquierdo o derecho)
//    • caps-lock (estado activo/inactivo de Bloq Mayús)
//    • copy (Ctrl+C), cut (Ctrl+X) y paste (Ctrl+V)
//    • right-ctrl-double-tap (dos pulsaciones de Ctrl derecho en < 350 ms)
//
//  Usa Raw Input con RIDEV_INPUTSINK en un hilo STA dedicado y ventana oculta.
//  No añade lag a juegos y se suspende automáticamente en pantalla completa.
// =============================================================================

using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace WinHelper;

internal static class KeyboardModule
{
    private const string WindowClassName = "NotchKeyboardListener";
    private const uint WmInput = 0x00FF;
    private const uint RidInput = 0x10000003;
    private const uint RidevInputSink = 0x00000100;
    private const ushort UsagePageGeneric = 0x01;
    private const ushort UsageKeyboard = 0x06;

    // Teclas virtuales
    private const ushort VkShift = 0x10;
    private const ushort VkControl = 0x11;
    private const ushort VkCapital = 0x14; // Bloq Mayús
    private const ushort VkLShift = 0xA0;
    private const ushort VkRShift = 0xA1;
    private const ushort VkRControl = 0xA3;
    private const ushort VkKeyC = 0x43;
    private const ushort VkKeyX = 0x58;
    private const ushort VkKeyV = 0x56;

    private const ushort RiKeyMake = 0; // Pulsada (down)
    private const ushort RiKeyBreak = 1; // Soltada (up)

    private const long DoubleTapThresholdMs = 350;

    private static readonly IntPtr HwndMessage = new(-3);
    private static readonly WindowProc Procedure = WindowProcedure;
    private static readonly object StartLock = new();

    private static Thread? _thread;
    private static volatile bool _enabled = true;
    private static volatile string? _startError;

    // Estado de detección
    private static bool _shiftDown;
    private static long _lastRightCtrlTime;
    private static bool _interveningKey;

    public static void Start()
    {
        lock (StartLock)
        {
            if (_thread != null) return;
            _thread = new Thread(RunMessageLoop)
            {
                Name = "Notch-Keyboard",
                IsBackground = true,
            };
            _thread.SetApartmentState(ApartmentState.STA);
            _thread.Start();
        }
    }

    public static bool TryRunCommand(string command, string? argument)
    {
        if (command != "keyboard") return false;
        switch (argument?.Trim().ToLowerInvariant())
        {
            case "on":
                _enabled = true;
                Program.Send(new { type = "keyboard-status", state = "on" });
                break;
            case "off":
                _enabled = false;
                Program.Send(new { type = "keyboard-status", state = "off" });
                break;
            default:
                Program.LogError("Uso: keyboard on | keyboard off");
                break;
        }
        return true;
    }

    private static void RunMessageLoop()
    {
        try
        {
            var wndClass = new WndClassEx
            {
                cbSize = (uint)Marshal.SizeOf<WndClassEx>(),
                lpfnWndProc = Procedure,
                hInstance = Process.GetCurrentProcess().Handle,
                lpszClassName = WindowClassName,
            };

            var atom = RegisterClassExW(ref wndClass);
            if (atom == 0 && Marshal.GetLastWin32Error() != 1410) // 1410 = ERROR_CLASS_ALREADY_EXISTS
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }

            var window = CreateWindowExW(
                0,
                WindowClassName,
                WindowClassName,
                0,
                0, 0, 0, 0,
                HwndMessage,
                IntPtr.Zero,
                IntPtr.Zero,
                IntPtr.Zero
            );

            if (window == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());

            // Registrar Raw Input para teclado global con INPUTSINK
            var rid = new RawInputDevice[]
            {
                new()
                {
                    usUsagePage = UsagePageGeneric,
                    usUsage = UsageKeyboard,
                    dwFlags = RidevInputSink,
                    hwndTarget = window,
                }
            };

            if (!RegisterRawInputDevices(rid, (uint)rid.Length, (uint)Marshal.SizeOf<RawInputDevice>()))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error());
            }
            Program.Send(new { type = "keyboard-status", state = "on" });

            while (GetMessageW(out var message, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref message);
                DispatchMessageW(ref message);
            }
        }
        catch (Exception ex)
        {
            _startError = ex.Message;
            Program.LogError("No se pudo iniciar KeyboardModule: " + ex.Message);
            Program.Send(new { type = "keyboard-status", state = "error", message = ex.Message });
        }
    }

    private static IntPtr WindowProcedure(IntPtr window, uint message, IntPtr wParam, IntPtr lParam)
    {
        if (message == WmInput)
        {
            HandleRawInput(lParam);
            return DefWindowProcW(window, message, wParam, lParam);
        }
        return DefWindowProcW(window, message, wParam, lParam);
    }

    private static void HandleRawInput(IntPtr hRawInput)
    {
        if (!_enabled || FullscreenModule.IsFullscreen) return;

        uint size = 0;
        var headerSize = (uint)Marshal.SizeOf<RawInputHeader>();
        GetRawInputData(hRawInput, RidInput, IntPtr.Zero, ref size, headerSize);
        if (size == 0) return;

        var buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            if (GetRawInputData(hRawInput, RidInput, buffer, ref size, headerSize) != size)
                return;

            var header = Marshal.PtrToStructure<RawInputHeader>(buffer);
            if (header.dwType != 1) return; // 1 = RIM_TYPEKEYBOARD

            var keyboardPtr = IntPtr.Add(buffer, (int)headerSize);
            var keyboard = Marshal.PtrToStructure<RawInputKeyboard>(keyboardPtr);

            ProcessKey(keyboard.VKey, keyboard.Flags);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static void ProcessKey(ushort vkey, ushort flags)
    {
        var isDown = (flags & RiKeyBreak) == 0;
        var now = Program.Now();

        // 1. Shift
        if (vkey is VkShift or VkLShift or VkRShift)
        {
            if (isDown && !_shiftDown)
            {
                _shiftDown = true;
                Program.Send(new { type = "keyboard", action = "shift", down = true });
            }
            else if (!isDown && _shiftDown)
            {
                _shiftDown = false;
                Program.Send(new { type = "keyboard", action = "shift", down = false });
            }
            return;
        }

        // 2. Bloq Mayús (Caps Lock)
        if (vkey == VkCapital && isDown)
        {
            var isCapsActive = (GetKeyState(VkCapital) & 1) != 0;
            Program.Send(new { type = "keyboard", action = "caps-lock", active = isCapsActive });
            return;
        }

        // 3. Doble Ctrl derecho
        if (vkey == VkRControl)
        {
            if (isDown)
            {
                if (!_interveningKey && now - _lastRightCtrlTime <= DoubleTapThresholdMs && _lastRightCtrlTime > 0)
                {
                    _lastRightCtrlTime = 0;
                    Program.Send(new { type = "keyboard", action = "right-ctrl-double-tap" });
                }
                else
                {
                    _lastRightCtrlTime = now;
                    _interveningKey = false;
                }
            }
            return;
        }

        // 4. Atajos con Ctrl (Copy, Cut, Paste)
        var ctrlHeld = (GetKeyState(VkControl) & 0x8000) != 0;
        if (ctrlHeld && isDown)
        {
            if (vkey == VkKeyC)
            {
                Program.Send(new { type = "keyboard", action = "copy" });
                return;
            }
            if (vkey == VkKeyX)
            {
                Program.Send(new { type = "keyboard", action = "cut" });
                return;
            }
            if (vkey == VkKeyV)
            {
                Program.Send(new { type = "keyboard", action = "paste" });
                return;
            }
        }

        // Cualquier otra tecla anula la racha del doble Ctrl
        if (isDown && vkey != VkControl && vkey != VkRControl)
        {
            _interveningKey = true;
        }
    }

    // -------------------------------------------------------------------------
    // Win32 P/Invoke
    // -------------------------------------------------------------------------

    private delegate IntPtr WindowProc(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WndClassEx
    {
        public uint cbSize;
        public uint style;
        public WindowProc lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        public string? lpszMenuName;
        public string lpszClassName;
        public IntPtr hIconSm;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputDevice
    {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public IntPtr hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputHeader
    {
        public uint dwType;
        public uint dwSize;
        public IntPtr hDevice;
        public IntPtr wParam;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RawInputKeyboard
    {
        public ushort MakeCode;
        public ushort Flags;
        public ushort Reserved;
        public ushort VKey;
        public uint Message;
        public uint ExtraInformation;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeMessage
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int ptX;
        public int ptY;
    }

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern ushort RegisterClassExW(ref WndClassEx lpwcx);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateWindowExW(
        uint dwExStyle, string lpClassName, string lpWindowName, uint dwStyle,
        int x, int y, int nWidth, int nHeight, IntPtr hWndParent, IntPtr hMenu, IntPtr hInstance, IntPtr lpParam);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterRawInputDevices(
        [MarshalAs(UnmanagedType.LPArray, SizeParamIndex = 1)] RawInputDevice[] pRawInputDevices,
        uint uiNumDevices, uint cbSize);

    [DllImport("user32.dll")]
    private static extern uint GetRawInputData(IntPtr hRawInput, uint uiCommand, IntPtr pData, ref uint pcbSize, uint cbSizeHeader);

    [DllImport("user32.dll")]
    private static extern sbyte GetMessageW(out NativeMessage lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TranslateMessage(ref NativeMessage lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessageW(ref NativeMessage lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DefWindowProcW(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern short GetKeyState(int nVirtKey);
}
