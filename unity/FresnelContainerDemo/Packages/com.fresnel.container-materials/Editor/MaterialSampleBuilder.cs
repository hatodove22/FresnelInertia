using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.Materials.Editor
{
    public static class MaterialSampleBuilder
    {
        /// <summary>Build the generated sample in a separate Built-in project through -executeMethod.</summary>
        public static void BuildStandaloneSampleBatch()
        {
            try
            {
                var packageAssembly = typeof(ContainerMaterialActor).Assembly;
                foreach (var reference in packageAssembly.GetReferencedAssemblies())
                    if (reference.Name.StartsWith("Assembly-CSharp", StringComparison.Ordinal))
                        throw new InvalidOperationException("Package depends on project assembly: " + reference.Name);
                CreateSample();
                PlayerSettings.companyName = "Fresnel Inertia";
                PlayerSettings.productName = "Fresnel Materials Sample";
                PlayerSettings.defaultScreenWidth = 1280;
                PlayerSettings.defaultScreenHeight = 800;
                PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
                PlayerSettings.runInBackground = true;
                PlayerSettings.SetScriptingBackend(NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
                string directory = Path.GetFullPath("Builds/StandaloneSample");
                Directory.CreateDirectory(directory);
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                    scenes = new[] { "Assets/FresnelMaterialSample/ContainerMaterials.unity" },
                    locationPathName = Path.Combine(directory, "FresnelMaterialsSample.exe"),
                    target = BuildTarget.StandaloneWindows64,
                    options = BuildOptions.None
                });
                if (report.summary.result != BuildResult.Succeeded)
                    throw new InvalidOperationException("Standalone sample build failed: " + report.summary.result);
                Debug.Log("Fresnel standalone sample PASS; package has no Assembly-CSharp references; output: " + directory);
                if (Application.isBatchMode) EditorApplication.Exit(0);
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
                if (Application.isBatchMode) EditorApplication.Exit(1);
                else throw;
            }
        }

        [MenuItem("GameObject/Fresnel/Container material", false, 10)]
        static void AddActor()
        {
            var go = new GameObject("Fresnel container", typeof(ContainerMaterialActor));
            Undo.RegisterCreatedObjectUndo(go, "Create Fresnel material"); Selection.activeGameObject = go;
        }
        [MenuItem("Fresnel Materials/Create standalone sample")]
        public static void CreateSample()
        {
            if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            PlayerSettings.colorSpace = ColorSpace.Linear;
            const string directory = "Assets/FresnelMaterialSample";
            if (!AssetDatabase.IsValidFolder(directory)) AssetDatabase.CreateFolder("Assets", "FresnelMaterialSample");
            var camera = new GameObject("Sample camera", typeof(Camera)).GetComponent<Camera>();
            camera.tag = "MainCamera"; camera.transform.position = new Vector3(.115f,.102f,-.18f);
            camera.transform.LookAt(new Vector3(0,-.012f,0)); camera.orthographic = false; camera.fieldOfView = 35;
            camera.allowHDR = true;
            camera.nearClipPlane = .001f; camera.farClipPlane = 5;
            camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = new Color(.9f,.91f,.87f);
            var light = new GameObject("Soft key", typeof(Light)).GetComponent<Light>();
            light.type = LightType.Directional; light.intensity = 1.15f; light.color = new Color(1,.96f,.90f);
            light.transform.rotation = Quaternion.Euler(45,-35,0); light.shadows = LightShadows.Soft;
            light.shadowStrength = .4f; light.shadowBias = .001f; light.shadowNormalBias = .001f; light.shadowNearPlane = .005f;
            var fillLight = new GameObject("Cool fill", typeof(Light)).GetComponent<Light>();
            fillLight.type = LightType.Directional; fillLight.intensity = .3f; fillLight.color = new Color(.84f,.92f,1);
            fillLight.transform.rotation = Quaternion.Euler(30,140,0);
            QualitySettings.shadowDistance = .8f;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.52f,.59f,.64f);
            RenderSettings.ambientEquatorColor = new Color(.40f,.43f,.44f);
            RenderSettings.ambientGroundColor = new Color(.25f,.27f,.28f);
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            RenderSettings.customReflectionTexture = CreateStudioReflection(directory+"/StudioReflection.cubemap");
            RenderSettings.reflectionIntensity = .8f;
            var vessel = new GameObject("Vessel (metres)", typeof(ContainerMaterialActor), typeof(ContainerMaterialSample));
            var actor = vessel.GetComponent<ContainerMaterialActor>(); actor.AutoSimulate = true;
            // Generated rails use a persistent material asset, so scene save/reopen is self-contained.
            var mat = AssetDatabase.LoadAssetAtPath<Material>(directory+"/Frame.mat");
            if (mat == null) { mat = new Material(Shader.Find("Standard")); mat.color = new Color(.08f,.29f,.29f); mat.SetFloat("_Metallic",.6f); mat.SetFloat("_Glossiness",.7f); AssetDatabase.CreateAsset(mat,directory+"/Frame.mat"); }
            Vector3 s = actor.Size; float thickness = .0015f;
            for (int x=-1;x<=1;x+=2) for (int z=-1;z<=1;z+=2)
                Rail(vessel.transform,new Vector3(x*s.x*.5f,0,z*s.z*.5f),new Vector3(thickness,s.y,thickness),mat);
            for (int y=-1;y<=1;y+=2) for (int z=-1;z<=1;z+=2)
                Rail(vessel.transform,new Vector3(0,y*s.y*.5f,z*s.z*.5f),new Vector3(s.x,thickness,thickness),mat);
            for (int y=-1;y<=1;y+=2) for (int x=-1;x<=1;x+=2)
                Rail(vessel.transform,new Vector3(x*s.x*.5f,y*s.y*.5f,0),new Vector3(thickness,thickness,s.z),mat);
            var plate = CreateNeutralMaterial(directory+"/BottomPlate.mat",new Color(.52f,.55f,.54f),.24f);
            const float plateThickness = .001f, clearance = .00025f;
            // The plate belongs to the rotating vessel, but its TOP is below the entire
            // simulated interior. It cannot duplicate the water's coplanar bottom surface.
            Box("Neutral bottom plate",vessel.transform,
                new Vector3(0,-s.y*.5f-clearance-plateThickness*.5f,0),new Vector3(s.x,plateThickness,s.z),plate);
            var platform = CreateNeutralMaterial(directory+"/Platform.mat",new Color(.69f,.70f,.67f),.18f);
            const float platformThickness = .004f;
            // A stationary display plinth clears the vessel even at the sample's full tilt.
            float platformTop = -s.magnitude*.5f-.004f;
            Box("Display platform",null,new Vector3(0,platformTop-platformThickness*.5f,0),
                new Vector3(s.x*1.9f,platformThickness,s.x*1.6f),platform);
            EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(),directory+"/ContainerMaterials.unity");
            AssetDatabase.SaveAssets(); Selection.activeGameObject = vessel;
        }

        static Material CreateNeutralMaterial(string path,Color color,float smoothness)
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material != null) return material;
            material = new Material(Shader.Find("Standard")); material.color = color;
            material.SetFloat("_Metallic",0); material.SetFloat("_Glossiness",smoothness);
            AssetDatabase.CreateAsset(material,path); return material;
        }

        static Cubemap CreateStudioReflection(string path)
        {
            const int edge = 64;
            var cube = AssetDatabase.LoadAssetAtPath<Cubemap>(path);
            if (cube == null)
            {
                cube = new Cubemap(edge,TextureFormat.RGBAHalf,true) { name="Static studio reflection",wrapMode=TextureWrapMode.Clamp };
                AssetDatabase.CreateAsset(cube,path);
            }
            Vector3 key = new Vector3(-.55f,.72f,-.42f).normalized;
            Vector3 rim = new Vector3(.78f,.25f,.57f).normalized;
            Vector3 window = new Vector3(-.38f,.50f,.78f).normalized;
            Vector3 right = Vector3.Cross(Vector3.up,window).normalized;
            Vector3 up = Vector3.Cross(window,right).normalized;
            Color[] pixels = new Color[edge*edge];
            for (int face=0;face<6;face++)
            {
                for (int y=0;y<edge;y++) for (int x=0;x<edge;x++)
                {
                    float u=(x+.5f)/edge*2-1,v=(y+.5f)/edge*2-1;
                    Vector3 direction;
                    switch ((CubemapFace)face)
                    {
                        case CubemapFace.PositiveX: direction=new Vector3(1,-v,-u); break;
                        case CubemapFace.NegativeX: direction=new Vector3(-1,-v,u); break;
                        case CubemapFace.PositiveY: direction=new Vector3(u,1,v); break;
                        case CubemapFace.NegativeY: direction=new Vector3(u,-1,-v); break;
                        case CubemapFace.PositiveZ: direction=new Vector3(u,-v,1); break;
                        default: direction=new Vector3(-u,-v,-1); break;
                    }
                    direction.Normalize();
                    Color color=Color.Lerp(new Color(.10f,.12f,.14f),new Color(.48f,.57f,.66f),
                        Mathf.SmoothStep(0,1,direction.y*.5f+.5f));
                    float keyBox=Mathf.Pow(Mathf.Max(0,Vector3.Dot(direction,key)),38);
                    float rimBox=Mathf.Pow(Mathf.Max(0,Vector3.Dot(direction,rim)),95);
                    float facing=Vector3.Dot(direction,window);
                    float wx=Mathf.Abs(Vector3.Dot(direction,right))/Mathf.Max(.001f,facing);
                    float wy=Mathf.Abs(Vector3.Dot(direction,up))/Mathf.Max(.001f,facing);
                    float windowBox=facing>0 ?
                        (1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(.30f,.40f,wx)))*
                        (1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(.015f,.050f,wy))) : 0;
                    color+=new Color(1,.91f,.76f)*keyBox*4.2f+new Color(.77f,.90f,1)*rimBox*2.6f;
                    color+=new Color(.94f,.98f,1)*windowBox*4;
                    color.a=1; pixels[y*edge+x]=color;
                }
                cube.SetPixels(pixels,(CubemapFace)face);
            }
            cube.Apply(true,false); EditorUtility.SetDirty(cube); return cube;
        }

        static void Rail(Transform parent,Vector3 p,Vector3 s,Material mat)
        { Box("Enclosure rail",parent,p,s,mat); }

        static void Box(string name,Transform parent,Vector3 p,Vector3 s,Material mat)
        {
            var go=GameObject.CreatePrimitive(PrimitiveType.Cube); go.name=name; go.transform.SetParent(parent,false);
            go.transform.localPosition=p;go.transform.localScale=s;go.GetComponent<Renderer>().sharedMaterial=mat;
            UnityEngine.Object.DestroyImmediate(go.GetComponent<Collider>());
        }
    }
}
