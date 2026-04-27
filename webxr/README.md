# Container Haptics WebXR Demo

Standalone visual client for the parametric container haptics project.

This v1 demo does not communicate with the StickS3 firmware. It reads the repository presets at build time and renders an interactive visual approximation of the same container/content families.

The app is intentionally kept as a nested web project. Its Node dependencies, Vite config, generated assets, and tunnel script are isolated under `webxr/` so the PlatformIO firmware builds stay independent.

## Modes

- Phone: normal browser mode with touch drag and optional device-orientation tilt.
- Quest MR: WebXR AR session targeting Meta Quest 3/3S, with hand-tracking pinch/grab support and an in-scene experiment panel.
- Desktop: normal browser mode plus IWSDK/IWER emulation during local development.

## Project layout

```text
webxr/
|-- index.html
|-- package.json
|-- scripts/
|   `-- start-quest-tunnel.ps1
|-- src/
|   |-- input/PhoneInput.ts
|   |-- renderer/
|   |   |-- ContainerScene.ts
|   |   |-- EnvironmentScene.ts
|   |   |-- ProceduralAssets.ts
|   |   `-- SpatialControlPanel.ts
|   |-- xr/WebXrBridge.ts
|   |-- main.ts
|   |-- presets.ts
|   |-- simulator.ts
|   `-- types.ts
`-- vite.config.ts
```

## Visual model

- Procedural texture assets are generated in-browser for the wooden bench, calibration mat, liquid normals, and sample label.
- The scene includes a small lab-bench environment so phone demos read as an object in space rather than a floating cube.
- A lightweight spatial experiment panel is rendered as a Three.js canvas texture in the MR scene. It provides a preset list and two sliders so ray and fingertip direct-touch behavior can be evaluated before adopting a fuller IWSDK UIKit/UIKitML surface.
- Box presets are rendered as hand-scale 7 cm cubes in the WebXR demo so Quest hand tracking reads at a plausible physical size. This visual normalization does not rewrite the repository preset files.
- A WebXR-only `liquid_cylinder_bottle` preset adds a cylindrical bottle body with a neck, cap, circular liquid volume, and circular liquid surface.
- A WebXR-only `liquid_plastic_tumbler` preset adds a translucent tapered plastic cup with a raised rim, base, and slightly tapered liquid volume.
- Liquid visuals use a damped slosh state, animated surface mesh, normal ripples, and foam/bubble markers. The bulk liquid volume stays inset and clamped inside the container; only the liquid surface and internal offsets move.
- Granular and hybrid visuals use instanced particles with simple tilt-driven velocity, wall/floor bounce, damping, and hardness-dependent spread.

The visual state is local to the browser:

- preset fields are imported from `../presets/*.json`,
- `VisualSimulator` maps virtual tilt into slosh, agitation, impact pulse, waves, and particle spread,
- `ContainerScene` renders the transparent container, label, liquid, foam, and particles,
- `EnvironmentScene` provides the bench-like spatial context,
- `SpatialControlPanel` provides the in-scene prototype UI for ray/direct-touch list and slider interaction,
- no live telemetry, WebSocket, or StickS3 control path is used in v1.

## Development

```powershell
cd webxr
npm.cmd install
npm.cmd run dev
```

The dev server uses HTTPS because WebXR requires a secure context. Open the `Network` URL on a Quest connected to the same Wi-Fi, or use the app's `Send to Quest` button from a deployed HTTPS URL.

Use this mode for active desktop/mobile development. It includes Vite HMR and IWSDK/IWER dev support, but HMR is not the most reliable path through public tunnels.

For a Quest demo over the internet, run:

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
```

For Quest tunnel validation:

1. Run `npm.cmd run quest`.
2. Open the printed `trycloudflare.com` URL in Quest Browser.
3. Confirm the phone/desktop view loads before entering MR.
4. Press `Enter MR` and allow the browser's WebXR permissions.
5. Pinch/grab the container and tilt it; the rendered content should stay inside the transparent shell.
6. Aim a controller ray or bring an index fingertip near the spatial panel; preset rows and sliders should respond without requiring the phone HUD.

The firmware baseline should still be validated from the repository root:

```powershell
pio run -e m5stack-sticks3
```

## Notes

- The app imports `../presets/*.json` and does not define a second source of truth for material presets.
- WebXR box geometry is normalized to 7 cm for hand-scale visual inspection; firmware and haptic dimensions remain unchanged.
- Meta IWSDK packages are included for the Quest development foundation and IWER workflow. The runtime WebXR bridge is isolated so it can be swapped to deeper IWSDK ECS/grab, MultiPointer, UIKit, and UIKitML components as those APIs stabilize.
- Smartphone support is not a blocker for the MR panel path. The phone HUD stays DOM-based for quick demos, while the MR panel is a separate in-scene surface with its own interaction path.
- Live telemetry and control are intentionally deferred.
- Cloudflare Quick Tunnel URLs are temporary and last only while the local command is running.
