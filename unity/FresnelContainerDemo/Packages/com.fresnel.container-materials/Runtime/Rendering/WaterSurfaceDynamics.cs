using System;
using UnityEngine;

namespace Fresnel.Materials
{
    // Four reduced free-surface modes. Time comes exclusively from the solver's
    // consumed source step; an unchanged source cannot advance these oscillators.
    internal sealed class WaterSurfaceDynamics
    {
        readonly float[] displacement = new float[4], velocity = new float[4], frequency = new float[4];
        Vector3 previousMean, observedAcceleration;
        double sourceTime = double.NaN;
        bool hasMean;
        public int Revision { get; private set; }
        public float Energy { get; private set; }
        public float Activity { get; private set; }
        public float CrestExcitation { get; private set; }
        public Vector4 Modes { get { return new Vector4(displacement[0], displacement[1], displacement[2], displacement[3]); } }
        public Vector4 Speeds { get { return new Vector4(velocity[0], velocity[1], velocity[2], velocity[3]); } }

        public void Reset()
        {
            Array.Clear(displacement, 0, 4); Array.Clear(velocity, 0, 4);
            previousMean = observedAcceleration = Vector3.zero; sourceTime = double.NaN; hasMean = false;
            Energy = Activity = CrestExcitation = 0; Revision++;
        }

        public void Advance(ContainerSimulation simulation, MaterialFrame frame, Vector3 mean,
            Vector3 up, Vector3 axisU, Vector3 axisV, float extentU, float extentV)
        {
            if (frame.Rebase || simulation.Count == 0)
            {
                Reset(); sourceTime = frame.Time; previousMean = mean; hasMean = true; return;
            }
            float dt = Mathf.Min(.05f, simulation.LastConsumedDelta);
            if (!frame.IsFresh || dt <= 0 || (!double.IsNaN(sourceTime) && frame.Time <= sourceTime)) return;
            if (!hasMean) { previousMean = mean; hasMean = true; }
            Vector3 measured = Vector3.ClampMagnitude((mean - previousMean) / dt, 80);
            observedAcceleration = Vector3.Lerp(observedAcceleration, measured, 1 - Mathf.Exp(-dt * 28));
            previousMean = mean; sourceTime = frame.Time;
            float gravity = Mathf.Max(.1f, frame.Gravity.magnitude);
            float depth = Mathf.Max(.0001f, simulation.Size.y * Mathf.Clamp01(frame.Fill));
            float kU = Mathf.PI / Mathf.Max(.0001f, 2 * extentU), kV = Mathf.PI / Mathf.Max(.0001f, 2 * extentV);
            float diagonal = Mathf.Sqrt(kU * kU + kV * kV);
            frequency[0] = Dispersion(gravity, kU, depth); frequency[1] = Dispersion(gravity, kV, depth);
            frequency[2] = Dispersion(gravity, diagonal, depth); frequency[3] = Dispersion(gravity, kU * 2, depth);
            float minimumSize = Mathf.Min(simulation.Size.x, Mathf.Min(simulation.Size.y, simulation.Size.z));
            float fillEnvelope = Mathf.Sqrt(Mathf.Clamp01(frame.Fill * (1 - frame.Fill) * 4));
            float limit = Mathf.Max(.000001f, minimumSize * .20f * fillEnvelope);
            // Small packing corrections are rejected. Real container acceleration and
            // coherent particle acceleration drive phase-lagged, freely decaying waves.
            Vector3 inertial = Vector3.ClampMagnitude(frame.Acceleration, 80);
            CrestExcitation = Mathf.Max(CrestExcitation * Mathf.Exp(-dt * 4), Mathf.Clamp01((inertial.magnitude - 3) / 35));
            Vector3 drive = -.11f * DeadBand(inertial, .25f) + .035f * DeadBand(observedAcceleration, .65f);
            float forceU = Vector3.Dot(drive, axisU), forceV = Vector3.Dot(drive, axisV);
            float forceCross = .12f * (forceU * Mathf.Sign(displacement[1]) + forceV * Mathf.Sign(displacement[0]));
            // A second longitudinal mode places a curved crest inside the vessel.
            // Its own phase and natural frequency distinguish it from a tilted plane.
            float forceCrest = .28f * forceU + .12f * forceV;
            for (int wall = 0; wall < 6; wall++)
            {
                var impact = simulation.GetWallImpact(wall);
                float excess = ImpactExcess(impact.Impulse, impact.Normal, frame.Gravity, dt);
                if (excess <= 0) continue;
                CrestExcitation = Mathf.Max(CrestExcitation, Mathf.Clamp01(excess * 18));
                float a = Mathf.Clamp(Vector3.Dot(impact.Position, axisU) / extentU, -1, 1);
                float b = Mathf.Clamp(Vector3.Dot(impact.Position, axisV) / extentV, -1, 1);
                float u = Mathf.Sin(a * Mathf.PI * .5f), v = Mathf.Sin(b * Mathf.PI * .5f);
                float kick = Mathf.Min(.28f, excess * 1.5f);
                velocity[0] += kick * u; velocity[1] += kick * v;
                velocity[2] += kick * u * v * .45f;
                velocity[3] += kick * Mathf.Cos(a * Mathf.PI) * .80f;
            }
            float damping = .105f + Mathf.Clamp01(simulation.Viscosity) * .22f;
            int steps = Mathf.Max(1, Mathf.CeilToInt(dt * 240)); float h = dt / steps;
            for (int step = 0; step < steps; step++) for (int mode = 0; mode < 4; mode++)
            {
                float force = mode == 0 ? forceU : mode == 1 ? forceV : mode == 2 ? forceCross : forceCrest;
                float omega = frequency[mode], bound = limit * (mode < 2 ? 1 : mode == 3 ? .60f : .42f);
                velocity[mode] += (force - omega * omega * displacement[mode] - 2 * damping * omega * velocity[mode]) * h;
                velocity[mode] = Mathf.Clamp(velocity[mode], -omega * bound * 2, omega * bound * 2);
                displacement[mode] += velocity[mode] * h;
                if (Mathf.Abs(displacement[mode]) > bound)
                { displacement[mode] = Mathf.Clamp(displacement[mode], -bound, bound); velocity[mode] *= .25f; }
                if (Mathf.Abs(displacement[mode]) < minimumSize * .000005f && Mathf.Abs(velocity[mode]) < minimumSize * .0001f && Mathf.Abs(force) < .0001f)
                    displacement[mode] = velocity[mode] = 0;
            }
            Energy = 0;
            for (int mode = 0; mode < 4; mode++)
                Energy += displacement[mode] * displacement[mode] + velocity[mode] * velocity[mode] / (frequency[mode] * frequency[mode]);
            Activity = Mathf.Clamp01(Mathf.Sqrt(Energy) / Mathf.Max(.000001f, limit));
            Revision++;
        }

        // Impulses are per-particle-equivalent metres/second. Remove the normal
        // support of gravity before treating a contact as a splash-producing hit.
        public static float ImpactExcess(float impulse, Vector3 inward, Vector3 gravity, float dt)
        { return Mathf.Max(0, impulse - Mathf.Max(0, -Vector3.Dot(gravity, inward)) * dt * 1.25f - .006f); }

        public ulong StateHash
        {
            get
            {
                ulong hash = 1469598103934665603UL;
                for (int i = 0; i < 4; i++) { Mix(ref hash, displacement[i]); Mix(ref hash, velocity[i]); }
                Mix(ref hash, observedAcceleration.x); Mix(ref hash, observedAcceleration.y); Mix(ref hash, observedAcceleration.z);
                Mix(ref hash, CrestExcitation);
                unchecked { return (hash ^ (uint)Revision) * 1099511628211UL; }
            }
        }
        internal static void Mix(ref ulong hash, float value)
        { unchecked { hash = (hash ^ (uint)BitConverter.SingleToInt32Bits(value)) * 1099511628211UL; } }
        static float Dispersion(float gravity, float k, float depth)
        { return Mathf.Clamp(Mathf.Sqrt(gravity * k * (float)Math.Tanh(k * depth)), 2, 160); }
        static Vector3 DeadBand(Vector3 value, float threshold)
        { float length = value.magnitude; return length > threshold ? value * ((length - threshold) / length) : Vector3.zero; }
    }
}
