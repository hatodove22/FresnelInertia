# 23 AtomS3 Production Integration

> Historical snapshot; not a current task list or instruction to repeat tests. Current scope, facts, and demo acceptance are in ../../08_IMPLEMENTATION_PLAN.md, ../../16_PROGRESS_STATUS.md, and ../../07_TEST_AND_VALIDATION.md.

## 1. Purpose and current status

This document is the hardware and safety contract for production-oriented
firmware on the assembled `M5AtomS3_MAX98357A_4CH_TDM_DXL2` board. The baseline
image joins the shared IMU-driven four-layer pipeline to four-channel TDM while
keeping servos compiled out. Dedicated tilt builds add the guarded XL330 path
without changing that baseline default.

Status on `2026-09-05`:

- baseline and integrated demo firmware build successfully;
- USB-only silent boot, powered muted startup, four-wall routing, explicit
  re-arm, Safe Idle, IMU-stale shutdown, configuration guards, and a shortened
  no-retrigger soak passed;
- mounted wall identity, opposite-direction localization, material-family
  separation, and geometry-dependent collision density passed provisionally;
- the first historical settling failure was corrected by the feature-gated
  gravity-separated activity path and is no longer the active blocker;
- the guarded XL330 backend implements readback, bounds, watchdog, faults,
  session homes, and 100 Hz synchronized goals. Common/differential physical
  kinematics and useful gripped amplitude passed;
- cable-free ESP-NOW telemetry and bounded control through StampC5 passed;
- the remaining hardware blocker is intermittent local DXL continuity during
  handled motion. The latest run exhausted the bounded read retries, latched
  `communication`, and left ID 2 without a fresh status;
- Record/Replay remains deliberately deferred after a non-formatting LittleFS
  mount failure.

The earlier probe passes remain supporting evidence, not substitutes for the
integrated production observations recorded in document 07.

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
mass state -> tilt pseudo-force model -> guarded AtomS3 DXL2 adapter -> XL330 x2
```

The second path remains inactive in the baseline slice. The as-built backend is
compiled only by the dedicated `m5stack-atoms3-pipeline-tilt*` environments;
`m5stack-atoms3-pipeline` still sets `HAPTICS_ENABLE_TILT_SERVO=0`.

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
| Device-frame input | measured proper rotation enabled; internal `+x` thumb-to-index, `+y` up, `+z` wristward; telemetry remains raw |
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

The assembled IMU is rotated 45 degrees relative to the handled device. Static
gravity measurements with device `+y`, `+x`, and semantic-forward `+z` upward
established `B_x=-raw_y`, `B_y=(raw_x+raw_z)/sqrt(2)`, and internal right-handed
`B_z=(raw_z-raw_x)/sqrt(2)`. The as-built profile alone enables this model-input
rotation. Acceleration and gyro use the same proper rotation; USB/ESP-NOW
telemetry and recorder samples remain raw for protocol compatibility.

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
acceptance contract. It is retained only to explain the first hardware bring-up
and must not be treated as the current runbook.

> **Do not execute this section as a current procedure.** Use the active order
> in document 08, current state in document 16, and acceptance criteria in
> document 07.

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
observation and is intentionally not reproduced here. The corrected path and
subsequent evidence are recorded in documents 07 and 16.

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

| Item | State on 2026-09-05 |
|---|---|
| Source-level AtomS3 TDM integration | implemented |
| AtomS3 production build | passed |
| Raw TDM transport and routing probe | hardware passed |
| Combined fixed IMU/servo/equal-4CH probe at 8% and 15% | hardware passed |
| Production image USB-only silent boot | passed with S1 OFF and 12 V OFF |
| Production four-wall channel mapping | passed unloaded; CH1/CH2/CH3/CH4 isolated |
| Production live IMU-driven four-layer output at 8% | passed corrected static/pulse/30-second no-retrigger checks; longer endurance remains |
| Production 300 ms IMU stale safe-stop and clean recovery | hardware passed with the controlled injector |
| Safe Idle from Calibration/live output and BtnA hold | passed; Record/Replay deferred with storage |
| Live-after-Idle remains muted until explicit `audio on` | passed |
| Always-present audio/safety telemetry | implemented, schema-validated, and observed over USB/ESP-NOW |
| Muted-only transport/demo/layout guards and TDM demo rejection | passed |
| Mounted spatial/material comparison | four walls, opposite directions, families, and geometry passed provisionally; naturalness remains |
| Production 8% soak and repeated audio arm/disarm | short soak and three cycles passed; thermal endurance remains |
| Production AtomS3 servo adapter | implemented and functionally proven; handled-motion DXL continuity remains open |

The haptic safety/transport slice is sufficient for a short demonstration.
Naturalness and endurance remain research-quality gates. The tilt slice is not
accepted for an uninterrupted demo until a stationary hold and handled roll
complete without DXL communication-error growth.

## 8. Next implementation slice

For the current demo milestone:

1. restore a clean two-device torque-off preflight;
2. pass a 30-second stationary armed hold without communication-error growth;
3. pass one slow handled roll and explicit Stop;
4. keep the final cable arrangement fixed for the rehearsal;
5. then connect the existing browser client to the existing StampC5 command and
   telemetry surface.

After the demo, resume crosstalk/resonance measurement, material tuning,
configuration identity, repeated servo cycles, and endurance evidence.

## 9. Guarded AtomS3 tilt slice added 2026-09-04

The additive tilt environments preserve the baseline image and boot behavior:

- `m5stack-atoms3-pipeline-tilt`: local-console hardware validation
- `m5stack-atoms3-pipeline-tilt-espnow-monitor`: the same backend plus Haptic
  Link v2 telemetry and explicitly compiled remote arm authorization

Both start torque-off, verify IDs 1/2 and model 1190 at 57,600 bps, require
Position Mode 3, adopt each measured present position as the session home, and
limit commands to ±114 pulses (about ±10 degrees). Production sets Profile
Acceleration and Profile Velocity to zero, disabling the servo-side
point-to-point profile because the controller already filters, slew-limits,
clamps, and streams Goal Position at 100 Hz. The as-built tactile-evaluation
profile uses Position P Gain 2000, Goal PWM 600, a 1200 mA current abort, a
60 C temperature abort, Bus Watchdog 50, and the unchanged 4.5--5.6 V range.
Following a mounted direct-travel test that made `+/-10 deg` clearly
perceptible, this profile also uses pseudo-force gain `k_phi=4.0` with common,
differential, and combined delta limits of `5`, `10`, and `10 deg`. The final
logical command and raw calibrated travel remain bounded to `+/-10 deg` and
`+/-114 pulses`.
The next mounted direction A/B also sets the as-built pseudo-force signs for
both contact planes to `-1`. This reverses only the model correction after the
operator accepted stimulus strength but rejected its direction relative to
device tilt; it leaves the separately verified raw encoder signs unchanged.
The generic defaults and bounded motion probes remain at their earlier values.
This sign candidate predates the measured device-frame correction and must be
re-evaluated with that correction active. Physical inspection established that
the two servo rotation axes are parallel, not mirror-mounted. A subsequent
mounted differential logical test (`thumb=+10`, `index=-10 deg`) with the old
raw-direction pair `+1/-1` made both contact planes move in the same physical
direction. The as-built profile now uses `+1/+1`, preserving logical common as
physical common and logical differential as physical differential. Absolute
pseudo-force polarity remains a separate handled-device judgment.
This increase followed removal of the profile-replanning control fault and a
successful actively handled run; it is intended to produce meaningful motion
and holding authority in the actual gripped use case. Health reads alternate
between devices while a synchronized goal write services both at 100 Hz.

The earlier production setting of Profile Acceleration 1 and Profile Velocity
5 was inherited from the finite point-to-point probes. On XL330's
velocity-based profile, those values produce an acceleration interval of about
320 ms while production replaces the goal every 10 ms. A guarded reproduction
showed the read-back goal correctly bounded 17 pulses below ID1 home, but the
present position reached 68 pulses below home with a negative Present PWM before
the position guard stopped it. This rules out a malformed large Goal Position
and makes the repeatedly replanned internal trajectory the primary control-path
fault. The point-to-point probe images remain unchanged at profile 1/5.

The AtomS3 UART setup deliberately matches the passed combined probe: GPIO1 is
driven idle-high before `Serial1.begin`, the RX ring is enlarged to 512 bytes,
and the always-on echo path is parsed until a status packet arrives. Boot may
retry the torque-off/read-only preflight three times after short settling
intervals; these retries never arm torque or write a goal position.

The state machine is `Disabled -> Checking -> ReadyTorqueOff -> Arming ->
Armed -> FaultLatched`. Communication, identity, mode, torque, position,
current, temperature, voltage, hardware-error, command-age, or IMU-safety
violations attempt broadcast torque-off and latch re-arm. `tilt clear` is
accepted only in Safe Idle and reruns the full preflight. Powered acceptance is
tracked in document 07 and must not be inferred from a successful build.

Protocol 2.0 packets are byte-stuffed on transmit and unstuffed only after a
received frame passes CRC validation. This matters for the contiguous motion
status read: negative trajectory fields can naturally contain `FF FF FD`, so
parsing the stuffed payload directly shifts the following voltage and
temperature fields even though the packet CRC is valid. The production backend
therefore removes the extra `FD` before applying control-table offsets; a
stuffing or length inconsistency is treated as a communication failure rather
than as a physical supply or temperature fault.

Each register read may make up to two immediate retries. One or two isolated
lost status packets therefore do not strand routine arming or a health poll,
while three consecutive failures still latch `communication` and request
broadcast torque-off. At the 45 ms per-attempt timeout this adds at most about
92 ms before the existing fail-safe path (about 137 ms total); it does not relax
device limits, torque verification, or the one-second servo bus watchdog.

If all three read attempts fail, the fault path still requests torque-off and
latches `communication`. A later explicit `tilt clear` in Safe Idle now ends
and recreates the GPIO1/GPIO2 `Serial1` bus before running the torque-off
preflight. Boot preflight likewise recreates the UART between attempts, and a
final arm preflight recreates it before any RAM configuration or torque-on
write. The latter was added after two runs showed the same sequence: clear
preflight found both devices immediately after its UART restart, but the next
arm preflight lost ID1 when it reused that UART state. These restarts occur only
while torque is known OFF. They do not arm torque or write Goal Position.

Routine arming verifies Position Mode 3 during preflight but does not rewrite
the EEPROM-backed Operating Mode register. It writes only the conservative RAM
profile, Position P Gain when nonzero, PWM, watchdog, home goal, and final
torque-enable state. Each device is first confirmed torque-off and its retained
Bus Watchdog is cleared to zero; the home goal is then verified before watchdog
50 is re-enabled. This matches
the previously passed motion probe and avoids EEPROM wear and write-completion
latency on every arm.

The bring-up gain was based on direct profile-zero comparison under the unchanged
40-pulse and PWM-150 limits: gain 400 moved ID1 only 2 pulses, gain 800 passed
ID1 but stalled ID2 17 pulses short, and gain 1200 passed both axes. The final
run observed at most 58 mA, 5.1--5.2 V, and 36--39 C and completed with both
servos torque-off. Gain 2000 and PWM 600 are the subsequent gripped tactile
evaluation settings, not a reinterpretation of that unloaded probe result.

The first two short production motion checks with gain 1200 demonstrated real
bounded response but each encountered a different device's consecutive health
reply loss after roughly 4--5 seconds. The commanded/read-back goals remained
inside the 40-pulse window, observed Present PWM was at most 79 in those
snapshots, and explicit stop confirmed both torque read-backs false. Because a
subsequent Safe-Idle preflight recovered without changing control settings, the
remaining issue is DXL communication continuity rather than position-control
authority. The third read attempt above was added as a bounded tolerance for
isolated half-duplex reply loss; physical interconnect integrity remains part
of acceptance.

The three-attempt image subsequently completed an approximately eight-second
actively handled run while remaining `armed`, `fault=none`, and at zero
communication errors. A captured sample showed both axes displaced from their
session homes (ID1 `2055 -> 2065`, ID2 `3140 -> 3152`) with bounded goals. An
explicit stop then returned the backend to `ready_torque_off`; both torque
read-backs were false, fault remained none, and errors remained zero. This is a
short functional recovery result, not yet the required 20-second moving run or
three repeated arm/disarm cycles.

After the direct `+/-10 deg` test established clearly perceptible hardware
travel, the strengthened as-built application mapping produced a captured
normal-Live delta of `+5.32 / -5.60 deg`. Both Present Positions tracked their
software commands within one pulse at that sample; voltage, temperature, and
hardware error remained normal. The application mapping has therefore moved
beyond the earlier `1--3 deg` weak-response regime. The same run later stopped
on another isolated ID1 status-read loss, and explicit Safe Idle/clear
subsequently verified both torques OFF. Treat tactile quality as operator input
and DXL continuity as a separate remaining gate. The operator subsequently
accepted the stimulus strength but rejected its rotation direction relative to
handled-device tilt; the paired pseudo-force sign reversal above is the next
single-variable comparison. That candidate image subsequently built, uploaded,
booted with both devices valid and torque OFF, and completed one short armed
interval plus explicit Safe Idle with zero communication errors. After the
measured device-frame and parallel-motor corrections, the latest handled run
felt approximately correct in direction, but a local DXL communication fault
made the motion jerky before a definitive polarity judgment. Continuity is now
the blocker; relative common/differential kinematics are already accepted.

The no-motion `m5stack-atoms3-dxl2-probe` reports the servo-resident Goal
Position alongside Present Position and Present PWM. It also reads Drive Mode,
Homing Offset, PWM Limit, Min/Max Position Limits, Position PID and feedforward
gains, Bus Watchdog, Goal PWM, and trajectory profile with torque forced OFF.
This read-only control-table snapshot is required before another powered motion
attempt after unexplained travel to a mechanical stop.

The first upload with the measured device-frame transform remained
computationally neutral at rest, but boot preflight and two UART-recreating
Safe-Idle clears received neither ID1 nor ID2. The firmware did not arm or send
a direction-test goal. Both local torque flags were false, but absent replies
cannot confirm physical torque-off. This is an interconnect/power recovery
prerequisite, not a failure of the IMU transform or model-axis mapping.

After restoring the DXL interconnect, a bounded `+10/-10 deg` logical test
tracked from homes `2003 / 3086` to Present Position `2119 / 3201` for commands
`2117 / 3200`. Voltage, temperature, and hardware-error read-backs were normal,
and the operator identified same-direction physical motion. This is the direct
evidence for changing only the as-built index raw direction from `-1` to `+1`.
The local diagnostic now distinguishes `tilt test common <angle>` and
`tilt test differential <angle>`; the former short form remains a differential
alias.

The first post-upload common-mode check commanded logical `+10/+10 deg`, and
the operator observed both planes rotate counterclockwise together. The new
relative raw-direction mapping therefore passes common-mode orientation. The
instantaneous full-range diagnostic step made ID1 overshoot its bounded command
(home `2119`, command `2233`, Present Position `2264`), so `position_range`
latched and the differential test was not attempted. Safe Idle then confirmed
both torque read-backs false. Resume from manually restored neutral with an
8-degree differential check; production application commands remain filtered
and slew-limited rather than making this direct full-range step.

The resumed 8-degree differential check passed: homes `2053 / 3091`, Present
Position `2145 / 3001`, and raw commands `2144 / 3000`. The operator observed
opposite physical rotation, both axes remained armed and fault-free, and a
zero command returned both positions exactly to their session homes. Safe Idle
then confirmed both torque flags false and `fault=none`. Together with the
common-mode observation, this accepts `+1/+1` for relative kinematics; the next
test is absolute handled-device/model polarity.

Production health telemetry now treats `goal_position_raw` as the Goal
Position value read back from each servo, rather than the software-side value
about to be transmitted. The locally clamped command remains separate. While
armed, either a read-back goal outside home +/-114 pulses or a Present Position
outside that envelope plus an 8-pulse tracking allowance latches
`position_range` and requests torque-off. This guard does not arm at boot and
does not alter the baseline or tilt-disabled environments.

On `2026-09-04`, the first powered attempt did not pass the initial state gate:
both production preflight and the previously passed combined probe received no
servo status, and the dedicated no-motion scan found no device at IDs 0--10 on
either supported baud. After the DXL harness was reseated, both devices were
again found and passed the no-motion health/torque-off checks. The corrected
production image subsequently passed boot preflight and one roughly five-second
stationary arm/disarm cycle with zero communication errors and final verified
torque OFF. A later moving run exposed and then eliminated a missing Protocol
2.0 byte-unstuffing error; the corrected image no longer reports false voltage
or temperature values, but its first moving retry still latched one missing ID2
status packet about one second after arm. The remaining continuity issue must
be separated into stationary and motion-sensitive cases before the longer
acceptance matrix in document 07 can pass.
