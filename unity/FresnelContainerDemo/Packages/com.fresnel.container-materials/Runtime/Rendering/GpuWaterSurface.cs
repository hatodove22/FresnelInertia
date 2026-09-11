using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.Materials
{
    /// <summary>Optional desktop water renderer. Accepted particle positions are reconstructed
    /// into a GPU density field; the material raymarches that field and writes the real hit depth.
    /// It has no Update method, time source, physics integration or actuator connection.</summary>
    public sealed class GpuWaterSurface : IDisposable
    {
        public struct FieldValidation
        {
            public bool Success;
            public string Issue;
            public int Revision, Voxels, OccupiedVoxels;
            public float MinimumDensity, MaximumDensity;
            public ulong Hash;
        }
        readonly GameObject root;
        readonly MeshFilter filter;
        readonly MeshRenderer renderer;
        readonly Mesh proxy;
        readonly Material material;
        readonly ComputeShader compute;
        readonly CommandBuffer commands;
        readonly int columnKernel, volumeKernel, densityKernel;
        ComputeBuffer level;
        readonly WaterSurfaceFit surfaceFit=new WaterSurfaceFit();
        RenderTexture field, columns;
        Vector3 size;
        int nx,ny,nz,lastCount,columnResolution;
        bool visible=true,configured,disposed;
        const float Iso = 2.8f;
        public int Revision { get; private set; }
        public int VisibleParticleCount { get { return visible ? lastCount : 0; } }
        public Mesh ProxyMesh { get { return proxy; } }
        public RenderTexture DensityTexture { get { return field; } }
        public Transform Root { get { return root == null ? null : root.transform; } }
        internal WaterSurfaceFit SurfaceFit { get { return surfaceFit; } }
        public static bool IsSupported
        {
            get
            {
                var device=SystemInfo.graphicsDeviceType;
                return !Application.isMobilePlatform && SystemInfo.supportsComputeShaders && SystemInfo.supports3DTextures &&
                    SystemInfo.graphicsShaderLevel>=45 && SystemInfo.SupportsRandomWriteOnRenderTextureFormat(RenderTextureFormat.RGFloat) &&
                    (device==GraphicsDeviceType.Direct3D11 || device==GraphicsDeviceType.Direct3D12 || device==GraphicsDeviceType.Metal || device==GraphicsDeviceType.Vulkan);
            }
        }
        public GpuWaterSurface(Transform parent)
        {
            if(!IsSupported)throw new NotSupportedException("GPU water requires desktop compute shaders and a writable 3D RGFloat texture.");
            var shader=Resources.Load<Shader>("FresnelWaterVolume");
            var source=Resources.Load<ComputeShader>("FresnelWaterDensity");
            if(shader==null || !shader.isSupported || source==null)throw new NotSupportedException("GPU water shader resources are unavailable on this graphics device.");
            compute=UnityEngine.Object.Instantiate(source);
            commands=new CommandBuffer{name="Fresnel water reconstruction"};
            columnKernel=compute.FindKernel("BuildColumns"); volumeKernel=compute.FindKernel("ResolveVolume"); densityKernel=compute.FindKernel("BuildDensity");
            material=new Material(shader){name="Fresnel GPU water surface"};
            level=new ComputeBuffer(1,4);
            compute.SetBuffer(volumeKernel,"_Level",level);compute.SetBuffer(densityKernel,"_Level",level);
            root=new GameObject("Fresnel GPU water field");root.transform.SetParent(parent,false);
            filter=root.AddComponent<MeshFilter>();renderer=root.AddComponent<MeshRenderer>();
            renderer.sharedMaterial=material;renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
            proxy=new Mesh{name="GPU water ray bounds (not the fluid surface)"};filter.sharedMesh=proxy;
            root.SetActive(false);
        }
        public void Configure(Vector3 dimensions,MaterialQuality quality)
        {
            if(disposed)throw new ObjectDisposedException(nameof(GpuWaterSurface));
            if(!Finite(dimensions.x)||!Finite(dimensions.y)||!Finite(dimensions.z)||dimensions.x<=0||dimensions.y<=0||dimensions.z<=0)
                throw new ArgumentOutOfRangeException(nameof(dimensions));
            size=dimensions;surfaceFit.ResetDynamics();int resolution=quality==MaterialQuality.High?80:64;
            float spacing=Mathf.Max(size.x,Mathf.Max(size.y,size.z))/resolution;
            nx=Mathf.Max(4,Mathf.CeilToInt(size.x/spacing));ny=Mathf.Max(4,Mathf.CeilToInt(size.y/spacing));nz=Mathf.Max(4,Mathf.CeilToInt(size.z/spacing));
            if(field!=null){field.Release();Destroy(field);}
            if(columns!=null){columns.Release();Destroy(columns);}
            field=new RenderTexture(nx,ny,0,RenderTextureFormat.RGFloat,RenderTextureReadWrite.Linear){
                name="Fresnel accepted particle density",dimension=TextureDimension.Tex3D,volumeDepth=nz,
                enableRandomWrite=true,useMipMap=false,autoGenerateMips=false,wrapMode=TextureWrapMode.Clamp,filterMode=FilterMode.Bilinear};
            if(!field.Create())throw new NotSupportedException("The GPU could not allocate a writable water field.");
            columnResolution=quality==MaterialQuality.High?64:48;
            columns=new RenderTexture(columnResolution,columnResolution,0,RenderTextureFormat.ARGBFloat,RenderTextureReadWrite.Linear){
                name="Fresnel particle-volume free surface",enableRandomWrite=true,useMipMap=false,
                wrapMode=TextureWrapMode.Clamp,filterMode=FilterMode.Bilinear};
            if(!columns.Create())throw new NotSupportedException("The GPU could not allocate the free-surface columns.");
            material.SetTexture("_DensityField",field);material.SetVector("_VesselSize",size);
            material.SetVector("_Grid",new Vector4(nx,ny,nz,0));material.SetFloat("_Iso",Iso);
            compute.SetInts("_Grid",nx,ny,nz);compute.SetVector("_VesselSize",size);compute.SetFloat("_Iso",Iso);
            compute.SetInt("_ColumnResolution",columnResolution);
            compute.SetTexture(columnKernel,"_ColumnOutput",columns);
            compute.SetTexture(volumeKernel,"_ColumnInput",columns);
            compute.SetTexture(densityKernel,"_DensityOutput",field);
            BuildProxy();lastCount=0;configured=true;root.SetActive(false);
        }
        public void Render(ContainerSimulation simulation,MaterialFrame frame)
        {
            if(disposed)throw new ObjectDisposedException(nameof(GpuWaterSurface));
            if(!configured)throw new InvalidOperationException("Configure the GPU water field first.");
            if(simulation==null||simulation.Kind!=MaterialKind.Water)throw new ArgumentException("GPU water accepts a water simulation.",nameof(simulation));
            int count=simulation.Count;
            surfaceFit.Solve(simulation,frame);
            Vector3 up=surfaceFit.Up,axisU=surfaceFit.AxisU,axisV=surfaceFit.AxisV;
            float extentU=surfaceFit.ExtentU,extentV=surfaceFit.ExtentV,extentUp=surfaceFit.ExtentUp;
            float distanceScale=Mathf.Max(.00001f,extentUp*2);
            compute.SetInt("_ParticleCount",count);
            compute.SetVector("_Up",up);compute.SetVector("_AxisU",axisU);compute.SetVector("_AxisV",axisV);
            compute.SetVector("_Projection",new Vector4(extentU,extentV,extentUp,0));
            compute.SetVector("_Plane",surfaceFit.Plane);compute.SetFloat("_BaseLevel",surfaceFit.BaseLevel);
            compute.SetVector("_Waves",surfaceFit.Waves);
            compute.SetFloat("_MeanSpeed",surfaceFit.MeanSpeed);
            compute.SetFloat("_TargetVolume",count==0?0:Mathf.Clamp01(frame.Fill)*size.x*size.y*size.z);
            compute.SetFloat("_DistanceScale",distanceScale);material.SetFloat("_DistanceScale",distanceScale);
            commands.Clear();
            commands.BeginSample("Fresnel Water / particle columns");
            commands.DispatchCompute(compute,columnKernel,(columnResolution+7)/8,(columnResolution+7)/8,1);
            commands.EndSample("Fresnel Water / particle columns");
            commands.BeginSample("Fresnel Water / volume solve");
            commands.DispatchCompute(compute,volumeKernel,1,1,1);
            commands.EndSample("Fresnel Water / volume solve");
            commands.BeginSample("Fresnel Water / implicit field");
            commands.DispatchCompute(compute,densityKernel,(nx+3)/4,(ny+3)/4,(nz+3)/4);
            commands.EndSample("Fresnel Water / implicit field");
            Graphics.ExecuteCommandBuffer(commands);
            material.SetVector("_AcceptedUp",up);
            surfaceFit.ApplyToMaterial(material);
            if(count==0)proxy.Clear();else if(proxy.vertexCount==0)BuildProxy();
            lastCount=count;Revision++;root.SetActive(visible&&count>0);
        }
        public void SetVisible(bool value){visible=value;if(root!=null)root.SetActive(value&&configured&&lastCount>0);}
        /// <summary>Blocking GPU readback for explicit QA only. Never called by the renderer.
        /// Validates the actual dispatched field, not the proxy box; hash can prove stale-field freezing.</summary>
        public FieldValidation ValidateFieldForTesting()
        {
            var result=new FieldValidation{Revision=Revision,MinimumDensity=float.PositiveInfinity,MaximumDensity=float.NegativeInfinity,Hash=1469598103934665603UL};
            if(disposed||field==null||!configured){result.Issue="No configured GPU field.";return result;}
            if(!SystemInfo.supportsAsyncGPUReadback){result.Issue="GPU readback is unavailable.";return result;}
            var request=AsyncGPUReadback.Request(field,0);request.WaitForCompletion();
            if(request.hasError){result.Issue="GPU density readback failed.";return result;}
            for(int layer=0;layer<request.layerCount;layer++)
            {
                var data=request.GetData<Vector2>(layer);
                for(int i=0;i<data.Length;i++)
                {
                    Vector2 sample=data[i];result.Voxels++;
                    if(!Finite(sample.x)||!Finite(sample.y)||sample.x<0){result.Issue="Non-finite or negative GPU density.";return result;}
                    result.MinimumDensity=Mathf.Min(result.MinimumDensity,sample.x);result.MaximumDensity=Mathf.Max(result.MaximumDensity,sample.x);
                    if(sample.x>=Iso)result.OccupiedVoxels++;
                    unchecked{result.Hash=(result.Hash^(uint)BitConverter.SingleToInt32Bits(sample.x))*1099511628211UL;result.Hash=(result.Hash^(uint)BitConverter.SingleToInt32Bits(sample.y))*1099511628211UL;}
                }
            }
            if(result.Voxels!=nx*ny*nz){result.Issue="GPU readback voxel count disagrees with field dimensions.";return result;}
            if(lastCount>0&&result.OccupiedVoxels==0){result.Issue="Non-empty particle input produced an empty GPU surface.";return result;}
            if(lastCount==0&&result.OccupiedVoxels!=0){result.Issue="Empty particle input retained occupied GPU cells.";return result;}
            result.Success=true;result.Issue="";return result;
        }
        void BuildProxy()
        {
            Vector3 h=size*.5f;
            proxy.Clear();proxy.vertices=new[]{new Vector3(-h.x,-h.y,-h.z),new Vector3(h.x,-h.y,-h.z),new Vector3(h.x,h.y,-h.z),new Vector3(-h.x,h.y,-h.z),
                new Vector3(-h.x,-h.y,h.z),new Vector3(h.x,-h.y,h.z),new Vector3(h.x,h.y,h.z),new Vector3(-h.x,h.y,h.z)};
            proxy.triangles=new[]{0,2,1,0,3,2,4,5,6,4,6,7,0,4,7,0,7,3,1,2,6,1,6,5,0,1,5,0,5,4,3,7,6,3,6,2};
            proxy.RecalculateNormals();proxy.bounds=new Bounds(Vector3.zero,size);
        }
        static bool Finite(float v){return !float.IsNaN(v)&&!float.IsInfinity(v);}
        static float ProjectionExtent(Vector3 axis,Vector3 half){return Mathf.Abs(axis.x)*half.x+Mathf.Abs(axis.y)*half.y+Mathf.Abs(axis.z)*half.z;}
        public void Dispose()
        {
            if(disposed)return;disposed=true;level?.Dispose();commands?.Dispose();
            if(field!=null){field.Release();Destroy(field);}if(columns!=null){columns.Release();Destroy(columns);}
            Destroy(proxy);Destroy(material);Destroy(compute);Destroy(root);
        }
        static void Destroy(UnityEngine.Object value){if(value==null)return;if(Application.isPlaying)UnityEngine.Object.Destroy(value);else UnityEngine.Object.DestroyImmediate(value);}
    }

    /// <summary>Low-order free surface fitted to the real particle cloud. A hydrostatic
    /// volume determines equilibrium; aggregate COM displacement supplies inertial slope.
    /// Coherent mean velocity supplies bounded broad curvature. Accepted solver steps
    /// drive damped surface modes; there is no independent animation clock.</summary>
    internal sealed class WaterSurfaceFit
    {
        const int Resolution=16;
        readonly float[] bottoms=new float[Resolution*Resolution],tops=new float[Resolution*Resolution],
            us=new float[Resolution*Resolution],vs=new float[Resolution*Resolution],heights=new float[Resolution*Resolution];
        readonly WaterSurfaceDynamics dynamics=new WaterSurfaceDynamics();
        public Vector3 Up,AxisU,AxisV;
        public Vector3 MeanVelocity;
        public float ExtentU,ExtentV,ExtentUp,BaseLevel,MeanSpeed;
        public Vector4 Plane;
        public Vector4 Waves { get { return dynamics.Modes; } }
        public Vector4 WaveSpeeds { get { return dynamics.Speeds; } }
        public float DynamicEnergy { get { return dynamics.Energy; } }
        public float Activity { get { return dynamics.Activity; } }
        public ulong DynamicStateHash { get { return dynamics.StateHash; } }
        public void ResetDynamics(){dynamics.Reset();}
        public void Solve(ContainerSimulation simulation,MaterialFrame frame)
        {
            Vector3 size=simulation.Size,half=size*.5f;
            Up=frame.Gravity.sqrMagnitude>.00001f?-frame.Gravity.normalized:Vector3.up;
            AxisU=Vector3.Cross(Up,Mathf.Abs(Up.z)<.85f?Vector3.forward:Vector3.right).normalized;AxisV=Vector3.Cross(Up,AxisU).normalized;
            ExtentU=Extent(AxisU,half);ExtentV=Extent(AxisV,half);ExtentUp=Extent(Up,half);
            float area=4*ExtentU*ExtentV/(Resolution*Resolution),volume=Mathf.Clamp01(frame.Fill)*size.x*size.y*size.z;
            for(int y=0;y<Resolution;y++)for(int x=0;x<Resolution;x++)
            {
                int i=x+y*Resolution;us[i]=((x+.5f)/Resolution-.5f)*ExtentU*2;vs[i]=((y+.5f)/Resolution-.5f)*ExtentV*2;
                float bottom,top;Bounds(size,Up,AxisU,AxisV,us[i],vs[i],out bottom,out top);
                bottoms[i]=bottom;tops[i]=Mathf.Max(bottom,top);
            }
            float lo=-ExtentUp,hi=ExtentUp;
            for(int iteration=0;iteration<12;iteration++)
            {
                float mid=(lo+hi)*.5f,sum=0;
                for(int i=0;i<bottoms.Length;i++)sum+=Mathf.Clamp(mid-bottoms[i],0,tops[i]-bottoms[i])*area;
                if(sum<volume)lo=mid;else hi=mid;
            }
            BaseLevel=(lo+hi)*.5f;Plane=Vector4.zero;MeanSpeed=0;MeanVelocity=Vector3.zero;
            if(simulation.Count==0||volume<=0){dynamics.Advance(simulation,frame,Vector3.zero,Up,AxisU,AxisV,ExtentU,ExtentV);return;}
            float sumVolume=0,massU=0,massV=0,freeArea=0,su=0,sv=0,suu=0,svv=0,suv=0;
            for(int i=0;i<bottoms.Length;i++)
            {
                float depth=Mathf.Clamp(BaseLevel-bottoms[i],0,tops[i]-bottoms[i]),w=depth*area;
                sumVolume+=w;massU+=us[i]*w;massV+=vs[i]*w;
                if(BaseLevel>bottoms[i]&&BaseLevel<tops[i])
                {
                    freeArea+=area;su+=us[i]*area;sv+=vs[i]*area;suu+=us[i]*us[i]*area;svv+=vs[i]*vs[i]*area;suv+=us[i]*vs[i]*area;
                }
            }
            if(freeArea<1e-12f||sumVolume<1e-15f){dynamics.Reset();return;}
            Vector3 center=Vector3.zero,velocity=Vector3.zero;
            for(int i=0;i<simulation.Count;i++){center+=simulation.Positions[i];velocity+=simulation.Velocities[i];}
            center/=simulation.Count;velocity/=simulation.Count;MeanVelocity=velocity;MeanSpeed=velocity.magnitude;
            float du=Vector3.Dot(center,AxisU)-massU/sumVolume,dv=Vector3.Dot(center,AxisV)-massV/sumVolume;
            float deadZone=simulation.ParticleRadius*.10f;
            du-=Mathf.Clamp(du,-deadZone,deadZone);dv-=Mathf.Clamp(dv,-deadZone,deadZone);
            float cuu=suu-su*su/freeArea,cvv=svv-sv*sv/freeArea,cuv=suv-su*sv/freeArea;
            float determinant=cuu*cvv-cuv*cuv;
            float a=0,b=0;
            if(determinant>1e-25f){a=volume*(du*cvv-dv*cuv)/determinant;b=volume*(dv*cuu-du*cuv)/determinant;}
            Vector2 slope=Vector2.ClampMagnitude(new Vector2(a,b),.65f);
            float amplitude=Mathf.Min(size.x,Mathf.Min(size.y,size.z))*.08f;
            float curveU=Mathf.Clamp(Vector3.Dot(velocity,AxisU)*.12f,-amplitude,amplitude);
            float curveV=Mathf.Clamp(Vector3.Dot(velocity,AxisV)*.12f,-amplitude,amplitude);
            if(MeanSpeed<.002f)curveU=curveV=0;
            Plane=new Vector4(slope.x,slope.y,curveU,curveV);
            dynamics.Advance(simulation,frame,velocity,Up,AxisU,AxisV,ExtentU,ExtentV);
            // Under a strong burst the dynamic modes carry the readable slosh.
            // Avoid counting the same bulk motion twice as a dominant rigid plane.
            float modalBlend=Mathf.SmoothStep(0,1,Mathf.InverseLerp(.12f,.72f,dynamics.Activity));
            Plane.x*=Mathf.Lerp(1,.55f,modalBlend);Plane.y*=Mathf.Lerp(1,.55f,modalBlend);
            // The detail layer needs the same volume-conserving surface as the
            // renderer. Its coarse correction is refined by each backend's grid.
            for(int i=0;i<heights.Length;i++)heights[i]=Height(us[i],vs[i]);
            lo=-ExtentUp*2;hi=ExtentUp*2;
            for(int iteration=0;iteration<12;iteration++)
            {
                float mid=(lo+hi)*.5f,sum=0;
                for(int i=0;i<heights.Length;i++)sum+=Mathf.Clamp(heights[i]+mid-bottoms[i],0,tops[i]-bottoms[i])*area;
                if(sum<volume)lo=mid;else hi=mid;
            }
            BaseLevel+=(lo+hi)*.5f;
        }
        public float Height(float u,float v)
        {
            float a=Mathf.Clamp(u/ExtentU,-1,1),b=Mathf.Clamp(v/ExtentV,-1,1);
            float height=BaseLevel+Plane.x*u+Plane.y*v+Plane.z*a*(1-a*a)+Plane.w*b*(1-b*b);
            Vector4 waves=Waves;
            if(waves.sqrMagnitude>0)
            {
                float su=Mathf.Sin(a*Mathf.PI*.5f),sv=Mathf.Sin(b*Mathf.PI*.5f);
                height+=waves.x*su+waves.y*sv+waves.z*su*sv+waves.w*Mathf.Cos(a*Mathf.PI);
            }
            return height;
        }
        public Vector3 Normal(float u,float v)
        {
            float a=Mathf.Clamp(u/ExtentU,-1,1),b=Mathf.Clamp(v/ExtentV,-1,1);
            Vector4 waves=Waves;
            float du=Plane.x+Plane.z*(1-3*a*a)/ExtentU;
            float dv=Plane.y+Plane.w*(1-3*b*b)/ExtentV;
            du+=(waves.x+waves.z*Mathf.Sin(b*Mathf.PI*.5f))*Mathf.Cos(a*Mathf.PI*.5f)*Mathf.PI*.5f/ExtentU-
                waves.w*Mathf.Sin(a*Mathf.PI)*Mathf.PI/ExtentU;
            dv+=(waves.y+waves.z*Mathf.Sin(a*Mathf.PI*.5f))*Mathf.Cos(b*Mathf.PI*.5f)*Mathf.PI*.5f/ExtentV;
            return (Up-AxisU*du-AxisV*dv).normalized;
        }
        public void ApplyToMaterial(Material material)
        {
            material.SetVector("_SurfaceUp",Up);material.SetVector("_SurfaceU",AxisU);material.SetVector("_SurfaceV",AxisV);
            material.SetVector("_SurfaceExtent",new Vector4(ExtentU,ExtentV,0,0));
            material.SetVector("_SurfacePlane",Plane);material.SetVector("_SurfaceWaves",Waves);
            material.SetVector("_SurfaceVisual",new Vector4(Activity,dynamics.CrestExcitation,0,0));
        }
        public static bool Bounds(Vector3 size,Vector3 up,Vector3 axisU,Vector3 axisV,float u,float v,out float bottom,out float top)
        {
            Vector3 p=axisU*u+axisV*v,half=size*.5f;bottom=-size.magnitude*2;top=size.magnitude*2;
            for(int axis=0;axis<3;axis++)
            {
                if(Mathf.Abs(up[axis])<.000001f){if(Mathf.Abs(p[axis])>half[axis]){top=bottom;return false;}continue;}
                float a=(-half[axis]-p[axis])/up[axis],b=(half[axis]-p[axis])/up[axis];
                bottom=Mathf.Max(bottom,Mathf.Min(a,b));top=Mathf.Min(top,Mathf.Max(a,b));
            }
            return top>bottom;
        }
        static float Extent(Vector3 axis,Vector3 half){return Mathf.Abs(axis.x)*half.x+Mathf.Abs(axis.y)*half.y+Mathf.Abs(axis.z)*half.z;}
    }
}
