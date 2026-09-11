using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using Fresnel.Materials;
using UnityEngine;
using Unity.Profiling;

namespace Fresnel.UnityDemo
{
    // Explicit offline review run. Never opens a hardware transport.
    public sealed class MaterialVisualBenchmark : MonoBehaviour
    {
        StudioApp app;
        string directory;
        readonly FrameTiming[] timing=new FrameTiming[1];
        readonly List<string> report=new List<string>();
        readonly List<string> errors=new List<string>();
        ProfilerRecorder allocationRecorder;
        bool uncapped;
        public void Initialize(StudioApp owner)
        {
            app=owner;
            var args=Environment.GetCommandLineArgs();int a=Array.IndexOf(args,"--evidence-dir");
            uncapped=Array.IndexOf(args,"--uncapped")>=0;
            string parent=a>=0&&a+1<args.Length?args[a+1]:Application.persistentDataPath;
            directory=Path.Combine(parent,"visual-review",DateTime.UtcNow.ToString("yyyyMMdd-HHmmss",CultureInfo.InvariantCulture));
            Directory.CreateDirectory(directory);File.WriteAllText(Path.Combine(parent,"visual-review-latest.txt"),directory);
            Application.logMessageReceived+=OnLog;
            allocationRecorder=ProfilerRecorder.StartNew(ProfilerCategory.Memory,"GC Allocated In Frame",1);
            StartCoroutine(Run());
        }
        void OnLog(string message,string stack,LogType type){if(type==LogType.Error||type==LogType.Exception||type==LogType.Assert)errors.Add(message);}
        IEnumerator Run()
        {
            yield return null;
            QualitySettings.vSyncCount=uncapped?0:1;Application.targetFrameRate=uncapped?-1:60;
            if(uncapped)Time.captureDeltaTime=1f/60;
            report.Add("Unity "+Application.unityVersion+"; "+SystemInfo.graphicsDeviceName+"; "+Screen.width+"x"+Screen.height);
            report.Add("4-second measurements after 4-second settling; "+(uncapped?"uncapped/VSync off; fixed 1/60s simulation interval per rendered frame":"60 Hz target/VSync on")+". Whole-frame GPU timings can include driver/present waits with VSync; use uncapped runs for workload comparison. No phone or hardware test.");
            report.Add("FrameTimingManager enabled: "+FrameTimingManager.IsFeatureEnabled());
            foreach(var quality in new[]{MaterialQuality.Balanced,MaterialQuality.Mobile})
                for(int selected=2;selected<=4;selected++)
                {
                    app.SelectMaterial(selected);app.MaterialActor.Quality=quality;app.Reset();app.SetMaterialTilt(Vector2.zero);
                    yield return new WaitForSecondsRealtime(4);
                    string name=StudioApp.MaterialNames[selected].ToLowerInvariant()+"-"+quality;
                    yield return Capture(name+"-rest");
                    var sim=new List<double>(512);var surface=new List<double>(512);var gpu=new List<double>(512);var wall=new List<double>(512);
                    ulong previousTimestamp=0;
                    long allocation=0;int allocationSamples=0;int collections=GC.CollectionCount(0);
                    float start=Time.realtimeSinceStartup;
                    while(Time.realtimeSinceStartup-start<4)
                    {
                        float phase=Time.realtimeSinceStartup-start;
                        app.SetMaterialTilt(new Vector2(Mathf.Sin(phase*1.8f)*22,Mathf.Sin(phase*2.1f)*34));
                        FrameTimingManager.CaptureFrameTimings();
                        yield return null;
                        sim.Add(app.MaterialActor.SimulationMs);surface.Add(app.MaterialActor.SurfaceMs);wall.Add(Time.unscaledDeltaTime*1000);
                        if(allocationRecorder.Valid&&allocationRecorder.LastValue>0){allocation+=allocationRecorder.LastValue;allocationSamples++;}
                        if(FrameTimingManager.GetLatestTimings(1,timing)>0&&timing[0].frameStartTimestamp!=previousTimestamp)
                        {previousTimestamp=timing[0].frameStartTimestamp;if(timing[0].gpuFrameTime>0)gpu.Add(timing[0].gpuFrameTime);}
                    }
                    int collected=GC.CollectionCount(0)-collections;
                    report.Add(name+": particles="+app.MaterialActor.Simulation.Count+", vertices="+app.MaterialActor.Renderer.SurfaceMesh.vertexCount+
                        ", "+Stats("simulation CPU",sim)+", "+Stats("surface CPU",surface)+", "+Stats("whole GPU",gpu)+", "+Stats("wall frame",wall)+
                        ", GC allocation counter="+(allocationSamples>0?(allocation/allocationSamples)+" bytes/frame":"unavailable/zero not established")+", GC0="+collected);
                    yield return Capture(name+"-motion");
                }
            report.Add("Runtime errors: "+errors.Count);report.AddRange(errors);
            File.WriteAllLines(Path.Combine(directory,"visual-performance.txt"),report);
            Debug.Log("FRESNEL_VISUAL_REVIEW "+(errors.Count==0?"PASS ":"FAIL ")+directory);
            Application.logMessageReceived-=OnLog;Application.Quit(errors.Count==0?0:1);
        }
        IEnumerator Capture(string name)
        {yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(directory,name+".png"));yield return null;}
        static string Stats(string label,List<double> values)
        {
            if(values.Count==0)return label+" unavailable";
            values.Sort();return label+" ms median="+values[values.Count/2].ToString("F3",CultureInfo.InvariantCulture)+
                " p95="+values[Math.Min(values.Count-1,(int)(values.Count*.95))].ToString("F3",CultureInfo.InvariantCulture);
        }
        void OnDestroy(){allocationRecorder.Dispose();Time.captureDeltaTime=0;}
    }
}
