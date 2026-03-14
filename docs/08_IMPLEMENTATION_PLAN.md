# 08 Implementation Plan

For the concrete as-built snapshot as of `2026-03-15`, see `16_PROGRESS_STATUS.md`.
This document remains the intended development order and gap-management plan.

## Phase 0 - Documentation and scaffold
- finalize design docs
- stabilize C++ module boundaries
- keep build passing

## Phase 1 - 4-channel audio backend
- implemented: stereo I2S x2 backend in `AudioOutput4Ch`
- implemented: compile-time flag for backend enable
- implemented: runtime enable toggle and single-wall channel test mode
- implemented: runtime-selectable `quad_wall_4ch` / `front_back_2ch` physical output layout
- next refinement: bench validation and tuning of buffering / underrun behavior

## Phase 1A - Additive TDM backend migration
- goal: add a single-port TDM backend for simpler 4-channel wiring without changing the shared haptic pipeline
- preserve: the current dual-stereo I2S x2 backend as the safe fallback during migration
- preserve: `audio.demo_compat_mode` as the known-good mono single-amp route
- preserve: the current `front_back_2ch` physical fallback semantics
- planned first TDM target: ESP32-S3 TX-only path using the newer `esp_driver_i2s` API
- planned first TDM profile: `48 kHz`, `16-bit`, `4 slots`, `PCM short`
- planned slot mapping: `slot0=Front`, `slot1=Back`, `slot2=Top`, `slot3=Bottom`
- planned bring-up hardware: MAX98357A boards with per-board slot straps
- acceptance intent: the physical transport changes, but `DriveFrame4`, telemetry, presets, and spatial rendering remain source-compatible

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
- next refinement: promote serial + SoftAP browser monitoring to the canonical human-facing workflow

## Phase 10 - Open-source cleanup
- implemented: hardware placeholder contract and contribution checklist
- deferred: license selection and actual hardware asset publication

## Current priority

- keep the shared haptic pipeline intact
- improve observability and hardware-side tuning workflow
- use USB serial + SoftAP browser monitoring as the supported main-firmware path
- treat display work as probe-only until the low-level panel issue is understood

## Implemented now vs needs improvement

- implemented now:
  - geometry-aware mass layer
  - wall / shaker / liquid / hybrid event families
  - stateful texture atoms and resonance/spatial rendering
  - audio backend with `quad_wall_4ch` / `front_back_2ch`
  - dual-I2S backend as the current shipped 4-channel transport
  - runtime calibration with NVS persistence
  - recorder/replay
  - SoftAP/WebSocket remote baseline
  - tilt pseudo-force baseline
- needs improvement:
  - additive TDM backend migration and bench validation
  - liquid / granular / hybrid percept realism
  - localization and repeatability on hardware
  - storage robustness
  - monitoring reliability
  - servo safety validation
  - browser monitoring UX

## Risk register

| Risk | Why it matters | Early mitigation |
|---|---|---|
| Output self-couples into IMU | can destabilize model behavior | keep sensor path band-limited and architected before output tuning |
| Audio backend complexity | can delay research progress | keep dual-I2S as the stable baseline, then add TDM behind an explicit backend migration path |
| Liquid model overfitting | may produce “hum” instead of rich texture | keep event-centric liquid rendering |
| Servo safety | risk of mechanical overdrive | start with current-limited position mode and conservative angle bounds |
| Architecture drift | Codex may implement locally convenient hacks | use AGENTS.md + docs as source of truth |
