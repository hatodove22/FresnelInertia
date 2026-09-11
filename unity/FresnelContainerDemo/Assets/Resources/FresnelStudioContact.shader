Shader "Fresnel/Studio Contact"
{
    SubShader
    {
        Tags { "Queue"="Transparent-100" "RenderType"="Transparent" }
        Pass
        {
            ZWrite Off Cull Off Blend SrcAlpha OneMinusSrcAlpha
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            struct appdata { float4 vertex:POSITION; float2 uv:TEXCOORD0; };
            struct v2f { float4 position:SV_POSITION; float2 uv:TEXCOORD0; };
            v2f vert(appdata v){v2f o;o.position=UnityObjectToClipPos(v.vertex);o.uv=v.uv*2-1;return o;}
            fixed4 frag(v2f i):SV_Target
            {
                float r=dot(i.uv,i.uv);
                return float4(.12,.16,.16,.20*exp(-3*r)*saturate(1-r));
            }
            ENDCG
        }
    }
}
