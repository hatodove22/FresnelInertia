using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.Materials
{
    // A fixed pool of secondary, impact-generated droplets and landing foam.
    // These are visual parcels, not extra SPH mass. They remain in the closed
    // vessel, return to its surface, and never advance without an accepted step.
    internal sealed class WaterDynamicDetails : IDisposable
    {
        struct Parcel
        {
            public Vector3 Position, Velocity;
            public float Radius, Age, Life, Opacity;
            public bool Active, Foam;
        }
        readonly GameObject root;
        readonly Mesh mesh;
        readonly Material material;
        readonly List<Vector3> vertices = new List<Vector3>(3000), normals = new List<Vector3>(3000);
        readonly List<Color> colors = new List<Color>(3000);
        readonly List<int> indices = new List<int>(6000);
        static readonly Vector3[] Sphere = BuildSphere();
        static readonly int[] SphereTriangles = BuildSphereTriangles();
        Parcel[] parcels = new Parcel[0];
        Vector3 size, previousAngularVelocity;
        MaterialQuality quality;
        double sourceTime = double.NaN;
        uint random = 0x68bc21ebu;
        float emissionCredit;
        bool visible = true;
        int revision;
        public int Count { get; private set; }
        public float Energy { get; private set; }
        public Mesh Mesh { get { return mesh; } }

        public WaterDynamicDetails(Transform parent)
        {
            root = new GameObject("Fresnel contained water droplets and foam"); root.transform.SetParent(parent, false);
            mesh = new Mesh { name = "Accepted impact droplets and foam", indexFormat = IndexFormat.UInt16 }; mesh.MarkDynamic();
            root.AddComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = root.AddComponent<MeshRenderer>();
            material = new Material(Resources.Load<Shader>("FresnelWaterDetails")) { name = "Contained water detail material" };
            renderer.sharedMaterial = material; renderer.shadowCastingMode = ShadowCastingMode.Off; renderer.receiveShadows = false;
            root.SetActive(false);
        }
        public void Configure(Vector3 dimensions, MaterialQuality value)
        {
            size = dimensions; quality = value;
            parcels = new Parcel[value == MaterialQuality.Mobile ? 20 : value == MaterialQuality.High ? 64 : 44];
            Reset();
        }
        public void Reset()
        {
            Array.Clear(parcels, 0, parcels.Length); Count = 0; Energy = emissionCredit = 0;
            sourceTime = double.NaN; previousAngularVelocity = Vector3.zero; random = 0x68bc21ebu; revision++; mesh.Clear(); root.SetActive(false);
        }
        public void Render(ContainerSimulation simulation, MaterialFrame frame, WaterSurfaceFit surface)
        {
            if (frame.Rebase || simulation.Count == 0)
            { Reset(); sourceTime = frame.Time; return; }
            float dt = Mathf.Min(.05f, simulation.LastConsumedDelta);
            if (!frame.IsFresh || dt <= 0 || (!double.IsNaN(sourceTime) && frame.Time <= sourceTime)) return;
            // Angular acceleration uses elapsed accepted source time, not the
            // shorter integration budget. A rebase resets this history to zero.
            float sourceDelta = double.IsNaN(sourceTime) ? frame.DeltaTime : (float)(frame.Time - sourceTime);
            Vector3 angularVelocity = Vector3.ClampMagnitude(frame.AngularVelocity, 25);
            Vector3 angularAcceleration = !double.IsNaN(sourceTime) && sourceDelta > .000001f ?
                Vector3.ClampMagnitude((angularVelocity - previousAngularVelocity) / sourceDelta, 500) : Vector3.zero;
            previousAngularVelocity = angularVelocity; sourceTime = frame.Time;
            Vector3 linearAcceleration = Vector3.ClampMagnitude(frame.Acceleration, 80);
            Vector3 acceleration = Vector3.ClampMagnitude(frame.Gravity, 35) - linearAcceleration;
            bool rotating = angularVelocity.sqrMagnitude > .000000000001f || angularAcceleration.sqrMagnitude > .000000000001f;
            float maximumSpeed = Mathf.Max(.35f, size.magnitude * 7) + Mathf.Min(2, linearAcceleration.magnitude * .018f + angularVelocity.magnitude * size.magnitude);
            for (int i = 0; i < parcels.Length; i++)
            {
                if (!parcels[i].Active) continue;
                Parcel parcel = parcels[i]; parcel.Age += dt;
                if (parcel.Age >= parcel.Life) { parcel.Active = false; parcels[i] = parcel; continue; }
                if (parcel.Foam)
                {
                    Vector3 drift = surface.MeanVelocity - surface.Up * Vector3.Dot(surface.MeanVelocity, surface.Up);
                    parcel.Position += drift * dt * .42f;
                    parcel.Position = SurfacePoint(parcel.Position, surface, parcel.Radius * .055f);
                    parcel.Opacity = Mathf.Clamp01(1 - parcel.Age / parcel.Life);
                }
                else
                {
                    int substeps = Mathf.Max(1, Mathf.CeilToInt(dt * 180)); float h = dt / substeps;
                    for (int step = 0; step < substeps; step++)
                    {
                        Vector3 force = acceleration;
                        if (rotating)
                        {
                            Vector3 rotationForce = -2 * Vector3.Cross(angularVelocity, parcel.Velocity) -
                                Vector3.Cross(angularVelocity, Vector3.Cross(angularVelocity, parcel.Position)) -
                                Vector3.Cross(angularAcceleration, parcel.Position);
                            force += Vector3.ClampMagnitude(rotationForce, 120);
                        }
                        parcel.Velocity = Vector3.ClampMagnitude(parcel.Velocity + force * h, maximumSpeed);
                        parcel.Velocity *= Mathf.Exp(-h * .8f);
                        parcel.Position += parcel.Velocity * h;
                        Contain(ref parcel);
                    }
                    float u = Vector3.Dot(parcel.Position, surface.AxisU), v = Vector3.Dot(parcel.Position, surface.AxisV);
                    if (Vector3.Dot(parcel.Position, surface.Up) <= surface.Height(u, v) + parcel.Radius * .45f && parcel.Age > .025f)
                    {
                        parcel.Foam = true; parcel.Age = 0; parcel.Life = 1.15f + Random01() * .65f;
                        parcel.Radius *= 2.2f; parcel.Velocity = Vector3.zero; parcel.Opacity = .9f;
                        parcel.Position = SurfacePoint(parcel.Position, surface, parcel.Radius * .055f);
                    }
                }
                parcels[i] = parcel;
            }
            // Resting support contacts do not spray. Actual transient wall impacts
            // supply both the origin and a bounded emission budget.
            int emissionLimit = quality == MaterialQuality.Mobile ? 3 : 6;
            for (int wall = 0; wall < 6 && emissionLimit > 0; wall++)
            {
                var impact = simulation.GetWallImpact(wall);
                float excess = WaterSurfaceDynamics.ImpactExcess(impact.Impulse, impact.Normal, frame.Gravity, dt);
                if (excess <= .003f || frame.Fill >= .96f || frame.Fill <= .02f) continue;
                float strength = Mathf.Clamp01(excess * 18);
                emissionCredit = Mathf.Min(8, emissionCredit + excess * (quality == MaterialQuality.Mobile ? 45 : 85));
                while (emissionCredit >= 1 && emissionLimit > 0)
                {
                    if (!Emit(impact.Position, impact.Normal, strength, surface)) break;
                    emissionCredit -= 1; emissionLimit--;
                }
            }
            emissionCredit *= Mathf.Exp(-dt * 4);
            revision++; Rebuild(surface);
        }
        bool Emit(Vector3 contact, Vector3 inward, float strength, WaterSurfaceFit surface)
        {
            int slot = -1;
            for (int i = 0; i < parcels.Length; i++) if (!parcels[i].Active) { slot = i; break; }
            if (slot < 0) return false;
            float minimum = Mathf.Min(size.x, Mathf.Min(size.y, size.z));
            float radius = minimum * Mathf.Lerp(.009f, .018f, Random01());
            Vector3 side = Vector3.Cross(surface.Up, inward);
            if (side.sqrMagnitude < .01f) side = surface.AxisU;
            side.Normalize();
            Vector3 origin = contact + inward * minimum * .035f + side * ((Random01() - .5f) * minimum * .18f);
            origin = SurfacePoint(origin, surface, radius * 1.5f);
            if (Vector3.Dot(size * .5f - Abs(origin), Abs(surface.Up)) < radius * 2) return false;
            float gravitySpeed = Mathf.Sqrt(9.81f * minimum);
            Vector3 launch = surface.Up * gravitySpeed * (.27f + strength * .70f) +
                inward * gravitySpeed * (.10f + strength * .22f) + side * gravitySpeed * ((Random01() - .5f) * .20f) + surface.MeanVelocity * .35f;
            bool foam = Random01() < .30f;
            parcels[slot] = new Parcel { Active = true, Foam = foam, Position = origin,
                Velocity = Vector3.ClampMagnitude(launch, gravitySpeed * 1.5f), Radius = foam ? radius * 2.6f : radius,
                Age = 0, Life = foam ? 1.2f + Random01() * .55f : .85f, Opacity = 1 };
            if (foam) { Parcel parcel = parcels[slot]; parcel.Position = SurfacePoint(origin, surface, parcel.Radius * .055f); parcels[slot] = parcel; }
            return true;
        }
        Vector3 SurfacePoint(Vector3 point, WaterSurfaceFit surface, float lift)
        {
            Vector3 half = size * .5f - Vector3.one * Mathf.Min(size.x, Mathf.Min(size.y, size.z)) * .001f;
            point = Clamp(point, half);
            float u = Vector3.Dot(point, surface.AxisU), v = Vector3.Dot(point, surface.AxisV);
            return Clamp(surface.AxisU * u + surface.AxisV * v + surface.Up * (surface.Height(u, v) + lift), half);
        }
        void Contain(ref Parcel parcel)
        {
            Vector3 half = size * .5f - Vector3.one * parcel.Radius * 1.6f;
            for (int axis = 0; axis < 3; axis++)
            {
                float bound = Mathf.Max(0, half[axis]);
                if (parcel.Position[axis] < -bound) { parcel.Position[axis] = -bound; parcel.Velocity[axis] = Mathf.Abs(parcel.Velocity[axis]) * .24f; }
                else if (parcel.Position[axis] > bound) { parcel.Position[axis] = bound; parcel.Velocity[axis] = -Mathf.Abs(parcel.Velocity[axis]) * .24f; }
            }
        }
        void Rebuild(WaterSurfaceFit surface)
        {
            vertices.Clear(); normals.Clear(); colors.Clear(); indices.Clear(); Count = 0; Energy = 0;
            for (int i = 0; i < parcels.Length; i++)
            {
                Parcel parcel = parcels[i]; if (!parcel.Active) continue;
                Count++; Energy += parcel.Foam ? parcel.Opacity * parcel.Radius * parcel.Radius * .08f :
                    parcel.Radius * parcel.Radius + parcel.Velocity.sqrMagnitude * .00003f;
                if (parcel.Foam) Foam(parcel, surface); else Droplet(parcel, surface.Up);
            }
            mesh.Clear(); mesh.SetVertices(vertices); mesh.SetNormals(normals); mesh.SetColors(colors);
            mesh.SetTriangles(indices, 0, false); mesh.bounds = new Bounds(Vector3.zero, size);
            root.SetActive(visible && Count > 0);
        }
        void Droplet(Parcel parcel, Vector3 up)
        {
            int start = vertices.Count;
            Vector3 axis = parcel.Velocity.sqrMagnitude > .004f ? parcel.Velocity.normalized : up;
            Vector3 side = Vector3.Cross(axis, Mathf.Abs(axis.z) < .85f ? Vector3.forward : Vector3.right).normalized;
            Vector3 tangent = Vector3.Cross(axis, side);
            float stretch = 1 + Mathf.Min(.55f, parcel.Velocity.magnitude * 1.6f);
            Vector3 half = size * .5f;
            for (int i = 0; i < Sphere.Length; i++)
            {
                Vector3 s = Sphere[i];
                vertices.Add(Clamp(parcel.Position + (side * s.x + tangent * s.z + axis * s.y * stretch) * parcel.Radius, half));
                normals.Add((side * s.x + tangent * s.z + axis * (s.y / stretch)).normalized);
                colors.Add(new Color(0, 1, 0, Mathf.Min(1, (parcel.Life - parcel.Age) * 12)));
            }
            for (int i = 0; i < SphereTriangles.Length; i++) indices.Add(start + SphereTriangles[i]);
        }
        void Foam(Parcel parcel, WaterSurfaceFit surface)
        {
            int start = vertices.Count;
            float u = Vector3.Dot(parcel.Position, surface.AxisU), v = Vector3.Dot(parcel.Position, surface.AxisV);
            Vector3 normal = surface.Normal(u, v), tangent = Vector3.Cross(normal, surface.AxisU).normalized;
            Vector3 side = Vector3.Cross(tangent, normal).normalized;
            vertices.Add(SurfacePoint(parcel.Position, surface, parcel.Radius * .07f)); normals.Add(normal);
            colors.Add(new Color(1, 1, 0, parcel.Opacity * .72f));
            float growth = 1 + parcel.Age * .35f;
            for (int i = 0; i < 8; i++)
            {
                float angle = i * Mathf.PI * .25f;
                Vector3 p = parcel.Position + (side * Mathf.Cos(angle) * 1.5f + tangent * Mathf.Sin(angle)) * parcel.Radius * growth;
                vertices.Add(SurfacePoint(p, surface, parcel.Radius * .07f)); normals.Add(normal);
                colors.Add(new Color(1, 1, 0, 0));
                indices.Add(start); indices.Add(start + 1 + (i + 1) % 8); indices.Add(start + 1 + i);
            }
        }
        public ulong StateHash
        {
            get
            {
                ulong hash = 1469598103934665603UL;
                for (int i = 0; i < parcels.Length; i++)
                {
                    Parcel p = parcels[i]; if (!p.Active) continue;
                    WaterSurfaceDynamics.Mix(ref hash, p.Position.x); WaterSurfaceDynamics.Mix(ref hash, p.Position.y); WaterSurfaceDynamics.Mix(ref hash, p.Position.z);
                    WaterSurfaceDynamics.Mix(ref hash, p.Velocity.x); WaterSurfaceDynamics.Mix(ref hash, p.Velocity.y); WaterSurfaceDynamics.Mix(ref hash, p.Velocity.z);
                    WaterSurfaceDynamics.Mix(ref hash, p.Age); WaterSurfaceDynamics.Mix(ref hash, p.Radius); WaterSurfaceDynamics.Mix(ref hash, p.Opacity);
                    unchecked { hash = (hash ^ (uint)(i + (p.Foam ? 1000 : 0))) * 1099511628211UL; }
                }
                WaterSurfaceDynamics.Mix(ref hash, emissionCredit);
                WaterSurfaceDynamics.Mix(ref hash, previousAngularVelocity.x);
                WaterSurfaceDynamics.Mix(ref hash, previousAngularVelocity.y);
                WaterSurfaceDynamics.Mix(ref hash, previousAngularVelocity.z);
                unchecked { return (hash ^ (uint)revision ^ random) * 1099511628211UL; }
            }
        }
        public void SetVisible(bool value) { visible = value; root.SetActive(value && Count > 0); }
        float Random01() { random ^= random << 13; random ^= random >> 17; random ^= random << 5; return (random & 0xffffff) / 16777216f; }
        static Vector3 Abs(Vector3 v) { return new Vector3(Mathf.Abs(v.x), Mathf.Abs(v.y), Mathf.Abs(v.z)); }
        static Vector3 Clamp(Vector3 point, Vector3 half)
        { return new Vector3(Mathf.Clamp(point.x, -half.x, half.x), Mathf.Clamp(point.y, -half.y, half.y), Mathf.Clamp(point.z, -half.z, half.z)); }
        static Vector3[] BuildSphere()
        {
            var points = new Vector3[26]; points[0] = Vector3.up; points[25] = Vector3.down;
            for (int ring = 0; ring < 3; ring++) for (int i = 0; i < 8; i++)
            {
                float latitude = (ring + 1) * Mathf.PI * .25f, angle = i * Mathf.PI * .25f;
                points[1 + ring * 8 + i] = new Vector3(Mathf.Cos(angle) * Mathf.Sin(latitude), Mathf.Cos(latitude), Mathf.Sin(angle) * Mathf.Sin(latitude));
            }
            return points;
        }
        static int[] BuildSphereTriangles()
        {
            var triangles = new List<int>(144);
            for (int i = 0; i < 8; i++)
            {
                int n = (i + 1) % 8;
                triangles.Add(0); triangles.Add(1 + n); triangles.Add(1 + i);
                for (int ring = 0; ring < 2; ring++)
                {
                    int a = 1 + ring * 8 + i, b = 1 + ring * 8 + n, c = a + 8, d = b + 8;
                    triangles.Add(a); triangles.Add(b); triangles.Add(c); triangles.Add(b); triangles.Add(d); triangles.Add(c);
                }
                triangles.Add(25); triangles.Add(17 + i); triangles.Add(17 + n);
            }
            return triangles.ToArray();
        }
        public void Dispose() { Destroy(mesh); Destroy(material); Destroy(root); }
        static void Destroy(UnityEngine.Object value) { if (value == null) return; if (Application.isPlaying) UnityEngine.Object.Destroy(value); else UnityEngine.Object.DestroyImmediate(value); }
    }
}
