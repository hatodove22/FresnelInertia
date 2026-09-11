using System;
using System.Diagnostics;
using UnityEngine;

namespace Fresnel.Materials
{
    /// <summary>Reusable material component. Feed ApplyFrame from telemetry or your own clock.
    /// Only explicit AutoSimulate uses Unity time. No hardware or transport dependency.</summary>
    [DisallowMultipleComponent]
    [AddComponentMenu("Fresnel/Container Material")]
    public sealed class ContainerMaterialActor : MonoBehaviour
    {
        public MaterialKind Kind = MaterialKind.Water;
        public MaterialQuality Quality = MaterialQuality.Balanced;
        [Tooltip("Use the smooth GPU water field on supported desktop graphics; CPU remains the fallback.")]
        public bool PreferGpuWater = true;
        public Vector3 Size = new Vector3(.10f, .075f, .055f);
        [Range(0, 1)] public float Fill = .48f;
        [Range(0, 1)] public float Viscosity = .12f;
        [Range(0, 1)] public float Friction = .65f;
        [Range(0, 1)] public float Softness = .45f;
        [Tooltip("For standalone offline samples only. Disable when feeding source frames.")]
        public bool AutoSimulate;
        public bool Paused;
        public ContainerSimulation Simulation { get; private set; }
        public MaterialRenderer Renderer { get; private set; }
        public int AppliedFrames { get; private set; }
        public double SourceTime { get; private set; }
        public double SimulationMs { get; private set; }
        public double SurfaceMs { get; private set; }
        public bool IsStale { get; private set; }
        bool configured, hasTime;
        MaterialKind lastKind;
        MaterialQuality lastQuality;
        bool lastPreferGpu;
        Vector3 lastSize;
        float lastFill;
        double localTime;
        bool hasAutoPose, hasAutoVelocity;
        Vector3 autoPosition, autoVelocity;
        Quaternion autoRotation;
        readonly Stopwatch timer = new Stopwatch();

        public void SetStale(bool stale) { IsStale = stale; if (stale) hasAutoPose = hasAutoVelocity = false; }
        public void ResetState() { configured = false; hasTime = false; localTime = 0; hasAutoPose = hasAutoVelocity = false; }
        public void SetVisible(bool visible)
        {
            if (Renderer != null) Renderer.SetVisible(visible);
        }
        public void ApplyFrame(MaterialFrame frame)
        {
            if (IsStale || Paused || !frame.IsFresh || !Finite(frame)) return;
            bool configuration = !configured || Kind != lastKind || Quality != lastQuality || PreferGpuWater != lastPreferGpu ||
                (frame.Size - lastSize).sqrMagnitude > 1e-14f || Mathf.Abs(frame.Fill-lastFill) > .0001f;
            if (!configuration && hasTime && frame.Time == SourceTime && !frame.Rebase) return;
            frame.Rebase |= !hasTime || frame.Time < SourceTime || frame.Time-SourceTime > .5;
            if (hasTime && !frame.Rebase) frame.DeltaTime = (float)Math.Min(.1, frame.Time-SourceTime);
            frame.DeltaTime = Mathf.Clamp(frame.DeltaTime, 0, .1f);
            Size = frame.Size; Fill = Mathf.Clamp01(frame.Fill);
            if (Simulation == null) Simulation = new ContainerSimulation();
            if (Renderer == null) Renderer = new MaterialRenderer(transform);
            if (configuration)
            {
                Simulation.Configure(Kind, Size, Fill, Quality);
                Renderer.Configure(Kind, Size, Fill, Quality, PreferGpuWater);
                lastKind = Kind; lastQuality = Quality; lastSize = Size; lastFill = Fill; lastPreferGpu = PreferGpuWater;
                configured = true; frame.Rebase = true;
            }
            if (frame.Rebase) { frame.DeltaTime = 0; hasAutoPose = hasAutoVelocity = false; }
            Simulation.Viscosity = Mathf.Clamp01(Viscosity);
            Simulation.Friction = Mathf.Clamp01(Friction);
            Simulation.Softness = Mathf.Clamp01(Softness);
            timer.Restart(); Simulation.Step(frame); timer.Stop(); SimulationMs = timer.Elapsed.TotalMilliseconds;
            timer.Restart(); Renderer.Render(Simulation, frame); timer.Stop(); SurfaceMs = timer.Elapsed.TotalMilliseconds;
            SourceTime = frame.Time; hasTime = true; AppliedFrames++;
        }
        void Update()
        {
            if (!AutoSimulate || Paused || IsStale) { hasAutoPose = hasAutoVelocity = false; return; }
            float dt = Mathf.Min(.05f, Time.deltaTime);
            if (dt <= 0) { hasAutoPose = hasAutoVelocity = false; return; }
            if (Time.deltaTime > .1f) hasAutoPose = hasAutoVelocity = false;
            Vector3 position = transform.position;
            Quaternion rotation = transform.rotation;
            Vector3 velocity = hasAutoPose ? (position - autoPosition) / dt : Vector3.zero;
            Vector3 acceleration = hasAutoVelocity ? transform.InverseTransformDirection((velocity - autoVelocity) / dt) : Vector3.zero;
            Vector3 angularVelocity = Vector3.zero;
            if (hasAutoPose)
            {
                Quaternion delta = rotation * Quaternion.Inverse(autoRotation);
                // Use the shortest rotation, so a quaternion sign flip is not a spin.
                if (delta.w < 0) delta = new Quaternion(-delta.x, -delta.y, -delta.z, -delta.w);
                delta.ToAngleAxis(out float angle, out Vector3 axis);
                if (angle > .00001f && Valid(axis.x) && Valid(axis.y) && Valid(axis.z))
                    angularVelocity = transform.InverseTransformDirection(axis * (angle * Mathf.Deg2Rad / dt));
            }
            localTime += dt;
            int before = AppliedFrames;
            ApplyFrame(new MaterialFrame { Time = localTime, DeltaTime = dt, IsFresh = true,
                Size = Size, Fill = Fill, Gravity = transform.InverseTransformDirection(Physics.gravity),
                Acceleration = acceleration, AngularVelocity = angularVelocity,
                Contraction = Kind == MaterialKind.Softbody ? .4f * Mathf.Pow(Mathf.Max(0, Mathf.Sin((float)localTime*7.5f)), 8) : 0 });
            if (AppliedFrames != before)
            {
                hasAutoVelocity = hasAutoPose; hasAutoPose = true;
                autoPosition = position; autoRotation = rotation; autoVelocity = velocity;
            }
        }
        static bool Finite(MaterialFrame f)
        {
            return !(double.IsNaN(f.Time) || double.IsInfinity(f.Time)) &&
                Valid(f.Size.x) && Valid(f.Size.y) && Valid(f.Size.z) &&
                f.Size.x >= .0001f && f.Size.y >= .0001f && f.Size.z >= .0001f && f.Size.x <= 10 && f.Size.y <= 10 && f.Size.z <= 10 &&
                Valid(f.Fill) && Valid(f.DeltaTime) && Valid(f.Gravity.x) && Valid(f.Gravity.y) && Valid(f.Gravity.z) &&
                Valid(f.Acceleration.x) && Valid(f.Acceleration.y) && Valid(f.Acceleration.z) &&
                Valid(f.AngularVelocity.x) && Valid(f.AngularVelocity.y) && Valid(f.AngularVelocity.z) &&
                Valid(f.MassPosition.x) && Valid(f.MassPosition.y) && Valid(f.Velocity.x) && Valid(f.Velocity.y) &&
                Valid(f.Energy) && Valid(f.Flow) && Valid(f.Slope) && Valid(f.Contraction) && Valid(f.EventAmplitude);
        }
        static bool Valid(float v) { return !float.IsNaN(v) && !float.IsInfinity(v); }
        void OnDestroy()
        {
            if (Renderer != null) Renderer.Dispose();
            var disposable = Simulation as IDisposable; if (disposable != null) disposable.Dispose();
            Renderer = null; Simulation = null;
        }
    }
}
