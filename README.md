# Parametric Container Haptics

Docs-first PlatformIO repository for an **on-device vibrotactile generation pipeline** built around:

- **4-layer haptic model**: mass motion -> events -> texture -> resonance
- **4 spatial transducers** for wall-aligned rendering
- **2 future low-frequency tilt-plane channels** driven by **XL330-M077-T** servos
- **M5StickS3 + MAX98360A x4** as the first experimental electronics stack

This repository is intentionally prepared as a **Codex handoff package**:

- the architecture is fully documented,
- interfaces are defined before implementation,
- the PlatformIO project builds from a minimal scaffold,
- feature flags are reserved so later implementation can be added **without breaking the baseline**.

## Scope

This repository targets **material and container-content haptics**, not only liquids.
The common framework must cover:

- liquids,
- granular shakers (sand, rice, beads),
- sparse rigid inclusions (coins, marbles, ice cubes),
- hybrid contents,
- future detents / scrape / stick-slip style materials.

## Current status

- **Implemented now**
  - PlatformIO project scaffold for StickS3
  - C++ module boundaries for the full pipeline
  - parameter structures, preset store, and expanded telemetry structures
  - compile-gated 4-channel stereo-I2S x2 audio backend for ESP32-S3
  - runtime resonance sweep with NVS-backed low/high carrier persistence
  - geometry-aware mass motion for liquid, granular, and hybrid families
  - stateful event / texture / resonance / spatial pipeline with SOA-aware flow rendering
  - starter preset set including liquid, hybrid, and granular coin/sand/bead JSON files
  - LittleFS-backed NDJSON recorder and IMU replay path
  - compile-gated SoftAP + WebSocket JSON remote interface
  - compile-gated XL330 raw Protocol 2.0 tilt-plane control path
  - button-based preset cycling, audio test-wall cycling, and serial console control
- **Deliberately not implemented yet**
  - bench validation for audio, liquid/hybrid percepts, and servo safety
  - stronger actuator identification beyond the current IMU-proxy sweep ratio metric
  - BLE / UDP / OSC transports
  - final hardware asset publication and license selection

## Repository layout

```text
parametric-container-haptics/
├── AGENTS.md
├── README.md
├── LICENSE_TODO.md
├── platformio.ini
├── include/haptics/
├── src/
├── docs/
├── presets/
├── schemas/
├── hardware/
└── test/
```

## Quick start

1. Open the repository in VS Code + PlatformIO.
2. Select `m5stack-sticks3` for the baseline build, `m5stack-sticks3-audio` for audio, `m5stack-sticks3-remote` for WiFi/WebSocket, or `m5stack-sticks3-tilt` for XL330 experiments.
3. Build and flash.
4. Open the serial monitor at `115200`.
5. Press **BtnA** click to cycle material families.
6. Press **BtnA** hold to cycle `OFF -> Front -> Back -> Top -> Bottom -> OFF` audio test routing.
7. Press **BtnB** click to toggle verbose telemetry.
8. Press **BtnB** hold to toggle runtime audio enable.
9. Use the serial monitor commands `cal ...`, `preset ...`, `record ...`, `replay ...`, and `tilt ...` as needed.

## Development principles

1. **Additive changes only** at first.
2. New features must be gated behind flags and default to the current baseline.
3. The four-layer pipeline is the architectural source of truth.
4. Low-frequency force cues will later be added by the **thumb/index tilt-plane mechanism**, not by overloading the 4-transducer texture path.
5. The repository should remain suitable for future open-source release.

## Must-read docs

Read these in order before implementing:

1. `docs/01_FUNCTIONAL_REQUIREMENTS.md`
2. `docs/02_SYSTEM_ARCHITECTURE.md`
3. `docs/03_PIPELINE_SPEC.md`
4. `docs/04_HARDWARE_AND_PIN_SPEC.md`
5. `docs/05_INTERFACE_SPEC.md`
6. `docs/06_PARAMETER_MODEL.md`
7. `docs/07_TEST_AND_VALIDATION.md`
8. `docs/08_IMPLEMENTATION_PLAN.md`
9. `docs/09_CODEX_HANDOFF.md`
10. `docs/10_REFERENCES.md`
11. `docs/11_CODEX_START_PROMPT.md`
12. `docs/12_IMPLEMENTATION_WALKTHROUGH.md`
13. `docs/13_COLLABORATION_INPUT_CHECKLIST.md`

## Notes for future open-source release

- The hardware folder is intentionally a placeholder for your KiCad, BOM, and mechanical design.
- A concrete license is **not selected yet**. See `LICENSE_TODO.md` before publishing.
