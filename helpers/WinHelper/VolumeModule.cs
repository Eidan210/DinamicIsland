// =============================================================================
//  VolumeModule.cs — Avisa a Notch cada vez que cambia el volumen
// -----------------------------------------------------------------------------
//  Escucha el volumen de la salida de audio predeterminada (tus altavoces o
//  auriculares) con Core Audio. Todo por avisos de Windows, sin preguntar
//  periódicamente:
//    • IAudioEndpointVolumeCallback → cambió el volumen o el silencio.
//    • IMMNotificationClient        → cambió el dispositivo predeterminado
//                                     (p. ej. conectas unos auriculares).
//
//  Salida (una línea JSON):
//    {"type":"volume","level":0.42,"muted":false,"initial":false}
//  level va de 0 a 1. "initial": true solo en el primer mensaje (el volumen
//  que había al arrancar: Notch no lo enseña, solo lo guarda).
// =============================================================================

using System.Runtime.InteropServices;
using System.Threading.Channels;

namespace WinHelper;

internal static class VolumeModule
{
    // Cola de avisos: false = cambió el volumen, true = cambió el dispositivo.
    private static readonly Channel<bool> Changes = Channel.CreateUnbounded<bool>();

    // Los objetos que Windows llama deben seguir vivos mientras los usemos.
    private static readonly VolumeCallback Callback = new();
    private static readonly DeviceListener Listener = new();

    private static IMMDeviceEnumerator? _enumerator;
    private static IAudioEndpointVolume? _volume;
    private static float _lastLevel = -1;
    private static bool _lastMuted;

    /// <summary>Empieza a escuchar el volumen. Si falla, avisa y sigue sin volumen.</summary>
    public static void Start()
    {
        try
        {
            _enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            _enumerator.RegisterEndpointNotificationCallback(Listener);
            AttachToDefaultDevice();
            SendState(initial: true);
            _ = Task.Run(LoopAsync);
        }
        catch (Exception ex)
        {
            Program.LogError("No se pudo leer el volumen de Windows: " + ex.Message);
        }
    }

    /// <summary>Escucha el volumen del dispositivo de salida predeterminado (y deja el anterior).</summary>
    private static void AttachToDefaultDevice()
    {
        if (_volume is not null)
        {
            _volume.UnregisterControlChangeNotify(Callback);
            _volume = null;
        }
        if (_enumerator is null) return;

        var hr = _enumerator.GetDefaultAudioEndpoint(EDataFlow.Render, ERole.Multimedia, out var device);
        if (hr == CoreAudio.ErrorNotFound) return; // no hay altavoces ni auriculares
        Marshal.ThrowExceptionForHR(hr);

        var iid = typeof(IAudioEndpointVolume).GUID;
        Marshal.ThrowExceptionForHR(device.Activate(ref iid, CoreAudio.ClsCtxAll, IntPtr.Zero, out var instance));
        _volume = (IAudioEndpointVolume)instance;
        Marshal.ThrowExceptionForHR(_volume.RegisterControlChangeNotify(Callback));
    }

    private static async Task LoopAsync()
    {
        var reader = Changes.Reader;
        while (await reader.WaitToReadAsync())
        {
            // Al arrastrar el control de volumen llegan decenas de avisos seguidos:
            // esperamos 40 ms para juntarlos en uno. Esto NO es un sondeo: solo
            // pasa después de un aviso.
            await Task.Delay(40);
            var deviceChanged = false;
            while (reader.TryRead(out var change)) deviceChanged |= change;

            try
            {
                if (deviceChanged) AttachToDefaultDevice();
                SendState(initial: false);
            }
            catch (Exception ex)
            {
                Program.LogError("Error al leer el volumen: " + ex.Message);
            }
        }
    }

    /// <summary>Lee el volumen actual y lo manda a Notch (si cambió).</summary>
    private static void SendState(bool initial)
    {
        if (_volume is null) return;
        Marshal.ThrowExceptionForHR(_volume.GetMasterVolumeLevelScalar(out var level));
        Marshal.ThrowExceptionForHR(_volume.GetMute(out var muted));
        if (!initial && Math.Abs(level - _lastLevel) < 0.001f && muted == _lastMuted) return;
        _lastLevel = level;
        _lastMuted = muted;
        Program.Send(new { type = "volume", level = Math.Round(level, 3), muted, initial });
    }

    /// <summary>Windows llama a OnNotify cada vez que cambia el volumen o el silencio.</summary>
    private sealed class VolumeCallback : IAudioEndpointVolumeCallback
    {
        public int OnNotify(IntPtr notifyData)
        {
            // Aquí no se puede trabajar mucho (Windows espera): solo apuntamos el aviso.
            Changes.Writer.TryWrite(false);
            return 0;
        }
    }

    /// <summary>Windows nos avisa de los cambios de dispositivos.</summary>
    private sealed class DeviceListener : IMMNotificationClient
    {
        public int OnDefaultDeviceChanged(EDataFlow flow, ERole role, string? defaultDeviceId)
        {
            // Solo nos importa la salida "multimedia" (música, vídeos, juegos).
            // No cambiamos de dispositivo aquí dentro: Windows no lo permite durante
            // el aviso. Lo apuntamos y lo hace el bucle.
            if (flow == EDataFlow.Render && role == ERole.Multimedia) Changes.Writer.TryWrite(true);
            return 0;
        }

        public int OnDeviceStateChanged(string deviceId, uint newState) => 0;

        public int OnDeviceAdded(string deviceId) => 0;

        public int OnDeviceRemoved(string deviceId) => 0;

        public int OnPropertyValueChanged(string deviceId, PropertyKey key) => 0;
    }
}
