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
//
//  Lo usan VolumeModule.cs (el volumen) y AudioDevicesModule.cs (las salidas).
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
    int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out IMMDeviceCollection devices);

    [PreserveSig]
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);

    [PreserveSig]
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);

    [PreserveSig]
    int RegisterEndpointNotificationCallback(IMMNotificationClient client);

    [PreserveSig]
    int UnregisterEndpointNotificationCallback(IMMNotificationClient client);
}

/// <summary>Una lista de dispositivos de audio.</summary>
[ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceCollection
{
    [PreserveSig]
    int GetCount(out uint count);

    [PreserveSig]
    int Item(uint index, out IMMDevice device);
}

/// <summary>Un dispositivo de audio (unos altavoces, unos auriculares...).</summary>
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice
{
    [PreserveSig]
    int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);

    [PreserveSig]
    int OpenPropertyStore(uint access, out IPropertyStore properties);

    /// <summary>Identificador del dispositivo, p. ej. "{0.0.0.00000000}.{...}".</summary>
    [PreserveSig]
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
}

/// <summary>Las propiedades de un dispositivo (su nombre, entre otras).</summary>
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPropertyStore
{
    [PreserveSig]
    int GetCount(out uint count);

    [PreserveSig]
    int GetAt(uint index, out PropertyKey key);

    [PreserveSig]
    int GetValue(ref PropertyKey key, out PropVariant value);
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

    public PropertyKey(Guid formatId, uint propertyId)
    {
        FormatId = formatId;
        PropertyId = propertyId;
    }
}

/// <summary>
/// Un valor de una propiedad (PROPVARIANT). Solo leemos textos: si ValueType es
/// VT_LPWSTR, Pointer apunta al texto. Mide 24 bytes en Windows de 64 bits.
/// </summary>
[StructLayout(LayoutKind.Sequential)]
internal struct PropVariant
{
    public ushort ValueType;
    public ushort Reserved1;
    public ushort Reserved2;
    public ushort Reserved3;
    public IntPtr Pointer;
    public IntPtr Pointer2;
}

/// <summary>
/// El "creador" de IPolicyConfig (CLSID CPolicyConfigClient). Es lo que usa la
/// configuración de sonido de Windows para cambiar la salida predeterminada.
/// </summary>
[ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
internal class PolicyConfigClientComObject
{
}

/// <summary>
/// ⚠️ Interfaz NO documentada de Windows (existe desde Windows 7 y sigue en
/// Windows 11). Es la única forma de cambiar la salida de audio predeterminada;
/// si algún día Windows la cambia, Notch avisará de que no pudo y nada más.
/// Solo usamos SetDefaultEndpoint; los demás métodos están para respetar el orden.
/// </summary>
[ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPolicyConfig
{
    [PreserveSig]
    int GetMixFormat(IntPtr deviceId, IntPtr format);

    [PreserveSig]
    int GetDeviceFormat(IntPtr deviceId, int useDefault, IntPtr format);

    [PreserveSig]
    int ResetDeviceFormat(IntPtr deviceId);

    [PreserveSig]
    int SetDeviceFormat(IntPtr deviceId, IntPtr endpointFormat, IntPtr mixFormat);

    [PreserveSig]
    int GetProcessingPeriod(IntPtr deviceId, int useDefault, IntPtr defaultPeriod, IntPtr minimumPeriod);

    [PreserveSig]
    int SetProcessingPeriod(IntPtr deviceId, IntPtr period);

    [PreserveSig]
    int GetShareMode(IntPtr deviceId, IntPtr mode);

    [PreserveSig]
    int SetShareMode(IntPtr deviceId, IntPtr mode);

    [PreserveSig]
    int GetPropertyValue(IntPtr deviceId, IntPtr key, IntPtr value);

    [PreserveSig]
    int SetPropertyValue(IntPtr deviceId, IntPtr key, IntPtr value);

    [PreserveSig]
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, ERole role);

    [PreserveSig]
    int SetEndpointVisibility(IntPtr deviceId, int visible);
}

internal static class CoreAudio
{
    /// <summary>CLSCTX_ALL: Windows elige dónde crear el objeto.</summary>
    public const uint ClsCtxAll = 23;

    /// <summary>Error de Windows "no encontrado" (p. ej. no hay altavoces conectados).</summary>
    public const int ErrorNotFound = unchecked((int)0x80070490);

    /// <summary>DEVICE_STATE_ACTIVE: dispositivos conectados y funcionando.</summary>
    public const uint DeviceStateActive = 1;

    /// <summary>STGM_READ: abrir las propiedades solo para leer.</summary>
    public const uint StgmRead = 0;

    /// <summary>VT_LPWSTR: el valor es un texto.</summary>
    public const ushort VtLpwstr = 31;

    /// <summary>Grupo de propiedades con el nombre del dispositivo (PKEY_Device_*).</summary>
    public static readonly Guid DeviceNameProperties = new("A45C254E-DF1C-4EFD-8020-67D146A850E0");

    /// <summary>PKEY_Device_FriendlyName: el nombre que ves en Windows, p. ej. "Altavoces (Realtek Audio)".</summary>
    public static readonly PropertyKey FriendlyName = new(DeviceNameProperties, 14);

    /// <summary>Libera la memoria de un PROPVARIANT (p. ej. el texto que trae).</summary>
    [DllImport("ole32.dll")]
    public static extern int PropVariantClear(ref PropVariant value);
}
