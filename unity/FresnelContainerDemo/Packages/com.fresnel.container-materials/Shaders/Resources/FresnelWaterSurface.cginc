#ifndef FRESNEL_WATER_SURFACE_INCLUDED
#define FRESNEL_WATER_SURFACE_INCLUDED
float3 _SurfaceUp,_SurfaceU,_SurfaceV;
float4 _SurfaceExtent,_SurfacePlane,_SurfaceWaves,_SurfaceVisual;
// Test-only global. Defaults to zero; no user-facing control or clock.
float _FresnelWaterDebug;
float3 FresnelWaterNormal(float3 p)
{
    float2 extent=max(_SurfaceExtent.xy,.000001);
    float2 uv=clamp(float2(dot(p,_SurfaceU),dot(p,_SurfaceV))/extent,-1,1);
    float2 s=sin(uv*1.57079632679),c=cos(uv*1.57079632679);
    float2 derivative=_SurfacePlane.xy+_SurfacePlane.zw*(1-3*uv*uv)/extent;
    derivative.x+=(_SurfaceWaves.x+_SurfaceWaves.z*s.y)*c.x*1.57079632679/extent.x-
        _SurfaceWaves.w*sin(uv.x*3.14159265359)*3.14159265359/extent.x;
    derivative.y+=(_SurfaceWaves.y+_SurfaceWaves.z*s.x)*c.y*1.57079632679/extent.y;
    return normalize(_SurfaceUp-_SurfaceU*derivative.x-_SurfaceV*derivative.y);
}
float3 FresnelWaterWallNormal(float3 p,float3 size)
{
    float3 edge=abs(p)/(size*.5);
    return edge.x>edge.y?(edge.x>edge.z?float3(sign(p.x),0,0):float3(0,0,sign(p.z))):
        (edge.y>edge.z?float3(0,sign(p.y),0):float3(0,0,sign(p.z)));
}
float FresnelWaterCrest(float3 p,float3 size)
{
    float2 extent=max(_SurfaceExtent.xy,.000001);
    float2 uv=clamp(float2(dot(p,_SurfaceU),dot(p,_SurfaceV))/extent,-1,1);
    float2 s=sin(uv*1.57079632679),c=cos(uv*1.57079632679),k=1.57079632679/extent;
    float2 amplitude=float2(_SurfaceWaves.x+_SurfaceWaves.z*s.y,_SurfaceWaves.y+_SurfaceWaves.z*s.x);
    float2 gradient=amplitude*c*k;
    gradient.x-=_SurfaceWaves.w*sin(uv.x*3.14159265359)*2*k.x;
    float2 curvature=amplitude*s*k*k;
    curvature.x+=_SurfaceWaves.w*cos(uv.x*3.14159265359)*4*k.x*k.x;
    float scale=min(size.x,min(size.y,size.z));
    // A narrow line around convex, slow-changing wave crests. Its excitation
    // comes from accepted impacts/inertia and decays in the source-owned modes.
    float2 width=max(.002,max(curvature,0)*scale*.014);
    float2 ridge=saturate(curvature*scale*.9)*(1-smoothstep(width*.5,width*2,abs(gradient)));
    return max(ridge.x,ridge.y)*smoothstep(.08,.35,_SurfaceVisual.x)*saturate(_SurfaceVisual.y*1.5);
}
#endif
