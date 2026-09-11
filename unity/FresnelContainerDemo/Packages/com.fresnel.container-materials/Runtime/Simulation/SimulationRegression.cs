using System;
using UnityEngine;

namespace Fresnel.Materials
{
    /// <summary>Runtime-capable numerical regression; no Editor or test-framework dependency.</summary>
    public static class SimulationRegression
    {
        public static int Run()
        {
            int checks = 0;
            Vector3 size = new Vector3(.12f, .09f, .052f);
            foreach (MaterialKind kind in Enum.GetValues(typeof(MaterialKind)))
            {
                using (var simulation = new ContainerSimulation())
                {
                    simulation.Configure(kind, size, .55f, MaterialQuality.Mobile);
                    int count = simulation.Count;
                    Require(count > 20 && count <= 900, kind + " bounded mobile particle budget", ref checks);
                    Vector3[] positions = simulation.Positions, velocities = simulation.Velocities;
                    float[] radii = simulation.Radii;
                    float initialY = simulation.Metrics.CenterOfMass.y;
                    double time = 0;
                    // Tilt, reverse, invert and shake a CLOSED vessel. Every trajectory must
                    // conserve particles, remain finite and respect radius-aware wall bounds.
                    for (int frame = 0; frame < 240; frame++)
                    {
                        Vector3 gravity;
                        if (frame < 60) gravity = new Vector3(5, -8, 0);
                        else if (frame < 120) gravity = new Vector3(-7, -5, 2);
                        else if (frame < 180) gravity = new Vector3(0, 9.81f, 0);
                        else gravity = new Vector3(Mathf.Sin(frame * .8f) * 25, Mathf.Cos(frame * .61f) * 20, Mathf.Sin(frame * .3f) * 10);
                        time += .025;
                        simulation.Step(Frame(time, .025f, gravity));
                        RequireState(simulation, count, "tilt/invert/shake " + kind + " frame " + frame);
                    }
                    Require(ReferenceEquals(positions, simulation.Positions) && ReferenceEquals(velocities, simulation.Velocities) &&
                        ReferenceEquals(radii, simulation.Radii), kind + " stepping preserves array storage", ref checks);
                    float accountedTime = simulation.Metrics.SimulatedSeconds + simulation.SkippedSeconds;
                    Require(accountedTime > 5.99f && accountedTime < 6.01f && simulation.LastConsumedDelta <= 2f / 120f + .000001f,
                        kind + " simulated and skipped time truthfully account for caller time", ref checks);
                    Require(simulation.Metrics.ContactCount > 0, kind + " records boundary contacts", ref checks);
                    checks++; // All 240 full particle scans above passed.

                    ulong before = Fingerprint(simulation);
                    MaterialFrame stopped = Frame(time + 1, .05f, new Vector3(20, 20, 20)); stopped.IsFresh = false;
                    for (int i = 0; i < 20; i++) simulation.Step(stopped);
                    Require(before == Fingerprint(simulation), kind + " stale state freezes exactly", ref checks);
                    simulation.Step(Frame(time, .05f, Vector3.up * 30));
                    Require(before == Fingerprint(simulation), kind + " duplicate source time freezes exactly", ref checks);
                    simulation.Step(Frame(time - 1, .05f, Vector3.up * 30));
                    Require(before == Fingerprint(simulation), kind + " rewound time requires explicit rebase", ref checks);
                    simulation.Step(Frame(time + 1, 0, Vector3.up * 30));
                    Require(before == Fingerprint(simulation), kind + " zero source delta freezes exactly", ref checks);
                    simulation.Step(Frame(double.NaN, .05f, Vector3.up));
                    Require(before == Fingerprint(simulation), kind + " invalid source time freezes exactly", ref checks);
                    MaterialFrame rebase = Frame(0, 0, Vector3.down * 9.81f); rebase.Rebase = true;
                    simulation.Step(rebase);
                    Require(simulation.Metrics.MaxSpeed == 0 && Mathf.Abs(simulation.Metrics.CenterOfMass.y - initialY) < 1e-6f,
                        kind + " rebase reseeds and discards momentum", ref checks);

                    // First a stationary source; then an accepted aggregate shift. A detail
                    // solver can have a bounded residual, but must move in the commanded direction.
                    for (int i = 1; i <= 30; i++)
                    {
                        MaterialFrame device = Frame(i * .05, .05f, Vector3.down * 9.81f);
                        device.IsDevice = true; device.MassPosition = new Vector2(.6f, -.2f);
                        simulation.Step(device);
                    }
                    Require(simulation.Metrics.CenterOfMass.x > .012f, kind + " accepted aggregate drives visual COM", ref checks);
                    Require(Mathf.Abs(simulation.AggregateError - (simulation.AcceptedCenter - simulation.Metrics.CenterOfMass).magnitude) < 1e-6f,
                        kind + " agreement residual is measured honestly", ref checks);
                    for (int i = 31; i <= 50; i++)
                    {
                        MaterialFrame corner = Frame(i * .05, .05f, new Vector3(15, 18, -6));
                        corner.IsDevice = true; corner.MassPosition = new Vector2(i < 41 ? 1 : -1, 1);
                        simulation.Step(corner);
                        RequireState(simulation, count, kind + " source corner constraints");
                    }
                    Require(Spread(simulation) > simulation.ParticleRadius, kind + " aggregate boundary correction preserves volume", ref checks);
                    before = Fingerprint(simulation);
                    MaterialFrame staleDevice = Frame(3, .05f, Vector3.up * 25); staleDevice.IsFresh = false; staleDevice.IsDevice = true;
                    simulation.Step(staleDevice);
                    Require(before == Fingerprint(simulation), kind + " device detail never outruns accepted source", ref checks);
                }
            }

            // Empty, almost-empty and full containers all obey the same numerical contract.
            foreach (MaterialKind kind in Enum.GetValues(typeof(MaterialKind)))
                foreach (float fill in new[] { 0f, .005f, .95f, 1f })
                    using (var simulation = new ContainerSimulation())
                    {
                        simulation.Configure(kind, size, fill, MaterialQuality.Mobile);
                        int count = simulation.Count;
                        Require(fill == 0 ? count == 0 : count > 0, kind + " fill " + fill + " count", ref checks);
                        for (int i = 1; i <= 30; i++)
                        {
                            simulation.Step(Frame(i * .02, .02f, new Vector3(17, 12, -9)));
                            RequireState(simulation, count, kind + " fill " + fill);
                        }
                        checks++;
                    }

            using (var a = new ContainerSimulation())
            using (var b = new ContainerSimulation())
            {
                a.Configure(MaterialKind.Water, size, .55f, MaterialQuality.Mobile);
                b.Configure(MaterialKind.Water, size, .55f, MaterialQuality.Mobile);
                for (int i = 1; i <= 80; i++)
                {
                    MaterialFrame frame = Frame(i / 60d, 1f / 60, new Vector3(5 * Mathf.Sin(i * .1f), -9.81f, 1));
                    a.Step(frame); b.Step(frame);
                }
                Require(Fingerprint(a) == Fingerprint(b), "fixed input reproduces deterministic particles", ref checks);
                Require(a.Metrics.CenterOfMass.y < -.005f, "water retains a free upper surface under gravity", ref checks);
                // Water should be a compact body with real local exclusion, not independent
                // ballistic particles collapsed into the bottom plane.
                float minY = float.PositiveInfinity, maxY = float.NegativeInfinity;
                for (int i = 0; i < a.Count; i++) { minY = Mathf.Min(minY, a.Positions[i].y); maxY = Mathf.Max(maxY, a.Positions[i].y); }
                Require(maxY - minY > a.ParticleRadius * 3, "density constraints preserve a volumetric water body", ref checks);
            }

            using (var soft = new ContainerSimulation())
            {
                soft.Configure(MaterialKind.Softbody, size, .65f, MaterialQuality.Mobile);
                float initial = Spread(soft);
                for (int i = 1; i <= 60; i++)
                {
                    MaterialFrame frame = Frame(i / 60d, 1f / 60, Vector3.zero); frame.Contraction = 1; soft.Step(frame);
                }
                float contracted = Spread(soft);
                Require(contracted < initial * .88f && contracted > initial * .55f, "source contraction deforms elastic body", ref checks);
                for (int i = 61; i <= 120; i++) soft.Step(Frame(i / 60d, 1f / 60, Vector3.zero));
                Require(Spread(soft) > contracted * 1.1f, "elastic bonds recover after contraction", ref checks);
            }

            using (var normalFrame = new ContainerSimulation())
            using (var slowFrame = new ContainerSimulation())
            {
                normalFrame.Configure(MaterialKind.Water, size, .55f, MaterialQuality.Mobile);
                slowFrame.Configure(MaterialKind.Water, size, .55f, MaterialQuality.Mobile);
                for (int i = 1; i <= 60; i++)
                {
                    Vector3 gravity = new Vector3(Mathf.Sin(i * .1f) * 7, -9.81f, 1);
                    normalFrame.Step(Frame(i / 60d, 1f / 60, gravity));
                    slowFrame.Step(Frame(i / 10d, .1f, gravity));
                }
                Require(Fingerprint(normalFrame) == Fingerprint(slowFrame),
                    "slow render frames preserve the same bounded workload and constraint trajectory as 60Hz", ref checks);
            }

            foreach (MaterialKind kind in new[] { MaterialKind.Water, MaterialKind.Sand })
                using (var low = new ContainerSimulation())
                using (var high = new ContainerSimulation())
                {
                    low.Configure(kind, size, .55f, MaterialQuality.Mobile);
                    high.Configure(kind, size, .55f, MaterialQuality.Mobile);
                    low.Viscosity = low.Friction = 0; high.Viscosity = high.Friction = 1;
                    for (int i = 1; i <= 120; i++)
                    {
                        MaterialFrame frame = Frame(i / 60d, 1f / 60, i < 60 ? new Vector3(7, -9.81f, 0) : Vector3.down * 9.81f);
                        low.Step(frame); high.Step(frame);
                    }
                    if (kind == MaterialKind.Water)
                        Require(high.Metrics.KineticEnergy < low.Metrics.KineticEnergy * .90f,
                            "higher viscosity damps residual water motion", ref checks);
                    else
                        Require(high.Metrics.CenterOfMass.x > low.Metrics.CenterOfMass.x + .001f,
                            "higher friction retains a granular offset after tilt", ref checks);
                }

            using (var simulation = new ContainerSimulation())
            {
                simulation.Configure(MaterialKind.Water, size, .55f, MaterialQuality.Mobile);
                simulation.Step(Frame(.1, .1f, Vector3.down * 9.81f));
                Require(Mathf.Abs(simulation.LastConsumedDelta - 2f / 120f) < .000001f &&
                    Mathf.Abs(simulation.LastSkippedDelta - (.1f - 2f / 120f)) < .000001f,
                    "slow render frame has a fixed two-substep budget with explicit omitted time", ref checks);
                simulation.Step(Frame(.2, .1f, Vector3.down * 9.81f));
                Require(Mathf.Abs(simulation.Metrics.SimulatedSeconds - 4f / 120f) < .000001f &&
                    Mathf.Abs(simulation.Metrics.SimulatedSeconds + simulation.SkippedSeconds - .2f) < .000001f,
                    "omitted time is not accumulated into a later catch-up spiral", ref checks);
                bool failed = false;
                try { simulation.Configure(MaterialKind.Water, new Vector3(float.NaN, .1f, .1f), .5f, MaterialQuality.Mobile); }
                catch (ArgumentOutOfRangeException) { failed = true; }
                Require(failed, "nonfinite geometry rejected", ref checks);
                failed = false;
                try { simulation.Configure(MaterialKind.Water, size, 1.01f, MaterialQuality.Mobile); }
                catch (ArgumentOutOfRangeException) { failed = true; }
                Require(failed, "invalid fill rejected", ref checks);
                simulation.Configure(MaterialKind.Sand, new Vector3(.8f, .002f, .006f), .8f, MaterialQuality.Mobile);
                simulation.Step(Frame(1, .05f, new Vector3(20, -9, 0)));
                RequireState(simulation, simulation.Count, "thin vessel");
                Require(simulation.Count <= 900, "thin vessel obeys bounded capacity", ref checks);
                simulation.Dispose();
                Require(simulation.Count == 0 && simulation.Positions.Length == 0, "dispose releases particle storage", ref checks);
            }
            VerifySpatialContacts(ref checks);
            VerifyInertialMotion(ref checks);
            return checks;
        }

        private static void VerifyInertialMotion(ref int checks)
        {
            Vector3 size = new Vector3(.075f, .062f, .045f);
            using (var accelerated = new ContainerSimulation())
            using (var gravityReference = new ContainerSimulation())
            {
                accelerated.Configure(MaterialKind.Water, size, .0001f, MaterialQuality.Mobile);
                gravityReference.Configure(MaterialKind.Water, size, .0001f, MaterialQuality.Mobile);
                accelerated.Positions[0] = gravityReference.Positions[0] = Vector3.zero;
                var frame = Frame(1d / 120, 1f / 120, Vector3.zero);
                frame.Acceleration = new Vector3(4, -2, 1);
                accelerated.Step(frame);
                frame.Gravity = -frame.Acceleration; frame.Acceleration = Vector3.zero;
                gravityReference.Step(frame);
                Require(Fingerprint(accelerated) == Fingerprint(gravityReference),
                    "linear container acceleration uses g minus a with metric units", ref checks);
                Require(accelerated.Velocities[0].x < -.03f && accelerated.Velocities[0].y > .01f,
                    "content inertia opposes container acceleration", ref checks);
            }

            using (var spinning = new ContainerSimulation())
            {
                spinning.Configure(MaterialKind.Water, size, .0001f, MaterialQuality.Mobile);
                spinning.Positions[0] = new Vector3(.01f, 0, 0);
                spinning.Velocities[0] = new Vector3(0, .1f, 0);
                var frame = Frame(1d / 120, 1f / 120, Vector3.zero);
                frame.AngularVelocity = new Vector3(0, 0, 10); spinning.Step(frame);
                Require(spinning.Velocities[0].x > .024f && spinning.Velocities[0].x < .026f,
                    "centrifugal and Coriolis accelerations have the rotating-frame signs", ref checks);
                spinning.Configure(MaterialKind.Water, size, .0001f, MaterialQuality.Mobile);
                spinning.Step(Frame(1d / 120, 1f / 120, Vector3.zero));
                spinning.Positions[0] = new Vector3(.01f, 0, 0); spinning.Velocities[0] = Vector3.zero;
                frame = Frame(2d / 120, 1f / 120, Vector3.zero); frame.AngularVelocity = Vector3.forward;
                spinning.Step(frame);
                Require(spinning.Velocities[0].y < -.009f && spinning.Velocities[0].y > -.011f,
                    "Euler inertia opposes accepted angular acceleration", ref checks);
            }

            using (var a = new ContainerSimulation())
            using (var b = new ContainerSimulation())
            {
                a.Configure(MaterialKind.Water, size, .05f, MaterialQuality.Mobile);
                b.Configure(MaterialKind.Water, size, .05f, MaterialQuality.Mobile);
                var frame = Frame(.1, 1f / 60, Vector3.down * 9.81f);
                a.Step(frame); b.Step(frame);
                frame.AngularVelocity = Vector3.forward * 25; frame.Acceleration = Vector3.right * 80;
                a.Step(frame); // Duplicate input must not replace accepted angular history.
                Require(a.LastConsumedDelta == 0 && a.LastSkippedDelta == 0,
                    "rejected source frames report zero newly consumed time", ref checks);
                frame.Time = .2; frame.IsFresh = false; a.Step(frame);
                frame.Time = .3; frame.IsFresh = true; frame.Acceleration = Vector3.zero; frame.AngularVelocity = Vector3.forward;
                a.Step(frame); b.Step(frame);
                Require(Fingerprint(a) == Fingerprint(b), "stale and duplicate motion cannot inject a later angular impulse", ref checks);
                frame.Rebase = true; frame.DeltaTime = .1f; frame.Acceleration = Vector3.one * 80;
                a.Step(frame);
                Require(a.Metrics.MaxSpeed == 0 && a.LastConsumedDelta == 0 && a.Metrics.SimulatedSeconds == 0,
                    "rebase is a zero-time reset even when caller supplies positive delta", ref checks);
                float resetImpulses = 0; for (int w = 0; w < 6; w++) resetImpulses += a.GetWallImpact(w).Impulse;
                Require(resetImpulses == 0, "rebase discards prior wall impulse diagnostics", ref checks);
            }

            // A 25 mm sinusoidal translation at 3 Hz is below 1 g vertically;
            // at 5 Hz it exceeds gravity and should visibly loft, then release.
            foreach (MaterialKind kind in new[] { MaterialKind.Water, MaterialKind.Sand, MaterialKind.Softbody })
                foreach (int hz in new[] { 3, 5 })
                    using (var simulation = new ContainerSimulation())
                    {
                        simulation.Configure(kind, size, .48f, MaterialQuality.Mobile);
                        simulation.Viscosity = .12f; simulation.Friction = .65f; simulation.Softness = .45f;
                        int count = simulation.Count;
                        float minX = 1, maxX = -1, peakEnergy = 0;
                        for (int i = 1; i <= 330; i++)
                        {
                            var frame = Frame(i / 60d, 1f / 60, Vector3.down * 9.81f);
                            if (i > 90 && i <= 210)
                            {
                                float omega = 2 * Mathf.PI * hz;
                                frame.Acceleration = new Vector3(-.025f * omega * omega * Mathf.Sin(omega * (i - 90) / 60f), 0, 0);
                            }
                            simulation.Step(frame);
                            RequireState(simulation, count, "rapid lateral excitation and release " + kind);
                            if (i > 90 && i <= 210)
                            {
                                minX = Mathf.Min(minX, simulation.Metrics.CenterOfMass.x);
                                maxX = Mathf.Max(maxX, simulation.Metrics.CenterOfMass.x);
                                peakEnergy = Mathf.Max(peakEnergy, simulation.Metrics.KineticEnergy);
                            }
                        }
                        Require(maxX - minX > .012f && peakEnergy > .02f,
                            kind + " " + hz + " Hz translation produces coherent inertial travel", ref checks);
                        Require(simulation.Metrics.KineticEnergy < peakEnergy * .4f,
                            kind + " " + hz + " Hz shake energy decays after release", ref checks);
                    }
            foreach (MaterialKind kind in new[] { MaterialKind.Water, MaterialKind.Sand })
                using (var simulation = new ContainerSimulation())
                {
                    simulation.Configure(kind, size, .48f, MaterialQuality.Mobile);
                    float minY = 1, maxY = -1, strongest = 0;
                    for (int i = 1; i <= 210; i++)
                    {
                        var frame = Frame(i / 60d, 1f / 60, Vector3.down * 9.81f);
                        if (i > 90) frame.Acceleration = new Vector3(0, -.025f * 100 * Mathf.PI * Mathf.PI * Mathf.Sin(10 * Mathf.PI * (i - 90) / 60f), 0);
                        simulation.Step(frame); RequireState(simulation, simulation.Count, "vertical loft and closed walls " + kind);
                        if (i > 90)
                        {
                            minY = Mathf.Min(minY, simulation.Metrics.CenterOfMass.y); maxY = Mathf.Max(maxY, simulation.Metrics.CenterOfMass.y);
                            for (int w = 0; w < 6; w++)
                            {
                                WallImpact impact = simulation.GetWallImpact(w); strongest = Mathf.Max(strongest, impact.Impulse);
                                if (impact.Impulse > 0 && (Mathf.Abs(impact.Position[w / 2]) != size[w / 2] * .5f ||
                                    Mathf.Abs(impact.Normal.sqrMagnitude - 1) > 1e-6f))
                                    throw new InvalidOperationException("Wall impulse position/normal is not on its reported vessel wall.");
                            }
                        }
                    }
                    Require(maxY - minY > .025f && strongest > .2f,
                        kind + " 5 Hz vertical acceleration lofts content and reports localized impacts", ref checks);
                }
        }

        private static void VerifySpatialContacts(ref int checks)
        {
            Vector3 size = new Vector3(.075f, .062f, .045f);
            using (var grains = new ContainerSimulation())
            {
                grains.Configure(MaterialKind.Sand, size, 1, MaterialQuality.Mobile);
                float twoGrainFill = 2f / grains.Count;
                grains.Configure(MaterialKind.Sand, size, twoGrainFill, MaterialQuality.Mobile);
                Require(grains.Count == 2, "isolated contact fixture contains exactly two grains", ref checks);
                double time = 0;
                float diameter = grains.Radii[0] + grains.Radii[1];
                // Test both index orders across every adjacent spatial direction, on
                // either side of zero and translated away from the central cell.
                foreach (float offset in new[] { -.008f, 0, .008f })
                    for (int z = -1; z <= 1; z++)
                        for (int y = -1; y <= 1; y++)
                            for (int x = -1; x <= 1; x++)
                            {
                                if (x == 0 && y == 0 && z == 0) continue;
                                Vector3 center = new Vector3(offset, offset, offset);
                                Vector3 displacement = new Vector3(x, y, z).normalized * (diameter * .38f);
                                grains.Positions[0] = center - displacement;
                                grains.Positions[1] = center + displacement;
                                grains.Velocities[0] = grains.Velocities[1] = Vector3.zero;
                                time += 1d / 120;
                                grains.Step(Frame(time, 1f / 120, Vector3.zero));
                                RequireState(grains, 2, "isolated contact orientation");
                                if ((grains.Positions[0] - grains.Positions[1]).magnitude < diameter * .995f ||
                                    ((grains.Positions[0] + grains.Positions[1]) * .5f - center).magnitude > 1e-6f)
                                    throw new InvalidOperationException("Spatial contact lost a pair or changed its center of mass.");
                            }
                checks++; // All 78 contacts separate and conserve their pair center.
            }

            // Reproduces a late-particle correction pushing an earlier grain outside
            // the vessel immediately before the next broad-phase grid construction.
            using (var grains = new ContainerSimulation())
            {
                grains.Configure(MaterialKind.Sand, new Vector3(.10f, .075f, .055f), .48f, MaterialQuality.High);
                int count = grains.Count;
                for (int i = 1; i <= 240; i++)
                {
                    int f = i - 121;
                    Vector3 gravity = i <= 120 ? Vector3.down * 9.81f :
                        new Vector3(7 * Mathf.Sin(f * .06f), -9.81f, 2 * Mathf.Sin(f * .09f));
                    grains.Step(Frame(i / 60d, 1f / 60, gravity));
                    RequireState(grains, count, "high quality settled-to-sloshing granular grid");
                }
                Require(Spread(grains) > grains.ParticleRadius * 2, "granular broad phase preserves the settled volume", ref checks);
            }

            using (var liquid = new ContainerSimulation())
            {
                liquid.Configure(MaterialKind.Water, size, 1, MaterialQuality.Mobile);
                float cubeFill = 8f / liquid.Count;
                liquid.Configure(MaterialKind.Water, size, cubeFill, MaterialQuality.Mobile);
                Require(liquid.Count == 8, "isolated density fixture contains eight particles", ref checks);
                for (int i = 0; i < 8; i++)
                    liquid.Positions[i] = new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1,
                        (i & 4) == 0 ? -1 : 1) * (liquid.ParticleRadius * .3f);
                float beforeSpread = 0;
                for (int i = 0; i < 8; i++) beforeSpread += liquid.Positions[i].sqrMagnitude;
                liquid.Step(Frame(1d / 120, 1f / 120, Vector3.zero));
                float afterSpread = 0;
                for (int i = 0; i < 8; i++) afterSpread += liquid.Positions[i].sqrMagnitude;
                Require(afterSpread > beforeSpread * 2 && liquid.Metrics.CenterOfMass.magnitude < 1e-6f,
                    "reciprocal density support expands a compressed fluid symmetrically", ref checks);
            }

            foreach (MaterialKind kind in new[] { MaterialKind.Water, MaterialKind.Sand })
                using (var simulation = new ContainerSimulation())
                {
                    simulation.Configure(kind, size, .005f, MaterialQuality.Mobile);
                    Vector3[] directions = { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back };
                    double time = 0;
                    foreach (Vector3 direction in directions)
                    {
                        for (int i = 0; i < simulation.Count; i++)
                        {
                            float radius = simulation.Radii[i];
                            Vector3 extent = size * .5f - Vector3.one * (radius + .000001f);
                            simulation.Positions[i] = Vector3.Scale(direction, extent);
                            simulation.Velocities[i] = direction * 100;
                        }
                        time += .1;
                        simulation.Step(Frame(time, .1f, direction * 35));
                        RequireState(simulation, simulation.Count, "high-speed six-wall containment " + kind);
                        if (simulation.Metrics.ContactCount == 0)
                            throw new InvalidOperationException("High-speed wall contact was not reported.");
                    }
                    checks++;
                }
        }

        private static MaterialFrame Frame(double time, float delta, Vector3 gravity)
        { return new MaterialFrame { Time = time, DeltaTime = delta, IsFresh = true, Gravity = gravity, Fill = .55f }; }
        private static void Require(bool condition, string name, ref int checks)
        { if (!condition) throw new InvalidOperationException("Container simulation regression: " + name); checks++; }
        private static void RequireState(ContainerSimulation simulation, int count, string name)
        {
            if (simulation.Count != count || simulation.Metrics.ParticleCount != count)
                throw new InvalidOperationException(name + ": particle count changed");
            for (int i = 0; i < simulation.Count; i++)
            {
                Vector3 p = simulation.Positions[i], v = simulation.Velocities[i]; float r = simulation.Radii[i];
                if (!Finite(p.x) || !Finite(p.y) || !Finite(p.z) || !Finite(v.x) || !Finite(v.y) || !Finite(v.z) ||
                    Mathf.Abs(p.x) + r > simulation.Size.x * .5f + 1e-6f ||
                    Mathf.Abs(p.y) + r > simulation.Size.y * .5f + 1e-6f ||
                    Mathf.Abs(p.z) + r > simulation.Size.z * .5f + 1e-6f)
                    throw new InvalidOperationException(name + ": nonfinite or escaped particle " + i);
            }
        }
        private static float Spread(ContainerSimulation simulation)
        {
            Vector3 center = simulation.Metrics.CenterOfMass; float result = 0;
            for (int i = 0; i < simulation.Count; i++) result += (simulation.Positions[i] - center).sqrMagnitude;
            return simulation.Count > 0 ? Mathf.Sqrt(result / simulation.Count) : 0;
        }
        private static bool Finite(float f) { return !float.IsNaN(f) && !float.IsInfinity(f); }
        private static ulong Fingerprint(ContainerSimulation simulation)
        {
            unchecked
            {
                ulong result = 1469598103934665603UL;
                for (int i = 0; i < simulation.Count; i++)
                {
                    result = (result ^ (uint)simulation.Positions[i].GetHashCode()) * 1099511628211UL;
                    result = (result ^ (uint)simulation.Velocities[i].GetHashCode()) * 1099511628211UL;
                }
                return result;
            }
        }
    }
}
