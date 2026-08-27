# 09 Operational Handoff

This document is a navigation and handoff policy. It is not a second roadmap.

## Required reading order

1. `AGENTS.md`
2. `docs/08_IMPLEMENTATION_PLAN.md`
3. `docs/16_PROGRESS_STATUS.md`
4. `docs/24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md`
5. `docs/23_ATOMS3_PRODUCTION_INTEGRATION.md`
6. the design and validation documents touched by the task

## Current handoff

The active blocker is powered Live stability. The existing AtomS3 image
responds to movement, but residual vibration did not stop after the device
became still. Safe Idle restored zero output. Continue with Gate 1 in document
08 and the exact procedure in document 24.

Do not start material tuning, mounted spatial tuning, production XL330
integration, or a new transport until that gate passes.

## Handoff requirements

For each meaningful change, report:

- what changed and which feature gate controls it
- which defaults remain unchanged
- deterministic tests and build environments run
- dated hardware evidence, clearly labeled probe or production
- current physical/software safe state after hardware work
- documents and schemas updated
- remaining blocker and exact next acceptance gate

## Non-negotiable boundaries

- preserve Mass -> Event -> Texture -> Resonance -> Spatial4
- keep `DriveFrame4` transport-independent
- keep four transducers on mid/high-frequency rendering
- keep XL330 actuation on the separate low-frequency branch
- do not format storage, enable production servo motion, or raise hardware
  limits without explicit authorization and a staged safety procedure
