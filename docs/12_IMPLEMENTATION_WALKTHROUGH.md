# Implementation Walkthrough

## Purpose

This document explains how the current firmware is wired together in code so a future contributor can move from symptoms to the right module quickly.

## Build and feature gates

- Baseline environment: `platformio.ini` -> `env:m5stack-sticks3`
- Audio backend enabled: `env:m5stack-sticks3-audio`
- Remote backend enabled: `env:m5stack-sticks3-remote`
- Tilt servo backend enabled: `env:m5stack-sticks3-tilt`

Compile-time gates:

- `HAPTICS_ENABLE_AUDIO_BACKEND`
- `HAPTICS_ENABLE_REMOTE_BACKEND`
- `HAPTICS_ENABLE_TILT_SERVO`

Runtime gates live in `SystemParams.features` and default to safe-off for audio, tilt, remote, recorder, and runtime calibration. The debug display flag is now retained for probe-only use and is not part of the supported main-firmware path.

## Entry points

### `src/main.cpp`

- Initializes M5StickS3 and external 5V power if requested by `PlatformPins`.
- Builds the default liquid preset with `makeDefaultLiquidPreset()`.
- Starts `HapticPipeline`.
- Handles UI bindings:
  - `BtnA` click: cycle the built-in demo preset sequence
    `liquid_small_box -> granular_coin_box -> granular_single_marble_box -> hybrid_ice_water -> detented_custom`
  - `BtnA` hold: cycle audio test wall
  - `BtnB` click: toggle verbose serial
  - `BtnB` hold: toggle runtime audio enable
- Feeds serial console commands into `HapticPipeline::handleConsoleCommand()`.
- Does not use the StickS3 display in the normal main runtime path; the main monitoring surfaces are USB serial and SoftAP HTTP status.

### `src/HapticPipeline.cpp`

This is the orchestration layer. `begin()` wires up every subsystem in this order:

1. preset store
2. calibration carrier restore
3. IMU sampler
4. mass layer
5. event layer
6. texture layer
7. resonance layer
8. runtime calibrator
9. spatial renderer
10. audio output
11. tilt interface
12. remote interface
13. recorder

The main runtime loop is:

1. `tick()` pulls remote control messages.
2. If replay is active, `Recorder::pollReplay()` injects recorded IMU samples.
3. Otherwise the live IMU sample comes from `ImuSampler`.
4. `processSample()` runs the whole haptic pipeline and updates telemetry.

Preset changes go through a small runtime-config preservation path inside
`HapticPipeline`. `captureRuntimeConfig()` snapshots feature flags, pins,
audio, tilt, interface, recorder, and calibrated low/high carrier arrays before
a built-in or filesystem preset replaces the material model. `commitPresetParams()`
then restores those runtime fields, reconfigures the pipeline, and resets the
tilt model. This keeps preset cycling additive: material parameters can change
without silently changing the active hardware/session configuration.

## Pipeline stages

### 1. IMU sampling

`src/ImuSampler.cpp` converts board IMU output into `ImuSample { accel_g, gyro_dps, timestamp_us, valid }`.

### 2. Mass motion layer

`src/MassMotionLayer.cpp`

- Maintains a 2D latent mass state in normalized container coordinates.
- Uses geometry-aware span scaling so smaller containers produce shorter travel times and denser wall contacts.
- Applies family-specific mobility, damping, rebound, and energy shaping.
- Adds a convective bias term for liquid and hybrid families to approximate delayed free-surface motion.
- Adds a small agitation coupling from vertical acceleration magnitude and yaw-rate so liquid/detented presets still move when the user's shake is not cleanly aligned with board X/Y.

Output:

- `MassState { pos_norm, vel_norm_s, energy, fill, headspace, spans, family }`

### 3. Event layer

`src/EventLayer.cpp`

- Detects direct wall hits for all families.
- Uses `event.wall_threshold` as a soft wall-contact depth bias rather than a hard on/off cutoff so older presets remain active.
- Granular family:
  - `RollTrain`
  - `ImpactCluster`
  - `Scrape`
- Liquid family:
  - `DropletCluster`
  - `RoofSlap`
- droplet activity is additionally shaped by `event.splash_threshold` as a soft burst-activity reference
- burst drive also keeps a floor from latent `energy` so strong shake energy can still produce droplets even when planar position remains small
- Hybrid family:
  - liquid-like droplet bursts plus sparse rigid impact clusters
- Detented family:
  - discrete detent-like wall ticks
  - intermittent scrape instead of a per-frame placeholder
  - those ticks are still emitted as `WallHit` events but are rendered as a dedicated detent click inside the texture layer when the active family is `Detented`

The event layer is stateful. It keeps cooldowns, phase accumulators, and activity variables so event density follows motion rather than emitting one-shot threshold spikes.

Output:

- `EventFrame<kMaxEventsPerFrame>`
- `lastEvent()` for telemetry

### 4. Texture layer

`src/TextureLayer.cpp`

- Converts each haptic event into one or more stateful texture voices.
- Preserves event motion direction so later stages can render lead/trail apparent motion.
- Clustered wet and granular events now add a companion low-band support voice so
  single-transducer benches do not collapse into mostly high/noise energy.
- `Scrape` now also carries a companion low-band `FlowRipple` body so mono/demo-compat benches keep a tangible scrape feel.
- `HardPing` now uses `texture.hard_ping_high_ms` to shorten the high-band tail independently from the low-band body.
- Sparse hard-particle granular presets now map isolated wall/impact events to `KnockPing`, a shorter and crisper rigid-contact atom, so a single marble does not blur into the same rattle rendering as a bead cluster.
- Detented wall hits now map to `DetentClick`, a short low-mid-weighted click atom, instead of sharing the generic `HardPing` voicing.
- Internal atom kinds:
  - `HardPing`
  - `KnockPing`
  - `DetentClick`
  - `WetBurst`
  - `DryRattle`
  - `ScrapeNoise`
  - `FlowRipple`
- Each voice evolves over time and emits a `TextureCommand` every frame until its duration expires.

Output:

- `TextureFrame<kMaxTexturesPerFrame>`

### 5. Resonance layer

`src/ResonanceLayer.cpp`

- Applies wall-specific low/high gain shaping.
- Biases `WetBurst`, `DryRattle`, and `FlowRipple` more toward the low carrier
  than before so liquid and granular presets remain perceptible on the current
  single-amp bench.
- Gives `DetentClick` additional low-carrier weight so detented presets read as tactile notches instead of faint bright taps.
- Gives `KnockPing` a short low-mid plus crisp high transient so single-particle rigid impacts read as `kotsu`-like taps instead of softened cluster noise.
- Keeps resonance as a per-voice representation instead of collapsing directly to 4 channels.
- Preserves source metadata needed for spatial rendering:
  - source event
  - primary wall
  - motion direction
  - SOA hint
  - neighbor distribution flag

Output:

- `ResonanceFrame<kMaxResonanceVoicesPerFrame>`

### 6. Spatial renderer

`src/SpatialRenderer4.cpp`

- Maps resonance voices onto 4 walls.
- Applies local, neighbor, and opposite bleed using `SpatialRendererParams`.
- Uses physical wall adjacency (`Front/Back <-> Top/Bottom`) rather than index-ring adjacency.
- Supports direction-aware delayed apparent motion for `FlowRipple` by queueing lead/trail delayed drive frames.
- Produces both:
  - full-band `DriveFrame4 { low[4], high[4], noise[4] }`
  - summarized `ActuatorFrame4` for telemetry

### 7. Audio backend

`src/AudioOutput4Ch.cpp`

- Compile-gated legacy ESP32 I2S implementation.
- Uses two stereo TX buses:
  - `I2S_NUM_0` -> Front / Back
  - `I2S_NUM_1` -> Top / Bottom
- Synthesizes each wall from:
  - low carrier
  - high carrier
  - noise
- Supports runtime-selectable output layouts:
  - `quad_wall_4ch`: both buses active
  - `front_back_2ch`: only Front / Back are physically driven and Top / Bottom are collapsed into common-mode energy on that pair
- Supports runtime enable plus channel-isolation test mode.

When compile-disabled or runtime-disabled, `submit()` safely becomes a no-op.

### 8. Tilt-plane backend

`src/TiltPseudoForceModel.cpp`

- Keeps the existing base tilt driven by `MassState.pos_norm.x`.
- Estimates low-frequency shell + content CoG from:
  - `ContainerParams.shell_mass_kg`
  - `ContainerParams.content_mass_full_kg`
  - `ContainerParams.shell_cg_{x,y}_m`
  - filtered `MassState.pos_norm`
- Filters IMU acceleration into:
  - quasi-static gravity `g_qs`
  - gravity-removed low-frequency acceleration `a_dyn`
- Computes:
  - common-mode vertical inertia term
  - differential torque term about the thumb/index grasp width
- Maps pseudo-force through `atan()` plus branch clamps, total clamp, smoothing, deadband, and slew limiting.

`src/TiltPlaneServoInterface.cpp`

- Compile-gated raw Dynamixel Protocol 2.0 packet writer.
- Receives the already-combined `TiltPlaneCommand` from `HapticPipeline`.
- Applies angle and current bounds before each submit.
- Disabling runtime tilt now zeros current commands and explicitly drops servo torque.
- Intended for low-frequency pseudo-force cues, not texture rendering.

## Calibration

`src/RuntimeCalibrator.cpp`

- Sweeps low and high carrier ranges for each wall.
- Uses a settle window plus measure window.
- Scores candidates from IMU delta energy.
- Persists the winning low/high carrier arrays into NVS through `Preferences`.
- Restores saved carriers on boot before the rest of the pipeline configures.

During calibration:

- runtime mode reports `Calibration`
- normal audio drive is replaced by the sweep tone
- calibration status is pushed into telemetry

## Presets

### Built-in presets

Defined in `include/haptics/Parameters.hpp` and enumerated in `src/PresetStore.cpp`.

Current canonical families:

- liquid
- granular
- hybrid
- detented

Built-in demo presets now also include `granular_single_marble_box`, which approximates a `5 cm` cube with one hard marble by using very low particle count, high hardness, and sparse event rates.

### Filesystem overrides

`PresetStore` optionally overlays `/presets/<name>.json` from LittleFS on top of a built-in or family-default preset.
LittleFS mount is now attempted once during startup; if it fails, built-in preset load/list commands continue to work without retrying a mount inside the main loop.

Typical override domains:

- container geometry
- family selection
- event rates
- texture tuning
- spatial bleed
- resonance master gain

## Recorder and replay

`src/Recorder.cpp`

- Recording path writes NDJSON into LittleFS under `RecorderParams.record_dir`.
- The recorder keeps the file open during capture and flushes on `RecorderParams.flush_interval_frames` boundaries, then forces a final flush on stop.
- Each line stores the telemetry snapshot needed for later offline inspection.
- Replay path reads recorded IMU samples and feeds them back into the same runtime pipeline.

Run-mode priority inside `HapticPipeline` is:

1. calibration
2. replay
3. record
4. requested idle/live

## Remote interface

`src/RemoteInterface.cpp`

- Compile-gated WebSocket server with SoftAP or station-mode WiFi bring-up
- Exposes a lightweight HTTP status page on `iface.http_port`
- Accepts JSON control messages matching `schemas/control_message.schema.json`
- Publishes low-rate telemetry JSON aligned with `schemas/telemetry_frame.schema.json`
- Queues parsed control messages for `HapticPipeline`
- Uses buffered non-blocking frame parsing so incomplete client frames do not block the control loop

Supported control families:

- set parameter
- load preset
- set run mode
- start/stop calibration
- request telemetry
- enable/disable tilt
- start/stop record
- start/stop replay

## Standalone WebXR visual client

`webxr/`

- Lives outside the firmware build and has its own Node/Vite/TypeScript toolchain.
- Reads selected repository presets through `src/presets.ts` so visual demos do not define a second material catalog.
- Uses `src/simulator.ts` for browser-local visual dynamics:
  - damped second-order liquid/hybrid slosh
  - agitation and impact pulse
  - procedural waves
  - hardness/count-shaped particle spread
- Uses `src/renderer/ContainerScene.ts` for the transparent container, contained liquid volume, animated liquid surface, foam markers, label, and instanced granular/hybrid contents.
- Uses `src/renderer/EnvironmentScene.ts` plus `src/renderer/ProceduralAssets.ts` for the lab-bench setting and generated texture assets.
- Uses `src/input/PhoneInput.ts` for touch and DeviceOrientation tilt.
- Uses `src/xr/WebXrBridge.ts` for Quest Browser WebXR entry, hand models, and pinch/grab pose bridging.
- `npm.cmd run quest` calls `scripts/start-quest-tunnel.ps1`, which builds the app, starts a production preview, opens a Cloudflare Quick Tunnel, and prints a temporary Quest-accessible URL.

This client is visual-only in v1. It does not use the firmware remote interface, does not change `schemas/`, and does not drive the StickS3.

## Telemetry model

Main struct: `TelemetrySnapshot` in `include/haptics/Types.hpp`

Carries:

- timestamp and frame counter
- active preset and run mode
- IMU sample
- mass state
- last event
- 4-channel actuator summary
- tilt command including base tilt, pseudo-force delta, current limit, apparent mass, CoG, and force/torque debug terms
- audio backend status
- calibration status
- recorder status
- remote status

Serial verbose output prints a compact summary every 250 ms. Recorder and remote telemetry use the same underlying snapshot.

## Console commands

Implemented in `HapticPipeline::handleConsoleCommand()`:

- `status`
- `cal start|stop|status`
- `preset list`
- `preset load <name>`
- `record start|stop|status`
- `replay start <file>|stop|status`
- `tilt on|off|status`
- `remote status`
- `audio diag on|off`
- `audio on|off|status`
- `audio test front|back|top|bottom|off`
- `audio test level <0..1>`
- `audio layout 2ch|4ch`

## Where to edit for common tasks

- Change family physics: `src/MassMotionLayer.cpp`
- Change event semantics: `src/EventLayer.cpp`
- Change texture atoms: `src/TextureLayer.cpp`
- Change wall routing / SOA: `src/SpatialRenderer4.cpp`
- Change carrier calibration: `src/RuntimeCalibrator.cpp`
- Change low-frequency pseudo-force mapping: `src/TiltPseudoForceModel.cpp`
- Change preset defaults: `include/haptics/Parameters.hpp`
- Change preset JSON loading: `src/PresetStore.cpp`
- Change remote protocol: `src/RemoteInterface.cpp` and `schemas/`
- Change recorder format: `src/Recorder.cpp` and `schemas/`
- Change WebXR visual demo: `webxr/src/` and `docs/18_WEBXR_SMARTPHONE_DEMO.md`

## Current practical limits

- Bench validation is still pending for audio wall localization, liquid vs granular percept separation, and servo safety.
- Remote transport is intentionally minimal and optimized for bring-up, not for robust long-session networking.
- Recorder and replay are functional baseline implementations intended for inspection and iteration, not yet for high-volume logging.
- The WebXR client is a standalone visual demo; live telemetry subscription and hosted deployment remain future work.
