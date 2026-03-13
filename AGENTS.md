# AGENTS.md

This file is intended for future automated contributors, including Codex.

## Primary goal

Implement an **on-device 4-layer haptic pipeline** for container-content rendering:

1. mass motion layer
2. event layer
3. texture layer
4. resonance layer
5. spatial rendering onto 4 transducers

A future parallel channel will drive **two XL330-M077-T servos** for thumb/index single-axis tilt-plane actuation.

## Non-negotiable rules

1. **Do not break the baseline build.**
2. **Do not silently rewrite the architecture.**
3. **Do not replace additive changes with broad refactors** unless explicitly required.
4. **Default behavior must stay stable** when a new feature is introduced.
5. Every implementation change must update relevant documentation in `docs/`.

## Feature gating policy

Every new subsystem must be behind both:

- a compile-time feature flag, and/or
- a runtime parameter flag

with defaults that preserve the current baseline.

## Required development order

1. Audio backend abstraction
2. Actuator sweep and resonance identification
3. Mass motion layer refinement
4. Event layer: wall-hit only
5. Event layer: shaker families
6. Event layer: liquid families
7. Texture layer atoms
8. 4-transducer spatial rendering
9. Telemetry / recorder / replay
10. XL330 tilt-plane integration
11. Smartphone / HMD transports

## Invariants to preserve

- The 4-transducer path is for **mid/high-frequency texture and wall events**.
- Future tilt-plane servos are for **low-frequency pseudo-force augmentation**.
- Material families must share the same 4-layer pipeline.
- Container geometry must constrain travel time, collision density, and wall-contact frequency.

## Files to update when adding a feature

At minimum:

- one or more files in `src/`
- one or more headers in `include/haptics/`
- relevant design docs in `docs/`
- optionally presets in `presets/`
- if protocol changes: update `schemas/`

## Definition of done

A task is not done unless:

- the build still passes,
- the architecture is still consistent with the docs,
- feature flags have safe defaults,
- telemetry output is updated if the state model changed,
- acceptance criteria in `docs/07_TEST_AND_VALIDATION.md` are addressed.
