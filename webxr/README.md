# Container Haptics Web Client

Visual client for the parametric container haptics project, with an optional
StampC5-connected demo, an output-free production-C++ Lab and a retained simple
browser-local preview.

The connected desktop UI, USB/radio command path and device-driven rendering are
implemented; desktop handling and visual/felt agreement have been demonstrated.
The new Lab, container-constrained liquid/sand visuals, retained sand pile and
soda charge/pop effect are implemented in software, not yet tactile-verified.
The next direction is richer ordinary-screen WebGL visuals and PC/shared Web
tuning, then Android presentation without requiring AR. A flat-screen demo can
reuse this renderer; no separate 2D engine is implied. A/B persistence, saved
applied settings and optional Android hand tracking are not implemented.
The Android device, USB operation and rendering performance are unverified.
VR/Quest development is on hold; its retained
implementation and initial USB/MR-entry evidence are not a completed MR demo.
See [current status](../docs/16_PROGRESS_STATUS.md) for evidence,
[active plan](../docs/08_IMPLEMENTATION_PLAN.md) for priorities and
[demo acceptance](../docs/07_TEST_AND_VALIDATION.md) for validation.

The app is intentionally kept as a nested web project. Its Node dependencies, Vite config, generated assets, and tunnel script are isolated under `webxr/` so the PlatformIO firmware builds stay independent.

## Modes

- Connected desktop demo: Web Serial to StampC5; AtomS3 owns motion/content, applied configuration and physical output. A WebUSB transport also exists, with target-host compatibility tracked in 16.
- C++ Lab: production C++ layers compiled to Wasm, with synthetic tilt/shake, shared-state visuals and model-output meters. No hardware link, output or hand tracking.
- Preview: touch drag or optional phone-orientation tilt drives a local approximation, with no hardware output.
- Retained Quest MR (paused): automatic hand-position following and an in-scene panel. Connected mode mirrors device controls; preview retains experiment controls. This is not an Android AR implementation.
- Desktop development: normal browser view plus IWSDK/IWER emulation.
- WebUSB probe: separate `/webusb.html` diagnostics for the actual StampC5 interface on the intended host.

## C++ Lab — no device required

Open **実機なしラボ** or append `?lab=1` to the app URL. Loading is asynchronous;
the Lab cannot take over an active device view or XR session. Closing it returns
to the simple preview without connecting, disconnecting or sending Stop/Start
to hardware.

1. Choose marble, sand, water or soda. The engine loads actual C++ presets;
   the renderer uses their resolved dimensions and the returned content state.
2. Move the left/right and front/back sliders, or use the automatic tilt sweep.
   The same synthetic body-frame input drives visible state and model outputs.
   Fore/aft display tilt is not independent 3D haptic content dynamics.
   Water now adds visual lag, overshoot and settling waves in both directions;
   **Shake** uses a slower, wider motion for water so its slosh is easier to see.
3. For sand, compare the pile checkbox ON/OFF with the same sweep. The new
   model yields under sufficient tilt, retains a deposit after returning level,
   and flows again under reverse tilt or shaking. Reset preserves that checkbox;
   selecting sand anew explicitly opts back into the new model.
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
WebGPU dependency are required. Mobile layout reserves room for the jet, but
actual Android performance and USB operation still need a device check.

The Lab executes the shared production C++ Mass/Event/Texture/Resonance/Spatial4
and tilt calculation, not another JS haptics model. The four channel meters use
a display-only peak hold. They and the servo-angle readouts are calculated
commands, not measured force, PCM playback or actuator feedback.

Sand's `enable_granular_pile_demo` gate is normally OFF. The Lab enables it
explicitly for its sand comparison; firmware has a separate
`granular_sand_pile_box` preset. Ordinary `granular_sand_box`, generic defaults
and the accepted marble behavior remain unchanged. Soda's charge is an authored
effect value, **not thermodynamic pressure**; its foam/spray visualizes the same
sealed/burst/spent state that produces events. Neither reduced model is CFD or
particle DEM. A full A/B/save tuning studio and Android hand following remain
future work.

## Connected demo

1. Use the current AtomS3 tilt+ESP-NOW demo image and updated StampC5 bridge.
   The demo image starts in Idle with both outputs OFF and enables ESP-NOW
   automatically; let the dongle pair. Other radio builds and older images
   require local Idle followed by `espnow link on`. Neither path arms outputs.
   The new pile/soda presets additionally need the new firmware on **both**
   AtomS3 and StampC5. Their optional v4 snapshot is 250 bytes and carries shared
   pile/pressure state; ordinary operation remains resolved-state v3 (230 bytes).
   The bridge still decodes v1-v3. These new images have not been physically
   validated in this software-only iteration.
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
orientation/content changes. It uses resolved dimensions, fill and viscosity,
preserves the contained volume and can respond to pitch without corresponding
firmware activity. The snapshot clock is its only time source: repeated times
freeze it, rewind/long gaps rebase quietly, and missing time uses a static view.
Its deformed surface and visual centroid are not telemetry or haptic-model state.

The geometric pile centroid and the existing material-scaled/filtered tilt cue
CG are intentionally distinct quantities; this iteration preserves accepted
servo authority. Physical confirmation of the new material behavior remains
pending. The Lab uses this same renderer with its own explicitly offline state.

The retained offline preview includes:

- Local preset imports from `../presets/*.json`, touch/phone tilt and optional
  gentle-roll, wall-tap, swirl and settle scripts. Manual is the default.
- `VisualSimulator` and `ContainerScene` provide approximate liquid slosh and
  granular motion, with procedural lab-bench assets. Preview boxes are normalized
  to 7 cm; bottle/tumbler shapes are preview-only.
- Shared HUD/spatial-panel preview controls for motion and damping.
- `ExperimentRecorder` keeps browser-local trial records in memory and exports
  JSON/CSV. It does not save device presets or implement the planned A/B studio.
- `WebXrBridge` estimates grip position from tracked fingertips/wrist;
  `GripProxy` replaces the active app-side hand mesh with contact markers.

Preview is explicitly browser-local and has no hardware output. Its detailed
retained implementation is described in the [visual-client reference](../docs/reference/18_WEBXR_SMARTPHONE_DEMO.md).

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
node --test --test-concurrency=1 tests/liquid-slosh.test.mjs tests/contained-volume.test.mjs tests/water-dynamics.test.mjs
```

These are software checks; mocked browser/USB tests do not establish hardware
transfer or real hand tracking. The current software evidence is recorded in 16.

For an affected desktop interaction, use the connected-demo steps above: check
reported configuration, deliberate Start, handled visual/haptic agreement and
Stop. Reuse the established desktop evidence; repeat only the changed behavior.
The owning [acceptance document](../docs/07_TEST_AND_VALIDATION.md) defines the
necessary check, and [16](../docs/16_PROGRESS_STATUS.md) records actual results.
Desktop success does not establish Android USB/rendering or the paused Quest
handling and recovery flow. Camera/hand following needs an additional check
only if optional Android AR is implemented. Lab tests execute the shipped Wasm;
they do not prove new tactile quality. A/B persistence and Android hand tracking
remain unimplemented.

For a browser-only edit, no firmware rebuild is required. Protocol or shared
behavior changes additionally need the affected firmware targets and fixtures
in [development setup](../docs/reference/19_DEVELOPMENT_SETUP.md).

## Notes

- Preview imports `../presets/*.json`; connected mode uses the reported applied material and configuration, including the firmware single-marble preset.
- Only preview box geometry is normalized to 7 cm. Connected dimensions are the applied device dimensions.
- Existing Meta IWSDK/IWER support is retained for development and the paused Quest path; no new framework migration is implied by the tuning-studio plan.
- The phone HUD and connected MR panel share command/state ownership; they are different input surfaces, not independent hardware controllers.
- Cloudflare Quick Tunnel URLs are temporary and last only while the local command is running.
