# 05 Interface Specification

This document defines the control and telemetry interfaces. The retained
StickS3 remote target uses **USB serial + SoftAP browser status**, with
`WebSocket + JSON` as its machine-readable backend. The first AtomS3 production
target deliberately compiles the remote backend out. It is operated through
USB serial and has an independent local, boot-forced-OFF canonical NDJSON
producer for authorized evidence capture while the hardware path is validated.

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
- always-present diagnostic counters:
  - `frame_counter`: accepted pipeline frames since boot, saturated at the
    JSON safe-integer limit
  - `new_evt`: events admitted to this frame's bounded `EventFrame`, in the
    range 0--16
  - `evt_total`: boot-lifetime admitted-event count, saturated at the JSON
    safe-integer limit `9007199254740991`
- active preset
- run mode
- IMU sample summary, including `valid`
- latent mass state
- last event admitted and latched for the recent-event summary
- 4-channel actuator summary
- audio backend status (`compile_enabled`, `driver_installed`,
  `runtime_enabled`, `output_silenced`, `test_mode`, `test_wall`,
  `underrun_count`)
  - includes `transport`, `output_layout`, `active_output_channels`,
    `demo_compat_mode`, and the effective `output_peak_limit`
- always-present top-level safety status:
  - `imu_stale_safe_stop`
  - `imu_fault_injection_active` (schema-optional for backward compatibility)
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
  - `event_count`, a compatibility mirror of top-level `new_evt`, plus
    `texture_count` and `resonance_count`
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
| `m5stack-atoms3-pipeline` | USB serial | local canonical NDJSON, runtime OFF at boot; remote backend compiled out | prior image built/uploaded; routing passed; powered settling failed and is the active blocker |

For the remote-enabled targets:

- network mode is SoftAP by default, with optional station mode when
  `iface.wifi_mode_ap=false`
- the HTTP status page listens on `iface.http_port`
- inbound control uses `schemas/control_message.schema.json`
- low-rate telemetry uses `schemas/telemetry_frame.schema.json`
- frame parsing buffers partial client frames, but receive work per tick,
  malformed-frame behavior, queue overflow, and slow-client handling still
  require explicit budgets and automated robustness tests

TDM is an audio wire transport, not a control transport. The AtomS3 profile
uses `tdm8_slot` internally while control remains USB serial in this slice.
The AtomS3 USB producer is observation-only: its compile gate is enabled only
for `m5stack-atoms3-pipeline`, its runtime parameter defaults false, and only
the local `usb telemetry on|off|status` commands control it. Presets and remote
parameter commands cannot arm it. See document 26 for framing, counters, and
the exact mixed-log evidence workflow.

### Planned AtomS3 developer observer

The first AtomS3 wireless target is a separate developer environment, not a
change to `m5stack-atoms3-pipeline` and not the Gate 11 product transport. Its
scope is defined in `25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md`:

- SoftAP only at first, one client, low-rate telemetry, and host-side NDJSON
  capture
- Monitor policy: telemetry and request telemetry only; no network state
  mutation in the first observer
- remote audio/tilt arm, Live/calibration/replay start, output/safety changes,
  and OTA rejected
- an authenticated priority Safe Idle command is a later sub-slice, after
  queue clearing, generation invalidation, dual policy checks, and
  postcondition telemetry exist; USB and AtomS3 BtnA remain the initial stop
  paths
- transport-independent JSON codec and command policy tested on the host
  before the environment is enabled
- request IDs, ACK/NACK reasons, strict enum validation, and observable
  parse/auth/queue/drop counters
- device-specific credentials delivered through a local channel rather than a
  production password committed in source

The existing StickS3 remote baseline does not yet meet this policy. In
particular, the current generic control path can change output and safety
related parameters, and a missing/invalid run-mode value must be changed from
its current Live fallback to explicit rejection before AtomS3 reuse.

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
- `usb telemetry on|off|status`
- `imu fault on|off|status` (AtomS3 pipeline build only)

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
- `m5stack-atoms3-pipeline` alone compiles a local controlled fault diagnostic.
  In Live mode, `imu fault on` makes only subsequent physically polled IMU
  samples invalid; it does not invoke reset, zero output, disarm, or Safe Idle
  directly. The existing greater-than-300-ms stale path remains the sole owner
  of those actions. Before stale-stop asserts, `imu fault off` may abort the
  diagnostic and restore real samples. After assertion it is rejected, and
  Safe Idle is the mandatory release that clears injection and disarms outputs
  together; begin also clears injection. `safety.imu_fault_injection_active` distinguishes
  this controlled condition from a real sensor fault. The field is optional in
  the JSON schema so older canonical logs remain valid. No preset, generic
  parameter, recorder replay, or remote-control path can activate injection.
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
- clears controlled IMU fault injection
- resets Mass, Event, Texture, Resonance, Spatial, and Tilt dynamic state
- enters `run_mode=idle`

After Safe Idle, `live` changes only the run mode. Physical output remains OFF
and zero asserted until a new explicit `audio on`. This prevents a mode change
from replaying stale dynamic energy or silently re-arming hardware.

The serial verbose and `status` lines expose `frame`, `new_evt`, `evt_total`,
`imu_stop`, `imu_fault`, and `zero`. `last_event` is historical/latched, so a prior event can
remain visible while `new_evt=0`. Remote JSON and recorder NDJSON emit the same
three counters at top level regardless of the pipeline-debug flag. Safe Idle,
preset/reconfiguration, stale-stop, Record, and Replay transitions clear only
the current-frame event count; they preserve the boot total. A rejected
processing interval does not advance any counter.
Top-level `safety` remains always present and pipeline-debug telemetry is not
required for either safety or event acceptance.

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

For the portable research demo, the current preferred candidate is an optional
USB-to-radio Haptic Link rather than a required direct Wi-Fi connection to the
haptic device. One Android phone or Quest client connects through WebUSB to a
StickS3-class dongle, which relays preset/override changes, state, and transient
VR collision/effect triggers to the standalone AtomS3 device. This candidate is
not implemented or hardware-validated; see `27_HAPTIC_LINK_DONGLE_CONCEPT.md`.
The existing WebSocket path remains a development/fallback transport.

## 6. Recorder / replay format

### Development format
Use NDJSON or line-delimited JSON first for readability.
The current implementation records one telemetry snapshot per line and replays IMU + timestamp data back through the shared pipeline.
When `features.enable_pipeline_debug_telemetry=true`, recorder lines include the same optional `pipeline_debug` object as remote telemetry; with the flag false, the record shape stays on the baseline fields.

Recorder rows always include `frame_counter`, `new_evt`, and `evt_total` in
addition to the preset name, IMU validity bit, and audio
driver/transport/effective peak-limit/zero status plus the top-level safety
object. They do not capture
`preset_source`, `preset_path`, a fully resolved parameter snapshot/hash,
firmware/build identity, calibration identity, or DYNAMIXEL feedback; those are
required before a recording is considered a self-contained experiment record.

### Host lab plan and report schemas

`schemas/lab_run_plan.schema.json` defines offline acceptance plans and
`schemas/lab_report.schema.json` defines the generated JSON report. These are
host artifacts; they do not add a firmware command or authorize physical
output. The passive tool in `tools/lab/` consumes canonical telemetry, copies
the exact schemas into each evidence directory, and hashes every artifact.

`frame_counter_mode=contiguous` is for full-rate recordings, while
`monotonic` permits intentionally skipped frames in a latest-value transport
but still rejects counter regression and uses `evt_total` to detect hidden
events. `timestamp_origin=first_frame` resolves static/pulse timestamps as
offsets from the first captured frame.

For `physical_output_authorization_required=true`, the host analyzer applies a
fixed Gate 1 semantic contract beyond JSON shape: `liquid_small_box`, the
production environment and `as-built AtomS3 custom board` profile, the
`active`/S1-ON or `s1_off_control`/S1-OFF pairing, first-frame timestamps,
monotonic counters, exactly one 500 ms sequence check, exactly one canonical
measurement with unmodified template thresholds, and valid IMU in every active
frame. Static acceptance extends `evt_total` integrity through the first
canonical anchor at or after the assessment end. The plan also carries typed
before/after USB producer-status snapshots with the fixed 100 ms period; the transmitted-frame delta must
equal the canonical frame count while
pending bytes are zero and every drop, interruption, unterminated-partial, and
serialization-error counter remains unchanged. These operator-transcribed
snapshots are preserved and hashed as part of the byte-exact run plan.
The total dropped count must equal the sum of backpressure and console-interrupt
drops in each snapshot.
Presence of a Gate 1 variant/production marker also makes an explicit true
physical-authorization requirement mandatory; changing that flag to false does
not turn a hardware claim into a generic dry run.

### Binary format later
If throughput becomes a problem, define a binary chunked format after the control-plane schemas stabilize.
