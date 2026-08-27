# 05 Interface Specification

This document defines the control and telemetry interfaces. The retained
StickS3 remote target uses **USB serial + SoftAP browser status**, with
`WebSocket + JSON` as its machine-readable backend. The first AtomS3 production
target deliberately compiles the remote backend out and is operated through
USB serial while the local hardware path is validated.

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
- IMU sample summary, including `valid`
- latent mass state
- recent event summary
- 4-channel actuator summary
- audio backend status (`compile_enabled`, `driver_installed`,
  `runtime_enabled`, `output_silenced`, `test_mode`, `test_wall`,
  `underrun_count`)
  - includes `transport`, `output_layout`, `active_output_channels`,
    `demo_compat_mode`, and the effective `output_peak_limit`
- always-present top-level safety status:
  - `imu_stale_safe_stop`
  - `audio_zero_asserted`
  - `tilt_disarmed`
- calibration status (`active`, `finished`, `aborted`, `wall`, `band`, `stage`,
  `candidate_hz`, `candidate_score`, `best_hz`, `best_score`, `progress`,
  `loaded_from_storage`)
- recorder status (`recording`, `replaying`, `recorded_frames`, `replay_index`)
  - the internal/serial status also carries `active_file`; the current
    WebSocket JSON object does not emit it
- remote status (`compile_enabled`, `runtime_enabled`, `connected_clients`,
  `received_messages`, `transmitted_messages`)
- optional pipeline debug status, emitted only when `features.enable_pipeline_debug_telemetry=true`:
  - `event_count`, `texture_count`, `resonance_count`
  - `mass_enabled`, `event_enabled`, `texture_enabled`, `resonance_enabled`, `spatial_enabled`
  - `imu_stale_safe_stop`
- thumb/index tilt command summary including:
  - final command angle
  - base tilt contribution
  - pseudo-force delta contribution
  - current limits
  - apparent mass / CoG / common-force / differential-torque debug terms

The tilt summary currently describes the model command. It is not proof that
an AtomS3 servo was commanded or that a DYNAMIXEL status packet was received.
Production telemetry does not yet expose servo position/current/temperature,
bus watchdog, torque-off read-back, or hardware error status.

## 2. Transport policy

The internal message schema must be transport-independent.

### Recommended transport order
1. WebSocket + JSON for development and smartphone tuning
2. BLE GATT for cable-free local control when needed
3. UDP/OSC or WebSocket for HMD / host integration
4. optional binary/CBOR layer later for performance

### Current transport profiles

| Environment | Human interface | Machine interface | Hardware-output status |
|---|---|---|---|
| `m5stack-sticks3-audio` | USB serial + SoftAP page | WebSocket JSON | legacy bench path |
| `m5stack-sticks3-remote` | USB serial + SoftAP page | WebSocket JSON | transport validation |
| `m5stack-atoms3-pipeline` | USB serial | remote backend compiled out | built, not yet uploaded/tested |

For the remote-enabled targets:

- network mode is SoftAP by default, with optional station mode when
  `iface.wifi_mode_ap=false`
- the HTTP status page listens on `iface.http_port`
- inbound control uses `schemas/control_message.schema.json`
- low-rate telemetry uses `schemas/telemetry_frame.schema.json`
- frame parsing is buffered and non-blocking so partial client frames do not
  stall the main haptics loop

TDM is an audio wire transport, not a control transport. The AtomS3 profile
uses `tdm8_slot` internally while control remains USB serial in this slice.

## 3. Message schemas

See:
- `schemas/control_message.schema.json`
- `schemas/telemetry_frame.schema.json`

The current firmware also exposes a serial console bridge for local control and snapshot monitoring:
- `status`
- `idle|stop`
- `live`
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
- `audio gain <0..4>`
- `audio limit <0..1>`
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
- `audio.transport = "dual_i2s" | "tdm8_slot"`
- `audio.output_peak_limit = 0..1`

`audio.transport` may be changed only while audio runtime output is disabled.
Only the documented transport/layout values (plus their explicit console
aliases) are accepted; an unknown string rejects the request and leaves the
active transport or layout unchanged. Numeric layout input keeps its legacy
2-channel/4-channel threshold behavior.
The same muted-only rule applies to `audio.demo_compat_mode` and
`audio.output_layout`. Demo compatibility mode is a legacy dual-I2S diagnostic
and cannot be enabled while `audio.transport=tdm8_slot`.
The `audio limit` command and `audio.output_peak_limit` request a software
limit; the backend reports the effective value after the compile-time ceiling.
For `m5stack-atoms3-pipeline`, the profile requests `0.08` and the compiled
hard ceiling is `0.15`, so a larger request cannot exceed 15% normalized PCM
peak. These values are not amplifier power, mechanical displacement, or a
linear perceptual-strength percentage.

## 3.1 Arming and hardware-state rules

- AtomS3 TDM clocks/driver may be active with `driver_installed=true` while
  `runtime_enabled=false`; in that state the firmware writes digital zeros
- the AtomS3 profile enables an IMU stale safe-stop: if no valid, finite sample
  is seen for more than 300 ms, all pipeline layers and the tilt model reset to
  neutral, TDM is forced to zero, and any enabled servo interface is disarmed;
  this is always observable through top-level `safety`, while the optional
  `pipeline_debug.imu_stale_safe_stop` is only a duplicate debug field
- `audio.output_silenced` and `safety.audio_zero_asserted` report the software
  zero assertion; `safety.tilt_disarmed` reports the software interface state
- a failed DMA zero-fill or raw-I2S uninstall is an audio configuration failure;
  the backend must retain the last known driver/silence state instead of
  reporting a successful mute or uninstall
- these fields do not prove S1 position, amplifier power, DYNAMIXEL torque
  read-back, or physical motion
- haptic signal generation requires explicit `audio on`, a runtime toggle, or
  an equivalent accepted control action
- a firmware built with `HAPTICS_ENABLE_AUDIO_BACKEND=0` rejects attempts to
  arm audio and retains the prior logical flags
- if a requested configuration and restoration of the prior configuration both
  fail, logical audio/test gates are forced OFF and status reports the actual
  retained driver and zero-assertion state
- S1 is manual and unobservable; telemetry cannot claim that the amplifier
  buffer is physically enabled or muted
- generic `set_param` traffic may disarm `features.enable_tilt_plane` but may
  not arm it
- remote `set_tilt_mode` arming requires
  `features.allow_remote_tilt_arm=true` and Live or Record run mode; the flag
  defaults false
- the local `tilt on` command also rejects arming outside Live or Record mode
- `m5stack-atoms3-pipeline` compiles the servo backend out, so none of these
  model-level controls constitute AtomS3 servo-actuation support

## 3.2 Safe Idle contract

The console `idle` and `stop` commands and remote `set_run_mode=idle` invoke
one Safe Idle transition. On the AtomS3 production profile, holding BtnA invokes
the same transition.

Safe Idle:

- exits Calibration, Replay, and Record
- submits digital zero and turns audio runtime output OFF
- disarms the tilt interface
- clears channel-test mode and its selected wall
- resets Mass, Event, Texture, Resonance, Spatial, and Tilt dynamic state
- enters `run_mode=idle`

After Safe Idle, `live` changes only the run mode. Physical output remains OFF
and zero asserted until a new explicit `audio on`. This prevents a mode change
from replaying stale dynamic energy or silently re-arming hardware.

The serial `status` line exposes `imu_stop` and `zero`. JSON/NDJSON clients use
the always-present top-level `safety` object; pipeline-debug telemetry is not
required for safety acceptance.

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

Recorder rows include the preset name, IMU validity bit, and audio
driver/transport/effective peak-limit/zero status plus the top-level safety
object. They do not capture
`preset_source`, `preset_path`, a fully resolved parameter snapshot/hash,
firmware/build identity, calibration identity, or DYNAMIXEL feedback; those are
required before a recording is considered a self-contained experiment record.

### Binary format later
If throughput becomes a problem, define a binary chunked format after the control-plane schemas stabilize.
