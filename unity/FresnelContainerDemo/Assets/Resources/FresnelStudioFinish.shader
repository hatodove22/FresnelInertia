Shader "Hidden/Fresnel/Studio Finish"
{
    Properties { _MainTex ("Image", 2D) = "white" {} }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float4 _MainTex_TexelSize;
            float3 Tone(float3 c)
            {
                // Smooth photographic exposure response with no hard white clipping.
                c=max(0,c);
                return 1-exp(-1.6*c);
            }
            float Luma(float3 c) { return dot(c,float3(.299,.587,.114)); }
            float4 frag(v2f_img i):SV_Target
            {
                float2 px=abs(_MainTex_TexelSize.xy);
                float3 center=Tone(tex2D(_MainTex,i.uv).rgb);
                float3 a=Tone(tex2D(_MainTex,i.uv+float2(-1,-1)*px).rgb);
                float3 b=Tone(tex2D(_MainTex,i.uv+float2(1,-1)*px).rgb);
                float3 c=Tone(tex2D(_MainTex,i.uv+float2(-1,1)*px).rgb);
                float3 d=Tone(tex2D(_MainTex,i.uv+float2(1,1)*px).rgb);
                float lc=Luma(center),la=Luma(a),lb=Luma(b),ld=Luma(c),le=Luma(d);
                float lo=min(lc,min(min(la,lb),min(ld,le))), hi=max(lc,max(max(la,lb),max(ld,le)));
                if(hi-lo<max(.035,hi*.12)) return float4(center,1);
                float2 dir=float2(-((la+lb)-(ld+le)),(la+ld)-(lb+le));
                float reduce=max((la+lb+ld+le)*(.25*.125),1.0/128);
                dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+reduce),-6,6)*px;
                float3 edge=.5*(Tone(tex2D(_MainTex,i.uv+dir*(-1.0/6)).rgb)+Tone(tex2D(_MainTex,i.uv+dir*(1.0/6)).rgb));
                return float4(lerp(center,edge,.8),1);
            }
            ENDCG
        }
    }
}
