using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.Materials
{
    /// <summary>Built-in pipeline renderer for ContainerSimulation. A connected water surface,
    /// continuous granular bed and bound elastic skin follow the accepted simulation.
    /// Material motion is controlled exclusively by Render and never by a shader clock.</summary>
    public sealed class MaterialRenderer : IDisposable
    {
        readonly GameObject root;
        readonly MeshFilter filter;
        readonly MeshRenderer renderer;
        readonly DensitySurface surface;
        readonly SoftbodySurface elasticSurface;
        readonly GrainBatch grains;
        readonly Transform parent;
        GpuWaterSurface gpuWater;
        WaterDynamicDetails waterDetails;
        bool gpuActive;
        Material water, sand, softbody;
        MaterialKind kind;
        int lastParticleCount;
        bool configured, visible = true;
        /// <summary>CPU fluid surface, or explicitly a ray-bounds proxy when IsGpuWater is true.</summary>
        public Mesh SurfaceMesh { get { return gpuActive ? gpuWater.ProxyMesh : filter == null ? null : filter.sharedMesh; } }
        public bool IsGpuWater { get { return gpuActive; } }
        public GpuWaterSurface GpuWater { get { return gpuActive ? gpuWater : null; } }
        public int VisibleParticleCount { get; private set; }
        public double ReconstructionFieldMs { get { return gpuActive || kind == MaterialKind.Sand ? 0 : kind == MaterialKind.Softbody ? elasticSurface.SkinningMilliseconds : surface.FieldMilliseconds; } }
        public double MeshExtractionMs { get { return gpuActive || kind != MaterialKind.Water ? 0 : surface.ExtractionMilliseconds; } }
        public double MeshUploadMs { get { return gpuActive || kind == MaterialKind.Sand ? 0 : kind == MaterialKind.Softbody ? elasticSurface.UploadMilliseconds : surface.UploadMilliseconds; } }
        public Transform Root { get { return gpuActive ? gpuWater.Root : root == null ? null : root.transform; } }
        WaterSurfaceFit ActiveWaterFit { get { return gpuActive ? gpuWater.SurfaceFit : surface.SurfaceFit; } }
        /// <summary>Visual wave/detail energy in metre-squared units; not physical joules.</summary>
        public float DynamicEnergy { get { return kind == MaterialKind.Water ? ActiveWaterFit.DynamicEnergy + (waterDetails == null ? 0 : waterDetails.Energy) : 0; } }
        public int DetailParticleCount { get { return kind == MaterialKind.Water && waterDetails != null ? waterDetails.Count : 0; } }
        public Mesh DetailMesh { get { return kind == MaterialKind.Water && waterDetails != null ? waterDetails.Mesh : null; } }
        public ulong DynamicStateHash { get { unchecked { return kind == MaterialKind.Water ? (ActiveWaterFit.DynamicStateHash * 1099511628211UL) ^ (waterDetails == null ? 0UL : waterDetails.StateHash) : 0; } } }
        public int SandAirborneCount { get { return kind == MaterialKind.Sand ? grains.LoftedParticleCount : 0; } }
        public int SandVisibleAirborneCount { get { return kind == MaterialKind.Sand ? grains.VisibleLoftedCount : 0; } }
        public float SandBedVolume { get { return kind == MaterialKind.Sand ? grains.BedVolume : 0; } }
        public float SandAirborneVolume { get { return kind == MaterialKind.Sand ? grains.LoftedVolume : 0; } }
        public ulong SandGeometryFingerprint { get { return kind == MaterialKind.Sand ? grains.GeometryFingerprint : 0; } }

        public MaterialRenderer(Transform parent)
        {
            this.parent = parent;
            root = new GameObject("Fresnel material surface"); root.transform.SetParent(parent, false);
            filter = root.AddComponent<MeshFilter>(); renderer = root.AddComponent<MeshRenderer>();
            renderer.receiveShadows = true; renderer.lightProbeUsage = LightProbeUsage.BlendProbes;
            surface = new DensitySurface(); elasticSurface=new SoftbodySurface();grains = new GrainBatch();
        }
        public void Configure(MaterialKind value, Vector3 size, float fill, MaterialQuality quality, bool preferGpuWater = true)
        {
            if (size.x <= 0 || size.y <= 0 || size.z <= 0 || !Finite(size.x) || !Finite(size.y) || !Finite(size.z))
                throw new ArgumentOutOfRangeException(nameof(size), "Vessel dimensions must be finite positive metres.");
            kind = value; configured = true;
            waterDetails?.SetVisible(false);
            if (kind == MaterialKind.Water)
            {
                if (waterDetails == null) waterDetails = new WaterDynamicDetails(parent);
                waterDetails.Configure(size, quality); waterDetails.SetVisible(visible);
            }
            gpuActive = false;
            gpuWater?.SetVisible(false);
            float aspect = Mathf.Min(size.x, Mathf.Min(size.y,size.z)) / Mathf.Max(size.x, Mathf.Max(size.y,size.z));
            if (kind == MaterialKind.Water && preferGpuWater && quality != MaterialQuality.Mobile && aspect >= .08f && GpuWaterSurface.IsSupported)
            {
                try
                {
                    if (gpuWater == null) gpuWater = new GpuWaterSurface(parent);
                    gpuWater.Configure(size, quality); gpuWater.SetVisible(visible); gpuActive = true;
                    root.SetActive(false); VisibleParticleCount = lastParticleCount = 0; return;
                }
                catch (NotSupportedException error)
                {
                    gpuWater?.Dispose(); gpuWater = null;
                    Debug.LogWarning("Fresnel water uses its CPU fallback: " + error.Message);
                }
            }
            if(kind==MaterialKind.Softbody)elasticSurface.Configure(size,quality);
            else if(kind==MaterialKind.Water)surface.Configure(size, quality);
            else grains.Configure(quality);
            if (kind == MaterialKind.Water)
            {
                if (water == null) water = CreateMaterial("FresnelWater", "Fresnel/Container Water");
                water.SetVector("_VesselSize", size); filter.sharedMesh = surface.Mesh; renderer.sharedMaterial = water;
                renderer.shadowCastingMode = ShadowCastingMode.Off;
            }
            else if (kind == MaterialKind.Softbody)
            {
                if (softbody == null) softbody = CreateMaterial("FresnelSoftbody", "Fresnel/Container Softbody");
                softbody.SetVector("_VesselSize", size); filter.sharedMesh = elasticSurface.Mesh; renderer.sharedMaterial = softbody;
                renderer.shadowCastingMode = ShadowCastingMode.On;
            }
            else
            {
                if (sand == null) sand = CreateMaterial("FresnelGrains", "Fresnel/Container Grains");
                filter.sharedMesh = grains.Mesh; renderer.sharedMaterial = sand; renderer.shadowCastingMode = ShadowCastingMode.On;
            }
            VisibleParticleCount = 0; lastParticleCount = 0;
        }
        public void Render(ContainerSimulation simulation, MaterialFrame frame)
        {
            if (simulation == null) throw new ArgumentNullException(nameof(simulation));
            if (!configured) throw new InvalidOperationException("Configure the renderer before rendering.");
            if (simulation.Kind != kind) throw new ArgumentException("Renderer and simulation material kinds must agree.", nameof(simulation));
            // MeshRenderer persists across render frames, including disconnected/stale pauses.
            if (gpuActive)
            {
                gpuWater.Render(simulation, frame);
                waterDetails.Render(simulation, frame, gpuWater.SurfaceFit);
                lastParticleCount = simulation.Count; VisibleParticleCount = gpuWater.VisibleParticleCount;
                root.SetActive(false); return;
            }
            if (kind == MaterialKind.Sand) grains.Rebuild(simulation,frame);
            else if(kind==MaterialKind.Softbody){elasticSurface.Rebuild(simulation,frame);softbody.SetFloat("_Contraction",Mathf.Clamp01(frame.Contraction));}
            else { surface.Rebuild(simulation, frame); surface.SurfaceFit.ApplyToMaterial(water); waterDetails.Render(simulation, frame, surface.SurfaceFit); }
            lastParticleCount = simulation.Count; VisibleParticleCount = visible ? lastParticleCount : 0;
            root.SetActive(visible);
        }
        public void SetVisible(bool value) { visible = value; if (root != null) root.SetActive(value && !gpuActive); gpuWater?.SetVisible(value && gpuActive); waterDetails?.SetVisible(value && kind == MaterialKind.Water); VisibleParticleCount = value ? lastParticleCount : 0; }
        static Material CreateMaterial(string resource, string name)
        {
            Shader shader = Resources.Load<Shader>(resource);
            if (shader == null) shader = Shader.Find(name);
            if (shader == null) throw new InvalidOperationException("Missing package shader: " + name);
            return new Material(shader) { name = name + " instance" };
        }
        static bool Finite(float value) { return !float.IsNaN(value) && !float.IsInfinity(value); }
        public void Dispose()
        {
            gpuWater?.Dispose(); waterDetails?.Dispose(); surface.Dispose(); elasticSurface.Dispose();grains.Dispose(); Destroy(water); Destroy(sand); Destroy(softbody); Destroy(root);
            VisibleParticleCount = 0;
        }
        static void Destroy(UnityEngine.Object value) { if (value == null) return; if (Application.isPlaying) UnityEngine.Object.Destroy(value); else UnityEngine.Object.DestroyImmediate(value); }
    }
}
