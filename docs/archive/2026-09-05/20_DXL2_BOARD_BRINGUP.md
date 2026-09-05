# DXL2 Board Bring-Up

> Historical snapshot; not a current task list or instruction to repeat tests. Current scope, facts, and demo acceptance are in ../../08_IMPLEMENTATION_PLAN.md, ../../16_PROGRESS_STATUS.md, and ../../07_TEST_AND_VALIDATION.md.

> Status: COMPLETED PROBE EVIDENCE from `2026-08-22`. This is not the active
> roadmap. Continue current work from documents 08 and 24.

## Scope

`m5stack-atoms3-dxl2-probe` is the first-power communication probe for the
assembled DXL2 PCB and an AtomS3. It deliberately contains no torque-on,
goal-position, goal-velocity, or other motion command. Its only DYNAMIXEL
write is `Torque Enable = 0`.

The probe validates:

- AtomS3 startup and display
- the board's automatic half-duplex DYNAMIXEL interface
- Protocol 2.0 communication at `57,600 bps` and `1 Mbps`
- servo ID, model number, firmware version, and selected status registers
- read-back confirmation that torque is off

The MAX98357A outputs and transducers are outside this test. Leave them muted
or disconnected for the first DYNAMIXEL test.

## Hardware assumptions

- AtomS3 `GPIO1` is DYNAMIXEL TX.
- AtomS3 `GPIO2` is DYNAMIXEL RX.
- Half-duplex direction switching is implemented by the DXL2 PCB; there is no
  firmware direction pin.
- J9/J10 are wired as pin 1 GND, pin 2 5 V, pin 3 DATA.
- RX can contain a copy of the transmitted packet. The probe ignores this echo
  and waits for a Protocol 2.0 status packet.

## Build and upload

From the repository root:

```text
platformio run -e m5stack-atoms3-dxl2-probe
platformio run -e m5stack-atoms3-dxl2-probe -t upload
platformio device monitor -e m5stack-atoms3-dxl2-probe
```

The monitor speed is `115200`.

## Safe first connection

1. Turn the DXL2 board power off and unplug USB.
2. Keep both servo outputs mechanically unloaded. A servo horn is not needed.
3. Connect one XL330 to J9 or J10. Verify GND, 5 V, and DATA against the
   connector markings before applying power. Do not hot-plug it.
4. Leave transducers disconnected, or keep the amplifier mute switch at MUTE.
5. Connect USB and apply board power using the already-verified supply.
6. Once both supplies are stable and the serial monitor is open, click the
   AtomS3 button to run a fresh quick scan. This avoids relying on whether the
   boot scan happened before or after the servo rail became live.
7. After one servo passes, power down and swap to the second servo for another
   single-device test. Do not connect both simultaneously while both use ID 1.

At boot, the probe sends broadcast torque-off at both supported baud rates,
then scans IDs `0..10`. Every detected servo receives another torque-off and
the value is read back before status is printed. No servo motion is expected.

## Expected result

The AtomS3 display should show `DXL2 SAFE PROBE`. A passing serial line has the
following shape:

```text
DXL id=1 baud=57600 model=... fw=... torque=OFF off_confirmed=1 mode=... vin=5.0V temp=...C current=...mA pos=... hwerr=0x00 status=1
```

Pass criteria:

- the correct servo ID and baud rate are found
- `torque=OFF` and `off_confirmed=1`
- input voltage is plausible for the measured 5 V rail
- temperature is plausible at room temperature
- `hwerr=0x00`
- the servo remains stationary

## Controls

- AtomS3 button click: repeat the ID `0..10` quick scan
- AtomS3 button hold: broadcast torque-off at both baud rates
- `scan`: repeat the quick scan
- `scan all`: scan IDs `0..252`; this is slow
- `status`: re-read known servo status
- `torqueoff`: broadcast torque-off and refresh status
- `help` or `?`: show the command list

## If no servo is found

Power down before touching the connector, then check:

- 5 V between the selected J9/J10 power pins
- connector orientation and pin order
- DATA continuity to the interface circuit
- common ground between the AtomS3 and servo supply
- the servo ID and baud setting

Run `scan all` after the wiring checks if the servo may use an ID above 10. A
servo configured to a baud other than `57,600 bps` or `1 Mbps` is intentionally
outside this first probe. Do not add motion commands merely to diagnose a
communication failure.

Stop immediately if the servo moves, the supply current rises unexpectedly, a
component heats, or the voltage rail sags. Remove board power first; USB alone
must not be treated as the actuator emergency stop.

## One-shot ID 1 to ID 2 provisioning

Use this only after both XL330s pass individually and while the servo intended
to become ID 2 is the only device on J9/J10:

```text
platformio run -e m5stack-atoms3-dxl2-provision-id2
platformio run -e m5stack-atoms3-dxl2-provision-id2 -t upload
```

On every boot, this image sends torque-off first. It aborts without an EEPROM
write if both IDs 1 and 2 respond, if neither responds at 57,600 bps, or if the
detected model number is not 1190. If only ID 1 responds, it writes control
table address 7 to ID 2, waits for EEPROM completion, and then requires all of
the following:

- ID 2 responds with model number 1190
- register 7 reads back as 2
- torque-off reads back as confirmed
- the former ID 1 no longer responds
- the normal status block remains valid

`ID PROVISION PASS` and `ID 2 READY` are required for a pass. Reboot once and
confirm the log says that the target ID already responds, proving that the
change persisted without another EEPROM write. The image has no torque-on or
motion command.

## As-built test record: 2026-08-22

- DXL2 PCB and AtomS3 communication passed on GPIO1 TX / GPIO2 RX.
- XL330 unit 1 passed individually as ID 1 at 57,600 bps, model 1190,
  firmware 53, 5.1 V, 24 C, 0 mA, torque OFF confirmed, hardware error 0.
- XL330 unit 2 passed individually with the same initial ID and baud.
- Unit 2 was provisioned from ID 1 to ID 2 while connected alone.
- After restoring the normal safe-probe firmware, unit 2 passed again as ID 2
  at 57,600 bps, model 1190, firmware 53, 5.1 V, 30 C, 0 mA, torque OFF
  confirmed, hardware error 0.
- Both units passed simultaneous detection at 57,600 bps: ID 1 reported
  5.2 V / 27 C / 0 mA and ID 2 reported 5.1 V / 29 C / 0 mA; both reported
  torque OFF, hardware error 0, and valid status.
- The first unloaded motion run stopped safely when ID 1 remained 10 pulses
  short of its target. Peak current was 14 mA and broadcast torque-off was
  confirmed; ID 2 was not moved. The completion tolerance was then widened
  from 8 to 12 pulses without increasing the PWM cap or travel.
- The repeated unloaded motion test passed sequentially for both devices.
  ID 1 returned to 3087 from a home position of 3079 with a 15 mA peak; ID 2
  returned to 2140 from a home position of 2132 with a 13 mA peak. Both
  reported 5.1 V / 33 C, and the combined test ended with broadcast
  torque-off.
- The normal non-motion probe was restored afterward. Its final two-device
  scan reported ID 1 at 3087 pulses / 34 C and ID 2 at 2140 pulses / 33 C;
  both were at 5.1 V / 0 mA with torque OFF, hardware error 0, and valid
  status.

## Unloaded motion probe

The motion probe is a compile-gated image and never moves at boot:

```text
platformio run -e m5stack-atoms3-dxl2-motion-probe
platformio run -e m5stack-atoms3-dxl2-motion-probe -t upload
```

It requires an explicit `go` command or one AtomS3 button click. Both model
1190 devices must respond as IDs 1 and 2 at 57,600 bps. Each device is tested
sequentially; the other remains torque-off.

For each servo, the probe requires position mode 3 and rejects Drive Mode's
automatic-torque-on bit. It writes only volatile RAM settings for the test:

- Profile Acceleration 1 and Profile Velocity 5
- Goal PWM limit 150 (about 17 percent)
- Bus Watchdog 50 (1 second)
- Goal Position: 40 pulses / 3.52 degrees from the measured home, then home

The probe aborts to broadcast torque-off above 350 mA, above 45 C, outside
4.5--5.6 V, on a hardware error, on a status-read failure, or after a 4-second
motion timeout. Position completion tolerance is 12 pulses (about 1.06
degrees) to accommodate the conservative PWM cap and unloaded gear friction.
It must report `MOTION PASS` for ID 1 and ID 2 and then the
combined `MOTION TEST PASS`. Restore `m5stack-atoms3-dxl2-probe` immediately
afterward so a reset cannot repeat the motion test.

For production-controller diagnosis, the additive
`m5stack-atoms3-dxl2-motion-step-probe` retains the same explicit `go`,
sequential motion, 40-pulse travel, Goal PWM 150, watchdog, and health limits,
but writes Profile Acceleration 0 and Profile Velocity 0. It also aborts when
Present Position leaves the complete home-to-target interval by more than the
12-pulse completion tolerance. Use it to distinguish insufficient direct
position authority from the production application's smaller streamed goals;
it does not replace the historical profile-1/5 probe evidence.

If that direct step stalls while Present PWM remains below the Goal PWM cap,
`m5stack-atoms3-dxl2-motion-step-p800-probe` repeats the identical guarded test
after writing Position P Gain 800 to volatile RAM. The default 400-gain result
must be retained for comparison. Do not raise Goal PWM merely because the axis
stalled when telemetry shows that the controller never reached the existing
150 cap.

If P gain 800 remains insufficient, the separately gated
`m5stack-atoms3-dxl2-motion-step-p1200-probe` performs the same test at 1200;
Goal PWM remains capped at 150. On the 2026-09-04 unloaded mechanism, gain 400
moved ID1 only 2 of 40 pulses, gain 800 passed ID1 but left ID2 17 pulses short,
and gain 1200 passed both axes. The gain-1200 run stayed within 58 mA,
5.1--5.2 V, and 36--39 C and ended torque-off. Each servo's retained Bus
Watchdog value must be cleared and read back after torque-off before the safe
home Goal Position is preloaded; controller firmware uploads do not reset this
servo RAM state.
