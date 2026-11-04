// =============================================================================
//  VoiceModule.cs — Dictado por voz local en memoria con NAudio y Whisper.net
// -----------------------------------------------------------------------------
//  Captura audio del micrófono a 16 kHz mono 16-bit PCM en memoria, transmite
//  niveles RMS en tiempo real a Electron y transcribe bajo demanda con Whisper.
//  Mantiene 0 MB residuales y 0% CPU en reposo gracias a la liberación inmediata.
// =============================================================================

using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;
using NAudio.Wave;
using Whisper.net;

namespace WinHelper;

internal static class VoiceModule
{
    private static readonly object StateLock = new();
    private static WaveInEvent? _waveIn;
    private static MemoryStream? _audioBuffer;
    private static WaveFileWriter? _waveWriter;
    private static TaskCompletionSource<bool>? _recordingStoppedTcs;
    private static Task? _teardownTask;
    private static CancellationTokenSource? _transcriptionCts;
    private static string _currentModelPath = "";
    private static string _currentLanguage = "es";
    private static long _recordingStartTime;
    private static long _lastLevelEmitTime;
    private static volatile string _status = "idle"; // "idle" | "recording" | "transcribing"

    public static void Start()
    {
        // En reposo no se inicializa nada de audio ni Whisper (0% CPU, 0 MB)
    }

    public static async Task<bool> TryRunCommandAsync(string command, string? argument)
    {
        switch (command)
        {
            case "voice":
            {
                var subParts = argument?.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
                var subCommand = subParts != null && subParts.Length > 0 ? subParts[0].ToLowerInvariant() : "";
                var subArg = subParts != null && subParts.Length > 1 ? subParts[1] : null;

                switch (subCommand)
                {
                    case "start":
                        await StartRecordingAsync(subArg);
                        return true;
                    case "stop":
                        await StopAndTranscribeAsync();
                        return true;
                    case "cancel":
                        CancelRecording();
                        return true;
                    case "status":
                        EmitStatus();
                        return true;
                    default:
                        return false;
                }
            }

            case "voice:start" or "voice-start":
                await StartRecordingAsync(argument);
                return true;

            case "voice:stop" or "voice-stop":
                await StopAndTranscribeAsync();
                return true;

            case "voice:cancel" or "voice-cancel":
                CancelRecording();
                return true;

            case "voice:status":
                EmitStatus();
                return true;

            default:
                return false;
        }
    }

    private static async Task StartRecordingAsync(string? optionsJson)
    {
        Task? pendingTeardown = null;
        lock (StateLock)
        {
            if (_status != "idle")
            {
                Program.LogError($"VoiceModule: no se puede iniciar, estado actual = {_status}");
                return;
            }
            pendingTeardown = _teardownTask;
        }

        // Si había una detención previa terminando de liberar el hardware, esperamos a que concluya
        if (pendingTeardown != null)
        {
            try { await pendingTeardown; } catch { }
        }

        lock (StateLock)
        {
            if (_status != "idle") return;

            // 1. Verificación de permisos de privacidad de Windows
            if (!IsMicrophoneAllowed())
            {
                Program.Send(new
                {
                    type = "voice",
                    @event = "error",
                    error = "mic_permission_denied",
                    message = "El acceso al micrófono está desactivado en la configuración de privacidad de Windows."
                });
                return;
            }

            // 2. Verificación de dispositivos disponibles
            if (WaveInEvent.DeviceCount == 0)
            {
                Program.Send(new
                {
                    type = "voice",
                    @event = "error",
                    error = "no_microphone",
                    message = "No se detectó ningún micrófono conectado en Windows."
                });
                return;
            }

            // 3. Parsear opciones
            ParseOptions(optionsJson);

            try
            {
                _audioBuffer = new MemoryStream();
                var format = new WaveFormat(16000, 16, 1);
                _waveWriter = new WaveFileWriter(_audioBuffer, format);

                var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                _recordingStoppedTcs = tcs;

                var waveIn = new WaveInEvent
                {
                    WaveFormat = format,
                    BufferMilliseconds = 50
                };

                waveIn.DataAvailable += OnDataAvailable;
                waveIn.RecordingStopped += OnRecordingStopped;

                _waveIn = waveIn;
                _recordingStartTime = Program.Now();
                _lastLevelEmitTime = 0;

                // Iniciar grabación de hardware antes de emitir estado
                _waveIn.StartRecording();

                // Solo tras éxito en hardware pasamos a recording y emitimos estado
                _status = "recording";
                EmitStatus();
            }
            catch (Exception ex)
            {
                CleanupAudioStreams();
                _waveIn = null;
                _recordingStoppedTcs = null;
                _status = "idle";
                EmitStatus();
                Program.LogError($"Error al iniciar grabación: {ex.Message}");
                Program.Send(new
                {
                    type = "voice",
                    @event = "error",
                    error = "device_error",
                    message = ex.Message
                });
            }
        }
    }

    private static void ParseOptions(string? optionsJson)
    {
        if (string.IsNullOrWhiteSpace(optionsJson)) return;
        try
        {
            using var doc = JsonDocument.Parse(optionsJson);
            var root = doc.RootElement;
            if (root.TryGetProperty("modelPath", out var mp) && mp.ValueKind == JsonValueKind.String)
            {
                _currentModelPath = mp.GetString() ?? "";
            }
            if (root.TryGetProperty("language", out var lang) && lang.ValueKind == JsonValueKind.String)
            {
                _currentLanguage = lang.GetString() ?? "es";
            }
        }
        catch
        {
            _currentModelPath = optionsJson.Trim('"', '\'');
        }
    }

    private static void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (e.BytesRecorded <= 0) return;

        lock (StateLock)
        {
            if (_status != "recording" || _waveWriter == null) return;
            try
            {
                _waveWriter.Write(e.Buffer, 0, e.BytesRecorded);
            }
            catch { return; }
        }

        // Cálculo de nivel RMS
        int sampleCount = e.BytesRecorded / 2;
        double sumSquare = 0;
        for (int i = 0; i < e.BytesRecorded; i += 2)
        {
            short sample = (short)(e.Buffer[i] | (e.Buffer[i + 1] << 8));
            float norm = sample / 32768f;
            sumSquare += norm * norm;
        }

        double rms = sampleCount > 0 ? Math.Sqrt(sumSquare / sampleCount) : 0;
        float level = (float)Math.Clamp(rms * 3.0, 0.0, 1.0);

        long now = Program.Now();
        if (now - _lastLevelEmitTime >= 45) // ~20 Hz
        {
            _lastLevelEmitTime = now;
            Program.Send(new
            {
                type = "voice",
                @event = "level",
                level = Math.Round(level, 3),
                rms = Math.Round(rms, 4)
            });
        }
    }

    private static async Task StopAndTranscribeAsync()
    {
        byte[]? wavData = null;
        long durationMs = 0;
        string modelPath = "";
        string language = "es";
        WaveInEvent? waveIn = null;
        TaskCompletionSource<bool>? stoppedTcs = null;

        lock (StateLock)
        {
            if (_status != "recording") return;

            _status = "transcribing";
            EmitStatus();

            durationMs = Program.Now() - _recordingStartTime;
            modelPath = _currentModelPath;
            language = _currentLanguage;

            waveIn = _waveIn;
            stoppedTcs = _recordingStoppedTcs;
            _waveIn = null;
            _recordingStoppedTcs = null;
        }

        // Iniciar parada de hardware de forma segura y esperar a que complete la escritura
        if (waveIn != null)
        {
            _teardownTask = SafeTeardownWaveInAsync(waveIn, stoppedTcs);
            if (stoppedTcs != null)
            {
                try { await Task.WhenAny(stoppedTcs.Task, Task.Delay(150)); } catch { }
            }
        }

        lock (StateLock)
        {
            try
            {
                _waveWriter?.Flush();
                _waveWriter?.Dispose();
                _waveWriter = null;
                wavData = _audioBuffer?.ToArray();
            }
            catch { }
            finally
            {
                CleanupAudioStreams();
            }
        }

        if (wavData == null || wavData.Length <= 44) // 44 bytes es solo la cabecera WAV vacía
        {
            lock (StateLock)
            {
                if (_status == "transcribing")
                {
                    _status = "idle";
                    EmitStatus();
                }
            }
            ForceWorkingSetCleanup();
            return;
        }

        // Lanzar transcripción en segundo plano sin bloquear el bucle de órdenes de stdin
        var cts = new CancellationTokenSource();
        lock (StateLock)
        {
            if (_status != "transcribing") return;
            _transcriptionCts = cts;
        }

        _ = Task.Run(async () =>
        {
            await ExecuteWhisperTranscriptionAsync(wavData, durationMs, modelPath, language, cts);
        });
    }

    private static async Task ExecuteWhisperTranscriptionAsync(
        byte[] wavData,
        long durationMs,
        string modelPath,
        string language,
        CancellationTokenSource cts)
    {
        try
        {
            if (cts.IsCancellationRequested) return;

            if (string.IsNullOrWhiteSpace(modelPath) || !File.Exists(modelPath))
            {
                var fallback = Path.Combine(AppContext.BaseDirectory, "models", "ggml-base.bin");
                if (File.Exists(fallback))
                {
                    modelPath = fallback;
                }
                else
                {
                    Program.Send(new
                    {
                        type = "voice",
                        @event = "error",
                        error = "model_missing",
                        message = $"No se encontró el modelo de Whisper en: '{modelPath}'."
                    });
                    return;
                }
            }

            if (cts.IsCancellationRequested) return;

            using var wavStream = new MemoryStream(wavData);
            using var factory = WhisperFactory.FromPath(modelPath);
            using var processor = factory.CreateBuilder()
                .WithLanguage(string.IsNullOrWhiteSpace(language) ? "auto" : language)
                .WithThreads(Math.Clamp(Environment.ProcessorCount, 1, 4))
                .Build();

            var sb = new StringBuilder();
            await foreach (var segment in processor.ProcessAsync(wavStream, cts.Token))
            {
                if (cts.IsCancellationRequested) return;
                sb.Append(segment.Text);
            }

            if (cts.IsCancellationRequested) return;

            var text = sb.ToString().Trim();
            Program.Send(new
            {
                type = "voice",
                @event = "transcript",
                text,
                durationMs
            });
        }
        catch (OperationCanceledException)
        {
            // Cancelado intencionalmente por voz:cancel
        }
        catch (Exception ex)
        {
            if (!cts.IsCancellationRequested)
            {
                Program.LogError($"Error en transcripción Whisper: {ex.Message}");
                Program.Send(new
                {
                    type = "voice",
                    @event = "error",
                    error = "transcription_error",
                    message = ex.Message
                });
            }
        }
        finally
        {
            lock (StateLock)
            {
                if (_status == "transcribing")
                {
                    _status = "idle";
                    EmitStatus();
                }
                if (_transcriptionCts == cts)
                {
                    _transcriptionCts = null;
                }
            }
            ForceWorkingSetCleanup();
        }
    }

    private static void CancelRecording()
    {
        lock (StateLock)
        {
            if (_status == "idle") return;

            if (_status == "transcribing")
            {
                // Cancelar transcripción activa en segundo plano
                try { _transcriptionCts?.Cancel(); } catch { }
                _transcriptionCts = null;
                _status = "idle";
                EmitStatus();
                ForceWorkingSetCleanup();
                return;
            }

            _status = "idle";
            EmitStatus();

            CleanupAudioStreams();
            var waveIn = _waveIn;
            var tcs = _recordingStoppedTcs;
            _waveIn = null;
            _recordingStoppedTcs = null;

            _teardownTask = SafeTeardownWaveInAsync(waveIn, tcs);
            ForceWorkingSetCleanup();
        }
    }

    private static void OnRecordingStopped(object? sender, StoppedEventArgs e)
    {
        _recordingStoppedTcs?.TrySetResult(true);

        if (e.Exception != null)
        {
            Program.LogError($"WaveIn stopped con error: {e.Exception.Message}");
            lock (StateLock)
            {
                if (_status == "recording")
                {
                    _status = "idle";
                    EmitStatus();
                    Program.Send(new
                    {
                        type = "voice",
                        @event = "error",
                        error = "device_error",
                        message = e.Exception.Message
                    });
                }
            }
        }
    }

    private static async Task SafeTeardownWaveInAsync(WaveInEvent? waveIn, TaskCompletionSource<bool>? stoppedTcs)
    {
        if (waveIn == null) return;

        try
        {
            waveIn.StopRecording();
        }
        catch { }

        if (stoppedTcs != null)
        {
            // Si StopRecording fue llamado casi simultáneamente con StartRecording,
            // reintentamos para asegurar que RecordThread no se quede esperando.
            for (int i = 0; i < 5 && !stoppedTcs.Task.IsCompleted; i++)
            {
                await Task.Delay(25);
                if (!stoppedTcs.Task.IsCompleted)
                {
                    try { waveIn.StopRecording(); } catch { }
                }
            }

            try { await Task.WhenAny(stoppedTcs.Task, Task.Delay(500)); } catch { }
        }

        try
        {
            waveIn.Dispose();
        }
        catch { }
    }

    private static void CleanupAudioStreams()
    {
        try { _waveWriter?.Dispose(); } catch { }
        _waveWriter = null;
        try { _audioBuffer?.Dispose(); } catch { }
        _audioBuffer = null;
    }

    private static void ResetToIdle()
    {
        _status = "idle";
        EmitStatus();
    }

    private static void EmitStatus()
    {
        Program.Send(new
        {
            type = "voice",
            @event = "status",
            status = _status
        });
    }

    private static void ForceWorkingSetCleanup()
    {
        try
        {
            GC.Collect(2, GCCollectionMode.Forced, true);
            GC.WaitForPendingFinalizers();
            GC.Collect(2, GCCollectionMode.Forced, true);
            EmptyWorkingSet(Process.GetCurrentProcess().Handle);
        }
        catch { }
    }

    private static bool IsMicrophoneAllowed()
    {
        try
        {
            using var rootKey = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone");
            if (rootKey?.GetValue("Value") is string gVal && gVal.Equals("Deny", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            using var npKey = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged");
            if (npKey?.GetValue("Value") is string npVal && npVal.Equals("Deny", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            using var lmKey = Registry.LocalMachine.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone");
            if (lmKey?.GetValue("Value") is string lmVal && lmVal.Equals("Deny", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            return true;
        }
        catch
        {
            return true;
        }
    }

    [DllImport("psapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EmptyWorkingSet(IntPtr hProcess);
}
