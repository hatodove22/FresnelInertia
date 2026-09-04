# 01 Functional Requirements

This document defines the full feature set for the repository, including functions that are not implemented yet.

## 1. Core purpose

The system shall generate **on-device vibrotactile signals** for container contents using:

- a single **4-layer model**,
- **4 wall-aligned transducers** for mid/high-frequency spatial texture,
- a separate **2-channel tilt-plane branch** for low-frequency pseudo-force.

Status terms in the table are strict:

- **Implemented** means source code exists behind the documented gates.
- **Probe hardware pass** means only the bounded dedicated probe was exercised.
- **Production hardware pass** requires the live shared pipeline on the named
  target and is not implied by a probe pass.

## 2. Functional requirement table

| ID | Feature | Description | Current status on 2026-08-22 |
|---|---|---|---|
| FR-01 | IMU sensing | Read 6-axis motion input from the device IMU. | Implemented baseline; AtomS3 IMU passed dedicated and combined probes |
| FR-02 | Material family support | Support liquid, granular, hybrid, detented/custom families in one framework. | Implemented baseline |
| FR-03 | Mass motion layer | Estimate latent content motion state `(x, y, vx, vy, energy, fill, geometry)` from IMU. | Implemented baseline |
| FR-04 | Container-size-aware dynamics | Use container dimensions to constrain flight time, rolling time, and collision density. | Implemented baseline |
| FR-05 | Event layer | Generate wall-hit, roll-train, impact-cluster, droplet-cluster, roof-slap, and scrape events. | Implemented baseline |
| FR-06 | Texture layer | Convert events to short haptic atoms and apparent-motion patterns. | Implemented baseline |
| FR-07 | Resonance layer | Project texture atoms onto calibrated actuator resonance banks. | Implemented baseline |
| FR-08 | 4-channel spatial rendering | Render the resonance-layer output to four wall-aligned actuators. | Implemented baseline |
| FR-09 | Audio output abstraction | Preserve canonical 4-wall output across dual-I2S and single-port TDM transports with a Front/Back fallback. | Dual-I2S and eight-slot TDM implemented; raw AtomS3 TDM transport passed hardware, live four-layer AtomS3 output not yet passed |
| FR-10 | Runtime resonance calibration | Sweep and store low/high resonance carriers per actuator. | Implemented (NVS-backed storage, IMU-proxy sweep) |
| FR-11 | Preset system | Support human-readable presets for different content/material behaviors. | Implemented baseline |
| FR-12 | Parameter registry | Maintain a typed parameter model with units and future UI compatibility. | Typed model implemented; runtime surface and preset reproducibility remain partial |
| FR-13 | Telemetry | Expose internal states and recent events for serial/debug and future remote monitoring. | Implemented baseline, including IMU validity and audio transport/driver/peak-limit status; DXL hardware feedback is not yet in production telemetry |
| FR-14 | Recorder / replay | Capture synchronized sensor input, latent state, events, and output for repeatable experiments. | Baseline implemented; resolved preset/build/calibration identity and deterministic comparison tooling remain incomplete |
| FR-15 | Smartphone interface | Support future smartphone parameter tuning and telemetry consumption. | StickS3 SoftAP + WebSocket baseline implemented; AtomS3 production remote is compile-disabled |
| FR-16 | HMD interface | Support future HMD / host integration through a stable control/telemetry protocol. | Partial: WebSocket JSON baseline |
| FR-17 | Servo tilt-plane interface | Reserve a control path for two XL330-M077-T servos for thumb/index tilt planes. | Legacy DIR-pin backend implemented; as-built AtomS3 DXL communication/motion passed probes, but the production AtomS3 servo adapter is not implemented and is compile-disabled |
| FR-18 | Servo control policy | Support preflighted, watchdog-protected, position/current-limited low-frequency actuation. | Probe safety envelope passed unloaded; production AtomS3 read-back/watchdog policy remains unimplemented |
| FR-19 | Safety limits | Constrain haptic peak, stale-sensor behavior, servo angle/current, and runtime arm states. | AtomS3 profile implements 8% initial/15% hard normalized-PCM limits plus a 300 ms IMU stale safe-stop; probe bursts passed at both levels, but production safe-stop/mounted safety and AtomS3 servo safety remain pending |
| FR-20 | Open-source packaging | Keep software/hardware repositories ready for later public release. | Documented |

## 3. Non-functional requirements

### NFR-01 Real-time operation
- Sensor path: target 800-1600 Hz raw IMU acquisition.
- Latent state update: target 200-500 Hz.
- Audio render path: target 24 kHz or 48 kHz.
- These are targets until the production telemetry and soak tests in
  `07_TEST_AND_VALIDATION.md` record achieved rates and overruns.

### NFR-02 Extensibility
- New material families must reuse the same four-layer architecture.
- New output transports must preserve the canonical internal message schema.

### NFR-03 Reproducibility
- The current recorder/replay baseline must be extended with resolved parameter
  identity and deterministic comparison metrics before it is treated as a
  reproducible experiment record.

### NFR-04 Additive evolution
- New implementations must preserve existing behavior when feature flags are disabled.
