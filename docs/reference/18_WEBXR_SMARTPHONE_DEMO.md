# 18 Web Client and Retained Preview/XR Reference

> Optional implementation detail, not an active plan or mandatory test campaign.
> Current scope, facts and acceptance belong to [08](../08_IMPLEMENTATION_PLAN.md),
> [16](../16_PROGRESS_STATUS.md) and [07](../07_TEST_AND_VALIDATION.md).

This document describes the existing client in `webxr/`, especially its retained
browser-local preview and Quest implementation. PC/shared Web tuning is the
active direction; VR/Quest is on hold and Android AR is planned, not implemented.
Current operating instructions are in [webxr/README.md](../../webxr/README.md).

## 1. Scope

- The web client is a presentation/control layer, not the on-device haptic engine.
- Connected mode already exchanges state and high-level commands with AtomS3
  through the StampC5 USB/ESP-NOW bridge. The separate preview does not.
- Preview imports `presets/` for material settings and normalizes box visuals to
  7 cm. Connected mode uses device-resolved material, fill and dimensions instead.
- A/B tuning, saved applied settings and the next liquid/sand visual refinements
  are planned in 08. Existing preview experiment controls do not implement them.
- The client is intentionally self-contained under `webxr/` with its own `package.json`, `package-lock.json`, Vite config, TypeScript config, and Quest tunnel script.

## 1.1 Current module map

| Module | Role |
|---|---|
| `src/main.ts` | Three.js renderer setup, UI wiring, preset selection, animation loop |
| `src/deviceDemo.ts` | connected HUD/panel control, device-applied configuration and IMU/content view |
| `src/link/HapticLink.ts` | Web Serial/WebUSB, mixed NDJSON parsing, request/ACK queue, state discovery and explicit output commands |
| `src/experimentRecorder.ts` | browser-local trial event/sample recorder plus JSON/CSV serialization |
| `src/presets.ts` | imports selected repository preset JSON files and validates the visual subset |
| `src/simulator.ts` | local visual-only content dynamics for slosh, agitation, waves, impacts, and particle spread |
| `src/stimulusScripts.ts` | repeatable visual-only tilt scripts for phone/MR experiments |
| `src/renderer/ContainerScene.ts` | transparent shell, sample label, liquid, foam, and granular/hybrid instancing |
| `src/renderer/EnvironmentScene.ts` | lab-bench environment, mat, panel, small props, and cables |
| `src/renderer/GripProxy.ts` | visual thumb/index contact markers used while an object is grabbed |
| `src/renderer/ProceduralAssets.ts` | in-browser canvas textures for wood, mat, liquid normals, and labels |
| `src/renderer/SpatialControlPanel.ts` | in-scene connected-device or preview-experiment panel, with independent ray/touch press state per source |
| `src/input/PhoneInput.ts` | touch-drag tilt and optional DeviceOrientation input |
| `src/xr/WebXrBridge.ts` | explicit MR session lifecycle, selected-hand position following and panel ray/touch routing |
| `src/webusb-test.ts` | standalone WebUSB/Web Serial probe page logic for Quest browser transport experiments |
| `scripts/start-quest-tunnel.ps1` | production preview plus Cloudflare Quick Tunnel launcher |

## 2. Runtime modes

### Browser-local preview (desktop/phone)

- Opens as a normal mobile 3D page.
- Uses touch drag for virtual tilt.
- Can use DeviceOrientation after explicit user permission.
- Shows preset selection and compact readouts for family, fill, and tilt.
- Mirrors the spatial panel's motion-boost and damping-preview controls as DOM sliders. Both DOM and MR panel changes update the same visual `SpatialPanelState`.
- Provides optional repeatable stimulus scripts: manual, gentle roll, wall tap, swirl, and settle. Manual is the default. Selected scripts override tilt only while selected; Reset returns to manual/rest.
- Provides a browser-local trial strip with condition, repeat, start/stop, mark, next, elapsed timer, and JSON/CSV export.

### Quest MR mode (retained, paused)

- Targets Meta Quest 3/3S in Quest Browser.
- Requests `immersive-ar` directly from the user click, with required local-floor
  space. The UI reports entry only after renderer setup succeeds; failures are retryable.
- Requests hand tracking, hit test, anchors, plane detection, and mesh detection as optional features.
- The demo follows the operator-selected right hand without a distance or pinch
  requirement. Opposing thumb/index fingertips provide a midpoint; otherwise
  wrist/thumb/index/middle joints provide a broader position estimate. Tracking
  loss holds the last position instead of transferring the object to the other hand.
- During following, the app-rendered mesh for the active hand is replaced by two
  object-attached contact markers. Raw WebXR joints remain the input source.
- The spatial panel mirrors connected preset/output/Start/Stop controls when
  connected, or local experiment controls in preview. Controller rays and index
  fingertips use independent press states, cleared on tracking loss/session exit.
- The spatial panel's preset list is paged so all demo presets remain reachable without growing the panel.
- In preview, the panel mirrors stimulus scripts and trial start/stop, mark,
  next, repeat and elapsed-time feedback. Reset returns the local object/input
  state to rest; automatic hand following can immediately reacquire a tracked hand.
- Hand tracking owns position only. Connected angle/content remain device-driven;
  preview retains the browser-local simulator. No wrist rotation is added to IMU tilt.
- Leaving MR restores desktop projection, scene height and input state.
- `npm.cmd run quest` is a retained off-LAN preview/tunnel helper, not an active
  prerequisite. Its existence does not establish Quest handling or Android AR.

### Desktop mode

- Connected mode uses the shared scene with the device HUD and actual device state.
- Preview retains the same local scene and controls as the phone-sized view.
- Useful for visual iteration and Playwright smoke checks.
- IWSDK/IWER dependencies are present for development alignment, but the current runtime bridge remains a small isolated adapter.

## 2.1 Retained preview visual baseline

The browser-local preview uses procedural assets instead of external binary files:

- a wood-grain bench texture,
- a calibration mat texture,
- liquid normal/ripple texture,
- per-preset sample labels.

The environment is intentionally lab-like: table, mat, rear panel, small instrument block, sample pucks, and cables. This keeps the demo grounded for smartphone sharing while still being lightweight enough for Quest Browser.

Visual container sizing:

- preview box-shaped presets render as 7 cm cubes regardless of source dimensions;
  connected boxes use actual device-resolved dimensions,
- the firmware-facing preset JSON files are not rewritten by this visual normalization,
- the WebXR-only `liquid_cylinder_bottle` entry adds a 7 cm diameter cylindrical bottle with a neck, cap, circular liquid body, and circular liquid surface,
- the WebXR-only `liquid_plastic_tumbler` entry adds a 7 cm top-diameter tapered plastic cup with an open rim, small base, and tapered liquid body.

In preview, the spatial experiment panel is separate from the smartphone HUD:

- phone controls remain DOM-based for low-friction sharing,
- MR controls live as a textured Three.js panel in the scene,
- the panel currently exposes a paged preset list, stimulus script selection, motion-boost slider, damping-preview slider, trial start/mark/next controls, and fixed object reset button,
- the phone DOM mirrors the panel slider, stimulus, running-state, repeat, and elapsed-time values so a desktop/mobile observer can adjust or inspect the same state,
- the panel is a prototype surface for experimental controls, not the final firmware control protocol.

Experiment trial strip:

- Trial records are in-memory browser data only and are cleared by a page refresh.
- Start/stop, mark, next, and 250 ms running samples capture ISO timestamp, elapsed milliseconds, condition, repeat, active preset, input mode, `SpatialPanelState`, tilt, phase, and marker.
- Export supports JSON and CSV with no additional runtime dependency.
- This recorder is neither firmware recorder/replay nor the planned saved
  device-setting/A/B studio; it is only for local preview experiment notes.

Hand-follow visualization:

- the active app-side hand mesh is hidden during following,
- a container-attached proxy displays only thumb and index contact pads around the object,
- no synthetic finger bars are rendered, so the substitution reads as contact feedback rather than a fake hand,
- the object is not forced into the hand's quaternion pose: connected tilt is
  IMU-driven and preview tilt is local,
- loss of tracking or session exit restores the app-side mesh state and hides
  the proxy; reacquisition restores position following.

Preview content behavior is visual-only and approximates the material distinctions:

- liquid and hybrid surfaces use a damped second-order slosh state with viscosity-dependent response,
- the bulk liquid volume is inset and clamped inside the transparent container to avoid visible wall penetration,
- round container liquid uses radial clamping for the body and liquid surface,
- liquid surfaces add mesh waves, normal-map drift, and foam markers under agitation,
- granular and hybrid particles integrate simple tilt-driven velocity with wall/floor bounce,
- particle spread and bounce intensity are shaped by preset particle count and hardness.

This is not a full fluid solver. In connected mode, device-reported content state
remains authoritative; visual effects must not introduce a second canonical
physics model. Planned visual refinements are tracked in 08, not completed here.

## 2.2 Server and tunnel workflow

Development:

```powershell
cd webxr
npm.cmd ci
npm.cmd run dev
```

Retained Quest tunnel helper (when that work resumes):

```powershell
cd webxr
npm.cmd run quest
```

The Quest shortcut:

1. runs the production build unless `-NoBuild` is passed,
2. starts Vite preview on `https://127.0.0.1:8082`,
3. starts a Cloudflare Quick Tunnel with `--no-tls-verify` for the local self-signed preview,
4. prints the temporary `https://*.trycloudflare.com` URL,
5. keeps both processes alive until the terminal is stopped.

Optional arguments:

```powershell
npm.cmd run quest -- -NoBuild
npm.cmd run quest -- -Port 8090
```

The same development and tunnel workflow also serves the WebUSB probe page at
`/webusb.html`. That page is a transport experiment only; it does not change the
visual simulator or firmware protocol.

## 3. Retained SDK/development foundation

The existing web dependencies remain separate from firmware:

- `@iwsdk/vite-plugin-dev` provides the local development and IWER emulation path.
- `@iwsdk/core` and `@iwsdk/xr-input` are included as the IWSDK foundation packages.
- The small WebXR bridge is isolated in the client. No deeper ECS/UI framework
  migration is required or scheduled by this reference.
- Local development uses HTTPS because WebXR requires a secure origin.
- The existing panel is a small Three.js implementation. The background links
  below are not an instruction to adopt additional SDK subsystems.

Reference pages:

- Immersive Web SDK overview: `https://developers.meta.com/horizon/documentation/web/iwsdk-overview/`
- IWSDK project setup: `https://developers.meta.com/horizon/documentation/web/iwsdk-guide-project-setup/`
- IWSDK testing experience: `https://developers.meta.com/horizon/documentation/web/iwsdk-guide-testing-experience/`
- IWSDK Spatial UI/UIKit: `https://developers.meta.com/horizon/documentation/web/iwsdk-concept-spatial-ui-uikit/`
- IWSDK XR Input pointers: `https://developers.meta.com/horizon/documentation/web/iwsdk-concept-xr-input-pointers/`
- Web Launch: `https://developers.meta.com/horizon/documentation/web/web-launch/`

## 4. Targeted validation reference

Choose checks relevant to the changed behavior. [07](../07_TEST_AND_VALIDATION.md)
owns acceptance; [16](../16_PROGRESS_STATUS.md) owns results. Do not rerun this
entire list for routine documentation or desktop-only changes.

Available software/preview checks:

- `npm.cmd run typecheck`
- `npm.cmd run build`
- verify the production build includes `dist/webusb.html`
- desktop browser smoke check with no console errors
- mobile-size browser smoke check with preset switching and drag tilt
- DOM/MR slider synchronization check in both directions
- DOM/MR stimulus synchronization check that manual remains default, scripts override tilt only while selected, and Reset restores manual/rest
- DOM/MR trial control check that start/mark/next/stop update elapsed state and JSON/CSV exports include timestamp, preset, input mode, panel state, tilt, phase, and marker
- preview hand-scale check for 7 cm boxes and the local bottle/tumbler selector;
  separately verify actual device dimensions in connected mode

Quest-specific checks only if that work resumes (not a passed checklist):

- Cloudflare tunnel URL opens in Quest Browser,
- `/webusb.html` opens from the same tunnel and reports WebUSB/Web Serial
  feature detection,
- phone/desktop view loads before MR entry,
- `Enter MR` starts an immersive session when WebXR permissions are accepted,
- hand models appear when hand tracking is available,
- the selected right hand acquires the container without approaching its old
  position or pinching; tracking loss holds position and reacquires the same hand,
- opening thumb and index around the object centers the object between the fingertips without forcing an unnatural object orientation,
- active following hides the app-side hand mesh and shows the two contact markers,
- session exit restores the desktop view and clears panel/hand interaction state,
- controller ray selection can activate spatial panel preset rows, page the preset list, cycle stimulus scripts, operate trial buttons, adjust sliders, and trigger Reset Object,
- fingertip direct touch can activate the same panel controls near the panel face,
- preview boxes retain 7 cm scaling while connected boxes retain device dimensions,
- liquid/hybrid contents remain visually contained by the transparent shell under strong tilt.

Browser-only edits do not require a legacy StickS3 firmware build. If a change
also affects firmware or protocol, use the affected targets in
[development setup](19_DEVELOPMENT_SETUP.md).

## 5. Implemented connection and planned extensions

The live client already uses the StampC5 text/NDJSON bridge over Web Serial or
WebUSB and ESP-NOW, not a newly required WebSocket subscriber. Device-resolved
configuration supplies family, dimensions and fill. `DeviceDemo` maps actual
`mass.pos_norm` / `mass.vel_norm_s` and gravity-referenced IMU tilt into the view.
The bridge's versioned schema and command contract belong to
[05](../05_INTERFACE_SPEC.md); operational details belong to the client README.

The separate WebUSB probe diagnoses an actual host's access failure; it is not
a prerequisite architecture stage that still precedes the implemented bridge.

The tuning studio, liquid-then-sand rendering improvements, organization of the
existing dynamic-CG mapping and Android AR are planned in
[08](../08_IMPLEMENTATION_PLAN.md). Android model/browser selection and joint
USB/camera/AR operation remain unverified. Existing preview controls, desktop
passes and partial Quest evidence do not establish these future capabilities.
