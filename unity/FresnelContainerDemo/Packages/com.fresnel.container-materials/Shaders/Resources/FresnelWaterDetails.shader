Shader "Fresnel/Container Water Details"
{
    SubShader
    {
        Tags { "Queue"="Transparent-18" "RenderType"="Transparent" }
        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            Blend SrcAlpha OneMinusSrcAlpha ZWrite Off Cull Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float4 color:COLOR; };
            struct v2f { float4 vertex:SV_POSITION; float3 world:TEXCOORD0; float3 normal:TEXCOORD1; float4 color:COLOR; };
            v2f vert(appdata v)
            {
                v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;
                o.normal=UnityObjectToWorldNormal(v.normal);o.color=v.color;return o;
            }
            float4 frag(v2f i):SV_Target
            {
                float3 n=normalize(i.normal),v=normalize(_WorldSpaceCameraPos-i.world);
                float3 light=normalize(_WorldSpaceLightPos0.xyz-i.world*_WorldSpaceLightPos0.w);
                float facing=abs(dot(n,v)),fresnel=.02037+.97963*pow(1-facing,5);
                half4 probe=UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0,reflect(-v,n),.5);
                float3 reflected=DecodeHDR(probe,unity_SpecCube0_HDR);
                float spec=pow(saturate(dot(n,normalize(light+v))),80);
                float3 droplet=lerp(float3(.07,.25,.31),reflected,.25+.75*fresnel)+_LightColor0.rgb*spec*.7;
                float3 foam=float3(.88,.96,.97)*(.68+.32*saturate(dot(n,light)));
                return float4(lerp(droplet,foam,i.color.r),i.color.a*lerp(.88,1,i.color.r));
            }
            ENDCG
        }
    }
    Fallback Off
}
