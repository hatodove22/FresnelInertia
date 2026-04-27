# 18 WebXR and Smartphone Demo

This document defines the standalone visual client in `webxr/`.

## 1. Scope

- The web client is a local visual/demo layer, not firmware.
- The v1 app does not communicate with the StickS3.
- Existing presets in `presets/` remain the source for material family, fill, viscosity, particle count, and hardness. The WebXR renderer normalizes box visuals to 7 cm cubes for Quest hand-scale inspection.
- Firmware `src/`, `include/haptics/`, and `schemas/` stay unchanged until live telemetry/control is added.
- The client is intentionally self-contained under `webxr/` with its own `package.json`, `package-lock.json`, Vite config, TypeScript config, and Quest tunnel script.

## 1.1 Current module map

| Module | Role |
|---|---|
| `src/main.ts` | Three.js renderer setup, UI wiring, preset selection, animation loop |
| `src/presets.ts` | imports selected repository preset JSON files and validates the visual subset |
| `src/simulator.ts` | local visual-only content dynamics for slosh, agitation, waves, impacts, and particle spread |
| `src/renderer/ContainerScene.ts` | transparent shell, sample label, liquid, foam, and granular/hybrid instancing |
| `src/renderer/EnvironmentScene.ts` | lab-bench environment, mat, panel, small props, and cables |
| `src/renderer/GripProxy.ts` | visual thumb/index contact markers used while an object is grabbed |
| `src/renderer/ProceduralAssets.ts` | in-browser canvas textures for wood, mat, liquid normals, and labels |
| `src/renderer/SpatialControlPanel.ts` | in-scene experiment panel for ray/direct-touch preset rows, sliders, and reset |
| `src/input/PhoneInput.ts` | touch-drag tilt and optional DeviceOrientation input |
| `src/xr/WebXrBridge.ts` | WebXR AR button integration, hand model setup, near-grab position bridge, and lightweight panel ray/touch routing |
| `scripts/start-quest-tunnel.ps1` | production preview plus Cloudflare Quick Tunnel launcher |

## 2. Runtime modes

### Phone mode

- Opens as a normal mobile 3D page.
- Uses touch drag for virtual tilt.
- Can use DeviceOrientation after explicit user permission.
- Shows preset selection and compact readouts for family, fill, and tilt.

### Quest MR mode

- Targets Meta Quest 3/3S in Quest Browser.
- Starts an `immersive-ar` WebXR session when available.
- Requests hand tracking, hit test, anchors, plane detection, and mesh detection as optional features.
- Uses near-grab to attach the virtual container when a tracked hand approaches the object. When thumb and index fingertips are separated enough to imply opposing contact, the bridge centers the object between those fingertips. Otherwise it estimates a grab position from wrist, thumb, index, and middle finger joints.
- While near-grab is active, the app-rendered mesh for that tracked hand is hidden and replaced by two contact markers attached to the object. This only changes visualization; the raw WebXR hand joints remain the input source.
- Shows a spatial experiment panel near the container. Controller rays can select rows and drag sliders; index fingertips can directly touch the panel face when hand joints are available.
- The panel's fixed Reset Object button releases the active grab, applies a short re-grab cooldown, and respawns the object at the table rest pose.
- Uses the same visual simulator as phone mode so content response stays consistent.
- For off-LAN demos, use `npm.cmd run quest` to start a production preview plus Cloudflare Quick Tunnel.

### Desktop mode

- Uses the same scene and UI as phone mode.
- Useful for visual iteration and Playwright smoke checks.
- IWSDK/IWER dependencies are present for development alignment, but the current runtime bridge remains a small isolated adapter.

## 2.1 Visual realism baseline

The v1 visual client uses procedural assets instead of external binary files:

- a wood-grain bench texture,
- a calibration mat texture,
- liquid normal/ripple texture,
- per-preset sample labels.

The environment is intentionally lab-like: table, mat, rear panel, small instrument block, sample pucks, and cables. This keeps the demo grounded for smartphone sharing while still being lightweight enough for Quest Browser.

Visual container sizing:

- box-shaped presets render as 7 cm cubes regardless of the source preset's haptic travel dimensions,
- the firmware-facing preset JSON files are not rewritten by this visual normalization,
- the WebXR-only `liquid_cylinder_bottle` entry adds a 7 cm diameter cylindrical bottle with a neck, cap, circular liquid body, and circular liquid surface,
- the WebXR-only `liquid_plastic_tumbler` entry adds a 7 cm top-diameter tapered plastic cup with an open rim, small base, and tapered liquid body.

The spatial experiment panel is intentionally separate from the smartphone HUD:

- phone controls remain DOM-based for low-friction sharing,
- MR controls live as a textured Three.js panel in the scene,
- the panel currently exposes a preset list, motion-boost slider, damping-preview slider, and fixed object reset button,
- the panel is a prototype surface for experimental controls, not the final firmware control protocol.

Grab visualization:

- the active app-side hand mesh is hidden during near-grab,
- a container-attached proxy displays only thumb and index contact pads around the object,
- no synthetic finger bars are rendered, so the substitution reads as contact feedback rather than a fake hand,
- the object is not forced into the hand's full quaternion pose; its visual tilt remains governed by the simulator path so liquid surfaces stay aligned inside the container,
- releasing or resetting restores the hand mesh and hides the proxy.

Content behavior is visual-only but now follows the same intuition as the haptic model:

- liquid and hybrid surfaces use a damped second-order slosh state with viscosity-dependent response,
- the bulk liquid volume is inset and clamped inside the transparent container to avoid visible wall penetration,
- round container liquid uses radial clamping for the body and liquid surface,
- liquid surfaces add mesh waves, normal-map drift, and foam markers under agitation,
- granular and hybrid particles integrate simple tilt-driven velocity with wall/floor bounce,
- particle spread and bounce intensity are shaped by preset particle count and hardness.

This is not a full fluid solver. The visual goal is believable demo behavior that tracks the haptic model's material distinctions without introducing a second canonical physics model.

## 2.2 Server and tunnel workflow

Development:

```powershell
cd webxr
npm.cmd install
npm.cmd run dev
```

Quest demo over the internet:

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

## 3. Meta Immersive Web SDK alignment

The app follows the Meta Immersive Web SDK direction without coupling the firmware project to the web stack:

- `@iwsdk/vite-plugin-dev` provides the local development and IWER emulation path.
- `@iwsdk/core` and `@iwsdk/xr-input` are included as the IWSDK foundation packages.
- The WebXR bridge is isolated in the web client so deeper IWSDK ECS/grab, MultiPointer, UIKit, and UIKitML components can replace the current adapter later without changing the simulator or firmware.
- Local development uses HTTPS because WebXR requires a secure origin.
- Meta's current IWSDK documentation organizes this area around Spatial UI/UIKit/UIKitML for panels and MultiPointer ray/grab routing for XR input. The current panel mirrors those concepts with a small Three.js implementation first, because it is easier to iterate in this repository before adopting the full ECS UI stack.

Reference pages:

- Immersive Web SDK overview: `https://developers.meta.com/horizon/documentation/web/iwsdk-overview/`
- IWSDK project setup: `https://developers.meta.com/horizon/documentation/web/iwsdk-guide-project-setup/`
- IWSDK testing experience: `https://developers.meta.com/horizon/documentation/web/iwsdk-guide-testing-experience/`
- IWSDK Spatial UI/UIKit: `https://developers.meta.com/horizon/documentation/web/iwsdk-concept-spatial-ui-uikit/`
- IWSDK XR Input pointers: `https://developers.meta.com/horizon/documentation/web/iwsdk-concept-xr-input-pointers/`
- Web Launch: `https://developers.meta.com/horizon/documentation/web/web-launch/`

## 4. Validation

Required local checks:

- `npm.cmd run typecheck`
- `npm.cmd run build`
- desktop browser smoke check with no console errors
- mobile-size browser smoke check with preset switching and drag tilt
- hand-scale check that box presets appear as 7 cm cubes and the cylindrical bottle / plastic tumbler presets appear in the selector

Quest checks:

- Cloudflare tunnel URL opens in Quest Browser,
- phone/desktop view loads before MR entry,
- `Enter MR` starts an immersive session when WebXR permissions are accepted,
- hand models appear when hand tracking is available,
- approaching a tracked hand attaches the container to the estimated grab position without requiring a pinch,
- opening thumb and index around the object centers the object between the fingertips without forcing an unnatural object orientation,
- active near-grab hides the app-side hand mesh and shows only the two contact markers,
- release and Reset Object restore the app-side hand mesh and hide the proxy,
- moving the hand away releases near-grab by hysteresis, and Reset Object forcibly releases then respawns the container at the table rest pose,
- controller ray selection can activate spatial panel preset rows, adjust sliders, and trigger Reset Object,
- fingertip direct touch can activate the same panel controls near the panel face,
- grabbed box presets read as 7 cm hand-scale objects rather than oversized containers,
- liquid/hybrid contents remain visually contained by the transparent shell under strong tilt.

Firmware regression check:

- `pio run -e m5stack-sticks3`

## 5. Deferred integration

The first live integration should consume the existing WebSocket telemetry schema from `schemas/telemetry_frame.schema.json` and map:

- `mass.pos_norm` and `mass.vel_norm_s` to visible content offset / flow,
- `last_event` to visible wall-hit or droplet/particle bursts,
- `actuators` to optional wall highlight overlays.

No schema change is required for a read-only visual subscriber.
