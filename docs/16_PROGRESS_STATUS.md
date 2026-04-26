# 16 Progress Status

This document is the repository status snapshot as of `2026-03-15`.
Its purpose is to make three things explicit:

- what is implemented in code today
- what exists only as a baseline or still needs hardware validation
- what the intended end-state still is

## 1. Executive summary

- The repository already contains a real on-device 4-layer haptic pipeline shared across liquid, granular, hybrid, and detented families.
- The main firmware path is `src/main.cpp` + `HapticPipeline`, with USB serial plus the SoftAP browser page as the supported human-facing monitoring workflow.
- Audio, recorder / replay, runtime resonance calibration, remote control / telemetry, and the XL330 tilt pseudo-force baseline are all present behind compile-time and runtime gates.
- A standalone `webxr/` visual client now exists for smartphone and Quest 3/3S demos without requiring live firmware communication.
- The main remaining gaps are bench validation, additive TDM migration, live transport expansion, storage / monitoring robustness, and servo safety tuning.

## 2. Build verification completed on 2026-03-15

The following PlatformIO environments were built successfully on `2026-03-15`:

- `m5stack-sticks3`
- `m5stack-sticks3-audio`
- `m5stack-sticks3-remote`
- `m5stack-sticks3-tilt`

This confirms compile integrity for the current baseline, audio, remote, and tilt paths.
It does not by itself prove hardware-side tactile quality, localization, or servo safety.

## 3. Progress against the required development order

| Order | Area | Status | What exists now | What is still missing |
|---|---|---|---|---|
| 1 | Audio backend abstraction | Implemented baseline | `AudioOutput4Ch` with compile-gated dual-stereo I2S x2, runtime `quad_wall_4ch` / `front_back_2ch`, test-wall routing, and demo-compat mono mode | Single-port TDM backend and full bench validation |
| 2 | Actuator sweep and resonance identification | Implemented baseline | `RuntimeCalibrator`, low/high carrier sweep, NVS-backed restore/store, calibration telemetry | Stronger identification metric and repeatable hardware characterization |
| 3 | Mass motion layer refinement | Implemented baseline | Geometry-aware latent mass state, family shaping, convective liquid bias, agitation coupling | More physical tuning and perceptual fitting on real hardware |
| 4 | Event layer: wall-hit only | Completed and extended | Geometry-aware `wall_hit` scheduling with size-dependent cooldown and direction bias | More bench localization validation |
| 5 | Event layer: shaker families | Implemented baseline | `roll_train`, `impact_cluster`, intermittent `scrape`, granular presets | Perceptual separation and tuning on hardware |
| 6 | Event layer: liquid families | Implemented baseline | `droplet_cluster`, `roof_slap`, liquid presets, hybrid liquid branch | More realism across fill / viscosity / container variation |
| 7 | Texture layer atoms | Implemented baseline | `hard_ping`, `knock_ping`, `detent_click`, `wet_burst`, `dry_rattle`, `scrape_noise`, `flow_ripple` | Further atom expansion only if tuning reveals a real need |
| 8 | 4-transducer spatial rendering | Implemented baseline | `SpatialRenderer4`, physical wall adjacency, SOA-aware flow motion, canonical `DriveFrame4` | Stronger four-wall bench localization validation |
| 9 | Telemetry / recorder / replay | Implemented baseline | Serial telemetry, shared `TelemetrySnapshot`, NDJSON recorder, IMU replay, WebSocket telemetry | Deterministic comparison metrics and recorder file-management UX |
| 10 | XL330 tilt-plane integration | Implemented baseline | Raw Dynamixel path, pseudo-force model, current / velocity / angle clamps, telemetry exposure | Sign calibration, safety validation, mechanical bench tuning |
| 11 | Smartphone / HMD transports | Partial | SoftAP HTTP status page plus WebSocket JSON control / telemetry baseline; standalone `webxr/` visual demo for phone and Quest MR | BLE / UDP / OSC, live XR telemetry/control, robust client UX |

## 4. Implemented now

- Shared on-device 4-layer pipeline: mass motion -> event -> texture -> resonance.
- Geometry-aware material rendering across liquid, granular, hybrid, and detented families.
- 4-wall spatial renderer that preserves wall identity and direction-aware apparent motion.
- Compile-gated audio backend with runtime-selectable 4-channel and Front/Back 2-channel output policies.
- Runtime resonance calibration with NVS-backed low/high carrier persistence.
- LittleFS-backed NDJSON recorder and IMU replay path.
- Compile-gated SoftAP HTTP + WebSocket JSON monitoring / control baseline.
- Compile-gated XL330 thumb/index tilt pseudo-force baseline.
- Standalone `webxr/` visual demo with smartphone touch/tilt input, Quest MR entry, pinch/grab bridge, procedural bench assets, local material visuals, and Cloudflare Quick Tunnel launch script.
- Probe-oriented bring-up environments for audio, display isolation, raw I2S, and staged main-firmware debugging.
- Feature-gated default behavior that keeps the baseline build stable when audio, remote, tilt, recorder, or calibration are disabled.
- Preset application now has an explicit runtime-config preservation helper so
  built-in and filesystem preset loads keep hardware/session gates, output
  configuration, recorder/interface settings, and calibrated carriers stable.

## 5. Implemented but not yet proven enough

- Four-wall localization and repeatability still need stronger bench evidence.
- Liquid / granular / hybrid perceptual separation and gain balance still need tuning on real hardware.
- Calibration currently uses an IMU-proxy response metric; stronger identification remains future work.
- Recorder / replay works as a baseline, but deterministic comparison tooling and file-management UX are still light.
- Remote monitoring is useful for bring-up, but long-session robustness and browser UX still need work.
- The WebXR demo is visual-only; live telemetry/control, persistence, and hosted deployment are still future work.
- XL330 control is present, but servo sign, current-based position behavior, and safety margins still need dedicated bench validation.

## 6. Not implemented yet

- Single-port TDM audio backend migration.
- BLE, UDP, and OSC transports beyond the reserved interface fields.
- Live HMD / host integration beyond the current WebSocket JSON baseline and standalone visual demo.
- Final hardware asset publication in `hardware/`.
- Final open-source license selection.

## 7. Ideal target state reaffirmed

The intended end-state is still the same:

1. One shared on-device 4-layer pipeline must cover all material families.
2. The 4-transducer path must remain responsible for mid/high-frequency wall events and texture rendering, not for low-frequency pseudo-force.
3. The thumb/index XL330 path must remain a separate low-frequency augmentation branch driven from the mass-motion state.
4. Container geometry must continue to constrain travel time, collision density, and wall-contact frequency before later rendering stages.
5. Transport changes must stay additive: `DriveFrame4`, presets, telemetry, and wall semantics should survive audio-backend migration unchanged.
6. New subsystems must remain behind compile-time and/or runtime gates with safe defaults.
7. The supported main-firmware monitoring workflow should remain USB serial plus SoftAP browser monitoring; display logic stays probe-only until panel stability is understood.

The formal target refinement model for that end-state is now captured in
`docs/17_PARAMETRIC_CONTAINER_HAPTICS_MODEL_SPEC.md`.
The current firmware should continue to evolve toward that model additively from
the existing reduced shared state, not via architectural replacement.

## 8. Recommended next focus

- Finish the additive TDM backend migration without breaking the dual-I2S fallback path.
- Bench-validate wall localization and material-family separation on the real transducer stack.
- Tighten the resonance identification metric and storage robustness.
- Validate XL330 safety, sign conventions, and pseudo-force percept scaling on hardware.
