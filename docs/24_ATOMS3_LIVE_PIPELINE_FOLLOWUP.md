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

No gravity-separation fix was implemented or uploaded on this date. The board
still contains the build recorded in `23_ATOMS3_PRODUCTION_INTEGRATION.md`
(`m5stack-atoms3-pipeline`, flash 568,297 bytes).

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

## 3. Most likely mechanism

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

## 4. Next implementation slice

Implement the following as an additive compatibility feature. Do not raise
event thresholds as the first fix.

1. Add a runtime feature flag such as
   `features.enable_gravity_separated_mass_activity`, default `false`.
2. Enable it explicitly only in `applyAsBuiltAtomS3Profile()` for the next
   production test image.
3. In `MassMotionLayer`, initialize a quasi-static gravity vector from the first
   valid sample and update it with a low-pass filter.
4. Keep raw/quasi-static acceleration in the existing mass-position/tilt path
   so deliberate container tilt still moves the latent contents.
5. For energy and agitation only, use `accel - gravity`, low-pass the resulting
   motion band, and apply small acceleration/gyro deadbands.
6. Keep the generic path bit-for-bit compatible while the new flag is false.
7. Add current-frame event count to the serial verbose/status line, for example
   `new_evt=N`; do not diagnose repetition from latched `last_event`.
8. Do not add event blanking or change droplet thresholds unless the filtered
   activity path still fails the powered settling test.

Expected files:

- `include/haptics/Parameters.hpp`
- `include/haptics/MassMotionLayer.hpp`
- `include/haptics/HardwareProfiles.hpp`
- `src/MassMotionLayer.cpp`
- `src/HapticPipeline.cpp`
- relevant design, parameter, interface, progress, and validation documents

Suggested initial parameters, to be confirmed by deterministic and hardware
tests, are a gravity cutoff near 1 Hz, a motion low-pass near 10--12 Hz, an
acceleration deadband near 0.025 g, and a gyro deadband near 1.5 deg/s.

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

Add or run deterministic checks for these inputs with the feature enabled:

- constant `(1,0,0) g`, zero gyro: dynamic energy returns near zero while
  latent position still responds to the tilt direction
- constant `(0,0,1) g`, zero gyro: dynamic energy returns near zero
- a bounded acceleration pulse: energy rises and then decays below `0.02`
- carrier-frequency or aliased high-frequency input: substantially attenuated
  relative to a 1--8 Hz hand-motion input
- feature disabled: retained generic behavior

## 6. Next hardware sequence

Do not upload or emit a nonzero signal until the operator confirms the stated
power/switch gate.

1. Confirm S1 OFF and 12 V OFF.
2. Upload the newly built `m5stack-atoms3-pipeline` to the confirmed AtomS3 COM
   port.
3. With USB only, require `audio=0`, `zero=1`, `driver=1`, `errors=0`, and
   `tilt=0`.
4. Apply 12 V while S1 remains OFF; require no anomaly.
5. Set S1 ON while audio remains disabled; require no anomaly.
6. Enter Live and explicitly enable audio at the 8% effective limit.
7. Hold the device still for 30 seconds. Require `new_evt=0`, no perceived
   vibration, no error growth, and energy below `0.02` after settling.
8. Move it lightly once, then hold it completely still. Require perceptible
   response followed by tactile silence within two seconds, energy below
   `0.02`, and no new event for the following 30 seconds.
9. Repeat the same check with S1 OFF and ON. A large ON-only energy increase is
   evidence of remaining mechanical feedback.
10. Repeat the stationary check in the six principal orientations. Static
    gravity may change latent position but must not sustain activity/events.
11. Only after the liquid check passes, compare one granular preset and then
    continue spatial and soak validation from document 23.
12. Finish every attempt with `stop`; verify `idle`, `audio=0`, `zero=1`,
    `energy=0`, `test=0`, `errors=0`, and then turn S1 OFF.

## 7. Separate storage issue

One boot showed a non-blocking LittleFS `Corrupted dir pair` / mount failure.
Built-in preset fallback remained operational. Treat this separately from the
residual-vibration fix. Do not erase or format LittleFS without explicit user
approval and a decision about whether stored presets/records need recovery.
