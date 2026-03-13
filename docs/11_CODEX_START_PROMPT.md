# 11 Codex Start Prompt

Use the following prompt as the first Codex task after loading this repository:

```text
Read AGENTS.md and docs/README.md first.
Then inspect the current baseline implementation without changing architecture.
Your first task is to tighten bench-oriented validation and tuning while preserving the current build and documentation structure.

Constraints:
- additive changes only
- do not remove feature flags
- do not alter the four-layer model boundaries
- keep low-frequency pseudo-force out of the 4-transducer path
- use the existing dual-stereo I2S x2 backend, WebSocket path, and tilt-plane path rather than replacing them
- update docs/04_HARDWARE_AND_PIN_SPEC.md, docs/07_TEST_AND_VALIDATION.md, and docs/09_CODEX_HANDOFF.md if implementation details change
- preserve baseline env safety when optional backends are compiled out
- keep telemetry and schemas in sync with runtime state
```

Suggested second prompt:

```text
Validate and tune the current liquid/granular/hybrid presets on hardware.
Focus on wall localization, flow SOA tuning, calibration quality, and perceptual separation between event families.
Keep the shared four-layer model intact and do not break the recorder/replay or remote paths.
```

Suggested third prompt:

```text
Improve transport robustness and servo safety feedback without changing the canonical control schema.
Keep SoftAP + WebSocket as the primary transport, retain compile-gated servo support, and update docs/schemas if runtime status changes.
```
