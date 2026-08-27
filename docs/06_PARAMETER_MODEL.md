# 06 Parameter Model

This document defines the parameter taxonomy for the unified material-haptics framework.

## 1. Principles

1. Parameters should be **human-meaningful** first.
2. Internal coefficients may be derived from the human-level parameters.
3. Material families should share the same parameter categories whenever possible.
4. A field in the model is not automatically writable through `set_param`.
5. Preset JSON is a partial overlay, not necessarily a complete snapshot.

The repository therefore has three related but distinct surfaces: the complete
C++ parameter model, the subset understood by preset files, and the subset
writable at runtime. This document names the model first and calls out runtime
controls separately.

## 2. Parameter groups

## A. Container geometry
- `container.span_x_m`
- `container.span_y_m`
- `container.span_z_m`
- `container.shell_mass_kg`
- `container.content_mass_full_kg`
- `container.shell_cg_x_m`
- `container.shell_cg_y_m`
- `container.fill`
- `container.headspace`

## B. Material family
- `container.family`
- `container.viscosity`
- `container.particle_count`
- `container.particle_hardness`
- `container.enable_roof_contact`

`container.particle_count` is currently a normalized population/density proxy
in the `0..1` range, not a literal integer particle count. For example, the
single-marble preset uses a very small nonzero proxy value to select sparse
behavior.

## C. Mass motion layer
- `mass.control_rate_hz`
- `mass.natural_freq_x_hz`
- `mass.natural_freq_y_hz`
- `mass.damping_ratio_x`
- `mass.damping_ratio_y`
- `mass.energy_decay_s`
- `mass.accel_to_energy_gain`
- `mass.gyro_to_energy_gain`
- `mass.rebound`

## D. Event layer
- `event.wall_threshold`
- `event.wall_decay_span_m`
- `event.roll_rate_hz`
- `event.impact_rate_hz`
- `event.droplet_rate_hz`
- `event.splash_threshold`
- `event.roof_slap_threshold`
- `event.scrape_threshold`

`event.wall_threshold` softly raises or lowers how deep into the active wall zone a contact must progress before wall-hit style scheduling becomes likely.
`event.splash_threshold` acts as a liquid / hybrid burst-activity reference so weak motion is suppressed without muting the default presets outright.

## E. Texture layer
- `texture.hard_ping_low_ms`
- `texture.hard_ping_high_ms`
- `texture.wet_burst_ms`
- `texture.dry_rattle_ms`
- `texture.scrape_noise_ms`
- `texture.flow_ripple_soa_ms`
- `texture.default_high_bias`

`texture.hard_ping_high_ms` now controls the shorter high-band tail independently from the low-band ping body.
`texture.flow_ripple_soa_ms` sets the lead/trail neighbor delay used by directional apparent-motion rendering.

## F. Resonance layer
- `resonance.low_carrier_hz[4]`
- `resonance.high_carrier_hz[4]`
- `resonance.low_gain[4]`
- `resonance.high_gain[4]`
- `resonance.master_gain`

## G. Spatial renderer
- `spatial.wall_softmax_delta`
- `spatial.neighbor_bleed`
- `spatial.opposite_bleed`

## H. Audio backend
- `audio.sample_rate_hz`
- `audio.dma_buf_len`
- `audio.dma_buf_count`
- `audio.transport`
- `audio.output_layout`
- `audio.demo_compat_mode`
- `audio.runtime_enable`
- `audio.keep_driver_installed_when_muted`
- `audio.output_gain`
- `audio.output_peak_limit`
- `audio.channel_test_enable`
- `audio.channel_test_wall`
- `audio.channel_test_level`

`features.enable_audio_output` remains the subsystem gate.
`audio.runtime_enable` is the live runtime arm/disarm state used by the current button UI.
Both must be true for live signal output. A hardware profile may keep the
driver installed while they are false so that the DMA stream carries digital
zeros.

`audio.transport` supports:

- `dual_i2s`
- `tdm8_slot`

The TDM transport emits eight 16-bit PCM-short slots. Slots 0 through 3 carry
Front, Back, Top, and Bottom; slots 4 through 7 are always zero.

`audio.transport`, `audio.demo_compat_mode`, and `audio.output_layout` may be
changed only while `audio.runtime_enable=false`. Demo compatibility is a
dual-I2S-only diagnostic and a request to enable it while the selected
transport is `tdm8_slot` is rejected. Configuration failures restore the
previous audio parameters.

`audio.output_layout` currently supports:
- `quad_wall_4ch`
- `front_back_2ch`

In `front_back_2ch`, the internal renderer remains 4-wall and the backend collapses `Top/Bottom`
energy into a common-mode contribution on the `Front/Back` pair.

`audio.demo_compat_mode=true` forces a bus-A-only diagnostic profile intended to mimic the known
single-amp demo more closely:
- mono output on `I2S_NUM_0`
- `48 kHz`
- demo-oriented DMA sizing
- `front_back_2ch` layout

`audio.output_gain` is a final backend gain applied after the low/high/noise carrier mix.
Keep the portable default at `1.0`; raise it only for known bench setups that need a hotter drive.

`audio.output_peak_limit` clamps the final normalized PCM sample after the
low/high/noise mix, `audio.output_gain`, and, when enabled,
`resonance.master_gain`. It is additionally bounded by
`HAPTICS_AUDIO_HARD_PEAK_LIMIT_PERMILLE`; telemetry and `audio status` expose
the effective smaller value. For the as-built AtomS3 profile:

- `audio.transport = tdm8_slot`
- `audio.sample_rate_hz = 48000`
- `audio.dma_buf_len = 240`
- `audio.dma_buf_count = 12`
- `audio.keep_driver_installed_when_muted = true`
- `audio.runtime_enable = false` at boot
- requested/effective initial limit = `0.08`
- compile-time hard limit = `0.15`

The 8% setting is the first production-integration level. The 15% ceiling is
derived from short, unloaded burst tests and is not a mounted or
continuous-drive rating.

`audio.output_silenced` is a read-only telemetry field, not a parameter. It is
true when software has asserted zero output (or no driver is installed).
Top-level `safety.audio_zero_asserted` mirrors that assertion for acceptance
monitoring.

## I. Recorder / preset store
- `preset_name`
- `preset_source`
- `preset_path`
- `recorder.record_dir`
- `recorder.flush_interval_frames`

`recorder.flush_interval_frames` controls how many NDJSON frames are buffered before an explicit flush while the recording file stays open.

## J. Tilt-plane channel
- `tilt.thumb_servo_id`
- `tilt.index_servo_id`
- `tilt.bus_baud`
- `tilt.thumb_home_deg`
- `tilt.index_home_deg`
- `tilt.min_angle_deg`
- `tilt.max_angle_deg`
- `tilt.max_tilt_deg`
- `tilt.enable_pseudoforce`
- `tilt.w_eff_m`
- `tilt.Ft_nom_thumb_N`
- `tilt.Ft_nom_index_N`
- `tilt.k_cm`
- `tilt.k_tau`
- `tilt.k_phi`
- `tilt.sign_thumb`
- `tilt.sign_index`
- `tilt.max_delta_cm_deg`
- `tilt.max_delta_df_deg`
- `tilt.max_delta_total_deg`
- `tilt.max_total_cmd_deg`
- `tilt.content_cg_span_fraction`
- `tilt.g_qs_cutoff_hz`
- `tilt.a_dyn_cutoff_hz`
- `tilt.content_cg_cutoff_hz`
- `tilt.command_cutoff_hz`
- `tilt.command_deadband_deg`
- `tilt.pseudoforce_slew_deg_s`
- `tilt.max_velocity_deg_s`
- `tilt.max_current_ma`
- `tilt.current_based_position_mode`

The current tilt path is split into:
- base tilt from the existing container-attitude renderer
- additive pseudo-force correction from the shell + content low-frequency torque model

`container.shell_mass_kg`, `container.content_mass_full_kg`, `container.shell_cg_x_m`, and `container.shell_cg_y_m`
define the low-frequency physical model inputs used by the pseudo-force branch.

These parameters are implemented in the shared model and retained StickS3
servo backend. The as-built AtomS3 production environment compiles the servo
backend out because that board uses separate TX/RX pins and automatic
half-duplex at 57,600 bps rather than the legacy DATA+DIR interface. Dedicated
probes have moved IDs 1 and 2 unloaded, but the production adapter and its
read-back telemetry are not implemented.

The generic model default `tilt.bus_baud=1,000,000` belongs to the legacy path;
it must not be mistaken for the verified AtomS3 board setting of `57,600`.

## K. Runtime calibration
- `calibration.low_start_hz`
- `calibration.low_stop_hz`
- `calibration.low_step_hz`
- `calibration.high_start_hz`
- `calibration.high_stop_hz`
- `calibration.high_step_hz`
- `calibration.settle_ms`
- `calibration.measure_ms`
- `calibration.drive_level`
- `calibration.accel_response_weight`
- `calibration.gyro_response_weight`

The current implementation uses the IMU as a coarse on-device vibration proxy during sweep and stores the selected carriers into NVS.
This is intended for additive runtime identification and will likely be refined later.

## L. Interface/system
- `iface.wifi_mode_ap`
- `iface.wifi_ssid`
- `iface.wifi_password`
- `iface.http_port`
- `iface.websocket_port`
- `iface.telemetry_period_ms`
- `iface.reserve_websocket_json`
- `iface.reserve_ble_gatt`
- `iface.reserve_udp_osc`
- `features.*`
- `features.enable_debug_display`
- `features.enable_pipeline_debug_telemetry`
- `features.enable_physical_master_gain`
- `features.enable_attack_preserving_texture`
- `features.enable_single_shot_spatial_delay`
- `features.enable_imu_stale_safe_stop`
- `features.allow_remote_tilt_arm`

`iface.wifi_mode_ap=true` starts the current SoftAP transport.
`iface.wifi_mode_ap=false` starts the same HTTP/WebSocket monitoring stack in station mode and attempts to join the configured SSID.
`iface.http_port` is the human-facing browser status page port.
`iface.websocket_port` is the machine-facing JSON control / telemetry port.
`features.enable_debug_display` is now probe-only. It is retained for isolated low-level panel experiments, not as part of the main firmware contract.
`features.enable_pipeline_debug_telemetry=false` by default. When enabled at runtime, remote telemetry and recorder NDJSON include `pipeline_debug` counts for event, texture, and resonance frames plus per-frame booleans showing whether mass, event, texture, resonance, and spatial stages were active.

The compatibility-sensitive refinement/safety flags default false in generic
presets. The as-built AtomS3 profile explicitly enables physical master gain,
attack-preserving texture decay, single-shot spatial delay, and the IMU stale
safe-stop. This opt-in keeps older environments stable while the production
profile uses the refined pipeline behavior.

When `features.enable_imu_stale_safe_stop=true`, more than 300 ms without a
valid finite IMU sample resets the Mass, Event, Texture, Resonance, Spatial,
and Tilt model states to neutral, submits digital zero to TDM, and disarms an
enabled servo interface. The always-present read-only telemetry fields are
`safety.imu_stale_safe_stop`, `safety.audio_zero_asserted`, and
`safety.tilt_disarmed`. Optional
`pipeline_debug.imu_stale_safe_stop` duplicates the first value for detailed
debugging but is not required for safety observation.

`features.allow_remote_tilt_arm` defaults false. Generic `set_param` may turn
the tilt feature off but may never turn it on; an explicit tilt-arm command is
required, and remote arming additionally requires this flag plus Live or
Record run mode.

Selected controls in the current `set_param` runtime surface include:
- container spans: `container.span_x_m`, `container.span_y_m`, `container.span_z_m`
- mass dynamics: `mass.natural_freq_x_hz`, `mass.natural_freq_y_hz`, `mass.damping_ratio_x`, `mass.damping_ratio_y`, `mass.energy_decay_s`, `mass.accel_to_energy_gain`, `mass.gyro_to_energy_gain`, `mass.rebound`
- texture atoms: `texture.hard_ping_low_ms`, `texture.hard_ping_high_ms`, `texture.wet_burst_ms`, `texture.dry_rattle_ms`, `texture.scrape_noise_ms`, `texture.flow_ripple_soa_ms`, `texture.default_high_bias`
- spatial/resonance: `spatial.neighbor_bleed`, `spatial.opposite_bleed`, `resonance.master_gain`
- audio: `audio.runtime_enable`, `audio.output_gain`,
  `audio.output_peak_limit`, `audio.transport`, `audio.demo_compat_mode`, and
  `audio.output_layout`
- compatibility refinements: `features.enable_physical_master_gain`,
  `features.enable_attack_preserving_texture`, and
  `features.enable_single_shot_spatial_delay`
- integration safety: `features.enable_imu_stale_safe_stop`
- calibration sweep: `calibration.low_start_hz`, `calibration.low_stop_hz`, `calibration.low_step_hz`, `calibration.high_start_hz`, `calibration.high_stop_hz`, `calibration.high_step_hz`, `calibration.settle_ms`, `calibration.measure_ms`, `calibration.drive_level`
- interface/recorder cadence: `iface.telemetry_period_ms`, `recorder.flush_interval_frames`

For short client labels, the firmware also accepts aliases without units for mass natural frequency, texture durations, and calibration frequency bounds/steps, for example `mass.natural_freq_x`, `texture.hard_ping_low`, and `calibration.low_start`.

## 2.1 Safe Idle runtime reset

`idle`, `stop`, and remote `set_run_mode=idle` are not ordinary parameter
updates. They atomically end calibration/record/replay, set
`features.enable_audio_output=false`, `audio.runtime_enable=false`, and
`features.enable_tilt_plane=false`, clear the channel-test fields, reset all
dynamic layer state, submit zero, and enter Idle. AtomS3 BtnA hold uses the same
transition. A later `live` leaves audio disarmed; `audio on` is required again.

## 3. Material-family interpretation

### Liquid
- medium damping
- droplet clusters active
- wall hits moderate
- roof slap gated by `container.enable_roof_contact`
- scrape minimal

### Granular
- impact clusters active
- roll trains active
- scrape moderate
- droplet clusters off
- current baseline ties `roll_train` and `impact_cluster` density to container span and rolling activity

### Hybrid
- both impact clusters and droplet clusters active
- sparse rigid impacts ride on top of the liquid burst scheduler
- useful for ice water, stones in liquid, etc.

### Detented/custom
- scrape plus discrete detent emphasis
- current baseline emits stateful short detent-like ticks with intermittent scrape rather than a continuous per-frame scrape placeholder
- those ticks now render through a dedicated low-mid `detent_click` atom instead of sharing the generic `hard_ping` voicing

### Single marble demo
- `granular_single_marble_box` models a roughly `5 cm x 5 cm x 5 cm` box with one hard marble
- use very low `particle_count`, high `particle_hardness`, high headspace, and slower cluster/roll rates so the result stays sparse and discrete
- the runtime now interprets that sparse hard-particle corner of parameter space with a dedicated short `knock_ping` rendering so impacts read as `kotsu`-like single contacts rather than soft rattly groups

## 4. Preset files

See the `presets/` folder for starter JSON files.
They are intended as versioned experimental presets, not final public APIs.
Current starter set includes liquid small/dense/half-tube, hybrid ice-water, and granular coin/sand/bead.

There are currently two preset sources with different roles:

- built-in C++ presets are what the normal firmware can always load
- repository-root `presets/*.json` files are consumed by the visual demo and
  can be loaded by firmware only after they are explicitly provisioned to
  LittleFS under `/presets`

The repository does not currently provide a `data/` image or an automatic
`uploadfs` workflow for those root JSON files. The two representations are not
guaranteed identical: for example, `liquid_small_box.json` currently specifies
`event.wall_threshold=0.72` and `event.droplet_rate_hz=40`, while the built-in
firmware preset uses `0.62` and `24`. A test record must therefore include
`preset_source`, `preset_path` where relevant, and the resolved parameter
snapshot; the preset name alone is not reproducible.

Preset loading intentionally preserves hardware/session state such as pins,
feature gates, audio transport/arm state, interface/recorder settings, and
calibrated carriers. Those preserved values must also be recorded when
comparing runs.
