// =============================================================================
//  CoreAudio.cs — Cómo hablar con el audio de Windows (Core Audio)
// -----------------------------------------------------------------------------
//  Core Audio es una API "COM" de Windows (anterior a las APIs modernas de
//  Windows.Media). Para usarla desde C# hay que declarar sus interfaces tal cual
//  las define Windows: el GUID de cada una y sus métodos EN EL MISMO ORDEN (el
//  orden importa: Windows llama a los métodos por su posición, no por nombre).
//  Solo declaramos hasta el último método que usamos de cada interfaz.
//
//  [PreserveSig] = el método devuelve el código de resultado de Windows
//  (HRESULT, 0 = todo bien) en vez de lanzar una excepción.
// =============================================================================

using System.Runtime.InteropServices;

namespace WinHelper;

/// <summary>Dirección del audio: salida (altavoces) o entrada (micrófono).</summary>
internal enum EDataFlow
{
    Render = 0, // salida: altavoces, auriculares
    Capture = 1, // entrada: micrófonos
    All = 2,
}

/// <summary>Para qué usa Windows el dispositivo predeterminado.</summary>
internal enum ERole
{
    Console = 0,
    Multimedia = 1, // música, vídeos, juegos
    Communications = 2, // llamadas
}

/// <summary>El "creador" de dispositivos de audio (CLSID MMDeviceEnumerator).</summary>
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumeratorComObject
{
}

[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator
{
    [PreserveSig]
    int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out IntPtr devices);

    [PreserveSig]
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);

    [PreserveSig]
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);

    [PreserveSig]
    int RegisterEndpointNotificationCallback(IMMNotificationClient client);

    [PreserveSig]
    int UnregisterEndpointNotificationCallback(IMMNotificationClient client);
}

[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice
{
    [PreserveSig]
    int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
}

[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolume
{
    [PreserveSig]
    int RegisterControlChangeNotify(IAudioEndpointVolumeCallback notify);

    [PreserveSig]
    int UnregisterControlChangeNotify(IAudioEndpointVolumeCallback notify);

    [PreserveSig]
    int GetChannelCount(out uint count);

    [PreserveSig]
    int SetMasterVolumeLevel(float levelDb, ref Guid eventContext);

    [PreserveSig]
    int SetMasterVolumeLevelScalar(float level, ref Guid eventContext);

    [PreserveSig]
    int GetMasterVolumeLevel(out float levelDb);

    /// <summary>Volumen general de 0.0 a 1.0 (lo que ves en Windows como 0-100 %).</summary>
    [PreserveSig]
    int GetMasterVolumeLevelScalar(out float level);

    [PreserveSig]
    int SetChannelVolumeLevel(uint channel, float levelDb, ref Guid eventContext);

    [PreserveSig]
    int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid eventContext);

    [PreserveSig]
    int GetChannelVolumeLevel(uint channel, out float levelDb);

    [PreserveSig]
    int GetChannelVolumeLevelScalar(uint channel, out float level);

    [PreserveSig]
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid eventContext);

    [PreserveSig]
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}

/// <summary>Lo implementamos nosotros: Windows lo llama cada vez que cambia el volumen.</summary>
[ComImport, Guid("657804FA-D6AD-4496-8A60-352752AF4F89"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolumeCallback
{
    [PreserveSig]
    int OnNotify(IntPtr notifyData);
}

/// <summary>Lo implementamos nosotros: Windows lo llama cuando se conectan o cambian dispositivos.</summary>
[ComImport, Guid("7991EEC9-7E89-4D85-8390-6C703CEC60C0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMNotificationClient
{
    [PreserveSig]
    int OnDeviceStateChanged([MarshalAs(UnmanagedType.LPWStr)] string deviceId, uint newState);

    [PreserveSig]
    int OnDeviceAdded([MarshalAs(UnmanagedType.LPWStr)] string deviceId);

    [PreserveSig]
    int OnDeviceRemoved([MarshalAs(UnmanagedType.LPWStr)] string deviceId);

    [PreserveSig]
    int OnDefaultDeviceChanged(EDataFlow flow, ERole role, [MarshalAs(UnmanagedType.LPWStr)] string? defaultDeviceId);

    [PreserveSig]
    int OnPropertyValueChanged([MarshalAs(UnmanagedType.LPWStr)] string deviceId, PropertyKey key);
}

/// <summary>Identifica una propiedad de un dispositivo (nombre, formato...).</summary>
[StructLayout(LayoutKind.Sequential)]
internal struct PropertyKey
{
    public Guid FormatId;
    public uint PropertyId;
}

internal static class CoreAudio
{
    /// <summary>CLSCTX_ALL: Windows elige dónde crear el objeto.</summary>
    public const uint ClsCtxAll = 23;

    /// <summary>Error de Windows "no encontrado" (p. ej. no hay altavoces conectados).</summary>
    public const int ErrorNotFound = unchecked((int)0x80070490);
}
