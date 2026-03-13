# 08 Implementation Plan

## Phase 0 - Documentation and scaffold
- finalize design docs
- stabilize C++ module boundaries
- keep build passing

## Phase 1 - 4-channel audio backend
- implemented: stereo I2S x2 backend in `AudioOutput4Ch`
- implemented: compile-time flag for backend enable
- implemented: runtime enable toggle and single-wall channel test mode
- next refinement: bench validation and tuning of buffering / underrun behavior

## Phase 2 - Resonance sweep and storage
- implemented: per-channel excitation sweep
- implemented: low/high carrier storage in runtime parameters and NVS
- implemented: telemetry for calibration state and progress
- next refinement: tighten the response metric beyond the current IMU-proxy ratio

## Phase 3 - Minimal end-to-end material rendering
- implemented: geometry-aware baseline in the mass layer
- implemented: geometry-aware `wall_hit` scheduling with size-dependent cooldown
- next refinement: bench-confirm strong wall localization in 4 channels while other event families are still scaffold-level

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
- next refinement: deterministic comparison metrics and file management UX

## Phase 8 - XL330 tilt-plane integration
- implemented: compile-gated raw DYNAMIXEL Protocol 2.0 half-duplex path
- implemented: current clamp and software velocity clamp
- implemented: mass-state to thumb/index tilt mapping
- next refinement: bench safety validation and richer status feedback

## Phase 9 - Smartphone / HMD interface
- implemented: SoftAP + WebSocket JSON control/telemetry baseline
- implemented: schema-shaped control message handling
- next refinement: BLE / UDP / OSC transports and stronger message validation

## Phase 10 - Open-source cleanup
- implemented: hardware placeholder contract and contribution checklist
- deferred: license selection and actual hardware asset publication

## Risk register

| Risk | Why it matters | Early mitigation |
|---|---|---|
| Output self-couples into IMU | can destabilize model behavior | keep sensor path band-limited and architected before output tuning |
| Audio backend complexity | can delay research progress | start with stereo I2S x2 rather than TDM |
| Liquid model overfitting | may produce “hum” instead of rich texture | keep event-centric liquid rendering |
| Servo safety | risk of mechanical overdrive | start with current-limited position mode and conservative angle bounds |
| Architecture drift | Codex may implement locally convenient hacks | use AGENTS.md + docs as source of truth |
