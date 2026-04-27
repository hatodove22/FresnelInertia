# 07 Test and Validation Plan

## 1. Build validation

- PlatformIO build succeeds for the scaffold baseline.
- PlatformIO build succeeds for `m5stack-sticks3-audio` with `HAPTICS_ENABLE_AUDIO_BACKEND=1`.
- PlatformIO build succeeds for `m5stack-sticks3-remote`.
- PlatformIO build succeeds for `m5stack-sticks3-tilt`.
- when the TDM backend is added, PlatformIO build succeeds for the TDM-enabled audio path without regressing the current dual-I2S path
- No feature should require hardware-specific code to compile when disabled.

## 2. Runtime validation (current scaffold)

- StickS3 boots and initializes.
- IMU polling works without crashing.
- Preset cycling works via `BtnA` click.
- verify the `BtnA` demo cycle includes `granular_single_marble_box` between the default granular and hybrid demos
- Verbose telemetry toggle works via `BtnB` click.
- Audio runtime enable toggle works via `BtnB` hold.
- Audio test-wall cycling works via `BtnA` hold.
- Serial telemetry prints latent state, actuator-frame summaries, and recorder/remote status.
- Console preset listing/loading works.
- preset cycling and `preset load <name>` preserve runtime feature flags, pin assignments, audio layout/runtime state, tilt/interface/recorder settings, and calibrated resonance carriers.
- Recorder start/stop and replay start/stop commands work without crashing.
- Recorder batching honors `recorder.flush_interval_frames` without losing tail frames on stop.
- if LittleFS mount fails at boot, built-in preset listing/loading should still work and should not retry a crashing remount on every console command

## 2.1 Minimal audio smoke test

- build and flash `m5stack-sticks3-audio-smoke`
- confirm the boot banner prints `Audio smoke test started.`
- confirm the StickS3 screen shows `AUDIO SMOKE` even if USB CDC is flaky after flashing
- the smoke image should force `board_M5StickS3` fallback and skip IMU / RTC / mic startup so display/audio bring-up stays isolated
- verify `status` reports pins `(7,5,43)`, `enabled=1`, and the default `burst` mode when serial is available
- verify the default `burst` pattern is easier to feel than a continuous tone on the single external amp
- verify `mode tone`, `tone 180`, and `amp 0.45` can still produce a stable continuous output for comparison
- verify `sweep on` steps through the resonance-search band without crashing
- verify `BtnA` click steps tone, `BtnA` hold toggles sweep, and `BtnB` click toggles output
- if the official `espressif32@6.12.0` build stays silent while the old demo worked, repeat the same test with `m5stack-sticks3-audio-smoke-pioarduino` to isolate core/platform differences
- only after the smoke test is stable, move back to `m5stack-sticks3-audio` for full pipeline debugging

## 2.2 Minimal transducer probe

- build and flash `m5stack-sticks3-transducer-probe`
- confirm the boot banner prints `Transducer probe started.`
- verify `status` reports pins `(7,5,43)` and a conservative burst pattern
- verify the default `180 Hz`, `60 ms` burst, `220 ms` period pattern is easier to feel than a continuous tone
- verify `freq 120`, `freq 180`, `freq 240`, and `freq 320` can be stepped without crashing
- verify `sweep on` slowly scans the carrier while keeping the burst envelope intact
- use this probe before blaming the full haptic pipeline when the amp path is still uncertain

## 2.3 Raw I2S probe

- build and flash `m5stack-sticks3-raw-i2s-probe`
- confirm the StickS3 screen shows `RAW I2S PROBE`
- verify the serial banner prints `Raw I2S probe started.`
- verify the output uses `GPIO 7/5/43` and writes directly through `driver/i2s.h`
- verify left and right slots carry the same waveform so a mono MAX98357A cannot miss the active side
- verify `BtnB` hold or `pins legacy` switches to the StickS3 default speaker route `17/15/14` for direct A/B comparison against the old demo
- verify `mode tone`, `amp 1.0`, and `tone 180` produce the strongest simple continuous test
- only after the raw I2S probe is stable, move back up to `M5.Speaker` and then the full haptics pipeline

## 2.4 Main firmware observability policy

- `m5stack-sticks3-audio` no longer treats the StickS3 panel as a supported runtime monitor
- verify the main firmware can be operated entirely from USB serial plus the SoftAP browser page
- keep any remaining display validation isolated to the probe envs below

## 2.5 Display probe

- flash `m5stack-sticks3-display-probe`
- verify the screen steps through `M5.begin ok`, `IMU begin`, `EXT_5V on`, and `pipeline begin`
- if the display disappears at a specific stage, treat the previous stage as the last known-good point for the main firmware

## 2.6 Deterministic main-firmware probe ladder

- flash `m5stack-sticks3-main-boot-probe`
- verify the screen stays alive for at least `10 s` and shows `M5.begin`, `IMU`, and `EXT_5V` success with a monotonically increasing heartbeat
- flash `m5stack-sticks3-main-pipeline-probe`
- verify the screen still stays alive after `g_pipeline.begin(...)` and shows a frozen status page with heartbeat
- flash `m5stack-sticks3-main-loop-probe`
- verify the probe advances through `static -> redraw -> update -> tick`
- verify the screen stays alive through the `redraw` and `update` phases before `g_pipeline.tick()` is enabled
- verify the heartbeat continues incrementing and `BtnA` can still cycle presets without blanking the display
- flash `m5stack-sticks3-main-audio-probe`
- verify the probe shows setup stages and then an `idle` screen without starting audio automatically
- verify `BtnA` cycles deterministic `liquid -> granular -> hybrid` synthetic stimulus modes
- verify `BtnB` toggles runtime audio on/off and is the first point where synthetic audio should start
- flash `m5stack-sticks3-main-delta-probe`
- verify it stays visible while phasing through `tick-only -> main-buttons -> poll-console -> verbose-serial`
- if it blanks at a specific phase, treat the newly added main-loop condition for that phase as the prime suspect

## 2.7 Main monitoring workflow

- for the normal `m5stack-sticks3-audio` firmware, treat USB serial and the SoftAP browser page as the only supported monitoring surfaces
- do not use the StickS3 display as part of the main validation workflow
- after boot, confirm serial startup lines and open the HTTP status page from the printed AP URL or `http://192.168.4.1/`
- use serial `status`, `audio status`, `cal status`, `record status`, `replay status`, `tilt status`, and `remote status` for snapshots
- rely on the browser page for continuous inspection of preset, run mode, event, mass energy/position, actuator summary, audio, calibration, recorder, remote, and tilt state
- verify `BtnA` preset cycling does not restart the AP or drop the browser page when WiFi settings are unchanged
- verify at least one synthetic mode is clearly perceptible without any live IMU motion
- only after all four probe rungs are stable should changes be re-applied to `m5stack-sticks3-audio`

## 3. Audio backend validation

### Phase A: bus-level tests
- build and flash `m5stack-sticks3-audio`
- note that `m5stack-sticks3-audio` now boots in a single-amp bench profile: `front_back_2ch` plus demo-compat mono `48 kHz`
- note that the same env also boots with a hotter `audio.output_gain` for the known single-MAX98357A bench
- if display instability is still being investigated, keep it isolated to the probe envs
- do not block main audio validation on the display path
- verify stereo I2S x2 clocks on a scope or logic analyzer
- verify Front/Back pair and Top/Bottom pair channel routing
- switch `audio.output_layout` to `front_back_2ch` and verify only the Front/Back bus is required for output
- in `front_back_2ch`, verify `BtnA` hold cycles `OFF -> Front -> Back -> OFF`
- in `quad_wall_4ch`, verify `BtnA` hold cycles `OFF -> Front -> Back -> Top -> Bottom -> OFF`
- verify the equivalent serial console controls `audio on`, `audio off`, and `audio test ...` work without relying on button timing
- verify `audio gain <value>` changes live output level and `audio status` reports the same gain value
- verify `audio diag on` forces the bus-A-only mono `48 kHz` compatibility profile and is useful for comparison against the known single-amp demo
- verify `BtnB` hold silences and re-enables the backend without unstable bursts
- verify silence floor and no unstable bursts

### Phase A2: planned TDM backend validation
- keep the current dual-I2S backend available while bringing up TDM
- verify the planned first TDM profile uses a single ESP32-S3 TX port with `48 kHz`, `16-bit`, `4 slots`, and `PCM short`
- verify slot routing `slot0=Front`, `slot1=Back`, `slot2=Top`, `slot3=Bottom`
- verify the same `DriveFrame4` stimulus can be rendered through either dual-I2S or TDM without changing the upstream pipeline
- verify `front_back_2ch` remains available as a fallback policy while the physical TDM transport is active
- verify `audio.demo_compat_mode` still forces the known single-amp mono bring-up path instead of reusing the TDM route
- on MAX98357A benches, verify each amplifier responds only to its strapped TDM slot
- verify the TDM path can be disabled or bypassed without breaking legacy probes and current bench workflows

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
- raising `event.splash_threshold` should suppress weak liquid / hybrid droplet activity before strong slosh motion returns it
- `roof_slap` should only appear when `container.enable_roof_contact` is enabled
- detented presets should produce intermittent discrete ticks plus lighter scrape rather than continuous scrape spam
- detented presets should remain perceptible on the current bench through a short low-mid click body, not only through high-frequency bite
- `granular_single_marble_box` should feel sparser than `granular_bead_box`, with more isolated wall pings and shorter roll trains
- very sparse hard-particle presets should expose a distinct short rigid `knock` quality on wall collisions instead of collapsing into the same `dry_rattle` feel as multi-particle clusters

### Spatial rendering
- local wall events should be distinguishable
- adjacent-wall motion should be perceivable with SOA tuning
- flow/ripple events should step across neighbors rather than collapsing into static bleed
- Front / Back events should spread only toward Top / Bottom, and Top / Bottom events should spread only toward Front / Back

## 5. Servo path validation

- verify safe home position on both XL330 units
- verify current-limited motion before full position control tests
- verify emergency stop behavior
- verify `tilt off` drops torque and does not leave either XL330 energized
- verify asymmetric thumb/index home angles still clamp each servo to its own safe range
- verify `tilt.enable_pseudoforce=false` preserves the base tilt path with zero pseudo-force delta
- verify empty-container presets still generate low-frequency torque from shell CoG only
- verify filled presets generate additional differential tilt from content CoG migration
- verify vertical impulses primarily appear as common-mode tilt on both fingers
- verify horizontal weight shifting primarily appears as thumb/index differential tilt
- verify ordinary operation usually stays within:
  - common-mode correction <= about `1.5 deg`
  - differential correction <= about `3 deg`
- verify hard limits remain enforced:
  - common-mode correction <= `2.5 deg`
  - differential correction <= `5 deg`
  - total pseudo-force correction <= `6 deg`
  - final command <= `10 deg` unless intentionally retuned

## 5.1 Remote transport robustness

- verify a partial or malformed WebSocket frame does not stall IMU polling or haptics updates
- verify both `iface.wifi_mode_ap=true` and `iface.wifi_mode_ap=false` bring up the remote transport as expected

## 5.2 WebXR / smartphone visual demo

- from `webxr/`, verify `npm.cmd run typecheck` passes
- from `webxr/`, verify `npm.cmd run build` passes
- verify the phone mode opens in a mobile browser without requiring WebXR
- verify touch drag changes the virtual container tilt and the rendered content response
- verify optional DeviceOrientation control only starts after explicit user permission
- verify the preset selector changes liquid / granular / hybrid visual behavior using `presets/*.json`
- verify box presets render as hand-scale 7 cm cubes in WebXR without changing the firmware preset files
- verify the `liquid_cylinder_bottle` selector entry renders a cylindrical bottle with a circular liquid body/surface
- verify the `liquid_plastic_tumbler` selector entry renders a tapered plastic cup with an open rim and tapered liquid body
- verify the Quest 3/3S path starts from an HTTPS URL in Quest Browser
- verify the MR path requests hand tracking as optional WebXR support and pinch/grab can attach the container to a hand pose
- verify the spatial experiment panel is visible in MR and does not depend on the phone DOM HUD
- verify controller ray selection can activate a preset row and move the panel sliders
- verify index fingertip direct touch only activates the panel when the fingertip is near the panel face
- verify panel slider changes visibly affect content motion boost / damping preview without changing repository presets
- verify the IWSDK/IWER development path can open the app on desktop without a headset
- verify `npm.cmd run quest` prints a Cloudflare Quick Tunnel URL and serves the production preview without Vite HMR errors
- verify liquid and hybrid content remains visibly contained inside the transparent shell during strong tilt
- verify the visual client does not require firmware, schema, or transport changes in v1

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
- runtime-selectable `quad_wall_4ch` / `front_back_2ch` output layout is now in place

Planned next audio-backend milestone:
- add a single-port TDM backend behind safe defaults
- keep dual-I2S and mono demo-compat as supported fallback paths during bring-up
- bench-verify four-slot routing on a real TDM amplifier stack before changing any default transport

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

Current status after the directional-flow / detented refinement:
- `event.wall_threshold`, `event.splash_threshold`, and `texture.hard_ping_high_ms` now affect the runtime haptic path rather than remaining dormant parameters
- `flow_ripple` now preserves motion direction through texture/resonance/spatial routing and uses physical wall adjacency
- detented presets now emit discrete detent-like ticks plus intermittent scrape instead of a per-frame scrape placeholder

Current status after the detent-click / single-marble refinement:
- detented `WallHit` events now render through a dedicated `detent_click` atom with stronger low-carrier emphasis on the current bench
- the built-in preset set now includes `granular_single_marble_box` for a `5 cm` box with one marble-like particle

Current status after the recorder/remote/servo milestone:
- NDJSON recording and IMU replay are available through the console path
- SoftAP + WebSocket JSON control/telemetry is available in `m5stack-sticks3-remote`
- a compile-gated raw XL330 control path is available in `m5stack-sticks3-tilt`

Current status after the tilt pseudo-force revision:
- thumb/index commands now keep the existing base tilt and add a filtered low-frequency pseudo-force correction
- telemetry now exposes base tilt, pseudo-force delta, apparent mass, CoG, common force, and differential torque
- bench validation of sign calibration, perceptual scaling, and current-based position behavior remains future work

Current status after the shaker-family event milestone:
- granular `roll_train` is now emitted as a rate-driven event train tied to wall contact and tangential motion
- granular `impact_cluster` density now scales with container span, particle properties, and rolling activity
- granular `scrape` now uses intermittent cooldown-based scheduling instead of a per-tick placeholder
