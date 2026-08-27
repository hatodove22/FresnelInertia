# 02 System Architecture

## 1. High-level architecture

```text
IMU
 ↓
Motion Activity Filter
 ↓
Mass Motion Layer
 ↓
Event Layer
 ↓
Texture Layer
 ↓
Resonance Layer
 ↓
Spatial Renderer (4 channels)
 ↓
Audio Output Backend
```

A parallel low-frequency channel is modeled after the mass-motion layer. Its
shared pseudo-force model and legacy StickS3 backend exist; the production
AtomS3 TX/RX DXL adapter remains future work:

```text
Mass Motion Layer
 ├─> Texture / resonance / 4 transducers
 └─> Low-frequency tilt-plane command generator -> XL330 thumb/index servos
```

## 2. Execution model

Recommended task decomposition for the ESP32-S3 development platform:

- **Task A: sensor sampling**
  - fetch IMU data
  - timestamp samples
- **Task B: control-rate update**
  - update mass motion state
  - schedule events
  - compute texture commands
- **Task C: audio-rate render**
  - generate four actuator streams
  - write to stereo I2S x2 or TDM x1
  - keep the canonical 4-wall drive frame transport-agnostic until `AudioOutput4Ch`
- **Task D: control/telemetry**
  - USB serial monitoring
  - SoftAP browser status page
  - WebSocket JSON control/telemetry
  - recorder/replay

## 3. Current code modules

| Module | Role |
|---|---|
| `ImuSampler` | board-specific IMU access |
| `MotionActivityFilter` | default-off gravity estimation, motion-band limiting, radial deadband, and missing-sample time contract |
| `MassMotionLayer` | latent state estimation |
| `EventLayer` | symbolic haptic events |
| `TextureLayer` | short haptic atoms / temporal patterns |
| `ResonanceLayer` | actuator-aware envelope projection |
| `SpatialRenderer4` | map onto 4 wall channels |
| `AudioOutput4Ch` | hardware backend for switchable `quad_wall_4ch` / `front_back_2ch` output over the retained dual-I2S path or the AtomS3 TDM8 path |
| `TiltPseudoForceModel` | shared low-frequency pseudo-force model that produces the desired tilt-plane command |
| `TiltPlaneServoInterface` | compile-gated legacy StickS3 DATA+DIR servo backend; the AtomS3 TX/RX production adapter remains pending and compiled out |
| `PresetStore` | built-in preset loading plus optional filesystem overrides |
| `RuntimeCalibrator` | bounded carrier sweep, observation, and retained calibration results |
| `RemoteInterface` | compile-gated StickS3 SoftAP/WebSocket/HTTP monitoring and control baseline; compiled out of AtomS3 production |
| `UsbTelemetryProducer` | AtomS3-production-only, compile/runtime-gated canonical NDJSON producer over the existing USB console; passive and boot-forced OFF |
| `Recorder` | current synchronized data capture baseline |
| `HapticPipeline` | orchestration layer |

## 4. Data ownership policy

- `SystemParams` is the single runtime configuration object.
- `TelemetrySnapshot` is the canonical debug/export snapshot.
- Mass-state and event outputs should remain plain data structs, not hidden inside transport code.
- The 4-wall `DriveFrame4` remains the canonical output of the shared haptic pipeline.
- Physical transport decisions such as dual-stereo I2S, single-port TDM, or mono diagnostic fallback belong only inside `AudioOutput4Ch`.
- The main firmware must not depend on the on-device display for normal monitoring.
- Any display bring-up logic is probe-only until low-level panel instability is understood.

## 5. Architectural invariants

1. The 4-transducer path is not responsible for the final low-frequency pseudo-force illusion.
2. The servo path must not replace the four-layer pipeline; it augments it.
3. Container geometry must influence the latent model before event scheduling.
4. Spatial rendering must be wall-aligned, not arbitrary 3D speaker panning.
