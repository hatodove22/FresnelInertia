using System;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.UnityDemo.Presentation
{
    // Static studio illumination. Contains no material clock or source-state logic.
    public sealed class StudioEnvironment : IDisposable
    {
        readonly Camera camera;
        readonly Light key, fill;
        readonly Cubemap environment;
        readonly StudioImageEffect imageEffect;
        readonly LightShadows originalKeyShadows;
        bool enabled;

        public StudioEnvironment(Camera camera)
        {
            this.camera = camera;
            key = GameObject.Find("Large soft key").GetComponent<Light>();
            fill = GameObject.Find("Cool rim").GetComponent<Light>();
            originalKeyShadows = key.shadows;
            environment = CreateEnvironment();
            imageEffect = camera.gameObject.AddComponent<StudioImageEffect>();
            imageEffect.enabled = false;
        }

        public void SetEnabled(bool value)
        {
            if (enabled == value) return;
            enabled = value;
            camera.allowHDR = value;
            imageEffect.enabled = value;
            RenderSettings.ambientSkyColor = value ? new Color(.52f,.59f,.64f) : new Color(.72f,.78f,.79f);
            RenderSettings.ambientEquatorColor = value ? new Color(.40f,.43f,.44f) : new Color(.50f,.53f,.50f);
            RenderSettings.ambientGroundColor = value ? new Color(.25f,.27f,.28f) : new Color(.24f,.25f,.24f);
            RenderSettings.defaultReflectionMode = value ? DefaultReflectionMode.Custom : DefaultReflectionMode.Skybox;
            RenderSettings.customReflectionTexture = value ? environment : null;
            RenderSettings.reflectionIntensity = value ? .8f : 1;
            QualitySettings.shadowDistance = value ? .6f : 35;
            QualitySettings.shadowResolution = ShadowResolution.Medium;
            QualitySettings.shadowCascades = value ? 1 : 2;
            key.intensity = value ? 1.1f : 1.2f;
            key.shadows = originalKeyShadows;
            key.color = value ? new Color(1,.95f,.86f) : new Color(1,.96f,.86f);
            key.shadowStrength = value ? .35f : .55f;
            key.shadowBias = value ? .002f : .04f;
            key.shadowNormalBias = value ? .003f : .4f;
            key.shadowNearPlane = value ? .01f : .2f;
            key.shadowCustomResolution=value?512:-1;
            fill.intensity = value ? .30f : .5f;
        }

        static Cubemap CreateEnvironment()
        {
            const int edge = 64;
            var cube = new Cubemap(edge, TextureFormat.RGBAHalf, true) { name="Fresnel static studio softboxes", wrapMode=TextureWrapMode.Clamp };
            Vector3 key = new Vector3(-.55f,.72f,-.42f).normalized;
            Vector3 rim = new Vector3(.78f,.25f,.57f).normalized;
            Vector3 window = new Vector3(-.34f,.68f,.66f).normalized;
            Vector3 right = Vector3.Cross(Vector3.up,window).normalized;
            Vector3 up = Vector3.Cross(window,right).normalized;
            for (int face=0; face<6; face++)
            {
                var pixels = new Color[edge*edge];
                for (int y=0; y<edge; y++) for (int x=0; x<edge; x++)
                {
                    float u=(x+.5f)/edge*2-1, v=(y+.5f)/edge*2-1;
                    Vector3 d;
                    switch ((CubemapFace)face)
                    {
                        case CubemapFace.PositiveX: d=new Vector3(1,-v,-u); break;
                        case CubemapFace.NegativeX: d=new Vector3(-1,-v,u); break;
                        case CubemapFace.PositiveY: d=new Vector3(u,1,v); break;
                        case CubemapFace.NegativeY: d=new Vector3(u,-1,-v); break;
                        case CubemapFace.PositiveZ: d=new Vector3(u,-v,1); break;
                        default: d=new Vector3(-u,-v,-1); break;
                    }
                    d.Normalize();
                    Color c=Color.Lerp(new Color(.10f,.12f,.14f),new Color(.48f,.57f,.66f),Mathf.SmoothStep(0,1,d.y*.5f+.5f));
                    float k=Mathf.Pow(Mathf.Max(0,Vector3.Dot(d,key)),38);
                    float r=Mathf.Pow(Mathf.Max(0,Vector3.Dot(d,rim)),95);
                    float facing=Vector3.Dot(d,window);
                    float wx=Mathf.Abs(Vector3.Dot(d,right))/Mathf.Max(.001f,facing);
                    float wy=Mathf.Abs(Vector3.Dot(d,up))/Mathf.Max(.001f,facing);
                    float w=facing>0 ? (1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(.30f,.40f,wx)))*(1-Mathf.SmoothStep(0,1,Mathf.InverseLerp(.015f,.050f,wy))) : 0;
                    c+=new Color(1,.91f,.76f)*k*4.2f+new Color(.77f,.9f,1)*r*2.6f;
                    c+=new Color(.94f,.98f,1)*w*4;
                    c.a=1; pixels[y*edge+x]=c;
                }
                cube.SetPixels(pixels,(CubemapFace)face);
            }
            cube.Apply(true,false); return cube;
        }

        public void Dispose()
        {
            if (enabled && camera != null && key != null && fill != null) SetEnabled(false);
            if (environment != null) UnityEngine.Object.Destroy(environment);
        }
    }
}
