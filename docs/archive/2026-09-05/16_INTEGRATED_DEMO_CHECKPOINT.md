# 16 Current Status

Historical snapshot retained during the repository cleanup. Only local links
were adjusted for its archive location. Present-tense bench state and Quest-first
priorities below describe that checkpoint, not today's device or work plan.
Current owners: [status](../../16_PROGRESS_STATUS.md), [plan](../../08_IMPLEMENTATION_PLAN.md).
Original captures named under tmp below are retained in [evidence](evidence/).

Updated: 2026-09-05. Integrated-demo implementation is in progress after the
documentation cleanup. New software evidence is separate from earlier handling.

## Current implementation checkpoint

- Assembled opt-in coherent Mass/contact/Event path: physical acceleration
  scaling, static support, pre-bounce impacts, contact-distance flow and wet
  liquid voicing. Empty contents stop content events.
- Common position plus differential CoG/inertia; the full composed tilt command
  is bounded, filtered and slew-limited. Useful output authority is unchanged.
- Full delayed FlowRipple envelopes and normalized spatial distribution.
- Runtime DXL feedback no longer blocks the haptic loop. Failed Stop readback
  stays unknown, and pending fault torque-off is retried without blocking.
- Executed production C++ under Wasm/Node: existing suite 23/23, coherent
  container 8/8, tilt 10/10, spatial 7/7, fake-UART runtime/diagnostic 9/9. Schema fixtures
  and host-lab 20/20 pass. This is not native Windows or hardware execution.
- Firmware builds pass for baseline AtomS3, integrated tilt+ESP-NOW AtomS3 and
  StampC5, including the 230-byte resolved-state v3 extension. The first compile's
  C++11 aggregate initialization incompatibility was corrected.
- The connected browser path is implemented: explicit output controls, applied
  material/size/fill, device-driven content and gravity-referenced orientation,
  frozen stale/disconnected state, and equivalent MR panel controls. Transport/
  renderer/MR lifecycle/panel/controller tests pass 73/73 after the Quest
  follow/discovery and preset-recovery fixes; desktop/mobile-width browser mock flows pass
  without page errors. Desktop handling and Quest USB-state evidence are below;
  Quest MR handling/recovery remain open.
- Corrected connected-view pitch/roll signs: THREE XYZ rotation now maps the
  measured body specific-force vector to world +Y, so content falls toward the
  visible downhill wall. Non-neutral and actual-log pose regressions pass;
  the rebuilt page is served at localhost:8082. The central paper label is hidden
  in connected mode so it cannot conceal the moving contents; preview retains it.
- MR now requests a session directly from the user click and reports success
  only after renderer setup. Failure text remains readable below the buttons.
  Exit/re-entry restore the ordinary view and input state. Per-source panel
  latches prevent one idle hand/controller from repeatedly firing another's
  held action. Software regressions pass; this is not yet a Quest MR pass.

Latest physical checks: matched v3 firmware is uploaded to AtomS3 (COM3) and
StampC5 (COM4). The dongle initially overflowed the loop task stack while
serializing the larger snapshot; moving its JSON workspace to static storage
resolved the observed restart. Real v3 telemetry and a marble-preset execution
ACK/applied state were received; all 43 recorded JSON frames passed the schema.
This establishes the serial/radio path, not browser USB or a handling pass.

Two-servo preflight briefly recovered after an operator connection check:
both model1190, mode3, valid feedback, torque0, 5.2V, homes 2000/3081. After the
next AtomS3 upload, it failed again. Unlike short-circuiting preflight, the new
local `tilt diagnose` independently PINGs both IDs: each accepted 10 TX bytes
but returned zero RX bytes, both before and after UART reinitialization.
This rules out response decoding as the explanation for these specific probes;
it does not establish that the bytes reached the wire or isolate an electrical
cause. The operator's external-board power cycle did not restore replies.
An independent `m5stack-atoms3-dxl2-probe` upload also found no servo in its
normal ID0..10 scan at 57,600 and 1,000,000 bps. This reproduces without the
integrated engine, TDM audio or radio; it is not proof of a specific bad cable.
After restoring the integrated image, both IDs responded normally (each PING:
10 TX bytes, 24 RX bytes including one echo, model1190). `tilt clear` passed:
both mode3, valid feedback, torque0, 5.1/5.2V, 37/34C, homes 2001/3081,
hardware errors zero and no latched fault. The recovery's cause remains unknown.
The subsequent cable-free simultaneous run is recorded below. Radio remains
enabled; the current state is Idle with audio muted and verified servo torque OFF.

## Current production handling run

2026-09-05, integrated AtomS3 firmware and v3 StampC5, AtomS3 USB unplugged:
the operator held the device for marble then sand, approximately 30 seconds of
combined output. Commands and telemetry used COM4/ESP-NOW.
All 321 recorded frames passed the repository schema validator, explicit
positive-span checks and the actual browser transport parser.

- `granular_single_marble_box`: 123 simultaneous-output telemetry frames;
  21 accumulated events. `granular_sand_box`: 124 simultaneous frames;
  70 additional events. These are observed counters, not a perceptual score.
- Both runs: zero reported DXL communication errors, servo faults and audio
  underruns. Both servo positions changed with the commands.
- Each Stop had an applied ACK followed by Idle, audio silenced, tilt disarmed,
  and valid torque-OFF readback from both servos (about 2 seconds old at log end).
- Operator: "not bad", "considerably improved", no unwanted residual vibration;
  smoothness still has some issues. The operator asked about fore/aft response.
  Material contrast was not separately described. Directional agreement was then
  confirmed in the desktop connected run below; phone/Quest is still open.

This establishes current production simultaneous-drive and Stop operation over
the dongle, with an encouraging handling assessment and a remaining smoothness
issue. It does not establish complete visual/hardware agreement or isolate the
earlier intermittent no-RX condition.

Current model limitation: the coherent content state and tilt-force calculations
use body x/y only. All three IMU axes are acquired/transformed, but body z does
not drive an independent fore/aft content state or collisions. Pitch can change
projected x/y acceleration, and the client renders pitch from all-axis gravity;
neither establishes 3D haptic content motion.

## Desktop connected run

2026-09-05, actual Chrome Web Serial to StampC5 COM4 at localhost:8082:
connection reported Idle/audio OFF/tilt OFF and the device's sand configuration
(60 x 60 x 40 mm, 35%). Selecting marble changed the applied display to
50 x 50 x 50 mm, 4%. Fill 4 -> 7 -> 4% was accepted and displayed without arming.
The operator then used the page's Start, handled the device and pressed Stop;
the UI was observed LIVE with both outputs ON, then IDLE with both OFF.
The operator confirmed that visible tilt/content motion and felt direction
matched ("一致！"). The operator also confirmed page refresh/reconnect retained
IDLE with both outputs OFF. This establishes desktop Web Serial, not Quest WebUSB
or MR; Quest is the operator's selected final display host.

For the Quest check, the current dist is served on loopback HTTP :8082 and an
ephemeral HTTPS Cloudflare tunnel. The official portable cloudflared 2026.8.3
binary is cached under ignored `.pio/quest-tools` (release SHA-256 verified);
no service/global installation was made. Only the static dist is published,
not serial access or repository files. HTTPS page rendering passed on desktop;
The operator confirmed Web Launch transfer and successful main-app WebUSB
connection to StampC5 on Quest, with material/dimensions and Idle/audio OFF/tilt
OFF displayed. After refreshing to the fixed session lifecycle, the operator
confirmed that the MR container and Device Panel are visible. This establishes
initial target-host USB/state access and MR entry, not yet handled input/output
or recovery. The first in-MR rehearsal did not pass: the operator found near-grab
acquisition difficult, requested default hand following with IMU-owned angle,
and reported an "AtomS3 not found" error noticed after entering MR (exact text
unavailable). No successful Quest material comparison or Stop is
claimed. Operator-selected right-hand position-follow now removes distance acquisition, preserves
IMU-owned angle and holds the selected hand through tracking loss. Client state
discovery retries only transient not-discovered/not-paired responses for up to
3.5 seconds; the connected HUD also permits read-only state refresh. These are
software corrections awaiting the affected Quest check. The radio diagnosis and
focused firmware correction are recorded below. The updated production page and honest
unsupported-MR failure were verified in desktop Chrome; browser-mock
Start/Stop/material/fill/stale flows have no page errors.

## Quest connection recovery and demo boot

The operator then confirmed AtomS3 was unreachable in the ordinary Quest view
as well. With AtomS3 reconnected to PC COM3 and StampC5 left on Quest, direct
read-only diagnostics found the IMU running but ESP-NOW uninitialized/OFF,
with zero sequence/transmit/control counters. This establishes the radio state,
not the time or electrical cause of any restart. Local Stop followed by
`espnow link on` immediately restored pairing while both outputs stayed OFF.

The full demo target now sets `HAPTICS_DEMO_ESPNOW_AUTOSTART=1`: after successful
initialization, enter Idle/output OFF, then enable the existing radio path.
Other builds retain the default-OFF flag and manual activation. No output
authority, motion engine, wire protocol or StampC5 firmware changed.
Baseline and full-demo builds passed; the full image was uploaded to AtomS3.
After the upload's restart, read-only status queries (no Stop or link-on command)
confirmed automatic radio initialization, advancing telemetry and a new paired
session with the still-connected Quest dongle. State was Idle/audio OFF/tilt OFF,
with no radio/audio/servo errors. Both servos had valid model1190/mode3/torque0
boot readback, 5.1 V, about 11 seconds old at observation.
This verifies dedicated-demo boot and radio recovery, not yet the Quest app's
state refresh or handled MR rehearsal. Evidence:
`tmp/quest-atom-link-diagnostic-20260905.txt`,
`tmp/quest-atom-link-restored-20260905.txt`,
`tmp/quest-atom-autostart-boot-20260905.txt`.

A separate client recovery defect was reproduced in actual Chrome with a
mocked transport: if an accepted preset was replaced by the boot preset before
telemetry arrived, successful state refresh left "applying material" and Start
disabled. Explicit refresh/reconnection now clears that old selection wait
only after a successful state request and adopts the reported configuration.
The same browser case failed before the change and passed after it, sending
only `get state` during refresh; no output or preset replay was added.
Client tests 73/73, typecheck/build, and desktop/mobile-width browser smoke pass.
This is software evidence, not a new Quest hardware result. The updated static
page is served; an already-open Quest page retains its loaded version until reload.

Quest3's battery then ran out. The operator requested a temporary return to
desktop testing while it charges; Quest MR/handling remains unverified, not
abandoned. The operator has reconnected StampC5 to the PC for the next real
desktop comparison. The latest client at localhost:8082 connected through PC
Serial: the UI showed Idle/both outputs OFF and applied liquid state, then
confirmed the marble preset at 50 x 50 x 50 mm and 4% while outputs stayed OFF.
The operator subsequently explored multiple properties and reported that the
experience was "quite good", with room for refinement, and asked how to tune it.
This is positive operator-reported desktop experience. The exact trial settings,
per-material descriptions and a new reconnect/Stop readback were not captured;
it is not a new Quest pass or evidence that every acceptance item passed.

## What works and what remains

| Capability | Evidence | Open for the demo |
|---|---|---|
| Four-layer haptics and TDM4 | Assembled-device mapping/settling and current combined marble/sand handling passed | Reuse in the final Quest rehearsal |
| Material/geometry response | Operator distinguished locations, sparse/dense content, mixed components and geometry tendency | Liquid/hybrid remain unnatural; choose and tune a communicative contrast |
| Tilt-plane actuation | Useful strength and relative directions accepted; current combined handling and desktop visual/felt direction match | Remaining smoothness; repeat the experience on Quest |
| Simultaneous tilt + vibration | Current production marble/sand runs completed without reported faults; operator reports clear improvement and no residual vibration | Confirm meaningful material contrast in the final visual rehearsal |
| ESP-NOW through StampC5 | Cable-free commands/telemetry, actual desktop app operation, and operator-confirmed Quest WebUSB state access | Use the same path in the Quest handled rehearsal |
| Visual client | Desktop applied state, Start/Stop, visual/felt match and Idle reconnect; Quest initial USB/applied-state display confirmed | Quest MR input, handled output and recovery |
| Stop and re-arm | Audio, button/remote stop, IMU fault and configuration checks previously exercised | Normal stop/reconnect during the final demonstration |

The integrated demonstration is **not yet complete**. Percentages are omitted:
the remaining integration and perceptual behavior cannot be established from
file counts or passing component builds.

## Earlier jerky-tilt observation and the implemented correction

The user reported approximately correct rotation direction but jerky movement.
The observed DXL communication-error count increased from 11 to 12; the backend
latched communication fault and ID 2 status became invalid. A later Stop received
an applied ACK and a verification attempt increased the count to 13.

This establishes failed DXL transactions and an interruption. It does not isolate
a connector defect, UART/protocol behavior, timing stalls or trajectory quality.
ESP-NOW was clean in the recorded observation intervals.

- The earlier backend allowed three 45 ms attempts for each of three synchronous
  status reads. The new runtime path uses two incremental block reads.
- The nominal goal period is 10 ms; real command gaps were not measured. These
  earlier synchronous reads could delay pipeline work. The configured 250 Hz model
  parameter is not proof of a measured fixed-rate loop.
- The earlier correction-only filtering left the mass-position base separate.
  The complete-command filter ran in the current handling trial. The operator
  reports improvement, with some smoothness issues remaining.
- Relative motor mapping +1/+1 is accepted. That is separate from confirming the
  intended common/differential content and inertia illusion.

Next work is in [08](../../08_IMPLEMENTATION_PLAN.md). No new protection layer or
blanket fault-threshold change is justified by this documentation review.

## Last known bench state

AtomS3 USB is connected to PC COM3 following the radio-startup firmware update.
StampC5 has been moved from Quest to PC for the requested desktop rehearsal.
AtomS3's last direct status confirmed a paired radio session and Idle with both
outputs OFF; the new desktop connection is being checked. Console handles are
closed; do not claim the dongle's USB interface while a browser owns it.

Normal powered testing is authorized. The user asked to avoid repeated power
switch confirmations, accepted a short 30-second observation, and deferred
Record/Replay. Skipped tests have not been promoted to passes.

## Verification already available

The previous 2026-09-05 checkpoint passed control/telemetry schema fixtures,
host-lab 8/8, visual-client typecheck/build, AtomS3 baseline, AtomS3 tilt+ESP-NOW
and StampC5 builds. Native GCC/G++ remains unavailable; the new Wasm/Node results
above now execute the C++ additions using the existing Unity Editor compiler.
Documentation-only cleanup did not require repeating builds.

Cleanup verification: eight active documents, local Markdown links resolving,
and a clean `git diff --check`. Reference/archive paths were checked as well;
removed/replaced text is recoverable as described in [archive](../README.md).

The current working tree contains uncommitted firmware, protocol, test and
documentation changes on main, based on b130e51. No remote fetch, commit or push
was performed during this implementation checkpoint; both device firmwares
were updated as recorded above.

## Evidence and future work

Detailed past bench outcomes remain in [archived validation](07_TEST_AND_VALIDATION_FULL_RECORD.md)
and [production history](23_ATOMS3_PRODUCTION_INTEGRATION.md).
They explain the current implementation; their old pending tasks and power-off
procedures are not today's plan.

Research-quality voicing, repeated spatial/resonance characterization,
FSR gain, recorder/replay, external events, product security, long endurance
and publication are deferred in 08. LittleFS has not been formatted.
