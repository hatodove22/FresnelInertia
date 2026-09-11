using System;
using System.IO;
using System.Text;
using Fresnel.Materials;
using UnityEditor;
using UnityEngine;

namespace Fresnel.UnityDemo.Editor
{
    /// <summary>Editor entry point for numeric solver and actual component/mesh integration.
    /// No device transport, scene replacement, actuator calls or play mode are involved.</summary>
    public static class MaterialsRegression
    {
        [MenuItem("Fresnel/Verify container materials")]
        public static void Run()
        {
            string path = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../output/unity/materials-regression.txt"));
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var report = new StringBuilder("Fresnel Container Materials software regression (no hardware)\n");
            try
            {
                int numerical = SimulationRegression.Run();
                report.AppendLine("PASS Numerical solver: " + numerical + " assertions");
                int integration = RunActor(report);
                int aspect = RunAspectRatios(report);
                report.AppendLine("TOTAL PASS: " + (numerical + integration + aspect));
                File.WriteAllText(path, report.ToString());
                Debug.Log(report.ToString());
            }
            catch (Exception error)
            {
                report.AppendLine("FAIL: " + error);
                File.WriteAllText(path, report.ToString());
                Debug.LogError(report.ToString());
                throw;
            }
        }

        private static int RunActor(StringBuilder report)
        {
            int checks = 0;
            var owner = new GameObject("Container material regression fixture") { hideFlags = HideFlags.HideAndDontSave };
            try
            {
                var actor = owner.AddComponent<ContainerMaterialActor>();
                actor.Kind = MaterialKind.Water; actor.Quality = MaterialQuality.Mobile;
                actor.Viscosity = .19f; actor.Friction = .73f; actor.Softness = .52f;
                Vector3 size = new Vector3(.12f, .09f, .052f);
                MaterialFrame frame = Frame(10, 0, size);
                actor.ApplyFrame(frame);
                Check(!actor.AutoSimulate && actor.AppliedFrames == 1 && actor.SourceTime == 10,
                    "external source starts without an autonomous clock", report, ref checks);
                Check(actor.Simulation != null && actor.Simulation.Count > 0 && actor.Renderer != null &&
                    actor.Renderer.SurfaceMesh != null && actor.Renderer.SurfaceMesh.vertexCount > 0,
                    "initial source frame creates a real closed material mesh", report, ref checks);
                Check(actor.Simulation.Metrics.SimulatedSeconds == 0 && actor.Simulation.Metrics.MaxSpeed == 0,
                    "initial zero-delta frame seeds geometry without advancing motion", report, ref checks);
                Check(Mathf.Abs(actor.Simulation.Viscosity - .19f) < .000001f && Mathf.Abs(actor.Simulation.Friction - .73f) < .000001f &&
                    Mathf.Abs(actor.Simulation.Softness - .52f) < .000001f,
                    "component controls reach the material solver", report, ref checks);

                ulong frozen = Fingerprint(actor);
                frame.DeltaTime = .05f; frame.NewEvents = 3; frame.EventAmplitude = 1; frame.Contraction = 1;
                actor.ApplyFrame(frame);
                Check(actor.AppliedFrames == 1 && Fingerprint(actor) == frozen,
                    "duplicate source identity cannot replay impacts or deform the mesh", report, ref checks);
                frame = Frame(10.05, .9f, size);
                actor.ApplyFrame(frame);
                Check(actor.AppliedFrames == 2 && Mathf.Abs(actor.Simulation.Metrics.SimulatedSeconds + actor.Simulation.SkippedSeconds - .05f) < .00001f,
                    "elapsed source timestamps bound caller delta and account for omitted detail time", report, ref checks);

                frozen = Fingerprint(actor); int accepted = actor.AppliedFrames; double sourceTime = actor.SourceTime;
                actor.SetStale(true); frame = Frame(10.1, .05f, size); actor.ApplyFrame(frame);
                Check(actor.AppliedFrames == accepted && actor.SourceTime == sourceTime && Fingerprint(actor) == frozen,
                    "stale device state freezes particles and mesh", report, ref checks);
                actor.SetStale(false); actor.Paused = true; actor.ApplyFrame(frame);
                Check(actor.AppliedFrames == accepted && Fingerprint(actor) == frozen,
                    "Pause freezes source-driven material detail", report, ref checks);
                actor.Paused = false; frame.IsFresh = false; actor.ApplyFrame(frame);
                Check(actor.AppliedFrames == accepted && Fingerprint(actor) == frozen,
                    "configuration-only nonfresh frames cannot advance detail", report, ref checks);

                frame = Frame(double.NaN, .05f, size); actor.ApplyFrame(frame);
                frame = Frame(10.1, .05f, size); frame.MassPosition.x = float.NaN; actor.ApplyFrame(frame);
                frame = Frame(10.1, .05f, new Vector3(0, .09f, .052f)); actor.ApplyFrame(frame);
                Check(actor.AppliedFrames == accepted && Fingerprint(actor) == frozen,
                    "invalid time, mass and geometry leave the last accepted state intact", report, ref checks);

                foreach (float invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
                    for (int axis = 0; axis < 3; axis++)
                    {
                        frame = Frame(10.1, .05f, size); frame.Acceleration[axis] = invalid;
                        actor.ApplyFrame(frame);
                    }
                Check(actor.AppliedFrames == accepted && actor.SourceTime == sourceTime && Fingerprint(actor) == frozen,
                    "nonfinite acceleration on every axis leaves time, particles and mesh unchanged", report, ref checks);
                foreach (float invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
                    for (int axis = 0; axis < 3; axis++)
                    {
                        frame = Frame(10.1, .05f, size); frame.AngularVelocity[axis] = invalid;
                        actor.ApplyFrame(frame);
                    }
                Check(actor.AppliedFrames == accepted && actor.SourceTime == sourceTime && Fingerprint(actor) == frozen,
                    "nonfinite angular velocity on every axis leaves accepted detail unchanged", report, ref checks);
                var acceptedSimulation = actor.Simulation; var acceptedRenderer = actor.Renderer;
                Vector3 acceptedSize = actor.Size; float acceptedFill = actor.Fill;
                frame = Frame(20, .05f, size * 1.2f); frame.Fill = .25f; frame.Rebase = true;
                frame.Acceleration.x = float.NaN; frame.AngularVelocity.z = float.PositiveInfinity;
                actor.ApplyFrame(frame);
                Check(actor.AppliedFrames == accepted && actor.SourceTime == sourceTime && Fingerprint(actor) == frozen &&
                    actor.Size == acceptedSize && actor.Fill == acceptedFill &&
                    ReferenceEquals(actor.Simulation, acceptedSimulation) && ReferenceEquals(actor.Renderer, acceptedRenderer),
                    "invalid excitation is rejected before a rebase or changed configuration can mutate the actor", report, ref checks);

                frame = Frame(10.1, .05f, size); actor.ApplyFrame(frame);
                Check(actor.AppliedFrames == accepted + 1 && actor.Simulation.Metrics.MaxSpeed > 0,
                    "a fresh source frame resumes actual particle motion", report, ref checks);
                frame = Frame(actor.SourceTime, 0, size); frame.Rebase = true; actor.ApplyFrame(frame);
                Check(actor.Simulation.Metrics.SimulatedSeconds == 0 && actor.Simulation.Metrics.MaxSpeed == 0,
                    "explicit same-timestamp session rebase discards prior momentum", report, ref checks);

                frame = Frame(2, 0, size); actor.ApplyFrame(frame);
                Check(actor.SourceTime == 2 && actor.Simulation.Metrics.MaxSpeed == 0,
                    "source rewind rebases instead of integrating negative time", report, ref checks);
                frame = Frame(5, 0, size); actor.ApplyFrame(frame);
                Check(actor.SourceTime == 5 && actor.Simulation.Metrics.SimulatedSeconds == 0,
                    "long source gap rebases without catch-up motion", report, ref checks);

                frame = Frame(5.05, .05f, size); frame.Fill = 0; actor.ApplyFrame(frame);
                Check(actor.Simulation.Count == 0 && actor.Renderer.VisibleParticleCount == 0 && actor.Renderer.SurfaceMesh.vertexCount == 0,
                    "empty fill removes both simulated and visible contents", report, ref checks);
                actor.ResetState(); frame = Frame(5.05, 0, size); actor.ApplyFrame(frame);
                Check(actor.Simulation.Count > 0 && actor.Simulation.Metrics.MaxSpeed == 0 && actor.Renderer.SurfaceMesh.vertexCount > 0,
                    "explicit ResetState accepts the current source identity and restores geometry", report, ref checks);
            }
            finally { UnityEngine.Object.DestroyImmediate(owner); }
            return checks;
        }

        private static int RunAspectRatios(StringBuilder report)
        {
            int checks = 0;
            Vector3[] dimensions = { new Vector3(.0001f, 10, 10), new Vector3(10, .0001f, .0001f), new Vector3(.0001f, .0001f, .0001f), new Vector3(10, 10, 10) };
            foreach (Vector3 size in dimensions)
                using (var simulation = new ContainerSimulation())
                {
                    simulation.Configure(MaterialKind.Water, size, 1, MaterialQuality.High);
                    int count = simulation.Count;
                    simulation.Step(Frame(.01, .01f, size));
                    bool bounded = count > 0 && count <= 2200 && count == simulation.Count;
                    for (int i = 0; i < count; i++)
                    {
                        Vector3 position = simulation.Positions[i]; float radius = simulation.Radii[i];
                        bounded &= Finite(position.x) && Finite(position.y) && Finite(position.z) &&
                            Mathf.Abs(position.x) + radius <= size.x * .5f + .000001f &&
                            Mathf.Abs(position.y) + radius <= size.y * .5f + .000001f &&
                            Mathf.Abs(position.z) + radius <= size.z * .5f + .000001f;
                    }
                    Check(bounded, "extreme valid box has a finite bounded particle budget: " + size.ToString("G4"), report, ref checks);
                }
            return checks;
        }

        private static MaterialFrame Frame(double time, float delta, Vector3 size)
        {
            return new MaterialFrame { Time = time, DeltaTime = delta, IsFresh = true, IsDevice = true,
                Size = size, Fill = .55f, Gravity = new Vector3(3, -9.81f, 0), MassPosition = new Vector2(.2f, -.3f) };
        }
        private static void Check(bool condition, string message, StringBuilder report, ref int count)
        {
            if (!condition) throw new InvalidOperationException(message);
            report.AppendLine("PASS Integration: " + message); count++;
        }
        private static bool Finite(float value) { return !float.IsNaN(value) && !float.IsInfinity(value); }
        private static ulong Fingerprint(ContainerMaterialActor actor)
        {
            unchecked
            {
                ulong hash = 1469598103934665603UL;
                for (int i = 0; i < actor.Simulation.Count; i++)
                {
                    hash = (hash ^ (uint)actor.Simulation.Positions[i].GetHashCode()) * 1099511628211UL;
                    hash = (hash ^ (uint)actor.Simulation.Velocities[i].GetHashCode()) * 1099511628211UL;
                }
                foreach (Vector3 vertex in actor.Renderer.SurfaceMesh.vertices) hash = (hash ^ (uint)vertex.GetHashCode()) * 1099511628211UL;
                return hash;
            }
        }
    }
}
