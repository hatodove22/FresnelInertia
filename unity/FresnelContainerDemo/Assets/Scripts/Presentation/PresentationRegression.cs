using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Fresnel.UnityDemo.Presentation
{
    /// <summary>Focused source-projection and containment regressions. Callable from the
    /// Editor or built-player smoke harness; does not open a port or run hardware.</summary>
    public static class PresentationRegression
    {
        public static List<string> Run()
        {
            var passed = new List<string>();
            Action<bool, string> check = (condition, name) => {
                if (!condition) throw new InvalidOperationException("Presentation regression failed: " + name);
                passed.Add(name);
            };
            check(MaterialContentPresenter.KindForPreset("granular_single_marble_box") == MaterialContentPresenter.ContentKind.Marble,
                "Actual granular_single_marble_box preset renders one marble");
            check(MaterialContentPresenter.KindForPreset("granular_sand_pile_box") == MaterialContentPresenter.ContentKind.Sand &&
                MaterialContentPresenter.KindForPreset("liquid_small_box") == MaterialContentPresenter.ContentKind.Water &&
                MaterialContentPresenter.KindForPreset("heartbeat_soft_object") == MaterialContentPresenter.ContentKind.Heartbeat,
                "Representative applied preset identifiers select their intended renderers");
            Vector3[] gravity = {
                Vector3.up, new Vector3(.5f, .8660254f, 0), new Vector3(-.5f, .8660254f, 0),
                new Vector3(0, .8660254f, .5f), new Vector3(0, .8660254f, -.5f),
                new Vector3(.3f, .8f, .42f), new Vector3(-.3f, .8f, -.42f),
                new Vector3(.3f, -.8f, .42f)
            };
            bool gravityCorrect = true;
            foreach (Vector3 g in gravity)
            {
                Vector3 world = PresentationMath.RotationFromBodyGravity(g) * PresentationMath.BodyToUnity(g.normalized);
                gravityCorrect &= Vector3.Distance(world, Vector3.up) < .00001f;
            }
            check(gravityCorrect, "Body-to-Unity basis agrees with Web gravity for roll, pitch, compound and inverted poses");
            check(Vector3.Distance(PresentationMath.SensorToBody(new Vector3(.70710678f, 0, .70710678f), true), Vector3.up) < .00001f,
                "Mounted sensor rest maps to body +Y");
            Vector3 size = new Vector3(.09f, .12f, .065f);
            Vector3 marble = PresentationMath.MarblePosition(size, new Vector2(1, -1), .005f);
            check(Mathf.Abs(marble.x - .04f) < .000001f && Mathf.Abs(marble.y + .055f) < .000001f && marble.z == 0,
                "Body x/y marble bounds do not map vertical mass to tray depth");
            float elapsed;
            check(PresentationMath.ClassifyTime(null, 1, out elapsed) == SourceStep.Initial && elapsed == 0, "Initial source sample does not integrate");
            check(PresentationMath.ClassifyTime(1, 1, out elapsed) == SourceStep.Duplicate && elapsed == 0, "Duplicate source sample does not integrate");
            check(PresentationMath.ClassifyTime(1, 1.5, out elapsed) == SourceStep.Advance && elapsed == .5f, "Half-second source step is accepted");
            check(PresentationMath.ClassifyTime(1, 1.501, out elapsed) == SourceStep.Gap && elapsed == 0, "Source gap forbids catch-up integration");
            check(PresentationMath.ClassifyTime(1, .9, out elapsed) == SourceStep.Rewind && elapsed == 0, "Source restart rebases");
            check(PresentationMath.ClassifyTime(1, double.NaN, out elapsed) == SourceStep.Missing, "Missing time cannot animate");

            var adapter = new DevicePresentationAdapter();
            JObject snapshot = Fixture(1000, 1);
            ContentFrame first = adapter.Accept(snapshot);
            check(first.HasResolvedConfiguration && first.HasMotion && first.IsFreshMotion && first.SourceStep == SourceStep.Initial, "Initial telemetry resolves real metric geometry and motion");
            snapshot["resolved"]["container"]["fill"] = .7f; snapshot["mass"]["fill"] = .7f;
            snapshot["imu"]["accel_g"] = new JArray(.5, .866, 0);
            ContentFrame duplicate = adapter.Accept(snapshot);
            check(!duplicate.IsFreshMotion && duplicate.SourceStep == SourceStep.Duplicate && Mathf.Abs(duplicate.Fill - .7f) < .00001f && duplicate.BodyGravity == Vector3.up,
                "Configuration-only receipt changes fill without resampling IMU or motion");
            snapshot["timestamp_ms"] = 1100; snapshot["frame_counter"] = 2;
            ContentFrame second = adapter.Accept(snapshot);
            check(second.IsFreshMotion && second.BodyGravity.x > .14f && second.BodyGravity.x < .16f && second.SourceStep == SourceStep.Advance,
                "Fresh source sample advances the gravity filter once");
            snapshot["preset"] = "heartbeat_soft_object";
            ContentFrame switched = adapter.Accept(snapshot);
            check(!switched.HasMotion && !switched.IsFreshMotion && switched.Heartbeat == null, "Preset ACK does not transplant old material motion");
            snapshot["timestamp_ms"] = 1200; snapshot["frame_counter"] = 3;
            snapshot["mass"]["heartbeat"] = JObject.Parse("{\"enabled\":true,\"phase\":0.1,\"bpm\":72,\"primary\":0.7,\"secondary\":0.2,\"contraction\":0.8,\"beat_sequence\":5}");
            ContentFrame heartbeat = adapter.Accept(snapshot);
            check(heartbeat.Heartbeat != null && heartbeat.Heartbeat.BeatSequence == 5 && Mathf.Abs(heartbeat.Heartbeat.Contraction - .8f) < .00001f,
                "Named heartbeat envelope and sequence are accepted without extrapolation");
            snapshot["timestamp_ms"] = 1300; snapshot["frame_counter"] = 4; snapshot["mass"]["heartbeat"]["phase"] = 1.0;
            check(adapter.Accept(snapshot).Heartbeat == null, "Invalid heartbeat phase cannot produce a synthetic beat");
            snapshot.Remove("resolved"); snapshot["timestamp_ms"] = 1400; snapshot["frame_counter"] = 5;
            ContentFrame legacy = adapter.Accept(snapshot);
            check(!legacy.HasResolvedConfiguration && legacy.Size == Vector3.zero && legacy.HasMotion, "Legacy missing dimensions remain unknown");
            snapshot["mass"]["pos_norm"] = new JArray("bad", 0);
            check(!adapter.Accept(snapshot).IsFreshMotion, "Malformed motion is never a fresh source sample");
            adapter.Reset();
            adapter.Accept(Fixture(uint.MaxValue - 40d, 100));
            ContentFrame wrapped = adapter.Accept(Fixture(20, 101));
            check(wrapped.SourceStep == SourceStep.Advance && Mathf.Abs(wrapped.ElapsedS - .061f) < .00001f, "Uint32 milliseconds wrap advances by actual elapsed time");
            ContentFrame restarted = adapter.Accept(Fixture(1, 1));
            check(restarted.SourceStep == SourceStep.Rewind && restarted.ElapsedS == 0, "Device restart resets source time without catch-up");
            adapter.Reset(); check(adapter.Current == null, "Source reset clears the accepted frame");
            passed.AddRange(RunAccelerationFreshness());

            var surface = new BoundedSurface();
            bool contains = true, fills = true;
            float[] fractions = { 0, .0001f, .01f, .25f, .5f, .99f, .9999f, 1 };
            float[] slopes = { -8, -.7f, 0, .7f, 8 };
            foreach (float fraction in fractions) foreach (float sx in slopes) foreach (float sz in slopes) for (int invert = 0; invert < 2; invert++)
            {
                surface.Update(size, fraction, sx, sz, .02f, 2.45f, invert != 0);
                fills &= Mathf.Abs(surface.ObservedFill - fraction) < .00004f;
                foreach (float height in surface.Heights) contains &= height >= -size.y * .5f && height <= size.y * .5f && !float.IsNaN(height);
            }
            check(contains, "Water/sand surface stays inside walls at empty/full fill and extreme compound/inverted slopes");
            check(fills, "Clipped volume conserves fill across 400 surface configurations");
            surface.Update(size, .43f, .6f, -.3f, .001f, 1.5f, false);
            var top = new Mesh(); var body = new Mesh();
            try
            {
                surface.WriteMeshes(top, body);
                bool meshesContained = true;
                foreach (Vector3 vertex in top.vertices) meshesContained &= InBounds(vertex, size);
                foreach (Vector3 vertex in body.vertices) meshesContained &= InBounds(vertex, size);
                check(meshesContained && top.vertexCount == BoundedSurface.VertexCount, "Rendered top/side/bottom meshes share a bounded volume");
                check(top.normals[(BoundedSurface.VertexCount - 1) / 2].y > 0, "Free-surface triangle winding faces the viewer above");
                surface.Update(size, .43f, .6f, -.3f, .001f, 1.5f, true); surface.WriteMeshes(top, body);
                check(top.normals[(BoundedSurface.VertexCount - 1) / 2].y < 0, "Inverted water has downward-facing free-surface winding");
            }
            finally { UnityEngine.Object.DestroyImmediate(top); UnityEngine.Object.DestroyImmediate(body); }
            var gate = new SourceEventGate();
            var audible = new ContentFrame { HasMotion = true, IsFreshMotion = true, Preset = "heartbeat_soft_object", RunMode = "live",
                SourceTimeS = 1, SourceStep = SourceStep.Initial, EventTotal = 5, NewEvents = 1, EventType = "HeartbeatPulse" };
            check(!gate.Accept(audible), "Connecting does not replay a latched speaker event");
            audible.SourceTimeS = 1.1; audible.SourceStep = SourceStep.Advance; audible.EventTotal = 6;
            check(gate.Accept(audible) && !gate.Accept(audible), "Fresh event voices once despite repeated display calls");
            audible.SourceTimeS = 1.2; audible.EventTotal = 7; audible.SourceStep = SourceStep.Gap;
            check(!gate.Accept(audible), "Speaker event after a source gap is suppressed");
            audible.SourceTimeS = 1.3; audible.EventTotal = 8; audible.SourceStep = SourceStep.Advance; audible.RunMode = "idle";
            check(!gate.Accept(audible), "Stopped source cannot voice residual events");
            gate.Reset(); audible.SourceTimeS = 1.4; audible.EventTotal = 9; audible.RunMode = "live";
            check(!gate.Accept(audible), "Enabling sound or recovering stale state establishes a fresh baseline");
            return passed;
        }

        /// <summary>Telemetry-only tests; no scene objects, meshes or hardware are created.</summary>
        public static List<string> RunAccelerationFreshness()
        {
            var passed = new List<string>();
            Action<bool, string> check = (condition, name) => {
                if (!condition) throw new InvalidOperationException("Acceleration freshness regression failed: " + name);
                passed.Add(name);
            };
            var adapter = new DevicePresentationAdapter();
            adapter.Accept(Fixture(1000, 1));
            JObject snapshot = Fixture(1100, 2);
            snapshot["imu"]["accel_g"] = new JArray(1, 1, 0);
            ContentFrame moving = adapter.Accept(snapshot);
            check(Mathf.Abs(moving.BodyAcceleration.x - .7f) < .00001f,
                "Fresh IMU exposes gravity-subtracted acceleration in g units");
            Vector3 filtered = moving.BodyGravity;
            snapshot["imu"]["accel_g"] = new JArray(5, 1, 0);
            ContentFrame duplicate = adapter.Accept(snapshot);
            check(!duplicate.IsFreshMotion && duplicate.BodyGravity == filtered && duplicate.BodyAcceleration == moving.BodyAcceleration,
                "Duplicate telemetry neither resamples IMU nor advances its gravity filter");
            snapshot = Fixture(1200, 3); snapshot.Remove("imu");
            ContentFrame missing = adapter.Accept(snapshot);
            check(missing.IsFreshMotion && missing.BodyAcceleration == Vector3.zero && missing.BodyGravity == filtered,
                "Accepted sample without IMU clears excitation while retaining known orientation");
            snapshot = Fixture(1300, 4); snapshot["imu"]["valid"] = false;
            snapshot["imu"]["accel_g"] = new JArray(5, 1, 0);
            check(adapter.Accept(snapshot).BodyAcceleration == Vector3.zero,
                "Invalid IMU flag cannot replay or replace linear excitation");
            snapshot = Fixture(1400, 5); snapshot["imu"]["accel_g"] = new JArray("bad", 1, 0);
            check(adapter.Accept(snapshot).BodyAcceleration == Vector3.zero,
                "Malformed IMU components cannot excite a new accepted frame");
            snapshot = Fixture(1500, 6); snapshot["imu"]["accel_g"] = new JArray(double.NaN, 1, 0);
            check(adapter.Accept(snapshot).BodyAcceleration == Vector3.zero,
                "Nonfinite IMU components cannot excite a new accepted frame");
            snapshot = Fixture(1600, 7); snapshot["imu"]["accel_g"] = new JArray(.6, 1, 0);
            ContentFrame recovered = adapter.Accept(snapshot);
            check(Mathf.Abs(recovered.BodyGravity.x - .39f) < .00001f && Mathf.Abs(recovered.BodyAcceleration.x - .21f) < .00001f,
                "IMU recovery advances once from the last valid filter state");
            return passed;
        }

        private static bool InBounds(Vector3 v, Vector3 size)
        {
            return Mathf.Abs(v.x) <= size.x * .50001f && Mathf.Abs(v.y) <= size.y * .50001f && Mathf.Abs(v.z) <= size.z * .50001f;
        }
        public static JObject Fixture(double milliseconds, ulong counter)
        {
            var result = JObject.Parse("{\"preset\":\"liquid_small_box\",\"run_mode\":\"idle\",\"timestamp_ms\":0,\"frame_counter\":0,\"new_evt\":0,\"evt_total\":0,\"imu\":{\"valid\":true,\"accel_g\":[0,1,0]},\"mass\":{\"pos_norm\":[0,-0.4],\"vel_norm_s\":[0.1,0],\"energy\":0.2,\"fill\":0.5},\"resolved\":{\"family\":\"Liquid\",\"container\":{\"span_x_m\":0.09,\"span_y_m\":0.12,\"span_z_m\":0.065,\"fill\":0.5},\"model\":{\"device_frame_transform\":false}}}");
            result["timestamp_ms"] = milliseconds; result["frame_counter"] = counter; return result;
        }
    }
}
