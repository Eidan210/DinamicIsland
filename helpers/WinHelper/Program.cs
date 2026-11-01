// =============================================================================
//  WinHelper — habla con Windows por Notch
// -----------------------------------------------------------------------------
//  Notch (Electron) no puede usar ciertas APIs de Windows directamente, así que
//  este pequeño programa lo hace por él. Cada parte vive en su archivo:
//    MediaModule.cs   la música que suena (sesión multimedia de Windows)
//    VolumeModule.cs  el volumen (Core Audio; declaraciones en CoreAudio.cs)
//
//  Protocolo con Electron (una línea de texto por mensaje):
//    stdout → {"type":"ready"}                  al arrancar
//             {"type":"media", ...}              cambió la música
//             {"type":"volume", ...}             cambió el volumen
//             {"type":"error","message":"..."}   algo no se pudo iniciar
//    stdin  ← órdenes, p. ej. "play", "next", "seek 83.5" (ver cada módulo)
//    stderr → avisos para depurar (Electron los muestra en la terminal)
//
//  El JSON sale en ASCII puro: por defecto, System.Text.Json escribe las letras
//  con acento como escapes Unicode (p. ej. la "ó" como su código), así que no
//  hay problemas de codificación con la consola de Windows.
// =============================================================================

using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace WinHelper;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    // stdout en UTF-8 sin BOM y sin búfer: cada línea llega a Electron al momento.
    private static readonly StreamWriter Output =
        new(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };

    private static readonly object OutputLock = new();

    private static async Task<int> Main()
    {
        // Cada módulo arranca por su cuenta: si uno falla, los demás siguen.
        var mediaStarted = await MediaModule.StartAsync();
        VolumeModule.Start();

        Send(new { type = "ready" });
        if (mediaStarted) MediaModule.RequestFullRefresh();

        // Leemos órdenes hasta que Electron cierre stdin (al salir de Notch):
        // entonces Main termina y el helper se cierra con él.
        await ReadCommandsAsync();
        return 0;
    }

    // -------------------------------------------------------------------------
    // Órdenes que llegan por stdin
    // -------------------------------------------------------------------------

    private static async Task ReadCommandsAsync()
    {
        using var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        while (await input.ReadLineAsync() is { } line)
        {
            var parts = line.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) continue;
            var command = parts[0].ToLowerInvariant();
            var argument = parts.Length > 1 ? parts[1] : null;
            try
            {
                // Cada módulo dice si la orden es suya.
                if (!await MediaModule.TryRunCommandAsync(command, argument))
                {
                    LogError($"Orden desconocida: {command}");
                }
            }
            catch (Exception ex)
            {
                LogError($"La orden \"{line}\" falló: {ex.Message}");
            }
        }
    }

    // -------------------------------------------------------------------------
    // Utilidades que usan todos los módulos
    // -------------------------------------------------------------------------

    /// <summary>Milisegundos Unix de ahora.</summary>
    internal static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>Escribe un mensaje como una línea JSON en stdout.</summary>
    internal static void Send(object message)
    {
        var json = JsonSerializer.Serialize(message, message.GetType(), JsonOptions);
        try
        {
            lock (OutputLock) Output.WriteLine(json);
        }
        catch (IOException)
        {
            // Electron ya no escucha (se cerró): no tiene sentido seguir.
            Environment.Exit(0);
        }
    }

    /// <summary>Escribe un aviso en stderr (Electron lo muestra en la terminal con [helper]).</summary>
    internal static void LogError(string text)
    {
        try
        {
            Console.Error.WriteLine("[WinHelper] " + text);
        }
        catch (IOException)
        {
            // stderr cerrado: lo ignoramos.
        }
    }
}
