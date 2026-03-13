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

Runtime gates live in `SystemParams.features` and default to safe-off for audio, tilt, remote, recorder, and runtime calibration.

## Entry points

### `src/main.cpp`

- Initializes M5StickS3 and external 5V power if requested by `PlatformPins`.
- Builds the default liquid preset with `makeDefaultLiquidPreset()`.
- Starts `HapticPipeline`.
- Handles UI bindings:
  - `BtnA` click: cycle material family preset
  - `BtnA` hold: cycle audio test wall
  - `BtnB` click: toggle verbose serial
  - `BtnB` hold: toggle runtime audio enable
- Feeds serial console commands into `HapticPipeline::handleConsoleCommand()`.

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

## Pipeline stages

### 1. IMU sampling

`src/ImuSampler.cpp` converts board IMU output into `ImuSample { accel_g, gyro_dps, timestamp_us, valid }`.

### 2. Mass motion layer

`src/MassMotionLayer.cpp`

- Maintains a 2D latent mass state in normalized container coordinates.
- Uses geometry-aware span scaling so smaller containers produce shorter travel times and denser wall contacts.
- Applies family-specific mobility, damping, rebound, and energy shaping.
- Adds a convective bias term for liquid and hybrid families to approximate delayed free-surface motion.

Output:

- `MassState { pos_norm, vel_norm_s, energy, fill, headspace, spans, family }`

### 3. Event layer

`src/EventLayer.cpp`

- Detects direct wall hits for all families.
- Granular family:
  - `RollTrain`
  - `ImpactCluster`
  - `Scrape`
- Liquid family:
  - `DropletCluster`
  - `RoofSlap`
- Hybrid family:
  - liquid-like droplet bursts plus sparse rigid impact clusters

The event layer is stateful. It keeps cooldowns, phase accumulators, and activity variables so event density follows motion rather than emitting one-shot threshold spikes.

Output:

- `EventFrame<kMaxEventsPerFrame>`
- `lastEvent()` for telemetry

### 4. Texture layer

`src/TextureLayer.cpp`

- Converts each haptic event into one or more stateful texture voices.
- Internal atom kinds:
  - `HardPing`
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
- Keeps resonance as a per-voice representation instead of collapsing directly to 4 channels.
- Preserves source metadata needed for spatial rendering:
  - source event
  - primary wall
  - SOA hint
  - neighbor distribution flag

Output:

- `ResonanceFrame<kMaxResonanceVoicesPerFrame>`

### 6. Spatial renderer

`src/SpatialRenderer4.cpp`

- Maps resonance voices onto 4 walls.
- Applies local, neighbor, and opposite bleed using `SpatialRendererParams`.
- Supports simple delayed apparent motion for `FlowRipple` by queueing delayed drive frames.
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
- Supports runtime enable plus channel-isolation test mode.

When compile-disabled or runtime-disabled, `submit()` safely becomes a no-op.

### 8. Tilt-plane backend

`src/TiltPlaneServoInterface.cpp`

- Compile-gated raw Dynamixel Protocol 2.0 packet writer.
- Maps `MassState.pos_norm.x` into thumb/index target angles.
- Applies angle and current bounds before each submit.
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

### Filesystem overrides

`PresetStore` optionally overlays `/presets/<name>.json` from LittleFS on top of a built-in or family-default preset.

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
- Each line stores the telemetry snapshot needed for later offline inspection.
- Replay path reads recorded IMU samples and feeds them back into the same runtime pipeline.

Run-mode priority inside `HapticPipeline` is:

1. calibration
2. replay
3. record
4. requested idle/live

## Remote interface

`src/RemoteInterface.cpp`

- Compile-gated SoftAP + minimal WebSocket server
- Accepts JSON control messages matching `schemas/control_message.schema.json`
- Publishes low-rate telemetry JSON aligned with `schemas/telemetry_frame.schema.json`
- Queues parsed control messages for `HapticPipeline`

Supported control families:

- set parameter
- load preset
- set run mode
- start/stop calibration
- request telemetry
- enable/disable tilt
- start/stop record
- start/stop replay

## Telemetry model

Main struct: `TelemetrySnapshot` in `include/haptics/Types.hpp`

Carries:

- timestamp and frame counter
- active preset and run mode
- IMU sample
- mass state
- last event
- 4-channel actuator summary
- tilt command
- audio backend status
- calibration status
- recorder status
- remote status

Serial verbose output prints a compact summary every 250 ms. Recorder and remote telemetry use the same underlying snapshot.

## Console commands

Implemented in `HapticPipeline::handleConsoleCommand()`:

- `cal start|stop|status`
- `preset list`
- `preset load <name>`
- `record start|stop|status`
- `replay start <file>|stop|status`
- `tilt on|off|status`

## Where to edit for common tasks

- Change family physics: `src/MassMotionLayer.cpp`
- Change event semantics: `src/EventLayer.cpp`
- Change texture atoms: `src/TextureLayer.cpp`
- Change wall routing / SOA: `src/SpatialRenderer4.cpp`
- Change carrier calibration: `src/RuntimeCalibrator.cpp`
- Change preset defaults: `include/haptics/Parameters.hpp`
- Change preset JSON loading: `src/PresetStore.cpp`
- Change remote protocol: `src/RemoteInterface.cpp` and `schemas/`
- Change recorder format: `src/Recorder.cpp` and `schemas/`

## Current practical limits

- Bench validation is still pending for audio wall localization, liquid vs granular percept separation, and servo safety.
- Remote transport is intentionally minimal and optimized for bring-up, not for robust long-session networking.
- Recorder and replay are functional baseline implementations intended for inspection and iteration, not yet for high-volume logging.
