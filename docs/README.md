# Documentation Index

This index is organized by authority and task, not by filename number.

## Canonical current documents

| Document | Authority |
|---|---|
| `../AGENTS.md` | Invariant architecture, safety rules, required development order, and Definition of Done |
| `08_IMPLEMENTATION_PLAN.md` | The only active roadmap and priority order |
| `16_PROGRESS_STATUS.md` | The only whole-repository factual status snapshot |
| `23_ATOMS3_PRODUCTION_INTEGRATION.md` | AtomS3 production acceptance contract and result matrix |
| `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md` | Exact runbook for the current powered-Live blocker |
| `07_TEST_AND_VALIDATION.md` | Cross-project acceptance criteria and validation matrix |
| `25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md` | Supporting execution plan for native tests, bench automation, and monitor-only wireless debugging; subordinate to document 08 |
| `19_DEVELOPMENT_SETUP.md` | Reproducible clone, build, host-test, WebXR, and CI setup for a new development machine |

When two documents appear to disagree, use `AGENTS.md` for invariants,
document 08 for order, document 16 for current facts, document 23 for AtomS3
acceptance, and document 24 for the next bench session. Then fix the stale
document rather than carrying both interpretations forward.

## Recommended reading paths

### Set up another development machine

1. `../AGENTS.md`
2. `19_DEVELOPMENT_SETUP.md`
3. `08_IMPLEMENTATION_PLAN.md`
4. `16_PROGRESS_STATUS.md`
5. `07_TEST_AND_VALIDATION.md`

### Continue the current AtomS3 work

1. `../AGENTS.md`
2. `08_IMPLEMENTATION_PLAN.md`
3. `16_PROGRESS_STATUS.md`
4. `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md`
5. `23_ATOMS3_PRODUCTION_INTEGRATION.md`
6. `25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md` when preparing
   host-side or wireless developer infrastructure
7. `26_ATOMS3_USB_TELEMETRY.md` when capturing canonical USB telemetry
8. relevant sections of `07_TEST_AND_VALIDATION.md`

### Improve testability or wireless diagnostics

1. `../AGENTS.md`
2. `08_IMPLEMENTATION_PLAN.md`
3. `25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md`
4. `05_INTERFACE_SPEC.md`
5. `07_TEST_AND_VALIDATION.md`
6. `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md` before any hardware-facing test

### Continue smartphone, Quest, or Haptic Link planning

1. `18_WEBXR_SMARTPHONE_DEMO.md`
2. `27_HAPTIC_LINK_DONGLE_CONCEPT.md`
3. `19_WEBUSB_QUEST_PROBE.md`
4. `05_INTERFACE_SPEC.md`
5. Gate 11 in `08_IMPLEMENTATION_PLAN.md`

### Change the pipeline or parameter model

1. `00_DESIGN_SPECIFICATION.md`
2. `01_FUNCTIONAL_REQUIREMENTS.md`
3. `02_SYSTEM_ARCHITECTURE.md`
4. `03_PIPELINE_SPEC.md`
5. `05_INTERFACE_SPEC.md`
6. `06_PARAMETER_MODEL.md`
7. `17_PARAMETRIC_CONTAINER_HAPTICS_MODEL_SPEC.md`
8. `07_TEST_AND_VALIDATION.md`

### Work on hardware or bring-up

1. `04_HARDWARE_AND_PIN_SPEC.md`
2. the relevant completed evidence or runbook below
3. `23_ATOMS3_PRODUCTION_INTEGRATION.md`
4. `07_TEST_AND_VALIDATION.md`

## Specifications

| Document | Role |
|---|---|
| `00_DESIGN_SPECIFICATION.md` | Product boundary and high-level design |
| `01_FUNCTIONAL_REQUIREMENTS.md` | Functional and safety requirements |
| `02_SYSTEM_ARCHITECTURE.md` | Component ownership and data flow |
| `03_PIPELINE_SPEC.md` | Four-layer rendering contract |
| `04_HARDWARE_AND_PIN_SPEC.md` | Current/legacy hardware and pin contracts |
| `05_INTERFACE_SPEC.md` | Serial, JSON, telemetry, and transport behavior |
| `06_PARAMETER_MODEL.md` | Runtime parameter and feature-flag model |
| `14_TILT_PSEUDOFORCE_SPEC_REV2.md` | Low-frequency pseudo-force model |
| `17_PARAMETRIC_CONTAINER_HAPTICS_MODEL_SPEC.md` | Detailed parametric rendering model |

## Validation evidence and runbooks

| Document | Status |
|---|---|
| `07_TEST_AND_VALIDATION.md` | Active global validation plan |
| `15_ENVIRONMENT_BRINGUP_NOTES.md` | Historical StickS3/single-amp evidence |
| `20_DXL2_BOARD_BRINGUP.md` | Completed AtomS3 DXL2 evidence |
| `21_MAX98357A_TDM_BRINGUP.md` | Completed raw TDM evidence |
| `22_ATOMS3_COMBINED_BRINGUP.md` | Completed bounded combined-probe evidence |
| `23_ATOMS3_PRODUCTION_INTEGRATION.md` | Active production acceptance contract |
| `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md` | Active next-session runbook |
| `25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md` | Active supporting workflow for test-first development and safe wireless observation |
| `26_ATOMS3_USB_TELEMETRY.md` | Software-prepared, runtime-gated USB telemetry and mixed-log evidence workflow |

Probe success is supporting evidence only; it does not imply the production
four-layer path passed.

## Client and transport work

| Document | Role |
|---|---|
| `18_WEBXR_SMARTPHONE_DEMO.md` | Phone/Quest visual demo scope |
| `19_WEBUSB_QUEST_PROBE.md` | WebUSB feasibility probe |
| `27_HAPTIC_LINK_DONGLE_CONCEPT.md` | Preferred Android/Quest USB-to-radio demo-link concept, synchronized profile controls, external VR events, and supporting WebUSB evidence |

## Contributor and historical context

| Document | Role |
|---|---|
| `09_CODEX_HANDOFF.md` | Short operational handoff/navigation policy; not a roadmap |
| `19_DEVELOPMENT_SETUP.md` | Reproducible development-machine bootstrap and validation commands |
| `10_REFERENCES.md` | External technical references |
| `11_CODEX_START_PROMPT.md` | Current concise agent-start prompt |
| `12_IMPLEMENTATION_WALKTHROUGH.md` | Implementation walkthrough; verify details against current code |
| `13_COLLABORATION_INPUT_CHECKLIST.md` | Input checklist for collaborative sessions |

The numbered filenames remain stable to preserve existing links. Status and
priority are expressed by the tables above rather than by number.
