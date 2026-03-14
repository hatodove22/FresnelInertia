# 09 Codex Handoff

This document is the operational handoff guide for Codex-based development.

## 1. Read this first

Before changing code, read in order:

1. `AGENTS.md`
2. `docs/01_FUNCTIONAL_REQUIREMENTS.md`
3. `docs/02_SYSTEM_ARCHITECTURE.md`
4. `docs/03_PIPELINE_SPEC.md`
5. `docs/04_HARDWARE_AND_PIN_SPEC.md`
6. `docs/06_PARAMETER_MODEL.md`
7. `docs/07_TEST_AND_VALIDATION.md`
8. `docs/15_ENVIRONMENT_BRINGUP_NOTES.md`

## 2. Status and next tickets

### Ticket A status
`AudioOutput4Ch` is now implemented as a compile-gated stereo I2S x2 backend on ESP32-S3.
- safe defaults remain off in the baseline env
- channel test mode exists for Front / Back / Top / Bottom isolation
- runtime enable and backend status are reflected in telemetry
- runtime output layout can now switch between `quad_wall_4ch` and `front_back_2ch`

### Next active ticket
Stabilize the main monitoring workflow around USB serial + SoftAP browser status, then return to hardware tuning: audio routing, NVS calibration restore, liquid/granular separation, remote telemetry, and servo safety.

### Bring-up caution
When audio or display behavior differs from a known-good bench setup, check
`docs/15_ENVIRONMENT_BRINGUP_NOTES.md` before assuming a pipeline regression.
The recent bench session found several environment-sensitive issues in board
detection, serial monitor behavior, storage state, and Windows build cleanup.

### Ticket B
Actuator sweep and low/high carrier storage are now implemented in firmware.
- per channel
- serial/telemetry reporting exists via `cal start`, `cal stop`, `cal status`
- current response metric uses the IMU as a coarse proxy with a settle/measure ratio
- NVS restore/save is in place
- next step is validating the sweep on hardware and tightening the identification method if needed

### Ticket C status
The placeholder wall-hit behavior has been replaced with a geometry-aware baseline.
- mass dynamics now react to container span, fill/headspace, and material family
- `wall_hit` uses wall-zone entry plus wall-direction velocity and a size-dependent cooldown
- next step is validating wall localization on hardware

### Rendering status
The shared four-layer path now has a full baseline implementation.
- texture atoms are stateful
- resonance output is per-voice rather than wall-summed
- spatial rendering applies SOA-aware delayed flow to neighbors
- next step is tuning, not replacing, the architecture

### Monitoring policy
- The main firmware should be monitored through USB serial and the SoftAP browser page.
- Do not add new on-device display UX to the main runtime path.
- Keep any remaining display work isolated to probe envs only.

### Ticket C
Replace the placeholder wall-hit behavior with geometry-aware event scheduling.
- use container size in travel-time limiting
- keep the same public interfaces if possible

### Ticket D
Granular shaker-family baseline is now in place.
- `roll_train` uses a rate accumulator instead of a per-frame placeholder
- `impact_cluster` density depends on geometry, particle properties, and rolling activity
- granular starter presets exist for coin / sand / bead

### Ticket E
Remote, recorder/replay, and tilt baselines are now implemented.
- `m5stack-sticks3-remote` exposes SoftAP + WebSocket JSON control/telemetry
- recorder writes NDJSON to LittleFS and replay injects IMU samples back through the shared pipeline
- `m5stack-sticks3-tilt` exposes a compile-gated raw XL330 control path

## 3. Coding constraints

- Prefer additive `.cpp` changes over broad file moves.
- Keep public structures stable unless docs are updated.
- Avoid introducing transport dependencies until the canonical schema is respected.
- Do not add new main-firmware display/UI work; lightweight browser monitoring is acceptable because it directly supports on-device haptic tuning.

## 4. What not to do

- Do not collapse the four-layer model into a monolithic “generateWaveform()” function.
- Do not send low-frequency force content through the 4-transducer renderer as a substitute for the future tilt-plane channel.
- Do not hard-code a liquid-only path that bypasses the shared event layer.

## 5. Deliverables expected from Codex for each meaningful milestone

- code changes
- updated documentation
- example preset changes if relevant
- test or validation notes
- telemetry fields if the state model changed
