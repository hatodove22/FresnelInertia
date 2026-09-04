# Parametric Container Haptics

Firmware, validation tools, and design documentation for an on-device
container-content haptics system.

The shared rendering path is:

```text
IMU -> mass motion -> events -> texture -> resonance -> 4-wall spatial output
```

In the corrected AtomS3 profile, an optional gravity-separated activity filter
feeds Mass energy/agitation while raw quasi-static acceleration remains the
latent-position input. Generic profiles keep that filter OFF for legacy
equivalence.

The four transducers render mid/high-frequency wall events and texture. Two
XL330-M077-T servos are reserved for a separate low-frequency tilt/pseudo-force
path; they must not be used as a substitute for the four-layer renderer.

## Current hardware

The primary board is the assembled
`M5AtomS3_MAX98357A_4CH_TDM_DXL2` custom PCB:

- M5AtomS3
- four MAX98357A channels over one eight-slot TDM bus
- canonical slot map: Front, Back, Top, Bottom, then four zero slots
- two XL330 connections on the DXL2 section
- manual amplifier switch S1

The older M5StickS3 dual-I2S, remote-monitoring, and DATA+DIR servo targets are
retained as regression and diagnostic paths. They are not the production
electrical contract for the custom AtomS3 board.

## Current status

Evidence recorded on `2026-08-22`:

- AtomS3 production firmware built and uploaded successfully
- USB-only zero-data boot passed
- CH1 through CH4 isolation/order passed on unloaded hardware
- DXL IDs 1 and 2, torque-off read-back, bounded unloaded movement, and the
  combined IMU + servo + 4CH probe passed
- Safe Idle and explicit audio re-arm passed for the tested Live/channel slice
- the first powered four-layer liquid settling test failed: vibration decayed
  after one movement but did not stop while the device was held still
- Safe Idle after that failure restored `energy=0`, `audio=0`, `zero=1`, and
  `errors=0`

The remaining Gate 1 blocker is hardware confirmation of corrected closed-loop
Live stability, not TDM routing or initial board bring-up.

Software checkpoint on `2026-08-28` (not uploaded or powered):

- all 22 embedded PlatformIO environments build successfully
- the production-layer native suite passes `20/20`
- the passive host-lab cases pass `20/20` and its integration suite passes
  `8/8`
- schema validation accepts all 15 valid control/telemetry fixtures and rejects
  all 18 expected-invalid fixtures with their exact committed codes
- WebXR type checking and the production web build pass

These results prepare the next bench session; they do not replace the pending
powered acceptance run in document 24.

## Start here

Use these documents as the source of truth:

1. [AGENTS.md](AGENTS.md) — invariant architecture, safety rules, and required
   development order
2. [docs/19_DEVELOPMENT_SETUP.md](docs/19_DEVELOPMENT_SETUP.md) — clone,
   dependency, build, and validation setup for another development machine
3. [docs/08_IMPLEMENTATION_PLAN.md](docs/08_IMPLEMENTATION_PLAN.md) — the only
   active roadmap and priority list
4. [docs/16_PROGRESS_STATUS.md](docs/16_PROGRESS_STATUS.md) — factual repository
   status and dated evidence
5. [docs/23_ATOMS3_PRODUCTION_INTEGRATION.md](docs/23_ATOMS3_PRODUCTION_INTEGRATION.md)
   — AtomS3 acceptance contract
6. [docs/24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md](docs/24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md)
   — exact restart procedure for the current blocker
7. [docs/25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md](docs/25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md)
   — test-first workflow, bench automation, and safe monitor-only wireless plan

The full role-based documentation index is in [docs/README.md](docs/README.md).

## Active milestone

Before any material tuning, spatial tuning, servo integration, or new
transport work:

1. strengthen schema validation, add the native deterministic harness, and
   capture the feature-disabled legacy fingerprint
2. add a default-off gravity-separated mass-activity path
3. enable it only in the AtomS3 production profile
4. keep quasi-static gravity in the latent position/tilt path
5. expose current-frame event count as `new_evt` in serial status
6. pass the deterministic orientation, motion, alias, invalid-input, and
   pulse-to-silence checks
7. repeat the 8% powered settling test from document 24

Steps 1 through 6 are implemented in software: the pinned `native-layers`
suite has 20 passing production-layer tests and an
unchanged reviewed legacy fingerprint, while schema checks include eighteen
expected-invalid fixtures. The Gate 1 activity path is generic-default OFF and
as-built-AtomS3-profile ON, with 1 Hz gravity / 10 Hz motion filters and
`0.025 g` / `1.5 deg/s` radial deadbands. Canonical serial, Recorder, and
Remote telemetry always carry `frame_counter`, `new_evt`, and boot-cumulative
`evt_total`; optional pipeline debug mirrors `new_evt`.

The finite-posture test settles to `energy<=0.02` within two seconds and then
produces no new event for 30 seconds. The corrected image has not been uploaded
or powered; the next operator-dependent step is the powered retest in document
24.

The milestone passes only when static six-orientation tests generate no new
events or perceived vibration, and one deliberate movement settles to tactile
silence within the documented limit.

In parallel, document 25 permits host-side deterministic tests, stricter
schema/protocol checks, log tooling, and preparation of a separate
monitor-only AtomS3 wireless environment. The normal production environment
remains remote compile-disabled, and wireless control/OTA do not bypass this
milestone.

The passive host lab tool is ready for the next session:

```text
node tools/lab/lab.mjs self-test
node tools/lab/lab.mjs validate --plan tools/lab/plans/gate1-static.template.json
node tools/lab/lab.mjs check --plan RUN-PLAN.json --telemetry TELEMETRY.ndjson --out NEW-EVIDENCE-DIRECTORY
```

It evaluates static, S1-OFF control, and pulse-to-silence runs from canonical
telemetry and writes hashed JSON/Markdown evidence without connecting to or
controlling the device. Hardware plans remain failed with
`RUN_METADATA_INCOMPLETE` until their identity, bench conditions,
authorization, structured tactile outcome, final Safe Idle observation, and
evidence-completion fields are filled truthfully. A completed plan also fails
unless it uses the fixed as-built AtomS3 profile and `liquid_small_box`
active/S1-ON or pulse-only S1-OFF-control variant, first-frame/monotonic timing, exactly one canonical
sequence check and one unmodified measurement check, plus clean structured
before/after USB producer-status snapshots. It fails if canonical frames from
first-frame origin through the active check end do not match the fixed Atom
production Gate 1 context or carry valid IMU: Live,
compiled/installed/runtime audio, TDM8, 4CH, 8% limit, non-silenced output, and
disabled channel-test/demo modes. It also fails if audio/I2S errors grow, if required
non-stale/non-injected safety state is absent, if the final canonical frame does not prove Safe Idle,
or if the operator outcome is `fail`. See
[tools/lab/README.md](tools/lab/README.md).

## Primary PlatformIO environments

| Environment | Purpose |
|---|---|
| `m5stack-atoms3-pipeline` | Primary AtomS3 production haptic firmware |
| `m5stack-atoms3-max98357a-tdm-probe` | Bounded raw TDM/channel probe |
| `m5stack-atoms3-dxl2-probe` | Torque-off DXL communication/status probe |
| `m5stack-atoms3-dxl2-provision-id2` | One-device ID 1 to ID 2 provisioner |
| `m5stack-atoms3-dxl2-motion-probe` | Explicit bounded unloaded servo probe |
| `m5stack-atoms3-combined-probe` | Bounded IMU + XL330x2 + equal-4CH probe |
| `m5stack-sticks3` | Legacy feature-off baseline regression build |
| `m5stack-sticks3-audio` | Legacy audio/remote regression build |
| `m5stack-sticks3-tilt` | Legacy DATA+DIR servo regression build |

Other StickS3 smoke/display/main-ladder environments are retained for
historical fault isolation. Their roles are documented in
[docs/07_TEST_AND_VALIDATION.md](docs/07_TEST_AND_VALIDATION.md).

## Validation

Use the repository's PlatformIO workflow for firmware builds. The required
pre-handoff matrix is defined in the active roadmap and includes the AtomS3
production image, the three retained StickS3 paths, and the three AtomS3 probe
paths.

Protocol-facing changes:

```powershell
node test/schema/validate_schemas.mjs
```

Run the complete embedded compile matrix with:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build_firmware_matrix.ps1
```

The script builds 21 environments with the normal PlatformIO package store and
the pinned pioarduino/Arduino 3.3.7 smoke environment with a separate short
user cache. This avoids both cross-platform package-name collisions and the
Windows first-install path-length failure; it performs compilation only.

WebXR/WebUSB changes:

```powershell
cd webxr
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
```

Hardware upload and serial work must follow the staged S1/12 V procedures in
documents 20 through 24. No production target arms audio or servos merely by
entering Live mode.

## Repository layout

```text
parametric-container-haptics/
|-- AGENTS.md
|-- README.md
|-- platformio.ini
|-- include/haptics/       Public firmware interfaces and parameters
|-- src/                   Pipeline, backends, and bounded probe entry points
|-- docs/                  Specifications, roadmap, evidence, and runbooks
|-- presets/               Material preset JSON
|-- schemas/               Control and telemetry schemas
|-- test/                  Native regressions, schema checks, and passive host-lab fixtures
|-- webxr/                 Phone/Quest visual client and WebUSB probe
`-- hardware/              Hardware publication contract and future exports
```

## Development rules

- Preserve the four-layer architecture and canonical `DriveFrame4` contract.
- Keep new behavior behind safe compile-time and/or runtime gates.
- Generic defaults must preserve the existing baseline.
- Update relevant documentation and acceptance criteria with every feature.
- Do not promote probe evidence to a production-pipeline hardware pass.
- Do not format LittleFS or enable AtomS3 production servo motion without an
  explicit recovery/safety decision.

Hardware design assets and a final open-source license are not yet published.
See [hardware/README.md](hardware/README.md) and [LICENSE_TODO.md](LICENSE_TODO.md).
