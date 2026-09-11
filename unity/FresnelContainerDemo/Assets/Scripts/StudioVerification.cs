using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;
using Fresnel.UnityDemo.Link;
using Fresnel.UnityDemo.Profiles;

namespace Fresnel.UnityDemo
{
    // Explicit opt-in player verification. Never enumerates or opens a physical receiver.
    public sealed class StudioVerification : MonoBehaviour
    {
        StudioApp app;
        string directory;
        readonly List<string> checks=new List<string>();
        readonly List<string> errors=new List<string>();
        readonly List<string> performance=new List<string>();
        bool finished;
        public void Initialize(StudioApp owner)
        {
            app=owner;
            string[] args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"--evidence-dir");
            directory=i>=0&&i+1<args.Length?args[i+1]:Path.Combine(Application.persistentDataPath,"StudioEvidence");
            Directory.CreateDirectory(directory);Application.logMessageReceived+=OnLog;
            StartCoroutine(Run());
        }
        void OnLog(string message,string stack,LogType type) { if(type==LogType.Error||type==LogType.Exception||type==LogType.Assert)errors.Add(message+"\n"+stack); }
        void Check(bool value,string label) {checks.Add((value?"PASS ":"FAIL ")+label);if(!value)errors.Add(label);}
        IEnumerator Capture(string name) {yield return new WaitForEndOfFrame();ScreenCapture.CaptureScreenshot(Path.Combine(directory,name+".png"));yield return new WaitForSecondsRealtime(.3f);}
        IEnumerator Await(Task task,string label)
        {
            float deadline=Time.realtimeSinceStartup+18;
            while(!task.IsCompleted&&Time.realtimeSinceStartup<deadline)yield return null;
            Check(task.IsCompleted&&!task.IsFaulted&&!task.IsCanceled,label+(task.Exception!=null?": "+task.Exception.GetBaseException().Message:""));
        }
        IEnumerator AwaitUi(string label)
        {
            float deadline=Time.realtimeSinceStartup+18;
            while(app.Busy&&Time.realtimeSinceStartup<deadline)yield return null;
            yield return new WaitForSecondsRealtime(.25f);
            Check(!app.Busy,label+" completes");
        }
        IEnumerator Run()
        {
            yield return new WaitForSecondsRealtime(.5f);
            Check(!app.DeviceMode&&!app.Link.Connected,"Default is offline; no device opened");
            var hud=app.GetComponent<DemoHud>();
            for(int material=2;material<5;material++)
            {
                app.SelectMaterial(material);yield return new WaitForSecondsRealtime(2.4f);
                Check(app.Frame!=null&&app.Frame.HasMotion&&app.Frame.HasResolvedConfiguration,"Preview resolves "+StudioApp.MaterialNames[material]);
                Check(app.Frame.Source=="illustrative","Preview explicitly marks illustrative source "+material);
                Check(!app.Sandbox.SandboxRoot.gameObject.activeSelf,"PhysX is disabled in gallery "+material);
                yield return Measure(StudioApp.MaterialNames[material]);
                yield return Capture("studio-0"+(material-1)+"-"+StudioApp.MaterialNames[material].ToLowerInvariant());
            }
            app.TogglePause();double held=app.Frame.SourceTimeS;yield return new WaitForSecondsRealtime(.4f);
            Check(app.Frame.SourceTimeS==held,"Gallery pause freezes source time");app.TogglePause();
            hud.ShowProfiles(true);yield return Capture("studio-04-profiles");hud.ShowProfiles(false);
            var store=new ProfileStore(Path.Combine(directory,"profile-runtime"));
            var profile=ProfileCodec.ShippedBaselineProfile("water");
            store.ImportSlot("A",ProfileCodec.Serialize(profile));
            Check(ProfileCodec.Parse(store.ExportSlot("A")).demo=="water","Profile roundtrip persists validated local slot");
            var bridge=new DemoLoopbackTransport();
            app.SetDeviceMode(true);app.IsTestLink=true;
            yield return Capture("studio-05-waiting");
            yield return Await(app.Link.ConnectAsync(bridge,"loopback"),"Mock connection");
            yield return Await(app.Link.GetStateAsync(),"Mock initial applied state");
            yield return new WaitForSecondsRealtime(.35f);
            Check(app.FreshDevice&&app.Frame!=null&&app.Frame.HasResolvedConfiguration,"Runtime consumes fresh link state");
            Check(!bridge.Commands.Contains("live")&&!bridge.Commands.Contains("audio on")&&!bridge.Commands.Contains("tilt on"),"Connect observes only; no output arming");
            Check(app.CanStart,"Fresh idle applied state enables Start");
            app.StartDevice();yield return AwaitUi("Start UI");
            Check(app.Snapshot?.Value<string>("run_mode")=="live","Start reaches mock live state");
            app.SetMessage("MOCK LINK / automated test data; no hardware is connected.");
            yield return new WaitForSecondsRealtime(1);yield return Capture("studio-06-mock-live");
            app.StopDevice();yield return AwaitUi("Stop UI");
            Check(app.Snapshot?.Value<string>("run_mode")=="idle","Stop reaches mock idle state");
            app.SelectMaterial(2);yield return AwaitUi("Water preset UI");
            Check(app.SelectedMaterial==2&&app.Frame.Preset=="liquid_small_box","Accepted applied preset controls presentation");
            yield return Await(app.Link.ApplyTuningAsync(profile.preset,profile.parameters),"Compatible profile ACK/readback transaction");
            yield return new WaitForSecondsRealtime(.25f);
            Check(app.Snapshot?.Value<string>("run_mode")=="idle","Profile application stays stopped");
            bridge.EmitTelemetry=false;
            yield return new WaitForSecondsRealtime(2.2f);
            Check(app.LinkState.Stale&&!app.CanStart,"Stale state disables Start");
            // First let the final already-received sample reach the main-thread projection.
            // The freeze interval starts after staleness, not before that queued sample is shown.
            double last=app.Frame.SourceTimeS;
            yield return new WaitForSecondsRealtime(.45f);
            Check(app.Frame.SourceTimeS==last,"Stale source does not animate independently");
            app.SetMessage("MOCK LINK / stale test; the last state is held.");yield return Capture("studio-07-mock-stale");
            bridge.Fail("Synthetic unplug for runtime verification");yield return new WaitForSecondsRealtime(.2f);
            Check(!app.LinkState.Connected,"Unplug closes mock session");
            app.SetDeviceMode(false);app.IsTestLink=false;app.SelectMaterial(0);
            yield return new WaitForSecondsRealtime(.3f);
            Check(app.IsPhysicsPreview&&app.Sandbox.SandboxRoot.gameObject.activeSelf,"Return restores original offline physics");
            Screen.SetResolution(960,600,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.5f);
            yield return Capture("studio-08-compact");
            app.SelectMaterial(2);
            Screen.SetResolution(1600,900,FullScreenMode.Windowed);yield return new WaitForSecondsRealtime(.7f);
            yield return Capture("studio-09-wide");
            Finish();
        }
        IEnumerator Measure(string material)
        {
            var timings=new List<float>();long memory=UnityEngine.Profiling.Profiler.GetMonoUsedSizeLong();
            float until=Time.realtimeSinceStartup+1.5f;
            while(Time.realtimeSinceStartup<until){yield return null;timings.Add(Time.unscaledDeltaTime*1000);}
            timings.Sort();
            if(timings.Count>0)performance.Add(material+": "+timings.Count+" frames; wall-frame ms median="+timings[timings.Count/2].ToString("0.00")+", p95="+timings[Mathf.Min(timings.Count-1,(int)(timings.Count*.95f))].ToString("0.00")+"; managed live-heap delta="+(UnityEngine.Profiling.Profiler.GetMonoUsedSizeLong()-memory)+" bytes (not allocation rate)");
        }
        void Update() { if(!finished&&Time.realtimeSinceStartup>110){errors.Add("Studio runtime verification timed out");Finish();} }
        void Finish()
        {
            if(finished)return;finished=true;
            Check(checks.Count>=27,"Studio sequence completed");
            File.WriteAllText(Path.Combine(directory,"studio-runtime.txt"),"Software-only Unity player tests; USB/actuators are mocked.\n"+string.Join("\n",checks)+"\nERRORS: "+errors.Count+"\n"+string.Join("\n",errors));
            File.WriteAllText(Path.Combine(directory,"studio-performance.txt"),SystemInfo.operatingSystem+"\n"+SystemInfo.graphicsDeviceName+"\nDesktop player / 1280x800 / VSync and 60fps target / short warm gallery samples. Not phone benchmarks.\n"+string.Join("\n",performance));
            Application.logMessageReceived-=OnLog;Application.Quit(errors.Count==0?0:1);
        }
    }
}
