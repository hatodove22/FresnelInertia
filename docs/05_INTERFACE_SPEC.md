# 05 Interface Specification

This document defines the control and telemetry interfaces.
The current firmware now exposes a baseline `SoftAP + WebSocket + JSON` transport in the remote-enabled build, while serial console commands remain available as the local fallback.

## 1. Canonical control-plane concepts

### Commands
- `set_param`
- `load_preset`
- `set_run_mode`
- `start_calibration`
- `stop_calibration`
- `request_telemetry`
- `set_tilt_mode`
- `record_start`
- `record_stop`
- `replay_start`
- `replay_stop`

### Telemetry
- timestamp
- active preset
- run mode
- IMU sample summary
- latent mass state
- recent event summary
- 4-channel actuator summary
- audio backend status (`compile_enabled`, `runtime_enabled`, `test_mode`, `test_wall`, `underrun_count`)
- calibration status (`active`, `finished`, `aborted`, `wall`, `band`, `stage`, `candidate_hz`, `best_hz`, `best_score`, `progress`, `loaded_from_storage`)
- recorder status (`recording`, `replaying`, `recorded_frames`, `replay_index`, `active_file`)
- remote status (`runtime_enabled`, `connected_clients`, `received_messages`, `transmitted_messages`)
- thumb/index tilt command summary

## 2. Transport policy

The internal message schema must be transport-independent.

### Recommended transport order
1. WebSocket + JSON for development and smartphone tuning
2. BLE GATT for cable-free local control when needed
3. UDP/OSC or WebSocket for HMD / host integration
4. optional binary/CBOR layer later for performance

### Current transport baseline
- current transport build: `m5stack-sticks3-remote`
- network mode: SoftAP by default, optional station mode when `iface.wifi_mode_ap=false`
- control: inbound WebSocket JSON using `schemas/control_message.schema.json`
- telemetry: low-rate WebSocket JSON push using `schemas/telemetry_frame.schema.json`
- frame parsing: buffered and non-blocking so partial client frames do not stall the main haptics loop

## 3. Message schemas

See:
- `schemas/control_message.schema.json`
- `schemas/telemetry_frame.schema.json`

The current firmware also exposes a serial console bridge for local control:
- `cal start`
- `cal stop`
- `cal status`
- `preset list`
- `preset load <name>`
- `record start|stop|status`
- `replay start <file>|stop|status`
- `tilt on|off|status`

## 4. Smartphone integration requirements

The smartphone client shall be able to:
- change presets,
- change parameters,
- start/stop calibration,
- subscribe to telemetry,
- save and restore parameter snapshots.

## 5. HMD / host integration requirements

The HMD or host application shall be able to:
- receive low-rate telemetry,
- set material/preset context,
- trigger experiment modes,
- synchronize replay sessions.

## 6. Recorder / replay format

### Development format
Use NDJSON or line-delimited JSON first for readability.
The current implementation records one telemetry snapshot per line and replays IMU + timestamp data back through the shared pipeline.

### Binary format later
If throughput becomes a problem, define a binary chunked format after the control-plane schemas stabilize.
