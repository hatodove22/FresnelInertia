Shader "Fresnel/Container Water Volume"
{
    Properties
    {
        _VesselSize("Metric dimensions",Vector)=(.08,.06,.04,0)
        _Iso("Density surface",Float)=2.8
    }
    SubShader
    {
        Tags { "Queue"="Transparent-20" "RenderType"="Transparent" }
        GrabPass { "_FresnelContainerBackground" }
        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            ZWrite On Cull Back
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 4.5
            #pragma only_renderers d3d11 metal vulkan
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "FresnelWaterSurface.cginc"
            sampler3D _DensityField;
            sampler2D _FresnelContainerBackground;
            float4 _VesselSize,_Grid;
            float _Iso,_DistanceScale;
            struct appdata { float4 vertex:POSITION; };
            struct v2f { float4 vertex:SV_POSITION; float3 world:TEXCOORD0; };
            struct output { float4 color:SV_Target; float depth:SV_Depth; };
            v2f vert(appdata v)
            {
                v2f o;o.vertex=UnityObjectToClipPos(v.vertex);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;return o;
            }
            float density(float3 p)
            {
                // Field endpoints live at texel centers, including vessel walls.
                float3 uv=(p/_VesselSize.xyz+.5)*((_Grid.xyz-1)/_Grid.xyz)+.5/_Grid.xyz;
                return tex3Dlod(_DensityField,float4(uv,0)).r;
            }
            float signedDepth(float3 p){return (density(p)-_Iso)*_DistanceScale;}
            float boxExit(float3 p,float3 ray)
            {
                float3 safe=(step(0,ray)*2-1)*max(abs(ray),.000001);
                float3 t=(sign(safe)*_VesselSize.xyz*.5-p)/safe;
                return max(0,min(t.x,min(t.y,t.z)));
            }
            output frag(v2f i)
            {
                float3 forward=-float3(UNITY_MATRIX_V._m20,UNITY_MATRIX_V._m21,UNITY_MATRIX_V._m22);
                float3 worldDirection=normalize(lerp(i.world-_WorldSpaceCameraPos,forward,unity_OrthoParams.w));
                float3 worldOrigin=lerp(_WorldSpaceCameraPos,i.world+forward*dot(_WorldSpaceCameraPos-i.world,forward),unity_OrthoParams.w);
                float3 origin=mul(unity_WorldToObject,float4(worldOrigin,1)).xyz;
                float3 ray=normalize(mul((float3x3)unity_WorldToObject,worldDirection));
                float3 safeRay=(step(0,ray)*2-1)*max(abs(ray),.000001);
                float3 a=(-_VesselSize.xyz*.5-origin)/safeRay,b=(_VesselSize.xyz*.5-origin)/safeRay;
                float3 nearT=min(a,b),farT=max(a,b);
                float entry=max(0,max(nearT.x,max(nearT.y,nearT.z))),exit=min(farT.x,min(farT.y,farT.z));
                clip(exit-entry);
                float3 h=_VesselSize.xyz/(_Grid.xyz-1);
                float voxel=max(h.x,max(h.y,h.z));
                float hit=-1,t=entry,previous=entry;
                bool contact=signedDepth(origin+ray*(entry+voxel*.005))>=0;
                if(contact)hit=entry;
                else
                {
                    [loop]for(int s=0;s<80;s++)
                    {
                        float d=signedDepth(origin+ray*t);
                        if(d>=0)
                        {
                            float lo=previous,hi=t;
                            [unroll]for(int k=0;k<5;k++)
                            {
                                float mid=(lo+hi)*.5;
                                if(signedDepth(origin+ray*mid)>=0)hi=mid;else lo=mid;
                            }
                            hit=(lo+hi)*.5;break;
                        }
                        if(t>=exit)break;
                        previous=t;
                        t=min(exit,t+clamp(-d*.45,voxel*.75,voxel*4));
                    }
                }
                clip(hit);
                float3 p=origin+ray*hit;
                // The exact fitted derivative avoids clamped-volume texture gradients
                // bending the contact normal into a false dark refractive triangle.
                float3 normal=FresnelWaterNormal(p);
                if(contact)
                {
                    normal=FresnelWaterWallNormal(p,_VesselSize.xyz);
                }
                // One air/water interface, followed by a continuous exit solve.
                // Quantized exit lengths create false refractive contour bands.
                float3 transmittedRay=normalize(refract(ray,normal,1/1.3333));
                float maximumChord=boxExit(p,transmittedRay);
                float thickness=maximumChord;
                t=min(maximumChord,voxel*.08);previous=0;
                [loop]for(int s=0;s<56;s++)
                {
                    float d=signedDepth(p+transmittedRay*t);
                    if(d<0)
                    {
                        float lo=previous,hi=t;
                        [unroll]for(int k=0;k<5;k++)
                        {
                            float mid=(lo+hi)*.5;
                            if(signedDepth(p+transmittedRay*mid)>=0)lo=mid;else hi=mid;
                        }
                        thickness=(lo+hi)*.5;break;
                    }
                    if(t>=maximumChord)break;
                    previous=t;t=min(maximumChord,t+clamp(d*.45,voxel*.8,voxel*6));
                }
                float3 exitPoint=p+transmittedRay*thickness;
                float4 projectedExit=UnityObjectToClipPos(float4(exitPoint,1));
                float4 grab=ComputeGrabScreenPos(projectedExit);
                float4 projectedHit=UnityObjectToClipPos(float4(p,1));
                float4 straightGrab=ComputeGrabScreenPos(projectedHit);
                // A conservative displacement avoids copying foreground enclosure
                // edges as if they were underwater geometry in a screen-space grab.
                float refraction=.30*lerp(1,.18,contact?smoothstep(.12,.7,_SurfaceVisual.x):0);
                float2 sampleUV=lerp(straightGrab.xy/straightGrab.w,grab.xy/grab.w,refraction);
                float3 background=tex2D(_FresnelContainerBackground,sampleUV).rgb;
                float optical=thickness/max(.0001,_VesselSize.z);
                float3 transmission=exp(-float3(.65,.19,.08)*optical);
                float3 transmitted=background*transmission+float3(.035,.15,.19)*(1-transmission)*.25;
                float3 n=UnityObjectToWorldNormal(normal),v=-worldDirection;
                float facing=saturate(dot(n,v));
                float fresnel=.02037+.97963*pow(1-facing,5);
                float3 reflected=reflect(-v,n);
                half4 probe=UNITY_SAMPLE_TEXCUBE_LOD(unity_SpecCube0,reflected,.65);
                float3 environment=DecodeHDR(probe,unity_SpecCube0_HDR);
                float3 color=lerp(transmitted,environment,fresnel);
                float3 world=mul(unity_ObjectToWorld,float4(p,1)).xyz;
                float3 light=normalize(_WorldSpaceLightPos0.xyz-world*_WorldSpaceLightPos0.w);
                float3 halfVector=normalize(light+v);
                float nl=saturate(dot(n,light)),nh=saturate(dot(n,halfVector)),vh=saturate(dot(v,halfVector));
                float alpha2=.00234256;
                float denominator=nh*nh*(alpha2-1)+1;
                float distribution=alpha2/(3.14159265*denominator*denominator);
                float smith=1/(4*max(.04,facing)*max(.04,nl));
                float specular=(.02037+.97963*pow(1-vh,5))*distribution*smith*nl;
                color+=_LightColor0.rgb*min(.65,specular);
                if(!contact)color=lerp(color,float3(.86,.97,.98),FresnelWaterCrest(p,_VesselSize.xyz)*.68);
                output o;o.color=float4(_FresnelWaterDebug>.5?normal*.5+.5:color,1);
                float4 clipPosition=UnityObjectToClipPos(float4(p,1));o.depth=clipPosition.z/clipPosition.w;
                return o;
            }
            ENDCG
        }
    }
    Fallback Off
}
