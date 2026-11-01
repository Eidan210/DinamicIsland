// =============================================================================
//  ClipboardModule.cs — Lo que copias (solo texto)
// -----------------------------------------------------------------------------
//  Windows avisa a quien se lo pida cada vez que cambia el portapapeles
//  (AddClipboardFormatListener → mensaje WM_CLIPBOARDUPDATE): no preguntamos
//  nada cada X segundos. Ese aviso llega a una ventana, así que creamos una
//  invisible "de solo mensajes" (no se ve, ni sale en la barra de tareas ni en
//  Alt+Tab) con su propio hilo.
//
//  Solo trabaja si Notch lo pide ("clipboard on"): con el historial apagado o
//  en pausa no se mira el portapapeles (y, si nunca se encendió, ni se crea
//  la ventana).
//
//  Solo lee TEXTO, y NUNCA lo que un programa marca como privado (lo mismo que
//  respeta el historial de Windows, Win+V):
//    • ExcludeClipboardContentFromMonitorProcessing: "que nadie lo vigile"
//      (lo ponen gestores de contraseñas como KeePass, 1Password o Bitwarden).
//    • CanIncludeInClipboardHistory = 0: "que no vaya a ningún historial".
//    • Clipboard Viewer Ignore: la forma antigua de pedir lo mismo.
//  Los textos de más de 100.000 caracteres (un archivo entero) tampoco.
//
//  Salida:
//    {"type":"clipboard","text":"...","source":"Google Chrome"}
//        source: el programa que lo copió ("" si no se sabe)
//    {"type":"clipboard-status","state":"on"}   escuchando ("off": en pausa;
//        "error": no se pudo, con "message")
//  Órdenes: clipboard on | clipboard off
// =============================================================================

using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace WinHelper;

internal static class ClipboardModule
{
    // ⚠️ Igual que MAX_TEXT_CHARS en main/clipboard.js
    private const int MaxTextChars = 100_000;
    private const int MaxSourceChars = 60;

    // Tras el aviso esperamos un instante a que el programa termine de copiar
    // (algunos escriben el portapapeles en varios pasos y llegan varios avisos
    // seguidos: así se juntan en uno). No es un sondeo: solo ocurre tras un aviso.
    private const uint SettleMs = 60;
    // Si otro programa tiene el portapapeles abierto, lo reintentamos un poco después.
    private const uint RetryMs = 80;
    private const int MaxRetries = 5;

    private const string WindowClassName = "NotchClipboardListener";
    private const uint WmClipboardUpdate = 0x031D;
    private const uint WmTimer = 0x0113;
    private const uint CfUnicodeText = 13;
    private const uint ProcessQueryLimitedInformation = 0x1000;
    private static readonly IntPtr HwndMessage = new(-3); // padre de las ventanas "de solo mensajes"
    private static readonly UIntPtr ReadTimer = new(1);

    // El procedimiento de la ventana: lo guardamos en un campo para que el
    // recolector de basura no lo borre mientras Windows lo llama.
    private static readonly WindowProc Procedure = WindowProcedure;
    private static readonly object StartLock = new();

    private static Thread? _thread;
    private static volatile bool _enabled; // ¿Notch quiere que miremos?
    private static volatile bool _listening; // ¿la ventana ya escucha?
    private static volatile string? _startError;
    private static volatile uint _lastSequence; // el último cambio que ya vimos
    private static int _retries;

    // Formatos "privados": Windows les da un número al registrarlos por su nombre.
    private static uint _excludeFormat;
    private static uint _historyFormat;
    private static uint _viewerIgnoreFormat;

    /// <summary>¿Es una orden de este módulo? Si lo es, la ejecuta y devuelve true.</summary>
    public static bool TryRunCommand(string command, string? argument)
    {
        if (command != "clipboard") return false;
        switch (argument?.Trim().ToLowerInvariant())
        {
            case "on":
                Enable();
                break;
            case "off":
                _enabled = false;
                Program.Send(new { type = "clipboard-status", state = "off" });
                break;
            default:
                Program.LogError("Uso: clipboard on | clipboard off");
                break;
        }
        return true;
    }

    private static void Enable()
    {
        // Lo que ya estaba copiado antes de encender no cuenta: solo lo que copies desde ahora.
        _lastSequence = GetClipboardSequenceNumber();
        _enabled = true;

        lock (StartLock)
        {
            if (_thread is null)
            {
                // La ventana (y sus avisos) viven en su propio hilo, con su bucle de mensajes.
                // Avisará ella misma cuando esté escuchando.
                _thread = new Thread(WindowThread) { IsBackground = true, Name = "Portapapeles" };
                _thread.SetApartmentState(ApartmentState.STA);
                _thread.Start();
                return;
            }
        }

        if (_listening) Program.Send(new { type = "clipboard-status", state = "on" });
        else if (_startError is { } error) Program.Send(new { type = "clipboard-status", state = "error", message = error });
    }

    // -------------------------------------------------------------------------
    // La ventana invisible y su bucle de mensajes
    // -------------------------------------------------------------------------

    private static void WindowThread()
    {
        try
        {
            var instance = GetModuleHandleW(null);
            var windowClass = new WndClassEx
            {
                Size = (uint)Marshal.SizeOf<WndClassEx>(),
                Procedure = Marshal.GetFunctionPointerForDelegate(Procedure),
                Instance = instance,
                ClassName = WindowClassName,
            };
            if (RegisterClassExW(ref windowClass) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());

            var window = CreateWindowExW(0, WindowClassName, "Notch", 0, 0, 0, 0, 0, HwndMessage, IntPtr.Zero, instance, IntPtr.Zero);
            if (window == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());

            _excludeFormat = RegisterClipboardFormatW("ExcludeClipboardContentFromMonitorProcessing");
            _historyFormat = RegisterClipboardFormatW("CanIncludeInClipboardHistory");
            _viewerIgnoreFormat = RegisterClipboardFormatW("Clipboard Viewer Ignore");

            if (!AddClipboardFormatListener(window)) throw new Win32Exception(Marshal.GetLastWin32Error());
            _listening = true;
            Program.Send(new { type = "clipboard-status", state = _enabled ? "on" : "off" });

            // El bucle de mensajes: espera (sin gastar nada) a que Windows avise.
            while (GetMessageW(out var message, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref message);
                DispatchMessageW(ref message);
            }
        }
        catch (Exception ex)
        {
            _startError = ex.Message;
            Program.LogError("No se pudo vigilar el portapapeles: " + ex.Message);
            Program.Send(new { type = "clipboard-status", state = "error", message = ex.Message });
        }
    }

    /// <summary>Windows llama aquí con cada mensaje de la ventana.</summary>
    private static IntPtr WindowProcedure(IntPtr window, uint message, IntPtr wParam, IntPtr lParam)
    {
        if (message == WmClipboardUpdate)
        {
            // Cambió el portapapeles: lo leemos dentro de un momento (si llega
            // otro aviso antes, el temporizador vuelve a empezar).
            if (_enabled)
            {
                _retries = 0;
                SetTimer(window, ReadTimer, SettleMs, IntPtr.Zero);
            }
            return IntPtr.Zero;
        }

        if (message == WmTimer && (nuint)wParam == ReadTimer)
        {
            KillTimer(window, ReadTimer);
            try
            {
                ReadClipboard(window);
            }
            catch (Exception ex)
            {
                // Un error aquí no puede tumbar el helper (Windows es quien nos llama).
                Program.LogError("Error al leer el portapapeles: " + ex.Message);
            }
            return IntPtr.Zero;
        }

        return DefWindowProcW(window, message, wParam, lParam);
    }

    // -------------------------------------------------------------------------
    // Leer lo copiado
    // -------------------------------------------------------------------------

    private static void ReadClipboard(IntPtr window)
    {
        if (!_enabled) return;
        var sequence = GetClipboardSequenceNumber();
        if (sequence == _lastSequence) return; // ya lo vimos (o es lo de antes de encender)

        // ¿Es privado o no es texto (una imagen, unos archivos...)? Esto se
        // mira sin abrir el portapapeles.
        if (IsClipboardFormatAvailable(_excludeFormat)
            || IsClipboardFormatAvailable(_viewerIgnoreFormat)
            || !IsClipboardFormatAvailable(CfUnicodeText))
        {
            _lastSequence = sequence;
            return;
        }

        if (!OpenClipboard(window))
        {
            // Otro programa lo tiene abierto ahora mismo: otra vez dentro de un momento.
            if (++_retries <= MaxRetries) SetTimer(window, ReadTimer, RetryMs, IntPtr.Zero);
            return;
        }

        string? text = null;
        var source = "";
        try
        {
            // Con la marca de "historial", solo si dice claramente que sí (1).
            // Si vale 0 o no se puede leer, cuenta como privado.
            var allowed = !IsClipboardFormatAvailable(_historyFormat) || ReadNumber(_historyFormat) > 0;
            if (allowed)
            {
                text = ReadText();
                source = GetSourceApp();
            }
        }
        finally
        {
            CloseClipboard();
        }

        _lastSequence = sequence;
        if (string.IsNullOrWhiteSpace(text)) return;
        Program.Send(new { type = "clipboard", text = FixBrokenCharacters(text), source });
    }

    /// <summary>El texto copiado (null si no hay o si es demasiado largo).</summary>
    private static string? ReadText()
    {
        var handle = GetClipboardData(CfUnicodeText);
        if (handle == IntPtr.Zero) return null;
        var pointer = GlobalLock(handle);
        if (pointer == IntPtr.Zero) return null;
        try
        {
            // Leemos como mucho lo que mide el bloque de memoria, y nunca más
            // del límite + 1 (así sabemos si se pasa sin leerlo entero).
            var chars = (long)(GlobalSize(handle) / 2);
            var length = (int)Math.Min(chars, MaxTextChars + 1L);
            var text = Marshal.PtrToStringUni(pointer, length);
            var end = text.IndexOf('\0', StringComparison.Ordinal);
            if (end >= 0) text = text[..end];
            return text.Length > MaxTextChars ? null : text;
        }
        finally
        {
            GlobalUnlock(handle);
        }
    }

    /// <summary>Un número (DWORD) guardado en un formato del portapapeles, o -1.</summary>
    private static long ReadNumber(uint format)
    {
        var handle = GetClipboardData(format);
        if (handle == IntPtr.Zero) return -1;
        var pointer = GlobalLock(handle);
        if (pointer == IntPtr.Zero) return -1;
        try
        {
            return GlobalSize(handle) >= 4 ? Marshal.ReadInt32(pointer) : -1;
        }
        finally
        {
            GlobalUnlock(handle);
        }
    }

    /// <summary>El programa que copió (p. ej. "Google Chrome"), o "" si no se sabe.</summary>
    private static string GetSourceApp()
    {
        var owner = GetClipboardOwner();
        if (owner == IntPtr.Zero) return "";
        if (GetWindowThreadProcessId(owner, out var processId) == 0 || processId == 0) return "";

        var process = OpenProcess(ProcessQueryLimitedInformation, false, processId);
        if (process == IntPtr.Zero) return "";
        try
        {
            var buffer = new char[1024];
            var size = (uint)buffer.Length;
            if (!QueryFullProcessImageNameW(process, 0, buffer, ref size)) return "";
            var path = new string(buffer, 0, (int)size);

            // El nombre "bonito" (Google Chrome) y, si no tiene, el del archivo (chrome)
            string? description = null;
            try
            {
                description = FileVersionInfo.GetVersionInfo(path).FileDescription;
            }
            catch (Exception)
            {
                // no se pudo leer el .exe: nos quedamos con el nombre del archivo
            }
            var name = string.IsNullOrWhiteSpace(description) ? Path.GetFileNameWithoutExtension(path) : description.Trim();
            return name.Length > MaxSourceChars ? name[..MaxSourceChars] : name;
        }
        finally
        {
            CloseHandle(process);
        }
    }

    /// <summary>
    /// Algunos programas copian texto con "medios caracteres" sueltos (UTF-16
    /// mal formado) y el JSON no los admite: los cambiamos por "�".
    /// </summary>
    private static string FixBrokenCharacters(string text)
    {
        if (!text.Any(char.IsSurrogate)) return text;
        var builder = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            var current = text[i];
            if (char.IsHighSurrogate(current) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1]))
            {
                builder.Append(current).Append(text[i + 1]);
                i++;
            }
            else
            {
                builder.Append(char.IsSurrogate(current) ? '�' : current);
            }
        }
        return builder.ToString();
    }

    // -------------------------------------------------------------------------
    // Funciones de Windows (user32 y kernel32)
    // -------------------------------------------------------------------------

    private delegate IntPtr WindowProc(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WndClassEx
    {
        public uint Size;
        public uint Style;
        public IntPtr Procedure;
        public int ClassExtra;
        public int WindowExtra;
        public IntPtr Instance;
        public IntPtr Icon;
        public IntPtr Cursor;
        public IntPtr Background;
        public string? MenuName;
        public string ClassName;
        public IntPtr SmallIcon;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Msg
    {
        public IntPtr Window;
        public uint Message;
        public IntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public int X;
        public int Y;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern ushort RegisterClassExW(ref WndClassEx windowClass);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern IntPtr CreateWindowExW(
        uint exStyle, string className, string windowName, uint style, int x, int y, int width, int height,
        IntPtr parent, IntPtr menu, IntPtr instance, IntPtr parameter);

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern IntPtr DefWindowProcW(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern int GetMessageW(out Msg message, IntPtr window, uint filterMin, uint filterMax);

    [DllImport("user32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TranslateMessage(ref Msg message);

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern IntPtr DispatchMessageW(ref Msg message);

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern UIntPtr SetTimer(IntPtr window, UIntPtr id, uint milliseconds, IntPtr callback);

    [DllImport("user32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool KillTimer(IntPtr window, UIntPtr id);

    [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AddClipboardFormatListener(IntPtr window);

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern uint GetClipboardSequenceNumber();

    [DllImport("user32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsClipboardFormatAvailable(uint format);

    [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenClipboard(IntPtr window);

    [DllImport("user32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseClipboard();

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern IntPtr GetClipboardData(uint format);

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern IntPtr GetClipboardOwner();

    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint RegisterClipboardFormatW(string name);

    [DllImport("user32.dll", ExactSpelling = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern IntPtr GetModuleHandleW(string? moduleName);

    [DllImport("kernel32.dll", ExactSpelling = true)]
    private static extern IntPtr GlobalLock(IntPtr memory);

    [DllImport("kernel32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalUnlock(IntPtr memory);

    [DllImport("kernel32.dll", ExactSpelling = true)]
    private static extern UIntPtr GlobalSize(IntPtr memory);

    [DllImport("kernel32.dll", ExactSpelling = true, SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, [Out] char[] buffer, ref uint size);

    [DllImport("kernel32.dll", ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);
}
