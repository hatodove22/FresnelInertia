# Parametric Container Haptics

Docs-first PlatformIO repository for an **on-device vibrotactile generation pipeline** built around:

- **4-layer haptic model**: mass motion -> events -> texture -> resonance
- **4 spatial transducers** for wall-aligned rendering
- **2 low-frequency tilt-plane channels** driven by **XL330-M077-T** servos
- **M5StickS3 + MAX98360A x4** as the first experimental electronics stack

This repository is intentionally prepared as a **Codex handoff package**:

- the architecture is fully documented,
- interfaces are defined before implementation,
- the PlatformIO project builds from a minimal scaffold,
- feature flags are reserved so later implementation can be added **without breaking the baseline**.

## Product goal

The project has one goal:

- make the device a reliable **on-device container-content haptics platform** that can be tuned on real hardware

That means:

- the shared material pipeline is the product
- observability exists to tune that pipeline on-device
- low-level display experiments are not the product and must not block the main firmware path

## Scope

This repository targets **material and container-content haptics**, not only liquids.
The common framework must cover:

- liquids,
- granular shakers (sand, rice, beads),
- sparse rigid inclusions (coins, marbles, ice cubes),
- hybrid contents,
- future detents / scrape / stick-slip style materials.

## Current status

For the precise repository snapshot, remaining gaps, and ideal end-state, see `docs/16_PROGRESS_STATUS.md`.

- **Done now**
  - shared on-device 4-layer haptic pipeline for liquid, granular, hybrid, and detented families
  - geometry-aware mass layer plus stateful event / texture / resonance / spatial rendering
  - compile-gated ESP32-S3 audio backend with `quad_wall_4ch` and `front_back_2ch`
  - runtime calibration with NVS-backed low/high carrier persistence
  - LittleFS-backed recorder / replay
  - compile-gated SoftAP HTTP status page plus WebSocket JSON remote backend
  - compile-gated XL330 tilt pseudo-force baseline
  - serial console control and telemetry
- **Implemented but still validation-heavy**
  - perceptual realism and gain balance, especially liquid vs granular vs hybrid
  - hardware-side validation of localization and repeatability
  - storage robustness and deterministic comparison workflow
  - monitoring reliability and browser-based polish
  - servo safety validation
- **Not implemented yet**
  - single-port TDM audio backend
  - BLE / UDP / OSC transports
  - explicit HMD / host integration path
  - final hardware asset publication and license selection
- **Builds verified on 2026-03-15**
  - `m5stack-sticks3`
  - `m5stack-sticks3-audio`
  - `m5stack-sticks3-remote`
  - `m5stack-sticks3-tilt`

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
2. Select `m5stack-sticks3` for the baseline build, `m5stack-sticks3-audio` for the main tuning firmware, `m5stack-sticks3-audio-storageless` to A/B the same main firmware with LittleFS / Preferences / recorder persistence disabled, `m5stack-sticks3-audio-direct-display` only if you are still isolating the old display issue, `m5stack-sticks3-audio-smoke` for the minimal mono smoke test on GPIO `7/5/43`, `m5stack-sticks3-display-probe` and the `main-*probe` envs only for isolated display / bring-up experiments, `m5stack-sticks3-transducer-probe` for a simple burst-based haptic probe, `m5stack-sticks3-raw-i2s-probe` for direct duplicated-stereo `driver/i2s.h` output on GPIO `7/5/43`, `m5stack-sticks3-audio-smoke-pioarduino` to A/B the same smoke test on the community `pioarduino` ESP32 platform, `m5stack-sticks3-remote` for WiFi/WebSocket validation without the full audio path, or `m5stack-sticks3-tilt` for XL330 experiments.
3. Build and flash.
4. Open the serial monitor at `115200`.
5. Press **BtnA** click to cycle material families.
6. Press **BtnA** hold to cycle `OFF -> Front -> Back -> Top -> Bottom -> OFF` audio test routing.
7. Press **BtnB** click to toggle verbose telemetry.
8. Press **BtnB** hold to toggle runtime audio enable.
9. Use the serial monitor commands `status`, `cal ...`, `preset ...`, `record ...`, `replay ...`, `tilt ...`, `audio ...`, and `remote status` as needed.
10. `m5stack-sticks3-audio` now boots with single-amp bench defaults enabled: `front_back_2ch`, mono `48 kHz` demo-compat audio, and SoftAP monitoring enabled by default.
11. In SoftAP mode, open the browser status page from the printed AP URL or the default `http://192.168.4.1/`.
12. If a single external amp worked in an older demo, try `audio diag on` before deeper wiring changes. It forces the same mono `48 kHz` bus-A-only compatibility profile.
13. If you want to isolate the audio path from the full haptics pipeline, flash `m5stack-sticks3-audio-smoke`. It now boots into a conservative `burst` mode by default and accepts `mode tone|burst`, `tone 180`, `amp 0.45`, `burst 60`, `period 220`, and `sweep on` in the serial monitor when USB CDC is available.
14. If a pure tone is hard to feel on the transducer, flash `m5stack-sticks3-transducer-probe` and use `status`, `freq 180`, `level 0.45`, `burst 60`, `period 220`, or `sweep on`.
15. If `M5.Speaker`-based tests boot but still do not drive the amp, flash `m5stack-sticks3-raw-i2s-probe`. It bypasses `M5.Speaker`, writes directly to `I2S_NUM_0`, duplicates the same waveform into both left and right slots so mono amps such as MAX98357A cannot miss the active channel, and can switch between `external` pins `7/5/43` and the StickS3 `legacy` speaker pins `17/15/14`.
16. If the full main firmware is unstable, do not keep editing `m5stack-sticks3-audio` in place. Walk the probe ladder instead: `main-boot-probe -> main-pipeline-probe -> main-loop-probe -> main-audio-probe -> main-delta-probe`.

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
14. `docs/14_TILT_PSEUDOFORCE_SPEC_REV2.md`
15. `docs/15_ENVIRONMENT_BRINGUP_NOTES.md`
16. `docs/16_PROGRESS_STATUS.md`
17. `docs/17_PARAMETRIC_CONTAINER_HAPTICS_MODEL_SPEC.md`

## Notes for future open-source release

- The hardware folder is intentionally a placeholder for your KiCad, BOM, and mechanical design.
- A concrete license is **not selected yet**. See `LICENSE_TODO.md` before publishing.
