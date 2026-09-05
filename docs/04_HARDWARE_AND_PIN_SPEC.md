# 04 Hardware and Pin Specification

The demo uses AtomS3, four TDM channels, two parallel XL330 contact planes,
and a StampC5 USB dongle. Vibration renders texture and collisions; servos add
low-frequency weight shift and inertia. Current completion and blockers are in
[16 Progress](16_PROGRESS_STATUS.md), and demo acceptance in
[07 Validation](07_TEST_AND_VALIDATION.md).

## Assembled board

- Controller: M5AtomS3 / ESP32-S3 on the custom
  `M5AtomS3_MAX98357A_4CH_TDM_DXL2` PCB.
- Four MAX98357A amplifiers share one TDM data stream.
- Two XL330-M077-T servos share the automatic half-duplex DYNAMIXEL bus.
- StampC5 connects to the host by USB; AtomS3 exchanges commands, execution
  ACKs, and telemetry with it over ESP-NOW. AtomS3 performs the haptic
  computation locally and can be handled without its USB cable.
- Schematic/PCB/BOM assets are described in [hardware](../hardware/README.md).
  The firmware pin contract does not replace connector markings or drawings.

## Signals and power

| Signal | As-built connection |
|---|---|
| TDM BCLK | AtomS3 GPIO5 |
| TDM frame sync / LRCLK | AtomS3 GPIO6 |
| TDM data / DIN | AtomS3 GPIO7 |
| DYNAMIXEL TX | AtomS3 GPIO1 |
| DYNAMIXEL RX | AtomS3 GPIO2 |
| DYNAMIXEL direction | Automatic on PCB; no firmware DIR/EN GPIO |
| DYNAMIXEL connectors J9/J10 | Pin 1 GND, pin 2 5 V, pin 3 DATA |
| DYNAMIXEL devices | ID1 thumb, ID2 index; model 1190; 57,600 bps |
| Host USB console | 115200 baud; port number may change |

S1 is the maintained manual amplifier switch: ON pulls `AMP_OE_N` low and
enables the 74AHCT125 signal path; OFF lets R8 pull it high and mutes that path.
The final board has no populated TCA9534 amplifier controller. Firmware
cannot read or change S1.

The board's 12 V input supplies the `+5V_AUDIO`, 74AHCT125, and MAX98357A
path; AtomS3 USB alone does not power that path. The XL330 connector supply
is 5 V, not 12 V. Controller and actuator grounds share a common reference.
Ordinary demo operation and software tests proceed with board power ON;
there is no per-test power-off approval step. De-energize the affected
supply when changing electrical wiring.

## Four vibration channels

TDM uses 48 kHz, 16-bit samples, PCM-short framing, and eight slots.
BCLK is 6.144 MHz; frame sync is one BCLK wide. DMA length/count are 240/12.

| Slot | Software wall | PCB channel |
|---|---|---|
| 0 | Front | CH1 |
| 1 | Back | CH2 |
| 2 | Top | CH3 |
| 3 | Bottom | CH4 |
| 4–7 | Digital zero | Unused |

These wall labels define the renderer/backend order; preserve them when
labelling the enclosure. They are separate from the thumb/index coordinate
convention below. Channel isolation and distinct spatial output have been
demonstrated; calibrated per-wall gain, resonance, and crosstalk are refinement
work, not prerequisites for repeating the functional demo.

The as-built audio profile starts muted with the TDM driver running zeros.
Its initial peak limit is 0.08; the compiled ceiling is 0.15, applied after
mixing and gain. These are normalized PCM peaks, not percentages of power or
perceived intensity. Combined IMU + two-servo + four-channel short bursts
passed at both 8% and 15%. This evidence establishes simultaneous hardware
operation, not a continuous-output rating or complete application acceptance.

## Contact-plane geometry and IMU frame

The user's handling convention is:

- +x: thumb to index; thumb is left and index is right.
- +y: vertically upward in the nominal hold.
- Semantic +z: wrist toward fingertips, forward.
- Both servo rotation axes are parallel to z. The motors are parallel-mounted,
  not mirror-mounted.

For vector calculations the firmware uses a right-handed body frame with
the same +x and +y, but internal +z pointing toward the wrist. Thus semantic
forward is internal -z. Three static gravity poses established the following
rotation for the IMU's 45-degree mounting:

```text
body.x = -raw.y
body.y = (raw.x + raw.z) / sqrt(2)
body.z = (raw.z - raw.x) / sqrt(2)
```

The as-built profile applies this proper rotation to both acceleration and
gyro at the model boundary. Raw IMU telemetry and recordings remain raw.
Generic profiles leave the transform disabled.

The as-built raw direction pair is thumb +1, index +1. A common +10/+10-degree
test produced same-direction rotation (counterclockwise from the operator's
view); a differential +8/-8-degree test produced opposite rotations and
returned to home. Relative common/differential kinematics are verified.
The subsequent production handling and desktop connected run established
operator-confirmed visual/felt directional agreement; see [16](16_PROGRESS_STATUS.md).

## Current servo operating settings

The AtomS3 backend is implemented and uses DYNAMIXEL Position Mode 3.
Its target is synchronized Goal Position updates every 10 ms; Goal PWM bounds
internal drive authority and is not an open-loop PWM angle command.
Both present positions become session homes during preflight.

| As-built setting | Current value |
|---|---|
| Logical command / raw session-home bound | ±10 degrees / ±114 pulses |
| Position P Gain / Goal PWM | 2000 / 600 |
| Servo Profile Acceleration / Velocity | 0 / 0; servo-side profile disabled |
| Pseudo-force gain `k_phi` | 4.0 |
| Common / differential / combined correction bounds | 5 / 10 / 10 degrees |
| Model signs / raw directions, thumb and index | -1 / -1; +1 / +1 |
| Current / temperature abort | 1200 mA / 60 C |
| Voltage range / bus watchdog | 4.5–5.6 V / 1 second |

These are gripped-demo software settings, not physical end-stop measurements.
Mounted ±10-degree motion was clearly perceptible; an application sample near
+5.32/-5.60 degrees tracked within one encoder pulse, with intensity accepted.
A direct full-range step previously overshot and triggered the position guard.
The new assembled coherent model filters and slew-limits the complete composed
command, including the mass-position base, at the existing 80 degrees/s bound.
The accepted strength and travel settings above are unchanged. The current
production handling run showed clear improvement, with some smoothness issues
remaining; the operator's observations are recorded in 16.

## Builds and stopping

`m5stack-atoms3-pipeline` is the audio baseline, with servos compiled out.
`m5stack-atoms3-pipeline-tilt-espnow-monitor` is the full assembled-device
demo build; `m5stack-stampc5-espnow-bridge` is its USB dongle. Outputs boot
disarmed. Only the full demo build sets `HAPTICS_DEMO_ESPNOW_AUTOSTART=1`:
after successful initialization it enters Idle with both outputs OFF, then
enables the radio for dongle pairing. The flag defaults to OFF; other radio
builds retain local `espnow link on` in Idle. The applied state remains owned
by AtomS3. Link telemetry defaults to 10 Hz
and does not clock the nominal 100 Hz servo command stream.

`stop` / `idle` or the AtomS3 button hold silences audio, resets the model,
and requests servo torque-off. The existing 300 ms stale-IMU stop, servo
watchdog, and feedback limits remain implemented. Runtime feedback is now an
incremental two-block receive state machine, with up to three 45 ms attempts.
Waiting for a reply does not block the haptic pipeline; goal writes wait until
the outstanding read finishes or times out. Preflight, arm and explicit Stop
verification remain synchronous. A missing reply cannot verify torque-off;
failed Stop verification invalidates feedback instead of reporting confirmed OFF.

Local `tilt diagnose` is available only in Safe Idle. It sends one PING to each
configured ID on the current UART and reports accepted TX bytes, observed RX
bytes, echoes and decoded status metadata. It does not restart the UART or
write torque/position/PWM. Zero RX distinguishes absent data from a rejected
reply but cannot establish a connector or power fault. `tilt clear` separately
reinitializes the UART and reruns torque-off preflight.

On 2026-09-05, cable-free radio telemetry stayed clean while local DXL status
reads failed during handling. That is evidence of a local DXL fault, not proof
of its electrical cause or of a telemetry-rate problem. It is a historical
observation, not a live statement about the connected hardware.

Legacy StickS3 wiring and finite bring-up settings remain in source for reference.
