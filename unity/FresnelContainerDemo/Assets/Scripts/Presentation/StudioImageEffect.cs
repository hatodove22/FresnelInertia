using UnityEngine;

namespace Fresnel.UnityDemo.Presentation
{
    [RequireComponent(typeof(Camera))]
    public sealed class StudioImageEffect : MonoBehaviour
    {
        Material material;
        void OnRenderImage(RenderTexture source, RenderTexture destination)
        {
            if (material == null)
            {
                Shader shader=Resources.Load<Shader>("FresnelStudioFinish");
                if (shader==null || !shader.isSupported) { Graphics.Blit(source,destination); return; }
                material=new Material(shader) { hideFlags=HideFlags.HideAndDontSave };
            }
            Graphics.Blit(source,destination,material);
        }
        void OnDestroy() { if(material!=null) Destroy(material); }
    }
}
