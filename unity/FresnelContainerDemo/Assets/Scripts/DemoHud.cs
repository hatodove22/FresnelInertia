using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;
using Fresnel.UnityDemo.Profiles;

namespace Fresnel.UnityDemo
{
    public sealed class DemoHud : MonoBehaviour
    {
        private StudioApp app;
        private RectTransform root, preview, device, modal, sidebar, telemetryCard, statusPill, materialTools;
        private TMP_Text fillLabel, responseLabel, qualityLabel, shakeLabel, gestureHint;
        private TMP_Text title, subtitle, source, state, message, metric1, detail1, metric2, detail2, channels, footer, planeCaption;
        private TMP_Text autoLabel, pauseLabel, soundLabel, connectLabel, profileInfo, profileMessage;
        private TMP_InputField endpoint, json;
        private Sprite rounded;
        private TMP_FontAsset font;
        private readonly Dictionary<string, UnityEngine.UI.Button> buttons = new Dictionary<string, UnityEngine.UI.Button>(StringComparer.OrdinalIgnoreCase);
        private readonly UnityEngine.UI.Image[] material = new UnityEngine.UI.Image[5], meters = new UnityEngine.UI.Image[4];
        private readonly TMP_Text[] meterLabels = new TMP_Text[4];
        private UnityEngine.UI.Image exploreImage, deviceImage, slotA, slotB;
        private TMP_Text exploreText, deviceText;
        private string slot = "A";
        private float nextUpdate;
        private static readonly Color Ink = new Color(.075f,.17f,.18f), Teal = new Color(.055f,.39f,.37f), Muted = new Color(.37f,.44f,.42f);
        private static readonly Color Paper = new Color(.963f,.955f,.926f), Soft = new Color(.895f,.918f,.877f), Active = new Color(.69f,.82f,.75f), Coral = new Color(.75f,.23f,.16f);

        public void Initialize(StudioApp owner)
        {
            app = owner;
            var go = new GameObject("Fresnel Studio UI", typeof(RectTransform), typeof(Canvas), typeof(UnityEngine.UI.CanvasScaler), typeof(UnityEngine.UI.GraphicRaycaster));
            go.transform.SetParent(transform, false); go.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scale = go.GetComponent<UnityEngine.UI.CanvasScaler>();
            scale.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize; scale.referenceResolution = new Vector2(1280,800);
            scale.screenMatchMode = UnityEngine.UI.CanvasScaler.ScreenMatchMode.Expand;
            root = go.GetComponent<RectTransform>();
            if (FindObjectOfType<EventSystem>() == null) new GameObject("UI Events", typeof(EventSystem), typeof(StandaloneInputModule));
            font = Resources.Load<TMP_FontAsset>("Fonts & Materials/LiberationSans SDF"); rounded = RoundedSprite();
            Sidebar(); Stage(); Profiles(); Refresh();
        }
        private void Sidebar()
        {
            var sidebarImage=Panel("Sidebar",root,0,0,356,800,Paper,false);sidebarImage.raycastTarget=true;sidebar=sidebarImage.rectTransform;
            Label(root,"F R E S N E L   /   S T U D I O",32,28,298,22,12,Muted,FontStyles.Bold);
            Label(root,"Feel what\nmoves.",29,65,301,119,50,Ink,FontStyles.Bold);
            exploreImage = Button("Explore",root,32,197,141,40,()=>app.SetDeviceMode(false),out exploreText).GetComponent<UnityEngine.UI.Image>();
            deviceImage = Button("Device",root,181,197,141,40,()=>app.SetDeviceMode(true),out deviceText).GetComponent<UnityEngine.UI.Image>();
            Label(root,"01   /   CHOOSE A MATERIAL",32,260,294,22,12,Muted,FontStyles.Bold);
            for(int i=0;i<5;i++)
            {
                int index=i;
                material[i]=Button(StudioApp.MaterialNames[i],root,i==4||i%2==0?32:181,291+i/2*47,i==4?290:141,39,()=>app.SelectMaterial(index),out _).GetComponent<UnityEngine.UI.Image>();
            }
            buttons["One marble"]=buttons["Marble"]; buttons["24 beads"]=buttons["Beads"];
            preview=Group("Preview controls",root,32,447,290,243);
            Label(preview,"02   /   EXPLORE THE MOTION",0,0,290,22,12,Muted,FontStyles.Bold);
            Button("Auto tilt",preview,0,33,141,42,app.ToggleAuto,out autoLabel);
            var shakeButton=Button("Shake",preview,149,33,141,42,()=>{},out shakeLabel);
            shakeButton.gameObject.AddComponent<ShakeHoldButton>().App=app;
            Button("Pause",preview,0,85,141,42,app.TogglePause,out pauseLabel); Button("Reset",preview,149,85,141,42,app.Reset,out _);
            gestureHint=Label(preview,"Drag to tilt. Hold Shake to toss.\nShift + drag to move the vessel.",0,146,290,46,15,Muted);
            Label(preview,"SPACE pause  R reset  TAB auto  H shake\n1-5 material    M speaker sound",0,207,290,38,12,Muted);
            device=Group("Device controls",root,32,447,290,243);
            Label(device,"02   /   HAPTIC LINK",0,0,290,22,12,Muted,FontStyles.Bold);
            endpoint=Input("Receiver endpoint",device,0,31,212,38,"COM port / USB device",false); endpoint.onValueChanged.AddListener(value=>app.Endpoint=value);
            Button("Scan",device,220,31,70,38,Scan,out _);
            Button("Connect",device,0,80,290,40,app.Connect,out connectLabel);
            var start=Button("Start",device,0,131,141,43,app.StartDevice,out var startText); start.GetComponent<UnityEngine.UI.Image>().color=Teal; startText.color=Color.white;
            var stop=Button("Stop",device,149,131,141,43,app.StopDevice,out var stopText); stop.GetComponent<UnityEngine.UI.Image>().color=Coral; stopText.color=Color.white;
            Button("Read state",device,0,185,141,37,app.RefreshState,out _); Button("Servo recheck",device,149,185,141,37,app.ClearFault,out _);
            Label(device,"Start requests vibration + tilt. SPACE stops.",0,232,290,20,11,Muted);
            Button("Sound off",root,32,715,141,38,app.ToggleSound,out soundLabel); Button("Profiles",root,181,715,141,38,()=>ShowProfiles(true),out _);
            footer=Label(root,"OUTPUT-FREE EXPLORATION",32,771,292,18,11,Teal,FontStyles.Bold);
        }
        private void Stage()
        {
            source=Label(root,"UNITY / OFFLINE EXPLORATION",392,31,566,23,12,Teal,FontStyles.Bold);
            title=Label(root,"One marble.",389,66,775,42,31,Ink,FontStyles.Bold);
            subtitle=Label(root,"A small journey. A distinct contact. A gentle return.",392,116,818,48,17,Muted);
            materialTools=Group("Material studio controls",root,392,172,830,38);
            Button("Material fill",materialTools,0,0,142,34,app.CycleFill,out fillLabel);
            Button("Material response",materialTools,153,0,211,34,app.CycleResponse,out responseLabel);
            Button("Material quality",materialTools,375,0,192,34,app.CycleQuality,out qualityLabel);
            var pill=Panel("Source status",root,1010,28,233,34,new Color(.87f,.915f,.86f),true);
            statusPill=pill.rectTransform;
            state=Label(pill.rectTransform,"EXPLORING",10,0,213,34,11,Teal,FontStyles.Bold); state.alignment=TextAlignmentOptions.Center;
            planeCaption=Label(root,"CONTACT PLANES  /  AN ILLUSTRATION OF THE SHARED STATE",395,612,829,20,10,Muted);
            var card=Panel("Telemetry card",root,390,642,853,133,new Color(.977f,.98f,.96f,.97f),true).rectTransform;
            telemetryCard=card;
            Label(card,"SOURCE / MOTION",20,14,194,19,10,Muted,FontStyles.Bold);
            metric1=Label(card,"EXPLORING",20,38,197,33,23,Ink,FontStyles.Bold); detail1=Label(card,"Independent Unity motion",20,76,208,18,11,Muted);
            Label(card,"CONTENTS",238,14,230,19,10,Muted,FontStyles.Bold);
            metric2=Label(card,"CENTERED",238,40,226,29,20,Ink); detail2=Label(card,"",238,76,233,18,11,Muted);
            channels=Label(card,"OBSERVED WALL CONTACTS",491,14,337,19,10,Muted,FontStyles.Bold);
            for(int i=0;i<4;i++)
            {
                Panel("Channel track "+i,card,491+81*i,45,61,11,new Color(.83f,.87f,.83f),true);
                meters[i]=Panel("Channel value "+i,card,491+81*i,45,0,11,Teal,true);
                meterLabels[i]=Label(card,"",491+81*i,72,73,19,10,Muted);
            }
            message=Label(card,"",20,106,814,19,11,Muted); message.enableWordWrapping=false;
        }
        private void Profiles()
        {
            // Leaves the sidebar Stop reachable while JSON is being reviewed.
            modal=Panel("A/B profiles",root,381,151,873,477,Paper,true).rectTransform; modal.GetComponent<UnityEngine.UI.Image>().raycastTarget=true;
            Label(modal,"Carry a setting forward.",24,21,706,40,28,Ink,FontStyles.Bold);
            Button("Close profiles",modal,757,22,91,37,()=>ShowProfiles(false),out var close); close.text="Close";
            slotA=Button("Slot A",modal,24,76,128,38,()=>SelectSlot("A"),out _).GetComponent<UnityEngine.UI.Image>();
            slotB=Button("Slot B",modal,163,76,128,38,()=>SelectSlot("B"),out _).GetComponent<UnityEngine.UI.Image>();
            profileInfo=Label(modal,"Empty slot / import a Web profile",313,77,532,42,12,Muted);
            json=Input("Profile JSON",modal,24,132,824,176,"Paste selected-profile JSON from the Web tuning workspace.",true);
            Button("Paste JSON",modal,24,321,195,38,()=>json.text=GUIUtility.systemCopyBuffer??"",out _);
            Button("Save slot",modal,233,321,195,38,()=>{app.ImportProfile(slot,json.text);RefreshProfile();},out _);
            Button("Copy JSON",modal,442,321,195,38,CopySlot,out _); Button("Apply slot",modal,651,321,197,38,()=>app.ApplySlot(slot),out _);
            Button("Baseline JSON",modal,24,371,195,38,BaselineJson,out _); Button("Use baseline",modal,233,371,195,38,app.RestoreBaseline,out _);
            Label(modal,"Applies while stopped. Start remains separate.\nRehearsal profiles are not tactile evaluation.",449,371,397,44,12,Muted);
            profileMessage=Label(modal,"",24,429,824,36,12,Muted); modal.gameObject.SetActive(false);
        }
        void LateUpdate()
        {
            if(root==null||app==null||root.rect.width<=356)return;
            // Canvas Expand keeps all controls visible at wide phone/desktop ratios.
            // Align the 3D viewport to its actual sidebar, rather than a fixed screen percentage.
            float left=356/root.rect.width;
            app.Sandbox.SceneCamera.rect=new Rect(left,0,1-left,1);
            sidebar.sizeDelta=new Vector2(356,root.rect.height);
            float cardWidth=root.rect.width-427;
            telemetryCard.sizeDelta=new Vector2(cardWidth,133);
            message.rectTransform.sizeDelta=new Vector2(cardWidth-40,19);
            statusPill.anchoredPosition=new Vector2(root.rect.width-270,-28);
        }
        void Update(){if(app!=null&&Time.unscaledTime>=nextUpdate){nextUpdate=Time.unscaledTime+.1f;Refresh();}}
        private void Refresh()
        {
            bool isDevice=app.DeviceMode, physics=app.IsPhysicsPreview;
            preview.gameObject.SetActive(!isDevice);device.gameObject.SetActive(isDevice);
            exploreImage.color=isDevice?Soft:Teal; exploreText.color=isDevice?Ink:Color.white;deviceImage.color=isDevice?Teal:Soft;deviceText.color=isDevice?Color.white:Ink;
            string[] titles={"One marble.","A handful of beads.","Water, in motion.","A landscape that remembers.","A pulse you can see."};
            string[] descriptions={"A small journey. A distinct contact. A gentle return.","Twenty-four independent bodies. One moving center of mass.","A contained surface follows tilt, lag and the changing load.","Grains yield, settle and retain the shape of their last movement.","A fictional double pulse: main beat, softer echo, shared contraction."};
            int selected=Mathf.Clamp(app.SelectedMaterial,0,4); title.text=titles[selected];subtitle.text=descriptions[selected];
            if(isDevice&&app.Frame!=null&&Array.IndexOf(StudioApp.Presets,app.Frame.Preset)<0)title.text=app.Frame.Preset;
            for(int i=0;i<5;i++){material[i].color=selected==i?Active:Soft;buttons[StudioApp.MaterialNames[i]].interactable=!app.Busy&&!(isDevice&&i==1);}
            source.text=isDevice?(app.IsTestLink?"MOCK / TEST LINK · NO PHYSICAL DEVICE":"HAPTIC LINK / DEVICE STATE"):physics?"UNITY PHYSX / OFFLINE EXPLORATION":"FRESNEL MATERIALS / LOCAL SIMULATION";
            materialTools.gameObject.SetActive(!isDevice&&!physics);
            fillLabel.text="Fill   "+Mathf.RoundToInt(app.MaterialFill*100)+"%";
            responseLabel.text=(selected==2?"Viscosity":selected==3?"Friction":"Softness")+"   "+app.MaterialResponse.ToString("0.00");
            qualityLabel.text="Quality   "+(app.MaterialActor==null?"Balanced":app.MaterialActor.Quality.ToString());
            footer.text=isDevice?(app.IsTestLink?"MOCK TRANSPORT / NO HARDWARE":"DEVICE OWNS PHYSICAL OUTPUT"):"OUTPUT-FREE EXPLORATION";
            planeCaption.text=isDevice?"DEVICE STATE: GOLD DOT / VISUAL PARTICLES: DETAIL · SHAFT: BRASS GOAL / TEAL FEEDBACK":physics?"CONTACT PLANES  /  AN ILLUSTRATION OF THE SHARED STATE":"FRESNEL CONTAINER MATERIALS  /  WATER · GRANULAR · SOFT BODY";
            autoLabel.text=app.Auto?"Auto tilt   ON":"Auto tilt   OFF";pauseLabel.text=app.Paused?"Resume":"Pause";soundLabel.text=app.SoundEnabled?"Speaker   ON":"Speaker   OFF";
            buttons["Shake"].interactable=!isDevice&&!physics&&!app.Paused;
            shakeLabel.text=app.Paused?"Shake paused":app.Shaking?"Shaking...":"Hold to shake";
            gestureHint.text=physics?"Drag the scene or use arrow keys.\nPause to look closer; reset to begin again.":"Drag to tilt. Hold Shake to toss.\nShift + drag to move the vessel.";
            bool connected=app.LinkState!=null&&app.LinkState.Connected;
            connectLabel.text=connected?"Disconnect":app.Busy?"Connecting...":"Connect receiver";
            buttons["Connect"].interactable=!app.Busy;buttons["Scan"].interactable=!app.Busy&&!connected;endpoint.interactable=!app.Busy&&!connected;
            if(!endpoint.isFocused&&endpoint.text!=app.Endpoint)endpoint.SetTextWithoutNotify(app.Endpoint??"");
            buttons["Start"].interactable=app.CanStart;buttons["Stop"].interactable=true;
            buttons["Read state"].interactable=connected&&!app.Busy;
            buttons["Servo recheck"].interactable=connected&&!app.Busy&&app.FreshDevice&&Text(app.Snapshot?["run_mode"])=="idle";
            buttons["Explore"].interactable=!app.Busy;buttons["Device"].interactable=!app.Busy;
            message.text=app.Message??"";
            if(isDevice)DeviceStatus(connected);else PreviewStatus(physics);
            if(modal.gameObject.activeSelf)RefreshProfile();
        }
        private void PreviewStatus(bool physics)
        {
            state.text=app.Paused?"PAUSED / OUTPUT-FREE":app.Auto?"AUTO / OUTPUT-FREE":"YOUR MOTION / OUTPUT-FREE";state.color=Teal;
            metric1.text=physics?app.Sandbox.Tilt.y.ToString("+0.0;-0.0;0.0")+"° roll":app.Paused?"PAUSED":"EXPLORING";
            detail1.text=physics?"Unity PhysX / scene units":app.MaterialActor?.Simulation==null?"Preparing material":app.MaterialActor.Simulation.Count+" particles / no hardware";
            metric2.text=physics?"X "+app.Sandbox.CenterOfMass.x.ToString("+0.00;-0.00;0.00")+"   Z "+app.Sandbox.CenterOfMass.z.ToString("+0.00;-0.00;0.00"):app.Frame==null?"WAITING":Mathf.RoundToInt(app.Frame.Fill*100)+"% fill";
            detail2.text=physics?app.Sandbox.CollisionCount+" observed contacts":app.MaterialActor==null?"":(app.MaterialActor.SimulationMs+app.MaterialActor.SurfaceMs).ToString("0.0")+" ms simulation + surface";
            channels.text=physics?"OBSERVED WALL CONTACTS":"PHYSICAL OUTPUT / NOT CONNECTED";
            string[] walls={"LEFT","RIGHT","FAR","NEAR"};for(int i=0;i<4;i++)Meter(i,physics?(float?)app.Sandbox.Contacts[i]:null,physics?walls[i]:"CH "+(i+1));
        }
        private void DeviceStatus(bool connected)
        {
            bool fresh=app.FreshDevice;string mode=Text(app.Snapshot?["run_mode"]);
            state.text=!connected?"DISCONNECTED / VIEW HELD":!fresh?"STALE / OUTPUT UNCONFIRMED":app.Busy?"APPLYING / PLEASE WAIT":"DEVICE / "+mode.ToUpperInvariant();state.color=fresh?Teal:Coral;
            metric1.text=!connected?"NO LINK":!fresh?"STALE":mode.ToUpperInvariant();
            bool? runtime=fresh?Flag(app.Snapshot?["audio"]?["runtime_enabled"]):null,silenced=fresh?Flag(app.Snapshot?["audio"]?["output_silenced"]):null;
            detail1.text=!fresh?"Output state is unconfirmed":"Audio "+(silenced==true?"silenced":runtime==true&&silenced==false?"enabled":runtime==false?"disabled":"unknown")+" · age "+app.LinkState.LastTelemetryAge.ToString("0.0")+"s";
            metric2.text=app.Frame!=null&&app.Frame.HasResolvedConfiguration?Mathf.RoundToInt(app.Frame.Fill*100)+"% fill":"SIZE UNKNOWN";
            detail2.text="Shaft torque L / R: "+Servo(0,fresh)+" / "+Servo(1,fresh);
            float? fault=fresh?Number(app.Snapshot?["tilt_servo"]?["fault"]):null;
            if(fault.HasValue&&fault.Value!=0)message.text="SERVO FAULT "+fault.Value.ToString("0")+(fault.Value==2?" / communication":"")+" · "+app.Message;
            if(app.Frame!=null&&app.Frame.HasResolvedConfiguration)
            {
                Vector3 size=app.Frame.Size*1000;
                subtitle.text=(app.SelectedMaterial==4?"Named device pulse state; no independent beat clock.":"Applied device motion drives this view. Hold and tilt the container.")+"\nApplied vessel  "+size.x.ToString("0.#")+" × "+size.y.ToString("0.#")+" × "+size.z.ToString("0.#")+" mm";
            }
            channels.text="4 REPORTED VIBRATION CHANNELS";var values=app.Snapshot?["actuators"] as JArray;
            for(int i=0;i<4;i++)Meter(i,fresh&&values!=null&&values.Count==4?Number(values[i]):null,"CH "+(i+1));
        }
        private string Servo(int index,bool fresh)
        {
            var devices=app.Snapshot?["tilt_servo"]?["devices"] as JArray;
            float? age=Number(app.Snapshot?["tilt_servo"]?["status_age_ms"]);
            if(!fresh||!age.HasValue||age.Value<0||age.Value>250||devices==null||devices.Count<=index||Flag(devices[index]?["status_valid"])!=true)return "unknown";
            bool? torque=Flag(devices[index]?["torque_enabled"]);return torque==true?"on":torque==false?"off":"unknown";
        }
        private void Meter(int i,float? value,string label){meters[i].rectTransform.sizeDelta=new Vector2(value.HasValue?61*Mathf.Clamp01(value.Value):0,11);meters[i].color=Color.Lerp(Teal,Coral,value??0);meterLabels[i].text=value.HasValue?label:label+"  ?";}
        private void Scan()
        {
            string[] ports=app.AvailableEndpoints();if(ports.Length==0){app.SetMessage("No USB receiver found. Attach StampC5, then scan again.");return;}
            int index=Array.IndexOf(ports,app.Endpoint);app.Endpoint=ports[index>=0?(index+1)%ports.Length:0];endpoint.SetTextWithoutNotify(app.Endpoint);
            app.SetMessage("Selected "+app.Endpoint+". Scan cycles receivers; Connect reads state only.");
        }
        public void ShowProfiles(bool visible)
        {
            modal.gameObject.SetActive(visible);if(visible){slot=app.ActiveSlot??"A";LoadSlot();RefreshProfile();}else if(EventSystem.current!=null)EventSystem.current.SetSelectedGameObject(null);
        }
        private void SelectSlot(string selected){slot=selected;LoadSlot();RefreshProfile();}
        private void LoadSlot(){json.text=app.Slot(slot)==null?"":app.ExportProfile(slot);}
        private void CopySlot(){string text=app.ExportProfile(slot);if(string.IsNullOrEmpty(text))return;GUIUtility.systemCopyBuffer=text;json.text=text;app.SetMessage("Slot "+slot+" JSON copied. No device setting changed.");}
        private void BaselineJson()
        {
            if(app.CurrentDemoId==null){app.SetMessage("Choose marble, water or sand to inspect its shipped baseline.");return;}
            try{json.text=ProfileCodec.Serialize(ProfileCodec.ShippedBaselineProfile(app.CurrentDemoId));app.SetMessage("Authored baseline JSON loaded for review. Save to a slot or apply explicitly.");}catch(Exception e){app.SetMessage(e.Message);}
        }
        private void RefreshProfile()
        {
            slotA.color=slot=="A"?Active:Soft;slotB.color=slot=="B"?Active:Soft;var profile=app.Slot(slot);
            profileInfo.text=profile==null?"Slot "+slot+" / empty\nImport a selected-profile JSON from Web tuning.":profile.demo.ToUpperInvariant()+" / "+profile.reviewStatus+"\n"+profile.comparisonCount+" comparisons · "+profile.sourceSession.mode+" · last applied: "+(app.LastAppliedSlot??"none");
            bool connected=app.DeviceMode&&app.LinkState!=null&&app.LinkState.Connected;
            buttons["Apply slot"].interactable=connected&&!app.Busy&&profile!=null&&profile.demo==app.CurrentDemoId;buttons["Copy JSON"].interactable=profile!=null;
            buttons["Use baseline"].interactable=connected&&!app.Busy&&app.CurrentDemoId!=null;buttons["Baseline JSON"].interactable=app.CurrentDemoId!=null;profileMessage.text=app.Message??"";
        }
        public void ActivateButton(string name){UnityEngine.UI.Button button;if(!buttons.TryGetValue(name,out button))throw new InvalidOperationException("Missing UI button: "+name);button.onClick.Invoke();}
        private UnityEngine.UI.Button Button(string name,RectTransform parent,float x,float y,float w,float h,UnityEngine.Events.UnityAction action,out TMP_Text label)
        {
            var image=Panel(name,parent,x,y,w,h,Soft,true);image.raycastTarget=true;var button=image.gameObject.AddComponent<UnityEngine.UI.Button>();button.targetGraphic=image;button.onClick.AddListener(action);buttons[name]=button;
            var colors=button.colors;colors.highlightedColor=new Color(.94f,1,.95f);colors.pressedColor=new Color(.74f,.84f,.79f);colors.disabledColor=new Color(.77f,.8f,.77f,.62f);button.colors=colors;
            button.navigation=new UnityEngine.UI.Navigation{mode=UnityEngine.UI.Navigation.Mode.None};label=Label(image.rectTransform,name,5,0,w-10,h,14,Ink,FontStyles.Bold);label.alignment=TextAlignmentOptions.Center;return button;
        }
        private TMP_InputField Input(string name,RectTransform parent,float x,float y,float w,float h,string placeholder,bool multiline)
        {
            var background=Panel(name,parent,x,y,w,h,new Color(.996f,.996f,.98f),true);background.raycastTarget=true;
            var input=background.gameObject.AddComponent<TMP_InputField>();input.targetGraphic=background;
            var viewport=Group("Text viewport",background.rectTransform,11,8,w-22,h-16);viewport.gameObject.AddComponent<UnityEngine.UI.RectMask2D>();
            var text=Label(viewport,"",0,0,w-22,h-16,multiline?12:14,Ink);text.overflowMode=TextOverflowModes.Overflow;text.enableWordWrapping=multiline;
            var hint=Label(viewport,placeholder,0,0,w-22,h-16,13,Muted);input.textViewport=viewport;input.textComponent=text;input.placeholder=hint;
            input.lineType=multiline?TMP_InputField.LineType.MultiLineNewline:TMP_InputField.LineType.SingleLine;input.characterLimit=multiline?16384:180;input.caretColor=Teal;input.customCaretColor=true;input.selectionColor=new Color(.1f,.5f,.4f,.25f);return input;
        }
        private TMP_Text Label(RectTransform parent,string content,float x,float y,float w,float h,int size,Color color,FontStyles style=FontStyles.Normal)
        {
            var go=new GameObject(content.Length>0?content.Replace('\n',' '):"Text",typeof(RectTransform),typeof(TextMeshProUGUI));var text=go.GetComponent<TextMeshProUGUI>();Place(text.rectTransform,parent,x,y,w,h);
            text.font=font;text.text=content;text.fontSize=size;text.fontStyle=style;text.color=color;text.raycastTarget=false;text.enableWordWrapping=true;text.overflowMode=TextOverflowModes.Ellipsis;return text;
        }
        private UnityEngine.UI.Image Panel(string name,RectTransform parent,float x,float y,float w,float h,Color color,bool round)
        {
            var go=new GameObject(name,typeof(RectTransform),typeof(UnityEngine.UI.Image));var image=go.GetComponent<UnityEngine.UI.Image>();Place(image.rectTransform,parent,x,y,w,h);image.color=color;image.raycastTarget=false;
            if(round){image.sprite=rounded;image.type=UnityEngine.UI.Image.Type.Sliced;}return image;
        }
        private static RectTransform Group(string name,RectTransform parent,float x,float y,float w,float h){var go=new GameObject(name,typeof(RectTransform));var rect=go.GetComponent<RectTransform>();Place(rect,parent,x,y,w,h);return rect;}
        private static void Place(RectTransform rect,RectTransform parent,float x,float y,float w,float h){rect.SetParent(parent,false);rect.anchorMin=rect.anchorMax=rect.pivot=new Vector2(0,1);rect.anchoredPosition=new Vector2(x,-y);rect.sizeDelta=new Vector2(w,h);}
        private static Sprite RoundedSprite()
        {
            var texture=new Texture2D(64,64,TextureFormat.RGBA32,false);for(int y=0;y<64;y++)for(int x=0;x<64;x++){float dx=Mathf.Max(0,Mathf.Abs(x-31.5f)-19.5f),dy=Mathf.Max(0,Mathf.Abs(y-31.5f)-19.5f);texture.SetPixel(x,y,new Color(1,1,1,Mathf.Clamp01(12-Mathf.Sqrt(dx*dx+dy*dy))));}
            texture.Apply();return Sprite.Create(texture,new Rect(0,0,64,64),new Vector2(.5f,.5f),100,0,SpriteMeshType.FullRect,new Vector4(14,14,14,14));
        }
        private static string Text(JToken value){return value!=null&&value.Type==JTokenType.String?(string)value:"unknown";}
        private static bool? Flag(JToken value){return value!=null&&value.Type==JTokenType.Boolean?(bool?)value.Value<bool>():null;}
        private static float? Number(JToken value){if(value==null||(value.Type!=JTokenType.Float&&value.Type!=JTokenType.Integer))return null;float number=value.Value<float>();return float.IsNaN(number)||float.IsInfinity(number)?null:(float?)number;}
        void OnDestroy(){if(rounded!=null){Destroy(rounded.texture);Destroy(rounded);}}
    }
}
