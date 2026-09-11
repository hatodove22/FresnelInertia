Shader "Fresnel/Container Water"
{
    Properties
    {
        _VesselSize ("Vessel dimensions (metres)", Vector) = (.08,.06,.04,0)
        _Absorption ("RGB absorption", Color) = (.65,.19,.08,1)
        _Scatter ("In-scattered tint", Color) = (.035,.15,.19,1)
        _Refraction ("Refraction", Range(0,0.06)) = .0012
        _Density ("Optical density", Range(.1,3)) = 1
        _Foam ("Velocity foam", Range(0,1)) = 0
    }
    SubShader
    {
        Tags { "Queue"="Transparent-20" "RenderType"="Transparent" }
        // Named grab: all actors share one background copy per camera, not one copy per particle.
        GrabPass { "_FresnelContainerBackground" }
        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            ZWrite On Cull Back
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "FresnelWaterSurface.cginc"
            sampler2D _FresnelContainerBackground;
            float4 _VesselSize, _Absorption, _Scatter;
            float _Refraction, _Density, _Foam;
            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float4 color:COLOR; };
            struct v2f { float4 vertex:SV_POSITION; float4 grab:TEXCOORD0; float3 world:TEXCOORD1; float3 normal:TEXCOORD2; float3 local:TEXCOORD3; float4 color:COLOR; };
            v2f vert(appdata v)
            {
                v2f o; o.vertex=UnityObjectToClipPos(v.vertex); o.grab=ComputeGrabScreenPos(o.vertex);
                o.world=mul(unity_ObjectToWorld,v.vertex).xyz; o.normal=UnityObjectToWorldNormal(v.normal); o.local=v.vertex.xyz; o.color=v.color; return o;
            }
            float4 frag(v2f i):SV_Target
            {
                float3 forward=-float3(UNITY_MATRIX_V._m20,UNITY_MATRIX_V._m21,UNITY_MATRIX_V._m22);
                float3 edge=_VesselSize.xyz*.5-abs(i.local);
                bool contact=min(edge.x,min(edge.y,edge.z))<min(_VesselSize.x,min(_VesselSize.y,_VesselSize.z))*.0001;
                float3 localNormal=contact?FresnelWaterWallNormal(i.local,_VesselSize.xyz):FresnelWaterNormal(i.local);
                float3 n=UnityObjectToWorldNormal(localNormal),v=-normalize(lerp(i.world-_WorldSpaceCameraPos,forward,unity_OrthoParams.w));
                float facing=saturate(dot(n,v));
                float3 objectView=normalize(mul((float3x3)unity_WorldToObject,v));
                float3 objectNormal=normalize(mul((float3x3)unity_WorldToObject,n));
                float3 ray=normalize(refract(-objectView,objectNormal,1/1.3333));
                float3 safeRay=(step(0,ray)*2-1)*max(abs(ray),.0001);
                // Beer-Lambert chord through the metric vessel: coloured absorption grows with path length.
                float3 distances=(sign(safeRay)*_VesselSize.xyz*.5-i.local)/safeRay;
                float chord=max(0,min(distances.x,min(distances.y,distances.z)));
                float depth=clamp(chord/max(.0001,_VesselSize.z),.035,2.4)*_Density;
                float3 transmission=exp(-_Absorption.rgb*depth);
                float4 refracted=ComputeGrabScreenPos(UnityObjectToClipPos(float4(i.local+ray*chord,1)));
                float refraction=saturate(_Refraction/.004)*lerp(1,.18,contact?smoothstep(.12,.7,_SurfaceVisual.x):0);
                float4 grab=i.grab;grab.xy=lerp(grab.xy/grab.w,refracted.xy/refracted.w,refraction)*grab.w;
                float3 background=tex2Dproj(_FresnelContainerBackground,UNITY_PROJ_COORD(grab)).rgb;
                float3 transmitted=background*transmission+_Scatter.rgb*(1-transmission)*.22;
                float3 reflection=reflect(-v,n);
                half4 probe=UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0,reflection,.65);
                float3 environment=DecodeHDR(probe,unity_SpecCube0_HDR);
                float fresnel=.0204+.9796*pow(1-facing,5);
                float3 lightDirection=normalize(_WorldSpaceLightPos0.xyz-i.world*_WorldSpaceLightPos0.w);
                float3 halfVector=normalize(lightDirection+v);
                float highlight=pow(saturate(dot(n,halfVector)),72)*.20;
                float3 water=lerp(transmitted,environment,fresnel)+_LightColor0.rgb*highlight;
                float foam=smoothstep(.12,.75,i.color.r)*_Foam;
                water=lerp(water,float3(.83,.95,.91),foam*.42);
                if(!contact)water=lerp(water,float3(.86,.97,.98),FresnelWaterCrest(i.local,_VesselSize.xyz)*.68);
                return float4(_FresnelWaterDebug>.5?localNormal*.5+.5:water,1);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}
