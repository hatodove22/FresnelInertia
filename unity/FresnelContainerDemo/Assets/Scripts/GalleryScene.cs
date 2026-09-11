using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using Fresnel.UnityDemo.Presentation;
using Fresnel.Materials;

namespace Fresnel.UnityDemo
{
    // A metric cutaway of the reported vessel. All moving content belongs to the adapter.
    public sealed class GalleryScene : IDisposable
    {
        readonly Camera camera;
        readonly Transform root, vessel, shell;
        readonly Transform servoRig;
        readonly Transform[] measured = new Transform[2], requested = new Transform[2];
        readonly MaterialContentPresenter content;
        readonly StudioEnvironment studio;
        public ContainerMaterialActor Actor { get; private set; }
        readonly Transform massGlyph;
        readonly List<Material> materials = new List<Material>();
        readonly List<Mesh> geometry = new List<Mesh>();
        readonly List<Material> shellMaterials = new List<Material>();
        readonly List<Mesh> shellMeshes = new List<Mesh>();
        Vector3 size;
        Quaternion previousRotation=Quaternion.identity;
        double? previousPoseTime;
        public MaterialContentPresenter Presenter => content;
        public GalleryScene(Camera sceneCamera)
        {
            camera = sceneCamera;
            studio = new StudioEnvironment(camera);
            root = new GameObject("Reported-state gallery").transform;
            vessel = new GameObject("Body XY vessel").transform; vessel.SetParent(root, false);
            shell = new GameObject("Metric cutaway enclosure").transform; shell.SetParent(vessel, false);
            content = new MaterialContentPresenter(vessel);
            var materialObject = new GameObject("Fresnel Container Materials");
            materialObject.transform.SetParent(vessel, false);
            Actor = materialObject.AddComponent<ContainerMaterialActor>();
            Actor.Quality = Application.isMobilePlatform ? MaterialQuality.Mobile : MaterialQuality.Balanced;
            var massObject = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            massObject.name = "Accepted aggregate center (device only)";
            massGlyph = massObject.transform; massGlyph.SetParent(vessel, false);
            massObject.GetComponent<Renderer>().sharedMaterial = Mat(new Color(1,.64f,.21f),.4f,.65f);
            UnityEngine.Object.Destroy(massObject.GetComponent<Collider>());
            massObject.SetActive(false);
            servoRig = new GameObject("Servo shaft readbacks").transform; servoRig.SetParent(root,false);
            var readback=Mat(new Color(.06f,.39f,.37f),.6f,.6f);
            var command=Mat(new Color(.80f,.61f,.31f),.6f,.6f);
            for(int i=0;i<2;i++)
            {
                measured[i]=new GameObject("Measured shaft "+i).transform;measured[i].SetParent(servoRig,false);measured[i].localPosition=new Vector3(0,-.032f,-.035f)+new Vector3(.864f,0,.504f)*((i==0?-1:1)*.026f);
                requested[i]=new GameObject("Goal shaft "+i).transform;requested[i].SetParent(servoRig,false);requested[i].localPosition=measured[i].localPosition+Vector3.down*.0017f;
                Cube("Valid position",measured[i],Vector3.zero,new Vector3(.019f,.001f,.009f),readback);
                Cube("Reported goal",requested[i],Vector3.zero,new Vector3(.021f,.0005f,.011f),command);
            }
            servoRig.gameObject.SetActive(false);
            var floor = Mat(new Color(.91f,.925f,.92f),0,.18f);
            var stone = Mat(new Color(.95f,.945f,.915f),.03f,.4f);
            Cube("Studio floor",root,new Vector3(0,-.057f,0),new Vector3(10,.003f,10),floor);
            var pedestal = new BeveledGeometry();
            pedestal.Box(new Vector3(0,-.051f,0),new Vector3(.145f,.008f,.12f),.003f);
            var pedestalMesh=pedestal.Create("Soft-edged porcelain platform");geometry.Add(pedestalMesh);
            MeshObject("Porcelain display plinth",root,pedestalMesh,stone);
            var contact = new Material(Resources.Load<Shader>("FresnelStudioContact"));materials.Add(contact);
            var contactObject=GameObject.CreatePrimitive(PrimitiveType.Quad);
            contactObject.name="Soft studio contact";contactObject.transform.SetParent(root,false);
            contactObject.transform.localPosition=new Vector3(0,-.0468f,0);
            contactObject.transform.localRotation=Quaternion.Euler(90,0,0);
            contactObject.transform.localScale=new Vector3(.13f,.10f,1);
            contactObject.GetComponent<Renderer>().sharedMaterial=contact;
            contactObject.GetComponent<Renderer>().shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
            UnityEngine.Object.Destroy(contactObject.GetComponent<Collider>());
        }
        public void SetVisible(bool value)
        {
            root.gameObject.SetActive(value);
            studio.SetEnabled(value);
            if (!value) return;
            FitCamera();
        }
        public void Clear()
        {
            previousPoseTime=null;
            vessel.gameObject.SetActive(false);
            servoRig.gameObject.SetActive(false);
            content.SetStale(true);
            Actor.SetStale(true);
        }
        public void SetStale(bool stale) { content.SetStale(stale); Actor.SetStale(stale); if(stale)servoRig.gameObject.SetActive(false); }
        public void Apply(ContentFrame frame, JObject snapshot)
        {
            if (frame == null || !frame.HasResolvedConfiguration) { Clear(); return; }
            vessel.gameObject.SetActive(true);
            if ((size-frame.Size).sqrMagnitude>1e-14f) BuildShell(frame.Size);
            bool rebase=frame.SourceStep==SourceStep.Initial || frame.SourceStep==SourceStep.Rewind || frame.SourceStep==SourceStep.Gap;
            Vector3 angularVelocity=Vector3.zero;
            if(frame.IsFreshMotion && frame.HasMotion)
            {
                if(frame.HasOrientation)
                {
                    if(!rebase && previousPoseTime.HasValue && frame.SourceTimeS>previousPoseTime.Value && frame.SourceTimeS-previousPoseTime.Value<=.5)
                    {
                        Quaternion delta=Quaternion.Inverse(previousRotation)*frame.VesselRotation;
                        if(delta.w<0)delta=new Quaternion(-delta.x,-delta.y,-delta.z,-delta.w);
                        delta.ToAngleAxis(out float angle,out Vector3 axis);
                        if(angle>180)angle-=360;
                        if(axis.sqrMagnitude>.001f && !float.IsInfinity(axis.x))
                            angularVelocity=Vector3.ClampMagnitude(axis*(angle*Mathf.Deg2Rad/(float)(frame.SourceTimeS-previousPoseTime.Value)),30);
                    }
                    vessel.localRotation=frame.VesselRotation;
                    previousRotation=frame.VesselRotation;previousPoseTime=frame.SourceTimeS;
                }
                vessel.localPosition=frame.Source=="device"?Vector3.zero:frame.VisualTranslation;
                FitCamera(frame.Source=="device"?0:frame.VisualMotionStrength);
            }
            var kind = MaterialContentPresenter.KindForPreset(frame.Preset);
            bool enhanced = kind != MaterialContentPresenter.ContentKind.Marble;
            content.Root.gameObject.SetActive(!enhanced);
            Actor.gameObject.SetActive(enhanced);
            if (enhanced)
            {
                Actor.Kind = kind == MaterialContentPresenter.ContentKind.Water ? MaterialKind.Water :
                    kind == MaterialContentPresenter.ContentKind.Sand ? MaterialKind.Sand : MaterialKind.Softbody;
                Actor.SetStale(false);
                Actor.ApplyFrame(new MaterialFrame {
                    Time = frame.SourceTimeS, DeltaTime = frame.ElapsedS,
                    Rebase = rebase,
                    IsDevice = frame.Source == "device", IsFresh = frame.HasMotion && frame.IsFreshMotion,
                    Size = frame.Size, Fill = frame.Fill * (frame.Pressure == null ? 1 : frame.Pressure.Remaining),
                    Gravity = -PresentationMath.BodyToUnity(frame.BodyGravity).normalized * 9.81f,
                    Acceleration = PresentationMath.BodyToUnity(frame.BodyAcceleration)*9.81f,
                    AngularVelocity = angularVelocity,
                    MassPosition = frame.MassPosition, Velocity = frame.Velocity, Energy = frame.Energy,
                    Flow = frame.GranularFlow ?? 0, Slope = frame.PileSlope ?? 0,
                    Contraction = frame.Heartbeat == null ? 0 : frame.Heartbeat.Contraction,
                    NewEvents = frame.NewEvents, EventAmplitude = frame.EventAmplitude
                });
            }
            else
            {
                content.Configure(frame.Preset,frame.Size,frame.Fill);
                content.SetStale(false); content.Apply(frame);
            }
            massGlyph.gameObject.SetActive(enhanced && frame.Source == "device" && frame.HasMotion);
            if (massGlyph.gameObject.activeSelf)
            {
                massGlyph.localPosition = new Vector3(frame.MassPosition.x * size.x*.5f, frame.MassPosition.y*size.y*.5f, -size.z*.53f);
                massGlyph.localScale = Vector3.one * Mathf.Min(size.x,size.y)*.035f;
            }
            ApplyServo(snapshot);
        }
        void ApplyServo(JObject snapshot)
        {
            var servo=snapshot?["tilt_servo"];
            var devices=servo?["devices"] as JArray;
            bool recent=servo?["status_age_ms"]!=null && servo["status_age_ms"].Value<double>()<=250;
            servoRig.gameObject.SetActive(devices!=null&&recent);
            if(devices==null||!recent)return;
            for(int i=0;i<2;i++)
            {
                var item=i<devices.Count?devices[i]:null;
                bool valid=item?["status_valid"]?.Value<bool>()==true&&item["home_position_raw"]!=null;
                bool hasPosition=valid&&item["present_position_raw"]!=null,hasGoal=valid&&item["goal_position_raw"]!=null;
                measured[i].gameObject.SetActive(hasPosition);requested[i].gameObject.SetActive(hasGoal);
                if(hasPosition)measured[i].localRotation=Quaternion.Euler(0,0,(item["present_position_raw"].Value<float>()-item["home_position_raw"].Value<float>())*360/4096);
                if(hasGoal)requested[i].localRotation=Quaternion.Euler(0,0,(item["goal_position_raw"].Value<float>()-item["home_position_raw"].Value<float>())*360/4096);
            }
        }
        void BuildShell(Vector3 dimensions)
        {
            size=dimensions;
            for(int i=shell.childCount-1;i>=0;i--) { var child=shell.GetChild(i).gameObject; child.SetActive(false); UnityEngine.Object.Destroy(child); }
            foreach(var mesh in shellMeshes) UnityEngine.Object.Destroy(mesh);shellMeshes.Clear();
            foreach(var mat in shellMaterials) UnityEngine.Object.Destroy(mat);shellMaterials.Clear();
            var teal=ShellMat(new Color(.055f,.145f,.16f),.45f,.56f);
            var metal=ShellMat(new Color(.66f,.71f,.70f),.82f,.78f);
            var lining=ShellMat(new Color(.56f,.66f,.67f),.12f,.47f);
            var glass=new Material(Resources.Load<Shader>("FresnelGalleryGlass"));shellMaterials.Add(glass);
            float t=Mathf.Min(size.x,size.y,size.z)*.022f;
            var baseGeometry=new BeveledGeometry();var railGeometry=new BeveledGeometry();var glassGeometry=new BeveledGeometry();
            // Keep the backing below the liner: coplanar tops flicker as dark triangles.
            baseGeometry.Box(new Vector3(0,-size.y*.5f-t*1.3f,0),new Vector3(size.x+t*4,t*2,size.z+t*4),t*.6f);
            var innerGeometry=new BeveledGeometry();
            innerGeometry.Box(new Vector3(0,-size.y*.5f-t*.12f,0),new Vector3(size.x,t*.24f,size.z),t*.10f);
            // Transparent illustration of the closed metric volume, not a claim about hardware glass.
            glassGeometry.Box(new Vector3(0,0,size.z*.5f+t*.25f),new Vector3(size.x,size.y,t*.5f),t*.18f);
            glassGeometry.Box(new Vector3(0,0,-size.z*.5f-t*.25f),new Vector3(size.x,size.y,t*.5f),t*.18f);
            for(int x=-1;x<=1;x+=2)
                glassGeometry.Box(new Vector3(x*(size.x*.5f+t*.25f),0,0),new Vector3(t*.5f,size.y,size.z),t*.18f);
            for(int x=-1;x<=1;x+=2) for(int z=-1;z<=1;z+=2)
                railGeometry.Box(new Vector3(x*(size.x+t)*.5f,0,z*(size.z+t)*.5f),new Vector3(t,size.y+t*2,t),t*.42f);
            for(int y=-1;y<=1;y+=2) for(int z=-1;z<=1;z+=2)
                railGeometry.Box(new Vector3(0,y*(size.y+t)*.5f,z*(size.z+t)*.5f),new Vector3(size.x+t*2,t,t),t*.42f);
            for(int x=-1;x<=1;x+=2)
                railGeometry.Box(new Vector3(x*(size.x+t)*.5f,(size.y+t)*.5f,0),new Vector3(t,t,size.z+t*2),t*.42f);
            for(int i=1;i<10;i++)
                railGeometry.Box(new Vector3(-size.x*.445f,-size.y*.5f+size.y*i*.1f,-size.z*.505f),new Vector3(size.x*(i==5?.065f:.035f),t*.18f,t*.15f),t*.05f);
            AddShell("Anodized base",baseGeometry,teal);AddShell("Interior",innerGeometry,lining);
            AddShell("Polished fine rim",railGeometry,metal);AddShell("Clear enclosure",glassGeometry,glass);
            FitCamera();
        }
        void FitCamera(float motion=0)
        {
            camera.orthographic=false;camera.fieldOfView=33;
            float halfView=Mathf.Max(.070f,size.magnitude*.96f)*(1+Mathf.Clamp01(motion)*.34f);
            float distance=halfView/Mathf.Tan(camera.fieldOfView*Mathf.Deg2Rad*.5f);
            var target=new Vector3(0,.002f+Mathf.Clamp01(motion)*.019f,0);
            camera.transform.position=target+new Vector3(.44f,.85f,-.85f).normalized*distance;
            camera.transform.LookAt(target);camera.nearClipPlane=.001f;camera.farClipPlane=Mathf.Max(3,distance+size.magnitude*3);
        }
        Material ShellMat(Color color,float metal,float smooth)
        {
            var material=new Material(Shader.Find("Standard"));material.color=color;
            material.SetFloat("_Metallic",metal);material.SetFloat("_Glossiness",smooth);shellMaterials.Add(material);return material;
        }
        void AddShell(string name,BeveledGeometry builder,Material material)
        {var mesh=builder.Create(name);shellMeshes.Add(mesh);MeshObject(name,shell,mesh,material);}
        static void MeshObject(string name,Transform parent,Mesh mesh,Material material)
        {
            var obj=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));obj.transform.SetParent(parent,false);
            obj.GetComponent<MeshFilter>().sharedMesh=mesh;var renderer=obj.GetComponent<MeshRenderer>();renderer.sharedMaterial=material;
            if(material.shader.name=="Fresnel/Gallery Glass")renderer.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
        }
        Material Mat(Color color,float metal,float smooth)
        {
            var mat=new Material(Shader.Find("Standard")); mat.color=color;
            mat.SetFloat("_Metallic",metal);mat.SetFloat("_Glossiness",smooth);materials.Add(mat);return mat;
        }
        static void Cube(string name,Transform parent,Vector3 position,Vector3 scale,Material material)
        {
            var obj=GameObject.CreatePrimitive(PrimitiveType.Cube);obj.name=name;obj.transform.SetParent(parent,false);
            obj.transform.localPosition=position;obj.transform.localScale=scale;obj.GetComponent<Renderer>().sharedMaterial=material;
            UnityEngine.Object.Destroy(obj.GetComponent<Collider>());
        }
        public void Dispose()
        {
            // Unity may destroy this independent scene root before StudioApp.OnDestroy.
            content.Dispose();
            studio.Dispose();
            if (root != null) UnityEngine.Object.Destroy(root.gameObject);
            foreach (var mat in materials) if (mat != null) UnityEngine.Object.Destroy(mat);
            materials.Clear();
            foreach(var mat in shellMaterials) if(mat!=null) UnityEngine.Object.Destroy(mat);shellMaterials.Clear();
            foreach(var mesh in geometry) if(mesh!=null) UnityEngine.Object.Destroy(mesh);geometry.Clear();
            foreach(var mesh in shellMeshes) if(mesh!=null) UnityEngine.Object.Destroy(mesh);shellMeshes.Clear();
        }
    }
}
