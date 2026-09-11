using UnityEngine;

namespace Fresnel.UnityDemo.Presentation
{
    /// <summary>A clipped height volume, not CFD. An intercept solve conserves the requested
    /// fill of its trapezoid-integrated mesh even when a surface reaches the roof or floor.
    /// All source-driven waves are included before the solve; no wall escape correction.</summary>
    public sealed class BoundedSurface
    {
        public const int Columns = 32, Rows = 16;
        public const int VertexCount = (Columns + 1) * (Rows + 1);
        public readonly float[] Heights = new float[VertexCount];
        private readonly float[] profile = new float[VertexCount];
        private readonly Vector3[] topVertices = new Vector3[VertexCount];
        private readonly Vector2[] topUvs = new Vector2[VertexCount];
        private readonly int[] topTriangles = new int[Columns * Rows * 6];
        private readonly Vector3[] bodyVertices = new Vector3[(Columns + Rows) * 8 + 4];
        private readonly int[] bodyTriangles = new int[(Columns + Rows) * 12 + 6];
        private bool initialized;
        public Vector3 Size { get; private set; }
        public bool Inverted { get; private set; }
        public float ObservedFill { get; private set; }

        public void Update(Vector3 size, float fill, float slopeX, float slopeZ, float amplitude, float phase, bool inverted)
        {
            Size = size; Inverted = inverted;
            float halfY = size.y * .5f;
            fill = Mathf.Clamp01(fill);
            slopeX = Mathf.Clamp(slopeX, -16, 16);
            slopeZ = Mathf.Clamp(slopeZ, -16, 16);
            amplitude = Mathf.Clamp(amplitude, 0, size.y * .16f * Mathf.Min(fill, 1 - fill));
            float range = size.y + Mathf.Abs(slopeX) * size.x + Mathf.Abs(slopeZ) * size.z + amplitude * 4;
            for (int z = 0; z <= Rows; z++) for (int x = 0; x <= Columns; x++)
            {
                float nx = (float)x / Columns, nz = (float)z / Rows;
                // Waves flatten at the perimeter. Their clock is supplied by the source.
                float edge = Mathf.Sin(nx * Mathf.PI) * Mathf.Sin(nz * Mathf.PI);
                profile[z * (Columns + 1) + x] = (nx - .5f) * size.x * slopeX + (nz - .5f) * size.z * slopeZ +
                    amplitude * edge * (Mathf.Sin(nx * Mathf.PI * 2 + phase) + .35f * Mathf.Cos(nz * Mathf.PI * 3 - phase * .71f));
            }
            float desired = inverted ? 1 - fill : fill;
            float low = -range, high = range;
            for (int iteration = 0; iteration < 24; iteration++)
            {
                float intercept = (low + high) * .5f;
                if (Integrate(intercept, halfY) < desired) low = intercept; else high = intercept;
            }
            float center = (low + high) * .5f;
            for (int i = 0; i < Heights.Length; i++) Heights[i] = Mathf.Clamp(center + profile[i], -halfY, halfY);
            ObservedFill = Integrate(center, halfY);
            if (inverted) ObservedFill = 1 - ObservedFill;
        }

        private float Integrate(float intercept, float halfY)
        {
            double sum = 0;
            for (int z = 0; z <= Rows; z++) for (int x = 0; x <= Columns; x++)
            {
                int weight = (x == 0 || x == Columns ? 1 : 2) * (z == 0 || z == Rows ? 1 : 2);
                sum += weight * (Mathf.Clamp(intercept + profile[z * (Columns + 1) + x], -halfY, halfY) + halfY);
            }
            return (float)(sum / (Columns * Rows * 4 * Size.y));
        }

        public float HeightAt(float x, float z)
        {
            float fx = Mathf.Clamp01(x / Size.x + .5f) * Columns;
            float fz = Mathf.Clamp01(z / Size.z + .5f) * Rows;
            int ix = Mathf.Min(Columns - 1, Mathf.FloorToInt(fx)), iz = Mathf.Min(Rows - 1, Mathf.FloorToInt(fz));
            float a = Mathf.Lerp(Heights[iz * (Columns + 1) + ix], Heights[iz * (Columns + 1) + ix + 1], fx - ix);
            float b = Mathf.Lerp(Heights[(iz + 1) * (Columns + 1) + ix], Heights[(iz + 1) * (Columns + 1) + ix + 1], fx - ix);
            return Mathf.Lerp(a, b, fz - iz);
        }

        public void WriteMeshes(Mesh top, Mesh body)
        {
            int ti = 0;
            for (int z = 0; z <= Rows; z++) for (int x = 0; x <= Columns; x++)
            {
                int i = z * (Columns + 1) + x;
                topVertices[i] = new Vector3(((float)x / Columns - .5f) * Size.x, Heights[i], ((float)z / Rows - .5f) * Size.z);
                if (!initialized) topUvs[i] = new Vector2((float)x / Columns * 4, (float)z / Rows * 2);
                if (x < Columns && z < Rows)
                {
                    int a = i, b = i + 1, c = i + Columns + 1, d = c + 1;
                    topTriangles[ti++] = a; topTriangles[ti++] = Inverted ? b : c; topTriangles[ti++] = Inverted ? c : b;
                    topTriangles[ti++] = b; topTriangles[ti++] = Inverted ? d : c; topTriangles[ti++] = Inverted ? c : d;
                }
            }
            float floor = (Inverted ? .5f : -.5f) * Size.y;
            int vertex = 0, tri = 0;
            for (int x = 0; x < Columns; x++)
            {
                Side(topVertices[x], topVertices[x + 1], floor, ref vertex, ref tri);
                int end = Rows * (Columns + 1);
                Side(topVertices[end + x + 1], topVertices[end + x], floor, ref vertex, ref tri);
            }
            for (int z = 0; z < Rows; z++)
            {
                Side(topVertices[(z + 1) * (Columns + 1)], topVertices[z * (Columns + 1)], floor, ref vertex, ref tri);
                Side(topVertices[z * (Columns + 1) + Columns], topVertices[(z + 1) * (Columns + 1) + Columns], floor, ref vertex, ref tri);
            }
            bodyVertices[vertex] = new Vector3(-Size.x * .5f, floor, -Size.z * .5f);
            bodyVertices[vertex + 1] = new Vector3(Size.x * .5f, floor, -Size.z * .5f);
            bodyVertices[vertex + 2] = new Vector3(-Size.x * .5f, floor, Size.z * .5f);
            bodyVertices[vertex + 3] = new Vector3(Size.x * .5f, floor, Size.z * .5f);
            bodyTriangles[tri++] = vertex; bodyTriangles[tri++] = vertex + (Inverted ? 2 : 1); bodyTriangles[tri++] = vertex + (Inverted ? 1 : 2);
            bodyTriangles[tri++] = vertex + 1; bodyTriangles[tri++] = vertex + (Inverted ? 2 : 3); bodyTriangles[tri] = vertex + (Inverted ? 3 : 2);
            top.vertices = topVertices; top.uv = topUvs; top.triangles = topTriangles; top.RecalculateNormals(); top.RecalculateBounds();
            body.vertices = bodyVertices; body.triangles = bodyTriangles; body.RecalculateNormals(); body.RecalculateBounds();
            initialized = true;
        }

        private void Side(Vector3 a, Vector3 b, float floor, ref int vertex, ref int tri)
        {
            bodyVertices[vertex] = new Vector3(a.x, floor, a.z); bodyVertices[vertex + 1] = new Vector3(b.x, floor, b.z);
            bodyVertices[vertex + 2] = a; bodyVertices[vertex + 3] = b;
            bodyTriangles[tri++] = vertex; bodyTriangles[tri++] = vertex + (Inverted ? 1 : 2); bodyTriangles[tri++] = vertex + (Inverted ? 2 : 1);
            bodyTriangles[tri++] = vertex + 1; bodyTriangles[tri++] = vertex + (Inverted ? 3 : 2); bodyTriangles[tri++] = vertex + (Inverted ? 2 : 3);
            vertex += 4;
        }
    }
}
