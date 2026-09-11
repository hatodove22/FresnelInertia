using System;
using System.Collections.Generic;
using UnityEngine;

namespace Fresnel.Materials
{
    /// <summary>A fixed, closed elastic skin bound to the accepted particle cloud.
    /// Neighbour weights are computed once per configuration; frame updates deform the
    /// skin from actual particle displacement without a density grid or animation clock.
    /// This is a smooth small-object presentation, not a general arbitrary-mesh skinning API.</summary>
    internal sealed class SoftbodySurface : IDisposable
    {
        const int MaximumNeighbours = 24;
        Vector3 size;
        Vector3[] unit = Array.Empty<Vector3>(), restVertices, vertices, normals, restParticles;
        Vector3[] bindingCenters, deformation, filtered;
        Vector3 restCenter, currentCenter, covarianceX, covarianceY, covarianceZ;
        Vector3 inverseRowX, inverseRowY, inverseRowZ, affineX, affineY, affineZ;
        int[] triangles, bindings;
        int[] adjacentStarts, adjacentVertices;
        float[] weights;
        int boundCount = -1, neighbours, smoothingPairs;
        public Mesh Mesh { get; private set; }
        public double SkinningMilliseconds { get; private set; }
        public double UploadMilliseconds { get; private set; }

        public SoftbodySurface()
        {
            Mesh = new Mesh { name = "Smooth elastic particle skin" };
            Mesh.MarkDynamic();
        }

        public void Configure(Vector3 bounds, MaterialQuality quality)
        {
            BuildTopology(bounds, quality);
            Mesh.Clear();
        }

        void BuildTopology(Vector3 bounds, MaterialQuality quality)
        {
            size = bounds; boundCount = -1;
            smoothingPairs = quality == MaterialQuality.Mobile ? 2 : 3;
            int segments = quality == MaterialQuality.Mobile ? 24 : quality == MaterialQuality.High ? 48 : 36;
            int rings = quality == MaterialQuality.Mobile ? 12 : quality == MaterialQuality.High ? 24 : 18;
            int count = (rings - 1) * segments + 2;
            unit = new Vector3[count]; restVertices = new Vector3[count];
            vertices = new Vector3[count]; normals = new Vector3[count];
            bindingCenters = new Vector3[count]; deformation = new Vector3[count]; filtered = new Vector3[count];
            unit[0] = Vector3.up; unit[count - 1] = Vector3.down;
            for (int y = 1; y < rings; y++)
            {
                float phi = y * Mathf.PI / rings;
                float sin = Mathf.Sin(phi), cos = Mathf.Cos(phi);
                for (int x = 0; x < segments; x++)
                {
                    float theta = x * Mathf.PI * 2 / segments;
                    unit[1 + (y - 1) * segments + x] = new Vector3(sin * Mathf.Cos(theta), cos, sin * Mathf.Sin(theta));
                }
            }
            triangles = new int[segments * (rings - 1) * 6];
            int index = 0;
            for (int x = 0; x < segments; x++)
            {
                int next = (x + 1) % segments;
                Triangle(ref index, 0, 1 + next, 1 + x);
                for (int y = 0; y < rings - 2; y++)
                {
                    int a = 1 + y * segments + x, b = 1 + y * segments + next;
                    Triangle(ref index, a, b, a + segments);
                    Triangle(ref index, b, b + segments, a + segments);
                }
                int last = 1 + (rings - 2) * segments;
                Triangle(ref index, count - 1, last + x, last + next);
            }
            BuildAdjacency();
        }

        void BuildAdjacency()
        {
            // Topology is fixed. Store each undirected edge once per endpoint, including
            // the welded poles; no topology traversal or allocation is needed per frame.
            var adjacent = new List<int>[unit.Length];
            for (int v = 0; v < adjacent.Length; v++) adjacent[v] = new List<int>(6);
            for (int t = 0; t < triangles.Length; t += 3)
                for (int corner = 0; corner < 3; corner++)
                {
                    int a = triangles[t + corner], b = triangles[t + (corner + 1) % 3];
                    if (!adjacent[a].Contains(b)) adjacent[a].Add(b);
                    if (!adjacent[b].Contains(a)) adjacent[b].Add(a);
                }
            adjacentStarts = new int[unit.Length + 1];
            for (int v = 0; v < unit.Length; v++) adjacentStarts[v + 1] = adjacentStarts[v] + adjacent[v].Count;
            adjacentVertices = new int[adjacentStarts[unit.Length]];
            for (int v = 0; v < unit.Length; v++) adjacent[v].CopyTo(adjacentVertices, adjacentStarts[v]);
        }

        void Triangle(ref int index, int a, int b, int c)
        {
            triangles[index++] = a; triangles[index++] = b; triangles[index++] = c;
        }

        public void Rebuild(ContainerSimulation simulation, MaterialFrame frame)
        {
            long start = System.Diagnostics.Stopwatch.GetTimestamp();
            SkinningMilliseconds = UploadMilliseconds = 0;
            if (simulation.Count == 0) { Mesh.Clear(); boundCount = -1; return; }
            bool topologyChanged = boundCount != simulation.Count;
            Deform(simulation);
            SkinningMilliseconds = Elapsed(start); start = System.Diagnostics.Stopwatch.GetTimestamp();
            Mesh.vertices = vertices; Mesh.normals = normals;
            if (topologyChanged) Mesh.triangles = triangles;
            Mesh.bounds = new Bounds(Vector3.zero, size);
            UploadMilliseconds = Elapsed(start);
        }

        void Deform(ContainerSimulation simulation)
        {
            if (boundCount != simulation.Count) Bind(simulation);
            FitAffine(simulation);
            for (int v = 0; v < vertices.Length; v++)
            {
                float x = 0, y = 0, z = 0;
                int first = v * neighbours;
                for (int n = 0; n < neighbours; n++)
                {
                    int index = bindings[first + n];
                    Vector3 p = simulation.Positions[index]; float weight = weights[first + n];
                    x += p.x * weight; y += p.y * weight; z += p.z * weight;
                }
                // Transport the skin-to-particle offset through the cloud's affine pose.
                // A rigid rotation or uniform contraction therefore stays smooth exactly,
                // while actual local particle deformation remains in the residual below.
                Vector3 expected = currentCenter + Transform(bindingCenters[v] - restCenter);
                deformation[v] = new Vector3(x - expected.x, y - expected.y, z - expected.z);
                vertices[v] = currentCenter + Transform(restVertices[v] - restCenter);
            }
            // Taubin's alternating spatial filter removes the sharp local binding creases
            // without repeatedly shrinking the body. Filter only the non-affine residual:
            // translation, rotation, scale and broad elastic deformation retain their shape.
            for (int pair = 0; pair < smoothingPairs; pair++)
            { FilterDeformation(.55f); FilterDeformation(-.57f); }
            Vector3 half = size * .5f;
            for (int v = 0; v < vertices.Length; v++)
            {
                Vector3 point = vertices[v] + deformation[v];
                point.x = Mathf.Clamp(point.x, -half.x, half.x);
                point.y = Mathf.Clamp(point.y, -half.y, half.y);
                point.z = Mathf.Clamp(point.z, -half.z, half.z);
                vertices[v] = point; normals[v] = Vector3.zero;
            }
            for (int t = 0; t < triangles.Length; t += 3)
            {
                int a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
                Vector3 normal = Vector3.Cross(vertices[b] - vertices[a], vertices[c] - vertices[a]);
                normals[a] += normal; normals[b] += normal; normals[c] += normal;
            }
            for (int v = 0; v < normals.Length; v++)
            {
                float squared = normals[v].sqrMagnitude;
                normals[v] = squared > 1e-20f ? normals[v] / Mathf.Sqrt(squared) : unit[v];
            }
        }

        void FilterDeformation(float strength)
        {
            for (int v = 0; v < deformation.Length; v++)
            {
                float x = 0, y = 0, z = 0;
                int begin = adjacentStarts[v], end = adjacentStarts[v + 1];
                for (int n = begin; n < end; n++)
                {
                    Vector3 p = deformation[adjacentVertices[n]];
                    x += p.x; y += p.y; z += p.z;
                }
                float inverse = 1f / (end - begin);
                Vector3 point = deformation[v];
                filtered[v] = new Vector3(point.x + strength * (x * inverse - point.x),
                    point.y + strength * (y * inverse - point.y), point.z + strength * (z * inverse - point.z));
            }
            Vector3[] swap = deformation; deformation = filtered; filtered = swap;
        }

        Vector3 Transform(Vector3 p)
        {
            return new Vector3(affineX.x * p.x + affineY.x * p.y + affineZ.x * p.z,
                affineX.y * p.x + affineY.y * p.y + affineZ.y * p.z,
                affineX.z * p.x + affineY.z * p.y + affineZ.z * p.z);
        }

        void FitAffine(ContainerSimulation simulation)
        {
            currentCenter = Vector3.zero;
            for (int p = 0; p < boundCount; p++) currentCenter += simulation.Positions[p];
            currentCenter /= boundCount;
            Vector3 x = -covarianceX, y = -covarianceY, z = -covarianceZ;
            for (int p = 0; p < boundCount; p++)
            {
                Vector3 current = simulation.Positions[p] - currentCenter, rest = restParticles[p] - restCenter;
                x += current * rest.x; y += current * rest.y; z += current * rest.z;
            }
            affineX = Vector3.right + x * inverseRowX.x + y * inverseRowY.x + z * inverseRowZ.x;
            affineY = Vector3.up + x * inverseRowX.y + y * inverseRowY.y + z * inverseRowZ.y;
            affineZ = Vector3.forward + x * inverseRowX.z + y * inverseRowY.z + z * inverseRowZ.z;
        }

        void Bind(ContainerSimulation simulation)
        {
            boundCount = simulation.Count; neighbours = Mathf.Min(MaximumNeighbours, boundCount);
            restParticles = new Vector3[boundCount]; Array.Copy(simulation.Positions, restParticles, boundCount);
            bindings = new int[unit.Length * neighbours]; weights = new float[bindings.Length];
            restCenter = Vector3.zero;
            for (int p = 0; p < boundCount; p++) restCenter += restParticles[p];
            restCenter /= boundCount;
            covarianceX = covarianceY = covarianceZ = Vector3.zero;
            for (int p = 0; p < boundCount; p++)
            {
                Vector3 rest = restParticles[p] - restCenter;
                covarianceX += rest * rest.x; covarianceY += rest * rest.y; covarianceZ += rest * rest.z;
            }
            // The regularized displacement fit is identity in an unobserved direction
            // (one-particle or flat clouds), rather than an unstable inverse.
            float epsilon = Mathf.Max(1e-12f, (covarianceX.x + covarianceY.y + covarianceZ.z) * .0001f);
            Vector3 a = covarianceX + Vector3.right * epsilon, b = covarianceY + Vector3.up * epsilon, c = covarianceZ + Vector3.forward * epsilon;
            Vector3 rowX = Vector3.Cross(b, c), rowY = Vector3.Cross(c, a), rowZ = Vector3.Cross(a, b);
            float determinant = Vector3.Dot(a, rowX);
            inverseRowX = rowX / determinant; inverseRowY = rowY / determinant; inverseRowZ = rowZ / determinant;
            Vector3 minimum = restParticles[0], maximum = minimum;
            for (int p = 1; p < boundCount; p++)
            {
                minimum = Vector3.Min(minimum, restParticles[p]); maximum = Vector3.Max(maximum, restParticles[p]);
            }
            Vector3 center = (minimum + maximum) * .5f;
            Vector3 radii = (maximum - minimum) * .5f + Vector3.one * simulation.ParticleRadius;
            var distances = new float[neighbours];
            float regularization = Mathf.Max(1e-14f, simulation.ParticleRadius * simulation.ParticleRadius * .5f);
            for (int v = 0; v < unit.Length; v++)
            {
                Vector3 point = center + Vector3.Scale(unit[v], radii); restVertices[v] = point;
                int first = v * neighbours;
                for (int n = 0; n < neighbours; n++) distances[n] = float.PositiveInfinity;
                for (int p = 0; p < boundCount; p++)
                {
                    float distance = (restParticles[p] - point).sqrMagnitude;
                    if (distance >= distances[neighbours - 1]) continue;
                    int slot = neighbours - 1;
                    while (slot > 0 && distance < distances[slot - 1])
                    {
                        distances[slot] = distances[slot - 1]; bindings[first + slot] = bindings[first + slot - 1]; slot--;
                    }
                    distances[slot] = distance; bindings[first + slot] = p;
                }
                float sum = 0, radiusSquared = Mathf.Max(distances[neighbours - 1], regularization);
                for (int n = 0; n < neighbours; n++)
                {
                    // Compact weights fade to zero at the nearest-set boundary instead
                    // of introducing a visible jump when the last neighbour changes.
                    float taper = Mathf.Max(0, 1 - distances[n] / radiusSquared);
                    float weight = taper * taper / (distances[n] + regularization);
                    weights[first + n] = weight; sum += weight;
                }
                if (sum <= 1e-20f) // Equal-distance or single-particle clouds.
                { for (int n = 0; n < neighbours; n++) weights[first + n] = 1; sum = neighbours; }
                Vector3 weightedRest = Vector3.zero;
                for (int n = 0; n < neighbours; n++)
                {
                    weights[first + n] /= sum;
                    weightedRest += restParticles[bindings[first + n]] * weights[first + n];
                }
                bindingCenters[v] = weightedRest;
            }
        }

        static double Elapsed(long start)
        {
            return (System.Diagnostics.Stopwatch.GetTimestamp() - start) * 1000.0 / System.Diagnostics.Stopwatch.Frequency;
        }

        public void Dispose()
        {
            if (Mesh == null) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(Mesh); else UnityEngine.Object.DestroyImmediate(Mesh);
            Mesh = null;
        }
    }
}
