# Parametric Container Haptics

Firmware, validation tools, and design documentation for an on-device
container-content haptics system.

The shared rendering path is:

```text
IMU -> mass motion -> events -> texture -> resonance -> 4-wall spatial output
```

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

The active engineering blocker is therefore closed-loop Live stability, not
TDM routing or initial board bring-up.

## Start here

Use these documents as the source of truth:

1. [AGENTS.md](AGENTS.md) — invariant architecture, safety rules, and required
   development order
2. [docs/08_IMPLEMENTATION_PLAN.md](docs/08_IMPLEMENTATION_PLAN.md) — the only
   active roadmap and priority list
3. [docs/16_PROGRESS_STATUS.md](docs/16_PROGRESS_STATUS.md) — factual repository
   status and dated evidence
4. [docs/23_ATOMS3_PRODUCTION_INTEGRATION.md](docs/23_ATOMS3_PRODUCTION_INTEGRATION.md)
   — AtomS3 acceptance contract
5. [docs/24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md](docs/24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md)
   — exact restart procedure for the current blocker

The full role-based documentation index is in [docs/README.md](docs/README.md).

## Active milestone

Before any material tuning, spatial tuning, servo integration, or new
transport work:

1. add a default-off gravity-separated mass-activity path
2. enable it only in the AtomS3 production profile
3. keep quasi-static gravity in the latent position/tilt path
4. expose current-frame event count as `new_evt` in serial status
5. add deterministic constant-gravity and pulse-response checks
6. repeat the 8% powered settling test from document 24

The milestone passes only when static six-orientation tests generate no new
events or perceived vibration, and one deliberate movement settles to tactile
silence within the documented limit.

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
|-- test/                  Schema checks and future deterministic harnesses
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
