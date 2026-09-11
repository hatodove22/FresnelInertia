using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Fresnel.Materials;
using UnityEngine;
using UnityEngine.EventSystems;

namespace Fresnel.UnityDemo
{
    // Reproducible offline bursts, then release. No hardware transport is created.
    public sealed class ShakeVerification : MonoBehaviour
    {
        StudioApp app;
        string directory;
        bool uncapped, debugWater, noCaptures;
        readonly List<string> report=new List<string>(),errors=new List<string>();
        readonly FrameTiming[] timing=new FrameTiming[1];
        public void Initialize(StudioApp owner)
        {
            app=owner;
            string[] args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"--evidence-dir");
            string parent=i>=0&&i+1<args.Length?args[i+1]:Application.persistentDataPath;
            uncapped=Array.IndexOf(args,"--uncapped")>=0;
            debugWater=Array.IndexOf(args,"--water-normals")>=0;
            noCaptures=Array.IndexOf(args,"--no-captures")>=0;
            directory=Path.Combine(parent,"shake-review",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss"));
            Directory.CreateDirectory(directory);File.WriteAllText(Path.Combine(parent,"shake-review-latest.txt"),directory);
            Application.logMessageReceived+=Log;StartCoroutine(Run());
        }
        void Log(string value,string stack,LogType type){if(type==LogType.Error||type==LogType.Exception||type==LogType.Assert)errors.Add(value);}
        void Check(bool valid,string label){report.Add((valid?"PASS ":"FAIL ")+label);if(!valid)errors.Add(label);}
        IEnumerator Run()
        {
            yield return null;
            QualitySettings.vSyncCount=uncapped?0:1;Application.targetFrameRate=uncapped?-1:60;Time.captureDeltaTime=1f/60;
            Shader.SetGlobalFloat("_FresnelWaterDebug",debugWater?1:0);
            report.Add("Unity "+Application.unityVersion+"; "+SystemInfo.graphicsDeviceName+"; "+Screen.width+"x"+Screen.height+"; "+(uncapped?"uncapped":"VSync 60 Hz"));
            if(debugWater)report.Add("Diagnostic surface-normal color mode; water only; not the delivery appearance.");
            report.Add(noCaptures?"Timing run: screenshot capture disabled.":"Visual evidence run: screenshot capture perturbs timing; use --no-captures for measurements.");
            report.Add("Accepted source interval fixed at 1/60 s. 3 Hz translation then 5 Hz translation + 2.7 Hz rotation, held pause and 4 s release. No physical device or phone test.");
            Check(!app.DeviceMode&&!app.Link.State.Connected,"offline input only");
            app.SelectMaterial(2);app.Reset();app.SetMaterialTilt(Vector2.zero);
            var button=FindFirstObjectByType<ShakeHoldButton>().gameObject;
            var press=new PointerEventData(EventSystem.current){pointerId=7};
            ExecuteEvents.Execute(button,press,ExecuteEvents.pointerDownHandler);
            Check(app.Shaking,"real uGUI pointer-down begins the shake gesture");
            ExecuteEvents.Execute(button,new PointerEventData(EventSystem.current){pointerId=9},ExecuteEvents.pointerUpHandler);
            Check(app.Shaking,"another pointer cannot release the captured shake");
            ExecuteEvents.Execute(button,press,ExecuteEvents.pointerExitHandler);
            Check(!app.Shaking,"pointer exit releases the gesture without latching");
            app.TogglePause();ExecuteEvents.Execute(button,press,ExecuteEvents.pointerDownHandler);
            Check(!app.Shaking,"paused input cannot begin shaking");
            ExecuteEvents.Execute(button,press,ExecuteEvents.pointerUpHandler);app.TogglePause();
            foreach(MaterialQuality quality in new[]{MaterialQuality.Balanced,MaterialQuality.Mobile})
            for(int selected=2;selected<=4;selected++)
            {
                if(debugWater&&selected!=2)continue;
                app.SelectMaterial(selected);app.MaterialActor.Quality=quality;app.Reset();app.SetMaterialTilt(Vector2.zero);
                for(int n=0;n<90;n++)yield return null;
                var actor=app.MaterialActor;string name=StudioApp.MaterialNames[selected].ToLowerInvariant()+"-"+quality;
                yield return Capture(name+"-rest");
                Vector3 minimum=actor.Simulation.Metrics.CenterOfMass,maximum=minimum;
                float maxAcceleration=0,maxEnergy=0,maxSpeed=0;int maxDetails=0;
                bool finite=true,capturedDynamicPeak=false;
                var cpu=new List<double>(180);var surface=new List<double>(180);var wall=new List<double>(180);var gpu=new List<double>(180);
                ulong timestamp=0;
                app.ShakeFrequency=3;app.SetShakeHeld(true);
                for(int n=0;n<180;n++)
                {
                    if(n==90)app.ShakeFrequency=5;
                    if(n>=90)app.SetMaterialTilt(new Vector2(Mathf.Sin((n-90)/60f*2*Mathf.PI*2.7f)*8,Mathf.Sin((n-90)/60f*2*Mathf.PI*2.7f+.7f)*11));
                    FrameTimingManager.CaptureFrameTimings();yield return null;
                    Vector3 com=actor.Simulation.Metrics.CenterOfMass;minimum=Vector3.Min(minimum,com);maximum=Vector3.Max(maximum,com);
                    maxAcceleration=Mathf.Max(maxAcceleration,app.Frame.BodyAcceleration.magnitude*9.81f);
                    maxEnergy=Mathf.Max(maxEnergy,actor.Renderer.DynamicEnergy);maxDetails=Mathf.Max(maxDetails,selected==3?actor.Renderer.SandVisibleAirborneCount:actor.Renderer.DetailParticleCount);
                    maxSpeed=Mathf.Max(maxSpeed,actor.Simulation.Metrics.MaxSpeed);
                    finite &= Contained(actor.Simulation);
                    cpu.Add(actor.SimulationMs);surface.Add(actor.SurfaceMs);wall.Add(Time.unscaledDeltaTime*1000);
                    if(FrameTimingManager.GetLatestTimings(1,timing)>0&&timestamp!=timing[0].frameStartTimestamp)
                    {timestamp=timing[0].frameStartTimestamp;if(timing[0].gpuFrameTime>0)gpu.Add(timing[0].gpuFrameTime);}
                    if(n==58||n==125||n==140||n==155)yield return Capture(name+"-burst-"+n);
                    if(!capturedDynamicPeak && n>95 && (selected==3?actor.Renderer.SandAirborneCount>actor.Simulation.Count*.4f:
                        selected==2?actor.Renderer.DynamicEnergy>.00025f:false))
                    {capturedDynamicPeak=true;yield return Capture(name+"-dynamic-peak");}
                }
                Check(maxAcceleration>9.81f,name+": real source acceleration exceeds 1 g ("+maxAcceleration.ToString("F2")+" m/s2)");
                Check(finite,name+": particles finite and contained during both bursts");
                Check((maximum-minimum).magnitude>.006f,name+": content travels under rapid shaking ("+((maximum-minimum).magnitude*1000).ToString("F2")+" mm)");
                if(selected==2)Check(maxEnergy>.000001f,name+": accepted impulses excite spatial water modes");
                if(selected==3)
                {
                    Check(maxDetails>0,name+": actual unsupported grains become visible");
                    float volume=actor.Size.x*actor.Size.y*actor.Size.z*actor.Fill;
                    Check(Mathf.Abs(actor.Renderer.SandBedVolume+actor.Renderer.SandAirborneVolume-volume)<volume*.001f,name+": supported + airborne volume allocation is conserved");
                }
                report.Add(name+": max detail particles="+maxDetails+", dynamic energy="+maxEnergy.ToString("G6")+", peak speed="+maxSpeed.ToString("F3"));
                app.TogglePause();yield return null;
                var held=StateHash(actor);var heldTime=actor.SourceTime;Vector3 heldCom=actor.Simulation.Metrics.CenterOfMass;
                for(int n=0;n<12;n++)yield return null;
                Check(held==StateHash(actor)&&heldTime==actor.SourceTime&&heldCom==actor.Simulation.Metrics.CenterOfMass,name+": pause freezes modes, geometry, detail ages and solver");
                yield return Capture(name+"-held");
                app.TogglePause();app.SetShakeHeld(false);app.SetMaterialTilt(Vector2.zero);
                for(int n=0;n<240;n++){yield return null;if(n==20||n==70)yield return Capture(name+"-release-"+n);}
                yield return Capture(name+"-settled");
                Check(app.Frame.BodyAcceleration.magnitude<.0001f,name+": gesture returns to zero acceleration");
                Check(Contained(actor.Simulation),name+": release remains finite and contained");
                if(selected==3)Check(actor.Renderer.SandAirborneCount==0,name+": all airborne grains settle back into the bed");
                report.Add(name+": settled dynamic energy="+actor.Renderer.DynamicEnergy.ToString("G6")+", details="+actor.Renderer.DetailParticleCount+", speed="+actor.Simulation.Metrics.MaxSpeed.ToString("F3"));
                report.Add(name+": "+Stats("simulation CPU",cpu)+", "+Stats("surface CPU",surface)+", "+Stats("whole GPU",gpu)+", "+Stats("wall frame",wall));
            }
            report.Add("Runtime errors: "+errors.Count);report.AddRange(errors);
            File.WriteAllLines(Path.Combine(directory,"shake-review.txt"),report);
            Debug.Log("FRESNEL_SHAKE_REVIEW "+(errors.Count==0?"PASS ":"FAIL ")+directory);
            Application.logMessageReceived-=Log;Application.Quit(errors.Count==0?0:1);
        }
        static bool Contained(ContainerSimulation sim)
        {
            for(int i=0;i<sim.Count;i++)
            {
                Vector3 p=sim.Positions[i],half=sim.Size*.5f;
                if(float.IsNaN(p.sqrMagnitude)||float.IsInfinity(p.sqrMagnitude)||Mathf.Abs(p.x)>half.x+.0001f||Mathf.Abs(p.y)>half.y+.0001f||Mathf.Abs(p.z)>half.z+.0001f)return false;
            }
            return true;
        }
        static ulong StateHash(ContainerMaterialActor actor)
        {
            if(actor.Kind==MaterialKind.Water)return actor.Renderer.DynamicStateHash;
            if(actor.Kind==MaterialKind.Sand)return actor.Renderer.SandGeometryFingerprint;
            unchecked {ulong hash=1469598103934665603UL;foreach(Vector3 vertex in actor.Renderer.SurfaceMesh.vertices){hash=(hash^(uint)vertex.x.GetHashCode())*1099511628211UL;hash=(hash^(uint)vertex.y.GetHashCode())*1099511628211UL;hash=(hash^(uint)vertex.z.GetHashCode())*1099511628211UL;}return hash;}
        }
        IEnumerator Capture(string name)
        {if(noCaptures)yield break;yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(directory,name+".png"));yield return null;}
        static string Stats(string name,List<double> values)
        {values.Sort();return name+(values.Count==0?" unavailable":" ms median="+values[values.Count/2].ToString("F3",CultureInfo.InvariantCulture)+" p95="+values[Math.Min(values.Count-1,(int)(values.Count*.95))].ToString("F3",CultureInfo.InvariantCulture));}
        void OnDestroy(){Time.captureDeltaTime=0;Application.logMessageReceived-=Log;}
    }
}
