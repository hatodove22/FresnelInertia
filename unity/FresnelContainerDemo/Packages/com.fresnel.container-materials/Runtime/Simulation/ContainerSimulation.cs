using System;
using System.Runtime.CompilerServices;
using UnityEngine;

namespace Fresnel.Materials
{
    /// <summary>
    /// Allocation-free small-vessel particle simulation. This is original code, informed by
    /// Macklin &amp; Mueller, Position Based Fluids (2013), and Macklin et al., XPBD (2016).
    /// Water solves unilateral density constraints; sand solves frictional sphere contacts;
    /// soft matter combines compliant distance bonds with rotational shape matching.
    /// This solver produces visual detail, never device commands or authoritative haptic events.
    /// All positions are local metres in a closed box centred at the origin, Y-up.
    /// </summary>
    public sealed class ContainerSimulation : IDisposable
    {
        public Vector3[] Positions { get; private set; } = Array.Empty<Vector3>();
        public Vector3[] Velocities { get; private set; } = Array.Empty<Vector3>();
        public float[] Radii { get; private set; } = Array.Empty<float>();
        public int Count { get; private set; }
        public MaterialKind Kind { get; private set; }
        public Vector3 Size { get; private set; }
        public float ParticleRadius { get; private set; }
        public SimulationMetrics Metrics { get; private set; }
        public Vector3 AcceptedCenter { get; private set; }
        public float AggregateError { get; private set; }
        /// <summary>Caller time deliberately omitted from visual-detail integration when a
        /// source/render frame exceeds the bounded work budget. It is never caught up later.</summary>
        public float SkippedSeconds { get; private set; }
        public float LastConsumedDelta { get; private set; }
        public float LastSkippedDelta { get; private set; }
        public float Viscosity { get; set; } = .28f;
        public float Friction { get; set; } = .66f;
        public float Softness { get; set; } = .42f;
        /// <summary>Walls are -X,+X,-Y,+Y,-Z,+Z. Values sum only the last accepted step;
        /// stale/duplicate calls leave them frozen. Resting support also has an impulse.</summary>
        public WallImpact GetWallImpact(int wall)
        {
            if ((uint)wall >= 6) throw new ArgumentOutOfRangeException(nameof(wall));
            return wallImpacts[wall];
        }

        private readonly WallImpact[] wallImpacts = new WallImpact[6];
        private Vector3 previousAngularVelocity;
        private Vector3[] previous = Array.Empty<Vector3>();
        private Vector3[] rest = Array.Empty<Vector3>();
        private Vector3[] corrections = Array.Empty<Vector3>();
        private Vector3[] boundExtents = Array.Empty<Vector3>();
        private float[] lambda = Array.Empty<float>();
        private bool[] touching = Array.Empty<bool>();
        private int[] heads = Array.Empty<int>(), next = Array.Empty<int>();
        private int[] cellX = Array.Empty<int>(), cellY = Array.Empty<int>(), cellZ = Array.Empty<int>();
        private const int NeighbourCapacity = 128;
        private int[] neighbourCounts = Array.Empty<int>(), neighbours = Array.Empty<int>();
        private float[] neighbourKernel = Array.Empty<float>();
        private Vector3[] neighbourGradient = Array.Empty<Vector3>();
        private int[] bondA = Array.Empty<int>(), bondB = Array.Empty<int>();
        private float[] bondLength = Array.Empty<float>(), bondLambda = Array.Empty<float>();
        private int bondCount, gridMask;
        private bool denseGrid;
        private int gridWidth, gridHeight, gridMinX, gridMinY, gridMinZ;
        private float spacing, support, supportSquared, inverseSupport, fill, simulatedSeconds;
        private double lastSourceTime = double.NaN;
        private Vector3 restCenter;
        private Quaternion shapeRotation = Quaternion.identity;
        private MaterialQuality quality;

        /// <summary>Configuration allocates storage and deterministically seeds a new material.
        /// Fill zero is empty. Fill changes should use Configure, not change particle count in Step.</summary>
        public void Configure(MaterialKind kind, Vector3 size, float requestedFill, MaterialQuality requestedQuality)
        {
            if (!Finite(size) || size.x < .0001f || size.y < .0001f || size.z < .0001f ||
                size.x > 10 || size.y > 10 || size.z > 10)
                throw new ArgumentOutOfRangeException(nameof(size), "Container dimensions must be finite metres in [0.0001, 10].");
            if (!Finite(requestedFill) || requestedFill < 0 || requestedFill > 1)
                throw new ArgumentOutOfRangeException(nameof(requestedFill), "Fill must be in [0, 1].");
            if (kind < MaterialKind.Water || kind > MaterialKind.Softbody)
                throw new ArgumentOutOfRangeException(nameof(kind));
            if (requestedQuality < MaterialQuality.Mobile || requestedQuality > MaterialQuality.High)
                throw new ArgumentOutOfRangeException(nameof(requestedQuality));

            Kind = kind; Size = size; fill = requestedFill; quality = requestedQuality;
            int capacity = requestedQuality == MaterialQuality.Mobile ? 720 : requestedQuality == MaterialQuality.High ? 2200 : 1500;
            // Liquid reconstruction supplies a continuous surface independently of particle
            // count. Reserve enough CPU time for that mesh in the default desktop preset.
            if (kind == MaterialKind.Water)
                capacity = requestedQuality == MaterialQuality.Mobile ? 720 : requestedQuality == MaterialQuality.High ? 1600 : 1100;
            if (kind == MaterialKind.Sand) capacity = capacity * 6 / 5;
            if (kind == MaterialKind.Softbody) capacity = capacity * 3 / 4;
            spacing = Mathf.Pow(size.x * size.y * size.z / capacity, 1f / 3f);
            int nx = Mathf.Max(1, Mathf.FloorToInt(size.x / spacing));
            int ny = Mathf.Max(1, Mathf.FloorToInt(size.y / spacing));
            int nz = Mathf.Max(1, Mathf.FloorToInt(size.z / spacing));
            // Keep degenerate/slab-shaped vessels within the same bounded particle budget.
            while ((long)nx * ny * nz > capacity)
            {
                if (nx >= ny && nx >= nz) nx = Mathf.Max(1, capacity / ny / nz);
                else if (ny >= nz) ny = Mathf.Max(1, capacity / nx / nz);
                else nz = Mathf.Max(1, capacity / nx / ny);
            }
            Vector3 cell = new Vector3(size.x / nx, size.y / ny, size.z / nz);
            spacing = Mathf.Min(cell.x, Mathf.Min(cell.y, cell.z));
            ParticleRadius = spacing * .46f;
            // Sand has only sphere contacts: a cell slightly wider than the largest
            // diameter covers every possible contact in the adjacent 27 cells. Using
            // the much wider liquid kernel here needlessly visits distant grains.
            support = spacing * (kind == MaterialKind.Sand ? 1.03f : 2.05f);
            supportSquared = support * support;
            inverseSupport = 1 / support;
            int fullCount = nx * ny * nz;
            int wanted = requestedFill == 0 ? 0 : Mathf.Max(1, Mathf.RoundToInt(fullCount * requestedFill));
            Positions = new Vector3[wanted]; Velocities = new Vector3[wanted]; Radii = new float[wanted];
            previous = new Vector3[wanted]; rest = new Vector3[wanted]; corrections = new Vector3[wanted];
            boundExtents = new Vector3[wanted];
            lambda = new float[wanted]; touching = new bool[wanted];
            next = new int[wanted]; cellX = new int[wanted]; cellY = new int[wanted]; cellZ = new int[wanted];
            neighbourCounts = new int[wanted];
            neighbours = kind == MaterialKind.Water ? new int[wanted * NeighbourCapacity] : Array.Empty<int>();
            neighbourKernel = kind == MaterialKind.Water ? new float[wanted * NeighbourCapacity] : Array.Empty<float>();
            neighbourGradient = kind == MaterialKind.Water ? new Vector3[wanted * NeighbourCapacity] : Array.Empty<Vector3>();
            int hashCapacity = 16;
            while (hashCapacity < wanted * 4) hashCapacity <<= 1;
            gridMask = hashCapacity - 1;
            gridMinX = Mathf.FloorToInt(-size.x * .5f * inverseSupport) - 1;
            gridMinY = Mathf.FloorToInt(-size.y * .5f * inverseSupport) - 1;
            gridMinZ = Mathf.FloorToInt(-size.z * .5f * inverseSupport) - 1;
            gridWidth = Mathf.FloorToInt(size.x * .5f * inverseSupport) - gridMinX + 2;
            gridHeight = Mathf.FloorToInt(size.y * .5f * inverseSupport) - gridMinY + 2;
            int gridDepth = Mathf.FloorToInt(size.z * .5f * inverseSupport) - gridMinZ + 2;
            long denseCapacity = (long)gridWidth * gridHeight * gridDepth;
            denseGrid = denseCapacity <= 65536;
            heads = new int[denseGrid ? (int)denseCapacity : hashCapacity];
            Count = 0;

            if (kind == MaterialKind.Softbody && wanted > 0)
            {
                // A filled ellipsoid gives the density renderer a closed volume, not a hollow shell.
                // Keep enough vertical clearance for a visible elastic bounce and source contraction.
                float scale = Mathf.Pow(Mathf.Max(.025f, fill), 1f / 3f) * .90f;
                Vector3 radii = size * (scale * .5f);
                Vector3 center = new Vector3(0, -size.y * .5f + radii.y + ParticleRadius, 0);
                for (int y = 0; y < ny && Count < wanted; y++)
                    for (int z = 0; z < nz && Count < wanted; z++)
                        for (int x = 0; x < nx && Count < wanted; x++)
                        {
                            Vector3 q = new Vector3((x + .5f) * cell.x - size.x * .5f,
                                (y + .5f) * cell.y - size.y * .5f, (z + .5f) * cell.z - size.z * .5f);
                            Vector3 unit = new Vector3(q.x / radii.x, q.y / radii.y, q.z / radii.z);
                            if (unit.sqrMagnitude <= 1) Seed(q + center, Count);
                        }
                if (Count == 0) Seed(center, 0);
            }
            else
            {
                int plane = nx * nz;
                int stride = plane / 2 + 1;
                while (GreatestCommonDivisor(stride, plane) != 1) stride++;
                for (int i = 0; i < wanted; i++)
                {
                    int layer = i / plane, index = (int)((long)(i % plane) * stride % plane);
                    int x = index % nx, z = index / nx;
                    Vector3 p = new Vector3((x + .5f) * cell.x - size.x * .5f,
                        (layer + .5f) * cell.y - size.y * .5f, (z + .5f) * cell.z - size.z * .5f);
                    // Tiny deterministic offsets break perfectly synchronous lattice columns.
                    p += new Vector3(Noise(i, 1), Noise(i, 2), Noise(i, 3)) * (spacing * .016f);
                    Seed(p, i);
                }
            }
            restCenter = Center();
            if (kind == MaterialKind.Softbody) BuildBonds();
            else { bondCount = 0; bondA = bondB = Array.Empty<int>(); bondLength = bondLambda = Array.Empty<float>(); }
            simulatedSeconds = 0; lastSourceTime = double.NaN; shapeRotation = Quaternion.identity;
            previousAngularVelocity = Vector3.zero; Array.Clear(wallImpacts, 0, 6);
            SkippedSeconds = LastConsumedDelta = LastSkippedDelta = 0;
            AcceptedCenter = restCenter; AggregateError = 0;
            UpdateMetrics();
        }

        /// <summary>Advances only on fresh, strictly increasing caller time. A source rebase
        /// discards momentum. Stale/duplicate frames cannot advance gravity, waves or contraction.</summary>
        public void Step(MaterialFrame frame)
        {
            LastConsumedDelta = LastSkippedDelta = 0;
            if (!frame.IsFresh || !Finite(frame.DeltaTime) || double.IsNaN(frame.Time) || double.IsInfinity(frame.Time)) return;
            if (frame.Rebase)
            {
                for (int i = 0; i < Count; i++) { Positions[i] = rest[i]; Velocities[i] = Vector3.zero; touching[i] = false; }
                shapeRotation = Quaternion.identity; simulatedSeconds = 0; lastSourceTime = frame.Time;
                SkippedSeconds = LastConsumedDelta = LastSkippedDelta = 0;
                AggregateError = 0; AcceptedCenter = restCenter;
                previousAngularVelocity = Vector3.zero; Array.Clear(wallImpacts, 0, 6);
                UpdateMetrics(); return;
            }
            if (frame.DeltaTime <= 0 || (!double.IsNaN(lastSourceTime) && frame.Time <= lastSourceTime))
            { if (frame.Rebase) UpdateMetrics(); return; }
            float acceptedDelta = double.IsNaN(lastSourceTime) ? frame.DeltaTime : (float)(frame.Time - lastSourceTime);
            bool hasRotationHistory = !double.IsNaN(lastSourceTime);
            lastSourceTime = frame.Time;
            Array.Clear(wallImpacts, 0, 6);
            if (Count == 0) { UpdateMetrics(); return; }
            // A slow surface/render frame must not increase the next solver's workload.
            // Two small steps preserve the constraint timestep and bound work independently
            // of frame rate. Accepted device aggregate/phase still applies below on every
            // fresh frame; only local detail integration omits excess caller time.
            const int maximumSubsteps = 2;
            const float maximumStep = 1f / 120f;
            float duration = Mathf.Min(frame.DeltaTime, maximumSubsteps * maximumStep);
            int substeps = Mathf.Clamp(Mathf.CeilToInt(duration / maximumStep), 1, maximumSubsteps);
            LastConsumedDelta = duration;
            LastSkippedDelta = Mathf.Max(0, frame.DeltaTime - duration);
            SkippedSeconds += LastSkippedDelta;
            float dt = duration / substeps;
            Vector3 gravity = Finite(frame.Gravity) ? Vector3.ClampMagnitude(frame.Gravity, 35) : new Vector3(0, -9.81f, 0);
            // Non-inertial container coordinates: g-a -2ω×v -ω×(ω×r) -α×r.
            // Caps bound extreme/teleported input, without reducing the normal 3–5 Hz shake.
            Vector3 acceleration = Finite(frame.Acceleration) ? Vector3.ClampMagnitude(frame.Acceleration, 80) : Vector3.zero;
            Vector3 angularVelocity = Finite(frame.AngularVelocity) ? Vector3.ClampMagnitude(frame.AngularVelocity, 25) : Vector3.zero;
            Vector3 angularAcceleration = hasRotationHistory && acceptedDelta > 1e-6f ?
                Vector3.ClampMagnitude((angularVelocity - previousAngularVelocity) / acceptedDelta, 500) : Vector3.zero;
            previousAngularVelocity = angularVelocity;
            bool rotating = angularVelocity.sqrMagnitude > 1e-12f || angularAcceleration.sqrMagnitude > 1e-12f;
            Vector3 effectiveGravity = gravity - acceleration;
            Vector2 mass = Finite(frame.MassPosition) ? frame.MassPosition : Vector2.zero;
            Vector2 sourceVelocity = Finite(frame.Velocity) ? frame.Velocity : Vector2.zero;
            AcceptedCenter = new Vector3(Mathf.Clamp(mass.x, -1, 1) * Mathf.Max(0, Size.x * .5f - ParticleRadius),
                Mathf.Clamp(mass.y, -1, 1) * Mathf.Max(0, Size.y * .5f - ParticleRadius), 0);
            float contraction = Finite(frame.Contraction) ? Mathf.Clamp01(frame.Contraction) : 0;
            float flow = Finite(frame.Flow) ? Mathf.Clamp01(frame.Flow) : 0;
            float energy = Finite(frame.Energy) ? Mathf.Clamp01(frame.Energy) : 0;
            float eventAmplitude = Finite(frame.EventAmplitude) ? Mathf.Clamp01(frame.EventAmplitude) : 0;
            for (int i = 0; i < Count; i++) touching[i] = false;

            for (int substep = 0; substep < substeps; substep++)
            {
                Vector3 center = Center();
                Vector3 drive = Vector3.zero;
                if (frame.IsDevice)
                {
                    Vector3 acceptedVelocity = new Vector3(sourceVelocity.x * Size.x * .5f, sourceVelocity.y * Size.y * .5f, 0);
                    drive = Vector3.ClampMagnitude((AcceptedCenter - center) * 100 + (acceptedVelocity - MeanVelocity()) * 12, 30);
                }
                float damping = Kind == MaterialKind.Water ? Mathf.Lerp(.08f, 2.5f, Unit(Viscosity)) :
                    Kind == MaterialKind.Sand ? Mathf.Lerp(.8f, 5, Unit(Friction)) * (1 - flow * .75f) : .8f;
                float drag = 1 / (1 + damping * dt);
                float maxSpeed = Mathf.Max(.35f, Size.magnitude * 7) +
                    Mathf.Min(2, acceleration.magnitude * .018f + angularVelocity.magnitude * Size.magnitude);
                for (int i = 0; i < Count; i++)
                {
                    previous[i] = Positions[i];
                    Vector3 force = effectiveGravity + drive;
                    if (rotating)
                    {
                        Vector3 angularTravel = Vector3.Cross(angularVelocity, Positions[i]);
                        Vector3 rotationForce = -2 * Vector3.Cross(angularVelocity, Velocities[i]) -
                            Vector3.Cross(angularVelocity, angularTravel) - Vector3.Cross(angularAcceleration, Positions[i]);
                        force += Vector3.ClampMagnitude(rotationForce, 120);
                    }
                    Vector3 v = Velocities[i] * drag + force * dt;
                    if (substep == 0 && frame.NewEvents > 0 && eventAmplitude > 0)
                    {
                        Vector3 outward = Positions[i] - center;
                        v += Vector3.ClampMagnitude(outward / Mathf.Max(spacing, outward.magnitude), 1) *
                            (eventAmplitude * .035f * Mathf.Min(frame.NewEvents, 4));
                    }
                    Velocities[i] = Vector3.ClampMagnitude(v, maxSpeed);
                    Positions[i] += Velocities[i] * dt;
                    RecordWallImpacts(i);
                    ProjectBounds(i);
                }

                if (Kind == MaterialKind.Water) SolveWater();
                else if (Kind == MaterialKind.Sand) SolveSand(dt, flow);
                else SolveSoft(dt, contraction);

                for (int i = 0; i < Count; i++)
                {
                    ProjectBounds(i);
                    Vector3 velocity = (Positions[i] - previous[i]) / dt;
                    ApplyWallVelocity(i, ref velocity);
                    Velocities[i] = Vector3.ClampMagnitude(velocity, maxSpeed);
                }
                if (Kind == MaterialKind.Water) SmoothWaterVelocity(dt);
            }
            if (frame.IsDevice)
            {
                // Preserve particle shape while following the accepted aggregate as far as the
                // box permits. Report remaining error; never claim the visual solver owns mass state.
                Vector3 offset = (AcceptedCenter - Center()) * .85f;
                Vector3 allowedMin = -Size, allowedMax = Size;
                for (int i = 0; i < Count; i++)
                {
                    Vector3 extent = Size * .5f - Vector3.one * Radii[i];
                    Vector3 p = Positions[i];
                    allowedMin = Vector3.Max(allowedMin, -extent - p);
                    allowedMax = Vector3.Min(allowedMax, extent - p);
                }
                offset = new Vector3(Mathf.Clamp(offset.x, allowedMin.x, allowedMax.x),
                    Mathf.Clamp(offset.y, allowedMin.y, allowedMax.y), Mathf.Clamp(offset.z, allowedMin.z, allowedMax.z));
                for (int i = 0; i < Count; i++) Positions[i] += offset;
                AggregateError = (AcceptedCenter - Center()).magnitude;
            }
            else AggregateError = 0;
            simulatedSeconds += duration;
            UpdateMetrics();
        }

        private void RecordWallImpacts(int i)
        {
            Vector3 p = Positions[i], extent = boundExtents[i], v = Velocities[i];
            float restitution = Kind == MaterialKind.Softbody ? .24f : Kind == MaterialKind.Sand ? .025f : .04f;
            float scale = (1 + restitution) / Count;
            if (p.x < -extent.x && v.x < 0) AddWallImpact(0, -v.x * scale, p);
            else if (p.x > extent.x && v.x > 0) AddWallImpact(1, v.x * scale, p);
            if (p.y < -extent.y && v.y < 0) AddWallImpact(2, -v.y * scale, p);
            else if (p.y > extent.y && v.y > 0) AddWallImpact(3, v.y * scale, p);
            if (p.z < -extent.z && v.z < 0) AddWallImpact(4, -v.z * scale, p);
            else if (p.z > extent.z && v.z > 0) AddWallImpact(5, v.z * scale, p);
        }

        private void AddWallImpact(int wall, float impulse, Vector3 point)
        {
            Vector3 extent = Size * .5f;
            point = Vector3.Max(-extent, Vector3.Min(extent, point));
            int axis = wall / 2; float sign = (wall & 1) == 0 ? -1 : 1;
            point[axis] = extent[axis] * sign;
            WallImpact value = wallImpacts[wall];
            value.Position = (value.Position * value.Impulse + point * impulse) / (value.Impulse + impulse);
            value.Position[axis] = extent[axis] * sign;
            value.Impulse += impulse; value.Normal = Vector3.zero; value.Normal[axis] = -sign;
            wallImpacts[wall] = value;
        }

        private void Seed(Vector3 p, int deterministicIndex)
        {
            int i = Count++;
            float radius = ParticleRadius * (Kind == MaterialKind.Sand ? 1 + Noise(deterministicIndex, 5) * .10f : 1);
            Radii[i] = Mathf.Min(radius, Mathf.Min(Size.x, Mathf.Min(Size.y, Size.z)) * .49f);
            boundExtents[i] = new Vector3(Size.x * .5f - Radii[i], Size.y * .5f - Radii[i], Size.z * .5f - Radii[i]);
            Positions[i] = p; ProjectBounds(i); rest[i] = Positions[i]; touching[i] = false;
        }

        private void SolveWater()
        {
            // Calibrated regular-lattice density; unilateral constraints permit a free surface.
            const float restDensity = 5.65f;
            int iterations = quality == MaterialQuality.High ? 3 : 2;
            float gradientScale = -6 / (supportSquared * restDensity);
            for (int iteration = 0; iteration < iterations; iteration++)
            {
                BuildGrid();
                CacheWaterNeighbours(gradientScale);
                for (int i = 0; i < Count; i++)
                {
                    float density = 1, denominator = 0;
                    float gx = 0, gy = 0, gz = 0;
                    int begin = i * NeighbourCapacity, end = begin + neighbourCounts[i];
                    for (int n = begin; n < end; n++)
                    {
                        density += neighbourKernel[n];
                        Vector3 gradient = neighbourGradient[n];
                        gx += gradient.x; gy += gradient.y; gz += gradient.z;
                        denominator += gradient.x * gradient.x + gradient.y * gradient.y + gradient.z * gradient.z;
                    }
                    denominator += gx * gx + gy * gy + gz * gz;
                    lambda[i] = -Mathf.Max(0, density / restDensity - 1) / (denominator + .008f / supportSquared);
                }
                for (int i = 0; i < Count; i++)
                {
                    float dx = 0, dy = 0, dz = 0;
                    int begin = i * NeighbourCapacity, end = begin + neighbourCounts[i];
                    for (int n = begin; n < end; n++)
                    {
                        float kernel = neighbourKernel[n];
                        float tensile = -.00015f * supportSquared * kernel * kernel;
                        float scale = lambda[i] + lambda[neighbours[n]] + tensile;
                        Vector3 gradient = neighbourGradient[n];
                        dx += gradient.x * scale; dy += gradient.y * scale; dz += gradient.z * scale;
                    }
                    corrections[i] = Vector3.ClampMagnitude(new Vector3(dx, dy, dz), spacing * .35f);
                }
                for (int i = 0; i < Count; i++) { Positions[i] += corrections[i]; ProjectBounds(i); }
            }
        }

        private void CacheWaterNeighbours(float gradientScale)
        {
            Array.Clear(neighbourCounts, 0, Count);
            for (int i = 0; i < Count; i++)
            {
                int offset = i * NeighbourCapacity;
                int cx = cellX[i], cy = cellY[i], cz = cellZ[i]; Vector3 p = Positions[i];
                // One kernel evaluation supplies both directed neighbour records.
                // This also keeps the density support reciprocal at the bounded capacity.
                for (int dz = 0; dz <= 1; dz++)
                    for (int dy = dz == 0 ? 0 : -1; dy <= 1; dy++)
                        for (int dx = dz == 0 && dy == 0 ? 0 : -1; dx <= 1; dx++)
                            for (int j = heads[Hash(cx + dx, cy + dy, cz + dz)]; j != -1; j = next[j])
                            {
                                if ((dx == 0 && dy == 0 && dz == 0 && j <= i) ||
                                    (!denseGrid && (cellX[j] != cx + dx || cellY[j] != cy + dy || cellZ[j] != cz + dz))) continue;
                                Vector3 other = Positions[j];
                                float rx = p.x - other.x, ry = p.y - other.y, rz = p.z - other.z;
                                float distance2 = rx * rx + ry * ry + rz * rz;
                                if (distance2 >= supportSquared || neighbourCounts[i] == NeighbourCapacity || neighbourCounts[j] == NeighbourCapacity) continue;
                                float w = 1 - distance2 / supportSquared;
                                int n = offset + neighbourCounts[i]++, m = j * NeighbourCapacity + neighbourCounts[j]++;
                                neighbours[n] = j; neighbours[m] = i;
                                neighbourKernel[n] = neighbourKernel[m] = w * w * w;
                                float scale = gradientScale * w * w;
                                neighbourGradient[n] = new Vector3(rx * scale, ry * scale, rz * scale);
                                neighbourGradient[m] = new Vector3(-rx * scale, -ry * scale, -rz * scale);
                            }
            }
        }

        private void SmoothWaterVelocity(float dt)
        {
            // Reuse the final constraint neighbourhood; its positions differ by at most .35d.
            // This saves a complete grid query and keeps memory traffic bounded on mobile.
            float blend = 1 - Mathf.Exp(-Mathf.Lerp(3, 40, Unit(Viscosity)) * dt);
            for (int i = 0; i < Count; i++)
            {
                float sx = 0, sy = 0, sz = 0, weights = 0;
                Vector3 v = Velocities[i];
                int begin = i * NeighbourCapacity, end = begin + neighbourCounts[i];
                for (int n = begin; n < end; n++)
                {
                    float w = neighbourKernel[n];
                    Vector3 other = Velocities[neighbours[n]];
                    sx += (other.x - v.x) * w; sy += (other.y - v.y) * w; sz += (other.z - v.z) * w; weights += w;
                }
                float scale = weights > .0001f ? blend / weights : 0;
                corrections[i] = new Vector3(sx * scale, sy * scale, sz * scale);
            }
            for (int i = 0; i < Count; i++) Velocities[i] += corrections[i];
        }
        private void SolveSand(float dt, float flow)
        {
            float friction = Mathf.Lerp(.08f, .85f, Unit(Friction)) * (1 - flow * .45f);
            int iterations = quality == MaterialQuality.High ? 5 : 3;
            for (int iteration = 0; iteration < iterations; iteration++)
            {
                BuildGrid();
                for (int i = 0; i < Count; i++)
                {
                    int cx = cellX[i], cy = cellY[i], cz = cellZ[i];
                    // Visit one spatial half-neighbourhood. Every unordered pair still
                    // receives one symmetric correction, without scanning its reverse
                    // direction only to discard it by particle index.
                    for (int dz = 0; dz <= 1; dz++)
                        for (int dy = dz == 0 ? 0 : -1; dy <= 1; dy++)
                            for (int dx = dz == 0 && dy == 0 ? 0 : -1; dx <= 1; dx++)
                                for (int j = heads[Hash(cx + dx, cy + dy, cz + dz)]; j != -1; j = next[j])
                                {
                                    if ((dx == 0 && dy == 0 && dz == 0 && j <= i) ||
                                        (!denseGrid && (cellX[j] != cx + dx || cellY[j] != cy + dy || cellZ[j] != cz + dz))) continue;
                                    Vector3 a = Positions[i], b = Positions[j];
                                    float rx = a.x - b.x, ry = a.y - b.y, rz = a.z - b.z;
                                    float diameter = Radii[i] + Radii[j];
                                    float length2 = rx * rx + ry * ry + rz * rz;
                                    if (length2 >= diameter * diameter) continue;
                                    float length = Mathf.Sqrt(length2);
                                    float nx, ny, nz;
                                    if (length > 1e-8f)
                                    { float inverse = 1 / length; nx = rx * inverse; ny = ry * inverse; nz = rz * inverse; }
                                    else
                                    { Vector3 normal = PairDirection(i, j); nx = normal.x; ny = normal.y; nz = normal.z; }
                                    float penetration = diameter - length;
                                    float scale = penetration * .48f;
                                    float cxCorrection = nx * scale, cyCorrection = ny * scale, czCorrection = nz * scale;
                                    Vector3 oldA = previous[i], oldB = previous[j];
                                    float tx = (a.x - oldA.x) - (b.x - oldB.x);
                                    float ty = (a.y - oldA.y) - (b.y - oldB.y);
                                    float tz = (a.z - oldA.z) - (b.z - oldB.z);
                                    float normalDisplacement = tx * nx + ty * ny + tz * nz;
                                    tx -= nx * normalDisplacement; ty -= ny * normalDisplacement; tz -= nz * normalDisplacement;
                                    float tangentLength = Mathf.Sqrt(tx * tx + ty * ty + tz * tz);
                                    if (tangentLength > 1e-9f)
                                    {
                                        float slip = Mathf.Min(tangentLength * .5f, penetration * friction) / tangentLength;
                                        cxCorrection -= tx * slip; cyCorrection -= ty * slip; czCorrection -= tz * slip;
                                    }
                                    Positions[i] = new Vector3(a.x + cxCorrection, a.y + cyCorrection, a.z + czCorrection);
                                    Positions[j] = new Vector3(b.x - cxCorrection, b.y - cyCorrection, b.z - czCorrection);
                                }
                }
                // Spatial ordering can correct an earlier particle later in this pass.
                // Clamp every grain after the complete sweep, before rebuilding the grid.
                for (int i = 0; i < Count; i++) ProjectBounds(i);
            }
        }

        private void BuildBonds()
        {
            int maximum = Count * 18;
            bondA = new int[maximum]; bondB = new int[maximum];
            bondLength = new float[maximum]; bondLambda = new float[maximum]; bondCount = 0;
            // Setup only: deterministic short-range bonds including shear diagonals.
            float limit = spacing * 1.84f;
            for (int i = 0; i < Count; i++)
                for (int j = i + 1; j < Count; j++)
                {
                    float distance = (rest[i] - rest[j]).magnitude;
                    if (distance > limit || bondCount >= maximum) continue;
                    bondA[bondCount] = i; bondB[bondCount] = j; bondLength[bondCount] = distance; bondCount++;
                }
        }

        private void SolveSoft(float dt, float contraction)
        {
            float alpha = Mathf.Lerp(.0000001f, .00012f, Unit(Softness) * Unit(Softness)) / (dt * dt);
            float scale = 1 - .20f * contraction;
            for (int b = 0; b < bondCount; b++) bondLambda[b] = 0;
            int iterations = quality == MaterialQuality.Mobile ? 3 : 4;
            for (int iteration = 0; iteration < iterations; iteration++)
            {
                for (int b = 0; b < bondCount; b++)
                {
                    int i = bondA[b], j = bondB[b]; Vector3 r = Positions[i] - Positions[j];
                    float length = r.magnitude;
                    if (length < 1e-9f) continue;
                    float change = (-(length - bondLength[b] * scale) - alpha * bondLambda[b]) / (2 + alpha);
                    bondLambda[b] += change;
                    Vector3 correction = r * (change / length);
                    Positions[i] += correction; Positions[j] -= correction;
                }
                Vector3 center = Center();
                FitRotation(center);
                float strength = Mathf.Lerp(.18f, .025f, Unit(Softness));
                for (int i = 0; i < Count; i++)
                {
                    Vector3 goal = center + shapeRotation * ((rest[i] - restCenter) * scale);
                    Positions[i] += (goal - Positions[i]) * strength;
                    ProjectBounds(i);
                }
            }
        }

        private void FitRotation(Vector3 center)
        {
            Vector3 a0 = Vector3.zero, a1 = Vector3.zero, a2 = Vector3.zero;
            for (int i = 0; i < Count; i++)
            {
                Vector3 r = rest[i] - restCenter, p = Positions[i] - center;
                a0 += p * r.x; a1 += p * r.y; a2 += p * r.z;
            }
            // Iterative polar rotation extraction avoids reflected/inverted shape matching.
            for (int iteration = 0; iteration < 4; iteration++)
            {
                Vector3 r0 = shapeRotation * Vector3.right, r1 = shapeRotation * Vector3.up, r2 = shapeRotation * Vector3.forward;
                Vector3 omega = (Vector3.Cross(r0, a0) + Vector3.Cross(r1, a1) + Vector3.Cross(r2, a2)) /
                    (Mathf.Abs(Vector3.Dot(r0, a0) + Vector3.Dot(r1, a1) + Vector3.Dot(r2, a2)) + 1e-12f);
                float angle = omega.magnitude;
                if (angle < 1e-6f || !Finite(angle)) break;
                float halfAngle = Mathf.Min(angle, .5f) * .5f;
                Vector3 imaginary = omega * (Mathf.Sin(halfAngle) / angle);
                shapeRotation = new Quaternion(imaginary.x, imaginary.y, imaginary.z, Mathf.Cos(halfAngle)) * shapeRotation;
                shapeRotation = Quaternion.Normalize(shapeRotation);
            }
        }

        private void BuildGrid()
        {
            for (int h = 0; h < heads.Length; h++) heads[h] = -1;
            for (int i = 0; i < Count; i++)
            {
                Vector3 p = Positions[i];
                int x = Mathf.FloorToInt(p.x * inverseSupport), y = Mathf.FloorToInt(p.y * inverseSupport), z = Mathf.FloorToInt(p.z * inverseSupport);
                cellX[i] = x; cellY[i] = y; cellZ[i] = z;
                int hash = Hash(x, y, z); next[i] = heads[hash]; heads[hash] = i;
            }
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private int Hash(int x, int y, int z)
        {
            if (denseGrid) return ((z - gridMinZ) * gridHeight + y - gridMinY) * gridWidth + x - gridMinX;
            unchecked { return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & gridMask; }
        }

        private void ProjectBounds(int i)
        {
            Vector3 extent = boundExtents[i];
            Vector3 p = Positions[i];
            if (!Finite(p)) { p = i < rest.Length && Finite(rest[i]) ? rest[i] : Vector3.zero; Velocities[i] = Vector3.zero; }
            bool contact = false;
            if (p.x < -extent.x) { p.x = -extent.x; contact = true; }
            else if (p.x > extent.x) { p.x = extent.x; contact = true; }
            if (p.y < -extent.y) { p.y = -extent.y; contact = true; }
            else if (p.y > extent.y) { p.y = extent.y; contact = true; }
            if (p.z < -extent.z) { p.z = -extent.z; contact = true; }
            else if (p.z > extent.z) { p.z = extent.z; contact = true; }
            if (contact) touching[i] = true;
            Positions[i] = p;
        }

        private void ApplyWallVelocity(int i, ref Vector3 velocity)
        {
            Vector3 p = Positions[i], extent = boundExtents[i];
            float tolerance = ParticleRadius * .01f;
            bool x = Mathf.Abs(p.x) >= extent.x - tolerance, y = Mathf.Abs(p.y) >= extent.y - tolerance, z = Mathf.Abs(p.z) >= extent.z - tolerance;
            if (!x && !y && !z) return;
            touching[i] = true;
            float restitution = Kind == MaterialKind.Softbody ? .24f : Kind == MaterialKind.Sand ? .025f : .04f;
            if (x && velocity.x * p.x > 0) velocity.x *= -restitution;
            if (y && velocity.y * p.y > 0) velocity.y *= -restitution;
            if (z && velocity.z * p.z > 0) velocity.z *= -restitution;
            float friction = Kind == MaterialKind.Sand ? Unit(Friction) * .36f : Kind == MaterialKind.Softbody ? .07f : .005f;
            if (x) { velocity.y *= 1 - friction; velocity.z *= 1 - friction; }
            if (y) { velocity.x *= 1 - friction; velocity.z *= 1 - friction; }
            if (z) { velocity.x *= 1 - friction; velocity.y *= 1 - friction; }
        }

        private Vector3 Center()
        { Vector3 sum = Vector3.zero; for (int i = 0; i < Count; i++) sum += Positions[i]; return Count > 0 ? sum / Count : Vector3.zero; }
        private Vector3 MeanVelocity()
        { Vector3 sum = Vector3.zero; for (int i = 0; i < Count; i++) sum += Velocities[i]; return Count > 0 ? sum / Count : Vector3.zero; }
        private void UpdateMetrics()
        {
            float speed2 = 0, max2 = 0; int contacts = 0;
            for (int i = 0; i < Count; i++)
            { float s = Velocities[i].sqrMagnitude; speed2 += s; max2 = Mathf.Max(max2, s); if (touching[i]) contacts++; }
            Metrics = new SimulationMetrics { ParticleCount = Count, ContactCount = contacts, CenterOfMass = Center(),
                KineticEnergy = Count == 0 ? 0 : .5f * speed2 / Count, MaxSpeed = Mathf.Sqrt(max2), SimulatedSeconds = simulatedSeconds };
        }
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static bool Finite(float f) { return !float.IsNaN(f) && !float.IsInfinity(f); }
        private static bool Finite(Vector2 v) { return Finite(v.x) && Finite(v.y); }
        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private static bool Finite(Vector3 v) { return Finite(v.x) && Finite(v.y) && Finite(v.z); }
        private static float Unit(float f) { return Finite(f) ? Mathf.Clamp01(f) : .5f; }
        private static float Noise(int i, int salt)
        { unchecked { uint h = (uint)(i * 747796405 + salt * 2891336453L); h = (h ^ (h >> 16)) * 2246822519u; h ^= h >> 13; return (h & 65535) / 32767.5f - 1; } }
        private static Vector3 PairDirection(int i, int j)
        { int axis = (i + j) % 3; return axis == 0 ? Vector3.right : axis == 1 ? Vector3.up : Vector3.forward; }
        private static int GreatestCommonDivisor(int a, int b) { while (b != 0) { int r = a % b; a = b; b = r; } return a; }

        public void Dispose()
        {
            Count = 0; Positions = Velocities = previous = rest = corrections = boundExtents = Array.Empty<Vector3>();
            Radii = lambda = bondLength = bondLambda = Array.Empty<float>(); touching = Array.Empty<bool>();
            heads = next = cellX = cellY = cellZ = bondA = bondB = Array.Empty<int>(); bondCount = 0;
            neighbours = neighbourCounts = Array.Empty<int>(); neighbourKernel = Array.Empty<float>(); neighbourGradient = Array.Empty<Vector3>();
            Metrics = default(SimulationMetrics); lastSourceTime = double.NaN;
            previousAngularVelocity = Vector3.zero; Array.Clear(wallImpacts, 0, 6);
            SkippedSeconds = LastConsumedDelta = LastSkippedDelta = 0;
        }
    }
}
