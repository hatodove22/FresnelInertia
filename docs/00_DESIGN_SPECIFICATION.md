# 00 Design Specification

This is the top-level design specification for the **Parametric Container Haptics** project.
It is the authoritative summary document and should be read together with the numbered supporting documents in this folder.

## 1. Purpose

Create an on-device haptic generation system that can produce **diverse material/content sensations** from a shared architecture using:

- IMU sensing,
- a four-layer haptic model,
- four wall-aligned vibrotactile actuators,
- a separate low-frequency tilt-plane branch using two XL330-M077-T servos.

The design must support:
- liquids,
- granular shaker-like materials,
- sparse rigid inclusions,
- hybrid contents,
- future custom materials.

## 2. System concept

The system is decomposed into these layers:

1. **Mass Motion Layer**
2. **Event Layer**
3. **Texture Layer**
4. **Resonance Layer**
5. **Spatial Renderer (4 actuators)**
6. **Parallel low-frequency tilt-plane branch**

The four-layer model is the core abstraction and shall remain stable even as individual algorithms improve.

## 3. Hardware concept

### Primary as-built integration platform
- M5AtomS3
- custom `M5AtomS3_MAX98357A_4CH_TDM_DXL2` PCB
- MAX98357A x4 using one eight-slot TDM stream
- four wall-aligned vibrotactile transducers
- XL330-M077-T x2 on the board's automatic-half-duplex DYNAMIXEL path

The raw TDM transport, both XL330 units, and a bounded simultaneous IMU + servo
+ 4CH burst probe passed on hardware on `2026-08-22`. This is not yet a pass of
the live four-layer pipeline or the final mounted tilt mechanism.

### Current production integration slice
- `AudioOutput4Ch` contains an additive eight-slot TDM transport while retaining
  the legacy dual-I2S path.
- `m5stack-atoms3-pipeline` selects the as-built AtomS3 profile.
- it boots with the TDM driver carrying digital zero and haptic output disarmed
- its initial normalized PCM peak limit is `8%`, with a compile-time hard
  ceiling of `15%`
- its Atom-only 300 ms IMU stale safe-stop resets the pipeline to neutral and
  forces TDM zero on missing/non-finite sensor input
- the AtomS3 production target deliberately compiles the servo backend out;
  only the dedicated DXL2 and combined probes may move the servos at this stage

The final target including Safe Idle, always-present safety telemetry, and that
safe-stop built successfully on `2026-08-22` (RAM 12.4%, flash 17.0%). It was
then uploaded to the assembled AtomS3 board with S1 OFF and 12 V OFF. USB-only
  status confirmed a valid running IMU path, installed eight-slot TDM driver,
  digital zero, 8% effective limit, zero audio errors, and disabled tilt. Live
  four-channel routing then passed unloaded with 12 V and S1 ON: Front/CH1,
  Back/CH2, Top/CH3, and Bottom/CH4 each actuated alone. The first powered
  four-layer liquid run produced motion-driven output, but its settling check
  failed because residual vibration decayed without stopping. Safe Idle then
  restored verified zero output. Document 24 defines the corrective gate.

### Retained legacy development platform
- M5StickS3
- dual stereo-I2S / single-amplifier diagnostic paths
- the existing compile-gated DIR-pin XL330 backend

The legacy paths remain supported fallbacks. They are not the electrical
contract for the as-built AtomS3 PCB.

### Interface outlook
- USB serial monitoring is available now
- SoftAP / WebSocket monitoring exists on the legacy remote-enabled targets
- smartphone and HMD live integration remains a later documented transport task

## 4. Design philosophy

- **Shared pipeline first, material-specific tuning second**
- **Additive development**
- **Geometry-aware event scheduling**
- **Wall-aligned spatial rendering**
- **Low-frequency pseudo-force separated from mid/high-frequency texture**
- **Open-source ready repository structure**

## 5. Supporting documents

- `01_FUNCTIONAL_REQUIREMENTS.md`
- `02_SYSTEM_ARCHITECTURE.md`
- `03_PIPELINE_SPEC.md`
- `04_HARDWARE_AND_PIN_SPEC.md`
- `05_INTERFACE_SPEC.md`
- `06_PARAMETER_MODEL.md`
- `07_TEST_AND_VALIDATION.md`
- `08_IMPLEMENTATION_PLAN.md`
- `09_CODEX_HANDOFF.md`
- `10_REFERENCES.md`
- `11_CODEX_START_PROMPT.md`
- `12_IMPLEMENTATION_WALKTHROUGH.md`
- `13_COLLABORATION_INPUT_CHECKLIST.md`
- `14_TILT_PSEUDOFORCE_SPEC_REV2.md`
- `15_ENVIRONMENT_BRINGUP_NOTES.md`
- `16_PROGRESS_STATUS.md`
- `17_PARAMETRIC_CONTAINER_HAPTICS_MODEL_SPEC.md`
- `18_WEBXR_SMARTPHONE_DEMO.md`
- `19_WEBUSB_QUEST_PROBE.md`
- `20_DXL2_BOARD_BRINGUP.md`
- `21_MAX98357A_TDM_BRINGUP.md`
- `22_ATOMS3_COMBINED_BRINGUP.md`
- `23_ATOMS3_PRODUCTION_INTEGRATION.md`
- `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md`

## 6. Current repository state

The repository currently contains:
- a buildable PlatformIO scaffold,
- module boundaries for all major subsystems,
- a baseline end-to-end four-layer signal-generation implementation,
- interface and schema definitions,
- compile-gated audio, remote, recorder/replay, and tilt-plane backends,
- a build-verified AtomS3 production profile with eight-slot TDM output and the
  servo path intentionally compiled out,
- dated hardware bring-up records for the custom PCB.

It contains an initial powered live four-layer AtomS3 attempt, but not a passing
closed-loop settling result. It also does **not** yet contain the as-built
production DXL servo adapter, final mounted tuning, or published hardware
design assets.
