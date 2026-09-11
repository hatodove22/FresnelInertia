using UnityEngine;

namespace Fresnel.UnityDemo.Presentation
{
    public enum SourceStep { Missing, Initial, Duplicate, Advance, Rewind, Gap }

    /// <summary>A published value object. Fields are writable for offline fixture creation;
    /// consumers must never mutate an accepted device frame. Coordinates retain body x/y.
    /// Individual mesh vertices are presentation detail, not additional device physics.</summary>
    public sealed class ContentFrame
    {
        public string Source = "device";
        public string Preset = "unknown", Family = "Custom", RunMode = "idle";
        public Vector3 Size;
        public float Fill;
        public bool HasResolvedConfiguration, HasMotion, IsFreshMotion, HasOrientation;
        public double SourceTimeS;
        public float ElapsedS;
        public SourceStep SourceStep;
        public ulong FrameCounter;
        public Vector2 MassPosition, Velocity;
        public float Energy;
        // Body acceleration is gravity-excluded, in g, in right-handed body axes.
        public Vector3 BodyGravity = Vector3.up, BodyAcceleration;
        // Offline gesture position only, metric Unity world axes. Device frames leave zero.
        public Vector3 VisualTranslation;
        public float VisualMotionStrength;
        public Quaternion VesselRotation = Quaternion.identity;
        public float? PileSlope, GranularFlow;
        public HeartbeatFrame Heartbeat;
        public PressureFrame Pressure;
        public ulong EventTotal;
        public int NewEvents;
        public string EventType = "None";
        public float EventAmplitude;
        public float ParticleCount, ParticleHardness;

        public ContentFrame Copy() { return (ContentFrame)MemberwiseClone(); }
    }

    public sealed class HeartbeatFrame
    {
        public float Phase, Bpm, Primary, Secondary, Contraction;
        public uint BeatSequence;
    }

    public sealed class PressureFrame
    {
        public string Phase;
        public float Charge, PhaseS, Remaining;
        public uint BurstSequence;
    }

    public static class PresentationMath
    {
        /// <summary>Right-handed body axes -> Unity's left-handed scene; y remains vertical.</summary>
        public static Vector3 BodyToUnity(Vector3 body) { return new Vector3(body.x, body.y, -body.z); }

        public static Vector3 SensorToBody(Vector3 raw, bool deviceFrameTransform)
        {
            const float rootHalf = .7071067811865475f;
            return deviceFrameTransform ? new Vector3(-raw.y, (raw.x + raw.z) * rootHalf, (raw.z - raw.x) * rootHalf) : raw;
        }

        /// <summary>Conjugate the Web XYZ rotation through a z reflection. No absolute yaw.</summary>
        public static Quaternion RotationFromBodyGravity(Vector3 gravity)
        {
            if (gravity.sqrMagnitude < .000001f) return Quaternion.identity;
            float pitch = -Mathf.Atan2(gravity.z, new Vector2(gravity.x, gravity.y).magnitude) * Mathf.Rad2Deg;
            float roll = Mathf.Atan2(gravity.x, gravity.y) * Mathf.Rad2Deg;
            return Quaternion.AngleAxis(-pitch, Vector3.right) * Quaternion.AngleAxis(roll, Vector3.forward);
        }

        public static Vector3 MarblePosition(Vector3 size, Vector2 mass, float radius)
        {
            return new Vector3(Mathf.Clamp(mass.x, -1, 1) * Mathf.Max(0, size.x * .5f - radius),
                Mathf.Clamp(mass.y, -1, 1) * Mathf.Max(0, size.y * .5f - radius), 0);
        }

        public static SourceStep ClassifyTime(double? previous, double current, out float elapsed)
        {
            elapsed = 0;
            if (double.IsNaN(current) || double.IsInfinity(current)) return SourceStep.Missing;
            if (!previous.HasValue) return SourceStep.Initial;
            double delta = current - previous.Value;
            if (delta == 0) return SourceStep.Duplicate;
            if (delta < 0) return SourceStep.Rewind;
            if (delta > .5) return SourceStep.Gap;
            elapsed = (float)delta;
            return SourceStep.Advance;
        }
    }
}
