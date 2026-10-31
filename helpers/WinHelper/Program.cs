// =============================================================================
//  WinHelper — habla con Windows por Notch (hoy: la música que suena)
// -----------------------------------------------------------------------------
//  Usa la sesión multimedia de Windows: la misma que ves en el panel de volumen
//  y que controlan las teclas multimedia del teclado
//  (GlobalSystemMediaTransportControlsSessionManager). Funciona con Apple Music,
//  Spotify, el navegador... con cualquier app que se integre con Windows: NO nos
//  conectamos a ninguna app en concreto.
//
//  Protocolo con Electron (una línea de texto por mensaje):
//
//    stdout → {"type":"ready"}                      al arrancar
//             {"type":"media", ...}                  cada vez que algo cambia
//             {"type":"error","message":"..."}       si algo falla al arrancar
//    stdin  ← play | pause | toggle | next | previous | seek <segundos> | refresh
//    stderr → avisos para depurar (Electron los muestra en la terminal)
//
//  Campos de "media": status (playing, paused, stopped, changing, opened,
//  closed o none), title, artist, album, app, position y duration (en
//  segundos), rate, timestamp (milisegundos Unix: cuándo se midió la posición),
//  canPlayPause, canNext, canPrevious, canSeek y art.
//
//  La carátula ("art", JPEG en base64) solo viaja cuando cambia, para no mandar
//  decenas de KB en cada línea:
//    "art" no aparece → la misma de antes   |   "art": "" → no hay carátula
// =============================================================================

using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Windows.Foundation;
using Windows.Graphics.Imaging;
using Windows.Media.Control;
using Windows.Storage.Streams;

using PlaybackStatus = Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus;
using Session = Windows.Media.Control.GlobalSystemMediaTransportControlsSession;
using SessionManager = Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager;

namespace WinHelper;

/// <summary>Qué hay que volver a leer cuando llega un aviso de Windows.</summary>
[Flags]
internal enum Refresh
{
    None = 0,
    Playback = 1, // estado, posición y botones disponibles
    Media = 2, // título, artista, álbum y carátula
    Force = 4, // mandarlo todo aunque no haya cambiado (comando "refresh")
}

/// <summary>Una línea "media" de la salida.</summary>
internal sealed record MediaMessage
{
    public string Type { get; init; } = "media";
    public string Status { get; init; } = "none";
    public string Title { get; init; } = "";
    public string Artist { get; init; } = "";
    public string Album { get; init; } = "";
    public string App { get; init; } = "";
    public double Position { get; init; }
    public double Duration { get; init; }
    public double Rate { get; init; } = 1;
    public long Timestamp { get; init; }
    public bool CanPlayPause { get; init; }
    public bool CanNext { get; init; }
    public bool CanPrevious { get; init; }
    public bool CanSeek { get; init; }

    /// <summary>null = no se escribe en el JSON (la carátula no cambió).</summary>
    public string? Art { get; init; }
}

internal static class Program
{
    /// <summary>Tamaño máximo (px) de la carátula que mandamos. Notch la muestra a 116 px.</summary>
    private const int MaxArtSize = 300;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        // Por defecto los acentos se escriben como ó: el JSON sale en ASCII
        // puro y no hay problemas de codificación con la consola de Windows.
    };

    // stdout en UTF-8 sin BOM y sin búfer: cada línea llega a Electron al momento.
    private static readonly StreamWriter Output =
        new(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };

    private static readonly object OutputLock = new();
    private static readonly object SessionLock = new();

    // Cola de "algo cambió": los avisos de Windows llegan desde varios hilos y un
    // único bucle (UpdateLoopAsync) los atiende en orden.
    private static readonly Channel<Refresh> Requests = Channel.CreateUnbounded<Refresh>();

    private static SessionManager? _manager;
    private static Session? _session; // la sesión que estamos escuchando

    // Estado que solo toca UpdateLoopAsync (un solo hilo lógico: sin carreras).
    private static string _title = "";
    private static string _artist = "";
    private static string _album = "";
    private static byte[]? _lastArtBytes;
    private static string _lastArtBase64 = "";
    private static MediaMessage? _lastSent;

    private static async Task<int> Main()
    {
        try
        {
            _manager = await SessionManager.RequestAsync();
        }
        catch (Exception ex)
        {
            Send(new { type = "error", message = "No se pudo acceder a la sesión multimedia de Windows: " + ex.Message });
            return 1;
        }

        // Cambia la app "actual" (p. ej. pausas Apple Music y pones un vídeo) o
        // se abre/cierra alguna: volvemos a escuchar la sesión actual.
        _manager.CurrentSessionChanged += (_, _) => OnSessionsChanged();
        _manager.SessionsChanged += (_, _) => OnSessionsChanged();
        ListenToCurrentSession();

        Send(new { type = "ready" });
        Request(Refresh.Media | Refresh.Playback | Refresh.Force);

        _ = Task.Run(UpdateLoopAsync);

        // Leemos órdenes hasta que Electron cierre stdin (al salir de Notch):
        // entonces Main termina y el helper se cierra con él.
        await ReadCommandsAsync();
        return 0;
    }

    // -------------------------------------------------------------------------
    // Avisos de Windows
    // -------------------------------------------------------------------------

    private static void OnSessionsChanged()
    {
        ListenToCurrentSession();
        Request(Refresh.Media | Refresh.Playback);
    }

    /// <summary>Deja de escuchar la sesión anterior y empieza a escuchar la actual.</summary>
    private static void ListenToCurrentSession()
    {
        lock (SessionLock)
        {
            var previous = _session;
            Session? current = null;
            try
            {
                current = _manager?.GetCurrentSession();
            }
            catch (Exception ex)
            {
                LogError("No se pudo obtener la sesión actual: " + ex.Message);
            }

            if (previous is not null)
            {
                previous.MediaPropertiesChanged -= OnMediaPropertiesChanged;
                previous.PlaybackInfoChanged -= OnPlaybackInfoChanged;
                previous.TimelinePropertiesChanged -= OnTimelinePropertiesChanged;
            }

            if (current is not null)
            {
                current.MediaPropertiesChanged += OnMediaPropertiesChanged;
                current.PlaybackInfoChanged += OnPlaybackInfoChanged;
                current.TimelinePropertiesChanged += OnTimelinePropertiesChanged;
            }

            Volatile.Write(ref _session, current);
        }
    }

    private static void OnMediaPropertiesChanged(Session sender, MediaPropertiesChangedEventArgs args) =>
        Request(Refresh.Media);

    private static void OnPlaybackInfoChanged(Session sender, PlaybackInfoChangedEventArgs args) =>
        Request(Refresh.Playback);

    private static void OnTimelinePropertiesChanged(Session sender, TimelinePropertiesChangedEventArgs args) =>
        Request(Refresh.Playback);

    private static void Request(Refresh what) => Requests.Writer.TryWrite(what);

    // -------------------------------------------------------------------------
    // Bucle de actualización: lee la sesión y escribe una línea si algo cambió
    // -------------------------------------------------------------------------

    private static async Task UpdateLoopAsync()
    {
        var reader = Requests.Reader;
        while (await reader.WaitToReadAsync())
        {
            // Al cambiar de canción, las apps avisan varias veces seguidas (título,
            // carátula, posición...). Esperamos un instante para juntar esa ráfaga
            // en una sola línea. Esto NO es un sondeo: solo pasa tras un aviso.
            await Task.Delay(120);

            var what = Refresh.None;
            while (reader.TryRead(out var request)) what |= request;

            try
            {
                await PublishAsync(what);
            }
            catch (Exception ex)
            {
                // Pasa si la app se cierra justo mientras la leemos: el siguiente aviso lo arregla.
                LogError("Error al leer la sesión multimedia: " + ex.Message);
            }
        }
    }

    private static async Task PublishAsync(Refresh what)
    {
        var session = Volatile.Read(ref _session);
        var force = what.HasFlag(Refresh.Force);
        string? art = null; // null = la carátula no cambia

        if (session is null)
        {
            // No suena nada en ninguna app.
            if (_lastArtBytes is not null || force) art = "";
            _title = _artist = _album = "";
            _lastArtBytes = null;
            _lastArtBase64 = "";
            SendIfChanged(new MediaMessage { Status = "none", Timestamp = Now(), Art = art }, force);
            return;
        }

        // Título, artista, álbum y carátula: solo cuando la app avisa de que cambiaron.
        if (what.HasFlag(Refresh.Media) || force)
        {
            var properties = await session.TryGetMediaPropertiesAsync();
            _title = properties?.Title ?? "";
            _artist = string.IsNullOrWhiteSpace(properties?.Artist) ? properties?.AlbumArtist ?? "" : properties.Artist;
            _album = properties?.AlbumTitle ?? "";

            var artBytes = await ReadThumbnailAsync(properties?.Thumbnail);
            if (!SameBytes(artBytes, _lastArtBytes))
            {
                _lastArtBytes = artBytes;
                _lastArtBase64 = artBytes is null ? "" : await ToSmallJpegBase64Async(artBytes);
                art = _lastArtBase64;
            }
            else if (force)
            {
                art = _lastArtBase64;
            }
        }

        var playback = session.GetPlaybackInfo();
        var timeline = session.GetTimelineProperties();
        var status = StatusName(playback?.PlaybackStatus);

        var rate = playback?.PlaybackRate ?? 1.0;
        if (rate <= 0) rate = 1.0;

        var duration = Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalSeconds);
        var position = Math.Max(0, (timeline.Position - timeline.StartTime).TotalSeconds);

        // Windows nos da la posición tal y como estaba en "LastUpdatedTime" (muchas
        // apps solo la actualizan al pausar o saltar). Si está sonando, le sumamos
        // el tiempo que ha pasado desde entonces para que sea la posición de AHORA.
        if (status == "playing" && timeline.LastUpdatedTime.Year > 2000)
        {
            var elapsed = (DateTimeOffset.Now - timeline.LastUpdatedTime).TotalSeconds;
            if (elapsed > 0 && elapsed < 6 * 3600) position += elapsed * rate;
        }
        if (duration > 0) position = Math.Min(position, duration);

        var controls = playback?.Controls;
        var message = new MediaMessage
        {
            Status = status,
            Title = _title,
            Artist = _artist,
            Album = _album,
            App = session.SourceAppUserModelId ?? "",
            Position = Math.Round(position, 3),
            Duration = Math.Round(duration, 3),
            Rate = rate,
            Timestamp = Now(),
            CanPlayPause = controls is not null && (controls.IsPlayEnabled || controls.IsPauseEnabled),
            CanNext = controls?.IsNextEnabled == true,
            CanPrevious = controls?.IsPreviousEnabled == true,
            CanSeek = controls?.IsPlaybackPositionEnabled == true && duration > 0,
            Art = art,
        };
        SendIfChanged(message, force);
    }

    /// <summary>
    /// Escribe la línea solo si aporta algo: si todo es igual y la posición es la
    /// que Electron ya calcula por su cuenta (interpolando), no hace falta.
    /// </summary>
    private static void SendIfChanged(MediaMessage message, bool force)
    {
        var last = _lastSent;
        if (!force && message.Art is null && last is not null && IsSameState(last, message)) return;
        Send(message);
        _lastSent = message with { Art = null };
    }

    private static bool IsSameState(MediaMessage before, MediaMessage now)
    {
        if (before.Status != now.Status || before.Title != now.Title || before.Artist != now.Artist ||
            before.Album != now.Album || before.App != now.App || before.CanPlayPause != now.CanPlayPause ||
            before.CanNext != now.CanNext || before.CanPrevious != now.CanPrevious || before.CanSeek != now.CanSeek ||
            Math.Abs(before.Duration - now.Duration) > 0.5 || Math.Abs(before.Rate - now.Rate) > 0.01)
        {
            return false;
        }

        // ¿La posición nueva es la que tocaba? (con 1,5 s de margen)
        var seconds = (now.Timestamp - before.Timestamp) / 1000.0;
        var expected = before.Position + (before.Status == "playing" ? seconds * before.Rate : 0);
        return Math.Abs(expected - now.Position) < 1.5;
    }

    // -------------------------------------------------------------------------
    // Carátula
    // -------------------------------------------------------------------------

    private static async Task<byte[]?> ReadThumbnailAsync(IRandomAccessStreamReference? thumbnail)
    {
        if (thumbnail is null) return null;
        try
        {
            using var stream = await thumbnail.OpenReadAsync();
            if (stream.Size == 0 || stream.Size > 20_000_000) return null;
            using var input = stream.AsStreamForRead();
            using var memory = new MemoryStream();
            await input.CopyToAsync(memory);
            return memory.ToArray();
        }
        catch (Exception ex)
        {
            LogError("No se pudo leer la carátula: " + ex.Message);
            return null;
        }
    }

    /// <summary>
    /// Reduce la carátula a 300 px como mucho y la guarda como JPEG: pasa de
    /// cientos de KB a unos 20-40 KB. Si algo falla, manda la imagen original.
    /// </summary>
    private static async Task<string> ToSmallJpegBase64Async(byte[] original)
    {
        try
        {
            using var source = new MemoryStream(original);
            var decoder = await BitmapDecoder.CreateAsync(source.AsRandomAccessStream());
            var scale = Math.Min(1.0, (double)MaxArtSize / Math.Max(decoder.PixelWidth, decoder.PixelHeight));
            var transform = new BitmapTransform
            {
                ScaledWidth = (uint)Math.Max(1, Math.Round(decoder.PixelWidth * scale)),
                ScaledHeight = (uint)Math.Max(1, Math.Round(decoder.PixelHeight * scale)),
                InterpolationMode = BitmapInterpolationMode.Fant,
            };
            var pixels = await decoder.GetPixelDataAsync(
                BitmapPixelFormat.Bgra8,
                BitmapAlphaMode.Ignore,
                transform,
                ExifOrientationMode.RespectExifOrientation,
                ColorManagementMode.DoNotColorManage);

            using var output = new InMemoryRandomAccessStream();
            var options = new Dictionary<string, BitmapTypedValue>
            {
                // 0.85f (float): Windows espera un "Single", no un double.
                ["ImageQuality"] = new BitmapTypedValue(0.85f, PropertyType.Single),
            };
            var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.JpegEncoderId, output, options);
            encoder.SetPixelData(
                BitmapPixelFormat.Bgra8,
                BitmapAlphaMode.Ignore,
                transform.ScaledWidth,
                transform.ScaledHeight,
                96,
                96,
                pixels.DetachPixelData());
            await encoder.FlushAsync();

            output.Seek(0);
            using var result = new MemoryStream();
            await output.AsStreamForRead().CopyToAsync(result);
            return Convert.ToBase64String(result.ToArray());
        }
        catch (Exception ex)
        {
            LogError("No se pudo reducir la carátula, mando la original: " + ex.Message);
            return Convert.ToBase64String(original);
        }
    }

    private static bool SameBytes(byte[]? a, byte[]? b) =>
        a is null || b is null ? a == b : a.AsSpan().SequenceEqual(b);

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
            try
            {
                await RunCommandAsync(parts[0].ToLowerInvariant(), parts.Length > 1 ? parts[1] : null);
            }
            catch (Exception ex)
            {
                LogError($"La orden \"{line}\" falló: {ex.Message}");
            }
        }
    }

    private static async Task RunCommandAsync(string command, string? argument)
    {
        if (command == "refresh")
        {
            Request(Refresh.Media | Refresh.Playback | Refresh.Force);
            return;
        }

        var session = Volatile.Read(ref _session);
        if (session is null) return; // no suena nada: no hay a quién mandar la orden

        switch (command)
        {
            case "play":
                await session.TryPlayAsync();
                break;
            case "pause":
                await session.TryPauseAsync();
                break;
            case "toggle":
                await session.TryTogglePlayPauseAsync();
                break;
            case "next":
                await session.TrySkipNextAsync();
                break;
            case "previous":
                await session.TrySkipPreviousAsync();
                break;
            case "seek":
                if (double.TryParse(argument, NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) && seconds >= 0)
                {
                    // Windows mide la posición en "ticks" (diezmillonésimas de segundo).
                    var start = session.GetTimelineProperties().StartTime;
                    await session.TryChangePlaybackPositionAsync((start + TimeSpan.FromSeconds(seconds)).Ticks);
                }
                break;
            default:
                LogError($"Orden desconocida: {command}");
                break;
        }
    }

    // -------------------------------------------------------------------------
    // Utilidades
    // -------------------------------------------------------------------------

    private static string StatusName(PlaybackStatus? status) => status switch
    {
        PlaybackStatus.Playing => "playing",
        PlaybackStatus.Paused => "paused",
        PlaybackStatus.Stopped => "stopped",
        PlaybackStatus.Changing => "changing",
        PlaybackStatus.Opened => "opened",
        PlaybackStatus.Closed => "closed",
        _ => "none",
    };

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>Escribe un mensaje como una línea JSON en stdout.</summary>
    private static void Send(object message)
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

    private static void LogError(string text)
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
