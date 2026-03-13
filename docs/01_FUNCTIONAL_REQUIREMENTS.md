# 01 Functional Requirements

This document defines the full feature set for the repository, including functions that are not implemented yet.

## 1. Core purpose

The system shall generate **on-device vibrotactile signals** for container contents using:

- a single **4-layer model**,
- **4 wall-aligned transducers** for mid/high-frequency spatial texture,
- future **2 tilt-plane servo channels** for low-frequency pseudo-force.

## 2. Functional requirement table

| ID | Feature | Description | Initial status |
|---|---|---|---|
| FR-01 | IMU sensing | Read 6-axis motion input from the device IMU. | Implemented baseline |
| FR-02 | Material family support | Support liquid, granular, hybrid, detented/custom families in one framework. | Implemented baseline |
| FR-03 | Mass motion layer | Estimate latent content motion state `(x, y, vx, vy, energy, fill, geometry)` from IMU. | Implemented baseline |
| FR-04 | Container-size-aware dynamics | Use container dimensions to constrain flight time, rolling time, and collision density. | Implemented baseline |
| FR-05 | Event layer | Generate wall-hit, roll-train, impact-cluster, droplet-cluster, roof-slap, and scrape events. | Implemented baseline |
| FR-06 | Texture layer | Convert events to short haptic atoms and apparent-motion patterns. | Implemented baseline |
| FR-07 | Resonance layer | Project texture atoms onto calibrated actuator resonance banks. | Implemented baseline |
| FR-08 | 4-channel spatial rendering | Render the resonance-layer output to four wall-aligned actuators. | Implemented baseline |
| FR-09 | Audio output abstraction | Provide a hardware abstraction for 4-channel output using stereo I2S x2 now, TDM x1 later. | Implemented (stereo I2S x2, compile-gated) |
| FR-10 | Runtime resonance calibration | Sweep and store low/high resonance carriers per actuator. | Implemented (NVS-backed storage, IMU-proxy sweep) |
| FR-11 | Preset system | Support human-readable presets for different content/material behaviors. | Implemented baseline |
| FR-12 | Parameter registry | Maintain a typed parameter model with units and future UI compatibility. | Documented |
| FR-13 | Telemetry | Expose internal states and recent events for serial/debug and future remote monitoring. | Implemented baseline |
| FR-14 | Recorder / replay | Capture synchronized sensor input, latent state, events, and output for repeatable experiments. | Implemented baseline |
| FR-15 | Smartphone interface | Support future smartphone parameter tuning and telemetry consumption. | Implemented baseline (SoftAP + WebSocket JSON) |
| FR-16 | HMD interface | Support future HMD / host integration through a stable control/telemetry protocol. | Partial: WebSocket JSON baseline |
| FR-17 | Servo tilt-plane interface | Reserve a control path for two XL330-M077-T servos for thumb/index tilt planes. | Implemented baseline (compile-gated) |
| FR-18 | Servo control policy | Support safe position/current-limited actuation for low-frequency pseudo-force augmentation. | Documented |
| FR-19 | Safety limits | Constrain output amplitude, servo angle, servo current, and runtime modes. | Documented |
| FR-20 | Open-source packaging | Keep software/hardware repositories ready for later public release. | Documented |

## 3. Non-functional requirements

### NFR-01 Real-time operation
- Sensor path: target 800-1600 Hz raw IMU acquisition.
- Latent state update: target 200-500 Hz.
- Audio render path: target 24 kHz or 48 kHz.

### NFR-02 Extensibility
- New material families must reuse the same four-layer architecture.
- New output transports must preserve the canonical internal message schema.

### NFR-03 Reproducibility
- A future recorder/replay path must support deterministic comparison of algorithm revisions.

### NFR-04 Additive evolution
- New implementations must preserve existing behavior when feature flags are disabled.
