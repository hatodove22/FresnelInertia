Shader "Fresnel/Container Softbody"
{
    Properties
    {
        _Color ("Elastic material colour", Color) = (.74,.34,.27,1)
        _VesselSize ("Vessel dimensions", Vector) = (.08,.06,.04,0)
        _Contraction ("Accepted source contraction", Range(0,1)) = 0
        _Gloss ("Soft surface sheen", Range(.1,1)) = .60
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 250
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0
        fixed4 _Color;
        float4 _VesselSize;
        float _Contraction, _Gloss;
        struct Input { float3 worldPos; float3 worldNormal; };
        void surf(Input i,inout SurfaceOutputStandard o)
        {
            float3 local=mul(unity_WorldToObject,float4(i.worldPos,1)).xyz/max(_VesselSize.xyz,.0001);
            float3 normal=normalize(i.worldNormal);
            float3 view=normalize(_WorldSpaceCameraPos-i.worldPos);
            float3 light=normalize(_WorldSpaceLightPos0.xyz-i.worldPos*_WorldSpaceLightPos0.w);
            float rim=pow(1-saturate(dot(normal,view)),3);
            // Restrained wrapped-light tint suggests soft translucent silicone.
            // There is no independent pulse or liquid-like highlight.
            float wrap=saturate((dot(normal,light)+.55)/1.55);
            float transmission=pow(saturate(dot(view,-light+normal*.32)),3)*rim;
            o.Albedo=_Color.rgb*(.97+.03*saturate(local.y+.5));
            o.Metallic=0; o.Smoothness=_Gloss;
            o.Emission=_Color.rgb*(.025*wrap+.055*rim)+float3(.26,.07,.035)*transmission;
            o.Occlusion=.98;
            o.Alpha=1;
        }
        ENDCG
    }
    FallBack "Standard"
}
