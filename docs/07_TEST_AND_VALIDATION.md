# 07 Test and Validation Plan

## 1. Build validation

- PlatformIO build succeeds for the scaffold baseline.
- PlatformIO build succeeds for `m5stack-sticks3-audio` with `HAPTICS_ENABLE_AUDIO_BACKEND=1`.
- PlatformIO build succeeds for `m5stack-sticks3-remote`.
- PlatformIO build succeeds for `m5stack-sticks3-tilt`.
- No feature should require hardware-specific code to compile when disabled.

## 2. Runtime validation (current scaffold)

- StickS3 boots and initializes.
- IMU polling works without crashing.
- Preset cycling works via `BtnA` click.
- Verbose telemetry toggle works via `BtnB` click.
- Audio runtime enable toggle works via `BtnB` hold.
- Audio test-wall cycling works via `BtnA` hold.
- Serial telemetry prints latent state, actuator-frame summaries, and recorder/remote status.
- Console preset listing/loading works.
- Recorder start/stop and replay start/stop commands work without crashing.
- Recorder batching honors `recorder.flush_interval_frames` without losing tail frames on stop.

## 3. Audio backend validation

### Phase A: bus-level tests
- build and flash `m5stack-sticks3-audio`
- verify stereo I2S x2 clocks on a scope or logic analyzer
- verify Front/Back pair and Top/Bottom pair channel routing
- verify `BtnA` hold cycles `OFF -> Front -> Back -> Top -> Bottom -> OFF`
- verify `BtnB` hold silences and re-enables the backend without unstable bursts
- verify silence floor and no unstable bursts

### Phase B: actuator tests
- use channel test mode to excite each wall individually
- run `cal start` in the serial console while using `m5stack-sticks3-audio`
- verify low/high resonance estimates are stored back into `resonance.low_carrier_hz[4]` and `resonance.high_carrier_hz[4]`
- verify telemetry reports calibration wall, band, candidate frequency, and progress
- verify channel independence

## 4. Algorithm validation

### Mass motion layer
- confirm smaller container sizes reduce travel time and increase wall-contact opportunities
- compare liquid vs granular vs hybrid latent response

### Event layer
- `wall_hit` should localize strongly
- `wall_hit` should trigger once per approach rather than every control tick
- smaller containers should show shorter wall-hit cooldown and denser collision opportunities
- `roll_train` should appear as repeated pulses along the contacted wall rather than a constant per-frame event
- `impact_cluster` should feel denser than `wall_hit`
- `impact_cluster` density should rise in shorter spans and during sustained rolling
- `scrape` should appear intermittently under strong tangential wall contact rather than continuously
- `droplet_cluster` should not collapse into a long low-frequency hum
- `roof_slap` should only appear when `container.enable_roof_contact` is enabled

### Spatial rendering
- local wall events should be distinguishable
- adjacent-wall motion should be perceivable with SOA tuning
- flow/ripple events should step across neighbors rather than collapsing into static bleed

## 5. Servo path validation

- verify safe home position on both XL330 units
- verify current-limited motion before full position control tests
- verify emergency stop behavior
- verify `tilt off` drops torque and does not leave either XL330 energized
- verify asymmetric thumb/index home angles still clamp each servo to its own safe range

## 5.1 Remote transport robustness

- verify a partial or malformed WebSocket frame does not stall IMU polling or haptics updates
- verify both `iface.wifi_mode_ap=true` and `iface.wifi_mode_ap=false` bring up the remote transport as expected

## 6. Recorder / replay validation

- recorded sessions must replay latent state evolution deterministically enough for debugging
- event counts and actuator summaries should match within expected tolerance
- stop recording before `recorder.flush_interval_frames` is reached and verify the tail frames are still persisted

## 7. Acceptance criteria for first full haptic milestone

The first meaningful milestone is reached when:
- four-channel sweep and per-channel resonance storage work,
- `wall_hit` is rendered spatially,
- at least one granular preset and one liquid preset produce clearly different 4-channel output statistics,
- the scaffold remains buildable and documented.

Current status after the audio-backend milestone:
- dual-stereo I2S x2 backend compilation is in place
- runtime enable and single-wall test mode are in place

Current status after the calibration milestone:
- runtime sweep/store is in place using an IMU-proxy ratio metric
- carrier estimates are restored from and stored to NVS
- stronger identification remains future work

Current status after the geometry-aware mass/event milestone:
- mass motion uses container span, fill/headspace, and material family to shape normalized dynamics
- `wall_hit` uses wall-zone entry plus wall-direction velocity and size-dependent cooldown

Current status after the liquid/hybrid/render milestone:
- liquid and hybrid families now use stateful burst scheduling rather than per-tick placeholders
- texture rendering now uses stateful atom voices
- spatial rendering now includes SOA-aware flow distribution

Current status after the recorder/remote/servo milestone:
- NDJSON recording and IMU replay are available through the console path
- SoftAP + WebSocket JSON control/telemetry is available in `m5stack-sticks3-remote`
- a compile-gated raw XL330 control path is available in `m5stack-sticks3-tilt`

Current status after the shaker-family event milestone:
- granular `roll_train` is now emitted as a rate-driven event train tied to wall contact and tangential motion
- granular `impact_cluster` density now scales with container span, particle properties, and rolling activity
- granular `scrape` now uses intermittent cooldown-based scheduling instead of a per-tick placeholder
