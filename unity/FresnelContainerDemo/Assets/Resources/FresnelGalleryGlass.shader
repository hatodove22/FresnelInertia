Shader "Fresnel/Gallery Glass"
{
    Properties { _Tint ("Edge tint",Color)=(.73,.91,.93,1) }
    SubShader
    {
        Tags { "Queue"="Transparent+30" "RenderType"="Transparent" }
        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off Cull Back
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;};
            struct v2f {float4 vertex:SV_POSITION;float3 world:TEXCOORD0;float3 normal:TEXCOORD1;};
            float4 _Tint;
            v2f vert(appdata v){v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;o.normal=UnityObjectToWorldNormal(v.normal);return o;}
            float4 frag(v2f i):SV_Target
            {
                float3 n=normalize(i.normal),v=normalize(_WorldSpaceCameraPos-i.world);
                float f=.04+.96*pow(1-saturate(abs(dot(n,v))),5);
                float3 r=reflect(-v,n);
                half4 encoded=UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0,r,0);
                float3 env=DecodeHDR(encoded,unity_SpecCube0_HDR);
                return float4(lerp(_Tint.rgb*.5,env,.88),.025+f*.58);
            }
            ENDCG
        }
    }
}
