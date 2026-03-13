# 06 Parameter Model

This document defines the parameter taxonomy for the unified material-haptics framework.

## 1. Principles

1. Parameters should be **human-meaningful** first.
2. Internal coefficients may be derived from the human-level parameters.
3. Material families should share the same parameter categories whenever possible.

## 2. Parameter groups

## A. Container geometry
- `container.span_x_m`
- `container.span_y_m`
- `container.span_z_m`
- `container.fill`
- `container.headspace`

## B. Material family
- `container.family`
- `container.viscosity`
- `container.particle_count`
- `container.particle_hardness`
- `container.enable_roof_contact`

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

## E. Texture layer
- `texture.hard_ping_low_ms`
- `texture.hard_ping_high_ms`
- `texture.wet_burst_ms`
- `texture.dry_rattle_ms`
- `texture.scrape_noise_ms`
- `texture.flow_ripple_soa_ms`
- `texture.default_high_bias`

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
- `audio.runtime_enable`
- `audio.channel_test_enable`
- `audio.channel_test_wall`
- `audio.channel_test_level`

`system.feature_flags.enable_audio_output` remains the subsystem gate.
`audio.runtime_enable` is the live runtime arm/disarm state used by the current button UI.

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
- `tilt.max_velocity_deg_s`
- `tilt.max_current_ma`
- `tilt.current_based_position_mode`

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
- `iface.telemetry_period_ms`
- `iface.reserve_websocket_json`
- `iface.reserve_ble_gatt`
- `iface.reserve_udp_osc`
- `system.feature_flags.*`

`iface.wifi_mode_ap=true` starts the current SoftAP transport.
`iface.wifi_mode_ap=false` starts the same WebSocket server in station mode and attempts to join the configured SSID.

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
- scrape / detent emphasis

## 4. Preset files

See the `presets/` folder for starter JSON files.
They are intended as versioned experimental presets, not final public APIs.
Current starter set includes liquid small/dense/half-tube, hybrid ice-water, and granular coin/sand/bead.
