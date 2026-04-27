# 05 Interface Specification

This document defines the control and telemetry interfaces.
The current firmware treats **USB serial + SoftAP browser status** as the main human-facing monitoring path, while `WebSocket + JSON` remains the machine-readable control/telemetry backend.

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
  - includes `output_layout`, `active_output_channels`, and `demo_compat_mode`
- calibration status (`active`, `finished`, `aborted`, `wall`, `band`, `stage`, `candidate_hz`, `best_hz`, `best_score`, `progress`, `loaded_from_storage`)
- recorder status (`recording`, `replaying`, `recorded_frames`, `replay_index`, `active_file`)
- remote status (`runtime_enabled`, `connected_clients`, `received_messages`, `transmitted_messages`)
- optional pipeline debug status, emitted only when `features.enable_pipeline_debug_telemetry=true`:
  - `event_count`, `texture_count`, `resonance_count`
  - `mass_enabled`, `event_enabled`, `texture_enabled`, `resonance_enabled`, `spatial_enabled`
- thumb/index tilt command summary including:
  - final command angle
  - base tilt contribution
  - pseudo-force delta contribution
  - current limits
  - apparent mass / CoG / common-force / differential-torque debug terms

## 2. Transport policy

The internal message schema must be transport-independent.

### Recommended transport order
1. WebSocket + JSON for development and smartphone tuning
2. BLE GATT for cable-free local control when needed
3. UDP/OSC or WebSocket for HMD / host integration
4. optional binary/CBOR layer later for performance

### Current transport baseline
- current main monitoring build: `m5stack-sticks3-audio`
- current transport-only validation build: `m5stack-sticks3-remote`
- network mode: SoftAP by default, optional station mode when `iface.wifi_mode_ap=false`
- browser monitoring: HTTP status page on `iface.http_port`
- control: inbound WebSocket JSON using `schemas/control_message.schema.json`
- telemetry: low-rate WebSocket JSON push using `schemas/telemetry_frame.schema.json`
- frame parsing: buffered and non-blocking so partial client frames do not stall the main haptics loop

## 3. Message schemas

See:
- `schemas/control_message.schema.json`
- `schemas/telemetry_frame.schema.json`

The current firmware also exposes a serial console bridge for local control and snapshot monitoring:
- `status`
- `cal start`
- `cal stop`
- `cal status`
- `preset list`
- `preset load <name>`
- `record start|stop|status`
- `replay start <file>|stop|status`
- `tilt on|off|status`
- `audio diag on|off`
- `audio on|off|status`
- `audio test front|back|top|bottom|off`
- `audio test level <0..1>`
- `audio layout 2ch|4ch`
- `remote status`

Typical live tuning paths for the revised tilt branch:
- `container.shell_mass_kg`
- `container.content_mass_full_kg`
- `container.shell_cg_x_m`
- `container.shell_cg_y_m`
- `tilt.enable_pseudoforce`
- `tilt.k_cm`
- `tilt.k_tau`
- `tilt.k_phi`
- `tilt.w_eff_m`
- `tilt.max_delta_cm_deg`
- `tilt.max_delta_df_deg`
- `tilt.max_delta_total_deg`
- `tilt.max_total_cmd_deg`

Runtime experiment/debug paths:
- `features.enable_pipeline_debug_telemetry`
- `container.span_x_m`
- `container.span_y_m`
- `container.span_z_m`
- `mass.natural_freq_x_hz` or `mass.natural_freq_x`
- `mass.natural_freq_y_hz` or `mass.natural_freq_y`
- `mass.damping_ratio_x`
- `mass.damping_ratio_y`
- `mass.energy_decay_s`
- `mass.accel_to_energy_gain`
- `mass.gyro_to_energy_gain`
- `mass.rebound`
- `texture.hard_ping_low_ms` or `texture.hard_ping_low`
- `texture.hard_ping_high_ms` or `texture.hard_ping_high`
- `texture.wet_burst_ms` or `texture.wet_burst`
- `texture.dry_rattle_ms` or `texture.dry_rattle`
- `texture.scrape_noise_ms` or `texture.scrape_noise`
- `texture.flow_ripple_soa_ms` or `texture.flow_ripple_soa`
- `texture.default_high_bias`
- `calibration.low_start_hz` or `calibration.low_start`
- `calibration.low_stop_hz` or `calibration.low_stop`
- `calibration.low_step_hz` or `calibration.low_step`
- `calibration.high_start_hz` or `calibration.high_start`
- `calibration.high_stop_hz` or `calibration.high_stop`
- `calibration.high_step_hz` or `calibration.high_step`
- `calibration.settle_ms`
- `calibration.measure_ms`
- `calibration.drive_level`
- `iface.telemetry_period_ms`
- `recorder.flush_interval_frames`

Typical audio layout control paths:
- `audio.output_layout = "quad_wall_4ch"`
- `audio.output_layout = "front_back_2ch"`
- `audio.demo_compat_mode = true`

## 4. Smartphone integration requirements

The smartphone client shall be able to:
- change presets,
- change parameters,
- start/stop calibration,
- subscribe to telemetry,
- save and restore parameter snapshots.

The built-in browser status page is intentionally read-oriented. It is for:
- current preset and run-mode inspection
- recent event and actuator summary
- audio / calibration / recorder / remote / tilt status
- quick bench confirmation without a custom client

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
When `features.enable_pipeline_debug_telemetry=true`, recorder lines include the same optional `pipeline_debug` object as remote telemetry; with the flag false, the record shape stays on the baseline fields.

### Binary format later
If throughput becomes a problem, define a binary chunked format after the control-plane schemas stabilize.
