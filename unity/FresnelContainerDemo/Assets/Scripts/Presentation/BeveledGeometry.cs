using System.Collections.Generic;
using UnityEngine;

namespace Fresnel.UnityDemo.Presentation
{
    // Small static enclosure parts share a single mesh per finish.
    internal sealed class BeveledGeometry
    {
        readonly List<Vector3> vertices=new List<Vector3>(), normals=new List<Vector3>();
        readonly List<int> triangles=new List<int>();
        public void Box(Vector3 center,Vector3 size,float radius)
        {
            Vector3 half=size*.5f;
            radius=Mathf.Min(radius,Mathf.Min(half.x,Mathf.Min(half.y,half.z))*.95f);
            Vector3 core=half-Vector3.one*radius;
            for(int axis=0;axis<3;axis++) for(int sign=-1;sign<=1;sign+=2)
            {
                int u=(axis+1)%3,v=(axis+2)%3,start=vertices.Count;
                var us=Coordinates(half[u],radius);var vs=Coordinates(half[v],radius);
                for(int y=0;y<6;y++) for(int x=0;x<6;x++)
                {
                    Vector3 p=Vector3.zero; p[axis]=half[axis]*sign;p[u]=us[x];p[v]=vs[y];
                    Vector3 q=new Vector3(Mathf.Clamp(p.x,-core.x,core.x),Mathf.Clamp(p.y,-core.y,core.y),Mathf.Clamp(p.z,-core.z,core.z));
                    Vector3 n=p-q;n*=1/Mathf.Sqrt(Mathf.Max(1e-30f,n.sqrMagnitude));vertices.Add(center+q+n*radius);normals.Add(n);
                }
                for(int y=0;y<5;y++)for(int x=0;x<5;x++)
                {
                    int a=start+y*6+x,b=a+1,c=a+6,d=c+1;
                    if(sign>0){Add(a,b,c);Add(b,d,c);}else{Add(a,c,b);Add(b,c,d);}
                }
            }
        }
        static float[] Coordinates(float half,float r) { return new[]{-half,-half+r*.36f,-half+r,half-r,half-r*.36f,half}; }
        void Add(int a,int b,int c){triangles.Add(a);triangles.Add(b);triangles.Add(c);}
        public Mesh Create(string name)
        {
            var mesh=new Mesh { name=name };
            mesh.SetVertices(vertices);mesh.SetNormals(normals);mesh.SetTriangles(triangles,0);mesh.RecalculateBounds();return mesh;
        }
    }
}
