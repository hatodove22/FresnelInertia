# Collaboration Input Checklist

## Purpose

When asking Codex to review, debug, or extend this repository, the fastest path is to provide the information below up front. This avoids spending cycles rediscovering hardware state, runtime mode, or test conditions.

## Minimum information to share

### 1. Goal

- What you want changed
- What "done" means
- What must not change

Example:

- "Keep baseline build green."
- "Do not change button mappings."
- "I only care about the remote path in this task."

### 2. Code state

- Branch name, commit hash, or the exact local snapshot being reviewed
- Whether there are uncommitted local edits
- Which files you already touched manually

If the workspace is not a git repo, say that explicitly.

### 3. Build target

- Active PlatformIO environment
- Whether compile-time flags were changed
- Whether the issue appears in:
  - baseline
  - audio
  - remote
  - tilt
  - all envs

### 4. Hardware configuration

- Board revision
- Power path in use
- Transducer wiring by wall
- Amplifier model and channel mapping
- Servo model and IDs if tilt is involved
- Whether remote testing is via SoftAP or another network setup

### 5. Reproduction steps

- Exact buttons pressed
- Exact console commands used
- Exact remote messages sent
- Whether the failure happens at boot, during runtime, or after mode switching

### 6. Observed behavior

- What actually happened
- What you expected instead
- Whether the issue is deterministic or intermittent

### 7. Evidence

Share raw artifacts whenever possible:

- serial log
- PlatformIO build output
- telemetry JSON sample
- recorded NDJSON file
- preset JSON file
- photos or a short video for hardware behaviors

### 8. Safety constraints

Especially important for audio and tilt work:

- maximum safe drive level
- current limit to respect
- angles that must never be exceeded
- wiring or power conditions that are experimental

### 9. Validation status

- What you already tested
- What still has not been tested on hardware
- Whether bench validation is blocked by missing parts, time, or risk

## Task-specific add-ons

### If the task is about audio

- Which wall should fire
- What actually fired
- Whether channel test mode reproduces the problem
- Sample rate and DMA settings in use

### If the task is about calibration

- Whether saved carriers already exist in NVS
- Result of `cal status`
- Whether the result changed after cold boot

### If the task is about presets

- Preset name
- Built-in or filesystem override
- The JSON file contents if overridden

### If the task is about recorder or replay

- File path used
- Approximate record length
- Whether replay timing drift or event mismatch was observed

### If the task is about tilt

- Servo IDs
- Home angles
- Current limit
- Whether torque should stay on or turn off when disabling

### If the task is about remote control

- WebSocket client type
- Exact JSON message sent
- Whether the socket completed handshake
- Whether telemetry push was received

## Copy-paste template

```md
## Goal
- 

## Constraints
- 

## Code State
- Branch/commit:
- Local uncommitted edits:
- Workspace is git repo: yes/no

## PlatformIO Env
- 

## Hardware
- Board:
- Power:
- Audio wiring:
- Servo wiring:
- Network mode:

## Reproduction
1. 
2. 
3. 

## Observed
- 

## Expected
- 

## Evidence
- Serial log:
- Build output:
- Telemetry / NDJSON:
- Photos / video:

## Tested Already
- 

## Not Yet Tested
- 
```
