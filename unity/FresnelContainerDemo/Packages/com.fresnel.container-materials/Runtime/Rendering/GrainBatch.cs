using System;
using UnityEngine;

namespace Fresnel.Materials
{
    /// <summary>Closed fine-sand bed reconstructed from accepted particle column mass.
    /// The fixed topology represents a retained deposit, not individually measured grains.
    /// It has no time source; only Rebuild changes its geometry.</summary>
    internal sealed class GrainBatch : IDisposable
    {
        MaterialQuality quality;
        Vector3 size, objectSize, axisU = Vector3.right, axisUp = Vector3.up, axisV = Vector3.forward;
        int resolution, edge, topCount, bedVertexCount, bedIndexCount, detailCapacity, uploadedVertices;
        bool configured;
        float[] mass, scratch, heights;
        float[] particleHeight = Array.Empty<float>();
        int[] particleOrder = Array.Empty<int>(), detailOrder = Array.Empty<int>(), supportNext = Array.Empty<int>();
        int[] supportHeads = Array.Empty<int>(), supportX = Array.Empty<int>(), supportZ = Array.Empty<int>();
        bool[] supported = Array.Empty<bool>(), supportHistory = Array.Empty<bool>();
        double supportTime = double.NaN;
        Vector3[] vertices, normals, coordinates;
        Vector4[] tangents;
        Color[] colors;
        int[] indices, exposedIndices;
        public Mesh Mesh { get; private set; }
        public int LoftedParticleCount { get; private set; }
        public int VisibleLoftedCount { get; private set; }
        public float BedFill { get; private set; }
        public float LoftedFill { get; private set; }
        public float BedVolume { get { return BedFill * objectSize.x * objectSize.y * objectSize.z; } }
        public float LoftedVolume { get { return LoftedFill * objectSize.x * objectSize.y * objectSize.z; } }
        public ulong GeometryFingerprint { get; private set; }

        public GrainBatch()
        {
            Mesh = new Mesh { name = "Continuous fine sand bed" };
            Mesh.MarkDynamic();
        }
        public void Configure(MaterialQuality value) { quality = value; configured = false; }

        // Kept for existing internal callers. Integrated applications should pass the
        // accepted frame so its fill sets the intended bulk volume exactly.
        public void Rebuild(ContainerSimulation simulation)
        {
            float spacing = simulation.ParticleRadius / .46f;
            float volume = Mathf.Max(1e-12f, simulation.Size.x * simulation.Size.y * simulation.Size.z);
            Rebuild(simulation, new MaterialFrame { Fill = Mathf.Clamp01(simulation.Count * spacing * spacing * spacing / volume) });
        }

        public void Rebuild(ContainerSimulation simulation, MaterialFrame frame)
        {
            Vector3 gravity = frame.Gravity.sqrMagnitude > 1e-8f ? frame.Gravity : Vector3.down;
            Vector3 center = Vector3.zero;
            for (int p = 0; p < simulation.Count; p++) center += simulation.Positions[p];
            center /= Mathf.Max(1, simulation.Count);
            Vector3 wall = new Vector3(Mathf.Abs(center.x / simulation.Size.x),
                Mathf.Abs(center.y / simulation.Size.y), Mathf.Abs(center.z / simulation.Size.z));
            Vector3 pull = new Vector3(Mathf.Abs(gravity.x), Mathf.Abs(gravity.y), Mathf.Abs(gravity.z));
            int gravityAxis = Dominant(pull), axis = gravityAxis;
            // A lateral impulse can move the cloud to a wall without making that
            // wall its supporting floor. COM may choose only between similarly
            // gravity-aligned axes (the narrow band around a 45-degree tilt).
            float maximumPull = pull[gravityAxis];
            for (int candidate = 0; candidate < 3; candidate++)
                if (pull[candidate] * 1.15f >= maximumPull && wall[candidate] > .035f &&
                    wall[candidate] > wall[axis]) axis = candidate;
            bool resetSupport = !configured || objectSize != simulation.Size || frame.Rebase;
            if (!resetSupport)
            {
                int retained = Dominant(new Vector3(Mathf.Abs(axisUp.x), Mathf.Abs(axisUp.y), Mathf.Abs(axisUp.z)));
                // A tiny tilt across 45 degrees must not rotate a stationary deposit.
                // Retain the occupied wall within the same angular band and the
                // existing 5.5%-of-size COM dead band, never an orthogonal wall.
                if (pull[retained] * 1.15f >= maximumPull &&
                    wall[retained] + .055f >= wall[axis]) axis = retained;
            }
            // Upward-moving mass must not turn into a ceiling-supported deposit.
            // On a real gravity reversal the contact graph below keeps parcels
            // airborne until they reach the newly supporting wall or its deposit.
            float upSign = gravity[axis] > 0 ? -1 : 1;
            Vector3 nextUp = Vector3.zero; nextUp[axis] = upSign;
            bool changedSupport = nextUp != axisUp;
            if (changedSupport) configured = false;
            axisUp = nextUp; axisU = axis == 0 ? Vector3.forward : Vector3.right;
            axisV = Vector3.Cross(axisU, axisUp);
            if (!configured || objectSize != simulation.Size) Allocate(simulation.Size);
            if (simulation.Count == 0)
            {
                Mesh.Clear(); uploadedVertices = 0;
                LoftedParticleCount = VisibleLoftedCount = 0; BedFill = LoftedFill = 0; GeometryFingerprint = 0; return;
            }
            FindSupportedParticles(simulation, frame, resetSupport || changedSupport);
            float requestedFill = Mathf.Clamp01(frame.Fill);
            LoftedFill = requestedFill * LoftedParticleCount / simulation.Count;
            BedFill = requestedFill - LoftedFill;
            Array.Clear(mass, 0, mass.Length);
            float inverseX = resolution / size.x, inverseZ = resolution / size.z;
            for (int p = 0; p < simulation.Count; p++)
            {
                if (!supported[p]) continue;
                Vector3 source = simulation.Positions[p];
                Vector3 point = new Vector3(Vector3.Dot(source, axisU), Vector3.Dot(source, axisUp), Vector3.Dot(source, axisV));
                float u = (point.x + size.x * .5f) * inverseX - .5f;
                float v = (point.z + size.z * .5f) * inverseZ - .5f;
                int x = Mathf.FloorToInt(u), z = Mathf.FloorToInt(v);
                float tx = u - x, tz = v - z;
                int x0 = Mathf.Clamp(x, 0, resolution - 1), x1 = Mathf.Clamp(x + 1, 0, resolution - 1);
                int z0 = Mathf.Clamp(z, 0, resolution - 1), z1 = Mathf.Clamp(z + 1, 0, resolution - 1);
                mass[x0 + z0 * resolution] += (1 - tx) * (1 - tz);
                mass[x1 + z0 * resolution] += tx * (1 - tz);
                mass[x0 + z1 * resolution] += (1 - tx) * tz;
                mass[x1 + z1 * resolution] += tx * tz;
            }
            // Broad, mass-conserving spatial filtering removes the numerical parcel scale.
            // Reflection around cell boundaries avoids wall spikes and empty edge strips.
            int passes = quality == MaterialQuality.Mobile ? 2 : quality == MaterialQuality.High ? 5 : 3;
            for (int pass = 0; pass < passes; pass++) Blur();
            float scale = requestedFill * size.y * mass.Length / simulation.Count;
            float maximum = 0;
            for (int i = 0; i < mass.Length; i++) { mass[i] *= scale; maximum = Mathf.Max(maximum, mass[i]); }
            // Saturated columns cannot exceed the closed roof. Resolve only the lost
            // volume; ordinary uncapped deposits keep the actual projected mass profile.
            if (maximum > size.y)
            {
                float target = BedFill * size.y * mass.Length;
                float low = -maximum, high = size.y;
                for (int iteration = 0; iteration < 18; iteration++)
                {
                    float level = (low + high) * .5f, total = 0;
                    for (int i = 0; i < mass.Length; i++) total += Mathf.Clamp(mass[i] + level, 0, size.y);
                    if (total < target) low = level; else high = level;
                }
                float offset = (low + high) * .5f;
                for (int i = 0; i < mass.Length; i++) mass[i] = Mathf.Clamp(mass[i] + offset, 0, size.y);
            }
            LimitSteepColumns();
            for (int z = 0; z < edge; z++) for (int x = 0; x < edge; x++)
            {
                int xa = Mathf.Clamp(x - 1, 0, resolution - 1), xb = Mathf.Clamp(x, 0, resolution - 1);
                int za = Mathf.Clamp(z - 1, 0, resolution - 1), zb = Mathf.Clamp(z, 0, resolution - 1);
                heights[x + z * edge] = (mass[xa + za * resolution] + mass[xb + za * resolution] +
                    mass[xa + zb * resolution] + mass[xb + zb * resolution]) * .25f;
            }
            float dx = size.x / resolution, dz = size.z / resolution;
            Vector3 half = size * .5f;
            for (int z = 0; z < edge; z++) for (int x = 0; x < edge; x++)
            {
                int i = x + z * edge;
                int xa = Mathf.Max(x - 1, 0), xb = Mathf.Min(x + 1, resolution);
                int za = Mathf.Max(z - 1, 0), zb = Mathf.Min(z + 1, resolution);
                float slopeX = (heights[xb + z * edge] - heights[xa + z * edge]) / ((xb - xa) * dx);
                float slopeZ = (heights[x + zb * edge] - heights[x + za * edge]) / ((zb - za) * dz);
                vertices[i] = new Vector3(-half.x + x * dx, Mathf.Clamp(-half.y + heights[i], -half.y, half.y), -half.z + z * dz);
                normals[i] = new Vector3(-slopeX, 1, -slopeZ);
            }
            ConstrainSurfaceNormals();
            for (int side = 0; side < 4; side++) for (int i = 0; i < edge; i++)
            {
                int top = side == 0 ? i : side == 1 ? i + resolution * edge : side == 2 ? i * edge : resolution + i * edge;
                int first = topCount + side * edge * 2 + i * 2;
                vertices[first] = vertices[top];
                vertices[first + 1] = new Vector3(vertices[top].x, -half.y, vertices[top].z);
                Vector3 normal = side == 0 ? Vector3.back : side == 1 ? Vector3.forward : side == 2 ? Vector3.left : Vector3.right;
                Vector4 tangent = side < 2 ? new Vector4(1,0,0,1) : new Vector4(0,0,1,1);
                normals[first] = normals[first + 1] = normal;
                tangents[first] = tangents[first + 1] = tangent;
            }
            int bottom = topCount + edge * 8;
            vertices[bottom] = new Vector3(-half.x, -half.y, -half.z);
            vertices[bottom + 1] = new Vector3(half.x, -half.y, -half.z);
            vertices[bottom + 2] = new Vector3(-half.x, -half.y, half.z);
            vertices[bottom + 3] = new Vector3(half.x, -half.y, half.z);
            for (int i = 0; i < 4; i++) { normals[bottom+i] = Vector3.down; tangents[bottom+i] = new Vector4(1,0,0,1); }
            // Metric, stationary material coordinates: roughly sub-millimetre detail,
            // rather than a separate giant-bead silhouette for each numerical particle.
            for (int i = 0; i < bedVertexCount; i++)
            {
                Vector3 p = vertices[i], n = normals[i]; Vector4 t = tangents[i];
                vertices[i] = axisU*p.x + axisUp*p.y + axisV*p.z;
                normals[i] = axisU*n.x + axisUp*n.y + axisV*n.z;
                Vector3 tangent = axisU*t.x + axisUp*t.y + axisV*t.z;
                tangents[i] = new Vector4(tangent.x,tangent.y,tangent.z,1);
                coordinates[i] = vertices[i] * 220f;
            }
            BuildLoftedDetails(simulation);
            int usedVertices = bedVertexCount + VisibleLoftedCount * 6;
            int exposedCount;
            bool exposedBed = BuildExposedBed(ref usedVertices, out exposedCount);
            if (usedVertices != uploadedVertices) Mesh.Clear();
            Mesh.SetVertices(vertices, 0, usedVertices); Mesh.SetNormals(normals, 0, usedVertices);
            Mesh.SetTangents(tangents, 0, usedVertices); Mesh.SetUVs(0, coordinates, 0, usedVertices);
            Mesh.SetColors(colors, 0, usedVertices);
            int firstIndex = BedFill > 0 ? 0 : bedIndexCount;
            if (exposedBed) Mesh.SetTriangles(exposedIndices, 0, exposedCount, 0, false);
            else Mesh.SetTriangles(indices, firstIndex, bedIndexCount + VisibleLoftedCount * 24 - firstIndex, 0, false);
            uploadedVertices = usedVertices;
            Mesh.bounds = new Bounds(Vector3.zero, objectSize);
            unchecked
            {
                ulong hash = 1469598103934665603UL;
                for (int i = 0; i < usedVertices; i++)
                {
                    hash = (hash ^ (uint)vertices[i].x.GetHashCode()) * 1099511628211UL;
                    hash = (hash ^ (uint)vertices[i].y.GetHashCode()) * 1099511628211UL;
                    hash = (hash ^ (uint)vertices[i].z.GetHashCode()) * 1099511628211UL;
                }
                GeometryFingerprint = (hash ^ (uint)LoftedParticleCount) * 1099511628211UL;
            }
        }

        bool BuildExposedBed(ref int usedVertices, out int usedIndices)
        {
            usedIndices = 0;
            if (BedFill <= 0) return false;
            int topIndices = resolution * resolution * 6;
            float floor = -size.y * .5f;
            bool exposed = false;
            for (int i = 0; i < topIndices && !exposed; i += 3)
                exposed = EmptyTriangle(i, floor);
            if (!exposed) return false;
            // A zero-thickness top face lies exactly on the host's supporting wall.
            // Omit that face and its matching bottom footprint, without moving the
            // surface, adding a fake coating, or changing its enclosed volume.
            // Only exposed deposits need this preallocated bottom grid. Calm beds
            // retain the original compact topology and native vertex count.
            int bottom = usedVertices;
            for (int i = 0; i < topCount; i++)
            {
                Vector3 point = vertices[i];
                point += axisUp * (floor - Vector3.Dot(point, axisUp));
                vertices[bottom + i] = point; normals[bottom + i] = -axisUp;
                tangents[bottom + i] = new Vector4(axisU.x, axisU.y, axisU.z, 1);
                coordinates[bottom + i] = point * 220f;
                colors[bottom + i] = new Color(.67f, .59f, .46f, .371f);
            }
            for (int i = 0; i < topIndices; i += 3)
            {
                if (EmptyTriangle(i, floor)) continue;
                int a = indices[i], b = indices[i + 1], c = indices[i + 2];
                exposedIndices[usedIndices++] = a; exposedIndices[usedIndices++] = b; exposedIndices[usedIndices++] = c;
                exposedIndices[usedIndices++] = bottom + a; exposedIndices[usedIndices++] = bottom + c; exposedIndices[usedIndices++] = bottom + b;
            }
            // Preserve the existing perimeter faces and actual airborne parcels;
            // replace only the two rectangular bottom triangles with the footprint.
            int sideCount = bedIndexCount - topIndices - 6;
            Array.Copy(indices, topIndices, exposedIndices, usedIndices, sideCount); usedIndices += sideCount;
            int details = VisibleLoftedCount * 24;
            Array.Copy(indices, bedIndexCount, exposedIndices, usedIndices, details); usedIndices += details;
            usedVertices += topCount;
            return true;
        }
        bool EmptyTriangle(int index, float floor)
        {
            return Vector3.Dot(vertices[indices[index]], axisUp) <= floor &&
                Vector3.Dot(vertices[indices[index + 1]], axisUp) <= floor &&
                Vector3.Dot(vertices[indices[index + 2]], axisUp) <= floor;
        }

        void FindSupportedParticles(ContainerSimulation simulation, MaterialFrame frame, bool reset)
        {
            int count = simulation.Count;
            if (particleHeight.Length != count)
            {
                particleHeight = new float[count]; particleOrder = new int[count]; detailOrder = new int[count];
                supportNext = new int[count]; supportX = new int[count]; supportZ = new int[count];
                supported = new bool[count]; supportHistory = new bool[count]; reset = true;
                int capacity = 16; while (capacity < count * 2) capacity <<= 1;
                supportHeads = new int[capacity];
                for (int p = 0; p < count; p++) detailOrder[p] = p;
                uint random = 0x91E10DA5u;
                for (int p = count - 1; p > 0; p--)
                {
                    random ^= random << 13; random ^= random >> 17; random ^= random << 5;
                    int other = (int)(random % (uint)(p + 1)), value = detailOrder[p];
                    detailOrder[p] = detailOrder[other]; detailOrder[other] = value;
                }
            }
            if (reset)
            {
                Array.Clear(supported, 0, count); Array.Clear(supportHistory, 0, count); supportTime = frame.Time;
            }
            else if (frame.Time != supportTime)
            {
                Array.Copy(supported, supportHistory, count); supportTime = frame.Time;
            }
            for (int i = 0; i < supportHeads.Length; i++) supportHeads[i] = -1;
            float radius = simulation.ParticleRadius, cell = Mathf.Max(.000001f, radius * 3.2f);
            for (int p = 0; p < count; p++)
            {
                Vector3 point = simulation.Positions[p];
                particleHeight[p] = Vector3.Dot(point, axisUp); particleOrder[p] = p;
                supportX[p] = Mathf.FloorToInt(Vector3.Dot(point, axisU) / cell);
                supportZ[p] = Mathf.FloorToInt(Vector3.Dot(point, axisV) / cell);
            }
            Array.Sort(particleHeight, particleOrder, 0, count);
            LoftedParticleCount = 0;
            for (int order = 0; order < count; order++)
            {
                int p = particleOrder[order], x = supportX[p], z = supportZ[p];
                Vector3 point = simulation.Positions[p]; float r = simulation.Radii[p];
                float tolerance = radius * (supportHistory[p] ? .95f : .65f);
                bool contact = particleHeight[order] + size.y * .5f <= r + tolerance;
                // Trace support upward through real nearby particles. A whole lifted
                // layer therefore leaves an empty floor, instead of becoming a fake bed.
                for (int dz = -1; dz <= 1 && !contact; dz++) for (int dx = -1; dx <= 1 && !contact; dx++)
                {
                    for (int q = supportHeads[SupportHash(x + dx, z + dz)]; q >= 0; q = supportNext[q])
                    {
                        // Each bucket is newest/highest first, so lower neighbours
                        // beyond this vertical reach cannot support the current parcel.
                        if (particleHeight[order] - Vector3.Dot(simulation.Positions[q], axisUp) > r + radius * 1.1f + tolerance) break;
                        if (supportX[q] != x + dx || supportZ[q] != z + dz) continue;
                        float distance = r + simulation.Radii[q] + tolerance;
                        if ((point - simulation.Positions[q]).sqrMagnitude <= distance * distance) { contact = true; break; }
                    }
                }
                supported[p] = contact;
                if (contact)
                {
                    int bucket = SupportHash(x, z); supportNext[p] = supportHeads[bucket]; supportHeads[bucket] = p;
                }
                else LoftedParticleCount++;
            }
        }
        int SupportHash(int x, int z)
        {
            unchecked { return ((x * 73856093) ^ (z * 19349663)) & (supportHeads.Length - 1); }
        }
        void BuildLoftedDetails(ContainerSimulation simulation)
        {
            VisibleLoftedCount = 0;
            Vector3 half = objectSize * .5f;
            for (int slot = 0; slot < detailOrder.Length && VisibleLoftedCount < detailCapacity; slot++)
            {
                int p = detailOrder[slot]; if (supported[p]) continue;
                Vector3 center = simulation.Positions[p], velocity = simulation.Velocities[p];
                float speed = velocity.magnitude, radius = simulation.Radii[p] * .28f;
                Vector3 forward = speed > .005f ? velocity / speed : axisUp;
                Vector3 reference = Mathf.Abs(forward.y) < .9f ? Vector3.up : Vector3.right;
                Vector3 right = Vector3.Cross(reference, forward).normalized, up = Vector3.Cross(forward, right);
                // A bounded velocity-aligned facet conveys direction; its centre is
                // always an actual particle, with no independently integrated emitter.
                float length = radius + Mathf.Min(radius * 2, speed / 480f);
                int first = bedVertexCount + VisibleLoftedCount * 6;
                float shade = .94f + (p * 37 % 101) * .0012f;
                for (int corner = 0; corner < 6; corner++)
                {
                    Vector3 normal = corner < 2 ? right * (corner == 0 ? 1 : -1) :
                        corner < 4 ? up * (corner == 2 ? 1 : -1) : forward * (corner == 4 ? 1 : -1);
                    Vector3 offset = normal * (corner < 4 ? radius : length), point = center + offset;
                    point.x = Mathf.Clamp(point.x, -half.x, half.x); point.y = Mathf.Clamp(point.y, -half.y, half.y); point.z = Mathf.Clamp(point.z, -half.z, half.z);
                    int i = first + corner; vertices[i] = point; normals[i] = normal;
                    Vector3 tangent = Vector3.Cross(Mathf.Abs(normal.y) < .9f ? Vector3.up : Vector3.right, normal).normalized;
                    tangents[i] = new Vector4(tangent.x, tangent.y, tangent.z, 1);
                    coordinates[i] = (offset + Vector3.one * (p * .0137f)) * 220f;
                    colors[i] = new Color(.67f * shade, .59f * shade, .46f * shade, .371f);
                }
                VisibleLoftedCount++;
            }
        }

        void LimitSteepColumns()
        {
            // Column projection can turn a compressed pile into a nearly vertical sheet.
            // Bound only these steep gradients, leaving ordinary retained dunes untouched.
            // This changes the display approximation, never particle support or loft mass.
            float xLimit = 1.8f * size.x / resolution, zLimit = 1.8f * size.z / resolution;
            bool steep = false;
            for (int z = 0; z < resolution && !steep; z++) for (int x = 0; x < resolution && !steep; x++)
            {
                int i = x + z * resolution;
                steep = (x + 1 < resolution && Mathf.Abs(mass[i] - mass[i + 1]) > xLimit) ||
                    (z + 1 < resolution && Mathf.Abs(mass[i] - mass[i + resolution]) > zLimit);
            }
            if (!steep) return;
            // Upper/lower slope envelopes use two fixed grid sweeps and existing buffers.
            // Their midpoint retains both peaks and troughs, then a uniform level restores
            // the supported volume. Uniform shifts and box clipping preserve the limit.
            Array.Copy(mass, scratch, mass.Length); Array.Copy(mass, heights, mass.Length);
            for (int z = 0; z < resolution; z++) for (int x = 0; x < resolution; x++)
            {
                int i = x + z * resolution;
                if (x > 0) { scratch[i] = Mathf.Min(scratch[i], scratch[i - 1] + xLimit); heights[i] = Mathf.Max(heights[i], heights[i - 1] - xLimit); }
                if (z > 0) { scratch[i] = Mathf.Min(scratch[i], scratch[i - resolution] + zLimit); heights[i] = Mathf.Max(heights[i], heights[i - resolution] - zLimit); }
            }
            for (int z = resolution - 1; z >= 0; z--) for (int x = resolution - 1; x >= 0; x--)
            {
                int i = x + z * resolution;
                if (x + 1 < resolution) { scratch[i] = Mathf.Min(scratch[i], scratch[i + 1] + xLimit); heights[i] = Mathf.Max(heights[i], heights[i + 1] - xLimit); }
                if (z + 1 < resolution) { scratch[i] = Mathf.Min(scratch[i], scratch[i + resolution] + zLimit); heights[i] = Mathf.Max(heights[i], heights[i + resolution] - zLimit); }
            }
            for (int i = 0; i < mass.Length; i++) mass[i] = (scratch[i] + heights[i]) * .5f;
            float low = -size.y, high = size.y, target = BedFill * size.y * mass.Length;
            for (int iteration = 0; iteration < 18; iteration++)
            {
                float level = (low + high) * .5f, total = 0;
                for (int i = 0; i < mass.Length; i++) total += Mathf.Clamp(mass[i] + level, 0, size.y);
                if (total < target) low = level; else high = level;
            }
            float offset = (low + high) * .5f;
            for (int i = 0; i < mass.Length; i++) mass[i] = Mathf.Clamp(mass[i] + offset, 0, size.y);
        }

        void Blur()
        {
            for (int z = 0; z < resolution; z++) for (int x = 0; x < resolution; x++)
            {
                int row = z * resolution;
                scratch[row + x] = (mass[row + Mirror(x - 2)] + 4 * mass[row + Mirror(x - 1)] +
                    6 * mass[row + x] + 4 * mass[row + Mirror(x + 1)] + mass[row + Mirror(x + 2)]) * .0625f;
            }
            for (int z = 0; z < resolution; z++) for (int x = 0; x < resolution; x++)
                mass[x + z * resolution] = (scratch[x + Mirror(z - 2) * resolution] + 4 * scratch[x + Mirror(z - 1) * resolution] +
                    6 * scratch[x + z * resolution] + 4 * scratch[x + Mirror(z + 1) * resolution] + scratch[x + Mirror(z + 2) * resolution]) * .0625f;
        }
        int Mirror(int i) { return i < 0 ? -i - 1 : i >= resolution ? resolution * 2 - i - 1 : i; }
        static int Dominant(Vector3 value)
        {
            return value.y >= Mathf.Max(value.x, value.z) ? 1 : value.x >= value.z ? 0 : 2;
        }

        void ConstrainSurfaceNormals()
        {
            // A central-difference normal can face away from one of its own triangles
            // on very thin, steep deposits. All top faces point upwards: increasing
            // only normal Y puts it in every adjacent face's forward hemisphere,
            // without changing the deposit or allocating an adjacency structure.
            int end = resolution * resolution * 6;
            for (int i = 0; i < end; i += 3)
            {
                int a = indices[i], b = indices[i + 1], c = indices[i + 2];
                Vector3 face = Vector3.Cross(vertices[b] - vertices[a], vertices[c] - vertices[a]);
                KeepFacing(a, face); KeepFacing(b, face); KeepFacing(c, face);
            }
            for (int i = 0; i < topCount; i++)
            {
                Vector3 normal = normals[i].normalized;
                normals[i] = normal;
                Vector3 tangent = new Vector3(normal.y, -normal.x, 0).normalized;
                tangents[i] = new Vector4(tangent.x, tangent.y, tangent.z, 1);
            }
        }
        void KeepFacing(int i, Vector3 face)
        {
            Vector3 normal = normals[i];
            if (Vector3.Dot(normal, face) < 0 && face.y > 0)
            {
                normal.y = Mathf.Max(normal.y, -(normal.x * face.x + normal.z * face.z) / face.y + .001f);
                normals[i] = normal;
            }
        }

        void Allocate(Vector3 bounds)
        {
            objectSize = bounds;
            size = new Vector3(Mathf.Abs(Vector3.Dot(bounds,axisU)), Mathf.Abs(Vector3.Dot(bounds,axisUp)), Mathf.Abs(Vector3.Dot(bounds,axisV)));
            configured = true;
            resolution = quality == MaterialQuality.Mobile ? 16 : quality == MaterialQuality.High ? 32 : 24;
            edge = resolution + 1; topCount = edge * edge;
            mass = new float[resolution * resolution]; scratch = new float[mass.Length]; heights = new float[topCount];
            bedVertexCount = topCount + edge * 8 + 4;
            bedIndexCount = resolution * resolution * 6 + resolution * 24 + 6;
            detailCapacity = quality == MaterialQuality.Mobile ? 128 : quality == MaterialQuality.High ? 384 : 256;
            int count = bedVertexCount + detailCapacity * 6 + topCount;
            vertices = new Vector3[count]; normals = new Vector3[count]; coordinates = new Vector3[count];
            tangents = new Vector4[count]; colors = new Color[count];
            for (int i = 0; i < count; i++) colors[i] = new Color(.67f, .59f, .46f, .371f);
            indices = new int[bedIndexCount + detailCapacity * 24];
            exposedIndices = new int[indices.Length + resolution * resolution * 6 - 6];
            int index = 0;
            for (int z = 0; z < resolution; z++) for (int x = 0; x < resolution; x++)
            {
                int a = x + z * edge, b = a + 1, c = a + edge, d = c + 1;
                Triangle(ref index, a, c, b); Triangle(ref index, b, c, d);
            }
            for (int side = 0; side < 4; side++)
            {
                Vector3 normal = side == 0 ? Vector3.back : side == 1 ? Vector3.forward : side == 2 ? Vector3.left : Vector3.right;
                Vector4 tangent = side < 2 ? new Vector4(1,0,0,1) : new Vector4(0,0,1,1);
                for (int i = 0; i < edge * 2; i++) { int v = topCount + side * edge * 2 + i; normals[v] = normal; tangents[v] = tangent; }
                for (int i = 0; i < resolution; i++)
                {
                    int a = topCount + side * edge * 2 + i * 2, b = a + 1, c = a + 2, d = a + 3;
                    if (side == 0 || side == 3) { Triangle(ref index, a, c, b); Triangle(ref index, c, d, b); }
                    else { Triangle(ref index, a, b, c); Triangle(ref index, c, b, d); }
                }
            }
            int bottom = topCount + edge * 8;
            for (int i = 0; i < 4; i++) { normals[bottom+i] = Vector3.down; tangents[bottom+i] = new Vector4(1,0,0,1); }
            Triangle(ref index, bottom, bottom+1, bottom+2); Triangle(ref index, bottom+1, bottom+3, bottom+2);
            for (int detail = 0; detail < detailCapacity; detail++)
            {
                int a = bedVertexCount + detail * 6;
                Triangle(ref index, a, a+2, a+4); Triangle(ref index, a+2, a+1, a+4);
                Triangle(ref index, a+1, a+3, a+4); Triangle(ref index, a+3, a, a+4);
                Triangle(ref index, a+2, a, a+5); Triangle(ref index, a+1, a+2, a+5);
                Triangle(ref index, a+3, a+1, a+5); Triangle(ref index, a, a+3, a+5);
            }
            Mesh.Clear(); uploadedVertices = 0;
        }
        void Triangle(ref int index, int a, int b, int c) { indices[index++] = a; indices[index++] = b; indices[index++] = c; }
        public void Dispose()
        {
            if (Mesh == null) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(Mesh); else UnityEngine.Object.DestroyImmediate(Mesh);
            Mesh = null;
        }
    }
}
