using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using UnityEngine;

namespace Fresnel.UnityDemo
{
    /// <summary>Records the actual offline player, including its UI, to unmodified PNGs.
    /// Capture/encoding overhead is deliberately excluded from performance evidence.</summary>
    public sealed class MaterialMotionFilm : MonoBehaviour
    {
        const int SourceFps = 60, OutputFps = 30, WarmupFrames = 90, ClipFrames = 480;
        const int ExpectedFrames = 3 * ClipFrames / 2;
        readonly List<string> errors = new List<string>();
        readonly List<string> report = new List<string>();
        readonly List<string> index = new List<string> { "frame,material,phase,clip_seconds,source_seconds,file" };
        readonly List<string> captures = new List<string>(ExpectedFrames);
        readonly WaitForEndOfFrame endOfFrame = new WaitForEndOfFrame();
        readonly byte[] pngEnd = { 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130 };
        readonly byte[] pngTail = new byte[12];
        StudioApp app;
        string directory, framesDirectory;
        bool initialized, settingsSaved, completed;
        float previousCaptureDelta, previousTimeScale;
        int previousTargetRate, previousVsync, recordedRenderFrames, completedCaptureFiles;

        public void Initialize(StudioApp owner)
        {
            if (initialized) throw new InvalidOperationException("Motion film is already initialized.");
            initialized = true; app = owner;
            try
            {
                string[] args = Environment.GetCommandLineArgs();
                int argument = Array.IndexOf(args, "--evidence-dir");
                string parent = argument >= 0 && argument + 1 < args.Length ? args[argument + 1] : Application.persistentDataPath;
                directory = Path.GetFullPath(Path.Combine(parent, "motion-film", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff'Z'", CultureInfo.InvariantCulture)));
                framesDirectory = Path.Combine(directory, "frames");
                Directory.CreateDirectory(framesDirectory);
                File.WriteAllText(Path.Combine(Path.GetFullPath(parent), "motion-film-latest.txt"), directory);
                Application.logMessageReceived += OnLog;
                foreach (string other in new[] { "--visual-review", "--shake-review", "--materials-test", "--studio-test", "--smoke-test", "--uncapped" })
                    Require(Array.IndexOf(args, other) < 0, "Motion recording must run separately from benchmark or test mode: " + other);
                RequireOffline();
                StartCoroutine(GuardedRun());
            }
            catch (Exception error) { Fail(error); }
        }

        // Catch failures from the iterator without placing a yield inside a try/catch.
        IEnumerator GuardedRun()
        {
            IEnumerator film = Record();
            while (true)
            {
                bool more = false;
                object wait = null;
                Exception failure = null;
                try { more = film.MoveNext(); if (more) wait = film.Current; }
                catch (Exception error) { failure = error; }
                if (failure != null) { Fail(failure); yield break; }
                if (!more) { Finish(); yield break; }
                yield return wait;
            }
        }

        IEnumerator Record()
        {
            previousCaptureDelta = Time.captureDeltaTime; previousTimeScale = Time.timeScale;
            previousTargetRate = Application.targetFrameRate; previousVsync = QualitySettings.vSyncCount;
            settingsSaved = true;
            Time.timeScale = 1; Time.captureDeltaTime = 1f / SourceFps;
            QualitySettings.vSyncCount = 0; Application.targetFrameRate = SourceFps;
            report.Add("Actual Unity player screen recording; UI included; no image processing or synthetic rendering.");
            report.Add("Unity " + Application.unityVersion + "; " + SystemInfo.graphicsDeviceName + "; " + Screen.width + "x" + Screen.height);
            report.Add("Source interval 1/60 s; target 60 render frames/s; capture every second end-of-frame for 30 fps output.");
            report.Add("Per material: 1.5 s warmup excluded, then 1 s rest + 3 s held shake at 4.6 Hz + 4 s release.");
            report.Add("No device connection, transport operation or physical output is performed.");
            report.Add("PNG capture/encoding can slow wall-clock rendering. This recording is NOT a benchmark or an actual sustained-FPS claim.");
            yield return null; // Let normal startup and UI construction finish first.

            for (int selected = 2; selected <= 4; selected++)
            {
                RequireOffline();
                app.SelectMaterial(selected); app.Reset(); app.SetMaterialTilt(Vector2.zero);
                app.ShakeFrequency = 4.6f; app.SetShakeHeld(false);
                Require(app.SelectedMaterial == selected && !app.Paused && !app.Auto, "Offline material setup was not accepted.");
                // Resume after the next Update so every counted EOF includes a real
                // accepted source sample after this material's reset.
                yield return null;
                for (int warmup = 0; warmup < WarmupFrames; warmup++) yield return endOfFrame;
                RequireSource(selected);
                double previousSource = app.MaterialActor.SourceTime;
                int previousRenderFrame = Time.frameCount;
                int firstPng = captures.Count;
                string material = StudioApp.MaterialNames[selected];
                report.Add(material + ": quality=" + app.MaterialActor.Quality + ", fill=" + app.MaterialActor.Fill.ToString("F3", CultureInfo.InvariantCulture) +
                    ", shake amplitude=" + app.ShakeAmplitude.ToString("G6"));
                for (int frame = 0; frame < ClipFrames; frame++)
                {
                    app.SetShakeHeld(frame >= 60 && frame < 240);
                    yield return endOfFrame;
                    RequireSource(selected);
                    Require(Time.frameCount == previousRenderFrame + 1, "A recorded render frame was skipped.");
                    double source = app.MaterialActor.SourceTime;
                    Require(Math.Abs(source - previousSource - 1d / SourceFps) < .00002,
                        "The accepted source clock did not advance by one fixed 1/60-second interval.");
                    previousSource = source; previousRenderFrame = Time.frameCount;
                    recordedRenderFrames++;
                    if ((frame & 1) == 0) continue;
                    string file = "frame_" + captures.Count.ToString("D6", CultureInfo.InvariantCulture) + ".png";
                    string path = Path.Combine(framesDirectory, file);
                    ScreenCapture.CaptureScreenshot(path);
                    string phase = frame < 60 ? "rest" : frame < 240 ? "shake" : "release";
                    index.Add(captures.Count + "," + material + "," + phase + "," +
                        ((frame + 1d) / SourceFps).ToString("F6", CultureInfo.InvariantCulture) + "," +
                        source.ToString("F9", CultureInfo.InvariantCulture) + "," + file);
                    captures.Add(path);
                }
                app.SetShakeHeld(false);
                report.Add(material + ": render frames=" + ClipFrames + ", PNG requests=" + (captures.Count - firstPng) +
                    ", sequence=" + firstPng.ToString("D6") + ".." + (captures.Count - 1).ToString("D6"));
            }
            // ScreenCapture may finish the final file asynchronously. Freeze source
            // state while waiting for the actual files, without adding recorded frames.
            app.SetShakeHeld(false); if (!app.Paused) app.TogglePause();
            DateTime deadline = DateTime.UtcNow.AddSeconds(15);
            while (WrittenCount() != ExpectedFrames && DateTime.UtcNow < deadline) yield return endOfFrame;
            Require(captures.Count == ExpectedFrames && WrittenCount() == ExpectedFrames, "The expected 720 PNG files were not all written.");
            Require(recordedRenderFrames == 3 * ClipFrames, "The expected 1440 recorded render frames were not observed.");
        }

        void RequireOffline()
        {
            Require(app != null && app.Link != null && !app.DeviceMode && !app.Link.State.Connected && !app.Link.State.Connecting,
                "Motion film requires a disconnected offline source.");
        }

        void RequireSource(int selected)
        {
            RequireOffline();
            Require(errors.Count == 0, "A runtime error occurred during recording; see the film report.");
            Require(app.SelectedMaterial == selected && !app.Paused && !app.IsPhysicsPreview &&
                app.Frame != null && app.Frame.Source != "device" && app.Frame.IsFreshMotion && app.Frame.HasMotion &&
                app.Frame.Preset == StudioApp.Presets[selected] && app.MaterialActor != null && !app.MaterialActor.AutoSimulate,
                "The actual displayed source is not the selected offline material.");
        }

        int WrittenCount()
        {
            while (completedCaptureFiles < captures.Count && CompletePng(captures[completedCaptureFiles])) completedCaptureFiles++;
            return completedCaptureFiles;
        }
        bool CompletePng(string path)
        {
            try
            {
                using (var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                {
                    if (file.Length < 24) return false;
                    file.Seek(-12, SeekOrigin.End);
                    if (file.Read(pngTail, 0, 12) != 12) return false;
                    for (int i = 0; i < 12; i++) if (pngTail[i] != pngEnd[i]) return false;
                    return true;
                }
            }
            catch (IOException) { return false; } // Capture may still be creating/writing it.
        }
        static void Require(bool valid, string message) { if (!valid) throw new InvalidOperationException(message); }
        void OnLog(string message, string stack, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert) errors.Add(message + "\n" + stack);
        }
        void Fail(Exception error) { errors.Add(error.ToString()); Finish(); }
        void Finish()
        {
            if (completed) return;
            completed = true; RestoreSettings(); Application.logMessageReceived -= OnLog;
            try
            {
                report.Add("Recorded render frames: " + recordedRenderFrames + "/1440");
                report.Add("PNG requests: " + captures.Count + "/720; written files: " + WrittenCount());
                report.Add("Output: " + OutputFps + " fps; expected encoded duration 24 s (8 s per material).");
                report.Add("Runtime errors: " + errors.Count); report.AddRange(errors);
                if (!string.IsNullOrEmpty(directory))
                {
                    File.WriteAllLines(Path.Combine(directory, "frame-index.csv"), index);
                    File.WriteAllLines(Path.Combine(directory, "motion-film.txt"), report);
                }
            }
            catch (Exception error) { errors.Add(error.ToString()); Debug.LogException(error); }
            if (errors.Count == 0) Debug.Log("FRESNEL_MOTION_FILM PASS " + directory);
            else Debug.LogError("FRESNEL_MOTION_FILM FAIL " + directory + "\n" + string.Join("\n", errors));
            Application.Quit(errors.Count == 0 ? 0 : 1);
        }
        void RestoreSettings()
        {
            if (!settingsSaved) return;
            settingsSaved = false;
            Time.captureDeltaTime = previousCaptureDelta; Time.timeScale = previousTimeScale;
            Application.targetFrameRate = previousTargetRate; QualitySettings.vSyncCount = previousVsync;
        }
        void OnDestroy() { RestoreSettings(); Application.logMessageReceived -= OnLog; }
    }
}
