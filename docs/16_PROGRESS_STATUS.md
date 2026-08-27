# 16 Progress Status

This document was reconciled on `2026-08-27` and includes hardware evidence
through `2026-08-22`.
Its purpose is to make three things explicit:

- what is implemented in code today
- what exists only as a baseline or still needs hardware validation
- what the intended end-state still is

## 1. Executive summary

- The repository already contains a real on-device 4-layer haptic pipeline shared across liquid, granular, hybrid, and detented families.
- `AudioOutput4Ch` now supports both the retained dual-I2S path and a
  single-port eight-slot TDM path with canonical four-wall routing.
- `m5stack-atoms3-pipeline` is the first production-oriented image for the
  as-built custom PCB. It uses TDM8, zero-data muted boot, an 8% initial peak
  limit, a 15% compile-time hard ceiling, a 300 ms IMU stale safe-stop, USB
  serial control, atomic Safe Idle, and servo compile-out.
- The dedicated AtomS3 TDM, DXL2, and combined probes passed on unloaded
  hardware on `2026-08-22`.
- The production AtomS3 image builds and was uploaded successfully. Its
  USB-only software-zero boot gate passed with the amplifier supply and S1 OFF;
  powered muted startup and unloaded Front/Back/Top/Bottom channel routing then
  passed with zero audio errors. The first powered `liquid_small_box` Live
  settling check failed: after a light movement, vibration decayed but did not
  stop while the device was still. Safe Idle immediately restored zero output
  with zero I2S errors. The exact restart plan is in
  `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md`.
- Recorder/replay, runtime resonance calibration, and the StickS3 remote and
  legacy tilt paths remain present behind compile-time/runtime gates.
- A standalone `webxr/` visual client now exists for smartphone and Quest 3/3S demos without requiring live firmware communication.
- The main remaining gaps are live AtomS3 pipeline validation, mounted spatial
  and material tuning, reproducible configuration capture, and a production
  AtomS3 DXL servo adapter with read-back safety.

## 2. Verification evidence

Legacy build matrix recorded on `2026-03-15`:

- `m5stack-sticks3`
- `m5stack-sticks3-audio`
- `m5stack-sticks3-remote`
- `m5stack-sticks3-tilt`

Final AtomS3 production build, including Safe Idle, always-present safety
telemetry, and the IMU stale safe-stop, recorded on `2026-08-22`:

- environment: `m5stack-atoms3-pipeline`
- result: SUCCESS
- RAM: `40,524 / 327,680 bytes` (`12.4%`)
- flash: `568,297 / 3,342,336 bytes` (`17.0%`)
- upload: SUCCESS to the assembled AtomS3 board over COM3 with S1 OFF and 12 V
  OFF
- USB-only status: `audio=0`, `zero=1`, `driver=1`, `tdm8_slot`, four channels,
  8% limit, zero audio errors, valid IMU timing, and tilt disabled
- powered channel test: S1/12 V muted startup had no anomaly; CH1 through CH4
  each actuated alone in Front/Back/Top/Bottom order with zero audio errors
- Safe Idle subset: `stop` from the active channel test reset energy/test state
  and asserted zero; subsequent `live` alone remained muted until explicit arm
- live liquid subset: gentle unintended device motion produced a weak haptic
  response at the 8% limit; an eight-second muted stationary observation then
  settled near `energy=0.058` with no event and zero channel drive, and `stop`
  restored `energy=0`, `audio=0`, and `zero=1`
- powered closed-loop settling: FAIL; after one light movement, vibration
  decayed but did not stop. The subsequent Safe Idle status was
  `energy=0`, `audio=0`, `zero=1`, `test=0`, `errors=0`, and `tilt=0`.

AtomS3 probe hardware evidence recorded on `2026-08-22`:

- DXL2 communication, ID 1/2 provisioning, torque-off read-back, and bounded
  unloaded moves passed at 57,600 bps
- raw MAX98357A TDM CH1--CH4 isolation/order passed with eight-slot framing
- short unloaded CH1 bursts passed at 5, 8, 10, 12, 15, 18, and 20%; 15% was
  judged practically sufficient and 20% remains a short-test ceiling only
- combined IMU + both servos + equal 4CH low-duty bursts passed at 8% and 15%
  with the measurements in `22_ATOMS3_COMBINED_BRINGUP.md`

Build evidence does not prove hardware behavior. Probe evidence does not prove
the shared four-layer production pipeline, mounted spatial quality, or servo
mechanism safety.

## 3. Progress against the required development order

Status is source-oriented. Hardware evidence is stated separately in the last
column so implemented cannot be read as production hardware passed.

| Order | Area | Status | What exists now | What is still missing |
|---|---|---|---|---|
| 1 | Audio backend abstraction | Implemented | `AudioOutput4Ch` with dual-I2S, eight-slot TDM, zero assertion/status, muted-only transport/layout changes, Safe Idle, and effective peak clamp | Raw TDM probe passed; production pipeline and safety-transition validation pending |
| 2 | Actuator sweep and resonance identification | Implemented baseline | `RuntimeCalibrator`, low/high carrier sweep, NVS-backed restore/store, calibration telemetry | Stronger identification metric and repeatable hardware characterization |
| 3 | Mass motion layer refinement | Implemented baseline | Geometry-aware latent mass state, family shaping, convective liquid bias, agitation coupling | More physical tuning and perceptual fitting on real hardware |
| 4 | Event layer: wall-hit only | Completed and extended | Geometry-aware `wall_hit` scheduling with size-dependent cooldown and direction bias | More bench localization validation |
| 5 | Event layer: shaker families | Implemented baseline | `roll_train`, `impact_cluster`, intermittent `scrape`, granular presets | Perceptual separation and tuning on hardware |
| 6 | Event layer: liquid families | Implemented baseline | `droplet_cluster`, `roof_slap`, liquid presets, hybrid liquid branch | More realism across fill / viscosity / container variation |
| 7 | Texture layer atoms | Implemented baseline | `hard_ping`, `knock_ping`, `detent_click`, `wet_burst`, `dry_rattle`, `scrape_noise`, `flow_ripple` | Further atom expansion only if tuning reveals a real need |
| 8 | 4-transducer spatial rendering | Implemented baseline | `SpatialRenderer4`, physical wall adjacency, SOA-aware flow motion, canonical `DriveFrame4` | Raw channel order passed; live mounted spatial localization pending |
| 9 | Telemetry / recorder / replay | Implemented baseline | Serial/JSON telemetry, `audio.output_silenced`, top-level safety state, NDJSON recorder, IMU replay | Hardware validation, resolved config/build identity, deterministic metrics, DXL feedback, file UX |
| 10 | XL330 tilt-plane integration | Split status | Shared pseudo-force model and legacy StickS3 DATA+DIR backend exist; Atom DXL probes passed | Atom production TX/RX adapter unimplemented and compile-disabled; mounted calibration/safety pending |
| 11 | Smartphone / HMD transports | Partial | SoftAP HTTP status page plus WebSocket JSON control / telemetry baseline; standalone `webxr/` visual demo for phone and Quest MR | BLE / UDP / OSC, live XR telemetry/control, robust client UX |

## 4. Implemented now

- Shared on-device 4-layer pipeline: mass motion -> event -> texture -> resonance.
- Geometry-aware material rendering across liquid, granular, hybrid, and detented families.
- 4-wall spatial renderer that preserves wall identity and direction-aware apparent motion.
- Compile-gated dual-I2S/eight-slot-TDM audio backend with runtime-selectable
  four-channel and Front/Back two-channel output policies.
- As-built AtomS3 profile with GPIO5/6/7 TDM, zero-data boot, 8% initial
  effective limit, 15% hard ceiling, 300 ms invalid/non-finite IMU safe-stop,
  and deliberate servo compile-out.
- Safe Idle through `idle`, `stop`, remote Idle mode, and AtomS3 BtnA hold;
  it exits calibration/replay/record, asserts zero, disarms audio/tilt, clears
  channel test, and resets all dynamic layers.
- Always-present `audio.output_silenced` and top-level
  `safety.{imu_stale_safe_stop,audio_zero_asserted,tilt_disarmed}` telemetry.
- Muted-only audio transport/demo/layout changes and rejection of demo
  compatibility on the TDM transport.
- Runtime resonance calibration with NVS-backed low/high carrier persistence.
- LittleFS-backed NDJSON recorder and IMU replay path.
- Compile-gated SoftAP HTTP + WebSocket JSON monitoring / control baseline.
- XL330 thumb/index pseudo-force model plus a compile-gated legacy StickS3
  servo backend.
- Standalone `webxr/` visual demo with smartphone touch/tilt input, Quest MR entry, pinch/grab bridge, procedural bench assets, local material visuals, and Cloudflare Quick Tunnel launch script.
- Probe-oriented bring-up environments for audio, display isolation, raw I2S, and staged main-firmware debugging.
- Feature-gated default behavior that keeps the baseline build stable when audio, remote, tilt, recorder, or calibration are disabled.
- Preset application now has an explicit runtime-config preservation helper so
  built-in and filesystem preset loads keep hardware/session gates, output
  configuration, recorder/interface settings, and calibrated carriers stable.

## 5. Implemented but not yet proven enough

- `m5stack-atoms3-pipeline` has a build, upload, and USB-only software-zero boot
  pass plus a powered unloaded channel-routing pass. Its first powered Live
  liquid settling test failed because residual vibration did not stop. Gravity
  separation and motion-band filtering are planned but not yet implemented;
  granular comparison, spatial checks, and soak must wait for the retest.
- The new AtomS3 IMU stale safe-stop is implemented but still needs controlled
  fault injection and recovery validation on the production image.
- Safe Idle from the tested live channel/output slice and the requirement for a
  fresh `audio on` after returning to Live passed. Calibration/Replay/Record,
  BtnA hold, controlled IMU-stale recovery, and audio-configuration guards
  still need production hardware validation.
- Four-wall localization and repeatability still need stronger bench evidence.
- Liquid / granular / hybrid perceptual separation and gain balance still need tuning on real hardware.
- Calibration currently uses an IMU-proxy response metric; stronger identification remains future work.
- Recorder / replay works as a baseline, but deterministic comparison tooling and file-management UX are still light.
- Remote monitoring is useful for bring-up, but long-session robustness and browser UX still need work.
- The WebXR demo is visual-only; live telemetry/control, persistence, and hosted deployment are still future work.
- Dedicated AtomS3 probes confirm bounded unloaded XL330 communication/motion,
  but do not validate production actuation, the mounted linkage, sign,
  current-based behavior, or long-duration margins.

## 6. Not implemented yet

- The native deterministic layer harness, negative schema fixtures, host bench
  runner, and separate AtomS3 monitor-only wireless environment described in
  `25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md`. The existing StickS3
  remote baseline is not yet safe to enable unchanged on the AtomS3 production
  path.
- AtomS3 production DXL adapter for GPIO1 TX / GPIO2 RX automatic half-duplex,
  including device read-back, watchdog/fault state, and telemetry.
- Automatic capture of resolved preset/build/calibration identity for
  reproducible recordings.
- BLE, UDP, and OSC transports beyond the reserved interface fields.
- Live HMD / host integration beyond the current WebSocket JSON baseline and standalone visual demo.
- Final hardware asset publication in `hardware/`.
- Final open-source license selection.

## 7. Ideal target state reaffirmed

The intended end-state is still the same:

1. One shared on-device 4-layer pipeline must cover all material families.
2. The 4-transducer path must remain responsible for mid/high-frequency wall events and texture rendering, not for low-frequency pseudo-force.
3. The thumb/index XL330 path must remain a separate low-frequency augmentation branch driven from the mass-motion state.
4. Container geometry must continue to constrain travel time, collision density, and wall-contact frequency before later rendering stages.
5. Transport changes must stay additive: `DriveFrame4`, presets, telemetry, and wall semantics should survive audio-backend migration unchanged.
6. New subsystems must remain behind compile-time and/or runtime gates with safe defaults.
7. Monitoring is target-specific: the first AtomS3 production slice uses USB
   serial, while the retained remote-enabled StickS3 target uses USB serial plus
   the SoftAP browser page.

The formal target refinement model for that end-state is now captured in
`docs/17_PARAMETRIC_CONTAINER_HAPTICS_MODEL_SPEC.md`.
The current firmware should continue to evolve toward that model additively from
the existing reduced shared state, not via architectural replacement.

## 8. Recommended next focus

- First strengthen schema validation, add the native deterministic layer
  harness, and capture a reviewed feature-disabled legacy fingerprint. Then
  implement and validate the feature-gated gravity-separated activity path
  and current-frame `new_evt` contract in
  `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md`.
- Continue `m5stack-atoms3-pipeline` validation with Safe Idle from every
  active mode, IMU fault observation, configuration guards, and the exact
  powered Gate 1 procedure. Only after Gate 1 passes, resume mounted resonance
  identification and the later spatial/material-family gates; a wireless
  observer comparison may run in parallel but does not block Gate 2.
- Tighten the resonance identification metric and storage robustness.
- Add resolved configuration identity to recordings and acceptance records.
- Implement the AtomS3 servo adapter only after the haptic-only slice is stable,
  then validate XL330 safety, sign conventions, and pseudo-force scaling.
