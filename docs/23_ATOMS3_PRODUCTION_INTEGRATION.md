# 23 AtomS3 Production Integration

## 1. Purpose and current status

This document is the contract for the first production-oriented firmware slice
on the assembled `M5AtomS3_MAX98357A_4CH_TDM_DXL2` board. The slice joins the
shared IMU-driven four-layer haptic pipeline to the verified four-channel TDM
transport while deliberately leaving production servo actuation disabled.

Status on `2026-08-22`:

- source implementation: complete for this slice
- final `m5stack-atoms3-pipeline` build including Safe Idle, safety telemetry,
  and IMU stale safe-stop: SUCCESS
- RAM: `40,524 / 327,680 bytes` (`12.4%`)
- flash: `568,297 / 3,342,336 bytes` (`17.0%`)
- production image upload: SUCCESS over COM3 with S1 OFF and 12 V OFF
- USB-only software-zero boot: PASS (`audio=0`, `zero=1`, `driver=1`,
  `transport=tdm8_slot`, `layout=quad_wall_4ch`, `limit=0.080`, `errors=0`,
  `imu_stop=0`, `tilt=0`)
- powered muted startup: PASS with 12 V and S1 ON; no unexpected vibration,
  pop, heating, or other anomaly observed
- unloaded channel routing: PASS; Front/CH1, Back/CH2, Top/CH3, Bottom/CH4
  each actuated alone, with `errors=0`
- live channel-test Safe Idle and explicit re-arm rule: PASS; `stop` asserted
  zero and cleared state, and `live` alone remained `audio=0`, `zero=1`
- live four-layer hardware output: FAILED the first powered settling check.
  `liquid_small_box` responded after a light movement at the 8% limit, then
  decayed but did not stop while held still. A separate eight-second muted
  stationary observation had no event and zero drive with energy near `0.058`,
  so muted evidence does not establish closed-loop stability. Safe Idle after
  the failure passed with `energy=0`, `audio=0`, `zero=1`, and `errors=0`.
  Continue from `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md`.

The earlier TDM and combined-probe passes are supporting evidence, not a pass
of this firmware image.

Software follow-up checkpoint on `2026-08-28` (not uploaded or powered):

- the as-built profile now opts into the default-off gravity-separated activity
  path documented below
- the current image builds at `42,932 / 327,680` RAM and
  `578,377 / 3,342,336` flash
- native activity, time/reset, alias, and all-family quiet-gate regressions pass
- canonical `frame_counter`, `new_evt`, and `evt_total` plus the passive host
  evidence runner are ready
- these software results do not replace the failed powered observation above;
  the only next hardware procedure is document 24, not a restart of section 6

## 2. Architecture boundary

The active haptic path is:

```text
AtomS3 IMU
  -> motion activity filter (activity branch; raw X/Y retained for position)
  -> mass motion
  -> events
  -> texture atoms
  -> resonance projection
  -> four-wall spatial renderer
  -> DriveFrame4
  -> AudioOutput4Ch / TDM8
  -> MAX98357A CH1..CH4
```

The separate low-frequency path remains:

```text
mass state -> tilt pseudo-force model -> future AtomS3 DXL adapter -> XL330 x2
```

The second path is not active in this slice. The existing servo backend is for
the legacy StickS3 DATA+DIR interface. The as-built board instead uses GPIO1 TX
and GPIO2 RX with automatic half-duplex, so
`m5stack-atoms3-pipeline` sets `HAPTICS_ENABLE_TILT_SERVO=0`.

## 3. Fixed production profile

`HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE=1` applies these settings after the
built-in material preset is created:

| Setting | Value |
|---|---|
| Board | M5AtomS3 |
| TDM pins | BCLK GPIO5, frame sync GPIO6, DOUT GPIO7 |
| Audio transport | `tdm8_slot` |
| Format | 48 kHz, 16-bit, PCM short, eight slots |
| Slot map | 0 Front, 1 Back, 2 Top, 3 Bottom, 4..7 zero |
| DMA | length 240, count 12 |
| Output layout | `quad_wall_4ch` |
| Boot runtime arm | disabled |
| Muted-driver policy | driver installed, zero samples submitted |
| Mass activity input | gravity-separated path enabled; 1 Hz gravity LPF, 10 Hz motion LPF, 0.025 g / 1.5 deg/s radial subtractive deadbands |
| IMU stale safety | enabled; 300 ms without a valid finite sample |
| Controlled IMU fault diagnostic | compile-enabled only here; local serial runtime OFF by default |
| Safe Idle | USB serial `idle` / `stop`, or AtomS3 BtnA hold |
| Safety telemetry | always-present audio zero and top-level safety state |
| Output gain | 1.0 |
| Initial effective peak | 0.08 (8% normalized PCM full scale) |
| Compile-time hard peak | 0.15 (15% normalized PCM full scale) |
| Remote backend | compiled out |
| Servo backend | compiled out |

The profile explicitly enables gravity-separated mass activity, physical
master-gain application, attack-preserving texture decay, single-shot spatial
delay, and the IMU stale safe-stop. Those flags remain false in generic presets
so legacy default behavior does not change.

The final peak clamp is applied after carrier/noise mixing, output gain, and
the opted-in resonance master gain. The effective limit is
`min(audio.output_peak_limit, 0.15)`. Percentages here are digital PCM peak
limits, not amplifier power, displacement, or perceptual-strength percentages.

## 4. Safety invariants

- Boot may start TDM clocks, but it must write digital zeros.
- Nonzero pipeline output on the AtomS3 production profile requires an explicit
  USB serial `audio on` command.
- `audio off` must return the running driver to zero output.
- Safe Idle must end Calibration/Replay/Record, submit zero, turn audio runtime
  OFF, disarm tilt, clear channel test, reset every dynamic layer, and enter
  Idle.
- After Safe Idle, `live` alone must not restore output; a fresh `audio on` is
  required.
- The gravity-separated activity path accepts only finite valid IMU samples and
  finite positive frame time. A malformed/non-positive time step is rejected
  without advancing filter or downstream state.
- While a sample is missing or non-finite, elapsed sensor time accumulates and
  Mass/Event/Tilt state is held; existing Texture/Resonance/Spatial tails still
  advance on raw wall-clock time.
- Recovery through an accumulated gap of at most `50 ms` integrates Mass/Event
  in no-more-than-`4 ms` stable substeps, capped at 64. A gap strictly greater
  than `50 ms` resets the dynamic pipeline to neutral and holds Tilt until a
  fresh baseline is established. Dynamics that cannot satisfy the bounded
  subdivision also reset to neutral, but additionally submit neutral Tilt and
  disarm the runtime servo interface. Fix the parameters and explicitly re-arm
  Tilt; parameter recovery alone must not resume actuation. The first baseline
  sample must not manufacture an event.
- Audio transport, demo compatibility, and layout may change only while audio
  runtime is OFF. Demo compatibility must be rejected on `tdm8_slot`.
- `audio.output_silenced` and top-level
  `safety.{imu_stale_safe_stop,audio_zero_asserted,tilt_disarmed}` are software
  assertions, not physical switch or DYNAMIXEL read-back.
- S1 is manual and firmware cannot observe it. `driver=1` or `enabled=0` says
  nothing about the physical S1 position.
- All wiring changes require S1 OFF and 12 V removed.
- The 8% profile limit is the initial integration level.
- The 15% hard ceiling reflects short unloaded burst evidence only. It is not
  authorization for continuous-wave, long-duration, or mounted operation.
- A request above 15% must be clamped, logged as the smaller effective value,
  and never bypass the compiled ceiling.
- More than 300 ms without a valid finite IMU sample must reset the Mass,
  Event, Texture, Resonance, Spatial, and Tilt model states to neutral, force
  TDM DMA to zero, and disarm an enabled servo interface. Once asserted, this
  stop is latched across valid-sample recovery; only Safe Idle may clear it,
  after output has been silenced/disarmed and with a fresh 300 ms monitoring
  epoch.
- Only `m5stack-atoms3-pipeline` defines
  `HAPTICS_ENABLE_IMU_FAULT_INJECTION=1`. Local `imu fault on` merely marks
  post-poll samples invalid; the existing stale path remains the sole owner of
  zero/reset/disarm. Begin and Safe Idle clear it, runtime defaults OFF, and no
  preset, generic `set_param`, WebSocket, replay, or remote path can arm it.
  Recover a completed injected or natural stop with `idle`, never by restoring
  valid samples while audio remains armed.
- This image must not send a DYNAMIXEL torque-on or motion command.

## 5. Supporting probe evidence

On `2026-08-22`:

- the raw TDM probe verified 48 kHz/16-bit PCM-short eight-slot framing,
  CH1--CH4 slot isolation/order, zero-filled idle, and zero I2S errors
- unloaded CH1 short bursts passed at 5, 8, 10, 12, 15, 18, and 20%; about 15%
  was judged practically sufficient, while 20% remains only a short-test ceiling
- the combined probe passed equal four-channel low-duty bursts at 8% and 15%
  while both unloaded XL330 units moved and the IMU remained active
- the combined 8% run recorded ID1/ID2 peaks of 15/13 mA, 5.1 V,
  32/31 C, 302 IMU updates, and zero I2S errors
- the combined 15% run recorded 14/13 mA, 5.1--5.2 V, 32/31 C,
  282 IMU updates, and zero I2S errors
- both runs returned home and torque-off without an observed abnormality

Those probes used unloaded hardware, fixed servo motion, and identical
low-duty waveforms on all four haptic channels. They did not exercise the
four-layer spatial pipeline.

## 6. Historical first-upload procedure (superseded)

This section preserves the original first-upload sequence and its historical
acceptance contract. For the corrected Gate 1 image and the next hardware
session, `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md` governs the entire order and
acceptance procedure; do not resume partway through this older sequence.

> **Do not execute this section for the next Gate 1 session.** Document 24 is
> the only active runbook and its static-first, single-pulse, power-cycle,
> six-orientation, IMU/Safe-Idle/configuration, and repeated-arm/soak gates must
> pass before the later material/spatial quality work; that order must not be
> rearranged.

### 6.1 Prepare and upload

1. Label the physical outputs Front/CH1, Back/CH2, Top/CH3, Bottom/CH4.
2. Mechanically unload the transducers for the first production run.
3. Set S1 OFF and remove 12 V. Leave the XL330 linkage mechanically safe; the
   firmware servo backend is compiled out.
4. Build and upload `m5stack-atoms3-pipeline`.
5. Open the 115200-baud USB serial monitor.

### 6.2 USB-only silent boot

Require the startup log to show successful IMU and pipeline initialization and
the AtomS3 as-built profile. Then run:

```text
status
audio status
tilt status
```

Pass only if:

- the IMU is valid and continues updating
- `audio status` reports `driver=1`, `transport=tdm8_slot`,
  `layout=quad_wall_4ch`, `enabled=0`, `zero=1`, effective `limit=0.080`, and
  zero errors
- the driver remains installed with digital-zero output;
  `audio.output_silenced=true`, `safety.audio_zero_asserted=true`, and
  `safety.tilt_disarmed=true`
- no servo moves and no production servo backend is present
- reset and repeated status requests do not arm output

### 6.3 Apply amplifier power while still silent

1. Keep S1 OFF and apply 12 V.
2. Confirm the 5 V audio rail and normal idle behavior.
3. Set S1 ON while `enabled=0`.
4. Require no pop, vibration, reset, unexpected current rise, or heating.

If anything is abnormal, set S1 OFF first, remove 12 V, and stop the test.

### 6.4 Verify four-wall routing at 8%

For each wall, preselect the wall while output is disabled, arm only for the
short observation, then disarm:

```text
audio test front
audio on
audio off
```

Repeat with `back`, `top`, and `bottom`. Keep each armed interval as short as
needed to identify the channel and keep S1 accessible. Require:

- only the expected physical wall responds
- no unexpected inter-channel output or pop
- `audio off` returns to silence every time
- error count does not increase

Finish with `audio test off`.

### 6.5 Historical live-pipeline step (not reusable)

The former move/material/soak order was invalidated by the failed settling
observation and is intentionally not reproduced here. Use document 24 from its
first prerequisite through final Safe Idle; liquid must pass the static and
single-pulse Gate 1 criteria before granular comparison or soak is permitted.

### 6.6 Verify Safe Idle and explicit re-arm

Exercise each available active mode separately:

1. enter Calibration, then run `stop`
2. start Record, then run `idle`
3. start Replay from a known short record, then run `stop`
4. while live audio/channel-test is active, hold AtomS3 BtnA

After every transition, require:

- `mode=idle`, recording/replay/calibration inactive
- `audio=0` and `zero=1`
- channel-test disabled and no selected wall
- neutral mass, event, actuator, and tilt summaries
- top-level `safety.audio_zero_asserted=true` and `tilt_disarmed=true`

Then run `live` only. Require output to remain OFF and zero asserted. Run
`audio on` separately to prove that output returns only after explicit re-arm,
then return to Safe Idle.

### 6.7 Verify muted-only audio configuration

With audio runtime ON, attempt demo-mode and layout changes through serial, and
exercise `audio.transport` through the control-message/unit harness because the
Atom production console does not expose a transport command. Require rejection
with the prior configuration retained. Then enter Safe Idle and verify supported
changes may be applied while muted. With `tdm8_slot` selected, require
`audio diag on` or an equivalent `audio.demo_compat_mode=true` request to be
rejected. Restore
`tdm8_slot`, `quad_wall_4ch`, demo mode OFF, and the 8% limit before proceeding.

### 6.8 Verify the hard clamp without authorizing a 15% run

With runtime output disabled, run:

```text
audio limit 0.20
audio status
audio limit 0.08
audio status
```

The first status must report an effective `0.150`, proving the compile-time
clamp. Do not arm output at that setting during the first integration pass.
The final status must return to `0.080` before the test continues or ends.

## 7. Production acceptance record

Mark each item independently:

| Item | State on 2026-08-22 |
|---|---|
| Source-level AtomS3 TDM integration | implemented |
| AtomS3 production build | passed |
| Raw TDM transport and routing probe | hardware passed |
| Combined fixed IMU/servo/equal-4CH probe at 8% and 15% | hardware passed |
| Production image USB-only silent boot | passed with S1 OFF and 12 V OFF |
| Production four-wall channel mapping | passed unloaded; CH1/CH2/CH3/CH4 isolated |
| Production live IMU-driven four-layer output at 8% | failed powered settling: response decayed but did not stop; Safe Idle passed; follow document 24 |
| Production 300 ms IMU stale safe-stop and clean recovery | local controlled injector implemented; hardware observation pending |
| Safe Idle from Calibration/Replay/Record/live output and BtnA hold | live channel-test passed; other modes and BtnA pending |
| Live-after-Idle remains muted until explicit `audio on` | passed |
| Always-present audio/safety telemetry | implemented and schema-validated; remaining production observations pending |
| Muted-only transport/demo/layout guards and TDM demo rejection | pending |
| Mounted spatial/material comparison | deferred to the post-safety quality gate |
| Production 8% soak and repeated arm/disarm | pending |
| Production AtomS3 servo adapter | not implemented; compiled out |

The production safety/transport slice passes when the pending haptic safety,
state-transition, configuration-guard, and 8% stability items above have dated
records. Mounted spatial/material quality is the next gate, not a prerequisite
that creates a cycle with section 8. Servo integration remains a later slice
and must not be folded into this acceptance by enabling the legacy backend.

## 8. Next implementation slice

After the haptic-only production safety/transport slice passes:

1. perform mounted per-wall amplitude, crosstalk, and resonance measurements
2. tune spatial/material parameters within the 8% initial and 15% hard limits
3. capture resolved preset/build/calibration identity in telemetry/recordings
4. implement the AtomS3 DXL TX/RX adapter with model/ID/mode/torque/watchdog
   read-back, fault latching, and hardware feedback telemetry
5. calibrate servo home/sign/raw direction and mounted mechanical stops
6. repeat the combined matrix before enabling tilt pseudo-force perception tests
