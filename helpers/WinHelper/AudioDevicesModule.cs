// =============================================================================
//  AudioDevicesModule.cs — Las salidas de audio (altavoces, auriculares...)
// -----------------------------------------------------------------------------
//  1. Le cuenta a Notch qué salidas hay y cuál es la predeterminada:
//       {"type":"audio-devices","devices":[
//          {"id":"{0.0.0.00000000}.{...}","name":"Altavoces (Realtek Audio)","isDefault":true}, ...]}
//     al arrancar y cada vez que cambian (conectas unos auriculares, cambias
//     la predeterminada...). Todo por avisos de Windows (IMMNotificationClient).
//
//  2. Cambia la salida predeterminada con la orden "set-output <id>".
//     Usa IPolicyConfig, una interfaz que Windows NO documenta (ver CoreAudio.cs).
//     Responde: {"type":"audio-output-result","ok":true,"id":"..."}
//          o:   {"type":"audio-output-result","ok":false,"id":"...","message":"..."}
//
//  Órdenes: audio-devices (volver a mandar la lista) | set-output <id>
// =============================================================================

using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Channels;

namespace WinHelper;

internal static class AudioDevicesModule
{
    /// <summary>Una salida de audio, tal cual se manda a Notch.</summary>
    private sealed record AudioDevice(string Id, string Name, bool IsDefault);

    // Cola de "algo cambió en los dispositivos" (los avisos llegan desde hilos de Windows).
    private static readonly Channel<bool> Changes = Channel.CreateUnbounded<bool>();
    private static readonly DeviceListener Listener = new();

    // La lista se puede mandar desde el bucle de avisos o por una orden: de una en una.
    private static readonly object SendLock = new();

    private static IMMDeviceEnumerator? _enumerator;
    private static string _lastSent = "";

    /// <summary>Empieza a vigilar las salidas. Si falla, avisa y sigue sin ellas.</summary>
    public static void Start()
    {
        try
        {
            _enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            Marshal.ThrowExceptionForHR(_enumerator.RegisterEndpointNotificationCallback(Listener));
            SendDevices(force: true);
            _ = Task.Run(LoopAsync);
        }
        catch (Exception ex)
        {
            Program.LogError("No se pudo leer la lista de salidas de audio: " + ex.Message);
        }
    }

    /// <summary>¿Es una orden de este módulo? Si lo es, la ejecuta y devuelve true.</summary>
    public static bool TryRunCommand(string command, string? argument)
    {
        switch (command)
        {
            case "audio-devices":
                SendDevices(force: true);
                return true;
            case "set-output":
                SetDefaultOutput(argument?.Trim() ?? "");
                return true;
            default:
                return false;
        }
    }

    private static async Task LoopAsync()
    {
        var reader = Changes.Reader;
        while (await reader.WaitToReadAsync())
        {
            // Al conectar un dispositivo llegan varios avisos seguidos: esperamos
            // 300 ms para juntarlos. (No es un sondeo: solo pasa tras un aviso.)
            await Task.Delay(300);
            while (reader.TryRead(out _))
            {
            }

            try
            {
                SendDevices(force: false);
            }
            catch (Exception ex)
            {
                Program.LogError("Error al leer las salidas de audio: " + ex.Message);
            }
        }
    }

    /// <summary>Manda la lista de salidas (si cambió, o siempre con force).</summary>
    private static void SendDevices(bool force)
    {
        lock (SendLock)
        {
            var devices = ListDevices();
            var json = JsonSerializer.Serialize(devices);
            if (!force && json == _lastSent) return;
            _lastSent = json;
            Program.Send(new { type = "audio-devices", devices });
        }
    }

    private static List<AudioDevice> ListDevices()
    {
        var devices = new List<AudioDevice>();
        if (_enumerator is null) return devices;

        var defaultId = GetDefaultOutputId();
        Marshal.ThrowExceptionForHR(_enumerator.EnumAudioEndpoints(EDataFlow.Render, CoreAudio.DeviceStateActive, out var collection));
        Marshal.ThrowExceptionForHR(collection.GetCount(out var count));
        for (uint i = 0; i < count; i++)
        {
            if (collection.Item(i, out var device) != 0) continue;
            if (device.GetId(out var id) != 0 || string.IsNullOrEmpty(id)) continue;
            devices.Add(new AudioDevice(id, GetFriendlyName(device) ?? id, id == defaultId));
        }
        return devices;
    }

    /// <summary>El id de la salida predeterminada para música y vídeos (o "" si no hay).</summary>
    private static string GetDefaultOutputId()
    {
        if (_enumerator is null) return "";
        var hr = _enumerator.GetDefaultAudioEndpoint(EDataFlow.Render, ERole.Multimedia, out var device);
        if (hr != 0) return ""; // p. ej. no hay ninguna salida conectada
        return device.GetId(out var id) == 0 ? id : "";
    }

    /// <summary>El nombre que ves en Windows, p. ej. "Auriculares (Realtek Audio)".</summary>
    private static string? GetFriendlyName(IMMDevice device)
    {
        if (device.OpenPropertyStore(CoreAudio.StgmRead, out var properties) != 0) return null;
        var key = CoreAudio.FriendlyName;
        if (properties.GetValue(ref key, out var value) != 0) return null;
        try
        {
            return value.ValueType == CoreAudio.VtLpwstr ? Marshal.PtrToStringUni(value.Pointer) : null;
        }
        finally
        {
            _ = CoreAudio.PropVariantClear(ref value); // si fallara, solo perderíamos unos bytes
        }
    }

    /// <summary>Hace predeterminada la salida `id` (para el sistema y para la música y los vídeos).</summary>
    private static void SetDefaultOutput(string id)
    {
        try
        {
            if (id.Length == 0) throw new ArgumentException("Falta el id de la salida.");
            var policy = (IPolicyConfig)new PolicyConfigClientComObject();
            Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id, ERole.Console));
            Marshal.ThrowExceptionForHR(policy.SetDefaultEndpoint(id, ERole.Multimedia));
            Program.Send(new { type = "audio-output-result", ok = true, id });
            // Windows avisará del cambio (OnDefaultDeviceChanged) y mandaremos la lista nueva.
        }
        catch (Exception ex)
        {
            Program.LogError($"No se pudo cambiar la salida de audio: {ex.Message}");
            Program.Send(new { type = "audio-output-result", ok = false, id, message = ex.Message });
        }
    }

    /// <summary>Windows nos avisa de los cambios de dispositivos.</summary>
    private sealed class DeviceListener : IMMNotificationClient
    {
        public int OnDeviceStateChanged(string deviceId, uint newState) => Notify();

        public int OnDeviceAdded(string deviceId) => Notify();

        public int OnDeviceRemoved(string deviceId) => Notify();

        public int OnDefaultDeviceChanged(EDataFlow flow, ERole role, string? defaultDeviceId) =>
            flow == EDataFlow.Render ? Notify() : 0;

        public int OnPropertyValueChanged(string deviceId, PropertyKey key) =>
            // Algunos dispositivos avisan de muchas propiedades: solo nos importa el nombre.
            key.FormatId == CoreAudio.DeviceNameProperties ? Notify() : 0;

        private static int Notify()
        {
            // Aquí no se puede trabajar mucho (Windows espera): solo apuntamos el aviso.
            Changes.Writer.TryWrite(true);
            return 0;
        }
    }
}
