# 08 Implementation Plan

## 1. Authority and current gate

This is the repository's only active roadmap. `AGENTS.md` defines the invariant
development order and safety rules; `16_PROGRESS_STATUS.md` records facts;
`23_ATOMS3_PRODUCTION_INTEGRATION.md` defines AtomS3 acceptance; and
`24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md` is the current execution runbook.
`25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md` defines how host tests,
bench automation, and a future observation-only wireless build support this
roadmap without changing its gate order.

Status reviewed on `2026-08-27`:

- audio/TDM transport and bounded board probes are implemented and passed
- the AtomS3 production image was uploaded and four-wall channel routing passed
- the first powered liquid Live settling check failed because vibration decayed
  but did not stop after the device became still
- Safe Idle after the failure restored verified digital zero
- no material, spatial, servo, or transport expansion may bypass this blocker

## 2. Gate 1 — Close powered Live stability and safety

This is the only active implementation milestone.

The mass-motion code already exists and currently blocks safe use of the
already implemented resonance-identification baseline. This gate corrects
that baseline safety defect; it is not new Gate 3 mass-feature work moved
ahead of the `AGENTS.md` order.

### 2.1 Implement

1. Add a runtime feature flag such as
   `features.enable_gravity_separated_mass_activity`, default `false`.
2. Enable it explicitly only in the AtomS3 production hardware profile.
3. Keep quasi-static gravity in latent mass position and tilt/pseudo-force
   inputs.
4. For mass energy and agitation only, subtract a low-pass gravity estimate,
   band-limit the resulting hand-motion signal, and apply acceleration/gyro
   deadbands.
5. Preserve the generic/legacy path while the feature is disabled.
6. Expose existing current-frame `pipeline_debug.event_count` as `new_evt` in
   serial verbose/status output. Do not infer repeated firing from latched
   `last_event`.
7. Do not hide the symptom by raising liquid thresholds or reducing output
   gain as the first fix.

### 2.2 Add deterministic checks

- constant `(1,0,0) g`, zero gyro: energy settles below `0.02` while latent
  position retains the gravity direction
- constant `(0,0,1) g`, zero gyro: energy settles below `0.02`
- one bounded acceleration pulse: energy rises, then returns below `0.02`
- high-frequency/carrier-alias input is strongly attenuated relative to
  1–8 Hz hand motion
- feature disabled: retained baseline behavior

The repository currently has schema checks but no deterministic mass-motion
harness; adding the smallest maintainable host-side harness is part of Gate 1.

### 2.3 Powered acceptance

Follow document 24 exactly. The minimum pass is:

- static 30-second test in all six principal orientations: `new_evt=0`, no
  perceived vibration, `energy<0.02` after settling, and no I2S error growth
- one deliberate movement: perceptible response, tactile silence within two
  seconds, then no new event for 30 seconds
- S1 OFF/ON comparison shows no ON-only self-sustaining activity
- 300 ms IMU stale safe-stop and neutral recovery pass
- Safe Idle passes from Live, Calibration, Record, Replay, and AtomS3 BtnA hold
- Live remains muted until a fresh explicit `audio on`
- muted-only transport/layout/demo guards and the 15% hard clamp pass
- repeated 8% arm/disarm and the agreed soak complete without reset, feedback,
  rail anomaly, heating, or error growth

### 2.4 Parallel developer-infrastructure lane

The following work may proceed while Gate 1 is active because it reduces
bench-only iteration without claiming progress through a later functional
gate:

- add a native deterministic layer harness and capture the feature-disabled
  legacy fingerprint before changing the activity estimator
- strengthen schema checks with invalid fixtures and support for schema
  keywords already used by the repository
- define the minimum diagnostic contract: current-frame `new_evt`, monotonic
  frame sequence, build/profile identity, IMU age, loop timing, and bounded
  transport/drop counters
- extract the existing JSON codec and remote command policy into host-testable
  modules
- build a host-side NDJSON capture, assertion, manifest, and report workflow
- prepare a separate AtomS3 monitor-only SoftAP environment after its command
  policy has tests

This lane must follow document 25. It may not enable remote audio/tilt arm,
remote Live or calibration start, product smartphone/HMD control, or OTA while
Gate 1 remains open. The normal AtomS3 production environment stays remote
compile-disabled. Wireless OFF/ON powered comparison occurs only after the USB
Gate 1 procedure passes.

## 3. Gate 2 — Mounted actuator and resonance identification

Start only after Gate 1 passes.

- measure per-wall amplitude, crosstalk, and low/high response on the mounted
  transducer stack
- repeat each sweep at least three times and require selected bins within one
  configured step
- verify NVS store and reboot restore
- improve the current IMU-proxy metric only from measured evidence
- record firmware/build identity, hardware orientation, output limit, fixture,
  and calibration result

## 4. Gates 3 through 8 — Close the shared renderer in AGENTS order

Each gate must pass before the next begins.

| Gate | Area | Required closure |
|---:|---|---|
| 3 | Mass motion | Static orientation, pulse response, geometry ordering, and no powered feedback |
| 4 | Wall-hit | One approach produces one plausible wall event with correct wall identity |
| 5 | Shaker families | Roll/cluster/scrape statistics and perception are distinct on hardware |
| 6 | Liquid/hybrid | No hum/self-run; liquid, hybrid, and granular outputs are distinguishable |
| 7 | Texture atoms | Measured envelopes match intent; add no atom without a demonstrated gap |
| 8 | Four-wall spatial rendering | Mounted localization, adjacent-wall SOA direction, and crosstalk pass |

Geometry must continue to constrain travel, collision density, and wall-contact
frequency for every material family.

## 5. Gate 9 — Reproducibility, recorder, and storage

- automatically record firmware/build/profile identity, preset source/path,
  resolved parameters, calibration identity, and effective output limit
- add deterministic recorder/replay comparison metrics
- validate every active mode's Safe Idle transition
- decide how to recover or replace the corrupted LittleFS state; formatting
  requires explicit approval and a data-recovery decision
- improve file management without making storage a boot/output dependency

## 6. Gate 10 — AtomS3 XL330 production path

Start only after the haptic-only path is stable.

- implement the GPIO1 TX / GPIO2 RX automatic-half-duplex production adapter
- read back model, ID, operating mode, torque, position, current, voltage,
  temperature, and hardware error
- add watchdog, fault latch, boot torque-off, bounded commands, and truthful
  telemetry
- calibrate home, sign, direction, and mounted mechanical stops
- repeat the combined safety matrix before enabling tilt perception tests

The servo branch remains low-frequency augmentation; it does not enter the
four-transducer texture path.

## 7. Gate 11 — Live smartphone/HMD integration

- first connect the existing schema-shaped WebSocket control/telemetry path to
  the stabilized device
- close phone/Quest reconnect and long-session robustness
- add BLE, UDP, or OSC only for a concrete experiment requirement
- keep the WebUSB page a feasibility probe until repeated Quest sessions pass

## 8. Release hygiene

Release work is separate from the functional gate order:

- publish authoritative EasyEDA Pro exports, BOM, fabrication, and mechanical
  assets under `hardware/`
- select and document software/hardware licenses
- add CI after the local validation commands and matrix are stable
- prepare public assembly, safety, and revision documentation

## 9. Common Definition of Done

Every implementation milestone requires:

- relevant deterministic checks
- all native layer/protocol tests once their environments exist
- successful builds for `m5stack-atoms3-pipeline`, `m5stack-sticks3`,
  `m5stack-sticks3-audio`, `m5stack-sticks3-tilt`,
  `m5stack-atoms3-dxl2-probe`,
  `m5stack-atoms3-max98357a-tdm-probe`, and
  `m5stack-atoms3-combined-probe`
- schema samples passing when protocol/state changes
- expected-invalid schema/protocol fixtures being rejected when those suites
  are affected
- WebXR typecheck/build passing when client code changes
- generic defaults preserving prior behavior
- dated hardware evidence for hardware-facing claims
- relevant updates to design docs and `07_TEST_AND_VALIDATION.md`
- `git diff --check` and a clean, intentional working tree

## 10. Risk register

| Risk | Current control |
|---|---|
| Output feeds back into IMU | Gate 1 gravity separation, motion band limit, deadband, and powered settling test |
| A threshold tweak hides instability | Gate 1 forbids material tuning before signal-path correction |
| Probe success is mistaken for production success | Evidence labels and separate documents 20–24 |
| Host tests duplicate firmware behavior | Native tests call the production layer/filter code and keep a reviewed legacy fingerprint |
| Wireless monitoring changes timing or power conditions | Separate environment, low-rate bounded telemetry, and post-Gate-1 OFF/ON comparison |
| A remote client arms an output | Monitor-only policy first; normal AtomS3 production remains remote compile-disabled |
| OTA removes the recovery path | OTA is deferred to a maintenance-only, local-consent, authenticated, rollback-capable slice with USB recovery retained |
| Servo integration expands risk too early | Production servo backend remains compiled out until Gate 10 |
| Storage corruption blocks boot | Built-in fallback remains; no format without approval |
| Documentation drifts | Authority is fixed to AGENTS, 08, 16, 23, and 24; document 25 is the subordinate developer-workflow plan |
