using UnityEngine;

namespace Fresnel.Materials
{
    public enum MaterialKind { Water, Sand, Softbody }
    public enum MaterialQuality { Mobile, Balanced, High }

    /// <summary>Caller-owned source state. Local coordinates are metres, Y-up.
    /// Gravity points DOWN. No device transport or actuator commands exist in this package.</summary>
    public struct MaterialFrame
    {
        public double Time;
        public float DeltaTime;
        public bool Rebase, IsDevice, IsFresh;
        public Vector3 Size, Gravity;
        /// <summary>Container-origin linear acceleration in local m/s², excluding gravity.</summary>
        public Vector3 Acceleration;
        /// <summary>Container angular velocity about its origin, in local radians/second.</summary>
        public Vector3 AngularVelocity;
        public Vector2 MassPosition, Velocity;
        public float Fill, Energy, Flow, Slope, Contraction;
        public int NewEvents;
        public float EventAmplitude;
    }

    /// <summary>Visual-only wall impulse estimate for one accepted simulation step.
    /// Impulse is incident normal momentum including nominal restitution, per unit
    /// total particle mass (m/s), not a measured device event or full contact force.
    /// Position is its weighted local wall point; Normal points into the vessel.</summary>
    public struct WallImpact
    {
        public float Impulse;
        public Vector3 Position, Normal;
    }

    public struct SimulationMetrics
    {
        public int ParticleCount, ContactCount;
        public Vector3 CenterOfMass;
        public float KineticEnergy, MaxSpeed, SimulatedSeconds;
    }
}
