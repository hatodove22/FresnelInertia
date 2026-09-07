# Container Haptics Web Client

Visual client for the parametric container haptics project, with an optional
StampC5-connected demo, a hardware-free production-C++ Lab and a retained simple
browser-local preview.

This is the operator and development guide, not a progress log. The connected
client presents device-owned content state; the Lab makes that model inspectable,
and the [preference workspace](#preference-tuning) adjusts the combined tactile
experience. Desktop and Android ordinary-screen presentation are the active
direction; AR is optional and Quest work is paused.

See the [research concept](../docs/00_DESIGN_SPECIFICATION.md),
[current facts and physical evidence](../docs/16_PROGRESS_STATUS.md),
[active plan](../docs/08_IMPLEMENTATION_PLAN.md) and
[demo acceptance](../docs/07_TEST_AND_VALIDATION.md).

The app is intentionally kept as a nested web project. Its Node dependencies, Vite config, generated assets, and tunnel script are isolated under `webxr/` so the PlatformIO firmware builds stay independent.

For reuse and extension, see [the visual architecture](../docs/reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).
`visualState.ts` adapts accepted snapshots without THREE or DOM;
`ContainerScene` composes owned geometry and liquid/particle renderers.
`DeviceDemo` keeps connection and command authority. `npm test` runs state,
transport, renderer, resource-lifecycle and framing regressions serially, so
heavy geometry tests do not contend with short wall-clock transport fixtures.
The independent [concept atlas](../explainer/README.md) is an explanatory
artifact; its sketches do not drive this connected scene.

## Modes

- Connected desktop demo: Web Serial to StampC5; AtomS3 owns motion/content, applied configuration and physical output. A WebUSB transport also exists, with target-host compatibility tracked in 16.
- C++ Lab: production C++ layers compiled to Wasm, with synthetic tilt/shake, shared-state visuals and model-output meters. No hardware link, actuator output or hand tracking.
- Preference tuning: separate `/tune.html`, jointly exploring vibration strength, material response and three fingertip-tilt gains for water, one marble or sand. Output-free rehearsal is the default; physical comparisons require compatible AtomS3 FW, explicit connection, candidate application and Start.
- Preview: touch drag or optional phone-orientation tilt drives a local approximation, with no hardware output.
- Retained Quest MR (paused): automatic hand-position following and an in-scene panel. Connected mode mirrors device controls; preview retains experiment controls. This is not an Android AR implementation.
- Desktop development: normal browser view plus IWSDK/IWER emulation.
- WebUSB probe: separate `/webusb.html` diagnostics for the actual StampC5 interface on the intended host.

## Demo controls

The ordinary screen shows only the current source's material picker:
**画面で試す** before connection, the applied device material after connecting,
or the six Lab choices while the Lab is open. Preview names are Japanese;
the underlying preset IDs and device-acceptance rules are unchanged.
**StampC5に接続** is the single connection entry; open **接続方法** only to
override automatic USB selection. Device **実機で開始 / 停止** stay fixed below
the scrollable settings, including on narrow screens. Servo recovery remains
outside disclosures, with the existing visible fault/pending/stale messages.

- **実機設定・内容量** contains desired outputs for the next Start, fill and
  the deliberate stop/return-to-preview action. These checkboxes are choices,
  not confirmation that the outputs are currently running.
- Preview has one **ドラッグ** and one **スマホの傾き** action. Sensor permission
  feedback is visible beside them. **自動モーション・表示の調整** contains the
  optional scripts, motion/damping and preview-only numeric readout.
- **効果音をON** remains directly reachable; its volume/settings are under
  **音量**. Speaker sound remains separate from physical four-channel vibration.
- **モデルの設定・触覚指令を見る** contains Lab slow playback, the sand model
  comparison and calculated output meters. Lab entry/exit updates the source
  badge immediately and moves keyboard focus to the newly available action.
- Keyboard help remains available below the main controls. Retained MR and
  trial logging are under **その他の機能 · MR / 試行ログ**; there is one MR entry.

This organization changes Web controls only, not firmware or command policy.

## C++ Lab — no device required

Open **実機なしラボ** or append `?lab=1` to the app URL. Loading is asynchronous;
the Lab cannot take over an active device view or XR session. Closing it returns
to the simple preview without connecting, disconnecting or sending Stop/Start
to hardware.

1. Choose one of six material buttons: marble, sand, water, soda, **コイン**
   or **コイン1枚**. The engine loads actual C++ presets;
   the renderer uses their resolved dimensions and the returned content state.
2. Move the left/right and front/back sliders, or use the automatic tilt sweep.
   The same synthetic body-frame input drives visible state and model outputs.
   Fore/aft display tilt is not independent 3D haptic content dynamics.
   Marble, coins and single coin now add visual fore/aft rolling/sliding; try
   **前後** in both directions (or arrow up/down), return level and pause.
   Coins have more friction than the marble and do not spring back to center.
   Their extra depth response does not generate new sound or haptic contacts.
   Water now adds visual lag, overshoot and settling waves in both directions;
   **Shake** uses a slower, wider motion for water so its slosh is easier to see.
3. For sand, compare the pile checkbox ON/OFF with the same sweep. The new
   model yields under sufficient tilt, retains a deposit after returning level,
   and flows again under reverse tilt or shaking. Reset preserves that checkbox;
   selecting sand anew explicitly opts back into the new model.
   The surface now carries fine grains in the reported flow direction instead
   of oscillating them. Small erosion/deposition remains after flow stops;
   grains sit on that same corrected surface. This is a thin visual layer over
   the existing retained pile, not a new 3D sand/haptic model or fore/aft pile.
4. For soda, **Shake** supplies a short input sequence: charge builds, one pop
   triggers a burst, contents diminish and settle. Reset reseals the model.
5. Optional **スロー再生** slows the complete input/model/display timeline to
   quarter speed, useful for examining the short soda burst. It is Lab-only and
   OFF by default; it is not a device-output speed control.
6. Pause holds both model and display; manual angle input resumes exploration.
   A model error stays visible with the last successful pose until reset.

Liquid optics use a procedural studio environment, refractive material, wet
contact lip and approximate caustics restricted to the submerged floor. Bounded
presentation-only water dynamics add bulk lag and damped secondary waves, with
smooth normals and optical flow that settle with the surface. Soda
adds a connected foamy jet and asymmetric liquid sheets with fine satellite
spray. Moving detail is driven by source state/time; its visual response can be
richer than firmware motion without changing haptic output or claiming full
fluid simulation. No external HDR/image assets or
WebGPU dependency are required. Mobile layout reserves room for the jet;
the positive smartphone report above does not itemize per-material performance
or the newly added features.

Ice/water now uses a few rounded translucent chunks on the same moving water
surface, with frosted/internal detail. It is available under **氷と水** when
connected, or **氷と水** in **画面で試す** (not one
of the six C++ Lab choices). Coin presentation uses a compact pile with more
visible travel; the simple preview's sliding speed now reflects the small
container scale. The production C++/device motion model is unchanged. These
visual refinements need only a page refresh, not another firmware upload;
the previously added physical single-coin preset still needs its pending upload.

Choose **コイン** or **コイン1枚**, wait for physics loading to finish, then
**振ってみる**. Coins now slide, rock and sometimes overturn through 3D
contacts; there is no flip trigger, fixed turn duration or ordered animation.
The Lab gesture includes vertical and fore/aft acceleration as well as sideways
motion. Gentle manual tilt can simply slide. **スロー再生** slows the complete
source timeline; **一時停止** holds the pose. Front numeral/reverse rosette make
orientation legible. The same IMU input drives the visual and C++ models, but
individual coin poses no longer copy the reported aggregate x/y centroid.
This creates no new haptic/sound events. Refresh to use it; no FW upload is
needed for this visual change. Coin physics loads once as a separate local
~2.86 MB chunk; load failure is shown, and page reload retries the download.

The Lab executes the same `HapticSynthesisCore` as the device runtime, including
production Mass/Event/Texture/Resonance/Spatial4 and tilt calculation, not another
JS haptics model. The four channel meters use
a display-only peak hold. They and the servo-angle readouts are calculated
commands, not measured force, PCM playback or actuator feedback.

Sand's `enable_granular_pile_demo` gate is normally OFF. The Lab enables it
explicitly for its sand comparison; firmware has a separate
`granular_sand_pile_box` preset. Ordinary `granular_sand_box`, generic defaults
and the accepted marble behavior remain unchanged. Soda's charge is an authored
effect value, **not thermodynamic pressure**; its foam/spray visualizes the same
sealed/burst/spent state that produces events. Neither reduced model is CFD or
particle DEM. The separate combined vibration/tilt A/B workspace below is
implemented for three representative conditions; arbitrary material editing and
Android hand following remain future work.

Both coin choices use the existing coin material and container. **コイン1枚**
selects `granular_single_coin_box`, whose sparse hard-inclusion settings produce
individual wall hits and a 5 g effective content mass at its default fill.
See [the parameter model](../docs/06_PARAMETER_MODEL.md) for the values and
fill semantics. Coin visuals use thin metallic discs with a patterned face,
bounded placement and source-driven movement; the multi-coin count is illustrative,
while the explicit single-coin condition displays one disc. The richer appearance
of existing **コイン** is a Web-only change.

## Keyboard controls

Click the container to move focus out of a form before using shortcuts. The
current mode's existing buttons and availability rules still own each action.

| Keys | Action |
|---|---|
| `Enter` | In connected mode, explicitly activate **実機で開始** when available |
| `Esc` | Activate available device Stop, including during pending work; otherwise pause the Lab without resuming an already paused model |
| `1`–`9`, `0` | Select the first through tenth material in the current display order; the Lab has six choices |
| `[` / `]` | Previous/next available material in display order, wrapping at the ends |
| Lab arrow keys | Change roll/pitch by 5 degrees per press within the sliders' bounds: left/up decrease, right/down increase |
| Lab `S` / `R` / `Space` | Shake / Reset / toggle Pause |
| Preview `Space` | Toggle the local wall-tap stimulus and manual mode |

Form fields, selects, editable text and sliders keep their normal keyboard
behavior; global shortcuts ignore them except `Esc`. Focused buttons, links
and disclosure controls retain native `Enter`/`Space` activation, so those keys
do not also run a global shortcut. `Space` on physical Start is specifically
suppressed: it never starts device output. Repeated keys, IME composition and
modifier-key combinations are ignored. Material shortcuts are inactive in XR.

## Speaker sound

Press **効果音をON** to enable sound from the PC/phone speakers, then use
**音量** to adjust its level (initially 35%). Press the same button again to
mute. Every page load starts OFF; enabling sound is not saved or replayed on
reload. The speaker setting is independent of four-channel vibration and never
starts or changes hardware output. This sound addition needs no firmware or
StampC5 update; the separate single-coin preset still has the AtomS3 requirement
described below.

Coin clinks, marble taps and sand friction retain authored procedural Foley.
Water/ice-water use real CC0 water recordings by
[Joseph SARDIN](https://bigsoundbank.com/swirl-in-the-water-s0192.html), with a
5.8-second motion loop and 0.75–1.05-second excerpts. Dense contacts are spaced
by at least 350 ms and no more than two accent tails overlap; skipped contacts
are not replayed. No water pitch glide or synthesized water layer is added.
These sounds are not measured from the haptic hardware and create no new
collision model. In the Lab, choose **水 → 効果音をON → 振ってみる**; pause
cancels the longer tails too. [Credits and processing](src/assets/audio/sources/CREDITS.md)
are included with the recording. Soda also uses actual CC0 recordings:
[Champagne cork #2](https://bigsoundbank.com/champagne-cork-2-s0648.html) for
the single opening, and [Sparkling water](https://bigsoundbank.com/sparkling-water-s0230.html)
for the fizz, both by Joseph SARDIN. Try **炭酸 → 振ってみる** with sound ON.
Sealed motion uses the recorded water; only the shared burst state excites
the 3.6-second fizz bed, whose gain follows charge, age and remaining contents.
It stops when spent or paused and never replays the opening on resume.
The approved water/hybrid and existing solid clips are unchanged by this addition.
The first sound enable fetches one bundled 2.66 MB bank from the same demo
server and decodes it before enabling playback. Material changes then use
cached samples; no third-party service or microphone access is involved.

To regenerate after editing `src/audio/FoleySamples.ts` or the recorded excerpts
in `scripts/recorded-water.mjs` / `scripts/recorded-soda.mjs`, run
`npm run audio:generate`, then test/build. It also writes an unshipped listening
reel to `tmp/audio/foley-audition.wav` at the repository root, in this order:
coin, marble, sand, water, soda, hybrid. Each block has three contacts and a
short rolling/flow texture. The generated WAV and clip manifest in
`src/assets/audio/` are part of the application, not temporary downloads.

- Connected mode uses fresh, resolved Live telemetry: motion supplies continuous
  sound, while `evt_total` and `last_event` identify at most the latest reported
  event. Around 10 Hz telemetry cannot preserve every collision or its original
  timing; skipped count increments are never replayed as a backlog of impacts.
- Lab uses the production C++ events and shared motion/pile/pressure state from
  each model step. Pause and slow playback follow that same source timeline;
  individual acoustic decays keep their normal pitch/duration, not time-stretching.
- Simple preview uses its existing local motion and an impact-pulse latch. Its
  sound remains an approximation with no claim of actual device events.

Stop, pending material/output changes, Lab pause, stale/disconnected telemetry
and hiding the page silence the applicable sound source and cancel its tails.
Repeated source frames and event counters do not retrigger sounds or renew the
continuous envelope. Re-entry and model resets establish a fresh baseline, so
an old impact or soda pop is not played again. Stationary residual model energy
alone produces no continuous sound.

If loading the bank fails, audio stays OFF and the error is shown; retry
**効果音をON** once the demo server is reachable. If audio is suspended or blocked,
click **効果音をON** again and check the
browser/site audio setting and system volume. Creating/resuming Web Audio from
a deliberate click follows browser autoplay requirements; see
[MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices#autoplay_policy).
Software checks do not establish audible quality, speaker balance or operation
on the user's actual phone; the earlier positive phone report predates this sound.

## Connected demo

1. Use the current AtomS3 tilt+ESP-NOW demo image and updated StampC5 bridge.
   The demo image starts in Idle with both outputs OFF and enables ESP-NOW
   automatically; let the dongle pair. Other radio builds and older images
   require local Idle followed by `espnow link on`. Neither path arms outputs.
   The new pile/soda presets additionally need the new firmware on **both**
   AtomS3 and StampC5. Their optional v4 snapshot is 250 bytes and carries shared
   pile/pressure state; ordinary operation remains resolved-state v3 (230 bytes).
   The bridge still decodes v1-v3. The pre-kick images were uploaded and physical
   output-OFF v4 transport was checked; see 16 for revision-specific handling
   and the later AtomS3-only recoil upload. This is not proof that a newly built
   merged image is installed or physically validated.
   **コイン1枚（新FW）** requires the next AtomS3 upload containing
   `granular_single_coin_box`; StampC5 needs no update for this named preset.
   Older AtomS3 firmware can reject it with `preset_load_failed`. The client
   keeps the actual applied material and reports the firmware requirement.
2. Select PC Serial or phone/Quest WebUSB, then **StampC5に接続**. Connect only
   observes status and requests device state. Do not leave another application
   holding the same USB interface.
   State discovery briefly retries only the bridge's not-yet-discovered/paired
   responses (up to 3.5 seconds). A connected **状態を再取得** button permits a
   read-only retry without reopening USB. A broadcast snapshot alone does not
   enable Start while the bridge explicitly reports unpaired. Output commands
   are not automatically retried or replayed by discovery.
   Successful explicit refresh/reconnection also abandons an old pending preset
   selection and uses the reported current material, without reapplying it or
   arming outputs. A failed refresh does not claim that recovery succeeded.
3. Choose an actual device preset or apply fill. These operations Stop first,
   await execution ACKs and use reported applied state. Fill also sets
   complementary headspace. The display uses device dimensions, not guessed
   JSON values under the same preset name.
4. Select vibration/tilt and press **実機で開始**. Start sends Live, then explicit
   output commands. A partly failed Start requests Stop.
5. Stop when finished. **停止してプレビューへ** requests Stop before disconnecting
   a live link. Connecting, reconnecting and selecting a preset never auto-arm.

If a servo fault is displayed, **停止してサーボ復帰** is available outside the
collapsed settings. It requests Stop, clears/rechecks the servo interface, then
reads device state. It does not restart output: after a successful recovery,
press **実機で開始** deliberately. Failed recovery remains visible and can be
retried once communication is restored. Firmware-fix evidence and remaining
hardware verification are in [16](../docs/16_PROGRESS_STATUS.md#current-issues-and-unverified-behavior).

With the transient-retry AtomS3 update, brief DYNAMIXEL loss is shown as
**サーボ通信を再試行中** while the device continues its bounded retry. The Web
client does not issue retry/clear/Start commands automatically. Start is disabled
during this state, Stop is available, and normal Live indication returns only
from fresh device state. A stopped/latched fault still uses the explicit recovery
button above. See [the state contract](../docs/05_INTERFACE_SPEC.md).

The transport understands mixed NDJSON, diagnostics and request-matched ACKs,
including fragmented UTF-8 reads. Stop cancels unsent work and prevents an older
Start sequence from continuing after it. Missing/stale telemetry freezes the
last connected view and labels physical output as unconfirmed; it does not
silently resume preview animation. Telemetry silence is not a Stop confirmation.

At rest, the connected THREE XYZ pose rotates body-frame specific force onto
world +Y; reported content x/y therefore moves toward the displayed downhill wall.

The current connected HUD exposes preset selection, fill and output controls.
The preview's motion/damping sliders and trial recorder are not device tuning
controls. Do not confuse a requested setting or local preview value with an
acknowledged device-applied parameter; see [parameter ownership](../docs/06_PARAMETER_MODEL.md).

Wire formats, bridge compatibility and command ownership are defined in the
[interface specification](../docs/05_INTERFACE_SPEC.md). For a host-specific
USB failure use `/webusb.html` and the [USB probe reference](../docs/reference/19_WEBUSB_QUEST_PROBE.md),
rather than treating a chooser or descriptor listing as successful transfer.

## Retained Quest MR (paused)

Enter MR requests a session directly from the user's click and shows Exit MR
only after XR setup succeeds; failure remains retryable. Sessions retain
local-floor space, and ending MR restores the desktop projection and scene
height. Each tracked hand/controller has its own press state, cleared on tracking
loss or session exit. The selected tracked hand automatically carries the object,
with no approach-distance or pinch requirement. Tracking loss holds its last
position until the same hand returns, without switching to the panel-operating
hand. Hand tracking supplies position only; connected orientation remains IMU-driven,
without an added wrist rotation. `setPreferredHand("left" | "right" | "any")`
selects the grasp side; `any` initially selects the first tracked hand. The
assembled demo selects the right hand, as requested by the operator.
This updated following behavior still needs the actual Quest handling check.
The in-scene connected panel provides the same preset, output selection and
Start/Stop path as the ordinary HUD. Revisit the actual hand/panel, handling and
recovery checks only when Quest work resumes; they are not the active PC task.

## Project layout

```text
webxr/
|-- index.html
|-- webusb.html
|-- package.json
|-- scripts/
|   `-- start-quest-tunnel.ps1
|-- src/
|   |-- input/PhoneInput.ts
|   |-- input/DemoKeyboard.ts
|   |-- audio/SoundState.ts
|   |-- audio/MaterialSound.ts
|   |-- link/HapticLink.ts
|   |-- renderer/
|   |   |-- ContainerScene.ts
|   |   |-- EnvironmentScene.ts
|   |   |-- GripProxy.ts
|   |   |-- ProceduralAssets.ts
|   |   `-- SpatialControlPanel.ts
|   |-- xr/WebXrBridge.ts
|   |-- experimentRecorder.ts
|   |-- deviceDemo.ts
|   |-- offlineLab.ts
|   |-- lab/PreviewEngine.ts
|   |-- lab/generated/preview-engine.js
|   |-- main.ts
|   |-- presets.ts
|   |-- simulator.ts
|   |-- stimulusScripts.ts
|   |-- webusb-test.ts
|   |-- webusb-test.css
|   `-- types.ts
`-- vite.config.ts
```

## Visual model and state ownership

In connected mode, `DeviceDemo` passes device-reported mass position, velocity,
activity, fill and optional v4 pile/pressure state to `ContainerScene`. The box uses resolved dimensions without
7 cm normalization. Raw accelerometer values plus the reported mounting-frame
flag provide gravity-referenced roll/pitch, not absolute yaw. No browser servo
or vibration waveform is sent. This is a lightweight view of the on-device
reduced model, not a full fluid/particle CFD simulation.

The connected single-marble/fine-grain/liquid/hybrid scenes use that shared
state. Liquid volume and free surface stay inside the box; the new dense sand
bed uses its reported retained slope and a matching volume-preserving cut.
Individual foam/grain/spray particles are visual detail, not another physical
state owner. Absent or inactive v4 fields retain ordinary sand/liquid behavior;
a preset name alone never invents pile or carbonation state. The visual water
response does not require v4 pile/pressure fields. Preview-only bottle/cup
geometry and scripted motion do not override the connected box or drive output.

`LiquidSlosh` adds presentation-only two-axis lag and six damped wave modes from
orientation/content/acceleration changes. It uses resolved dimensions, fill and viscosity,
preserves the contained volume and can respond to pitch without corresponding
firmware activity. The snapshot clock is its only time source: repeated times
freeze it, rewind/long gaps rebase quietly, and missing time uses a static view.
Its deformed surface and visual centroid are not telemetry or haptic-model state.

For the richer water motion, open `/?lab=1`, choose **水**, then **振ってみる**.
The water itself gathers into a rising shoulder and draws down nearby water;
its free surface and wall waterline deform together without an added sheet
or detached water overlay. Try **前後** and **一時停止** as well. The same ingredient
serves connected water and ice/water, without a FW update. It follows accepted
sample time and stays inside the cavity. This is bounded visual detail, not
full fluid simulation, overturning waves, general spilling or a new tactile
landing event. The surface/body mesh keeps the requested volume; tapered
walls retain a conservative pinned seam. Its ownership and
approximation limits are in the
[visual contract](../docs/reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#integrated-material-presentation).

The geometric pile centroid and the existing material-scaled/filtered tilt cue
CG are intentionally distinct quantities; this iteration preserves accepted
servo authority. The positive baseline handling report does not itemize every
new material or include the later soda kick. The Lab uses this same renderer
with its own explicitly offline state.

The retained offline preview includes:

- Local preset imports from `../presets/*.json`, touch/phone tilt and optional
  gentle-roll, wall-tap, swirl and settle scripts. Manual is the default.
- `VisualSimulator` and `ContainerScene` provide approximate liquid slosh and
  granular motion, with procedural lab-bench assets. Preview boxes are normalized
  to 7 cm; bottle/tumbler shapes are preview-only.
- Shared HUD/spatial-panel preview controls for motion and damping.
- `ExperimentRecorder` keeps browser-local trial records in memory and exports
  JSON/CSV. It does not save device presets and is separate from `/tune.html`.
- `WebXrBridge` estimates grip position from tracked fingertips/wrist;
  `GripProxy` replaces the active app-side hand mesh with contact markers.

Preview is explicitly browser-local and has no hardware output. Its detailed
retained implementation is described in the [visual-client reference](../docs/reference/18_WEBXR_SMARTPHONE_DEMO.md).

## Preference tuning

Open **`/tune.html`** on the same server (locally,
[Haptic Tuning](http://127.0.0.1:8082/tune.html)). This is a focused combined
experience search, not a new haptic engine or a full parameter editor. It uses
subjective A/B
choices to propose the next setting with a preference Gaussian process.
The [implementation contract](../docs/reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#preference-tuning-workspace)
owns the optimizer and its limits.

- Select one fixed representative condition: water (`liquid_small_box`), one
  marble (`granular_single_marble_box`) or retained sand (`granular_sand_pile_box`).
  All five coordinates are proposed together: vibration master gain, material
  response (coupled x/y damping for water/marble or coupled pile friction), content-position
  tilt, common vertical inertia, and differential CoG/horizontal inertia.
  Their exact fields/ranges are in the [parameter model](../docs/06_PARAMETER_MODEL.md#joint-preference-search).
  `k_phi` stays fixed and positive to avoid its multiplicative redundancy with
  the inertia gains. Each v3 candidate applies seven numeric fields. There are
  no independently optimized vibration/tilt groups. Material identity, geometry
  and fill remain fixed within a session; votes are not pooled across materials.
- **操作練習** starts without USB or audio. Create a session, inspect A and B,
  then select A, B, tie, or unable to judge. The response plot runs the shipped
  C++ model with the same four-second input. These are calculated envelopes
  and servo commands, not measured output or a tactile/acoustic evaluation.
  Rehearsal choices never enter a device session.
- For a handled comparison, first Stop and disconnect the other demo page
  (return it to preview to release USB). Select **実機**, create a session and
  connect StampC5. Check handling readiness once. Apply A while stopped, then
  explicitly Start A, or use Q to apply-and-start through the same sequence;
  repeat for B with W and the same grip and tilt-return gesture. Answer which
  feels more like the same real reference, not simply which is stronger. Start enables both
  physical branches; this page has no speaker playback or material animation.
- Applying a current candidate sends **Stop → GetState capability check →
  selected preset → seven setters → GetState**. All 11 execution ACKs and a fresh
  stopped material/container snapshot must arrive before Start. Idle can omit
  dynamic pile state; sand is bound by preset identity and friction-setting ACKs.
  The final state
  reply reports `max_tilt_deg`, `k_cm`, `k_tau` and fixed `k_phi` at `%.6g`
  precision, which must match the requested tilt values. These are applied
  coefficients, not measured force or encoder angles. Vibration gain and damping/friction
  **still have ACKs only, not numeric readback**.
  A partial failure has no automatic rollback: reapply the complete candidate.
  Stop/Esc cancels an in-flight application; disconnect/reboot/stale state
  invalidates its permission to Start. No reconnect or next candidate auto-starts.
- A/B require both Start ACKs in device mode. A tie provides evidence for a
  small preference difference; unable to judge is history only. Notes are
  retained but not interpreted by the optimizer. A/B labels are randomized;
  this does not constitute a blinded psychophysics study. Compare in small
  batches, take a break and retain a useful candidate; there is no requirement
  to fill the 60-comparison cap or claim that any fixed count reaches optimal
  realism. Rating proposes a new pair but never starts it automatically.
- **初期基準** and **今選んでいる候補** can be reapplied and explicitly started
  without casting a vote. Initial values come from the selected shipped C++ preset
  or your chosen sliders, **not previously running device settings**. A preset
  load also resets its material configuration. The first accepted configuration
  is bound to the session; a later mismatch requires a new session. The hard
  command/mechanical limits, control law and preset defaults are unchanged:
  `max_tilt_deg` here adjusts the content-position cue, not the travel limit.
  Note the FW revision, physical reference and grip manually.
- Sessions save in this browser's local storage, separately by mode. JSON
  export/import transfers the choices, current pair, selected candidate,
  condition fingerprint and command receipts. Import/resume never restores
  output authority: reapply and compare again. Storage failure leaves a visible
  warning while JSON export remains available. Different browser origins, PCs,
  references, people or FW versions must not silently pool subjective data.
  Export is **not** a device preset upload or persistent firmware change.
- **今の候補を設定として保存** stores a separate selected-profile JSON, with
  source material/session, number of A/B/tie answers and a rehearsal/unevaluated/
  self-reported preference label. It contains no votes and is not measured
  validation. Same-material reuse transfers all seven coefficients exactly.
  Select another representative and choose **選択中の素材の開始点にする** to copy
  only common vibration/tilt coefficients; that material keeps its own shipped
  damping/friction. Start a new session to evaluate it, without inherited votes.
  Profile JSON import/export works across PCs/origins; browser-local sharing
  requires the exact same origin (`localhost` and `127.0.0.1` differ).
  In the ordinary demo's device settings, select the matching material and a
  saved profile, then explicitly apply it while stopped. Applying is not Start
  and does not write a permanent FW preset. A failed partial apply must be
  corrected by complete reapplication or deliberate preset selection.
  Legacy v1 sessions still resume their original two axes but cannot export a
  complete tilt profile they never recorded. V2 remains joint water; new v3
  records carry material identity. Old tilt-capable firmware without friction
  setters can reject sand after preset load and remains stopped; update AtomS3
  for all three. StampC5 does not need updating for gain tuning.

Left-hand shortcuts keep the right hand on the device:

| Keys | Tuning action |
|---|---|
| `Q` / `W` | Present A / B: apply-and-Start in device mode after handling readiness; C++ calculation only in rehearsal |
| `A` / `D` | Prefer A / B after both candidates were checked |
| `S` | Same preference after both candidates were checked |
| `X` | Unable to judge; record without learning |
| `Space` / `Esc` | Stop; no next-candidate playback |

Typing in fields, IME composition and held/repeating keys do not trigger
comparison shortcuts; Esc remains available outside composition. A normal
comparison needs no repeated handling checkbox, but disconnect/stale/reboot
clears readiness and requires reapplication. The buttons remain available.

**New v2 physical sessions need the new AtomS3 firmware**, implemented but not
yet flashed. StampC5 does not need an update. The capability probe rejects old
FW before preset/set writes; it does not silently omit the tilt coordinates.
Saved v1 sessions remain the original two-dimensional water comparison with
only three applied values and the legacy six-ACK path. Resume/import does not
add guessed tilt settings or convert old judgments into five-dimensional data.
Current browser/build/firmware checks are recorded in
[16](../docs/16_PROGRESS_STATUS.md); actual A/B handling and tuned values remain
unverified.

With the built app served, `node tests/browser-tuning.mjs` checks the real
Chromium rehearsal/JSON/mobile-width flow without hardware or sound.
`node tests/browser-tuning-device.mjs` checks the actual UI with fully mocked
Web Serial, including Start/Stop, reset, disconnect and interrupted application.
They use `FRESNEL_DEMO_URL` and `FRESNEL_PLAYWRIGHT_MODULE` as described in
[browser setup](../docs/reference/19_DEVELOPMENT_SETUP.md#output-free-c-lab).

## Development

```powershell
cd webxr
npm.cmd ci
npm.cmd run dev
```

Open the URL printed by Vite in the desktop browser. The development server uses
HTTPS and includes IWSDK/IWER support; Android AR is not yet implemented by
running this server or opening the same URL on a phone.

Ordinary client builds need no C++ SDK: the Wasm module is checked in. After
editing shared C++ model code, regenerate from the repository root with
`& .\tools\build_preview_engine.ps1` using the existing Unity WebGL SDK, then
re-run the focused checks below. Setup and SDK selection are documented in
[development setup](../docs/reference/19_DEVELOPMENT_SETUP.md).

Use this mode for active desktop/mobile development. It includes Vite HMR and IWSDK/IWER dev support, but HMR is not the most reliable path through public tunnels.

The retained experimental Quest tunnel helper can be used when that work resumes:

```powershell
cd webxr
npm.cmd run quest
```

This builds the app, starts a local production preview on `https://127.0.0.1:8082`, creates a Cloudflare Quick Tunnel, and prints a temporary `trycloudflare.com` URL. Keep the terminal open while using the URL in Quest Browser.

Useful options:

```powershell
npm.cmd run quest -- -NoBuild
npm.cmd run quest -- -Port 8090
```

`-NoBuild` is useful when the current `dist/` output is already fresh. `-Port` changes the local preview port if `8082` is busy.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd run build
node --test test/haptic-link.test.mjs
node --test tests/device-demo.test.mjs tests/container-scene.test.mjs tests/spatial-control-panel.test.mjs tests/webxr-bridge.test.mjs
node --test tests/preview-engine.test.mjs tests/offline-lab.test.mjs
node --test --test-concurrency=1 tests/sound-state.test.mjs tests/material-sound.test.mjs
node --test --test-concurrency=1 tests/liquid-slosh.test.mjs tests/contained-volume.test.mjs tests/water-dynamics.test.mjs
```

These are software checks; mocked browser/USB tests do not establish hardware
transfer or real hand tracking. The current software evidence is recorded in 16.

With the app server running, `node tests/browser-sound.mjs` exercises actual
Chromium/Web Audio scheduling and the production Lab. It uses the same
`FRESNEL_DEMO_URL`, `FRESNEL_PLAYWRIGHT_MODULE`, `FRESNEL_BROWSER_CHANNEL` and
`FRESNEL_SOFTWARE_WEBGL` environment settings as `tests/browser-demo.mjs`; see
[browser setup](../docs/reference/19_DEVELOPMENT_SETUP.md#output-free-c-lab).
The harness blocks device/microphone access and launches Chromium with muted
audio. It verifies browser behavior, not what a person hears.

For an affected desktop interaction, use the connected-demo steps above: check
reported configuration, deliberate Start, handled visual/haptic agreement and
Stop. Reuse the established desktop evidence; repeat only the changed behavior.
The owning [acceptance document](../docs/07_TEST_AND_VALIDATION.md) defines the
necessary check, and [16](../docs/16_PROGRESS_STATUS.md) records actual results.
Desktop success does not establish Android USB/rendering or the paused Quest
handling and recovery flow. Camera/hand following needs an additional check
only if optional Android AR is implemented. Lab tests execute the shipped Wasm;
they do not prove new tactile quality. The separate preference workspace has
software A/B persistence checks, not real tuning results; Android hand tracking
remains unimplemented.

For a browser-only edit, no firmware rebuild is required. Protocol or shared
behavior changes additionally need the affected firmware targets and fixtures
in [development setup](../docs/reference/19_DEVELOPMENT_SETUP.md).

## Notes

- Preview imports `../presets/*.json`; connected mode uses the reported applied material and configuration, including the firmware single-marble preset.
- Only preview box geometry is normalized to 7 cm. Connected dimensions are the applied device dimensions.
- Existing Meta IWSDK/IWER support is retained for development and the paused Quest path; no new framework migration is implied by the tuning-studio plan.
- The phone HUD and connected MR panel share command/state ownership; they are different input surfaces, not independent hardware controllers.
- Cloudflare Quick Tunnel URLs are temporary and last only while the local command is running.
