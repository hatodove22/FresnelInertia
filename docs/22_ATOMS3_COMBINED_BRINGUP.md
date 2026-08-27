# 22 AtomS3 IMU + XL330x2 + 4CH TDM Combined Bring-Up

## Scope

This dedicated probe validates simultaneous use of the three active paths on
the assembled `M5AtomS3_MAX98357A_4CH_TDM_DXL2` board:

- AtomS3 onboard IMU acquisition
- two XL330-M077-T servos at IDs 1 and 2
- four MAX98357A TDM haptic outputs

It is a gated bench probe, not the full haptic pipeline. Boot starts TDM with
zero data and sends DYNAMIXEL torque-off. Motion and nonzero haptic output
require an explicit `go` command.

## Fixed safety envelope

- DYNAMIXEL bus: GPIO1 TX, GPIO2 RX, 57,600 bps
- expected devices: model 1190 at IDs 1 and 2
- position mode 3 with automatic torque-on disabled
- travel: 40 pulses (approximately 3.52 degrees) from each measured home
- ID 1 prefers positive travel and ID 2 prefers negative travel
- Profile Acceleration 1, Profile Velocity 5, Goal PWM 150
- bus watchdog: 1 second
- abort above 350 mA, above 45 C, outside 4.5--5.6 V, on a hardware error,
  stale IMU, I2S write failure/service gap, operator button hold, or timeout
- haptic waveform: 180 Hz, 50 ms on / 300 ms period, 8% default
- `level PCT` is accepted only while idle and only from 2.5% through 15%
- all four TDM slots receive the same waveform during the combined run

The 15% value is the practical unloaded single-channel candidate. It is not the
first combined-load setting. Run and pass 8% first.

## Commands

```text
status
check
level 2.5..15.0
go
stop
help
```

`check` initializes no motion: it sends torque-off, verifies both servos and
the IMU, and confirms zero-filled TDM operation. `go` performs one out-and-home
movement on both servos while the IMU and all four haptic outputs are active.
The run returns to digital silence and torque-off whether it passes or aborts.

## Test order

1. Keep S1 OFF and 12 V OFF while uploading the combined probe.
2. With USB only, require `status` to report IMU updates, I2S ready, digital
   silence, zero I2S errors, and DYNAMIXEL torque-off requested.
3. Apply 12 V with S1 OFF. Run `check`; require IDs 1 and 2, model 1190,
   plausible voltage/temperature, zero hardware error, and torque OFF.
4. Set S1 ON while TDM remains zero. Confirm no unexpected vibration.
5. Run the default 8% `go` test with both servos mechanically unloaded.
6. Observe supply current, rails, temperature, sound, and motion. Use S1 OFF
   for immediate amplifier mute and remove 12 V for a full actuator stop.
7. Require final torque-off, home return, live IMU updates, zero I2S errors,
   and no excessive I2S service gap.
8. Only after the 8% run passes, set `level 15` and repeat with the same checks.

## Acceptance record

Record:

- IMU update count and maximum dynamic acceleration / gyro magnitude
- ID 1 and ID 2 maximum current, voltage, temperature, and final position
- I2S blocks, errors, and maximum service gap
- whether any reset, rail sag, pop, unexpected motion, or heating occurred
- whether 8% and 15% combined haptic levels passed independently

Do not use this test to claim that 15% continuous-wave or mounted-system drive
is safe. The haptic waveform remains a low-duty-cycle burst.

## As-built test record: 2026-08-22

Configuration for both recorded runs:

- assembled custom PCB with AtomS3
- both XL330-M077-T units connected, mechanically unloaded
- IDs 1 and 2, model 1190, `57,600 bps`, position mode 3
- relative travel 40 pulses per servo, followed by home return
- all four transducers connected and unloaded
- identical `180 Hz`, `50 ms ON / 300 ms period` waveform on TDM slots 0..3
- TDM slots 4..7 zero

Results:

| Haptic level | ID1 peak current | ID2 peak current | Servo rail | Final ID1 temp | Final ID2 temp | IMU updates | I2S errors | Final state |
|---|---:|---:|---|---:|---:|---:|---:|---|
| 8% | 15 mA | 13 mA | 5.1 V | 32 C | 31 C | 302 | 0 | both home, torque OFF |
| 15% | 14 mA | 13 mA | 5.1--5.2 V | 32 C | 31 C | 282 | 0 | both home, torque OFF |

Both runs completed without an observed reset, abnormal rail behavior,
unexpected motion, heating, or output fault. The operator confirmed the
expected haptic output in each run.

## Interpretation boundary

This record establishes a **dedicated combined-probe hardware pass** for a
bounded, unloaded, low-duty-cycle workload. It does not establish:

- continuous-wave or sustained mounted safety at 15%
- per-channel amplitude equality or calibrated resonance
- spatial Front/Back/Top/Bottom rendering, because all four channels carried
  the same waveform
- liquid/granular/hybrid four-layer pipeline behavior
- current-based servo control or final tilt-plane linkage safety
- production DXL feedback telemetry

The final production-oriented `m5stack-atoms3-pipeline` target was built
successfully on the same date (RAM 12.4%, flash 17.0%) and was subsequently
uploaded with S1 OFF and 12 V OFF. Its USB-only software-zero status passed;
powered muted startup and unloaded Front/Back/Top/Bottom channel routing also
passed with zero audio errors. An initial production-pipeline liquid response
was observed after device motion, followed by a muted stationary no-event
check. The subsequent powered settling check failed because vibration decayed
but did not stop while still; Safe Idle then restored verified zero output.
Continue from `24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md`. The production image uses
Safe Idle, always-present safety telemetry, an initial 8%
effective audio peak limit, a compile-time 15% hard ceiling, a 300 ms IMU stale
safe-stop, and compiles the servo backend out. Follow
`23_ATOMS3_PRODUCTION_INTEGRATION.md`; do not infer its full live-pipeline pass
from this probe, the bounded channel test, or the initial liquid-only response.
