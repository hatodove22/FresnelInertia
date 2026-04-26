# Container Haptics WebXR Demo

Standalone visual client for the parametric container haptics project.

This v1 demo does not communicate with the StickS3 firmware. It reads the repository presets at build time and renders an interactive visual approximation of the same container/content families.

The app is intentionally kept as a nested web project. Its Node dependencies, Vite config, generated assets, and tunnel script are isolated under `webxr/` so the PlatformIO firmware builds stay independent.

## Modes

- Phone: normal browser mode with touch drag and optional device-orientation tilt.
- Quest MR: WebXR AR session targeting Meta Quest 3/3S, with hand-tracking pinch/grab support.
- Desktop: normal browser mode plus IWSDK/IWER emulation during local development.

## Project layout

```text
webxr/
├── index.html
├── package.json
├── scripts/
│   └── start-quest-tunnel.ps1
├── src/
│   ├── input/PhoneInput.ts
│   ├── renderer/
│   │   ├── ContainerScene.ts
│   │   ├── EnvironmentScene.ts
│   │   └── ProceduralAssets.ts
│   ├── xr/WebXrBridge.ts
│   ├── main.ts
│   ├── presets.ts
│   ├── simulator.ts
│   └── types.ts
└── vite.config.ts
```

## Visual model

- Procedural texture assets are generated in-browser for the wooden bench, calibration mat, liquid normals, and sample label.
- The scene includes a small lab-bench environment so phone demos read as an object in space rather than a floating cube.
- Liquid visuals use a damped slosh state, animated surface mesh, normal ripples, and foam/bubble markers. The bulk liquid volume stays inset and clamped inside the container; only the liquid surface and internal offsets move.
- Granular and hybrid visuals use instanced particles with simple tilt-driven velocity, wall/floor bounce, damping, and hardness-dependent spread.

The visual state is local to the browser:

- preset fields are imported from `../presets/*.json`,
- `VisualSimulator` maps virtual tilt into slosh, agitation, impact pulse, waves, and particle spread,
- `ContainerScene` renders the transparent container, label, liquid, foam, and particles,
- `EnvironmentScene` provides the bench-like spatial context,
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

The firmware baseline should still be validated from the repository root:

```powershell
pio run -e m5stack-sticks3
```

## Notes

- The app imports `../presets/*.json` and does not define a second source of truth for material presets.
- Meta IWSDK packages are included for the Quest development foundation and IWER workflow. The runtime WebXR bridge is isolated so it can be swapped to deeper IWSDK ECS/grab components as those APIs stabilize.
- Live telemetry and control are intentionally deferred.
- Cloudflare Quick Tunnel URLs are temporary and last only while the local command is running.
