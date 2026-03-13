# 02 System Architecture

## 1. High-level architecture

```text
IMU
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

A future parallel channel will be added after the mass-motion layer:

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
- **Task D: control/telemetry**
  - serial debug
  - future smartphone/HMD gateway
  - future recorder/replay

## 3. Current code modules

| Module | Role |
|---|---|
| `ImuSampler` | board-specific IMU access |
| `MassMotionLayer` | latent state estimation |
| `EventLayer` | symbolic haptic events |
| `TextureLayer` | short haptic atoms / temporal patterns |
| `ResonanceLayer` | actuator-aware envelope projection |
| `SpatialRenderer4` | map onto 4 wall channels |
| `AudioOutput4Ch` | hardware backend for 4-channel output |
| `TiltPlaneServoInterface` | future XL330 control path |
| `RemoteInterface` | future smartphone/HMD transport |
| `Recorder` | future synchronized data capture |
| `HapticPipeline` | orchestration layer |

## 4. Data ownership policy

- `SystemParams` is the single runtime configuration object.
- `TelemetrySnapshot` is the canonical debug/export snapshot.
- Mass-state and event outputs should remain plain data structs, not hidden inside transport code.

## 5. Architectural invariants

1. The 4-transducer path is not responsible for the final low-frequency pseudo-force illusion.
2. The servo path must not replace the four-layer pipeline; it augments it.
3. Container geometry must influence the latent model before event scheduling.
4. Spatial rendering must be wall-aligned, not arbitrary 3D speaker panning.
