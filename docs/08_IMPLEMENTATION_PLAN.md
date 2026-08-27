# 08 Implementation Plan

For the concrete as-built snapshot as of `2026-08-22`, see `16_PROGRESS_STATUS.md`.
This document remains the intended development order and gap-management plan.

## Phase 0 - Documentation and scaffold
- finalize design docs
- stabilize C++ module boundaries
- keep build passing

## Phase 1 - 4-channel audio backend
- implemented: stereo I2S x2 backend in `AudioOutput4Ch`
- implemented: single-port eight-slot TDM backend in `AudioOutput4Ch`
- implemented: compile-time flag for backend enable
- implemented: runtime enable toggle and single-wall channel test mode
- implemented: runtime-selectable `quad_wall_4ch` / `front_back_2ch` physical output layout
- implemented: effective output peak clamp plus compile-time hard ceiling
- probe hardware pass: AtomS3 raw TDM slot isolation/order and equal 4CH burst
- pending: shared-pipeline upload, mounted localization, buffering/underrun soak,
  and quantitative channel matching

## Phase 1A - Additive TDM backend migration
- completed in source: add a single-port TDM backend without changing the
  upstream `DriveFrame4` contract
- preserve: the current dual-stereo I2S x2 backend as the safe fallback during migration
- preserve: `audio.demo_compat_mode` as the known-good mono single-amp route
- preserve: the current `front_back_2ch` physical fallback semantics
- implemented profile: ESP32-S3 TX-only `48 kHz`, `16-bit`, PCM-short,
  **8 slots** per frame
- implemented slot mapping: `slot0=Front`, `slot1=Back`, `slot2=Top`,
  `slot3=Bottom`, `slot4..7=zero`
- as-built pins: GPIO5 BCLK, GPIO6 frame sync, GPIO7 DOUT
- probe hardware pass: all four MAX98357A channels and sequence order on the
  custom board
- production build pass: `m5stack-atoms3-pipeline` on `2026-08-22`
- pending acceptance: upload that image and demonstrate the shared pipeline on
  the mounted hardware without regressing the legacy transports

## Phase 2 - Resonance sweep and storage
- implemented: per-channel excitation sweep
- implemented: low/high carrier storage in runtime parameters and NVS
- implemented: telemetry for calibration state and progress
- next refinement: tighten the response metric beyond the current IMU-proxy ratio

## Phase 3 - Minimal end-to-end material rendering
- implemented: geometry-aware baseline in the mass layer
- implemented: geometry-aware `wall_hit` scheduling with size-dependent cooldown
- next refinement: bench-confirm strong wall localization and compare it with
  the now-implemented shaker/liquid/hybrid families

## Phase 4 - Shakers family
- implemented: `roll_train` as a rate-driven train tied to wall contact and tangential motion
- implemented: geometry-aware `impact_cluster` density tied to rolling activity
- implemented: intermittent `scrape` scheduling for granular materials
- implemented: starter granular presets for coin / sand / bead
- next refinement: validate perceptual separation between roll, cluster, and scrape on hardware

## Phase 5 - Liquid family
- implemented: liquid convective-bias latent baseline
- implemented: burst-based `droplet_cluster`
- implemented: `roof_slap` gated by `container.enable_roof_contact`
- implemented: starter liquid presets for small box / dense jar / half tube
- next refinement: perceptual tuning against granular and hybrid presets

## Phase 6 - Hybrid materials
- implemented: sparse rigid impacts layered onto liquid bursts
- implemented: hybrid preset baseline
- next refinement: tune rigid/liquid balance on hardware

## Phase 7 - Recorder / replay and telemetry
- implemented: LittleFS NDJSON recorder
- implemented: IMU replay through the shared pipeline
- implemented: run-mode / recorder / remote telemetry extensions
- implemented: IMU validity plus audio driver/transport/effective-limit status
- next refinement: resolved preset/build/calibration identity, deterministic
  comparison metrics, DXL feedback, and file-management UX

## Phase 8 - XL330 tilt-plane integration
- implemented for the retained StickS3 backend: compile-gated raw DYNAMIXEL
  Protocol 2.0 DATA+DIR path, current clamp, and software velocity clamp
- implemented: mass-state to thumb/index tilt mapping
- probe hardware pass on AtomS3: GPIO1 TX / GPIO2 RX automatic half-duplex,
  IDs 1/2 at 57,600 bps, bounded unloaded motion, and combined operation
- intentionally disabled: `m5stack-atoms3-pipeline` compiles the servo backend
  out because the legacy electrical adapter is incompatible
- next implementation: AtomS3 production DXL adapter, read-back state machine,
  watchdog/fault telemetry, mounted sign/home calibration, then perceptual tuning

## Phase 9 - Smartphone / HMD interface
- implemented on retained StickS3 targets: SoftAP + WebSocket JSON
  control/telemetry baseline
- implemented: schema-shaped control message handling
- intentionally excluded from the first AtomS3 production slice
- next refinement: resolved configuration controls and live smartphone/HMD
  integration after the local production pipeline is stable

## Phase 10 - Open-source cleanup
- implemented: hardware placeholder contract and contribution checklist
- deferred: license selection and actual hardware asset publication

## Current priority

1. Upload and validate the first `m5stack-atoms3-pipeline` slice at the initial
   8% effective peak limit.
2. Confirm zero-data boot, explicit arm, four-wall routing, IMU-driven output,
   material separation, and soak behavior with servos compiled out.
3. Calibrate the mounted per-wall response and replace the unloaded qualitative
   sweep with measured resonance/crosstalk evidence.
4. Implement the AtomS3 DXL production adapter only after the haptic-only slice
   is stable, then re-run the combined safety matrix.

## Implemented now vs needs improvement

- implemented now:
  - geometry-aware mass layer
  - wall / shaker / liquid / hybrid event families
  - stateful texture atoms and resonance/spatial rendering
  - audio backend with `quad_wall_4ch` / `front_back_2ch`
  - dual-I2S fallback plus single-port eight-slot TDM transport
  - AtomS3 as-built profile with zero-data boot, 8% initial limit, 15% hard
    ceiling, 300 ms IMU stale safe-stop, and servo compile-out
  - runtime calibration with NVS persistence
  - recorder/replay
  - SoftAP/WebSocket remote baseline
  - tilt pseudo-force baseline
- needs improvement:
  - production pipeline upload and mounted TDM/spatial validation
  - liquid / granular / hybrid percept realism
  - localization and repeatability on hardware
  - storage robustness
  - monitoring reliability
  - AtomS3 production servo adapter and safety telemetry
  - browser monitoring UX

## Risk register

| Risk | Why it matters | Early mitigation |
|---|---|---|
| Output self-couples into IMU | can destabilize model behavior | keep sensor path band-limited and architected before output tuning |
| Audio backend complexity | can delay research progress | retain dual-I2S while validating TDM behind explicit compile/runtime gates |
| Liquid model overfitting | may produce a hum instead of rich texture | keep event-centric liquid rendering |
| Servo safety | risk of mechanical overdrive | keep AtomS3 servo compile-out until read-back, watchdog, bounds, and mounted stop tests pass |
| Architecture drift | Codex may implement locally convenient hacks | use AGENTS.md + docs as source of truth |
