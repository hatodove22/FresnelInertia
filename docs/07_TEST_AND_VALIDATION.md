# 07 Test and Validation Plan

## 1. No-hardware verification

These checks are compile-only / host-only. They do not prove actuator routing,
IMU behavior, WiFi range, flash persistence, or perceptual quality.

### Schema samples

- run `node test/schema/validate_schemas.mjs` from the repository root
- verify `test/schema/control_messages.valid.jsonl` still covers every
  `type` enum in `schemas/control_message.schema.json`
- verify `test/schema/telemetry_frames.valid.jsonl` still matches
  `schemas/telemetry_frame.schema.json`
- require every telemetry sample to include `audio.output_silenced` and the
  top-level `safety` object even when `pipeline_debug` is omitted
- note that `test/schema/validate_schemas.mjs` is intentionally small and only
  covers the JSON Schema features currently used by the repo schemas:
  `type`, `required`, `enum`, `properties`, `items`, `additionalProperties`,
  `minimum`, `minItems`, and `maxItems`

### WebXR typecheck / build

- from `webxr/`, run `npm.cmd run typecheck`
- from `webxr/`, run `npm.cmd run build`
- verify `webxr/dist/webusb.html` is emitted when testing the WebUSB probe
- these checks validate the standalone visual client only; they do not require
  firmware, schema, or transport changes

### PlatformIO compile matrix

Run the relevant compile-only matrix before handoff:

- baseline: `platformio run -e m5stack-sticks3`
- main audio path: `platformio run -e m5stack-sticks3-audio`
- storage A/B path: `platformio run -e m5stack-sticks3-audio-storageless`
- remote transport path: `platformio run -e m5stack-sticks3-remote`
- tilt compile-gated path: `platformio run -e m5stack-sticks3-tilt`
- DXL2 board safe probe: `platformio run -e m5stack-atoms3-dxl2-probe`
- DXL2 one-shot ID provisioner: `platformio run -e m5stack-atoms3-dxl2-provision-id2`
- DXL2 unloaded motion probe: `platformio run -e m5stack-atoms3-dxl2-motion-probe`
- AtomS3 MAX98357A TDM safe probe:
  `platformio run -e m5stack-atoms3-max98357a-tdm-probe`
- AtomS3 IMU + XL330x2 + 4CH TDM combined probe:
  `platformio run -e m5stack-atoms3-combined-probe`
- AtomS3 production-integration pipeline:
  `platformio run -e m5stack-atoms3-pipeline`

Use the probe envs when work touches their area:

- `platformio run -e m5stack-sticks3-audio-smoke`
- `platformio run -e m5stack-sticks3-transducer-probe`
- `platformio run -e m5stack-sticks3-raw-i2s-probe`
- `platformio run -e m5stack-sticks3-display-probe`
- `platformio run -e m5stack-sticks3-main-boot-probe`
- `platformio run -e m5stack-sticks3-main-pipeline-probe`
- `platformio run -e m5stack-sticks3-main-loop-probe`
- `platformio run -e m5stack-sticks3-main-audio-probe`
- `platformio run -e m5stack-sticks3-main-delta-probe`

## 2. Build validation

- PlatformIO build succeeds for the scaffold baseline.
- PlatformIO build succeeds for `m5stack-sticks3-audio` with `HAPTICS_ENABLE_AUDIO_BACKEND=1`.
- PlatformIO build succeeds for `m5stack-sticks3-remote`.
- PlatformIO build succeeds for `m5stack-sticks3-tilt`.
- PlatformIO build succeeds for `m5stack-atoms3-max98357a-tdm-probe` while
  existing environments compile its source to an empty feature-gated unit.
- PlatformIO build succeeds for `m5stack-atoms3-pipeline` with the TDM backend
  compiled in and the servo backend compiled out.
- No feature should require hardware-specific code to compile when disabled.

Recorded final build result on `2026-08-22` for
`m5stack-atoms3-pipeline`, including Safe Idle, safety telemetry, and the IMU
stale safe-stop:

- result: SUCCESS
- RAM: `40,524 / 327,680 bytes` (`12.4%`)
- flash: `568,297 / 3,342,336 bytes` (`17.0%`)

The same image was uploaded to the assembled AtomS3 board over COM3 with S1 OFF
and 12 V OFF. The USB-only gate reported `audio=0`, `zero=1`, `driver=1`,
`transport=tdm8_slot`, `layout=quad_wall_4ch`, `limit=0.080`, `errors=0`,
`imu_stop=0`, and `tilt=0`. This passes the software-zero boot gate only; no
powered-amplifier or live four-layer output is implied.

## 3. Hardware validation split

Use the following evidence labels consistently:

- **implemented**: source exists and its relevant build passes
- **probe hardware pass**: a dedicated bounded probe passed on the stated bench
- **production hardware pass**: the shared `HapticPipeline` image passed the
  stated on-device test

A raw transport or combined probe pass must not be promoted to a production
pipeline pass.

### AtomS3 MAX98357A 4-channel TDM safe probe

- follow the power-off connection order in `21_MAX98357A_TDM_BRINGUP.md`
- begin with one unloaded transducer on CH1 and leave the XL330 path torque-off
- keep manual amplifier switch S1 OFF before applying 12 V and during wiring
  changes; firmware cannot read or control S1
- confirm boot sends only digital zeros and requires an explicit `start`, `go`,
  or button click before generating a nonzero sample
- before enabling S1, confirm `status` reports `i2s=1`, `digital_silence=1`,
  increasing writes, and zero errors
- verify silent clocks show PCM-short `48 kHz`, `16-bit`, eight-slot framing:
  `6.144 MHz` BCLK and a one-BCLK LRCLK pulse
- use `ch N` plus `start` to test CH1 through CH4 independently
- verify each single-channel run uses only its matching slot, ends after `1.2 s`,
  and returns automatically to digital silence
- only after independent tests pass, use `go` and verify
  `CH1 -> CH2 -> CH3 -> CH4` with digitally silent gaps
- use `ch N` plus `sweep` for a representative-channel qualitative comparison
  at `120`, `160`, `200`, `240`, `280`, and `320 Hz`, using 1.5 s per point and
  the separately bounded 4.0% sweep level
- verify every sweep step is reported, the `12 s` sweep watchdog remains armed,
  and completion returns automatically to digital silence with zero I2S errors
- treat an unloaded subjective sweep with no clear peak as transport validation
  only; repeat after final mounting or with a mechanically coupled accelerometer
  before changing stored resonance carriers
- for subjective intensity testing, use `level PCT` only while idle and increase
  from the known-good 2.5% in small steps, running one 1.2 s `start` test after
  each change; verify values outside `0.5..20.0%` and changes during a run are rejected
- verify reset restores 2.5% rather than persisting a raised bench-test level
- current unloaded CH1 bench result: 15% is a practical-level candidate and 20%
  passed only as a short-duration ceiling; repeat thermal/current validation
  after mounting before using either value for sustained rendering
- confirm `stop`, `mute`, an AtomS3 button hold, DMA failure, and the run watchdog
  all request digital silence; switch S1 OFF separately for hardware mute

### DXL2 board safe probe

- follow the power-off connection order in `20_DXL2_BOARD_BRINGUP.md`
- begin with one mechanically unloaded XL330 and keep the audio outputs muted
- confirm the AtomS3 display shows `DXL2 SAFE PROBE`
- confirm GPIO1 is used only as DYNAMIXEL TX and GPIO2 only as DYNAMIXEL RX;
  the PCB supplies automatic half-duplex direction control
- confirm the boot scan checks IDs `0..10` at `57,600 bps` and `1 Mbps`
- confirm the detected device reports model/firmware, input voltage,
  temperature, present current, position, and hardware error
- require `torque=OFF`, `off_confirmed=1`, and no physical motion for a pass
- confirm a button hold and the `torqueoff` console command both send the safe
  stop at both supported baud rates
- inspect the probe source to confirm it contains no torque-on, goal-position,
  goal-velocity, or other motion command before flashing
- for ID provisioning, connect exactly one verified model-1190 XL330, require
  source ID 1 only, and verify target ID 2 plus torque OFF by read-back
- reset the provisioner once and confirm it recognizes ID 2 without another
  EEPROM write
- for unloaded motion, require IDs 1 and 2 as model 1190 in position mode,
  verify automatic torque-on is disabled, and require explicit `go`
- move only one servo at a time by 40 pulses (3.52 degrees), return to the
  measured starting position, and require torque-off read-back after each
- abort both servos if absolute current exceeds 350 mA, temperature exceeds
  45 C, voltage leaves 4.5--5.6 V, status reads fail, or hardware error is set
- after the motion image finishes, restore the normal safe-probe image and
  verify both IDs are present with torque OFF

### AtomS3 combined probe: recorded pass on 2026-08-22

The dedicated `m5stack-atoms3-combined-probe` used one fixed bounded workload:

- IMU sampled throughout the run
- XL330 IDs 1 and 2, model 1190, `57,600 bps`, position mode 3
- both servos moved 40 pulses relative to their measured homes and returned
- all four TDM channels received the same `180 Hz` waveform
- haptic envelope was `50 ms ON / 300 ms period`
- every exit path returned to digital zero and DYNAMIXEL torque-off

Measured results:

| Haptic level | ID1 peak | ID2 peak | Servo rail | Final temperature ID1/ID2 | IMU updates | I2S errors | Result |
|---|---:|---:|---|---:|---:|---:|---|
| 8% | 15 mA | 13 mA | 5.1 V | 32 / 31 C | 302 | 0 | home return, torque-off, no observed abnormality |
| 15% | 14 mA | 13 mA | 5.1--5.2 V | 32 / 31 C | 282 | 0 | home return, torque-off, no observed abnormality |

This is a **probe hardware pass** only. It used equal waveforms, unloaded
servos/transducers, a low-duty-cycle burst, and fixed relative position-mode
motion. It does not validate spatial rendering, material layers, a mounted
mechanism, current-based servo behavior, continuous-wave drive, or the
production firmware.

### AtomS3 production pipeline: first hardware acceptance gate

Follow `23_ATOMS3_PRODUCTION_INTEGRATION.md`. The minimum pass requires:

- upload `m5stack-atoms3-pipeline` with S1 OFF and 12 V OFF
- USB-only boot reports successful IMU/pipeline initialization and the AtomS3
  as-built profile
- `audio status` reports `driver=1`, `transport=tdm8_slot`,
  `enabled=0`, `zero=1`, `layout=quad_wall_4ch`, effective `limit=0.080`, and
  zero errors
- always-present telemetry reports `audio.output_silenced=true` and
  `safety.audio_zero_asserted=true`, `safety.tilt_disarmed=true`
- the servo backend remains compile-disabled and no production DYNAMIXEL
  torque or motion packet is sent
- applying 12 V and then S1 ON while runtime audio is disabled produces no
  unexpected vibration or pop
- an explicit `audio on` is required before any nonzero signal
- each Front/Back/Top/Bottom channel-test command excites only its mapped wall
  and `audio off` returns to digital zero
- live IMU-driven output runs at the initial 8% effective peak limit without
  reset, I2S error growth, rail anomaly, or self-excited feedback
- controlled IMU fault injection produces no valid finite sample for more than
  300 ms; require neutral Mass/Event/Texture/Resonance/Spatial/Tilt state,
  zero-filled TDM, and servo disarm; observe either serial
  `status: ... imu_stop=1 ... zero=1 ...` or top-level
  `safety.{imu_stale_safe_stop,audio_zero_asserted,tilt_disarmed}=true`
- when valid IMU data returns, require a neutral restart without replaying
  stale texture/event energy; any servo remains disarmed until explicitly armed
- from Calibration, Replay, and Record separately, invoke `stop` and require
  Safe Idle: the active operation ends, audio runtime turns OFF, zero remains
  asserted, tilt is disarmed, channel-test is cleared, and dynamic state is
  neutral
- on AtomS3, repeat Safe Idle with BtnA hold
- after Safe Idle, issue `live` alone and require output to remain OFF/zero;
  only a subsequent explicit `audio on` may restore haptic output
- while audio runtime is ON, reject transport, demo-mode, and layout changes;
  while muted, accept only supported configurations, and always reject demo
  compatibility while the selected transport is `tdm8_slot`
- reject unknown `audio.transport` strings without changing the selected
  transport, and unknown string layouts without changing the selected layout;
  inject zero-fill, uninstall, and rollback failures and require configuration
  failure, forced-OFF logical gates when restoration fails, plus truthful
  `driver_installed` / `output_silenced` telemetry
- in a build with `HAPTICS_ENABLE_AUDIO_BACKEND=0`, reject every audio-arm
  request without changing the logical runtime/feature flags
- requesting `audio limit 0.20` reports an effective limit of `0.15`; this
  verifies the clamp and does not authorize a 15% mounted run
- at least one liquid and one granular preset exercise the shared pipeline,
  and recorded actuator/event statistics differ in the expected direction
- output remains stable during an agreed soak and after repeated arm/disarm
  cycles

As of `2026-08-22`, build, upload, and the USB-only software-zero boot subset
have passed. Powered-amplifier muted startup also produced no anomaly, and the
unloaded Front/Back/Top/Bottom channel mapping passed with one actuator active
at a time and zero audio errors. `stop` from a live channel test asserted zero,
cleared dynamic/test state, and `live` alone did not re-arm output. An initial
live run of `liquid_small_box` at the 8% limit produced a weak response after
the operator moved the device. A following eight-second software-muted,
stationary Live observation produced no event and no four-channel drive; mass
energy settled near `0.058`, below the `0.16` droplet threshold, before `stop`
returned the system to `energy=0`, `audio=0`, and `zero=1`. The subsequent
powered closed-loop settling check failed: after one light movement, vibration
decayed but did not stop while the device was held still. Safe Idle again
returned `energy=0`, `audio=0`, `zero=1`, `test=0`, `errors=0`, and `tilt=0`.
Do not continue material, directional, or soak validation until the
feature-gated gravity-separated activity correction and the acceptance sequence
in `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md` pass.

### Flash / boot checks

These require a connected StickS3 but do not require a fully characterized
haptic bench.

- flash only after the compile-only matrix passes for the affected env
- confirm the target env boots and prints its expected serial banner
- confirm USB serial commands respond after the known CDC settle / reconnect
  delay if needed
- confirm the SoftAP browser status page loads for remote-enabled envs
- confirm flash-only smoke checks do not get counted as perceptual validation

### Bench / perceptual checks

These require the relevant transducers, amp wiring, and/or XL330 hardware.

- verify actuator routing and channel independence on the bench
- verify resonance sweeps against the physical transducer stack
- verify wall events, texture atoms, and material-family differences by feel
- verify tilt-plane safety, current limits, emergency stop, and sign
  calibration only with the servo bench assembled

## 4. Runtime validation (current scaffold)

- StickS3 boots and initializes.
- IMU polling works without crashing.
- Preset cycling works via `BtnA` click.
- verify the `BtnA` demo cycle includes `granular_single_marble_box` between the default granular and hybrid demos
- Verbose telemetry toggle works via `BtnB` click.
- Audio runtime enable toggle works via `BtnB` hold.
- Audio test-wall cycling works via `BtnA` hold.
- on the AtomS3 custom profile, BtnA hold invokes Safe Idle instead of cycling
  the channel test
- Serial telemetry prints latent state, actuator-frame summaries, and recorder/remote status.
- Console preset listing/loading works.
- preset cycling and `preset load <name>` preserve runtime feature flags, pin assignments, audio layout/runtime state, tilt/interface/recorder settings, and calibrated resonance carriers.
- Recorder start/stop and replay start/stop commands work without crashing.
- Recorder batching honors `recorder.flush_interval_frames` without losing tail frames on stop.
- if LittleFS mount fails at boot, built-in preset listing/loading should still work and should not retry a crashing remount on every console command
- with the generic IMU stale safe-stop flag left false, legacy target behavior
  remains unchanged
- with the AtomS3 profile, confirm invalid or non-finite IMU input does not
  refresh the valid-sample timer and the safe-stop asserts only after the
  300 ms threshold
- confirm `idle` and `stop` both terminate Calibration/Replay/Record, clear the
  channel test, reset all dynamic layers, set audio runtime OFF, assert zero,
  and disarm tilt
- confirm `live` after Safe Idle does not re-arm audio; require `audio on`
- confirm `status` and the always-present `safety` object are sufficient to
  observe the IMU stop and zero assertion without pipeline-debug telemetry

## 4.1 Minimal audio smoke test

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

## 4.2 Minimal transducer probe

- build and flash `m5stack-sticks3-transducer-probe`
- confirm the boot banner prints `Transducer probe started.`
- verify `status` reports pins `(7,5,43)` and a conservative burst pattern
- verify the default `180 Hz`, `60 ms` burst, `220 ms` period pattern is easier to feel than a continuous tone
- verify `freq 120`, `freq 180`, `freq 240`, and `freq 320` can be stepped without crashing
- verify `sweep on` slowly scans the carrier while keeping the burst envelope intact
- use this probe before blaming the full haptic pipeline when the amp path is still uncertain

## 4.3 Raw I2S probe

- build and flash `m5stack-sticks3-raw-i2s-probe`
- confirm the StickS3 screen shows `RAW I2S PROBE`
- verify the serial banner prints `Raw I2S probe started.`
- verify the output uses `GPIO 7/5/43` and writes directly through `driver/i2s.h`
- verify left and right slots carry the same waveform so a mono MAX98357A cannot miss the active side
- verify `BtnB` hold or `pins legacy` switches to the StickS3 default speaker route `17/15/14` for direct A/B comparison against the old demo
- verify `mode tone`, `amp 1.0`, and `tone 180` produce the strongest simple continuous test
- only after the raw I2S probe is stable, move back up to `M5.Speaker` and then the full haptics pipeline

## 4.4 Main firmware observability policy

- `m5stack-sticks3-audio` no longer treats the StickS3 panel as a supported runtime monitor
- verify the main firmware can be operated entirely from USB serial plus the SoftAP browser page
- keep any remaining display validation isolated to the probe envs below

## 4.5 Display probe

- flash `m5stack-sticks3-display-probe`
- verify the screen steps through `M5.begin ok`, `IMU begin`, `EXT_5V on`, and `pipeline begin`
- if the display disappears at a specific stage, treat the previous stage as the last known-good point for the main firmware

## 4.6 Deterministic main-firmware probe ladder

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

## 4.7 Main monitoring workflow

- for the normal `m5stack-sticks3-audio` firmware, treat USB serial and the SoftAP browser page as the only supported monitoring surfaces
- do not use the StickS3 display as part of the main validation workflow
- after boot, confirm serial startup lines and open the HTTP status page from the printed AP URL or `http://192.168.4.1/`
- use serial `status`, `audio status`, `cal status`, `record status`, `replay status`, `tilt status`, and `remote status` for snapshots
- rely on the browser page for continuous inspection of preset, run mode, event, mass energy/position, actuator summary, audio, calibration, recorder, remote, and tilt state
- verify `BtnA` preset cycling does not restart the AP or drop the browser page when WiFi settings are unchanged
- verify at least one synthetic mode is clearly perceptible without any live IMU motion
- only after all four probe rungs are stable should changes be re-applied to `m5stack-sticks3-audio`

## 5. Audio backend validation

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

### Phase A2: eight-slot TDM backend validation
- keep the current dual-I2S backend available while bringing up TDM
- verify the MAX98357A TDM profile uses a single ESP32-S3 TX port with
  `48 kHz`, `16-bit`, `8 slots`, and `PCM short`; slots 4 through 7 remain zero
- verify slot routing `slot0=Front`, `slot1=Back`, `slot2=Top`, `slot3=Bottom`
- verify the same `DriveFrame4` stimulus can be rendered through either dual-I2S or TDM without changing the upstream pipeline
- verify `front_back_2ch` remains available as a fallback policy while the physical TDM transport is active
- verify demo compatibility is rejected while `tdm8_slot` is selected; after
  muting and explicitly selecting dual-I2S, it may force the known single-amp
  mono bring-up path
- verify transport, demo-compat, and output-layout changes are rejected while
  audio runtime output is enabled
- on MAX98357A benches, verify each amplifier responds only to its strapped TDM slot
- verify the TDM path can be disabled or bypassed without breaking legacy probes and current bench workflows

Status on `2026-08-22`:

- implemented in `AudioOutput4Ch` behind the existing audio gate plus
  `HAPTICS_ENABLE_TDM_AUDIO_BACKEND`
- raw framing, CH1--CH4 isolation/order, and zero-filled idle passed with the
  dedicated probe
- the production environment builds with this transport selected
- the shared four-layer pipeline has not yet driven the hardware, so upstream
  compatibility and mounted spatial performance remain pending

### Phase B: actuator tests
- use channel test mode to excite each wall individually
- run `cal start` in the serial console while using `m5stack-sticks3-audio`
- verify low/high resonance estimates are stored back into `resonance.low_carrier_hz[4]` and `resonance.high_carrier_hz[4]`
- verify telemetry reports calibration wall, band, candidate frequency, and progress
- verify channel independence

## 6. Algorithm validation

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

## 7. Servo path validation

The legacy StickS3 model/backend is compile-gated and the dedicated AtomS3
probes have passed bounded unloaded motion. The production AtomS3 environment
compiles servo output out. The following checklist applies only after the
GPIO1-TX/GPIO2-RX automatic-half-duplex production adapter and DXL feedback
telemetry exist:

- verify safe home position on both XL330 units
- require IDs 1 and 2, model 1190, and the configured `57,600 bps` bus before
  allowing torque-on
- verify torque, operating mode, watchdog, travel, and output cap by read-back
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
- require final torque-off read-back after normal stop, run-mode exit, stale
  IMU, communication failure, watchdog timeout, and operator stop
- repeat the safety sequence with the final linkage mounted before evaluating
  pseudo-force quality

## 7.1 Remote transport robustness

- verify a partial or malformed WebSocket frame does not stall IMU polling or haptics updates
- verify both `iface.wifi_mode_ap=true` and `iface.wifi_mode_ap=false` bring up the remote transport as expected

## 7.2 WebXR / smartphone visual demo

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
- verify the MR path requests hand tracking as optional WebXR support and near-grab attaches the container when a tracked hand approaches
- verify the grabbed container follows the estimated grab position without requiring pinch, using wrist-centered fallback when finger joints are incomplete
- verify an open thumb-index opposing grasp centers the object between the fingertips without forcing an unnatural object orientation
- verify near-grab hides the app-rendered raw hand mesh for the active hand and shows only the two contact markers around the object
- verify release and Reset Object restore the app-rendered hand mesh and hide the contact markers
- verify the spatial experiment panel is visible in MR and does not depend on the phone DOM HUD
- verify controller ray selection can activate a preset row and move the panel sliders
- verify controller ray selection or fingertip direct touch can trigger the spatial Reset Object button
- verify Reset Object releases the active grab, applies a short re-grab cooldown, and respawns the object at the table rest pose
- verify index fingertip direct touch only activates the panel when the fingertip is near the panel face
- verify panel slider changes visibly affect content motion boost / damping preview without changing repository presets
- verify the IWSDK/IWER development path can open the app on desktop without a headset
- verify `npm.cmd run quest` prints a Cloudflare Quick Tunnel URL and serves the production preview without Vite HMR errors
- verify liquid and hybrid content remains visibly contained inside the transparent shell during strong tilt
- verify the visual client does not require firmware, schema, or transport changes in v1

## 7.3 WebUSB / Quest transport probe

- from `webxr/`, verify `npm.cmd run typecheck` passes
- from `webxr/`, verify `npm.cmd run build` emits `dist/webusb.html`
- open `/webusb.html` on desktop Chrome and confirm the status strip reports
  secure context, WebUSB, and native Web Serial feature detection
- open `/webusb.html` in Quest Browser from an HTTPS tunnel or static HTTPS host
- record whether `navigator.usb` and `navigator.serial` are present
- connect an Atom S3 / ESP32-S3 over USB-C and verify the device chooser can see
  the target VID/PID
- verify descriptor output lists configurations, interfaces, and endpoints
- attempt to claim the CDC data interface or a vendor-specific bulk interface
- verify `Set DTR/RTS`, `Read Once`, `Read Loop`, and `Send USB Payload` against
  a simple echo firmware
- if CDC cannot be claimed, repeat with a TinyUSB vendor-specific interface
  using interface class `0xff` plus bulk IN/OUT endpoints
- do not treat this probe as the final live transport until repeated Quest
  browser sessions show stable permission, read, and write behavior

## 8. Recorder / replay validation

- recorded sessions must replay latent state evolution deterministically enough for debugging
- event counts and actuator summaries should match within expected tolerance
- stop recording before `recorder.flush_interval_frames` is reached and verify the tail frames are still persisted
- record firmware/build identity, target profile, preset source/path, resolved
  parameter snapshot or hash, calibration identity, and effective audio limit
  before calling a session reproducible
- until those fields are persisted automatically, store them in the external
  test record; the current NDJSON preset name alone cannot distinguish a
  built-in preset from a same-named LittleFS overlay

## 9. Acceptance criteria for first full haptic milestone

The first meaningful milestone is reached when:
- four-channel sweep and per-channel resonance storage work,
- `wall_hit` is rendered spatially,
- at least one granular preset and one liquid preset produce clearly different 4-channel output statistics,
- the scaffold remains buildable and documented.

The algorithms and storage scaffold exist, but this milestone is **not yet a
production hardware pass**: an initial liquid-only live response has been
observed on the assembled AtomS3 board, but the powered settling check failed
because residual vibration did not stop. The required correction, retest,
liquid/granular comparison, and mounted material/spatial comparison remain
pending. The unloaded qualitative sweep also did not identify a clear
resonance.

Current status after the audio-backend milestone:
- dual-stereo I2S x2 backend compilation is in place
- additive single-port eight-slot TDM is implemented
- runtime enable and single-wall test mode are in place
- runtime-selectable `quad_wall_4ch` / `front_back_2ch` output layout is now in place
- dedicated raw AtomS3 TDM channel routing passed on hardware
- the final `m5stack-atoms3-pipeline` built successfully (RAM 12.4%, flash
  17.0%) with Safe Idle, always-present safety telemetry, initial 8% / hard 15%
  output limits, and the servo backend compiled out
- production upload, USB-only software-zero boot, powered muted startup,
  unloaded four-channel routing, live-test Safe Idle, and explicit re-arm
  behavior passed; an initial motion-triggered liquid response and a muted
  stationary no-event observation passed, but powered settling failed because
  vibration did not stop; follow document 24 before resuming material
  comparison, spatial localization, or mounted soak

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
- a compile-gated legacy DATA+DIR XL330 path is available in
  `m5stack-sticks3-tilt`
- AtomS3 DXL communication and bounded unloaded motion passed dedicated probes,
  but its production TX/RX automatic-half-duplex adapter is not implemented

Current status after the tilt pseudo-force revision:
- thumb/index commands now keep the existing base tilt and add a filtered low-frequency pseudo-force correction
- telemetry now exposes base tilt, pseudo-force delta, apparent mass, CoG, common force, and differential torque
- the current values are model-command telemetry, not DXL read-back
- mounted sign calibration, perceptual scaling, current-based position
  behavior, and production safety telemetry remain future work

Current status after the shaker-family event milestone:
- granular `roll_train` is now emitted as a rate-driven event train tied to wall contact and tangential motion
- granular `impact_cluster` density now scales with container span, particle properties, and rolling activity
- granular `scrape` now uses intermittent cooldown-based scheduling instead of a per-tick placeholder
