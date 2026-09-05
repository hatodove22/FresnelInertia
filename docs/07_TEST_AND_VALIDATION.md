# 07 Demo Acceptance

Updated: 2026-09-05. This is the active acceptance contract.
[Plan](08_IMPLEMENTATION_PLAN.md) sets priorities; [status](16_PROGRESS_STATUS.md)
records results. The [full historical record](archive/2026-09-05/07_TEST_AND_VALIDATION_FULL_RECORD.md)
preserves earlier tests and observations; its old gates are not current prerequisites.

## What must work

The user handles one container and perceives its contents through coordinated
four-channel texture/events and two-servo low-frequency tilt cues.
The visual scene, applied material, container geometry, and felt response must
tell the same story. Finish the standalone hardware experience first, then the
StampC5-connected visual experience. Reuse the hardware and desktop evidence in
16 rather than repeating completed bring-up. VR/Quest is on hold; Android is
the planned mobile host and has not been verified. Build success alone proves
neither physical handling nor target-host support.

| Acceptance | Required observation | Current evidence |
|---|---|---|
| Content response | Deliberate tilt/motion produces useful cues; holding still lets them settle. | Production four-channel settling and material distinctions passed. |
| Spatial response | A change of motion direction produces the corresponding felt movement/contact. | Mounted wall identity and opposite-direction localization passed. |
| Tilt response | Both gripped contact planes give clear, directionally coherent cues through handled motion. | Useful strength and common/differential basis passed; current combined run had no reported faults and desktop visual/felt direction matched. Smoothness remains imperfect. |
| Simultaneous output | Production four-channel output and both servos remain usable together while handled. | Current production marble/sand runs completed without faults; operator reports improvement/no residual vibration, with smoothness still imperfect. See 16. |
| Connected scene | Intended host connects through StampC5; selected and device-applied state agree. | Desktop applied state and visual/felt direction confirmed; Quest initial WebUSB connection and applied-state display confirmed by operator. Android is unverified; unfinished Quest MR handling is deferred. See 16. |
| End/recover | Stop ends output; reconnect reports current state and permits deliberate restart. | Current run confirmed both torque-OFF readbacks; desktop Idle reconnect passed. Dedicated-demo reboot now automatically re-pairs with outputs OFF. Android recovery is unverified; Quest app recovery is deferred. See 16. |

## One short rehearsal

Use the installed demo firmware, valid status for both servos,
mounted mechanism, usual grip, and existing effective output limits.
See [hardware setup](04_HARDWARE_AND_PIN_SPEC.md) and
[interface contract](05_INTERFACE_SPEC.md) for current operation.

1. Begin in Idle with audio and tilt off; inspect current device/fault state.
   After communication recovers, clear the fault in Safe Idle if needed,
   then enter Live.
2. Enable the intended outputs and handle the device for about 30 seconds:
   briefly hold still, tilt in each direction, make one content-moving gesture,
   then hold still again. Require clear content motion, coherent tilt cues,
   settling, and no output interruption or accumulating communication fault.
3. Compare at least two curated content conditions with the same gesture.
   The operator must be able to describe a meaningful difference; retain only
   conditions that help the demo. Perfect liquid realism is later tuning.
4. Stop and confirm Idle, silenced audio, tilt disarmed, and fresh torque-off
   status from both servos. Missing telemetry is an unknown result.
5. Exercise the affected visual flow on the actual host being claimed as
   supported. Reuse the existing desktop result for unchanged paths; the planned
   Android client needs its own check when implemented. Confirm that Connect,
   preset selection, Live, Audio, Tilt, and Stop act on the device.
   Exercise one ordinary disconnect/reconnect and deliberate restart.

A laptop run establishes laptop support only. Mobile USB selection,
read/write, and reconnect must pass on each host claimed as supported.
A visual-only preview must be identifiable as a preview. Android marker AR is
not implemented; platform support for AR and USB separately does not establish
their simultaneous operation with this dongle. Quest-specific checks are not
current tuning prerequisites.

For the connected run, display a preset as applied only after device execution
is confirmed. Check matching material, dimensions/fill, and coordinate mapping;
visual-only bottle/cup presets and display scaling are not evidence of hardware
agreement. Confirm that visible content and felt response agree during motion.
A stale link or rejected command must not look like successful output.
Stop/reconnect must not silently re-arm output.

## When a run fails

Record the action, observed sensation, and relevant state/counter change, then
repair that failure and repeat the affected portion. Existing limits, local
Stop, and fault handling remain in place. Changes to those mechanisms require
a demonstrated problem and a focused regression, not a new qualification project.

An earlier cable-free run exhausted bounded local DXL read retries and latched
a communication fault while ESP-NOW remained paired. The model's 250 Hz value
is an integration setting; servo goals target a 10 ms period. Actual command
gaps were not measured. The 10 Hz observer stream does not establish smoothness.
If that failure recurs, restore DXL continuity before judging trajectory quality;
the later successful production run in 16 is not invalidated by this history.

## Proportionate software checks

| Changed area | Check |
|---|---|
| Documentation only | Read the diff, check active links and whitespace. |
| Browser | Typecheck/build and exercise the affected user flow. |
| Firmware | Build the affected AtomS3 or StampC5 environment; baseline when shared code/gates change. |
| Protocol/state | Schema fixtures and relevant codec/state tests, plus sender/receiver builds. |
| Motion/output logic | Relevant deterministic checks and the affected physical rehearsal. |

Run PlatformIO builds sequentially. Reuse valid results for unchanged paths.
The legacy environment matrix, exhaustive static poses, strict evidence hashes,
fault-injection campaigns, and long soaks are not routine demo prerequisites.

## Deferred, not passed

Recorder/Replay, the user-skipped switch trial, formal resonance identification,
adjacent-wall/SOA tuning, full naturalness studies, long thermal/endurance runs,
OTA, alternate transports, and security qualification remain outside this demo.
A user-skipped trial is deferred even if the underlying function worked elsewhere.

For each rehearsal, add one short result to [status](16_PROGRESS_STATUS.md):
date, firmware/profile, host, presets, observed outcome, and the next actual
blocker. Completion means the end-to-end experience above was observed working.
