# Contributing

## Read before changing code

1. `AGENTS.md` for invariant architecture and safety rules
2. `docs/08_IMPLEMENTATION_PLAN.md` for the active gate
3. `docs/16_PROGRESS_STATUS.md` for current facts
4. the relevant design and validation documents

Do not treat `docs/09_CODEX_HANDOFF.md` or a probe result as a second roadmap.

## Expectations

- preserve the baseline build and four-layer architecture
- keep new behavior behind safe compile-time and/or runtime gates
- preserve generic default behavior unless explicitly authorized
- update `docs/` whenever behavior, interfaces, status, or hardware evidence
  changes
- keep schemas and telemetry synchronized
- distinguish source implementation, probe hardware pass, and production
  hardware pass
- leave hardware in a documented safe state after bench work

## Required validation

Run the affected checks plus the common matrix in document 08. The standard
firmware matrix is:

- `m5stack-atoms3-pipeline`
- `m5stack-sticks3`
- `m5stack-sticks3-audio`
- `m5stack-sticks3-tilt`
- `m5stack-atoms3-dxl2-probe`
- `m5stack-atoms3-max98357a-tdm-probe`
- `m5stack-atoms3-combined-probe`

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

Use the documented PlatformIO/device workflow on Windows. Do not bypass staged
S1/12 V procedures for upload or output tests.

## Review checklist

- build/test evidence is recorded
- `git diff --check` passes
- no generated output, credential, or local IDE state is tracked
- feature flags have safe defaults
- failure paths report truthful state and assert silence/disarm as required
- docs state what was and was not tested on hardware
- no unrelated architecture refactor is mixed into the change
