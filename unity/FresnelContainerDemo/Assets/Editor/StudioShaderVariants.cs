using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Rendering;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.UnityDemo.Editor
{
    // This procedural scene has no lightmaps, fog, detail/normal/parallax maps or deferred camera.
    // Keep realtime shadows, emission and alpha blending used by the actual runtime materials.
    public sealed class StudioShaderVariants : IPreprocessShaders
    {
        public int callbackOrder => 0;
        static readonly HashSet<string> Unused = new HashSet<string> {
            "LIGHTMAP_ON", "DIRLIGHTMAP_COMBINED", "DYNAMICLIGHTMAP_ON", "LIGHTMAP_SHADOW_MIXING", "SHADOWS_SHADOWMASK",
            "FOG_LINEAR", "FOG_EXP", "FOG_EXP2", "_DETAIL_MULX2", "_NORMALMAP", "_PARALLAXMAP", "_METALLICGLOSSMAP",
            "_SPECGLOSSMAP", "_SMOOTHNESS_TEXTURE_ALBEDO_CHANNEL_A", "EDITOR_VISUALIZATION"
        };
        public void OnProcessShader(Shader shader, ShaderSnippetData snippet, IList<ShaderCompilerData> data)
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android || shader.name != "Standard") return;
            if (snippet.passType == PassType.Deferred || snippet.passType == PassType.Meta) { data.Clear(); return; }
            for (int i = data.Count - 1; i >= 0; --i)
            {
                foreach (var keyword in data[i].shaderKeywordSet.GetShaderKeywords())
                    if (Unused.Contains(keyword.name)) { data.RemoveAt(i); break; }
            }
        }
    }
}
