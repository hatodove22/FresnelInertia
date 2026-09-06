# Container Haptics Web Client

Visual client for the parametric container haptics project, with an optional
StampC5-connected demo and a separate browser-local preview.

The connected desktop UI, USB/radio command path and device-driven rendering are
implemented; desktop handling and visual/felt agreement have been demonstrated.
The next direction is a PC/shared Web tuning studio and visual refinement, then
Android AR. The first visual pass adds contained liquid, rotation-aware tabletop
clearance, bounded acceleration translation and revised vessel/material styling.
A/B comparison, saved applied settings and granular accumulation/avalanche
rendering are not implemented yet. The Android device and simultaneous
USB/AR operation are unverified. VR/Quest development is on hold; its retained
implementation and initial USB/MR-entry evidence are not a completed MR demo.
See [current status](../docs/16_PROGRESS_STATUS.md) for evidence,
[active plan](../docs/08_IMPLEMENTATION_PLAN.md) for priorities and
[demo acceptance](../docs/07_TEST_AND_VALIDATION.md) for validation.

The app is intentionally kept as a nested web project. Its Node dependencies, Vite config, generated assets, and tunnel script are isolated under `webxr/` so the PlatformIO firmware builds stay independent.

For reuse and extension, see [the visual architecture](../docs/reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).
`visualState.ts` adapts accepted snapshots without THREE or DOM;
`ContainerScene` composes owned geometry and liquid/particle renderers.
`DeviceDemo` keeps connection and command authority. `npm test` runs state,
transport, renderer, resource-lifecycle and framing regressions.
The independent [concept atlas](../explainer/README.md) is an explanatory
artifact; its sketches do not drive this connected scene.

## Modes

- Connected desktop demo: Web Serial to StampC5; AtomS3 owns motion/content, applied configuration and physical output. A WebUSB transport also exists, with target-host compatibility tracked in 16.
- Preview: touch drag or optional phone-orientation tilt drives a local approximation, with no hardware output.
- Retained Quest MR (paused): automatic hand-position following and an in-scene panel. Connected mode mirrors device controls; preview retains experiment controls. This is not an Android AR implementation.
- Desktop development: normal browser view plus IWSDK/IWER emulation.
- WebUSB probe: separate `/webusb.html` diagnostics for the actual StampC5 interface on the intended host.

## Connected demo

1. Use the current AtomS3 tilt+ESP-NOW demo image and updated StampC5 bridge.
   The demo image starts in Idle with both outputs OFF and enables ESP-NOW
   automatically; let the dongle pair. Other radio builds and older images
   require local Idle followed by `espnow link on`. Neither path arms outputs.
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
activity and fill to `ContainerScene`. The box uses resolved dimensions without
7 cm normalization. Raw accelerometer values plus the reported mounting-frame
flag provide gravity-referenced roll/pitch, not absolute yaw. No browser servo
or vibration waveform is sent. This is a lightweight view of the on-device
reduced model, not a full fluid/particle CFD simulation.

The connected single-marble/fine-grain/liquid/hybrid scenes use that shared
state. Preview-only bottle/cup geometry and scripted motion do not override the
connected box or drive physical output. Improving liquid first, then sand,
is planned visual work; it must retain this device-state ownership.

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
```

These are software checks; mocked browser/USB tests do not establish hardware
transfer or real hand tracking. The current software evidence is recorded in 16.

For an affected desktop interaction, use the connected-demo steps above: check
reported configuration, deliberate Start, handled visual/haptic agreement and
Stop. Reuse the established desktop evidence; repeat only the changed behavior.
The owning [acceptance document](../docs/07_TEST_AND_VALIDATION.md) defines the
necessary check, and [16](../docs/16_PROGRESS_STATUS.md) records actual results.
Desktop success does not establish Android USB+AR or the paused Quest handling
and recovery flow. A/B persistence and new rendering cannot pass until implemented.

For a browser-only edit, no firmware rebuild is required. Protocol or shared
behavior changes additionally need the affected firmware targets and fixtures
in [development setup](../docs/reference/19_DEVELOPMENT_SETUP.md).

## Notes

- Preview imports `../presets/*.json`; connected mode uses the reported applied material and configuration, including the firmware single-marble preset.
- Only preview box geometry is normalized to 7 cm. Connected dimensions are the applied device dimensions.
- Existing Meta IWSDK/IWER support is retained for development and the paused Quest path; no new framework migration is implied by the tuning-studio plan.
- The phone HUD and connected MR panel share command/state ownership; they are different input surfaces, not independent hardware controllers.
- Cloudflare Quick Tunnel URLs are temporary and last only while the local command is running.
