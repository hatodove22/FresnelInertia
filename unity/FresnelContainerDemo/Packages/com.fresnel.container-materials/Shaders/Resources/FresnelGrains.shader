Shader "Fresnel/Container Grains"
{
    Properties
    {
        _Color ("Mineral tint", Color) = (1,1,1,1)
        _Gloss ("Dry sand sheen", Range(0,1)) = .16
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows vertex:vert
        #pragma target 3.0
        fixed4 _Color;
        float _Gloss;
        struct Input { float4 color:COLOR; float3 grainCoord; };
        void vert(inout appdata_full v, out Input o)
        {
            UNITY_INITIALIZE_OUTPUT(Input,o);
            o.color=v.color; o.grainCoord=v.texcoord.xyz;
        }
        float mineral(float3 p) { return frac(sin(dot(p,float3(127.1,311.7,74.7)))*43758.5453); }
        void surf(Input i,inout SurfaceOutputStandard o)
        {
            // Carrier-local microtexture has no clock. Derivative filtering suppresses
            // subpixel mineral sparkle without changing the accepted particle motion.
            float3 q=i.grainCoord*13.0+i.color.a*37.0;
            float footprint=max(length(ddx(q)),length(ddy(q)));
            float detail=1-smoothstep(.4,1.4,footprint);
            float3 cell=floor(q);
            float a=mineral(cell), b=mineral(cell+19.19);
            float speck=(a-.5)*detail;
            o.Albedo=i.color.rgb*_Color.rgb*(1+speck*.20);
            o.Normal=normalize(float3((a-.5)*.25*detail,(b-.5)*.25*detail,1));
            o.Metallic=0; o.Smoothness=_Gloss*(.75+a*.25);
            o.Occlusion=.94+speck*.08; o.Alpha=1;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
