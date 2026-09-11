using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Fresnel.Materials;
using Fresnel.UnityDemo.Link;
using UnityEngine;

namespace Fresnel.UnityDemo
{
    /// <summary>Opt-in integration tests of the actual package actor, gallery and player renderer.
    /// All link tests use DemoLoopbackTransport. This class never discovers or opens hardware.</summary>
    public sealed class MaterialsVerification : MonoBehaviour
    {
        // Two initial checks, 27 per material, shallow-water regression, 16 mock-link checks.
        public const int ExpectedChecks = 100;
        const float TimeoutSeconds = 180;
        readonly List<string> checks = new List<string>();
        readonly List<string> errors = new List<string>();
        readonly List<string> performance = new List<string>();
        readonly List<string> captures = new List<string>();
        StudioApp app;
        string directory, evidenceRoot;
        float started;
        bool finished, validMeasurement;
        DemoLoopbackTransport bridge;

        public void Initialize(StudioApp owner)
        {
            app = owner; started = Time.realtimeSinceStartup;
            string[] args = Environment.GetCommandLineArgs();
            int argument = Array.IndexOf(args, "--evidence-dir");
            evidenceRoot = argument >= 0 && argument + 1 < args.Length ? args[argument + 1] :
                Path.Combine(Application.persistentDataPath, "FresnelEvidence");
            directory = Path.Combine(evidenceRoot, "materials", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff", CultureInfo.InvariantCulture));
            Directory.CreateDirectory(directory);
            File.WriteAllText(Path.Combine(evidenceRoot, "materials-latest.txt"), Path.GetFullPath(directory));
            Application.logMessageReceived += OnLog;
            StartCoroutine(Run());
        }

        void OnLog(string message, string stack, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert)
                errors.Add(message + "\n" + stack);
        }

        void Check(bool passed, string label)
        {
            checks.Add((passed ? "PASS " : "FAIL ") + label);
            if (!passed) errors.Add(label);
        }

        IEnumerator Run()
        {
            yield return new WaitForSecondsRealtime(.5f);
            Check(!app.DeviceMode && !app.Link.State.Connected, "Initial source is offline; no receiver is open");
            Check(app.MaterialActor != null && !app.MaterialActor.AutoSimulate, "Gallery actor has no independent Unity clock");
            for (int material = 2; material <= 4; material++) yield return RunMaterial(material);
            yield return RunMockLink();
            Finish();
        }

        IEnumerator RunMaterial(int selected)
        {
            string name = selected == 4 ? "softbody" : StudioApp.MaterialNames[selected].ToLowerInvariant();
            app.SelectMaterial(selected); app.Reset(); app.SetMaterialTilt(Vector2.zero);
            var actor = app.MaterialActor;
            MaterialKind kind = selected == 2 ? MaterialKind.Water : selected == 3 ? MaterialKind.Sand : MaterialKind.Softbody;
            yield return new WaitForSecondsRealtime(1);
            Check(app.SelectedMaterial == selected && actor.gameObject.activeInHierarchy && actor.Kind == kind &&
                !app.Sandbox.SandboxRoot.gameObject.activeSelf, name + ": gallery routes to package actor"); // 1
            Check(app.Frame != null && app.Frame.Source == "illustrative" && app.Frame.HasMotion &&
                app.Frame.HasResolvedConfiguration, name + ": source and metric configuration are explicit"); // 2
            string issue;
            Check(ValidMesh(actor, out issue), name + ": rendered shader and mesh are valid" + issue); // 3
            Check(ValidParticles(actor, out issue), name + ": solver particles are finite and contained" + issue); // 4
            var beforeTilt = Hold(actor);
            yield return Capture(name + "-01-rest");
            app.SetMaterialTilt(new Vector2(25, 35));
            yield return new WaitForSecondsRealtime(1.3f);
            Check(actor.AppliedFrames > beforeTilt.Frames && actor.SourceTime > beforeTilt.Time &&
                Moved(actor, beforeTilt), name + ": accepted tilt changes actual particle geometry"); // 5
            yield return Measure(name + "/" + actor.Quality);
            Check(validMeasurement, name + ": warm performance samples are finite"); // 6
            yield return Capture(name + "-02-moving");

            app.TogglePause(); yield return null;
            var held = Hold(actor);
            yield return new WaitForSecondsRealtime(.35f);
            Check(app.Paused && Same(actor, held), name + ": pause holds particles, mesh and source counter"); // 7
            var frame = ManualFrame(actor, held.Time);
            frame.Gravity = new Vector3(30, 0, 0); frame.Contraction = 1;
            actor.ApplyFrame(frame);
            Check(Same(actor, held), name + ": duplicate timestamp cannot create motion or contraction"); // 8
            frame.Time += .02; frame.IsFresh = false;
            actor.ApplyFrame(frame);
            Check(Same(actor, held), name + ": explicitly nonfresh package frame is ignored"); // 9
            frame = ManualFrame(actor, double.NaN); actor.ApplyFrame(frame);
            Check(Same(actor, held), name + ": NaN timestamp is rejected before state mutation"); // 10
            frame = ManualFrame(actor, held.Time + .02); frame.Size = Vector3.zero; actor.ApplyFrame(frame);
            Check(Same(actor, held), name + ": invalid vessel dimensions are rejected before state mutation"); // 11
            frame = ManualFrame(actor, held.Time + .02); frame.Gravity.x = float.NaN; actor.ApplyFrame(frame);
            Check(Same(actor, held), name + ": invalid gravity is rejected before state mutation"); // 12
            frame = ManualFrame(actor, held.Time + .02); frame.Gravity = new Vector3(-7, -7, 0); actor.ApplyFrame(frame);
            Check(actor.AppliedFrames == held.Frames + 1 && actor.SourceTime == frame.Time &&
                ValidMesh(actor, out issue), name + ": fresh explicit source resumes the held actor"); // 13
            app.Reset(); app.TogglePause(); yield return new WaitForSecondsRealtime(.35f);
            int resumed = actor.AppliedFrames;
            yield return new WaitForSecondsRealtime(.15f);
            Check(!app.Paused && actor.AppliedFrames > resumed && app.Frame.Source == "illustrative",
                name + ": gallery source resumes after explicit rebase"); // 14

            for (int response = 0; response < 3; response++)
            {
                float previous = app.MaterialResponse;
                float viscosity = actor.Viscosity, friction = actor.Friction, softness = actor.Softness;
                app.CycleResponse(); yield return null;
                Check(!Mathf.Approximately(previous, app.MaterialResponse) &&
                    Mathf.Approximately(actor.Viscosity, kind == MaterialKind.Water ? app.MaterialResponse : viscosity) &&
                    Mathf.Approximately(actor.Friction, kind == MaterialKind.Sand ? app.MaterialResponse : friction) &&
                    Mathf.Approximately(actor.Softness, kind == MaterialKind.Softbody ? app.MaterialResponse : softness) &&
                    Mathf.Approximately(actor.Simulation.Viscosity, actor.Viscosity) &&
                    Mathf.Approximately(actor.Simulation.Friction, actor.Friction) &&
                    Mathf.Approximately(actor.Simulation.Softness, actor.Softness),
                    name + ": response control reaches solver, transition " + response); // 15..17
            }
            for (int fill = 0; fill < 3; fill++)
            {
                float previous = app.MaterialFill;
                app.CycleFill(); yield return new WaitForSecondsRealtime(.2f);
                Check(!Mathf.Approximately(previous, app.MaterialFill) && Mathf.Approximately(actor.Fill, app.MaterialFill) &&
                    actor.Simulation.Count > 0 && ValidMesh(actor, out issue) && ValidParticles(actor, out issue),
                    name + ": fill control rebuilds contained geometry, transition " + fill); // 18..20
            }
            for (int quality = 0; quality < 3; quality++)
            {
                MaterialQuality previous = actor.Quality;
                app.CycleQuality(); yield return new WaitForSecondsRealtime(1);
                yield return Measure(name + "/quality-cycle-" + actor.Quality);
                Check(actor.Quality != previous && validMeasurement && ValidMesh(actor, out issue) && ValidParticles(actor, out issue),
                    name + ": quality control keeps render and solver valid at " + actor.Quality); // 21..23
            }

            app.TogglePause(); yield return null;
            frame = ManualFrame(actor, actor.SourceTime + .02); frame.Fill = 0; frame.Rebase = true;
            actor.ApplyFrame(frame); yield return null;
            Check(actor.Simulation.Count == 0 && actor.Renderer.SurfaceMesh.vertexCount == 0 &&
                actor.Renderer.VisibleParticleCount == 0, name + ": empty fill removes all material geometry"); // 24
            yield return Capture(name + "-03-empty");
            if (kind == MaterialKind.Water)
            {
                frame = ManualFrame(actor, actor.SourceTime + .02); frame.Fill = .01f; frame.Rebase = true;
                actor.ApplyFrame(frame); yield return null;
                Check(actor.Simulation.Count > 0 && ValidMesh(actor, out issue) &&
                    (!GpuWaterSurface.IsSupported || actor.Renderer.IsGpuWater),
                    "water: one-percent fill retains a valid occupied surface" );
                yield return Capture(name + "-03-shallow");
            }
            frame = ManualFrame(actor, actor.SourceTime + .02); frame.Fill = .98f; frame.Rebase = true;
            actor.ApplyFrame(frame);
            for (int step = 0; step < 12; step++)
            {
                frame.Time += 1.0 / 60; frame.DeltaTime = 1f / 60; frame.Rebase = false;
                frame.Gravity = new Vector3(8, -5, 3); frame.Contraction = kind == MaterialKind.Softbody ? .8f : 0;
                actor.ApplyFrame(frame); yield return null;
            }
            Check(Mathf.Approximately(actor.Fill, .98f) && actor.Simulation.Count > 0 &&
                ValidMesh(actor, out issue) && ValidParticles(actor, out issue), name + ": near-full vessel stays finite and contained"); // 25
            yield return Capture(name + "-04-high-fill");

            app.Reset(); app.SetMaterialTilt(new Vector2(60, 75)); app.TogglePause();
            yield return new WaitForSecondsRealtime(2.6f);
            Check(ExtremeReached(1) && ValidMesh(actor, out issue) && ValidParticles(actor, out issue),
                name + ": positive extreme tilt preserves contained geometry"); // 26
            yield return Capture(name + "-05-extreme-positive");
            app.Reset(); app.SetMaterialTilt(new Vector2(-60, -75));
            yield return new WaitForSecondsRealtime(2.6f);
            Check(ExtremeReached(-1) && ValidMesh(actor, out issue) && ValidParticles(actor, out issue),
                name + ": negative extreme tilt preserves contained geometry"); // 27
            yield return Capture(name + "-06-extreme-negative");
        }

        IEnumerator RunMockLink()
        {
            app.SetDeviceMode(true); app.IsTestLink = true;
            bridge = new DemoLoopbackTransport();
            yield return Await(app.Link.ConnectAsync(bridge, "materials-loopback"), "Mock receiver connection"); // 1
            yield return Await(app.Link.GetStateAsync(), "Mock applied state read"); // 2
            app.SelectMaterial(2); yield return AwaitUi("Mock water selection"); // 3
            yield return new WaitForSecondsRealtime(.35f);
            var actor = app.MaterialActor;
            Check(app.FreshDevice && app.Frame != null && app.Frame.Source == "device" && actor.Kind == MaterialKind.Water,
                "Mock device frame routes into water actor"); // 4
            Check(!bridge.Commands.Contains("live") && !bridge.Commands.Contains("audio on") && !bridge.Commands.Contains("tilt on"),
                "Mock connect and preset selection do not arm output"); // 5
            app.StartDevice(); yield return AwaitUi("Mock Start"); // 6
            int startedFrames = actor.AppliedFrames;
            yield return new WaitForSecondsRealtime(1);
            Check(app.Snapshot?.Value<string>("run_mode") == "live" && actor.AppliedFrames > startedFrames,
                "Mock live source advances material actor"); // 7
            app.SetMessage("MATERIAL TEST / synthetic device source; no hardware is connected.");
            yield return Capture("device-01-live");
            bridge.EmitTelemetry = false;
            float deadline = Time.realtimeSinceStartup + 5;
            while (!app.LinkState.Stale && Time.realtimeSinceStartup < deadline) yield return null;
            yield return new WaitForSecondsRealtime(.15f); // Drain any final sample delivered before staleness.
            Check(app.LinkState.Stale && actor.IsStale && !app.CanStart, "Stale mock disables Start and marks actor stale"); // 8
            var held = Hold(actor);
            yield return new WaitForSecondsRealtime(.45f);
            Check(Same(actor, held), "Stale mock holds actual mesh, particles, velocity and source counter"); // 9
            var frame = ManualFrame(actor, actor.SourceTime + .02); frame.IsDevice = true;
            actor.ApplyFrame(frame);
            Check(Same(actor, held), "Stale actor cannot be advanced by an otherwise fresh package frame"); // 10
            yield return Capture("device-02-stale");
            bridge.EmitTelemetry = true;
            deadline = Time.realtimeSinceStartup + 5;
            while ((!app.FreshDevice || actor.AppliedFrames <= held.Frames) && Time.realtimeSinceStartup < deadline) yield return null;
            Check(app.FreshDevice && !actor.IsStale && actor.AppliedFrames > held.Frames && actor.SourceTime > held.Time,
                "Fresh mock telemetry resumes actor from the new source sample"); // 11
            yield return Capture("device-03-recovered");
            app.StopDevice(); yield return AwaitUi("Mock Stop"); // 12
            Check(app.Snapshot?.Value<string>("run_mode") == "idle", "Mock Stop produces an acknowledged idle snapshot"); // 13
            yield return Await(app.Link.DisconnectAsync(), "Mock disconnect"); // 14
            yield return new WaitForSecondsRealtime(.15f);
            Check(!app.Link.State.Connected, "Mock connection is closed"); // 15
            app.SetDeviceMode(false); app.IsTestLink = false; app.SelectMaterial(0);
            yield return new WaitForSecondsRealtime(.2f);
            Check(!app.DeviceMode && app.IsPhysicsPreview && app.Sandbox.SandboxRoot.gameObject.activeSelf &&
                !app.MaterialActor.AutoSimulate, "Original PhysX preview returns without an independent material clock"); // 16
        }

        bool ExtremeReached(int sign)
        {
            if (app.Frame == null || !app.Frame.HasOrientation) return false;
            Vector3 g = app.Frame.BodyGravity.normalized;
            float pitch = -Mathf.Atan2(g.z, new Vector2(g.x, g.y).magnitude) * Mathf.Rad2Deg;
            float roll = Mathf.Atan2(g.x, g.y) * Mathf.Rad2Deg;
            performance.Add("Extreme tilt accepted: pitch=" + Format(pitch) + ", roll=" + Format(roll));
            return pitch * sign > 50 && roll * sign > 65;
        }

        static MaterialFrame ManualFrame(ContainerMaterialActor actor, double time)
        {
            return new MaterialFrame { Time = time, DeltaTime = .02f, IsFresh = true,
                Size = actor.Size, Fill = actor.Fill, Gravity = new Vector3(0, -9.81f, 0) };
        }

        sealed class HeldState
        {
            public double Time;
            public int Frames;
            public int GpuRevision = -1;
            public ulong GpuHash;
            public Vector3[] Positions, Velocities, Vertices;
        }

        static HeldState Hold(ContainerMaterialActor actor)
        {
            var held = new HeldState { Time = actor.SourceTime, Frames = actor.AppliedFrames,
                Positions = actor.Simulation.Positions.Take(actor.Simulation.Count).ToArray(),
                Velocities = actor.Simulation.Velocities.Take(actor.Simulation.Count).ToArray(),
                Vertices = actor.Renderer.SurfaceMesh.vertices };
            if (actor.Renderer.IsGpuWater)
            {
                var field = actor.Renderer.GpuWater.ValidateFieldForTesting();
                if (!field.Success) throw new InvalidOperationException(field.Issue);
                held.GpuRevision = field.Revision; held.GpuHash = field.Hash;
            }
            return held;
        }

        static bool Same(ContainerMaterialActor actor, HeldState held)
        {
            if (actor.Renderer.IsGpuWater)
            {
                var field = actor.Renderer.GpuWater.ValidateFieldForTesting();
                if (!field.Success || field.Revision != held.GpuRevision || field.Hash != held.GpuHash) return false;
            }
            else if (held.GpuRevision >= 0) return false;
            return actor.SourceTime == held.Time && actor.AppliedFrames == held.Frames &&
                actor.Simulation.Count == held.Positions.Length &&
                Equal(actor.Simulation.Positions, held.Positions, actor.Simulation.Count) &&
                Equal(actor.Simulation.Velocities, held.Velocities, actor.Simulation.Count) &&
                actor.Renderer.SurfaceMesh.vertexCount == held.Vertices.Length &&
                Equal(actor.Renderer.SurfaceMesh.vertices, held.Vertices, held.Vertices.Length);
        }

        static bool Equal(Vector3[] actual, Vector3[] expected, int count)
        {
            if (actual.Length < count || expected.Length < count) return false;
            for (int i = 0; i < count; i++) if (!actual[i].Equals(expected[i])) return false;
            return true;
        }

        static bool Moved(ContainerMaterialActor actor, HeldState held)
        {
            if (actor.Simulation.Count != held.Positions.Length) return true;
            for (int i = 0; i < held.Positions.Length; i++)
                if ((actor.Simulation.Positions[i] - held.Positions[i]).sqrMagnitude > 1e-10f) return true;
            return false;
        }

        static bool ValidParticles(ContainerMaterialActor actor, out string issue)
        {
            issue = "";
            if (actor.Simulation == null) { issue = ": missing simulation"; return false; }
            var simulation = actor.Simulation;
            Vector3 half = actor.Size * .5f;
            for (int i = 0; i < simulation.Count; i++)
            {
                Vector3 p = simulation.Positions[i], v = simulation.Velocities[i];
                float radius = simulation.Radii[i];
                if (!Finite(p) || !Finite(v) || !Finite(radius) || radius <= 0 ||
                    Mathf.Abs(p.x) + radius > half.x + 1e-5f || Mathf.Abs(p.y) + radius > half.y + 1e-5f ||
                    Mathf.Abs(p.z) + radius > half.z + 1e-5f)
                { issue = ": invalid or escaped particle " + i; return false; }
            }
            return true;
        }

        static bool ValidMesh(ContainerMaterialActor actor, out string issue)
        {
            issue = "";
            if (actor.Renderer == null || actor.Renderer.SurfaceMesh == null)
            { issue = ": missing surface"; return false; }
            var mesh = actor.Renderer.SurfaceMesh;
            var renderer = actor.Renderer.Root.GetComponent<MeshRenderer>();
            if (!renderer.enabled || !renderer.gameObject.activeInHierarchy || renderer.sharedMaterial == null ||
                renderer.sharedMaterial.shader == null || !renderer.sharedMaterial.shader.isSupported)
            { issue = ": disabled renderer or unsupported shader"; return false; }
            if (actor.Renderer.IsGpuWater)
            {
                // The cube is only ray bounds. Validate the actual GPU field instead of
                // mistaking its proxy vertices for the rendered liquid surface.
                var field = actor.Renderer.GpuWater.ValidateFieldForTesting();
                if (!field.Success) { issue = ": " + field.Issue; return false; }
            }
            var vertices = mesh.vertices;
            var normals = mesh.normals;
            var triangles = mesh.triangles;
            if (vertices.Length == 0 || triangles.Length < 3 || triangles.Length % 3 != 0 || normals.Length != vertices.Length)
            { issue = ": empty or incomplete visible mesh"; return false; }
            Vector3 half = actor.Size * .5f;
            for (int i = 0; i < vertices.Length; i++)
            {
                Vector3 p = vertices[i];
                if (!Finite(p) || !Finite(normals[i]) || normals[i].sqrMagnitude < .25f || normals[i].sqrMagnitude > 2.25f || Mathf.Abs(p.x) > half.x + 1e-5f ||
                    Mathf.Abs(p.y) > half.y + 1e-5f || Mathf.Abs(p.z) > half.z + 1e-5f)
                { issue = ": nonfinite/escaped vertex or invalid normal " + i; return false; }
            }
            for (int i = 0; i < triangles.Length; i++) if (triangles[i] < 0 || triangles[i] >= vertices.Length)
            { issue = ": invalid triangle index"; return false; }
            return true;
        }

        IEnumerator Measure(string label)
        {
            var frameMs = new List<double>(); var simulationMs = new List<double>(); var surfaceMs = new List<double>();
            int minVertices = int.MaxValue, maxVertices = 0, lastFrame = app.MaterialActor.AppliedFrames;
            float deadline = Time.realtimeSinceStartup + 1;
            while (Time.realtimeSinceStartup < deadline)
            {
                yield return null;
                frameMs.Add(Time.unscaledDeltaTime * 1000);
                var actor = app.MaterialActor;
                if (actor.AppliedFrames == lastFrame) continue;
                lastFrame = actor.AppliedFrames;
                simulationMs.Add(actor.SimulationMs); surfaceMs.Add(actor.SurfaceMs);
                int vertices = actor.Renderer.SurfaceMesh.vertexCount;
                minVertices = Math.Min(minVertices, vertices); maxVertices = Math.Max(maxVertices, vertices);
            }
            validMeasurement = frameMs.Count >= 2 && simulationMs.Count >= 2 && frameMs.All(Finite) &&
                simulationMs.All(value => Finite(value) && value >= 0) && surfaceMs.All(value => Finite(value) && value >= 0);
            performance.Add(label + ": frames=" + frameMs.Count + ", applied=" + simulationMs.Count +
                ", backend=" + (app.MaterialActor.Renderer.IsGpuWater ? "GPU field/raymarch; vertex count is ray proxy" : "CPU mesh") +
                ", particles=" + app.MaterialActor.Simulation.Count + ", vertices=" + minVertices + ".." + maxVertices +
                "; wall frame ms " + Distribution(frameMs) + "; SimulationMs " + Distribution(simulationMs) +
                "; SurfaceMs " + Distribution(surfaceMs));
        }

        static string Distribution(List<double> values)
        {
            if (values.Count == 0) return "no samples";
            values.Sort();
            return "median=" + Format(values[values.Count / 2]) + ", p95=" +
                Format(values[Math.Min(values.Count - 1, (int)Math.Ceiling(values.Count * .95) - 1)]) + ", max=" + Format(values[values.Count - 1]);
        }

        IEnumerator Capture(string name)
        {
            string path = Path.Combine(directory, name + ".png");
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(path);
            float deadline = Time.realtimeSinceStartup + 3;
            do { yield return new WaitForSecondsRealtime(.1f); } while (!File.Exists(path) && Time.realtimeSinceStartup < deadline);
            if (!File.Exists(path) || new FileInfo(path).Length == 0) errors.Add("Screenshot was not written: " + name);
            else captures.Add(name + ".png");
        }

        IEnumerator Await(Task task, string label)
        {
            float deadline = Time.realtimeSinceStartup + 12;
            while (!task.IsCompleted && Time.realtimeSinceStartup < deadline) yield return null;
            Check(task.IsCompleted && !task.IsFaulted && !task.IsCanceled,
                label + (task.Exception == null ? "" : ": " + task.Exception.GetBaseException().Message));
        }

        IEnumerator AwaitUi(string label)
        {
            float deadline = Time.realtimeSinceStartup + 12;
            while (app.Busy && Time.realtimeSinceStartup < deadline) yield return null;
            yield return new WaitForSecondsRealtime(.2f);
            Check(!app.Busy, label + " completes");
        }

        static bool Finite(Vector3 value) { return Finite(value.x) && Finite(value.y) && Finite(value.z); }
        static bool Finite(double value) { return !double.IsNaN(value) && !double.IsInfinity(value); }
        static string Format(double value) { return value.ToString("0.000", CultureInfo.InvariantCulture); }

        void Update()
        {
            if (!finished && Time.realtimeSinceStartup - started > TimeoutSeconds)
            { errors.Add("Materials runtime verification timed out"); Finish(); }
        }

        void Finish()
        {
            if (finished) return;
            finished = true;
            if (checks.Count != ExpectedChecks) errors.Add("Incomplete sequence: expected " + ExpectedChecks + ", ran " + checks.Count);
            File.WriteAllText(Path.Combine(directory, "materials-runtime.txt"),
                "Actual Unity player integration; device transport is synthetic. No hardware acceptance is claimed.\n" +
                "Expected checks: " + ExpectedChecks + "; executed: " + checks.Count + "; passed: " + checks.Count(check => check.StartsWith("PASS ")) +
                "\n" + string.Join("\n", checks) + "\nERRORS: " + errors.Count + "\n" + string.Join("\n", errors) +
                "\nCAPTURES:\n" + string.Join("\n", captures));
            File.WriteAllText(Path.Combine(directory, "materials-performance.txt"),
                "Unity " + Application.unityVersion + "\n" + SystemInfo.operatingSystem + "\n" + SystemInfo.graphicsDeviceName +
                "\n" + Screen.width + "x" + Screen.height + "; VSync=" + QualitySettings.vSyncCount + "; targetFPS=" + Application.targetFrameRate +
                "\nOne-second warmups and one-second samples. Wall-frame timing includes VSync and runtime overhead.\n" +
                "SimulationMs and SurfaceMs measure CPU execution, not GPU time. This is not an Android device benchmark.\n" + string.Join("\n", performance));
            Application.logMessageReceived -= OnLog;
            Debug.Log("FRESNEL_MATERIALS_VERIFICATION " + (errors.Count == 0 ? "PASS" : "FAIL") + " " + directory);
            // Dispose closes the synthetic session synchronously before the application's quit
            // callback runs, so a timed-out mock cannot replace our nonzero result with a later quit.
            app.Link.Dispose();
            bridge?.Dispose();
            Application.Quit(errors.Count == 0 ? 0 : 1);
        }
    }
}
