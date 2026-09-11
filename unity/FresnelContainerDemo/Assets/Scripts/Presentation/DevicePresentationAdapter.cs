using System;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Fresnel.UnityDemo.Presentation
{
    /// <summary>Projects accepted telemetry only. Configuration acknowledgments can refresh
    /// configuration without advancing the gravity filter, content phase or audible events.</summary>
    public sealed class DevicePresentationAdapter
    {
        public ContentFrame Current { get; private set; }
        private double? previousRawMs, previousSourceS;
        private ulong previousCounter;
        private double wrapOffsetMs;
        private Vector3? previousGravity;

        public void Reset()
        {
            Current = null; previousRawMs = previousSourceS = null;
            previousGravity = null; previousCounter = 0; wrapOffsetMs = 0;
        }

        public ContentFrame Accept(JObject snapshot)
        {
            if (snapshot == null) return Current;
            string preset = Text(snapshot["preset"], "unknown");
            bool changed = Current != null && Current.Preset != preset;
            ContentFrame result = Current != null && !changed ? Current.Copy() : new ContentFrame();
            result.Preset = preset;
            result.RunMode = Text(snapshot["run_mode"], "unknown");
            result.IsFreshMotion = false;
            result.SourceStep = SourceStep.Missing;
            result.ElapsedS = 0;
            result.NewEvents = 0;
            var resolved = snapshot["resolved"] as JObject;
            var container = resolved?["container"] as JObject;
            float sx, sy, sz, fill;
            string family = Text(resolved?["family"], "Custom");
            result.HasResolvedConfiguration = container != null &&
                (family == "Liquid" || family == "Granular" || family == "Hybrid" || family == "Detented" || family == "Custom") &&
                Number(container["span_x_m"], out sx) && sx > 0 &&
                Number(container["span_y_m"], out sy) && sy > 0 &&
                Number(container["span_z_m"], out sz) && sz > 0 &&
                Number(container["fill"], out fill) && fill >= 0 && fill <= 1;
            result.Family = family;
            if (result.HasResolvedConfiguration)
            {
                result.Size = new Vector3(Value(container["span_x_m"]), Value(container["span_y_m"]), Value(container["span_z_m"]));
                result.Fill = Value(container["fill"]);
                result.ParticleCount = Value(container["particle_count"]);
                result.ParticleHardness = Value(container["particle_hardness"]);
            }
            else result.Size = Vector3.zero; // Legacy geometry is unknown, never a preset guess.
            var mass = snapshot["mass"] as JObject;
            if (Number(mass?["fill"], out fill)) result.Fill = Mathf.Clamp01(fill);
            double rawMs;
            ulong counter;
            Vector2 position, velocity;
            bool valid = Double(snapshot["timestamp_ms"], out rawMs) && rawMs >= 0 &&
                Counter(snapshot["frame_counter"], out counter) &&
                Pair(mass?["pos_norm"], out position) && Pair(mass?["vel_norm_s"], out velocity);
            // Definite assignment deliberately follows complete validation rather than casts.
            if (!valid) { Current = result; return result; }
            Double(snapshot["timestamp_ms"], out rawMs);
            Counter(snapshot["frame_counter"], out counter);
            Pair(mass?["pos_norm"], out position); Pair(mass?["vel_norm_s"], out velocity);
            result.FrameCounter = counter;
            bool duplicate = previousRawMs.HasValue && previousRawMs.Value == rawMs && previousCounter == counter;
            if (duplicate)
            {
                result.SourceStep = SourceStep.Duplicate;
                // An applied preset may share a motion identity with the preceding preset.
                // Leave the new material without motion until its first real sample arrives.
                Current = result;
                return result;
            }
            bool wrap = previousRawMs.HasValue && previousRawMs.Value > 0xf0000000 &&
                previousRawMs.Value <= uint.MaxValue && rawMs < 0x0fffffff;
            if (wrap) wrapOffsetMs += 4294967296d;
            else if (previousRawMs.HasValue && rawMs < previousRawMs.Value) wrapOffsetMs = 0;
            double sourceS = (rawMs + wrapOffsetMs) / 1000d;
            float elapsed;
            result.SourceStep = PresentationMath.ClassifyTime(previousSourceS, sourceS, out elapsed);
            result.SourceTimeS = sourceS;
            result.ElapsedS = elapsed;
            result.IsFreshMotion = result.HasMotion = true;
            result.MassPosition = new Vector2(Mathf.Clamp(position.x, -1, 1), Mathf.Clamp(position.y, -1, 1));
            result.Velocity = velocity;
            result.Energy = Mathf.Clamp01(Value(mass?["energy"]));
            if (changed || result.SourceStep == SourceStep.Rewind || result.SourceStep == SourceStep.Gap)
                previousGravity = null;
            // Linear excitation belongs to this accepted sample. Missing or invalid IMU
            // may retain the last orientation, but must not replay an old acceleration.
            result.BodyAcceleration = Vector3.zero;
            Vector3 acceleration;
            if (Flag(snapshot["imu"]?["valid"]) && Triple(snapshot["imu"]?["accel_g"], out acceleration))
            {
                Vector3 body = PresentationMath.SensorToBody(acceleration, Flag(resolved?["model"]?["device_frame_transform"]));
                Vector3 gravity = previousGravity.HasValue ? Vector3.Lerp(previousGravity.Value, body, .3f) : body;
                if (gravity.sqrMagnitude > .000001f)
                {
                    result.BodyGravity = gravity;
                    result.BodyAcceleration = body - gravity;
                    result.VesselRotation = PresentationMath.RotationFromBodyGravity(gravity);
                    result.HasOrientation = true;
                    previousGravity = gravity;
                }
            }
            var demo = mass?["demo"] as JObject;
            result.PileSlope = Flag(demo?["granular_pile_active"]) && Number(demo?["pile_slope"], out fill) ? (float?)Mathf.Clamp(fill, -8, 8) : null;
            result.GranularFlow = Flag(demo?["granular_pile_active"]) && Number(demo?["granular_flow"], out fill) ? (float?)Mathf.Clamp01(fill) : null;
            result.Heartbeat = ReadHeartbeat(mass?["heartbeat"] as JObject);
            result.Pressure = ReadPressure(demo?["pressure"] as JObject);
            ulong total;
            result.EventTotal = Counter(snapshot["evt_total"], out total) ? total : 0;
            result.NewEvents = Mathf.Clamp((int)Value(snapshot["new_evt"]), 0, 16);
            result.EventType = Text(snapshot["last_event"]?["type"], "None");
            result.EventAmplitude = Mathf.Clamp01(Value(snapshot["last_event"]?["amplitude"]));
            previousRawMs = rawMs; previousCounter = counter; previousSourceS = sourceS;
            Current = result;
            return result;
        }

        private static HeartbeatFrame ReadHeartbeat(JObject value)
        {
            if (value == null || !Flag(value["enabled"])) return null;
            float phase, bpm, primary, secondary, contraction;
            ulong sequence;
            if (!Number(value["phase"], out phase) || phase < 0 || phase >= 1 ||
                !Number(value["bpm"], out bpm) || bpm < 40 || bpm > 140 ||
                !Unit(value["primary"], out primary) || !Unit(value["secondary"], out secondary) ||
                !Unit(value["contraction"], out contraction) || !Counter(value["beat_sequence"], out sequence) || sequence > uint.MaxValue) return null;
            return new HeartbeatFrame { Phase = phase, Bpm = bpm, Primary = primary,
                Secondary = secondary, Contraction = contraction, BeatSequence = (uint)sequence };
        }
        private static PressureFrame ReadPressure(JObject value)
        {
            if (value == null || !Flag(value["enabled"])) return null;
            string phase = Text(value["phase"], "");
            float charge, time, remaining; ulong sequence;
            if ((phase != "sealed" && phase != "burst" && phase != "spent") ||
                !Unit(value["charge"], out charge) || !Unit(value["remaining"], out remaining) ||
                !Number(value["phase_s"], out time) || time < 0 ||
                !Counter(value["burst_sequence"], out sequence) || sequence > uint.MaxValue) return null;
            return new PressureFrame { Phase = phase, Charge = charge, PhaseS = time, Remaining = remaining, BurstSequence = (uint)sequence };
        }
        private static bool Flag(JToken token) { return token != null && token.Type == JTokenType.Boolean && (bool)token; }
        private static string Text(JToken token, string fallback) { return token != null && token.Type == JTokenType.String ? (string)token : fallback; }
        private static bool Double(JToken token, out double value)
        {
            value = 0;
            if (token == null || (token.Type != JTokenType.Float && token.Type != JTokenType.Integer)) return false;
            try { value = (double)token; return !double.IsNaN(value) && !double.IsInfinity(value); } catch { return false; }
        }
        private static bool Number(JToken token, out float value)
        {
            double number; bool valid = Double(token, out number) && number <= float.MaxValue && number >= -float.MaxValue;
            value = valid ? (float)number : 0; return valid;
        }
        private static float Value(JToken token) { float value; return Number(token, out value) ? value : 0; }
        private static bool Unit(JToken token, out float value) { return Number(token, out value) && value >= 0 && value <= 1; }
        private static bool Counter(JToken token, out ulong value)
        {
            double number; bool valid = Double(token, out number) && number >= 0 && number <= 9007199254740991d && Math.Floor(number) == number;
            value = valid ? (ulong)number : 0; return valid;
        }
        private static bool Pair(JToken token, out Vector2 value)
        {
            value = Vector2.zero; var array = token as JArray; float x, y;
            if (array == null || array.Count != 2 || !Number(array[0], out x) || !Number(array[1], out y)) return false;
            value = new Vector2(x, y); return true;
        }
        private static bool Triple(JToken token, out Vector3 value)
        {
            value = Vector3.zero; var array = token as JArray; float x, y, z;
            if (array == null || array.Count != 3 || !Number(array[0], out x) || !Number(array[1], out y) || !Number(array[2], out z)) return false;
            value = new Vector3(x, y, z); return true;
        }
    }
}
