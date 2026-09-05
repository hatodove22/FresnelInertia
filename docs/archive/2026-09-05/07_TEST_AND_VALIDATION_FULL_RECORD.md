# 07 Test and Validation Plan

## 1. No-hardware verification

These checks are compile-only / host-only. They do not prove actuator routing,
IMU behavior, WiFi range, flash persistence, or perceptual quality.

### Schema samples

- run `node test/schema/validate_schemas.mjs` from the repository root
- verify `test/schema/control_messages.valid.jsonl` still covers every
  `type` enum in `schemas/control_message.schema.json`
- verify `test/schema/telemetry_frames.valid.jsonl` still matches
  `schemas/telemetry_frame.schema.json`
- require every telemetry sample to include top-level `frame_counter`,
  `new_evt`, `evt_total`, and `safety` even when `pipeline_debug` is omitted;
  samples containing audio must also include `audio.output_silenced`
- note that `test/schema/validate_schemas.mjs` is intentionally small and only
  covers this subset today:
  `type`, `required`, `enum`, `properties`, `items`, `additionalProperties`,
  `minimum`, `maximum`, `minItems`, and `maxItems`
- the local validator enforces `maximum` and checks committed expected-invalid
  fixtures for required fields, unknown properties, enums, actuator count,
  numeric lower bounds, peak-limit overflow, a missing diagnostic counter,
  negative `evt_total`, and `new_evt > 16`
- the valid counter-boundary sample must accept both boot counters at
  `9007199254740991` and `new_evt=16`; another valid sample keeps a latched
  `last_event` while reporting `new_evt=0`

### Native deterministic harness

The `native-layers` PlatformIO environment directly compiles the production
Mass, MotionActivityFilter, Event, Texture, Resonance, Spatial, Tilt, and
ESP-NOW wire-codec sources. Twenty tests have a recorded passing run. Current
source adds telemetry and command/response packet round-trip/CRC/length tests;
the expanded suite remains execution-
pending on the present Windows host because GCC/G++ is not installed. The
retained checks include layer reset equivalence and a reviewed 400-frame
feature-disabled legacy fingerprint; the Gate 1 additions cover:

- generic-default OFF and as-built AtomS3-profile ON feature policy
- exact as-built raw-to-device basis mapping for all three axes, preservation
  of timestamp/validity, and identical proper rotation of accel and gyro
- all six static one-g orientations plus a diagonal orientation
- fixed accelerometer/gyro bias and a committed numeric stationary-noise trace
  independent of host standard-library random distributions
- a bounded acceleration pulse that raises activity and settles to
  `energy<=0.02` within two seconds
- translation at 1, 4, and 8 Hz plus 70/90 Hz sampled alias candidates, with
  the alias output bounded relative to the 4 Hz case
- invalid/non-finite samples, NaN/Inf/non-positive `dt`, three missing frames
  followed by one valid frame, exact/above-50-ms boundaries, and explicit
  filter reset equivalence
- separation of raw planar position drive from filtered energy/agitation drive
- direct stale-state transition policy: assertion after the deadline remains
  latched when a valid sample refreshes that deadline, and also remains latched
  under an unexpected feature disable; only the Safe Idle integration path may
  supply the cleared state
- ESP-NOW wire-v1 default-off policy, exact size, field round trip, CRC
  corruption rejection, and wrong-length rejection
- control operation/value bounds, response results, request/session identity,
  and command/response CRC rejection

The harness must use the same activity-filter implementation as firmware; a
host-only mathematical copy is not acceptable. Layer-unit tests prove reset
equivalence; firmware/HIL tests separately prove each pipeline path invokes
the reset. Golden discrete fields compare exactly, floating fields use
reviewed tolerances, and expected output changes only through a focused manual
edit to the committed initializer with a reviewed diff. The normal test binary
has no fingerprint-update mode.
The production guard sees raw `dt` and sample validity before any nominal-step
substitution or Mass integration. Non-finite or non-positive `dt` has no side
effect. During missing/non-finite IMU samples, Mass, Event, and Tilt hold while
Texture and Spatial tails decay with raw loop time. Pending positive time plus
the next valid frame evaluates the filter once when the total is `<=50 ms`,
then advances Mass and Event through stability-bounded substeps. The limit is
derived from the active Mass parameters, capped at `4 ms` and 64 substeps.
Totals `>50 ms` reset every dynamic layer and hold Tilt until a fresh baseline.
An invalid/unsupported Mass limit also resets every dynamic layer, but fails
closed by submitting a neutral Tilt frame and disarming the runtime servo
interface; correcting the parameters does not implicitly re-arm it.
Texture/Spatial still advance once on the outer raw clock. For an accepted
`<=50 ms` recovery only, Tilt is submitted once after the bounded Mass/Event
substeps. The first valid sample establishes the gravity baseline, uses zero
filtered activity, and cannot create an event. The separate 300 ms stale path
also clears all dynamic state.

When the enhanced path is enabled, all material families must emit no event
while there is no wall hit, `energy<=0.02`, and planar `speed<=0.04`. A
same-instance quiet -> active -> quiet -> active test must prove deliberate
activity reopens each family scheduler and returning to quiet cannot keep a
roll, scrape, detent, liquid, or hybrid generator alive. The disabled path
remains covered by the legacy fingerprint.

The deterministic orientation acceptance is a finite gravity-vector posture
transition followed by a hold:
`energy<=0.02` within two seconds, then a 30-second interval with summed
`new_evt=0`; this case passes in the native suite. Accelerometer data alone
cannot distinguish indefinite continuous
rotation of the gravity vector from translational acceleration, so continuous
rotation and translation at the same frequency must not be specified as an
identifiability requirement. Gyro-assisted classification would be a separate
future model change.

The mounted-frame unit test uses the right-handed computation basis: raw
`(0,-1,0)` becomes device `+x`, raw `(1/sqrt(2),0,1/sqrt(2))` becomes device
`+y`, and raw `(1/sqrt(2),0,-1/sqrt(2))` becomes internal `-z`, which is the
operator's semantic `+z` toward the fingertips. Generic defaults keep this
transform disabled. Production telemetry deliberately remains raw, so hardware
orientation evidence must compare its raw samples with the mapped expectations
rather than assume displayed fields have already been rotated.

The native matrix covers all nine built-in material presets across the seven
committed static poses, the worst public Mass parameter combination at the
50 ms recovery boundary, rejected unstable/invalid limits, the shared
neutral-and-disarm safety action selected for a zero substep count, and
quiet -> active -> quiet -> active scheduler behavior.

### Passive host lab automation

The dependency-free CLI in `tools/lab/lab.mjs` accepts only files or stdin. It
does not open a device connection or send a command. Run:

```text
node tools/lab/lab.mjs self-test
node --test test/lab/self_test.mjs
node tools/lab/lab.mjs validate --plan tools/lab/plans/gate1-static.template.json
```

The committed fixture suite passes 20/20 exact exit/finding-code cases and the
Node integration suite passes 8/8. It covers canonical schema rejection,
NDJSON parse failure, latched-event handling, static/new-event failure,
pre-pulse activity and hidden-event rejection, pulse-to-silence, sequence gaps, first-frame
timestamp offsets, latest-value mode, JSON-safe counter saturation, structured
operator rejection, pre-active canonical JSON rejection, active audio-backend/
channel-test/tilt rejection, audio-underrun growth, and declared-vs-canonical
hardware context mismatch. The Gate 1 pulse template requires a two-second
quiet baseline, response within one second, silence onset within two seconds,
and then 30 continuous seconds without an event or output above the silence
bounds. Every configured positive response minimum is conjunctive, so both
actuator and Mass-energy minima must be reached; a wall event itself is not
required. Baseline-to-pulse continuity is checked across the boundary as well as
inside each window, so two legal half-gaps cannot form one oversized hidden
gap. Full 40-second pass, shortened-capture rejection, post-silence recurrence,
and late-settle fail checks exercise those exact template timings. A hardware
template cannot report pass until its unique run
ID and build/profile/preset source/hash, resolved flags, calibration identity,
output limit, S1/12 V, fixture, authorization, structured observation outcome,
final Safe Idle metadata, and structured before/after USB status snapshots are
complete. Normalized unfinished identities such as `TODO`, `TBD`, `N/A`, `?`,
`-`, `pending`, `unknown`, and `not applicable` remain incomplete even if their
punctuation or case changes. Physical evidence is fixed to the Atom production Gate 1 context:
`m5stack-atoms3-pipeline`, the `as-built AtomS3 custom board` profile,
`liquid_small_box`, first-frame timestamps,
monotonic counters, 12 V ON, Live, compiled/installed/runtime audio, TDM8,
quad-wall 4CH, four active channels, and the initial 8% limit; changing both a
plan and its telemetry to a degraded state must still fail.
A Gate 1 marker with `physical_output_authorization_required=false` is also
rejected rather than downgraded to a generic dry plan.

Every hardware plan contains exactly one 500 ms sequence check and exactly one
static/pulse measurement with the committed template thresholds. The `active`
variant requires S1 ON; `s1_off_control` requires S1 OFF and a pulse
measurement. Missing/duplicate checks or relaxed thresholds fail the plan
contract. `minimum_capture_duration_ms` is fixed at `33000` for static and
`40000` for both pulse variants. Every canonical frame from the first-frame
origin through that powered minimum-capture anchor (also including the static
assessment-end anchor) must agree with
the fixed preset/context, carry
`imu.valid=true`, keep channel-test and demo-compatibility modes disabled, show
the non-silenced/non-stale/non-injected/non-zero-asserted safety state, and keep
tilt disarmed. Test/demo/wall-test and IMU-injection states remain disabled and
tilt remains disarmed across the complete canonical log. The audio underrun
counter must not change through the later final frame. After the active end,
each frame must remain in the fixed Live context or satisfy the full Safe Idle
postcondition, and no frame may re-arm after Safe Idle first appears. That final
frame must independently prove neutral Mass/actuators/events, preserve the
active-end `evt_total`, disable audio/channel-test/demo modes, retain the
production backend configuration, and satisfy the complete Safe Idle
postcondition. Static checks also require an anchor no more than one sample gap
after assessment end and compare signal bounds and cumulative events through
the later 33-second anchor. Pulse quiet/event state must qualify by the original
settle deadline and remain continuous through the 40-second anchor even if a
30-second interval completed earlier. USB snapshots require the transmitted
delta to equal the canonical frame count, zero pending bytes, internally
consistent drop totals, and no growth in drop, backpressure,
console-interruption, unterminated-partial, or serialization-error counters.
`metrics.hardware_evidence.complete` is an overall physical-evidence
acceptance bit: context, structured operator outcome, and final Safe Idle
failures keep it false even when metadata, plan shape, and USB snapshots are
complete.

Stable exit codes are `0` pass, `2` acceptance failure, `3` input/schema
failure, and `4` tool failure. `check` uses fatal UTF-8 decoding so replacement
characters cannot pass JSON validation, while still preserving malformed input
bytes exactly for diagnosis. It writes those bytes with metrics, JSON/Markdown
reports, a manifest, and exact schema copies with SHA-256 hashes to a new
directory; it refuses to overwrite an existing path. The Gate 1
starting plans live in `tools/lab/plans/`, including a distinct S1-OFF pulse
control whose software response bounds match the S1-ON pulse while the physical
observation requires no tactile output. Thresholds remain subject to the
operator-controlled hardware contract in document 23.
`validate --report` also rejects count/code/status/check-reference
contradictions that JSON Schema alone cannot express. A PASS report must contain
at least one captured frame and one passing check. Input-error evidence
neutralizes schema-invalid/unsafe timestamp arithmetic in its summary while
preserving the original bytes unchanged.
`capture` is byte-oriented as well: it stores and hashes the exact stdin stream
as `mixed-input.raw` before fatal UTF-8 decoding. A malformed stream returns
input failure but leaves that raw file and an `input_error` capture manifest,
without producing repaired telemetry.

### WebXR typecheck / build

- from `webxr/`, run `npm.cmd run typecheck`
- from `webxr/`, run `npm.cmd run build`
- verify `webxr/dist/webusb.html` is emitted when testing the WebUSB probe
- these checks validate the standalone visual client only; they do not require
  firmware, schema, or transport changes

### PlatformIO compile matrix

From the repository root, the reproducible compile-only entry point is:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build_firmware_matrix.ps1
```

It keeps the one pinned pioarduino/Arduino 3.3.7 environment in the short
per-user `.pioarduino-pch` core directory. The other 21 environments continue
to use the normal PlatformIO store. The separation is required because the
official and pioarduino platforms publish incompatible packages under the same
names; a long project-local isolated path also exceeds Windows extraction
limits on a clean install. The script never uploads or opens a device.

Run the relevant compile-only matrix before handoff:

- baseline: `platformio run -e m5stack-sticks3`
- main audio path: `platformio run -e m5stack-sticks3-audio`
- storage A/B path: `platformio run -e m5stack-sticks3-audio-storageless`
- remote transport path: `platformio run -e m5stack-sticks3-remote`
- tilt compile-gated path: `platformio run -e m5stack-sticks3-tilt`
- DXL2 board safe probe: `platformio run -e m5stack-atoms3-dxl2-probe`
- DXL2 one-shot ID provisioner: `platformio run -e m5stack-atoms3-dxl2-provision-id2`
- DXL2 unloaded motion probe: `platformio run -e m5stack-atoms3-dxl2-motion-probe`
- AtomS3 MAX98357A TDM safe probe:
  `platformio run -e m5stack-atoms3-max98357a-tdm-probe`
- AtomS3 IMU + XL330x2 + 4CH TDM combined probe:
  `platformio run -e m5stack-atoms3-combined-probe`
- AtomS3 production-integration pipeline:
  `platformio run -e m5stack-atoms3-pipeline`

Use the probe envs when work touches their area:

- `platformio run -e m5stack-sticks3-audio-smoke`
- `platformio run -e m5stack-sticks3-audio-direct-display`
- `platformio run -e m5stack-sticks3-audio-smoke-pioarduino` (pinned
  pioarduino 55.03.37 / Arduino 3.3.7 compatibility path)
- `platformio run -e m5stack-sticks3-transducer-probe`
- `platformio run -e m5stack-sticks3-raw-i2s-probe`
- `platformio run -e m5stack-sticks3-display-probe`
- `platformio run -e m5stack-sticks3-main-boot-probe`
- `platformio run -e m5stack-sticks3-main-pipeline-probe`
- `platformio run -e m5stack-sticks3-main-loop-probe`
- `platformio run -e m5stack-sticks3-main-audio-probe`
- `platformio run -e m5stack-sticks3-main-delta-probe`

## 2. Build validation

- PlatformIO build succeeds for the scaffold baseline.
- PlatformIO build succeeds for `m5stack-sticks3-audio` with `HAPTICS_ENABLE_AUDIO_BACKEND=1`.
- PlatformIO build succeeds for `m5stack-sticks3-remote`.
- PlatformIO build succeeds for `m5stack-sticks3-tilt`.
- PlatformIO build succeeds for `m5stack-atoms3-max98357a-tdm-probe` while
  existing environments compile its source to an empty feature-gated unit.
- PlatformIO build succeeds for `m5stack-atoms3-pipeline` with the TDM backend
  compiled in and the servo backend compiled out.
- No feature should require hardware-specific code to compile when disabled.

Recorded final build result on `2026-08-22` for
`m5stack-atoms3-pipeline`, including Safe Idle, safety telemetry, and the IMU
stale safe-stop:

- result: SUCCESS
- RAM: `40,524 / 327,680 bytes` (`12.4%`)
- flash: `568,297 / 3,342,336 bytes` (`17.0%`)

The same image was uploaded to the assembled AtomS3 board over COM3 with S1 OFF
and 12 V OFF. The USB-only gate reported `audio=0`, `zero=1`, `driver=1`,
`transport=tdm8_slot`, `layout=quad_wall_4ch`, `limit=0.080`, `errors=0`,
`imu_stop=0`, and `tilt=0`. This passes the software-zero boot gate only; no
powered-amplifier or live four-layer output is implied.

## 3. Hardware validation split

Use the following evidence labels consistently:

- **implemented**: source exists and its relevant build passes
- **probe hardware pass**: a dedicated bounded probe passed on the stated bench
- **production hardware pass**: the shared `HapticPipeline` image passed the
  stated on-device test

A raw transport or combined probe pass must not be promoted to a production
pipeline pass.

### AtomS3 MAX98357A 4-channel TDM safe probe

- follow the power-off connection order in `21_MAX98357A_TDM_BRINGUP.md`
- begin with one unloaded transducer on CH1 and leave the XL330 path torque-off
- keep manual amplifier switch S1 OFF before applying 12 V and during wiring
  changes; firmware cannot read or control S1
- confirm boot sends only digital zeros and requires an explicit `start`, `go`,
  or button click before generating a nonzero sample
- before enabling S1, confirm `status` reports `i2s=1`, `digital_silence=1`,
  increasing writes, and zero errors
- verify silent clocks show PCM-short `48 kHz`, `16-bit`, eight-slot framing:
  `6.144 MHz` BCLK and a one-BCLK LRCLK pulse
- use `ch N` plus `start` to test CH1 through CH4 independently
- verify each single-channel run uses only its matching slot, ends after `1.2 s`,
  and returns automatically to digital silence
- only after independent tests pass, use `go` and verify
  `CH1 -> CH2 -> CH3 -> CH4` with digitally silent gaps
- use `ch N` plus `sweep` for a representative-channel qualitative comparison
  at `120`, `160`, `200`, `240`, `280`, and `320 Hz`, using 1.5 s per point and
  the separately bounded 4.0% sweep level
- verify every sweep step is reported, the `12 s` sweep watchdog remains armed,
  and completion returns automatically to digital silence with zero I2S errors
- treat an unloaded subjective sweep with no clear peak as transport validation
  only; repeat after final mounting or with a mechanically coupled accelerometer
  before changing stored resonance carriers
- for subjective intensity testing, use `level PCT` only while idle and increase
  from the known-good 2.5% in small steps, running one 1.2 s `start` test after
  each change; verify values outside `0.5..20.0%` and changes during a run are rejected
- verify reset restores 2.5% rather than persisting a raised bench-test level
- current unloaded CH1 bench result: 15% is a practical-level candidate and 20%
  passed only as a short-duration ceiling; repeat thermal/current validation
  after mounting before using either value for sustained rendering
- confirm `stop`, `mute`, an AtomS3 button hold, DMA failure, and the run watchdog
  all request digital silence; switch S1 OFF separately for hardware mute

### DXL2 board safe probe

- follow the power-off connection order in `20_DXL2_BOARD_BRINGUP.md`
- begin with one mechanically unloaded XL330 and keep the audio outputs muted
- confirm the AtomS3 display shows `DXL2 SAFE PROBE`
- confirm GPIO1 is used only as DYNAMIXEL TX and GPIO2 only as DYNAMIXEL RX;
  the PCB supplies automatic half-duplex direction control
- confirm the boot scan checks IDs `0..10` at `57,600 bps` and `1 Mbps`
- confirm the detected device reports model/firmware, input voltage,
  temperature, present current, position, and hardware error
- require `torque=OFF`, `off_confirmed=1`, and no physical motion for a pass
- confirm a button hold and the `torqueoff` console command both send the safe
  stop at both supported baud rates
- inspect the probe source to confirm it contains no torque-on, goal-position,
  goal-velocity, or other motion command before flashing
- for ID provisioning, connect exactly one verified model-1190 XL330, require
  source ID 1 only, and verify target ID 2 plus torque OFF by read-back
- reset the provisioner once and confirm it recognizes ID 2 without another
  EEPROM write
- for unloaded motion, require IDs 1 and 2 as model 1190 in position mode,
  verify automatic torque-on is disabled, and require explicit `go`
- move only one servo at a time by 40 pulses (3.52 degrees), return to the
  measured starting position, and require torque-off read-back after each
- abort both servos if absolute current exceeds 350 mA, temperature exceeds
  45 C, voltage leaves 4.5--5.6 V, status reads fail, or hardware error is set
- after the motion image finishes, restore the normal safe-probe image and
  verify both IDs are present with torque OFF

### AtomS3 combined probe: recorded pass on 2026-08-22

The dedicated `m5stack-atoms3-combined-probe` used one fixed bounded workload:

- IMU sampled throughout the run
- XL330 IDs 1 and 2, model 1190, `57,600 bps`, position mode 3
- both servos moved 40 pulses relative to their measured homes and returned
- all four TDM channels received the same `180 Hz` waveform
- haptic envelope was `50 ms ON / 300 ms period`
- every exit path returned to digital zero and DYNAMIXEL torque-off

Measured results:

| Haptic level | ID1 peak | ID2 peak | Servo rail | Final temperature ID1/ID2 | IMU updates | I2S errors | Result |
|---|---:|---:|---|---:|---:|---:|---|
| 8% | 15 mA | 13 mA | 5.1 V | 32 / 31 C | 302 | 0 | home return, torque-off, no observed abnormality |
| 15% | 14 mA | 13 mA | 5.1--5.2 V | 32 / 31 C | 282 | 0 | home return, torque-off, no observed abnormality |

This is a **probe hardware pass** only. It used equal waveforms, unloaded
servos/transducers, a low-duty-cycle burst, and fixed relative position-mode
motion. It does not validate spatial rendering, material layers, a mounted
mechanism, current-based servo behavior, continuous-wave drive, or the
production firmware.

### AtomS3 production pipeline: first hardware acceptance gate

Follow `23_ATOMS3_PRODUCTION_INTEGRATION.md`. The minimum pass requires:

- upload `m5stack-atoms3-pipeline` with S1 OFF and 12 V OFF
- USB-only boot reports successful IMU/pipeline initialization and the AtomS3
  as-built profile
- `audio status` reports `driver=1`, `transport=tdm8_slot`,
  `enabled=0`, `zero=1`, `layout=quad_wall_4ch`, effective `limit=0.080`, and
  zero errors
- always-present telemetry reports `audio.output_silenced=true` and
  `safety.audio_zero_asserted=true`, `safety.tilt_disarmed=true`
- the servo backend remains compile-disabled and no production DYNAMIXEL
  torque or motion packet is sent
- applying 12 V and then S1 ON while runtime audio is disabled produces no
  unexpected vibration or pop
- an explicit `audio on` is required before any nonzero signal
- each Front/Back/Top/Bottom channel-test command excites only its mapped wall
  and `audio off` returns to digital zero
- live IMU-driven output runs at the initial 8% effective peak limit without
  reset, I2S error growth, rail anomaly, or self-excited feedback
- controlled IMU fault injection starts from local `imu fault status` reporting
  `compile=1 active=0`; in Live, `imu fault on` must make subsequent canonical
  frames report `safety.imu_fault_injection_active=true` and `imu.valid=false`
  without directly invoking the safety action; only after more than 300 ms
  require neutral Mass plus current event, zero actuators/TDM, and servo
  disarm; internal Texture/Resonance/Spatial/Tilt reset remains a source/native
  policy assertion because USB telemetry does not expose every internal state;
  observe either serial
  `status: ... imu_stop=1 ... zero=1 ...` or top-level
  `safety.{imu_stale_safe_stop,audio_zero_asserted,tilt_disarmed}=true`
- require `imu fault off` to be rejected after stale-stop; while injection or
  stale-stop is active, also reject stale-safety disable,
  Calibration/Record/Replay entry, audio/channel-test/Tilt arm, and invalid
  motion-dynamics Tilt arm; an unexpected non-Live mode must fail closed to
  Safe Idle
- require an asserted natural stale-stop to remain asserted after valid finite
  IMU samples resume; Mass/Event/output remain neutral/zero and Tilt remains
  disarmed until `idle` enters Safe Idle
- end injection with `idle` while audio remains armed;
  require injection false, Idle, audio zero, and disarmed tilt, then verify
  `live` without a fresh `audio on` establishes a neutral valid baseline without
  replaying stale texture/event energy; absence of the optional injection field
  is allowed for legacy logs but does not satisfy this production test
- from Calibration, Replay, and Record separately, invoke `stop` and require
  Safe Idle: the active operation ends, audio runtime turns OFF, zero remains
  asserted, tilt is disarmed, channel-test is cleared, and dynamic state is
  neutral
- let Replay reach natural EOF and require the same Safe Idle postcondition;
  the next real-IMU movement must not render under a stale Replay mode
- on AtomS3, repeat Safe Idle with BtnA hold
- after Safe Idle, issue `live` alone and require output to remain OFF/zero;
  only a subsequent explicit `audio on` may restore haptic output
- while audio runtime is ON, reject transport, demo-mode, and layout changes;
  while muted, accept only supported configurations, and always reject demo
  compatibility while the selected transport is `tdm8_slot`
- reject unknown `audio.transport` strings without changing the selected
  transport, and unknown string layouts without changing the selected layout;
  inject zero-fill, uninstall, and rollback failures and require configuration
  failure, forced-OFF logical gates when restoration fails, plus truthful
  `driver_installed` / `output_silenced` telemetry
- in a build with `HAPTICS_ENABLE_AUDIO_BACKEND=0`, reject every audio-arm
  request without changing the logical runtime/feature flags
- requesting `audio limit 0.20` reports an effective limit of `0.15`; this
  verifies the clamp and does not authorize a 15% mounted run
- at least one liquid and one granular preset exercise the shared pipeline,
  and recorded actuator/event statistics differ in the expected direction
- output remains stable during an agreed soak and after repeated arm/disarm
  cycles

As of `2026-08-22`, build, upload, and the USB-only software-zero boot subset
have passed. Powered-amplifier muted startup also produced no anomaly, and the
unloaded Front/Back/Top/Bottom channel mapping passed with one actuator active
at a time and zero audio errors. `stop` from a live channel test asserted zero,
cleared dynamic/test state, and `live` alone did not re-arm output. An initial
live run of `liquid_small_box` at the 8% limit produced a weak response after
the operator moved the device. A following eight-second software-muted,
stationary Live observation produced no event and no four-channel drive; mass
energy settled near `0.058`, below the `0.16` droplet threshold, before `stop`
returned the system to `energy=0`, `audio=0`, and `zero=1`. The subsequent
powered closed-loop settling check failed: after one light movement, vibration
decayed but did not stop while the device was held still. Safe Idle again
returned `energy=0`, `audio=0`, `zero=1`, `test=0`, `errors=0`, and `tilt=0`.
The feature-gated gravity-separated activity correction and subsequent powered
settling checks passed. Current open production items are summarized in
`16_PROGRESS_STATUS.md`; this paragraph remains historical evidence of the
original failure.

### Flash / boot checks

These require a connected StickS3 but do not require a fully characterized
haptic bench.

- flash only after the compile-only matrix passes for the affected env
- confirm the target env boots and prints its expected serial banner
- confirm USB serial commands respond after the known CDC settle / reconnect
  delay if needed
- confirm the SoftAP browser status page loads for remote-enabled envs
- confirm flash-only smoke checks do not get counted as perceptual validation

### Bench / perceptual checks

These require the relevant transducers, amp wiring, and/or XL330 hardware.

- verify actuator routing and channel independence on the bench
- verify resonance sweeps against the physical transducer stack
- verify wall events, texture atoms, and material-family differences by feel
- verify tilt-plane safety, current limits, emergency stop, and sign
  calibration only with the servo bench assembled

## 4. Runtime validation (current scaffold)

- StickS3 boots and initializes.
- IMU polling works without crashing.
- Preset cycling works via `BtnA` click.
- verify the `BtnA` demo cycle includes `granular_single_marble_box` between the default granular and hybrid demos
- Verbose telemetry toggle works via `BtnB` click.
- Audio runtime enable toggle works via `BtnB` hold.
- Audio test-wall cycling works via `BtnA` hold.
- on the AtomS3 custom profile, BtnA hold invokes Safe Idle instead of cycling
  the channel test
- Serial telemetry prints latent state, actuator-frame summaries, and recorder/remote status.
- Console preset listing/loading works.
- preset cycling and `preset load <name>` preserve runtime feature flags, pin assignments, audio layout/runtime state, tilt/interface/recorder settings, and calibrated resonance carriers.
- Recorder start/stop and replay start/stop commands work without crashing.
- Recorder batching honors `recorder.flush_interval_frames` without losing tail frames on stop.
- if LittleFS mount fails at boot, built-in preset listing/loading should still work and should not retry a crashing remount on every console command
- with the generic IMU stale safe-stop flag left false, legacy target behavior
  remains unchanged
- with the AtomS3 profile, confirm invalid or non-finite IMU input does not
  refresh the valid-sample timer and the safe-stop asserts only after the
  300 ms threshold
- confirm generic targets leave
  `features.enable_gravity_separated_mass_activity=false`, while the as-built
  AtomS3 profile enables it with `1 Hz` gravity, `10 Hz` motion,
  `0.025 g` acceleration, and `1.5 deg/s` gyro defaults
- with that path enabled, confirm missing IMU frames hold Mass/Event/Tilt,
  allow existing Texture/Spatial tails to decay, and do not increment
  `new_evt`; confirm recovery at `<=50 ms` and full dynamic reset above it
- confirm `idle` and `stop` both terminate Calibration/Replay/Record, clear the
  channel test, reset all dynamic layers, set audio runtime OFF, assert zero,
  and disarm tilt
- confirm `live` after Safe Idle does not re-arm audio; require `audio on`
- confirm `status` and the always-present `safety` object are sufficient to
  observe the IMU stop and zero assertion without pipeline-debug telemetry

## 4.1 Minimal audio smoke test

- build and flash `m5stack-sticks3-audio-smoke`
- confirm the boot banner prints `Audio smoke test started.`
- confirm the StickS3 screen shows `AUDIO SMOKE` even if USB CDC is flaky after flashing
- the smoke image should force `board_M5StickS3` fallback and skip IMU / RTC / mic startup so display/audio bring-up stays isolated
- verify `status` reports pins `(7,5,43)`, `enabled=1`, and the default `burst` mode when serial is available
- verify the default `burst` pattern is easier to feel than a continuous tone on the single external amp
- verify `mode tone`, `tone 180`, and `amp 0.45` can still produce a stable continuous output for comparison
- verify `sweep on` steps through the resonance-search band without crashing
- verify `BtnA` click steps tone, `BtnA` hold toggles sweep, and `BtnB` click toggles output
- if the official `espressif32@6.12.0` build stays silent while the old demo worked, repeat the same test with `m5stack-sticks3-audio-smoke-pioarduino` to isolate core/platform differences
- only after the smoke test is stable, move back to `m5stack-sticks3-audio` for full pipeline debugging

## 4.2 Minimal transducer probe

- build and flash `m5stack-sticks3-transducer-probe`
- confirm the boot banner prints `Transducer probe started.`
- verify `status` reports pins `(7,5,43)` and a conservative burst pattern
- verify the default `180 Hz`, `60 ms` burst, `220 ms` period pattern is easier to feel than a continuous tone
- verify `freq 120`, `freq 180`, `freq 240`, and `freq 320` can be stepped without crashing
- verify `sweep on` slowly scans the carrier while keeping the burst envelope intact
- use this probe before blaming the full haptic pipeline when the amp path is still uncertain

## 4.3 Raw I2S probe

- build and flash `m5stack-sticks3-raw-i2s-probe`
- confirm the StickS3 screen shows `RAW I2S PROBE`
- verify the serial banner prints `Raw I2S probe started.`
- verify the output uses `GPIO 7/5/43` and writes directly through `driver/i2s.h`
- verify left and right slots carry the same waveform so a mono MAX98357A cannot miss the active side
- verify `BtnB` hold or `pins legacy` switches to the StickS3 default speaker route `17/15/14` for direct A/B comparison against the old demo
- verify `mode tone`, `amp 1.0`, and `tone 180` produce the strongest simple continuous test
- only after the raw I2S probe is stable, move back up to `M5.Speaker` and then the full haptics pipeline

## 4.4 Main firmware observability policy

- `m5stack-sticks3-audio` no longer treats the StickS3 panel as a supported runtime monitor
- verify the main firmware can be operated entirely from USB serial plus the SoftAP browser page
- keep any remaining display validation isolated to the probe envs below

## 4.5 Display probe

- flash `m5stack-sticks3-display-probe`
- verify the screen steps through `M5.begin ok`, `IMU begin`, `EXT_5V on`, and `pipeline begin`
- if the display disappears at a specific stage, treat the previous stage as the last known-good point for the main firmware

## 4.6 Deterministic main-firmware probe ladder

- flash `m5stack-sticks3-main-boot-probe`
- verify the screen stays alive for at least `10 s` and shows `M5.begin`, `IMU`, and `EXT_5V` success with a monotonically increasing heartbeat
- flash `m5stack-sticks3-main-pipeline-probe`
- verify the screen still stays alive after `g_pipeline.begin(...)` and shows a frozen status page with heartbeat
- flash `m5stack-sticks3-main-loop-probe`
- verify the probe advances through `static -> redraw -> update -> tick`
- verify the screen stays alive through the `redraw` and `update` phases before `g_pipeline.tick()` is enabled
- verify the heartbeat continues incrementing and `BtnA` can still cycle presets without blanking the display
- flash `m5stack-sticks3-main-audio-probe`
- verify the probe shows setup stages and then an `idle` screen without starting audio automatically
- verify `BtnA` cycles deterministic `liquid -> granular -> hybrid` synthetic stimulus modes
- verify `BtnB` toggles runtime audio on/off and is the first point where synthetic audio should start
- flash `m5stack-sticks3-main-delta-probe`
- verify it stays visible while phasing through `tick-only -> main-buttons -> poll-console -> verbose-serial`
- if it blanks at a specific phase, treat the newly added main-loop condition for that phase as the prime suspect

## 4.7 Main monitoring workflow

- for the normal `m5stack-sticks3-audio` firmware, treat USB serial and the SoftAP browser page as the only supported monitoring surfaces
- do not use the StickS3 display as part of the main validation workflow
- after boot, confirm serial startup lines and open the HTTP status page from the printed AP URL or `http://192.168.4.1/`
- use serial `status`, `audio status`, `cal status`, `record status`, `replay status`, `tilt status`, and `remote status` for snapshots
- rely on the browser page for continuous inspection of preset, run mode, event, mass energy/position, actuator summary, audio, calibration, recorder, remote, and tilt state
- verify `BtnA` preset cycling does not restart the AP or drop the browser page when WiFi settings are unchanged
- verify at least one synthetic mode is clearly perceptible without any live IMU motion
- only after all four probe rungs are stable should changes be re-applied to `m5stack-sticks3-audio`

## 5. Audio backend validation

### Phase A: bus-level tests
- build and flash `m5stack-sticks3-audio`
- note that `m5stack-sticks3-audio` now boots in a single-amp bench profile: `front_back_2ch` plus demo-compat mono `48 kHz`
- note that the same env also boots with a hotter `audio.output_gain` for the known single-MAX98357A bench
- if display instability is still being investigated, keep it isolated to the probe envs
- do not block main audio validation on the display path
- verify stereo I2S x2 clocks on a scope or logic analyzer
- verify Front/Back pair and Top/Bottom pair channel routing
- switch `audio.output_layout` to `front_back_2ch` and verify only the Front/Back bus is required for output
- in `front_back_2ch`, verify `BtnA` hold cycles `OFF -> Front -> Back -> OFF`
- in `quad_wall_4ch`, verify `BtnA` hold cycles `OFF -> Front -> Back -> Top -> Bottom -> OFF`
- verify the equivalent serial console controls `audio on`, `audio off`, and `audio test ...` work without relying on button timing
- verify `audio gain <value>` changes live output level and `audio status` reports the same gain value
- verify `audio diag on` forces the bus-A-only mono `48 kHz` compatibility profile and is useful for comparison against the known single-amp demo
- verify `BtnB` hold silences and re-enables the backend without unstable bursts
- verify silence floor and no unstable bursts

### Phase A2: eight-slot TDM backend validation
- keep the current dual-I2S backend available while bringing up TDM
- verify the MAX98357A TDM profile uses a single ESP32-S3 TX port with
  `48 kHz`, `16-bit`, `8 slots`, and `PCM short`; slots 4 through 7 remain zero
- verify slot routing `slot0=Front`, `slot1=Back`, `slot2=Top`, `slot3=Bottom`
- verify the same `DriveFrame4` stimulus can be rendered through either dual-I2S or TDM without changing the upstream pipeline
- verify `front_back_2ch` remains available as a fallback policy while the physical TDM transport is active
- verify demo compatibility is rejected while `tdm8_slot` is selected; after
  muting and explicitly selecting dual-I2S, it may force the known single-amp
  mono bring-up path
- verify transport, demo-compat, and output-layout changes are rejected while
  audio runtime output is enabled
- on MAX98357A benches, verify each amplifier responds only to its strapped TDM slot
- verify the TDM path can be disabled or bypassed without breaking legacy probes and current bench workflows

Status on `2026-08-22`:

- implemented in `AudioOutput4Ch` behind the existing audio gate plus
  `HAPTICS_ENABLE_TDM_AUDIO_BACKEND`
- raw framing, CH1--CH4 isolation/order, and zero-filled idle passed with the
  dedicated probe
- the production environment builds, was uploaded, and drove the hardware with
  this transport selected
- channel routing passed; the first powered shared-pipeline settling check
  failed before the gravity-separated correction, but the corrected image has
  since passed static/pulse settling, mounted static and dynamic localization,
  liquid/granular/hybrid distinction, geometry-density A/B, and a 30-second
  no-retrigger check. Natural voicing, adjacent-wall/SOA
  quality, and a longer thermal/endurance soak remain open

### Phase B: actuator tests
- use channel test mode to excite each wall individually
- run `cal start` in the serial console while using `m5stack-sticks3-audio`
- verify low/high resonance estimates are stored back into `resonance.low_carrier_hz[4]` and `resonance.high_carrier_hz[4]`
- verify telemetry reports calibration wall, band, candidate frequency, and progress
- verify channel independence

## 6. Algorithm validation

### Mass motion layer
- confirm smaller container sizes reduce travel time and increase wall-contact opportunities
- compare liquid vs granular vs hybrid latent response

### Event layer
- `wall_hit` should localize strongly
- `wall_hit` should trigger once per approach rather than every control tick
- smaller containers should show shorter wall-hit cooldown and denser collision opportunities
- `roll_train` should appear as repeated pulses along the contacted wall rather than a constant per-frame event
- `impact_cluster` should feel denser than `wall_hit`
- `impact_cluster` density should rise in shorter spans and during sustained rolling
- `scrape` should appear intermittently under strong tangential wall contact rather than continuously
- `droplet_cluster` should not collapse into a long low-frequency hum
- raising `event.splash_threshold` should suppress weak liquid / hybrid droplet activity before strong slosh motion returns it
- `roof_slap` should only appear when `container.enable_roof_contact` is enabled
- detented presets should produce intermittent discrete ticks plus lighter scrape rather than continuous scrape spam
- detented presets should remain perceptible on the current bench through a short low-mid click body, not only through high-frequency bite
- `granular_single_marble_box` should feel sparser than `granular_bead_box`, with more isolated wall pings and shorter roll trains
- very sparse hard-particle presets should expose a distinct short rigid `knock` quality on wall collisions instead of collapsing into the same `dry_rattle` feel as multi-particle clusters

### Spatial rendering
- local wall events should be distinguishable
- adjacent-wall motion should be perceivable with SOA tuning
- flow/ripple events should step across neighbors rather than collapsing into static bleed
- Front / Back events should spread only toward Top / Bottom, and Top / Bottom events should spread only toward Front / Back

## 7. Servo path validation

The legacy StickS3 model/backend is compile-gated and the dedicated AtomS3
probes have passed bounded unloaded motion. The baseline AtomS3 environment
still compiles servo output out; dedicated tilt environments now provide the
GPIO1-TX/GPIO2-RX automatic-half-duplex adapter and DXL feedback telemetry.
The following checklist governs their powered validation:

- verify safe home position on both XL330 units
- require IDs 1 and 2, model 1190, and the configured `57,600 bps` bus before
  allowing torque-on
- verify torque, operating mode, watchdog, travel, and output cap by read-back
- verify current-limited motion before full position control tests
- verify emergency stop behavior
- verify `tilt off` drops torque and does not leave either XL330 energized
- verify asymmetric thumb/index home angles still clamp each servo to its own safe range
- verify `tilt.enable_pseudoforce=false` preserves the base tilt path with zero pseudo-force delta
- verify empty-container presets still generate low-frequency torque from shell CoG only
- verify filled presets generate additional differential tilt from content CoG migration
- verify vertical impulses primarily appear as common-mode tilt on both fingers
- verify horizontal weight shifting primarily appears as thumb/index differential tilt
- verify ordinary operation usually stays within:
  - common-mode correction <= about `1.5 deg`
  - differential correction <= about `3 deg`
- verify hard limits remain enforced:
  - common-mode correction <= `2.5 deg`
  - differential correction <= `5 deg`
  - total pseudo-force correction <= `6 deg`
  - final command <= `10 deg` unless intentionally retuned
- require final torque-off read-back after normal stop, run-mode exit, stale
  IMU, watchdog timeout, and operator stop whenever bus communication remains
  available
- after communication failure or a missing read-back deadline, latch an
  unconfirmed-stop fault, prohibit re-arm, instruct the operator to switch the
  12 V/servo supply OFF, and never report torque-off as confirmed
- repeat the safety sequence with the final linkage mounted before evaluating
  pseudo-force quality

### 7.1 AtomS3 production-pipeline tilt acceptance

This gate follows, and does not repeat, the already-passed bounded combined
probe. Use `m5stack-atoms3-pipeline-tilt-espnow-monitor` on AtomS3 and the
matching updated StampC5 bridge.

1. Boot without issuing an arm command. Require `state=ready_torque_off`,
   `fault=none`, IDs 1/2, Position Mode 3, valid read-back, normal voltage and
   temperature, and torque false for both devices. No linkage motion is allowed.
2. Record the measured session homes and verify every configured goal remains
   within ±114 pulses. Do not substitute historical home values.
3. Enter Live and issue one explicit `tilt on`. Slowly vary physical pitch and
   roll through a comfortable range for 20 seconds while leaving audio OFF and
   holding the mechanism as intended in use. Require both actual positions to
   track bounded goals, produce clearly perceptible travel and holding force,
   and remain free of fault, current above 1200 mA, temperature above 60 C,
   voltage outside 4.5--5.6 V, or hardware error.
4. Issue `tilt off`. Require verified torque false on both devices and no
   further goal motion. Repeat arm/disarm three times.
5. Arm again, then issue paired Haptic Link `stop`. Require Idle, audio zero,
   `tilt_disarmed=true`, and torque false for both devices in a newer v2 frame.
6. Exercise the IMU stale/fault path only after the nominal steps pass. Require
   `FaultLatched`, a torque-off attempt, rejection of re-arm, Safe Idle, then an
   explicit `tilt clear` preflight before another arm can succeed.
7. Only after the servo-only run passes, enable the existing 8% haptic path and
   repeat a short free-motion run. Require no I2S underrun, DXL communication
   error, safety limit, reset, or residual actuation.

Any missing status packet is a failed confirmation, not evidence of torque-off.
The current gate evaluates bounded operation, safety integration, and whether
the servo output is functionally useful for gripped pseudo-force rendering.

Gate 7.1 bring-up results on `2026-09-04`:

- the guarded production image was uploaded to AtomS3 COM3 and remained
  disarmed, but boot preflight fault-latched on missing DXL status responses;
- the same hardware then failed the previously passed combined probe at the
  first ID1 ping;
- the dedicated no-motion DXL probe found zero devices for IDs 0--10 at both
  57,600 and 1,000,000 bps;
- no torque-on or goal-position command was issued in these checks, and the
  transmitted torque-off broadcasts are not counted as confirmed because no
  device read-back was available.
- after reseating the DXL harness, the no-motion probe found ID1 and ID2 at
  57,600 bps. Both were model 1190, Mode 3, 0 mA, 5.1--5.2 V, 32--34 C,
  hardware error `0x00`, with torque OFF confirmed by read-back;
- the production image then passed boot preflight with zero communication
  errors and measured session homes near ID1=2036 and ID2=3176;
- the first arm exposed an unnecessary routine rewrite of the already-verified
  EEPROM Operating Mode. That write was removed so arming now matches the
  proven probe and changes only RAM safety settings before torque enable;
- the corrected image passed one roughly five-second stationary arm/disarm
  cycle. Armed status reported both torques ON, zero communication errors,
  0 mA, 5.1--5.2 V, 33--36 C, and no hardware error. Final status confirmed
  both torques OFF with no latched fault;
- the first remote 20-second physical-tilt attempt did not pass the nominal
  continuity requirement. One DXL communication error latched the production
  backend and triggered torque-off. The newer ESP-NOW frame confirmed Safe
  Idle, audio silenced, and both reported torques OFF, so the fail-safe path
  behaved correctly;
- an explicit remote `tilt clear` in Safe Idle then completed preflight and
  restored `ready_torque_off` with both devices valid, torque OFF, hardware
  error `0x00`, 5.2 V, and temperatures of 37 C / 35 C. The cumulative
  communication-error count remained one, as expected. Secure the DXL
  interconnect and repeat the full physical-tilt attempt before crediting
  step 3;
- the next physical-tilt attempt ran normally for about 6.5 seconds, then
  latched `supply_voltage` when ID2 appeared as 25.5 V / 0 C. The paired values
  and the known 5.1--5.2 V supply identified a Protocol 2.0 byte-stuffing parse
  error, not a real overvoltage: a stuffed byte in the contiguous motion-status
  payload shifted the voltage and temperature offsets while retaining a valid
  CRC. Remote stop subsequently confirmed Safe Idle, audio silenced, and both
  torques OFF. Receive unstuffing and matching transmit stuffing were added;
  the clean 20-second run remains to be repeated with that corrected image;
- the byte-stuffing-corrected image booted with zero communication errors and
  normal 5.1--5.2 V / 36--38 C read-back, and the false 25.5 V value did not
  recur. Its first moving attempt nevertheless lost one ID2 status read about
  1.0 second after arming and correctly latched `communication`. Remote disarm
  and Safe Idle then confirmed both torques OFF. A stationary powered interval
  is required next to distinguish motion-sensitive interconnect loss from
  protocol timing or signal-integrity loss independent of motion;
- the following stationary interval remained armed for about 30 seconds with
  no additional communication error, invalid status, false voltage,
  over-temperature, over-current, or hardware error. Voltage stayed 5.0--5.2 V
  and remote disarm/Safe Idle ended with two valid torque-OFF read-backs. This
  supports a motion-sensitive interconnect or signal-integrity cause for the
  earlier missing ID2 packet. It did not pass position tracking: despite goals
  remaining within 16 pulses of the measured homes, ID1 and ID2 were displaced
  as much as 336 and 135 pulses from goal under the stationary fixture/load.
  Peak measured currents were only 77 mA / 72 mA. Remove fixture contact or
  characterize the intended compliant load before crediting nominal tracking;
- the operator subsequently identified accidental finger loading during that
  stationary interval. After recapturing unloaded homes, the next arm attempt
  was rejected before torque-on by one additional missing status transaction
  while the hardware remained still. This demonstrates a lower-rate transport
  issue independent of motion. The guarded DXL2 backend now retries each
  register read once; two consecutive misses still produce the same latched
  communication fault and torque-off path. Repeat the unloaded interval with
  that image before accepting either tracking or continuity;
- the retry-enabled image then armed successfully and remained fault-free for
  about 16 seconds with zero communication errors, all status reads valid,
  5.0--5.2 V supply, and normal temperatures. Final remote disarm/Safe Idle
  again confirmed both torques OFF. With no operator contact, however, both
  axes still moved strongly in the same raw direction: ID1 2013 to 1488 and
  ID2 3068 to 2645 while their goals stayed within 15 pulses of their session
  homes. Peak currents remained 77 mA / 72 mA. This clears the short
  communication-continuity check but fails position control. The operator
  confirmed that both servos physically rotated to what appeared to be their
  mechanical limits without contact and that gravity/load torque did not
  explain the motion. The earlier insufficient-holding interpretation and the
  proposed Goal PWM increase from 150 to 200 were therefore rejected before
  upload. Keep torque OFF and use the no-motion probe to read the servo-resident
  Goal Position, Present PWM, Drive/Operating Mode, homing offset, position
  limits, PID/feedforward gains, PWM limit, watchdog, and trajectory profile
  before another motion attempt. The post-power-cycle read found both servos at
  57,600 bps with torque OFF, Drive Mode 0, Position Mode 3, zero Present PWM
  and current, Goal Position equal to Present Position, full 0--4095 position
  limits, zero homing offset/feedforward gains, and readable position gains.
  Because the power cycle reset volatile command state, this does not reveal
  the Goal Position held during the failed run. Production telemetry therefore
  now reports the servo-read Goal Position and faults if either that goal exits
  home +/-40 pulses or Present Position exits the same envelope plus 8 pulses;
- the guarded production image then passed a roughly one-second local-USB arm
  check with audio still OFF. Homes were ID1=2053 and ID2=3079; read-back goals
  remained at 2060 and 3086, both Present Positions remained exactly at home,
  Present PWM/current stayed zero, and no communication or safety fault
  occurred. Explicit disarm and Safe Idle ended with both torque states OFF.
  This validates the new read-back path and guard on a non-moving interval but
  does not yet explain the earlier mechanical-stop travel;
- the next guarded stationary attempt did not reproduce the travel: both
  Present Positions remained at their homes and the read-back goals remained
  inside the +/-40-pulse envelope. It nevertheless fault-latched on an ID1
  status-read failure during the longer interval. The communication fail-safe
  requested torque-off, and the subsequent local status confirmed both torque
  states OFF. Position control is therefore not yet cleared for a moving run;
  the repeatable open issue remains DXL transport continuity;
- five consecutive Safe-Idle `tilt clear` attempts after that fault could not
  restore status reads. Without changing servo power or wiring, rebooting the
  AtomS3 into the no-motion probe immediately rediscovered both devices and
  confirmed torque OFF, zero Present PWM/current, Goal=Present, Goal PWM 150,
  profile 1/5, watchdog 50, Mode 3, and no hardware error. The production
  recovery path therefore now recreates `Serial1` before explicit clear
  preflight and between boot-preflight retries; verify clear-after-fault before
  resuming the moving acceptance sequence;
- after adding the read-back position guard and UART restart, a later guarded
  run reproduced the control fault without reaching a mechanical stop. ID1 was
  captured at home `2053`, command/read-back goal `2036`, Present Position
  `1985`, Present PWM `-44`, and current `-18 mA`; ID2 tracked its `3062` goal
  from home `3079`. The resulting `position_range` latch had zero communication
  errors and verified torque OFF afterward. Thus the transmitted and
  servo-resident Goal Position were bounded, while ID1's internal controller
  was still driving in the same negative direction after passing that goal;
- the production controller had combined a 100 Hz software-generated command
  trajectory with the XL330 velocity-based profile at acceleration `1` and
  velocity `5`. That servo profile has an approximately 320 ms acceleration
  interval and is replanned on every Goal Position update. Production now sets
  both profile values to zero and relies on its existing software low-pass,
  deadband, slew limit, +/-40-pulse clamp, Goal PWM `150`, and read-back guard.
  Re-center the unloaded mechanism, then repeat the short guarded test before
  crediting position tracking;
- the profile-disabled image passed one short stationary arm/disarm interval:
  both servo-resident goals moved 17--18 pulses below home, Present Position
  stayed at home, current stayed at 15--16 mA, no runaway or position fault
  occurred, and final torque read-back was OFF. The first arm attempt before
  that pass and the next requested dynamic attempt both lost ID1 during the
  repeated arm preflight even though the immediately preceding `tilt clear`
  preflight had found both devices. Production now also recreates the UART at
  the start of the final arm preflight, while torque is still verified OFF;
- the arm-UART-restart image then passed the requested roughly five-second
  hand-tilt interval without a communication, position, voltage, temperature,
  current, or hardware fault. It armed on the first attempt with zero errors
  and ended with both torque read-backs OFF. The final active sample had homes
  `2024` / `3103`, local commands `2036` / `3119`, read-back goals `2039` /
  `3118`, Present Positions `2026` / `3103`, Present PWM `21` / `25`, and
  current `15` / `14 mA`. This clears the short dynamic safety/continuity
  check and did not reproduce runaway, but it does not pass functional
  tracking: only ID1 moved two pulses and ID2 did not move despite a 12--16
  pulse command. Treat static friction/control authority as the next issue;
- before changing application gains or Position PID, run the explicit
  `m5stack-atoms3-dxl2-motion-step-probe`. It applies one guarded 40-pulse
  out-and-home command to each unloaded servo with Profile Acceleration and
  Velocity both zero, Goal PWM 150, and the existing electrical/thermal
  limits. This isolates direct position authority from the application's
  smaller live command;
- the first profile-zero 40-pulse step test failed functionally but stopped
  safely. ID1 commanded `2026 -> 2066`, moved only to `2028`, held Present PWM
  near `60` and current near `25 mA`, then hit the four-second timeout; ID2 was
  not attempted after the sequential test aborted. Since PWM remained far
  below the existing 150 cap, increasing that cap cannot address this stall.
  The volatile Position P Gain 800 comparison moved ID1 from `2036` to `2070`
  for a `2076` goal and returned to `2043`, but ID2 stalled at `3127` for a
  `3144` goal. Maximum observed current was `41 mA`; the test timed out and
  torque-off completed normally;
- Position P Gain 1200 passed the same guarded profile-zero comparison for both
  axes. ID1 moved `2043 -> 2084 -> 2043` for a `2083` out goal. ID2 moved
  `3127 -> 3161 -> 3131` for a `3167` out goal and `3127` home. The 12-pulse
  completion tolerance was met, maximum observed current was `58 mA`, voltage
  remained `5.1--5.2 V`, temperature remained `36--39 C`, Present PWM was
  capped at `+/-150`, and the combined test ended with broadcast torque-off;
- the motion probe now clears each servo's retained Bus Watchdog RAM value
  after verified torque-off and before preloading Goal Position. This was
  required because ID2 retained watchdog value `50` across controller firmware
  uploads. Register verification retries reads only and never repeats a write
  or accepts a mismatched value;
- after applying gain 1200 to the as-built production profile, two short Live
  runs showed nonzero bounded tracking (examples: ID1 home `2043`, local command
  `2057`, servo goal `2060`, present `2045`; ID2 home `3131`, local command
  `3140`, servo goal `3149`, present `3134`). Each run then lost all health-read
  attempts for a different ID after about 4--5 seconds and fault-latched
  `communication`. Explicit stop confirmed both torque read-backs OFF. A second
  Safe-Idle clear recovered both devices, separating the remaining intermittent
  DXL link problem from the now-demonstrated position-control authority;
- production register reads now permit three total attempts. Three consecutive
  45 ms timeouts still fault and request torque-off in about 137 ms, inside the
  unchanged 350 ms command timeout and one-second servo Bus Watchdog;
- the three-attempt production image then completed an approximately eight-
  second actively handled run with `armed`, `fault=none`, and zero communication
  errors. One captured sample had ID1 home `2055`, present `2065`, command/goal
  `2062`, and ID2 home `3140`, present `3152`, command/goal `3140`. Explicit
  stop returned to `ready_torque_off`; final read-back reported torque false on
  both devices, no fault, and zero errors. This confirms short-run production
  motion authority and bounded communication recovery, but not the full
  20-second/three-cycle acceptance gate;
- the next tactile-authority evaluation deliberately replaces the as-built
  bring-up envelope with the model's intended `+/-10 deg` / `+/-114 pulse`
  range, Position P Gain `2000`, Goal PWM `600`, `1200 mA` current abort, and
  `60 C` temperature abort. The baseline image, generic defaults, and bounded
  motion probes remain unchanged. Require a mounted/gripped run to demonstrate
  perceptible travel and holding force without position-guard, communication,
  voltage, temperature, current, or hardware fault; record actual current,
  position, goal, and the operator's qualitative tactile judgment;
- the expanded profile built successfully in both the unchanged baseline and
  dedicated Tilt environments and was uploaded to AtomS3 COM3. Its boot
  preflight reported `ready_torque_off`, `fault=none`, zero communication
  errors, valid model-1190 Mode-3 devices at homes `2068` / `3156`, zero PWM
  and current, 5.2 / 5.1 V, 39 / 37 C, and torque false on both axes. The
  mounted/gripped motion observation remains pending;
- two gripped Live attempts with the expanded profile were subjectively
  reported as very weak. Telemetry showed that the application model requested
  only about 1--3 degrees rather than exercising the new 10-degree range;
  sampled Present PWM/current remained at most about 133 / 60 mA. Each attempt
  independently stopped on an intermittent DXL status-read loss, first ID1 and
  then ID2, rather than on position, current, voltage, temperature, or hardware
  error. Add and use the runtime-default-OFF local `tilt test <angle_deg>`
  override to evaluate direct equal-and-opposite hardware travel before tuning
  the application mapping;
- the local direct-HW override then completed `+10 -> -10 -> 0 deg` and explicit
  torque-off without a fault or communication error. From homes `2061` / `3161`,
  the `+10 deg` goals were `2175` / `3275` and Present Position reached `2167`
  / `3272`; the `-10 deg` goals were `1947` / `3047` and Present Position
  reached `1951` / `3057`. Observed endpoint PWM/current remained modest at
  `70` / `29 mA`, `23` / `13 mA`, `-32` / `-16 mA`, and `-79` / `-31 mA`.
  The zero command returned to `2053` / `3160`, followed by
  `ready_torque_off`, both torque flags false, `fault=none`, and `errors=0`.
  This passes direct full-range position authority and isolates the weak prior
  response to the application angle mapping. The operator reported the direct
  motion as "very clear", so direct mounted/gripped travel is accepted;
- the following application-mapping comparison strengthens only the as-built
  tactile-evaluation profile: `k_phi=4.0`, common-mode delta limit `5 deg`,
  differential delta limit `10 deg`, and combined delta limit `10 deg`. The
  generic defaults remain `1.0 / 2.5 / 5 / 6 deg`, and both the final logical
  command and calibrated travel remain bounded to `+/-10 deg`. Repeat the
  gripped Live run and require materially larger commanded travel plus a clear
  tactile response before accepting the application path;
- the strengthened normal Live mapping then produced a captured pseudo-force
  delta of `+5.32 / -5.60 deg`, versus the earlier roughly `1--3 deg`. From
  homes `2054` / `3121`, Present Position reached `2115` / `3184` for software
  commands `2114` / `3184`; the corresponding servo Goal Position read-back
  was `2114` / `3181`. Both axes were valid, armed, and closely tracking at
  that sample with 5.2 / 5.1 V, 40 / 38 C, and no hardware error. This passes
  the short-run application-amplitude and tracking checks. The operator rated
  the stimulus strength as good but rejected the correspondence between
  handled-device tilt and contact-plane rotation direction, so perceptual
  amplitude passes while mounted direction remains open. A later ID1
  status-read loss still latched
  `communication` before the full continuity gate; Safe Idle followed by
  explicit clear confirmed both devices valid and torque OFF with normal
  voltage/temperature. The 20-second communication gate therefore remains
  open independently of the application gain result;
- telemetry during the rejected-direction sample showed base angles near zero,
  so the perceived motion was dominated by the pseudo-force branch. The next
  minimal A/B reverses both as-built `sign_thumb` and `sign_index` from the
  uncalibrated generic `+1` to `-1`, without changing gain, limits, session
  homes, or the separately verified raw encoder directions. Accept those signs
  only if the repeated same-gesture run makes contact-plane rotation agree with
  device tilt; otherwise stop and calibrate the mounted IMU/container axes
  instead of stacking further sign guesses;
- the paired-sign A/B image passed both baseline and dedicated Tilt builds and
  was uploaded to AtomS3 COM3. Boot preflight reported both model-1190 devices
  valid, torque OFF, `fault=none`, and `errors=0`. A short arm interval moved
  both raw commands about 52 pulses below their session homes under the reversed
  model correction, then explicit Safe Idle confirmed both torque flags false
  with no communication or safety fault. Operator direction judgment remains
  the only result needed from this A/B;
- a subsequent three-pose static gravity check resolved the mounted AtomS3 IMU
  frame without driving the servos. Neutral `+y` up measured approximately
  raw `(+0.709,-0.075,+0.699) g`; device `+x` up measured approximately
  `(-0.04,-1.01,+0.04) g`; and semantic `+z` forward up measured approximately
  `(+0.73,0,-0.66) g`. These observations establish
  `x=-raw_y`, `y=(raw_x+raw_z)/sqrt(2)`, and semantic-forward
  `z=(raw_x-raw_z)/sqrt(2)`. Production computation uses the equivalent proper
  right-handed rotation with internal `+z` wristward, while raw telemetry is
  unchanged. This removes mounted-axis mixing as a variable before repeating
  pseudo-force direction judgment;
- physical inspection also corrected the earlier mirror-mount assumption: the
  two servo rotation axes are parallel. The existing `+1/-1` raw-direction
  pair is therefore not accepted as a same-world-direction calibration. Keep
  it as the current bounded candidate until a short direct motion observation
  determines whether both contact planes rotate together or oppositely, then
  change only the raw-direction mapping if required;
- the mounted direction observation then ran the differential logical command
  `thumb=+10 deg / index=-10 deg` with the former `+1/-1` raw pair. From homes
  `2003 / 3086`, Present Position reached `2119 / 3201` for clamped commands
  `2117 / 3200`; both axes tracked at 5.2 / 5.1 V, 39 / 37 C, with no hardware
  error or active fault. The operator observed both contact planes moving in
  the same physical direction. This confirms that the old raw pair swapped
  physical common and differential modes. The as-built profile therefore
  changes only `index_raw_direction` from `-1` to `+1`, leaving the generic
  profile, model signs, gain, limits, and session-home logic unchanged. The
  local diagnostic now also accepts explicit `common` and `differential`
  modes so the corrected basis can be checked directly after upload;
- after uploading the corrected `+1/+1` as-built pair, the explicit
  `tilt test common +10` command made both contact planes rotate together in
  the same counterclockwise direction. This passes the relative common-mode
  direction check. The immediate full-range diagnostic step also made ID1
  overshoot its `home +/-114 pulse` commanded envelope: home `2119`, command
  `2233`, and observed position `2264`. The position-range guard latched and
  Safe Idle subsequently confirmed both torque read-backs false. Do not use
  another full-range step for the remaining basis check; return both unloaded
  planes manually to neutral while torque is off and use an 8-degree
  differential diagnostic, leaving margin inside the production envelope;
- after manually returning both torque-off planes to neutral, the 8-degree
  differential check adopted homes `2053 / 3091` and reached Present Position
  `2145 / 3001` for commands `2144 / 3000`. Both axes tracked within one pulse
  at 5.1 V, remained `armed` with `fault=none`, and reported no hardware error.
  The operator observed opposite physical rotation, so the corrected relative
  mapping now passes both common and differential basis checks. A zero command
  returned both Present Positions exactly to their session homes, and Safe
  Idle confirmed `ready_torque_off`, both torque flags false, 5.2 V, and no
  fault. Remaining direction work is the absolute handled-device/model
  polarity check, not another thumb/index relative-sign change;
- the device-frame image then built successfully for both
  `m5stack-atoms3-pipeline` (`45012 B` RAM, `610289 B` flash) and
  `m5stack-atoms3-pipeline-tilt-espnow-monitor` (`69924 B` RAM, `1056329 B`
  flash), passed schema fixtures and `git diff --check`, and uploaded to COM3.
  Its stationary transformed model state remained neutral (`energy=0`,
  `pos` approximately zero). Boot plus two Safe-Idle `tilt clear` attempts did
  not receive either DXL ID and retained a communication fault. No arm or
  direction command was issued. Reported torque flags were false, but without
  device replies this is not torque-off read-back evidence; restore the DXL
  power/interconnect before the parallel-axis direction check;
- post-change PlatformIO builds passed for `m5stack-atoms3-pipeline`,
  `m5stack-atoms3-pipeline-tilt-espnow-monitor`, and the P-gain motion probes.
  `git diff --check` reported no whitespace errors. The `native-layers` suite
  could not compile on this PC because no `gcc`, `g++`, `clang`, or MSVC `cl`
  executable is installed; this is a host-toolchain gap, not a test assertion
  failure, and the native suite remains to be run on a configured host;

This passes step 1, one short instance of steps 3--4, stationary communication
continuity, and the communication fail-safe/recovery portion of step 6. It does
not yet replace a clean moving 20-second production tilt run with adequate
tracking, three arm/disarm repetitions, remote stop while armed, the IMU
fault-injection case, or the combined servo+haptic run.

## 7.2 Remote transport robustness

### 7.2.1 ESP-NOW to StampC5 Haptic Link

The first cable-free AtomS3 bench link is the bidirectional ESP-NOW path in
document 28. It is independent of the later SoftAP/WebSocket work below.

- build `m5stack-atoms3-pipeline` and verify its dependency graph and status
  keep ESP-NOW compile-disabled
- build `m5stack-atoms3-pipeline-espnow-monitor` and
  `m5stack-stampc5-espnow-bridge` sequentially; do not share one PlatformIO
  build directory between concurrent invocations
- verify the AtomS3 boots with its ESP-NOW runtime flag OFF and that ON/OFF is
  rejected outside Safe Idle or while audio is not silenced or tilt is armed
- verify the StampC5 reports channel 6 and packet size 200, then receives
  advancing valid packets after `espnow link on`
- require wire-v2 tilt state and two-device health fields to match
  `schemas/espnow_telemetry_wire_v2.json`; retain a receiver regression for the
  164-byte wire-v1 packet
- validate the wire-v1 size, field offsets, reserved byte, enum/boolean ranges,
  finite floats, preset termination, and CRC against
  `schemas/espnow_telemetry_wire_v1.json`; corruption and wrong length must be
  rejected without emitting JSON
- validate reconstructed JSON against `schemas/telemetry_frame.schema.json`
  and compare representative fields with a simultaneous local AtomS3 snapshot
  before removing the AtomS3 USB cable
- validate 140-byte control and 88-byte response layouts, CRCs, operation/result
  bounds, request IDs, and session IDs against
  `schemas/espnow_control_wire_v1.json`
- require auto-pair only after local AtomS3 Safe-Idle enable; reject a different
  source, zero/stale request ID, wrong session, and non-Hello request before
  pairing
- while StampC5 remains running, restart the paired AtomS3 radio; require the
  telemetry sequence rollback to increment `sequence_resets`, invalidate the
  old session/pending request, auto-pair a new session, and accept a subsequent
  `get state`
- verify `get state`, `live`, and `stop` return matching execution ACKs; Live
  must leave audio gated OFF, and stop must be followed by Idle, audio OFF,
  output silenced, zero actuator summaries, and tilt disarmed
- verify `audio on` is rejected outside Live, preset and set-param changes are
  rejected outside Safe Idle, and an unlisted parameter is rejected
- verify a permitted numeric property change in Safe Idle is reflected in a
  later state frame, while `trigger_event` returns unsupported until its shared
  pipeline ingress is implemented
- reset bridge statistics and run a short stationary capture at the configured
  10 Hz; require valid packet growth with no invalid packet, queue-drop,
  wrong-length, serialization, response, command-send, or timeout errors, and
  record any sequence gaps rather than hiding them. Reset counters after opening
  USB because output drops while no host is draining the port are expected
- with output still disabled, compare Atom radio runtime OFF and ON for resets,
  IMU validity, false events, audio underruns, and unexplained mass-energy rise
- after that muted check passes, use the StampC5 tether for free-motion
  orientation and substantive haptic tests; the AtomS3 USB cable may be removed
  so it cannot bias the device pose
- verify local AtomS3 BtnA Safe Idle remains effective while radio telemetry is
  active and that a newer received frame reports Idle, audio runtime disabled,
  output silenced, zero actuator summaries, and tilt disarmed
- remember that neither telemetry loss nor a missing ACK proves a stop; local
  on-device safety remains authoritative
- verify `espnow link off` in Safe Idle deinitializes ESP-NOW and powers
  Wi-Fi off; reconnect local USB before changing the observer state or flashing

### 7.2.2 Retained SoftAP/WebSocket and future interactive transport

- verify a partial or malformed WebSocket frame does not stall IMU polling or haptics updates
- for retained StickS3 and later station-mode targets, verify both
  `iface.wifi_mode_ap=true` and `iface.wifi_mode_ap=false`
- before enabling any interactive AtomS3 wireless environment, verify missing or invalid
  run modes are rejected rather than treated as Live
- verify telemetry-only Monitor policy cannot mutate any state, including
  arm audio/tilt, start Live/calibration/replay, change an output limit, load a
  mutating preset, disable an IMU safety, or inject a command directly into the
  execution queue
- verify oversized frames, receive flooding, queue-full, slow clients, and
  reconnect loops remain bounded and increment truthful diagnostic counters
- verify inbound and outbound size limits separately; serializer overflow,
  missing required output, or partial socket writes never publish a truncated
  telemetry frame
- verify missing/corrupt credentials plus SoftAP, bind, and server-start
  failures leave networking disabled and expose a truthful USB-readable reason
- verify the normal `m5stack-atoms3-pipeline` remains remote compile-disabled;
  interactive wireless work uses a separate environment
- begin interactive validation at one SoftAP client and 5 Hz telemetry, with host-side NDJSON capture
  rather than LittleFS storage
- verify local Wi-Fi runtime OFF/ON switching is accepted only in Safe Idle
  with audio zero and tilt disarmed; select and verify the radio state before
  any powered arm rather than toggling it during Live
- perform powered wireless evaluation only after the USB Gate 1 settling
  sequence passes; keep a production compile-OFF regression, then compare the
  same observer binary with Wi-Fi runtime OFF and ON under fixed 5 Hz,
  slow-client, reconnect, and malformed-load scenarios
- freeze timing/heap/IMU-age tolerances and run frame count from the OFF
  baseline before viewing ON results; compare normalized missed-4-ms-period
  rates, enforce the predeclared hard maximum gap, and require no I2S
  error/underrun growth, reset, post-warm-up heap regression, or Wi-Fi-only
  self-excitation
- under receive load, measure local BtnA/USB detection-to-software-zero and
  DMA-to-line-silence deadlines separately
- treat this path as wireless telemetry first and separately gated bounded
  bench control only at Slice 8 or later, not as a replacement for USB/JTAG
  crash debugging
- before Slice 8 control, verify every mutating request uses a
  session-nonce/request-sequence/body-bound HMAC (or a trusted WSS bridge),
  lease expiry is based on device monotonic time, and the XL330 torque-off
  request plus independent watchdog enforce a stop deadline within 500 ms of
  the last valid authority renewal; read-back is confirmation only when
  communication remains available
- follow document 25 for command policy, timing budgets, evidence capture, and
  the separately deferred OTA gate

## 7.3 WebXR / smartphone visual demo

- from `webxr/`, verify `npm.cmd run typecheck` passes
- from `webxr/`, verify `npm.cmd run build` passes
- verify the phone mode opens in a mobile browser without requiring WebXR
- verify touch drag changes the virtual container tilt and the rendered content response
- verify optional DeviceOrientation control only starts after explicit user permission
- verify the preset selector changes liquid / granular / hybrid visual behavior using `presets/*.json`
- verify box presets render as hand-scale 7 cm cubes in WebXR without changing the firmware preset files
- verify the `liquid_cylinder_bottle` selector entry renders a cylindrical bottle with a circular liquid body/surface
- verify the `liquid_plastic_tumbler` selector entry renders a tapered plastic cup with an open rim and tapered liquid body
- verify the Quest 3/3S path starts from an HTTPS URL in Quest Browser
- verify the MR path requests hand tracking as optional WebXR support and near-grab attaches the container when a tracked hand approaches
- verify the grabbed container follows the estimated grab position without requiring pinch, using wrist-centered fallback when finger joints are incomplete
- verify an open thumb-index opposing grasp centers the object between the fingertips without forcing an unnatural object orientation
- verify near-grab hides the app-rendered raw hand mesh for the active hand and shows only the two contact markers around the object
- verify release and Reset Object restore the app-rendered hand mesh and hide the contact markers
- verify the spatial experiment panel is visible in MR and does not depend on the phone DOM HUD
- verify controller ray selection can activate a preset row and move the panel sliders
- verify controller ray selection or fingertip direct touch can trigger the spatial Reset Object button
- verify Reset Object releases the active grab, applies a short re-grab cooldown, and respawns the object at the table rest pose
- verify index fingertip direct touch only activates the panel when the fingertip is near the panel face
- verify panel slider changes visibly affect content motion boost / damping preview without changing repository presets
- verify the IWSDK/IWER development path can open the app on desktop without a headset
- verify `npm.cmd run quest` prints a Cloudflare Quick Tunnel URL and serves the production preview without Vite HMR errors
- verify liquid and hybrid content remains visibly contained inside the transparent shell during strong tilt
- verify the visual client does not require firmware, schema, or transport changes in v1

## 7.4 WebUSB / Quest transport probe

- from `webxr/`, verify `npm.cmd run typecheck` passes
- from `webxr/`, verify `npm.cmd run build` emits `dist/webusb.html`
- open `/webusb.html` on desktop Chrome and confirm the status strip reports
  secure context, WebUSB, and native Web Serial feature detection
- open `/webusb.html` in Quest Browser from an HTTPS tunnel or static HTTPS host
- record whether `navigator.usb` and `navigator.serial` are present
- connect an Atom S3 / ESP32-S3 over USB-C and verify the device chooser can see
  the target VID/PID
- verify descriptor output lists configurations, interfaces, and endpoints
- attempt to claim the CDC data interface or a vendor-specific bulk interface
- verify `Set DTR/RTS`, `Read Once`, `Read Loop`, and `Send USB Payload` against
  a simple echo firmware
- if CDC cannot be claimed, repeat with a TinyUSB vendor-specific interface
  using interface class `0xff` plus bulk IN/OUT endpoints
- do not treat this probe as the final live transport until repeated Quest
  browser sessions show stable permission, read, and write behavior

## 8. Recorder / replay validation

- recorded sessions must replay latent state evolution deterministically enough for debugging
- event counts and actuator summaries should match within expected tolerance
- stop recording before `recorder.flush_interval_frames` is reached and verify the tail frames are still persisted
- record firmware/build identity, target profile, preset source/path, resolved
  parameter snapshot or hash, calibration identity, and effective audio limit
  before calling a session reproducible
- until those fields are persisted automatically, store them in the external
  test record; the current NDJSON preset name alone cannot distinguish a
  built-in preset from a same-named LittleFS overlay

## 9. Acceptance criteria for first full haptic milestone

The first meaningful milestone is reached when:
- four-channel sweep and per-channel resonance storage work,
- `wall_hit` is rendered spatially,
- at least one granular preset and one liquid preset produce clearly different 4-channel output statistics,
- the scaffold remains buildable and documented.

The algorithms and storage scaffold exist, but this milestone is **not yet a
complete production hardware pass**. The original powered settling failure was
corrected, and the assembled AtomS3 has since passed static/pulse settling,
mounted four-wall identity, dynamic opposite-direction localization,
liquid/granular/hybrid distinction, geometry-dependent collision density, and a
30-second no-retrigger check. Material naturalness and adjacent-wall/SOA tuning
remain open. Record/Replay was explicitly deferred after a non-formatting
LittleFS mount failure, the shortened soak is not thermal/endurance evidence,
and the unloaded qualitative sweep did not identify a clear resonance.

Hardware status and current software checkpoint after the audio-backend milestone:
- dual-stereo I2S x2 backend compilation is in place
- additive single-port eight-slot TDM is implemented
- runtime enable and single-wall test mode are in place
- runtime-selectable `quad_wall_4ch` / `front_back_2ch` output layout is now in place
- dedicated raw AtomS3 TDM channel routing passed on hardware
- the uploaded `2026-08-22` `m5stack-atoms3-pipeline` image built successfully
  (RAM 12.4%, flash 17.0%) with Safe Idle, Atom production safety telemetry,
  initial 8% / hard 15% output limits, and the servo backend compiled out
- the unuploaded `2026-08-28` software checkpoint builds at
  `42,932 / 327,680` RAM and `578,377 / 3,342,336` flash
- production upload, USB-only software-zero boot, powered muted startup,
  unloaded four-channel routing, live-test Safe Idle, and explicit re-arm
  behavior passed; the later corrected image also passed powered settling,
  controlled IMU-stale recovery, repeated arm/disarm, material comparison,
  mounted localization, geometry A/B, and a short no-retrigger soak. The exact
  remaining demo and quality work is summarized in documents 08 and 16

Current status after the calibration milestone:
- runtime sweep/store is in place using an IMU-proxy ratio metric
- carrier estimates are restored from and stored to NVS
- stronger identification remains future work

Current status after the geometry-aware mass/event milestone:
- mass motion uses container span, fill/headspace, and material family to shape normalized dynamics
- `wall_hit` uses wall-zone entry plus wall-direction velocity and size-dependent cooldown

Current status after the liquid/hybrid/render milestone:
- liquid and hybrid families now use stateful burst scheduling rather than per-tick placeholders
- texture rendering now uses stateful atom voices
- spatial rendering now includes SOA-aware flow distribution

Current status after the directional-flow / detented refinement:
- `event.wall_threshold`, `event.splash_threshold`, and `texture.hard_ping_high_ms` now affect the runtime haptic path rather than remaining dormant parameters
- `flow_ripple` now preserves motion direction through texture/resonance/spatial routing and uses physical wall adjacency
- detented presets now emit discrete detent-like ticks plus intermittent scrape instead of a per-frame scrape placeholder

Current status after the detent-click / single-marble refinement:
- detented `WallHit` events now render through a dedicated `detent_click` atom with stronger low-carrier emphasis on the current bench
- the built-in preset set now includes `granular_single_marble_box` for a `5 cm` box with one marble-like particle

Current status after the recorder/remote/servo milestone:
- NDJSON recording and IMU replay are available through the console path
- SoftAP + WebSocket JSON control/telemetry is available in `m5stack-sticks3-remote`
- a compile-gated legacy DATA+DIR XL330 path is available in
  `m5stack-sticks3-tilt`
- AtomS3 DXL communication and bounded unloaded motion passed dedicated probes;
  its production TX/RX automatic-half-duplex adapter is now implemented behind
  separate compile/runtime gates, with the current powered acceptance result
  recorded in section 7.1

Current status after the tilt pseudo-force revision:
- thumb/index commands now keep the existing base tilt and add a filtered low-frequency pseudo-force correction
- telemetry now exposes base tilt, pseudo-force delta, apparent mass, CoG, common force, and differential torque
- dedicated tilt builds additionally expose the DXL state machine and
  per-device identity, torque, current, voltage, temperature, position, and
  fault read-back; the baseline image remains compile-disabled
- mounted sign calibration, perceptual scaling, current-based position
  behavior, and completion of the powered production acceptance remain future
  work

Current status after the shaker-family event milestone:
- granular `roll_train` is now emitted as a rate-driven event train tied to wall contact and tangential motion
- granular `impact_cluster` density now scales with container span, particle properties, and rolling activity
- granular `scrape` now uses intermittent cooldown-based scheduling instead of a per-tick placeholder
