# 24 AtomS3 Live Pipeline Follow-up

## 1. Handoff status

This is the restart point after the `2026-08-22` production-pipeline bench
session. Do not resume from an earlier probe procedure.

Software was left in verified Safe Idle on COM3:

```text
mode=idle
energy=0.000
audio=0
zero=1
driver=1
transport=tdm8_slot
layout=quad_wall_4ch
limit=0.080
test=0
errors=0
tilt=0
```

The firmware cannot observe the physical amplifier switch or 12 V supply.
Before leaving the bench, and again before the next session, the operator must
confirm S1 OFF and then 12 V OFF. The last powered test used S1 ON and 12 V ON;
only the software Safe Idle state was verified remotely at handoff.

The board still contains the pre-correction build recorded in
`23_ATOMS3_PRODUCTION_INTEGRATION.md` (`m5stack-atoms3-pipeline`, flash 568,297
bytes). The repository now contains the Gate 1 correction and 20 passing native
tests, but it has not been uploaded or exercised with USB or amplifier power.

## 2. Evidence recorded today

Passed:

- USB-only zero-data boot and truthful audio status
- powered muted startup
- isolated Front/CH1, Back/CH2, Top/CH3, and Bottom/CH4 routing
- Safe Idle and the explicit re-arm rule
- a software-muted stationary Live observation for eight seconds: energy
  settled near `0.058`, no event was generated, and all four drive summaries
  remained zero
- final Safe Idle after the failed Live check: energy zero, audio disabled,
  TDM zero asserted, channel test disabled, tilt disabled, and zero I2S errors

Not passed:

- powered `liquid_small_box` closed-loop settling at the 8% limit. After one
  light movement the vibration decayed but did not stop while the device was
  held still. The operator explicitly reported: `減衰はするけど止まらない`.
- therefore live four-layer output, self-excitation rejection, material
  comparison, directional validation, and soak remain incomplete

During re-arm, serial telemetry rose from approximately `energy=0.014` to
`0.127`; a `DropletCluster/Back` became the last reported event, and brief Back
drive summaries of about `0.11` and `0.03` were observed. `last_event` is
latched historical state, not proof that a new event occurred in each frame.
The physical non-stop observation is the decisive failure evidence.

## 3. Most likely mechanism in the failed image

The leading mechanism is a positive feedback path in the activity estimate:

```text
actuator vibration
  -> AtomS3 IMU
  -> raw accel/gyro magnitude
  -> MassState.energy
  -> liquid activity and event phase
  -> actuator vibration
```

Contributing implementation details:

1. `MassMotionLayer` uses raw `accel_g.x/y` for energy, including static gravity
   projected into the board plane.
2. The same path has no project-level gravity estimator, motion-band limit, or
   IMU noise deadband.
3. Liquid droplet phase advances while `liquid_activity > 0.04`; a static
   gravity-derived energy floor can keep activity close to or above that
   boundary after a real movement.
4. Carrier vibration can be aliased into the 250 Hz mass update and contribute
   positive energy even though the intended mass/activity channel is low
   frequency.

The muted stationary value `energy≈0.058` is consistent with raw planar gravity
projection and is below the liquid threshold by itself. The powered residual
shows that muted evidence is insufficient to prove closed-loop stability.

## 4. Implemented correction awaiting hardware validation

The repository correction is additive and leaves generic behavior disabled by
default. Only `applyAsBuiltAtomS3Profile()` opts into
`features.enable_gravity_separated_mass_activity`.

- quasi-static gravity uses a 1 Hz low-pass
- gravity-removed motion uses a 10 Hz low-pass
- radial subtractive deadbands are `0.025 g` and `1.5 deg/s`
- raw accelerometer X/Y still drives latent position
- the filtered three-axis activity sample is used only by energy/agitation;
  energy retains its planar X/Y magnitude and agitation uses 3D activity
- non-finite/non-positive `dt` returns with no side effect
- missing/non-finite IMU samples hold Mass, Event, and Tilt, while existing
  Texture/Spatial tails decay using raw loop time
- pending positive time plus a fresh valid sample evaluates the filter once at
  `<=50 ms`; Mass/Event use a parameter-derived stable substep capped at
  `4 ms` and 64 steps, while Texture/Spatial and Tilt advance once
- `>50 ms` resets all dynamic layers and holds Tilt for a fresh baseline;
  an invalid bound or unsupported substep count resets all layers, submits
  neutral Tilt, and disarms the runtime servo interface until explicit re-arm
- the first valid estimator sample establishes gravity with zero filtered
  activity and cannot generate an event
- all material families obey the enhanced zero-input quiet contract when
  there is no wall hit, `energy<=0.02`, and planar `speed<=0.04`; deliberate
  activity reopens their normal scheduler

The feature and four filter values are writable through `set_param` as
`features.enable_gravity_separated_mass_activity` and
`motion_activity.{gravity_cutoff_hz,motion_cutoff_hz,accel_deadband_g,gyro_deadband_dps}`.
The fixed 50 ms safety boundary is not a parameter. Current-frame `new_evt`,
`frame_counter`, and boot-cumulative `evt_total` are available in serial and
canonical telemetry; `last_event` remains historical.

Twenty native tests pass, including the reviewed feature-disabled legacy
fingerprint, seven static poses, fixed bias/noise, pulse settling, reset/time
boundaries, missing/invalid input, 1/4/8 Hz translation, and 70/90 Hz alias
attenuation. The matrix also covers all nine built-in presets across seven
poses, stability-bounded 50 ms recovery, and same-instance
quiet -> active -> quiet -> active scheduler behavior. Event thresholds and
output gain were not changed to mask the
failure. Wireless observation remains separate and must not be mixed into the
first USB/powered Gate 1 retest.

## 5. Required verification before upload

Build through the repository device workflow and keep all prior defaults:

- `m5stack-atoms3-pipeline`
- `m5stack-sticks3`
- `m5stack-sticks3-audio`
- `m5stack-sticks3-tilt`
- `m5stack-atoms3-dxl2-probe`
- `m5stack-atoms3-max98357a-tdm-probe`
- `m5stack-atoms3-combined-probe`
- schema samples if any telemetry schema changes
- `git diff --check`

The 20 native checks above pass, including the finite-posture acceptance:
after rotating to a new held orientation, `energy<=0.02` within two seconds and
summed `new_evt=0` for the following 30 seconds. The hardware run must repeat
that check. Do not require accelerometer-only logic to
distinguish indefinite continuous gravity rotation from translation at the
same frequency; those inputs are not identifiable without an additional
orientation/gyro model.

## 6. Next hardware sequence

Do not upload or emit a nonzero signal until the operator confirms the stated
power/switch gate.

### 6.1 One-time setup

1. Confirm S1 OFF and 12 V OFF.
2. Upload the newly built `m5stack-atoms3-pipeline` to the confirmed AtomS3 COM
   port.
3. With USB only, require `audio=0`, `zero=1`, `driver=1`, `errors=0`, and
   `tilt=0`.
4. Apply 12 V while S1 remains OFF; require no anomaly.
5. Set S1 ON while audio remains disabled; require no anomaly.
6. Enter Live and explicitly enable audio at the 8% effective limit.

Keep canonical USB telemetry OFF throughout this setup.

### 6.2 Mandatory one-attempt evidence envelope

Apply these four bookends around **every individual** static orientation,
S1 state, or pulse run below. Never put two measurements in one log or one run
plan. Keep the template's one `transport-sequence` check, one measurement
check, 500 ms gap bound, fixed `minimum_capture_duration_ms` (`33000` static,
`40000` pulse), and all signal/timing thresholds unchanged. The host checker
rejects a missing/duplicate check, a shortened capture, or any relaxed bound.

1. Prepare `liquid_small_box`, the exact orientation, S1/12 V state, Live mode,
   audio ON, TDM8/4CH configuration, and 8% limit while canonical telemetry
   remains OFF. Start a fresh unique mixed log. Use `gate1_run_variant=active`
   with S1 ON, or `s1_off_control` with S1 OFF; the latter is pulse-only.
2. With telemetry still OFF, record `usb telemetry status` and transcribe every
   field into `usb_telemetry_status_before`. Then issue `usb telemetry on`
   immediately before the measurement. Its first JSON frame is time zero; the
   plan must retain `timestamp_origin=first_frame` and
   `frame_counter_mode=monotonic`. Do not include pre-active idle/audio-OFF
   JSON. Every active canonical frame must contain `imu.valid=true`. Throughout
   the complete canonical log, keep channel test/demo/wall-test and IMU fault
   injection inactive and keep tilt disarmed.
3. Perform exactly one planned measurement. Then issue `stop` and retain at
   least one later canonical frame proving `idle`, zero Mass
   position/velocity/energy and actuators, `new_evt=0`, `last_event=None`,
   `audio=0`, `zero=1`, `test=0`, and `tilt_disarmed=1` with no audio-underrun
   growth and `evt_total` unchanged from the measurement-end frame. Keep the
   fixed Live/unsilenced context through the 33/40-second minimum-capture anchor;
   a Safe Idle frame cannot substitute for that powered end anchor. Static
   signal/event limits extend from assessment start through the 33-second
   anchor, including the first frame at/after assessment end. Pulse silence
   must qualify by the original settle deadline and remain unbroken through the
   40-second anchor. Then enter Safe Idle and retain at least one later proof
   frame. Between the active end and the final frame, every frame must either
   retain the fixed Live context or already satisfy the complete Safe Idle
   postcondition. Once any frame reaches Safe Idle, do not re-arm within the
   same log.
4. Issue `usb telemetry off` and `usb telemetry status`, transcribe the second
   line into `usb_telemetry_status_after`, end the log, and use a new run ID/log
   for the next attempt. Both snapshots require runtime OFF, `period_ms=100`,
   and pending bytes zero; the transmitted-frame delta must equal the canonical JSON frame count,
   and `dropped = backpressure + console_interrupt` in each snapshot. Dropped, backpressure,
   console-interrupt, unterminated-partial, and serialization-error counters
   remain unchanged. Any counter increase invalidates the attempt and requires
   a fresh run. Re-arm explicitly. Set S1 OFF before changing any powered
   condition or handling wiring.

### 6.3 Corrected settling gate

Run these in order with `liquid_small_box`; a failure stops progression.

1. With S1 ON, hold one orientation completely still for at least 33 seconds:
   allow the committed two-second warm-up, then require a full 30-second
   assessed interval plus its no-more-than-500-ms-late canonical assessment-end
   anchor. Maintain powered Live and the same unchanged `evt_total`,
   `new_evt=0`, no perceived vibration, actuator/energy limits, and no
   `audio.underrun_count` growth through the separate 33-second capture anchor.
2. With S1 ON, use the pulse template. Move lightly once at five seconds, then
   hold completely still. Require a perceptible response, tactile silence and
   `energy<=0.02` within two seconds, followed by 30 seconds with no new event.
   Keep powered Live and the quiet actuator/energy/event envelope through the
   40-second capture anchor; recurrence after the first 30-second quiet interval
   still fails.
3. Run a separate S1-OFF control with
   `tools/lab/plans/gate1-pulse-s1-off.template.json`. Canonical software Mass
   energy and actuator response must both reach their configured minima, but
   physical tactile output must be absent. Event counters remain integrity
   signals; a wall event is not mandatory for the bounded movement. Compare its
   settling/event envelope with a fresh S1-ON run;
   sustained activity or a large ON-only post-settle increase fails as
   mechanical feedback. Absence of tactile response with S1 OFF is a pass, not
   a failed pulse observation.
4. Repeat the static plan as six separate logs/plans in the six principal
   orientations. Static gravity may change latent position but must not sustain
   activity/events. After each finite pose transition, require
   `energy<=0.02` within two seconds and then `new_evt=0` for 30 seconds.

### 6.4 Remaining production safety gate

Only after section 6.3 passes:

1. Keep physical S1 OFF, confirm the effective output limit is `0.08`, and
   require `imu fault status` to report `compile=1 active=0`. Enter Live, issue
   an explicit `audio on`, and first require canonical frames to show the
   configured TDM8/4CH backend armed and unsilenced
   (`compile_enabled=true`, `runtime_enabled=true`, `driver_installed=true`,
   `transport=tdm8_slot`, `output_layout=quad_wall_4ch`,
   `active_output_channels=4`, `output_silenced=false`, and
   `safety.audio_zero_asserted=false`). Reconfirm 12 V ON. With that active
   digital-output state established but S1 still physically OFF, use the compile-gated local
   `imu fault on` diagnostic. Require
   `safety.imu_fault_injection_active=true` plus `imu.valid=false` in subsequent
   canonical frames. After more than 300 ms, while audio runtime remains armed,
   require `safety.audio_zero_asserted=true` and
   `safety.imu_stale_safe_stop=true`, neutral Mass, `new_evt=0`,
   `last_event.type=None`, zero actuators/TDM, and disarmed tilt. Texture,
   resonance, spatial, and Tilt-model resets are source/native-policy
   guarantees because those internal states are not all present in USB JSON.
   Issue
   `idle` as the mandatory recovery: it clears injection and disarms audio
   together. Once stale-stop is asserted, `imu fault off` is rejected; while
   injection or stale-stop is active, safety disable, Calibration/Record/Replay
   entry, new audio/channel-test/Tilt arm, and unsupported Tilt dynamics are
   also rejected. An unexpected non-Live mode transition fails closed to Safe
   Idle. The stale-stop latch must also remain asserted if valid physical IMU
   samples resume naturally; only the Safe Idle transition may clear it.
   Require `active=0`, Idle, audio zero, neutral state, and disarmed tilt;
   then enter `live` without `audio on` and require a fresh neutral baseline
   with no replayed event/tail before returning to Safe Idle. This is a
   dedicated safety record, not a static/pulse plan.
2. Exercise Safe Idle separately from Live, Calibration (`cal start`), Record
   (`record start`), Replay (`replay start <known-file>`), and active Live via
   AtomS3 BtnA hold. After every case require inactive operations, neutral
   dynamic state, audio OFF/zero, cleared channel test, and tilt disarmed.
   Natural Replay EOF must itself enter Safe Idle; it must never fall through
   to real-IMU rendering while telemetry still says Replay. `live` alone must
   remain muted until a fresh `audio on`. In a future Tilt-compiled profile,
   invalid/unsupported Mass stability bounds must reject re-arm without a
   torque pulse.
3. With runtime audio ON, require `audio diag on` and `audio layout 2ch` to be
   rejected without changing TDM8/4CH state. In Safe Idle, exercise supported
   muted layout changes, require TDM demo mode to remain rejected, and restore
   TDM8/4CH/demo-OFF. With audio OFF, request `audio limit 0.20`, require the
   effective `0.150` clamp without arming it, then restore `audio limit 0.08`.
   Retain the already-passing control/schema evidence for transport and
   rollback guards that the Atom console does not expose.
4. Complete the agreed repeated 8% arm/disarm matrix and soak. Require no
   reset, self-excited feedback, rail anomaly, abnormal heating, USB transport
   loss, or audio/I2S error growth, and finish every active interval through
   the section 6.2 Safe Idle envelope.
5. Only after all preceding safety/transport items pass may the work advance to
   the mounted granular/material comparison, spatial localization, resonance
   measurement, and tuning sequence in document 23 section 8. Those quality
   tests are not part of, and must not be interleaved with, this Gate 1 pass.

## 7. Separate storage issue

One boot showed a non-blocking LittleFS `Corrupted dir pair` / mount failure.
Built-in preset fallback remained operational. Treat this separately from the
residual-vibration fix. Do not erase or format LittleFS without explicit user
approval and a decision about whether stored presets/records need recovery.
