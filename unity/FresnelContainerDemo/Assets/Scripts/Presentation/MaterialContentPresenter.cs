using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.UnityDemo.Presentation
{
    /// <summary>State-driven material sculpture. Apply is the only animation entry point:
    /// there is no Update, PhysX body, internal beat clock, collision or actuator command.
    /// Mesh waves and decorative grains illustrate aggregate telemetry, not CFD or grain tracking.</summary>
    public sealed class MaterialContentPresenter : IDisposable
    {
        public enum ContentKind { Marble, Water, Sand, Heartbeat }
        public ContentKind Kind { get; private set; }
        public Transform Root { get; private set; }
        public bool IsStale { get; private set; }
        public int AppliedSamples { get; private set; }
        public float ObservedFill { get { return surface == null ? fill : surface.ObservedFill; } }
        private Vector3 size;
        private string preset;
        private float fill;
        private readonly List<UnityEngine.Object> resources = new List<UnityEngine.Object>();
        private readonly List<Transform> beads = new List<Transform>();
        private readonly List<LineRenderer> contours = new List<LineRenderer>();
        private BoundedSurface surface;
        private Mesh topMesh, bodyMesh, heartMesh;
        private Material mainMaterial, topMaterial;
        private Transform focal, halo;
        private Vector3[] heartBase;
        private Vector3[] heartDeformed;
        private LineRenderer impulseTrace;
        private readonly Queue<Vector3> trace = new Queue<Vector3>();
        private double? lastTime;
        private ulong lastCounter;
        private float marbleRadius;
        private Texture2D sandTexture;
        private ContentFrame lastApplied;

        public MaterialContentPresenter(Transform parent)
        {
            Root = new GameObject("Shared-state material").transform;
            Root.SetParent(parent, false);
        }

        public void Configure(string name, Vector3 actualSize, float actualFill)
        {
            if (!ValidSize(actualSize)) throw new ArgumentOutOfRangeException(nameof(actualSize), "Resolved metric dimensions must be positive and finite.");
            if (preset == name && (size - actualSize).sqrMagnitude < 1e-14f)
            {
                float nextFill = Mathf.Clamp01(actualFill);
                if (nextFill != fill && lastApplied != null && surface != null && !IsStale)
                {
                    fill = nextFill;
                    ContentFrame configuration = lastApplied.Copy(); configuration.Fill = fill;
                    // A confirmed fill change redraws the held shape at its existing phase.
                    ApplyVolume(configuration);
                }
                fill = nextFill; return;
            }
            Clear();
            preset = name ?? "unknown"; size = actualSize; fill = Mathf.Clamp01(actualFill);
            Kind = KindForPreset(preset);
            if (Kind == ContentKind.Marble) BuildMarble();
            else if (Kind == ContentKind.Heartbeat) BuildHeart();
            else BuildVolume();
        }

        public static ContentKind KindForPreset(string name)
        {
            string lower = (name ?? "").ToLowerInvariant();
            return lower.Contains("marble") ? ContentKind.Marble : lower.Contains("heart") ? ContentKind.Heartbeat :
                lower.Contains("sand") || lower.Contains("granular") ? ContentKind.Sand :
                lower.Contains("liquid") || lower.Contains("water") || lower.Contains("soda") || lower.Contains("viscous") ? ContentKind.Water : ContentKind.Marble;
        }

        public void SetStale(bool stale) { IsStale = stale; }

        public void Apply(ContentFrame frame)
        {
            if (frame == null || IsStale || !frame.HasMotion || !ValidSize(size)) return;
            // Duplicate rendering calls and ACK-only updates cannot keep a visual effect alive.
            if (lastTime.HasValue && lastTime.Value == frame.SourceTimeS && lastCounter == frame.FrameCounter) return;
            if (!frame.IsFreshMotion && lastTime.HasValue) return;
            bool rebase = frame.SourceStep == SourceStep.Initial || frame.SourceStep == SourceStep.Gap ||
                frame.SourceStep == SourceStep.Rewind || !lastTime.HasValue;
            if (rebase) trace.Clear();
            fill = Mathf.Clamp01(frame.Fill);
            Root.gameObject.SetActive(true);
            if (Kind == ContentKind.Marble) ApplyMarble(frame);
            else if (Kind == ContentKind.Heartbeat) ApplyHeart(frame);
            else ApplyVolume(frame);
            lastTime = frame.SourceTimeS; lastCounter = frame.FrameCounter;
            lastApplied = frame.Copy();
            AppliedSamples++;
        }

        private void BuildMarble()
        {
            marbleRadius = Mathf.Min(size.x, size.y, size.z) * .085f;
            mainMaterial = Material("Polished jade glass", new Color(.04f, .45f, .44f), .65f, .93f);
            focal = Sphere("One reported marble", Root, mainMaterial);
            focal.localScale = Vector3.one * marbleRadius * 2;
            var stripeMaterial = Material("Ivory mineral veins", new Color(.76f, .96f, .84f), .25f, .8f);
            // Fine mineral arcs sit within the sphere's enclosing radius.
            for (int strand = 0; strand < 3; strand++)
            {
                var line = Line("Mineral vein", focal, stripeMaterial, .009f);
                line.positionCount = 65;
                Vector3[] points = new Vector3[65];
                Quaternion rotation = Quaternion.Euler(strand * 49 + 23, strand * 71 + 31, strand * 19);
                for (int i = 0; i < points.Length; i++)
                {
                    float a = i / 64f * Mathf.PI * 2;
                    points[i] = rotation * new Vector3(Mathf.Cos(a), Mathf.Sin(a), .07f * Mathf.Sin(a * 3 + strand)).normalized * .494f;
                }
                line.SetPositions(points);
            }
            var traceMat = Material("Observed travel trace", new Color(.12f, .72f, .62f), .1f, .4f);
            impulseTrace = Line("Recent accepted positions", Root, traceMat, size.x * .0035f);
        }

        private void ApplyMarble(ContentFrame frame)
        {
            focal.localPosition = PresentationMath.MarblePosition(size, frame.MassPosition, marbleRadius);
            // Rotation is a deterministic illustration of accepted position; no integration.
            focal.localRotation = Quaternion.Euler(frame.MassPosition.y * 150, frame.MassPosition.x * 170, frame.MassPosition.x * -100);
            if (trace.Count == 0 || (trace.Peek() - focal.localPosition).sqrMagnitude > size.sqrMagnitude * .000002f)
            {
                trace.Enqueue(focal.localPosition);
                while (trace.Count > 9) trace.Dequeue();
            }
            impulseTrace.positionCount = trace.Count;
            impulseTrace.SetPositions(trace.ToArray());
        }

        private void BuildVolume()
        {
            bool water = Kind == ContentKind.Water;
            mainMaterial = Material(water ? "Deep turquoise liquid" : "Warm compacted sand",
                water ? new Color(.02f, .37f, .48f) : new Color(.53f, .32f, .13f), water ? .15f : 0, water ? .82f : .18f);
            topMaterial = Material(water ? "Specular water surface" : "Fine sand surface",
                water ? new Color(.16f, .75f, .78f) : new Color(.82f, .63f, .32f), water ? .38f : 0, water ? .98f : .13f);
            if (!water)
            {
                sandTexture = GrainTexture(); resources.Add(sandTexture);
                topMaterial.mainTexture = sandTexture; mainMaterial.mainTexture = sandTexture;
                topMaterial.mainTextureScale = new Vector2(3, 3);
            }
            surface = new BoundedSurface();
            topMesh = NewMesh("Contained surface"); bodyMesh = NewMesh("Contained side volume");
            MeshObject("Surface", topMesh, topMaterial, Root);
            MeshObject("Volume", bodyMesh, mainMaterial, Root);
            var bright = Material(water ? "Surface glints" : "Sand crests",
                water ? new Color(.57f, 1f, .95f) : new Color(.95f, .79f, .45f), .1f, water ? .9f : .1f);
            for (int i = 0; i < (water ? 7 : 11); i++) contours.Add(Line("Surface contour " + i, Root, bright, size.y * (water ? .0017f : .0011f)));
            // A restrained layer of actual faceted grains lends scale to the pile.
            if (!water)
            {
                Material[] tones = {
                    Material("Gold grains", new Color(.92f, .71f, .35f), .08f, .23f),
                    Material("Ochre grains", new Color(.55f, .36f, .16f), .05f, .18f),
                    Material("Pale grains", new Color(.96f, .84f, .56f), .05f, .25f)
                };
                Mesh grain = Octahedron(); resources.Add(grain);
                for (int i = 0; i < 132; i++) beads.Add(MeshObject("Decorative surface grain", grain, tones[i % 3], Root));
            }
        }

        private void ApplyVolume(ContentFrame frame)
        {
            bool water = Kind == ContentKind.Water;
            bool inverted = water && frame.HasOrientation && frame.BodyGravity.y < 0;
            Vector3 gravity = frame.HasOrientation ? frame.BodyGravity : Vector3.up;
            float denominator = Mathf.Max(.045f, Mathf.Abs(gravity.y)) * (gravity.y < 0 ? -1 : 1);
            float sx = water ? -gravity.x / denominator - frame.MassPosition.x * .20f : frame.PileSlope ?? frame.MassPosition.x * .3f;
            float sz = water ? gravity.z / denominator : 0;
            float energy = water ? Mathf.Clamp01(frame.Energy + frame.Velocity.magnitude * .10f) : frame.GranularFlow ?? 0;
            float phase = (float)(frame.SourceTimeS % 1000d) * (water ? 5.2f : 2f);
            float actualFill = frame.Pressure == null ? fill : fill * frame.Pressure.Remaining;
            surface.Update(size, actualFill, sx, sz, size.y * energy * (water ? .16f : .018f), phase, inverted);
            surface.WriteMeshes(topMesh, bodyMesh);
            // A fully filled vessel has no free-surface glints, an empty one has no volume.
            Root.gameObject.SetActive(actualFill > .00001f);
            for (int lineIndex = 0; lineIndex < contours.Count; lineIndex++)
            {
                var line = contours[lineIndex];
                bool visible = actualFill > .005f && actualFill < .995f;
                line.gameObject.SetActive(visible);
                if (!visible) continue;
                const int count = 40;
                line.positionCount = count;
                float nz = (lineIndex + 1f) / (contours.Count + 1);
                for (int i = 0; i < count; i++)
                {
                    float nx = .035f + .93f * i / (count - 1f);
                    float x = (nx - .5f) * size.x;
                    float z = (nz - .5f) * size.z;
                    if (!water) z += Mathf.Sin(nx * 12 + lineIndex * .9f) * size.z * .008f;
                    float y = surface.HeightAt(x, z);
                    // Keep the thin decorative stroke inside the physical bounds too.
                    y = Mathf.Clamp(y + (inverted ? -1 : 1) * size.y * .0008f, -size.y * .499f, size.y * .499f);
                    line.SetPosition(i, new Vector3(x, y, z));
                }
            }
            if (!water)
            {
                for (int i = 0; i < beads.Count; i++)
                {
                    float radius = Mathf.Min(size.x, size.y, size.z) * (.004f + Hash(i * 13 + 2) * .003f);
                    float nx = .025f + Hash(i * 17 + 9) * .95f;
                    float nz = .025f + Hash(i * 29 + 5) * .95f;
                    float x = (nx - .5f) * (size.x - radius * 2), z = (nz - .5f) * (size.z - radius * 2);
                    float h = surface.HeightAt(x, z);
                    beads[i].gameObject.SetActive(h > -size.y * .5f + radius * 2 && h < size.y * .5f - radius);
                    beads[i].localPosition = new Vector3(x, Mathf.Clamp(h, -size.y * .5f + radius, size.y * .5f - radius), z);
                    beads[i].localScale = Vector3.one * radius;
                    beads[i].localRotation = Quaternion.Euler(i * 113, i * 61, i * 173);
                }
            }
        }

        private void BuildHeart()
        {
            mainMaterial = Material("Soft carmine", new Color(.69f, .055f, .15f), .16f, .71f);
            mainMaterial.EnableKeyword("_EMISSION");
            heartMesh = NewMesh("Sculpted shared pulse");
            const int rings = 24, segments = 64;
            heartBase = new Vector3[(rings + 1) * (segments + 1)];
            heartDeformed = new Vector3[heartBase.Length];
            int[] triangles = new int[rings * segments * 6]; int t = 0;
            for (int ring = 0; ring <= rings; ring++)
            {
                float latitude = ((float)ring / rings - .5f) * Mathf.PI;
                float radius = Mathf.Cos(latitude);
                for (int segment = 0; segment <= segments; segment++)
                {
                    float a = (float)segment / segments * Mathf.PI * 2;
                    float x = Mathf.Pow(Mathf.Sin(a), 3);
                    float y = (13 * Mathf.Cos(a) - 5 * Mathf.Cos(2 * a) - 2 * Mathf.Cos(3 * a) - Mathf.Cos(4 * a)) / 17;
                    heartBase[ring * (segments + 1) + segment] = new Vector3(x * radius * size.x * .34f,
                        (y * radius + .10f) * size.y * .36f, Mathf.Sin(latitude) * size.z * .30f);
                    if (ring < rings && segment < segments)
                    {
                        int i = ring * (segments + 1) + segment;
                        triangles[t++] = i; triangles[t++] = i + segments + 1; triangles[t++] = i + 1;
                        triangles[t++] = i + 1; triangles[t++] = i + segments + 1; triangles[t++] = i + segments + 2;
                    }
                }
            }
            heartMesh.vertices = heartBase; heartMesh.triangles = triangles; heartMesh.RecalculateNormals(); heartMesh.RecalculateBounds();
            focal = MeshObject("Fictional pulse body", heartMesh, mainMaterial, Root);
            var traceMaterial = Material("Pulse contour", new Color(1f, .41f, .36f), .2f, .65f);
            traceMaterial.EnableKeyword("_EMISSION"); traceMaterial.SetColor("_EmissionColor", new Color(.25f, .025f, .02f));
            impulseTrace = Line("Shared contraction outline", Root, traceMaterial, size.x * .004f);
            impulseTrace.positionCount = 65;
            var haloMaterial = Material("Pulse nucleus", new Color(1f, .64f, .45f), .1f, .85f);
            halo = Sphere("Primary envelope nucleus", Root, haloMaterial);
            halo.localScale = Vector3.one * Mathf.Min(size.x, size.y, size.z) * .05f;
        }

        private void ApplyHeart(ContentFrame frame)
        {
            // Legacy telemetry has no heartbeat: present an inert object, never guess a beat.
            float contraction = frame.Heartbeat == null ? 0 : Mathf.Clamp01(frame.Heartbeat.Contraction);
            float primary = frame.Heartbeat == null ? 0 : Mathf.Clamp01(frame.Heartbeat.Primary);
            float secondary = frame.Heartbeat == null ? 0 : Mathf.Clamp01(frame.Heartbeat.Secondary);
            float sx = 1 - contraction * .105f, sy = 1 + contraction * .06f, sz = 1 - contraction * .07f;
            for (int i = 0; i < heartBase.Length; i++)
            {
                Vector3 v = heartBase[i];
                float asymmetric = 1 + secondary * .025f * Mathf.Clamp(v.x / size.x * 3, -1, 1);
                heartDeformed[i] = new Vector3(v.x * sx * asymmetric, v.y * sy, v.z * sz);
            }
            heartMesh.vertices = heartDeformed; heartMesh.RecalculateNormals(); heartMesh.RecalculateBounds();
            mainMaterial.SetColor("_EmissionColor", new Color(.55f, .014f, .026f) * (primary * .28f + secondary * .16f));
            for (int i = 0; i < 65; i++)
            {
                float a = i / 64f * Mathf.PI * 2;
                float x = Mathf.Pow(Mathf.Sin(a), 3) * size.x * .34f * sx;
                float y = ((13 * Mathf.Cos(a) - 5 * Mathf.Cos(2 * a) - 2 * Mathf.Cos(3 * a) - Mathf.Cos(4 * a)) / 17 + .10f) * size.y * .36f * sy;
                impulseTrace.SetPosition(i, new Vector3(x, y, -size.z * .003f));
            }
            float nucleusRadius = Mathf.Min(size.x, size.y, size.z) * (.04f + primary * .025f + secondary * .012f);
            halo.localScale = Vector3.one * nucleusRadius;
            halo.localPosition = new Vector3(-size.x * .04f, size.y * .025f, -size.z * .30f * sz);
        }

        private Material Material(string name, Color color, float metallic, float smoothness)
        {
            var result = new Material(Shader.Find("Standard")) { name = name, color = color };
            result.SetFloat("_Metallic", metallic); result.SetFloat("_Glossiness", smoothness);
            resources.Add(result); return result;
        }
        private Mesh NewMesh(string name)
        {
            var result = new Mesh { name = name }; result.MarkDynamic(); resources.Add(result); return result;
        }
        private static Transform MeshObject(string name, Mesh mesh, Material material, Transform parent)
        {
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false); go.GetComponent<MeshFilter>().sharedMesh = mesh;
            go.GetComponent<MeshRenderer>().sharedMaterial = material;
            return go.transform;
        }
        private static Transform Sphere(string name, Transform parent, Material material)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Sphere); go.name = name;
            go.transform.SetParent(parent, false); UnityEngine.Object.Destroy(go.GetComponent<Collider>());
            go.GetComponent<Renderer>().sharedMaterial = material;
            return go.transform;
        }
        private static LineRenderer Line(string name, Transform parent, Material material, float width)
        {
            var go = new GameObject(name); go.transform.SetParent(parent, false);
            var line = go.AddComponent<LineRenderer>(); line.useWorldSpace = false;
            line.sharedMaterial = material; line.widthMultiplier = width;
            line.numCornerVertices = 3; line.numCapVertices = 3;
            line.shadowCastingMode = ShadowCastingMode.Off; line.receiveShadows = false;
            return line;
        }
        private static float Hash(int seed) { return Mathf.Repeat(Mathf.Sin(seed * 78.233f + 1.2f) * 43758.5453f, 1); }
        private static Texture2D GrainTexture()
        {
            var texture = new Texture2D(128, 128, TextureFormat.RGB24, true) { name = "Procedural mineral grain", wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear };
            Color[] colors = new Color[128 * 128];
            for (int i = 0; i < colors.Length; i++)
            {
                float n = .73f + Hash(i + 77) * .27f;
                if (Hash(i * 7) > .968f) n *= .63f;
                colors[i] = new Color(n, n * .985f, n * .95f);
            }
            texture.SetPixels(colors); texture.Apply(); return texture;
        }
        private static Mesh Octahedron()
        {
            Vector3[] corners = { Vector3.up, Vector3.down, Vector3.left, Vector3.right, Vector3.forward, Vector3.back };
            int[] indices = { 0, 4, 3, 0, 2, 4, 0, 5, 2, 0, 3, 5, 1, 3, 4, 1, 4, 2, 1, 2, 5, 1, 5, 3 };
            var vertices = new Vector3[24]; var triangles = new int[24];
            for (int i = 0; i < 24; i++) { vertices[i] = corners[indices[i]]; triangles[i] = i; }
            var mesh = new Mesh { name = "Faceted visual grain", vertices = vertices, triangles = triangles }; mesh.RecalculateNormals(); return mesh;
        }
        private static bool ValidSize(Vector3 value)
        {
            return value.x > 0 && value.y > 0 && value.z > 0 && !float.IsInfinity(value.x) && !float.IsInfinity(value.y) && !float.IsInfinity(value.z);
        }
        private void Clear()
        {
            for (int i = Root.childCount - 1; i >= 0; i--) { Root.GetChild(i).gameObject.SetActive(false); UnityEngine.Object.Destroy(Root.GetChild(i).gameObject); }
            foreach (var resource in resources) if (resource != null) UnityEngine.Object.Destroy(resource);
            resources.Clear(); beads.Clear(); contours.Clear(); trace.Clear();
            surface = null; focal = halo = null; impulseTrace = null; lastTime = null; lastApplied = null; AppliedSamples = 0;
        }
        public void Dispose() { if (Root != null) { Clear(); UnityEngine.Object.Destroy(Root.gameObject); Root = null; } }
    }
}
