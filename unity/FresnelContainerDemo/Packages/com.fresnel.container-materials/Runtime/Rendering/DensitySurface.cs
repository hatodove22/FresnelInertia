using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.Materials
{
    /// <summary>A compact particle kernel reconstructed as a closed, smooth isosurface.
    /// The field is intersected with the vessel, so the visible volume cannot cross a wall.
    /// Every displacement comes from the solver's particle positions; there is no animation clock.</summary>
    internal sealed class DensitySurface : IDisposable
    {
        readonly List<Vector3> vertices = new List<Vector3>(40000);
        readonly List<Vector3> normals = new List<Vector3>(40000);
        readonly List<Color> colors = new List<Color>(40000);
        readonly List<Vector2> uv = new List<Vector2>(40000);
        readonly List<int> triangles = new List<int>(60000);
        readonly int[] corner = new int[8];
        readonly int[] inside = new int[4], outside = new int[4];
        static readonly int[] Tetrahedra = { 0, 5, 1, 6, 0, 1, 2, 6, 0, 2, 3, 6, 0, 3, 7, 6, 0, 7, 4, 6, 0, 4, 5, 6 };
        float[] density, speed, gx, gy, gz, wallScale, boxField, buffer;
        float[] gridX, gridY, gridZ;
        int[] cachedEdges, edgeEpoch;
        Vector3[] points, boxNormals;
        Vector3 size, origin, acceptedUp;
        Vector3 waterU,waterV;
        float waterExtentU,waterExtentV,waterExtentUp;
        float[] waterHeight,waterVelocity,waterBottom,waterTop,waterValid;
        int waterResolution;
        readonly WaterSurfaceFit waterFit=new WaterSurfaceFit();
        internal WaterSurfaceFit SurfaceFit { get { return waterFit; } }
        int nx, ny, nz;
        int epoch;
        float step, iso, cachedSupport, foamScale;
        public Mesh Mesh { get; private set; }
        public double FieldMilliseconds { get; private set; }
        public double ExtractionMilliseconds { get; private set; }
        public double UploadMilliseconds { get; private set; }

        public DensitySurface()
        {
            Mesh = new Mesh { name = "Particle density surface", indexFormat = IndexFormat.UInt32 };
            Mesh.MarkDynamic();
        }

        public void Configure(Vector3 bounds, MaterialQuality quality)
        {
            size = bounds;waterFit.ResetDynamics();
            waterResolution=quality==MaterialQuality.Mobile?16:quality==MaterialQuality.High?32:24;
            int columns=waterResolution*waterResolution;
            waterHeight=new float[columns];waterVelocity=new float[columns];waterBottom=new float[columns];waterTop=new float[columns];waterValid=new float[columns];
            int resolution = quality == MaterialQuality.Mobile ? 22 : quality == MaterialQuality.High ? 40 : 28;
            step = Mathf.Max(size.x, Mathf.Max(size.y, size.z)) / resolution;
            nx = Mathf.CeilToInt(size.x / step) + 3;
            ny = Mathf.CeilToInt(size.y / step) + 3;
            nz = Mathf.CeilToInt(size.z / step) + 3;
            origin = -.5f * new Vector3((nx - 1) * step, (ny - 1) * step, (nz - 1) * step);
            int count = nx * ny * nz;
            density = new float[count]; speed = new float[count]; gx = new float[count]; gy = new float[count]; gz = new float[count]; points = new Vector3[count];
            wallScale = new float[count];
            boxField = new float[count]; boxNormals = new Vector3[count]; buffer = new float[count];
            cachedEdges = new int[count * 7]; edgeEpoch = new int[count * 7]; epoch = 0; cachedSupport = -1;
            gridX = new float[nx]; gridY = new float[ny]; gridZ = new float[nz];
            for (int x = 0; x < nx; x++) gridX[x] = origin.x + x * step;
            for (int y = 0; y < ny; y++) gridY[y] = origin.y + y * step;
            for (int z = 0; z < nz; z++) gridZ[z] = origin.z + z * step;
            for (int z = 0; z < nz; z++) for (int y = 0; y < ny; y++) for (int x = 0; x < nx; x++)
            {
                int i = Index(x,y,z); Vector3 point = new Vector3(gridX[x], gridY[y], gridZ[z]); points[i] = point;
                Vector3 distance = size * .5f - new Vector3(Mathf.Abs(point.x), Mathf.Abs(point.y), Mathf.Abs(point.z));
                int axis = distance.x < distance.y ? (distance.x < distance.z ? 0 : 2) : (distance.y < distance.z ? 1 : 2);
                boxField[i] = distance[axis] / step;
                Vector3 normal = Vector3.zero; normal[axis] = -Mathf.Sign(point[axis]) / step; boxNormals[i] = normal;
            }
        }

        public void Rebuild(ContainerSimulation simulation, MaterialFrame frame)
        {
            long timing = System.Diagnostics.Stopwatch.GetTimestamp();
            FieldMilliseconds = ExtractionMilliseconds = UploadMilliseconds = 0;
            vertices.Clear(); normals.Clear(); colors.Clear(); uv.Clear(); triangles.Clear();
            if (simulation.Count == 0) { Mesh.Clear(); return; }
            Array.Clear(density, 0, density.Length); Array.Clear(speed, 0, speed.Length);
            if (++epoch == int.MaxValue) { Array.Clear(edgeEpoch, 0, edgeEpoch.Length); epoch = 1; }
            acceptedUp = frame.Gravity.sqrMagnitude > .00001f ? -frame.Gravity.normalized : Vector3.up;
            foamScale = 3.2f / Mathf.Max(.03f, Mathf.Sqrt(9.81f * size.y));
            bool soft = simulation.Kind == MaterialKind.Softbody;
            float support = simulation.ParticleRadius * (soft ? 3.3f : 4.4f);
            // A coarse mobile grid needs a slightly wider reconstruction kernel; particle physics is unchanged.
            support = Mathf.Max(support, step * 1.65f);
            float support2 = support * support, invSupport2 = 1 / support2;
            if (support != cachedSupport) CacheWalls(support);
            // The wider liquid kernel spans about two particle spacings. Its half-density
            // contour resolves a sheet of water, rather than the individual particle lobes.
            iso = soft ? 1.08f : 2.8f;
            if(!soft)RebuildWaterColumns(simulation,frame);
            else
            {
            for (int p = 0; p < simulation.Count; p++)
            {
                Vector3 position = simulation.Positions[p];
                float velocity = simulation.Velocities[p].magnitude;
                int xmin = Mathf.Max(0, Mathf.FloorToInt((position.x - support - origin.x) / step));
                int xmax = Mathf.Min(nx - 1, Mathf.CeilToInt((position.x + support - origin.x) / step));
                int ymin = Mathf.Max(0, Mathf.FloorToInt((position.y - support - origin.y) / step));
                int ymax = Mathf.Min(ny - 1, Mathf.CeilToInt((position.y + support - origin.y) / step));
                int zmin = Mathf.Max(0, Mathf.FloorToInt((position.z - support - origin.z) / step));
                int zmax = Mathf.Min(nz - 1, Mathf.CeilToInt((position.z + support - origin.z) / step));
                for (int z = zmin; z <= zmax; z++)
                {
                    float dz = gridZ[z] - position.z, z2 = dz * dz;
                    for (int y = ymin; y <= ymax; y++)
                    {
                        float dy = gridY[y] - position.y, yz2 = z2 + dy * dy;
                        if (yz2 >= support2) continue;
                        int index = nx * (y + ny * z) + xmin;
                        for (int x = xmin; x <= xmax; x++, index++)
                        {
                            float dx = gridX[x] - position.x;
                            float q = 1 - (dx * dx + yz2) * invSupport2;
                            if (q <= 0) continue;
                            float weight = q * q * q;
                            density[index] += weight; speed[index] += velocity * weight;
                        }
                    }
                }
            }
            for (int i = 0; i < density.Length; i++)
            {
                speed[i] /= Mathf.Max(.00001f, density[i]);
                if (!soft)
                {
                    // Correct the kernel mass truncated by vessel walls. Without this term,
                    // the bottom and corners lose neighbours and look like rounded gel beads.
                    // This analytic correction is cheaper than adding ghost particles.
                    density[i] *= wallScale[i];
                }
                density[i] -= iso;
            }
            SmoothField();
            }
            // Finite differences of the filtered field give coherent normals at shared
            // mesh vertices. They are substantially cheaper than per-particle gradients.
            float invStep = .5f / step;
            for (int z = 0; z < nz; z++) for (int y = 0; y < ny; y++) for (int x = 0; x < nx; x++)
            {
                int i = Index(x,y,z);
                gx[i] = (density[x < nx - 1 ? i + 1 : i] - density[x > 0 ? i - 1 : i]) * invStep;
                gy[i] = (density[y < ny - 1 ? i + nx : i] - density[y > 0 ? i - nx : i]) * invStep;
                gz[i] = (density[z < nz - 1 ? i + nx * ny : i] - density[z > 0 ? i - nx * ny : i]) * invStep;
            }
            for (int i = 0; i < density.Length; i++)
            {
                if (boxField[i] < density[i])
                {
                    density[i] = boxField[i];
                    gx[i] = boxNormals[i].x; gy[i] = boxNormals[i].y; gz[i] = boxNormals[i].z;
                }
            }
            FieldMilliseconds = Elapsed(timing); timing = System.Diagnostics.Stopwatch.GetTimestamp();
            for (int z = 0; z < nz - 1; z++) for (int y = 0; y < ny - 1; y++) for (int x = 0; x < nx - 1; x++)
            {
                corner[0] = Index(x, y, z); corner[1] = Index(x + 1, y, z);
                corner[2] = Index(x + 1, y + 1, z); corner[3] = Index(x, y + 1, z);
                corner[4] = Index(x, y, z + 1); corner[5] = Index(x + 1, y, z + 1);
                corner[6] = Index(x + 1, y + 1, z + 1); corner[7] = Index(x, y + 1, z + 1);
                int positive = 0; for (int c = 0; c < 8; c++) if (density[corner[c]] > 0) positive++;
                if (positive == 0 || positive == 8) continue;
                for (int t = 0; t < 24; t += 4)
                {
                    int a = 0, b = 0;
                    for (int c = 0; c < 4; c++) { int index = corner[Tetrahedra[t + c]]; if (density[index] > 0) inside[a++] = index; else outside[b++] = index; }
                    if (a == 1) Emit(Edge(inside[0], outside[0], frame), Edge(inside[0], outside[1], frame), Edge(inside[0], outside[2], frame));
                    else if (a == 3) Emit(Edge(outside[0], inside[0], frame), Edge(outside[0], inside[1], frame), Edge(outside[0], inside[2], frame));
                    else if (a == 2)
                    {
                        int v0 = Edge(inside[0], outside[0], frame), v1 = Edge(inside[0], outside[1], frame);
                        int v2 = Edge(inside[1], outside[0], frame), v3 = Edge(inside[1], outside[1], frame);
                        Emit(v0, v1, v2); Emit(v1, v3, v2);
                    }
                }
            }
            // A detached droplet smaller than a grid cell can fall between all sampled nodes.
            // Keep that actual solver particle visible instead of losing it to surface resolution.
            // This does not spawn or integrate any decorative particles.
            if(soft)for (int p = 0; p < simulation.Count; p++)
            {
                Vector3 position = simulation.Positions[p];
                int x = Mathf.Clamp(Mathf.FloorToInt((position.x - origin.x) / step), 0, nx - 2);
                int y = Mathf.Clamp(Mathf.FloorToInt((position.y - origin.y) / step), 0, ny - 2);
                int z = Mathf.Clamp(Mathf.FloorToInt((position.z - origin.z) / step), 0, nz - 2);
                bool reconstructed = false; float peakDensity = -100;
                for (int dz = 0; dz < 2; dz++) for (int dy = 0; dy < 2; dy++) for (int dx = 0; dx < 2; dx++)
                {
                    float sampled = density[Index(x + dx, y + dy, z + dz)];
                    if (sampled > 0) reconstructed = true;
                    if (sampled > peakDensity) peakDensity = sampled;
                }
                // Only truly sparse, isolated particles get a droplet fallback. Filling
                // under-density pockets inside the bulk creates visible internal bubbles.
                if (!reconstructed && peakDensity + iso < 1.25f) Droplet(position, simulation.Radii[p] * .94f);
            }
            ExtractionMilliseconds = Elapsed(timing); timing = System.Diagnostics.Stopwatch.GetTimestamp();
            Mesh.Clear(); Mesh.SetVertices(vertices); Mesh.SetNormals(normals); Mesh.SetColors(colors); Mesh.SetUVs(0, uv);
            Mesh.SetTriangles(triangles, 0, false); Mesh.bounds = new Bounds(Vector3.zero, size);
            UploadMilliseconds = Elapsed(timing);
        }
        static double Elapsed(long since) { return (System.Diagnostics.Stopwatch.GetTimestamp() - since) * 1000.0 / System.Diagnostics.Stopwatch.Frequency; }

        struct Vertex { public Vector3 Position, Normal; public Color Color; }
        void RebuildWaterColumns(ContainerSimulation simulation,MaterialFrame frame)
        {
            waterFit.Solve(simulation,frame);
            waterU=waterFit.AxisU;waterV=waterFit.AxisV;
            waterExtentU=waterFit.ExtentU;waterExtentV=waterFit.ExtentV;waterExtentUp=waterFit.ExtentUp;
            float volume=Mathf.Clamp01(frame.Fill)*size.x*size.y*size.z;
            for(int y=0;y<waterResolution;y++)for(int x=0;x<waterResolution;x++)
            {
                int c=x+y*waterResolution;
                float u=((x+.5f)/waterResolution-.5f)*waterExtentU*2,v=((y+.5f)/waterResolution-.5f)*waterExtentV*2;
                float bottom,top;
                if(!WaterColumnBounds(u,v,out bottom,out top)){waterValid[c]=0;waterHeight[c]=waterVelocity[c]=waterBottom[c]=waterTop[c]=0;continue;}
                waterValid[c]=1;waterBottom[c]=bottom;waterTop[c]=top;
                waterHeight[c]=waterFit.Height(u,v);waterVelocity[c]=waterFit.MeanSpeed;
            }
            float loLevel=-waterExtentUp*2,hiLevel=waterExtentUp*2;
            float area=4*waterExtentU*waterExtentV/(waterResolution*waterResolution);
            for(int iteration=0;iteration<13;iteration++)
            {
                float mid=(loLevel+hiLevel)*.5f,sum=0;
                for(int c=0;c<waterHeight.Length;c++)if(waterValid[c]>0)sum+=Mathf.Clamp(waterHeight[c]+mid-waterBottom[c],0,waterTop[c]-waterBottom[c])*area;
                if(sum<volume)loLevel=mid;else hiLevel=mid;
            }
            float level=(loLevel+hiLevel)*.5f,inverseScale=1/Mathf.Max(.00001f,waterExtentUp*2);
            for(int i=0;i<points.Length;i++)
            {
                Vector3 p=points[i];
                float u=Vector3.Dot(p,waterU),v=Vector3.Dot(p,waterV);
                float height=waterFit.Height(u,v)+level;
                density[i]=(height-Vector3.Dot(p,acceptedUp))*inverseScale;
                speed[i]=waterFit.MeanSpeed;
            }
        }
        bool WaterColumnBounds(float u,float v,out float bottom,out float top)
        {
            Vector3 p=waterU*u+waterV*v,half=size*.5f;bottom=float.NegativeInfinity;top=float.PositiveInfinity;
            for(int axis=0;axis<3;axis++)
            {
                float direction=acceptedUp[axis];
                if(Mathf.Abs(direction)<.000001f){if(Mathf.Abs(p[axis])>half[axis])return false;continue;}
                float a=(-half[axis]-p[axis])/direction,b=(half[axis]-p[axis])/direction;
                bottom=Mathf.Max(bottom,Mathf.Min(a,b));top=Mathf.Min(top,Mathf.Max(a,b));
            }
            return top>bottom;
        }
        static float ProjectedExtent(Vector3 axis,Vector3 half){return Mathf.Abs(axis.x)*half.x+Mathf.Abs(axis.y)*half.y+Mathf.Abs(axis.z)*half.z;}
        void SmoothField()
        {
            // One compact separable binomial filter removes particle-scale aliasing while
            // leaving the actual particle-driven crest position and larger waves intact.
            for (int axis = 0; axis < 3; axis++)
            {
                int stride = axis == 0 ? 1 : axis == 1 ? nx : nx * ny;
                for (int z = 0; z < nz; z++) for (int y = 0; y < ny; y++) for (int x = 0; x < nx; x++)
                {
                    int i = Index(x,y,z), coordinate = axis == 0 ? x : axis == 1 ? y : z;
                    int length = axis == 0 ? nx : axis == 1 ? ny : nz;
                    buffer[i] = coordinate == 0 || coordinate == length - 1 ? density[i] :
                        (density[i - stride] + 2 * density[i] + density[i + stride]) * .25f;
                }
                float[] swap = density; density = buffer; buffer = swap;
            }
        }
        void CacheWalls(float support)
        {
            cachedSupport = support;
            Vector3 half = size * .5f;
            for (int i = 0; i < points.Length; i++)
            {
                Vector3 p = points[i]; float dx,dy,dz;
                float fx = WallFraction(p.x, half.x, support, out dx), fy = WallFraction(p.y, half.y, support, out dy), fz = WallFraction(p.z, half.z, support, out dz);
                float inverse = 1 / Mathf.Max(.0001f, fx * fy * fz);
                wallScale[i] = inverse;
            }
        }
        static float WallFraction(float coordinate, float halfExtent, float support, out float derivative)
        {
            float a = Mathf.Clamp((halfExtent + coordinate) / support, -1, 1);
            float b = Mathf.Clamp((halfExtent - coordinate) / support, -1, 1);
            float qa = 1 - a * a, qb = 1 - b * b;
            derivative = 1.23046875f * (qa * qa * qa * qa - qb * qb * qb * qb) / support;
            return KernelIntegral(a) + KernelIntegral(b) - 1;
        }
        static float KernelIntegral(float x)
        {
            // Integral of the compact cubic kernel across a plane, normalised to [0,1].
            float x2 = x * x;
            return .5f + 1.23046875f * x * (1 + x2 * (-4f / 3 + x2 * (6f / 5 + x2 * (-4f / 7 + x2 / 9))));
        }
        void Droplet(Vector3 center, float radius)
        {
            const int latitude = 6, longitude = 10;
            for (int y = 0; y < latitude; y++) for (int x = 0; x < longitude; x++)
            {
                Vertex a = SpherePoint(center, radius, y * Mathf.PI / latitude, x * Mathf.PI * 2 / longitude);
                Vertex b = SpherePoint(center, radius, (y + 1) * Mathf.PI / latitude, x * Mathf.PI * 2 / longitude);
                Vertex c = SpherePoint(center, radius, y * Mathf.PI / latitude, (x + 1) * Mathf.PI * 2 / longitude);
                Vertex d = SpherePoint(center, radius, (y + 1) * Mathf.PI / latitude, (x + 1) * Mathf.PI * 2 / longitude);
                Emit(a, b, c); Emit(c, b, d);
            }
        }
        Vertex SpherePoint(Vector3 center, float radius, float latitude, float longitude)
        {
            Vector3 normal = new Vector3(Mathf.Sin(latitude) * Mathf.Cos(longitude), Mathf.Cos(latitude), Mathf.Sin(latitude) * Mathf.Sin(longitude));
            Vector3 point = center + normal * radius;
            point = new Vector3(Mathf.Clamp(point.x, -size.x * .5f, size.x * .5f), Mathf.Clamp(point.y, -size.y * .5f, size.y * .5f), Mathf.Clamp(point.z, -size.z * .5f, size.z * .5f));
            return new Vertex { Position = point, Normal = normal, Color = new Color(0, 0, 0, 1) };
        }
        int Edge(int a, int b, MaterialFrame frame)
        {
            if (a > b) { int swap = a; a = b; b = swap; }
            int delta = b - a;
            int direction = delta == 1 ? 0 : delta == nx ? 1 : delta == nx * ny ? 2 : delta == nx + 1 ? 3 : delta == nx * ny + 1 ? 4 : delta == nx * ny + nx ? 5 : 6;
            int key = a * 7 + direction;
            if (edgeEpoch[key] == epoch) return cachedEdges[key];
            float t = Mathf.Clamp01(density[a] / (density[a] - density[b]));
            Vector3 point = Vector3.LerpUnclamped(points[a], points[b], t);
            Vector3 normal = new Vector3(-(gx[a] + (gx[b] - gx[a]) * t), -(gy[a] + (gy[b] - gy[a]) * t), -(gz[a] + (gz[b] - gz[a]) * t)).normalized;
            float velocity = Mathf.LerpUnclamped(speed[a], speed[b], t);
            // Foam is a velocity-derived surface cue, never a separately invented fluid event.
            float crest = Mathf.SmoothStep(.2f, .85f, Vector3.Dot(normal, acceptedUp));
            float agitation = Mathf.Clamp01(velocity * foamScale - .11f);
            int index = vertices.Count;
            Add(new Vertex { Position = point, Normal = normal, Color = new Color(crest * agitation, agitation, 0, 1) });
            cachedEdges[key] = index; edgeEpoch[key] = epoch; return index;
        }
        void Emit(int a, int b, int c)
        {
            Vector3 av = vertices[a], bv = vertices[b], cv = vertices[c];
            Vector3 geometric = Vector3.Cross(bv - av, cv - av);
            if (geometric.sqrMagnitude < 1e-20f) return;
            if (Vector3.Dot(geometric, normals[a] + normals[b] + normals[c]) < 0) { int swap = b; b = c; c = swap; }
            triangles.Add(a); triangles.Add(b); triangles.Add(c);
        }
        void Emit(Vertex a, Vertex b, Vertex c)
        {
            Vector3 geometric = Vector3.Cross(b.Position - a.Position, c.Position - a.Position);
            if (geometric.sqrMagnitude < 1e-20f) return;
            if (Vector3.Dot(geometric, a.Normal + b.Normal + c.Normal) < 0) { Vertex swap = b; b = c; c = swap; }
            int start = vertices.Count; Add(a); Add(b); Add(c); triangles.Add(start); triangles.Add(start + 1); triangles.Add(start + 2);
        }
        void Add(Vertex v) { vertices.Add(v.Position); normals.Add(v.Normal); colors.Add(v.Color); uv.Add(new Vector2(v.Position.x / size.x + .5f, v.Position.z / size.z + .5f)); }
        int Index(int x, int y, int z) { return x + nx * (y + ny * z); }
        public void Dispose() { if (Mesh != null) { if (Application.isPlaying) UnityEngine.Object.Destroy(Mesh); else UnityEngine.Object.DestroyImmediate(Mesh); Mesh = null; } }
    }
}
