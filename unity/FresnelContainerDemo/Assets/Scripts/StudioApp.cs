using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.EventSystems;
using Fresnel.UnityDemo.Link;
using Fresnel.UnityDemo.Presentation;
using Fresnel.UnityDemo.Profiles;
using Fresnel.Materials;

namespace Fresnel.UnityDemo
{
    public sealed class StudioApp : MonoBehaviour
    {
        public static readonly string[] MaterialNames = { "Marble", "Beads", "Water", "Sand", "Heartbeat" };
        public static readonly string[] Presets = { "granular_single_marble_box", "granular_single_marble_box", "liquid_small_box", "granular_sand_pile_box", "heartbeat_soft_object" };
        public ContainerDemo Sandbox { get; private set; }
        public HapticLinkClient Link { get; private set; }
        public HapticLinkState LinkState { get; private set; }
        public JObject Snapshot { get; private set; }
        public ContentFrame Frame { get; private set; }
        public ProfileStore Profiles { get; private set; }
        public bool DeviceMode { get; private set; }
        public int SelectedMaterial { get; private set; }
        public bool Busy { get; private set; }
        public string Message { get; private set; } = "Drag to explore. The device stays independent.";
        public bool SoundEnabled { get; private set; }
        public bool GalleryPaused { get; private set; }
        public bool GalleryAuto { get; private set; } = true;
        public float MaterialFill { get; private set; } = .48f;
        public float MaterialResponse => gallery == null ? .12f : SelectedMaterial == 3 ? gallery.Actor.Friction :
            SelectedMaterial == 4 ? gallery.Actor.Softness : gallery.Actor.Viscosity;
        public ContainerMaterialActor MaterialActor => gallery?.Actor;
        public string Endpoint { get; set; } = "";
        public string ActiveSlot { get; private set; } = "A";
        public string LastAppliedSlot { get; private set; }
        public bool IsPhysicsPreview => !DeviceMode && SelectedMaterial < 2;
        public bool Paused => IsPhysicsPreview ? Sandbox.Paused : GalleryPaused;
        public bool Auto => IsPhysicsPreview ? Sandbox.AutoTilt : GalleryAuto;
        public bool FreshDevice => DeviceMode && LinkState != null && LinkState.Connected && !LinkState.Stale;
        public bool CanStart => FreshDevice && !Busy && Frame != null && Frame.HasResolvedConfiguration && Snapshot?.Value<string>("run_mode") == "idle";
        public string CurrentDemoId => DeviceMode ? DemoId(Frame?.HasResolvedConfiguration == true ? Frame.Preset : null) : SelectedMaterial == 0 ? "marble" : SelectedMaterial == 2 ? "water" : SelectedMaterial == 3 ? "sand" : null;
        static string DemoId(string preset) => preset == "granular_single_marble_box" ? "marble" : preset == "liquid_small_box" ? "water" : preset == "granular_sand_pile_box" ? "sand" : null;
        public int ReceivedFrames { get; private set; }
        public bool IsTestLink { get; set; }
        private DevicePresentationAdapter deviceAdapter = new DevicePresentationAdapter();
        private double? previewSourceTime;
        private GalleryScene gallery;
        private SourceDrivenAudioPresenter sound;
        private float nextPoll, previewClock, nextPreview, nextUi;
        private Vector2 previewTilt, previewTarget, previewMass, dragStart, dragTilt;
        private bool dragging, allowQuit, quitting, suppressDeviceAudio;
        private readonly SceneDragInput pointer = new SceneDragInput();
        private long lastSnapshotRevision = -1;
        private uint previewFrame, previewEvents;
        private int operation;
        private float lastBeatPhase;
        private string lastPreviewEvent = "None";
        private readonly PreviewShakeMotion shake = new PreviewShakeMotion();
        private bool shakeHeld, translateDrag;
        private Vector3 dragTranslation, dragTranslationStart;
        public bool Shaking => shakeHeld || shake.Strength > .05f;
        public float ShakeFrequency { get => shake.Frequency; set => shake.Frequency=Mathf.Clamp(value,1,6); }
        public Vector3 ShakeAmplitude { get => shake.Amplitude; set => shake.Amplitude=Vector3.ClampMagnitude(value,.04f); }

        public void Initialize(ContainerDemo sandbox)
        {
            Sandbox = sandbox;
            Link = new HapticLinkClient();
            LinkState = Link.State;
            Profiles = new ProfileStore();
            gallery = new GalleryScene(sandbox.SceneCamera);
            gallery.SetVisible(false);
            sound = new SourceDrivenAudioPresenter(transform);
            gameObject.AddComponent<DemoHud>().Initialize(this);
            Application.wantsToQuit += WantsToQuit;
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "--studio-test") >= 0)
                gameObject.AddComponent<StudioVerification>().Initialize(this);
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "--materials-test") >= 0)
                gameObject.AddComponent<MaterialsVerification>().Initialize(this);
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "--visual-review") >= 0)
                gameObject.AddComponent<MaterialVisualBenchmark>().Initialize(this);
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "--shake-review") >= 0)
                gameObject.AddComponent<ShakeVerification>().Initialize(this);
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "--motion-film") >= 0)
                gameObject.AddComponent<MaterialMotionFilm>().Initialize(this);
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "--smoke-test") < 0 &&
                Array.IndexOf(Environment.GetCommandLineArgs(), "--studio-test") < 0) SelectMaterial(2);
        }

        void Update()
        {
            if (Link == null) return;
            if (Time.unscaledTime >= nextPoll)
            {
                nextPoll = Time.unscaledTime + .05f;
                LinkState = Link.State;
                if (DeviceMode) { gallery.SetStale(!FreshDevice); sound.SetStale(!FreshDevice || suppressDeviceAudio); }
                if (DeviceMode && LinkState.Snapshot != null)
                {
                    // Configuration ACK snapshots can share motion counters, so include all fields.
                    if (LinkState.SnapshotRevision != lastSnapshotRevision)
                    {
                        lastSnapshotRevision = LinkState.SnapshotRevision;
                        Snapshot = LinkState.Snapshot;
                        Frame = deviceAdapter.Accept(Snapshot);
                        ReceivedFrames++;
                        if (Frame != null && Frame.HasResolvedConfiguration)
                        {
                            int match = Array.IndexOf(Presets, Frame.Preset);
                            if (match >= 0) SelectedMaterial = match;
                            gallery.Apply(Frame, Snapshot);
                        }
                        sound.Apply(Frame);
                    }
                }
                if (DeviceMode) { gallery.SetStale(!FreshDevice); sound.SetStale(!FreshDevice || suppressDeviceAudio); }
            }
            bool typing = EventSystem.current != null && EventSystem.current.currentSelectedGameObject != null &&
                EventSystem.current.currentSelectedGameObject.GetComponent<TMPro.TMP_InputField>() != null;
            if (!typing)
            {
                if (Input.GetKeyDown(KeyCode.Escape)) RequestQuit();
                if (Input.GetKeyDown(KeyCode.Space)) TogglePause();
                if (Input.GetKeyDown(KeyCode.R)) Reset();
                if (Input.GetKeyDown(KeyCode.Tab)) ToggleAuto();
                if (Input.GetKeyDown(KeyCode.M)) ToggleSound();
                for (int i = 0; i < 5; i++) if (Input.GetKeyDown((KeyCode)((int)KeyCode.Alpha1 + i))) SelectMaterial(i);
            }
            if (!DeviceMode && !IsPhysicsPreview && !GalleryPaused)
            {
                UpdateGalleryInput(typing);
                previewClock += Time.deltaTime;
                if(!typing && Input.GetKey(KeyCode.H))GalleryAuto=false;
                if (GalleryAuto) previewTarget = new Vector2(Mathf.Sin(previewClock * .47f) * 15, Mathf.Sin(previewClock * .63f) * 22);
                previewTilt = Vector2.MoveTowards(previewTilt, previewTarget, 420 * Time.deltaTime);
                shake.Step(Time.deltaTime,shakeHeld || (!typing && Input.GetKey(KeyCode.H)),dragTranslation);
                if (Time.unscaledTime >= nextPreview)
                {
                    nextPreview = Time.unscaledTime;
                    Frame = PreviewFrame();
                    gallery.Apply(Frame, null);
                    gallery.SetStale(false);
                    // The offline display/speaker uses the just-simulated material's aggregate.
                    // This never feeds back into device telemetry or physical actuator commands.
                    if (SelectedMaterial != 4 && gallery.Actor.Simulation != null)
                    {
                        var metrics = gallery.Actor.Simulation.Metrics;
                        Frame.MassPosition = new Vector2(metrics.CenterOfMass.x / (Frame.Size.x*.5f), metrics.CenterOfMass.y / (Frame.Size.y*.5f));
                        Frame.Energy = Mathf.Clamp01(metrics.MaxSpeed / Mathf.Max(.01f,Mathf.Sqrt(9.81f*Frame.Size.y)));
                        if (SelectedMaterial == 3) Frame.GranularFlow = Frame.Energy;
                    }
                    sound.Apply(Frame);
                }
            }
        }

        void UpdateGalleryInput(bool typing)
        {
            if (typing) { pointer.Reset(); dragTranslation=Vector3.zero; return; }
            if (pointer.TryRead(Sandbox.SceneCamera.pixelRect, out Vector2 position, out bool began))
            {
                if (began) { dragStart=position;dragTilt=previewTarget;GalleryAuto=false;translateDrag=Input.GetKey(KeyCode.LeftShift)||Input.GetKey(KeyCode.RightShift);dragTranslationStart=dragTranslation; }
                Vector2 delta = position - dragStart;
                if(translateDrag)dragTranslation=Vector3.ClampMagnitude(dragTranslationStart+new Vector3(delta.x,delta.y,0)*.00011f,.027f);
                else previewTarget = dragTilt + new Vector2(delta.y, -delta.x) * .09f;
            }
            else dragTranslation=Vector3.zero;
            Vector2 keys = new Vector2((Input.GetKey(KeyCode.UpArrow) || Input.GetKey(KeyCode.W) ? 1 : 0) - (Input.GetKey(KeyCode.DownArrow) || Input.GetKey(KeyCode.S) ? 1 : 0),
                (Input.GetKey(KeyCode.LeftArrow) || Input.GetKey(KeyCode.A) ? 1 : 0) - (Input.GetKey(KeyCode.RightArrow) || Input.GetKey(KeyCode.D) ? 1 : 0));
            if (keys.sqrMagnitude > 0) { GalleryAuto = false; previewTarget += keys * 35 * Time.deltaTime; }
            previewTarget = new Vector2(Mathf.Clamp(previewTarget.x, -65, 65), Mathf.Clamp(previewTarget.y, -80, 80));
        }

        public void SelectMaterial(int selected)
        {
            if (Busy || selected < 0 || selected >= MaterialNames.Length) return;
            if (DeviceMode)
            {
                if (selected == 1) { Message = "Beads are an offline PhysX study. Choose marble, water, sand or heartbeat for the device."; return; }
                if (!Link.State.Connected) { SelectedMaterial = selected; Message = "Connect to load this material. No device setting has changed."; return; }
                Observe(async () => { LastAppliedSlot = null; await Link.LoadPresetAsync(Presets[selected]); }, "Preset accepted. Start when ready.");
                return;
            }
            SelectedMaterial = selected;
            gallery.Actor.ResetState();
            pointer.Reset();
            GalleryPaused = false;
            shake.Reset();shakeHeld=false;dragTranslation=Vector3.zero;
            previewSourceTime = null; previewClock = 0; previewFrame = previewEvents = 0; lastBeatPhase = 0;
            sound.Reset();
            suppressDeviceAudio = false;
            sound.SetStale(false);
            if (selected < 2)
            {
                Sandbox.SetVisible(true); Sandbox.SetContents(selected);
                gallery.SetVisible(false); RestoreSandboxCamera();
                Message = "Unity PhysX / independent offline exploration";
            }
            else
            {
                Sandbox.SetVisible(false); gallery.SetVisible(true); nextPreview = 0;
                Message = "Fresnel Materials / local simulation, no physical output";
            }
        }

        public async void SetDeviceMode(bool enabled)
        {
            if (enabled == DeviceMode) return;
            if (Busy && !enabled) { Message = "Use Stop to cancel the current operation first."; return; }
            if (!enabled && Link.State.Connected)
            {
                int ticket = ++operation; Busy = true;
                try { await Link.StopAsync(); await Link.DisconnectAsync(); }
                catch (Exception e) { Message = "Stop not confirmed: " + e.Message; Busy = false; return; }
                if (ticket != operation) return;
                Busy = false;
            }
            DeviceMode = enabled;
            shake.Reset();shakeHeld=false;dragTranslation=Vector3.zero;
            gallery.Actor.ResetState();
            deviceAdapter.Reset(); Snapshot = null; Frame = null; lastSnapshotRevision = -1;
            sound.Reset();
            GalleryPaused = false; dragging = false;
            if (enabled)
            {
                Sandbox.SetVisible(false); gallery.SetVisible(true); gallery.Clear();
                if (SelectedMaterial == 1) SelectedMaterial = 0;
                Message = "Choose your USB receiver, then connect. Connection never starts output.";
            }
            else SelectMaterial(SelectedMaterial);
        }

        public string[] AvailableEndpoints()
        {
            try
            {
#if UNITY_ANDROID && !UNITY_EDITOR
                return AndroidUsbTransport.GetDevices();
#elif UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
                return WindowsSerialTransport.GetPorts();
#else
                return Array.Empty<string>();
#endif
            }
            catch (Exception e) { Message = e.Message; return Array.Empty<string>(); }
        }
        public void Connect()
        {
            if (Busy) return;
            if (Link.State.Connected) { Disconnect(); return; }
            if (string.IsNullOrWhiteSpace(Endpoint)) { Message = "Choose a receiver port first."; return; }
            if (!DeviceMode) SetDeviceMode(true);
            Observe(async () => {
                IHapticTransport transport;
#if UNITY_ANDROID && !UNITY_EDITOR
                transport = new AndroidUsbTransport();
#elif UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
                transport = new WindowsSerialTransport();
#else
                throw new NotSupportedException("This build has no USB transport.");
#endif
                await Link.ConnectAsync(transport, Endpoint.Trim());
                LastAppliedSlot = null;
                deviceAdapter.Reset(); sound.Reset(); lastSnapshotRevision = -1;
                await Link.GetStateAsync();
            }, "Connected. Device state loaded; output has not been started.");
        }
        public void Disconnect()
        {
            Observe(async () => { LastAppliedSlot = null; await Link.StopAsync(); await Link.DisconnectAsync(); }, "Disconnected after an acknowledged Stop.", true);
        }
        public void RefreshState() => Observe(async () => { await Link.GetStateAsync(); }, "State refreshed.");
        public void StartDevice()
        {
            if (!CanStart) { Message = "Start needs fresh applied state in Idle. Refresh or Stop first."; return; }
            Observe(async () => { await Link.StartAsync(true, true); await Link.GetStateAsync(); suppressDeviceAudio = false; }, "Start accepted. Follow actual output status and feedback.");
        }
        public void StopDevice()
        {
            if (!DeviceMode) { if (!Paused) TogglePause(); return; }
            sound.SetStale(true);
            suppressDeviceAudio = true;
            if (Link.State.Connecting) { Observe(async () => { await Link.DisconnectAsync(); }, "Connection cancelled; no output was started.", true); return; }
            Observe(async () => { await Link.StopAsync(); await Link.GetStateAsync(); }, "Stop accepted. Check the fresh output and servo status.", true);
        }
        public void ClearFault() => Observe(async () => { await Link.StopAsync(); await Link.ClearTiltFaultAsync(); await Link.GetStateAsync(); }, "Stopped servo recheck completed.");
        public void TogglePause()
        {
            pointer.Reset();
            shakeHeld=false;
            if (DeviceMode) { StopDevice(); return; }
            if (IsPhysicsPreview) Sandbox.TogglePause();
            else GalleryPaused = !GalleryPaused;
            sound.SetStale(Paused);
        }
        public void ToggleAuto()
        {
            if (DeviceMode) { Message = "The held device controls connected motion."; return; }
            if (IsPhysicsPreview) Sandbox.ToggleAuto(); else GalleryAuto = !GalleryAuto;
        }
        public void Reset()
        {
            if (DeviceMode) { RefreshState(); return; }
            if (IsPhysicsPreview) Sandbox.ResetDemo();
            else { previewClock = 0; previewTilt = previewTarget = previewMass = Vector2.zero; previewSourceTime = null; gallery.Actor.ResetState(); nextPreview = 0; shake.Reset();shakeHeld=false;dragTranslation=Vector3.zero; }
            sound.Reset();
        }
        public void ToggleSound()
        {
            SoundEnabled = !SoundEnabled;
            if (Sandbox.SoundEnabled != SoundEnabled) Sandbox.ToggleSound();
            sound.SetEnabled(SoundEnabled);
        }

        public TuningProfile Slot(string name)
        {
            if (!Profiles.HasSlot(name)) return null;
            try { return Profiles.LoadSlot(name); } catch (Exception e) { Message = e.Message; return null; }
        }
        public void ImportProfile(string slot, string json)
        {
            try { Profiles.ImportSlot(slot, json); ActiveSlot = slot; Message = "Saved slot " + slot + ". No device values changed."; }
            catch (Exception e) { Message = "Import rejected: " + e.Message; }
        }
        public string ExportProfile(string slot)
        {
            try { return Profiles.ExportSlot(slot); } catch (Exception e) { Message = e.Message; return ""; }
        }
        public void ApplySlot(string slot)
        {
            var profile = Slot(slot);
            if (profile == null) { Message = "Import a profile into slot " + slot + " first."; return; }
            if (!FreshDevice || CurrentDemoId == null) { Message = "Read fresh applied device state before applying saved settings."; return; }
            if (profile.demo != CurrentDemoId) { Message = "This profile belongs to " + profile.demo + ". Select that device material first."; return; }
            Observe(async () => { LastAppliedSlot = null; await Link.ApplyTuningAsync(profile.preset, profile.parameters); ActiveSlot = LastAppliedSlot = slot; }, "Slot " + slot + " applied while stopped. Start is separate; 4 tilt values are read back.");
        }
        public void RestoreBaseline()
        {
            if (!FreshDevice || CurrentDemoId == null) { Message = "Baseline application requires fresh applied state for a representative material."; return; }
            string selected = CurrentDemoId;
            string preset = Frame.Preset;
            Observe(async () => { LastAppliedSlot = null; await Link.ApplyTuningAsync(preset, ProfileCodec.ShippedBaselineValues(selected)); }, "Shipped baseline applied while stopped; no previous setting backup is implied.");
        }
        public void SetMessage(string message) { Message = message; }
        private async void Observe(Func<Task> action, string success, bool supersede = false)
        {
            if (Busy && !supersede) { Message = "An operation is pending. Stop can cancel it."; return; }
            int ticket = ++operation;
            Busy = true;
            Message = "Waiting for device execution...";
            try { await action(); if (ticket == operation) Message = success; }
            catch (Exception e) { if (ticket == operation) Message = e.Message; }
            finally { if (ticket == operation) Busy = false; }
        }

        ContentFrame PreviewFrame()
        {
            float p = previewTilt.x * Mathf.Deg2Rad, r = previewTilt.y * Mathf.Deg2Rad;
            Vector3 g = new Vector3(Mathf.Sin(r) * Mathf.Cos(p), Mathf.Cos(r) * Mathf.Cos(p), -Mathf.Sin(p));
            Vector2 old = previewMass;
            float target = Mathf.Clamp(-Mathf.Sin(r) * 2.5f, -.75f, .75f);
            if (SelectedMaterial != 3 || Mathf.Abs(previewTilt.y) > 9) previewMass.x = Mathf.Lerp(previewMass.x, target, .09f);
            previewMass.y = -.45f;
            float phase = (previewClock * 1.2f) % 1;
            float primary = Mathf.Exp(-Mathf.Pow(phase / .07f, 2));
            float secondary = .6f * Mathf.Exp(-Mathf.Pow((phase - .22f) / .06f, 2));
            bool pulse = SelectedMaterial == 4 && ((phase < lastBeatPhase) || (lastBeatPhase < .22f && phase >= .22f));
            if (pulse) { previewEvents++; lastPreviewEvent = "HeartbeatPulse"; }
            lastBeatPhase = phase;
            float energy = Mathf.Clamp01(Mathf.Abs(previewMass.x - old.x) * 30 + Mathf.Abs(previewTilt.y) * .006f);
            // Offline values are already typed: building and parsing a JSON tree here
            // allocated thousands of short-lived objects every second. Real device
            // input retains its independent protocol adapter and validation.
            SourceStep step=PresentationMath.ClassifyTime(previewSourceTime,previewClock,out float elapsed);
            previewSourceTime=previewClock;
            var frame=new ContentFrame {
                Source="illustrative",Preset=Presets[SelectedMaterial],RunMode="live",
                Family=SelectedMaterial==2?"Liquid":SelectedMaterial==3?"Granular":"Custom",
                Size=new Vector3(.075f,.062f,.045f),Fill=MaterialFill,
                HasResolvedConfiguration=true,HasMotion=true,IsFreshMotion=true,HasOrientation=true,
                SourceTimeS=previewClock,ElapsedS=elapsed,SourceStep=step,FrameCounter=++previewFrame,
                BodyGravity=g,BodyAcceleration=PresentationMath.BodyToUnity(Quaternion.Inverse(PresentationMath.RotationFromBodyGravity(g))*shake.Acceleration)/9.81f,
                VisualTranslation=shake.Position,VisualMotionStrength=Mathf.Clamp01(shake.Strength+dragTranslation.magnitude*30),VesselRotation=PresentationMath.RotationFromBodyGravity(g),
                MassPosition=previewMass,Velocity=new Vector2((previewMass.x-old.x)/Mathf.Max(.001f,Time.deltaTime),0),
                Energy=energy,EventTotal=previewEvents,NewEvents=pulse?1:0,EventType=lastPreviewEvent,
                EventAmplitude=pulse?1:0,ParticleCount=.65f,ParticleHardness=.9f
            };
            if(SelectedMaterial==3){frame.PileSlope=previewMass.x*.5f;frame.GranularFlow=Mathf.Clamp01(Mathf.Abs(previewMass.x-old.x)*40);}
            if(SelectedMaterial==4)frame.Heartbeat=new HeartbeatFrame {Phase=phase,Bpm=72,BeatSequence=(uint)(previewClock*1.2f),Primary=primary,Secondary=secondary,Contraction=Mathf.Clamp01(primary+secondary)};
            return frame;
        }

        public void CycleFill()
        {
            if (DeviceMode || IsPhysicsPreview) return;
            MaterialFill = MaterialFill < .35f ? .5f : MaterialFill < .65f ? .75f : .25f;
            gallery.Actor.ResetState();
        }
        public void CycleResponse()
        {
            if (DeviceMode || IsPhysicsPreview) return;
            float response = MaterialResponse < .3f ? .55f : MaterialResponse < .8f ? .95f : .1f;
            if (SelectedMaterial == 2) gallery.Actor.Viscosity = response;
            else if (SelectedMaterial == 3) gallery.Actor.Friction = response;
            else gallery.Actor.Softness = response;
        }
        public void CycleQuality()
        {
            if (DeviceMode || IsPhysicsPreview) return;
            gallery.Actor.Quality = (MaterialQuality)(((int)gallery.Actor.Quality+1)%3);
        }
        public void SetMaterialTilt(Vector2 angles)
        {
            if (DeviceMode) return;
            GalleryAuto = false;
            previewTarget = new Vector2(Mathf.Clamp(angles.x,-65,65),Mathf.Clamp(angles.y,-80,80));
        }
        public void SetShakeHeld(bool held)
        {
            if(held && (DeviceMode || IsPhysicsPreview || GalleryPaused))return;
            shakeHeld=held;
            if(held)GalleryAuto=false;
        }

        void RestoreSandboxCamera()
        {
            var camera = Sandbox.SceneCamera;
            camera.transform.position = new Vector3(7.5f, 9.5f, -11f);
            camera.transform.LookAt(new Vector3(0, -.25f, -.35f));
            camera.orthographic=true;camera.orthographicSize = 4.85f; camera.nearClipPlane = .1f; camera.farClipPlane = 70;
        }
        public void RequestQuit() { Application.Quit(); }
        bool WantsToQuit()
        {
            if (allowQuit || Link == null || !Link.State.Connected) return true;
            if (!quitting) { quitting = true; QuitAfterStop(); }
            return false;
        }
        async void QuitAfterStop()
        {
            try { await Link.StopAsync(); } catch { /* Output state remains unknown if communication failed. */ }
            try { await Link.DisconnectAsync(); } catch { }
            allowQuit = true; Application.Quit();
        }
        async void OnApplicationPause(bool paused)
        {
            if (paused) { pointer.Reset();shakeHeld=false;dragTranslation=Vector3.zero; }
            if (!paused || Link == null || !DeviceMode) return;
            sound.SetStale(true);
            if (Link.State.Connected)
            {
                int ticket = ++operation; Busy = true; suppressDeviceAudio = true; LastAppliedSlot = null;
                string outcome = "App paused. Stopped and disconnected; reconnect deliberately.";
                try { await Link.StopAsync().ConfigureAwait(false); } catch { outcome = "App paused; Stop was not confirmed. Physical output is unknown."; }
                try { await Link.DisconnectAsync().ConfigureAwait(false); } catch { }
                if (ticket == operation) { Message = outcome; Busy = false; }
            }
        }
        void OnDestroy()
        {
            Application.wantsToQuit -= WantsToQuit;
            Link?.Dispose(); gallery?.Dispose(); sound?.Dispose(); Time.timeScale = 1;
        }
    }
}
