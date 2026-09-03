# 19 Development Setup

This document defines the reproducible development environment for FresnelInertia.

## 1. Prerequisites

Install:

- Git
- VS Code
- PlatformIO IDE extension, or PlatformIO Core (`pio`)
- Python 3.11+ for PlatformIO Core
- Node.js 22 LTS for the nested `webxr/` project

Recommended hardware-side tools:

- M5StickS3
- MAX98357A/MAX98360A-compatible I2S amplifier path
- XL330-M077-T servos for the tilt branch
- USB data cable with stable power

## 2. Clone

```bash
git clone https://github.com/hatodove22/FresnelInertia.git
cd FresnelInertia
```

No machine-specific library paths should be required. PlatformIO resolves firmware dependencies from `platformio.ini`.

## 3. Firmware bootstrap

Check PlatformIO:

```bash
pio --version
```

Build the baseline first:

```bash
pio run -e m5stack-sticks3
```

Then build the main feature variants:

```bash
pio run -e m5stack-sticks3-audio
pio run -e m5stack-sticks3-remote
pio run -e m5stack-sticks3-tilt
```

Probe environments useful during hardware bring-up:

```bash
pio run -e m5stack-sticks3-transducer-probe
pio run -e m5stack-sticks3-raw-i2s-probe
```

For upload and serial monitoring, select the actual serial port for your machine. The repository must not contain hard-coded COM ports or user-specific filesystem paths.

## 4. WebXR bootstrap

```bash
cd webxr
npm ci
npm run typecheck
npm run build
npm run dev
```

`npm ci` is preferred over `npm install` for reproducible dependency resolution because `package-lock.json` is committed.

On Windows, `npm.cmd` may be used instead of `npm` if PowerShell execution behavior requires it.

## 5. Validation before a pull request

At minimum, run the affected environments. For cross-cutting changes, use the CI baseline:

```bash
pio run -e m5stack-sticks3
pio run -e m5stack-sticks3-audio
pio run -e m5stack-sticks3-remote
pio run -e m5stack-sticks3-tilt
pio run -e m5stack-sticks3-transducer-probe
pio run -e m5stack-sticks3-raw-i2s-probe
cd webxr
npm ci
npm run typecheck
npm run build
```

Hardware validation is separate from compile validation. Record what physical hardware was tested and what remains unverified.

## 6. Development workflow

1. Read `AGENTS.md` and the architecture/specification documents relevant to the change.
2. Create a focused branch.
3. Keep additions behind safe compile-time and/or runtime gates when appropriate.
4. Preserve `DriveFrame4`, wall semantics, preset compatibility, and the shared 4-layer pipeline unless a deliberate architecture change is being reviewed.
5. Update documentation together with behavior or interface changes.
6. Let GitHub Actions validate the portable baseline.
7. Record bench-validation results in the PR and, when useful, in `docs/15_ENVIRONMENT_BRINGUP_NOTES.md`.

## 7. Current recommended development priorities

The current source-of-truth status is `docs/16_PROGRESS_STATUS.md`. The near-term engineering priorities are:

- additive single-port TDM audio backend while preserving dual-I2S fallback
- four-wall localization and material-family bench validation
- stronger resonance-identification metric and storage robustness
- XL330 sign/safety/perceptual validation
- live XR/device communication beyond the current standalone visual WebXR demo
- automated replay/regression tests in `test/`

## 8. CI contract

`.github/workflows/ci.yml` verifies:

- baseline firmware
- audio firmware
- remote firmware
- tilt firmware
- transducer probe
- raw I2S probe
- WebXR TypeScript typecheck
- WebXR production build

A CI pass means the checked software configurations compile/build cleanly. It does not imply tactile quality, hardware safety, WebXR behavior on Quest, or physical actuator correctness.
