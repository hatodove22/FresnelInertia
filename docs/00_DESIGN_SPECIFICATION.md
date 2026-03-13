# 00 Design Specification

This is the top-level design specification for the **Parametric Container Haptics** project.
It is the authoritative summary document and should be read together with the numbered supporting documents in this folder.

## 1. Purpose

Create an on-device haptic generation system that can produce **diverse material/content sensations** from a shared architecture using:

- IMU sensing,
- a four-layer haptic model,
- four wall-aligned vibrotactile actuators,
- future low-frequency tilt-plane augmentation using two XL330-M077-T servos.

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
6. **Future low-frequency tilt-plane branch**

The four-layer model is the core abstraction and shall remain stable even as individual algorithms improve.

## 3. Hardware concept

### Development platform
- M5StickS3
- MAX98360A x4
- haptic reactor successor x4

### Future low-frequency augmentation
- XL330-M077-T x2

### Interface outlook
- serial debug now
- smartphone and HMD links later through documented control/telemetry protocols

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

## 6. Current repository state

The repository currently contains:
- a buildable PlatformIO scaffold,
- module boundaries for all major subsystems,
- a baseline end-to-end four-layer signal-generation implementation,
- interface and schema definitions,
- compile-gated audio, remote, recorder/replay, and tilt-plane backends.

It does **not** yet contain final bench-validated tuning or the published hardware assets.
