# 05 Interfaces and State Ownership

AtomS3 owns applied parameters, motion/content simulation and actuator output.
StampC5 relays high-level intent and reports AtomS3 execution results. The
client renders that state; it does not stream servo or vibration samples.
See [00](00_DESIGN_SPECIFICATION.md) for the experience and
[07](07_TEST_AND_VALIDATION.md) for completion.

## Current targets

| Target | Interface and role |
|---|---|
| `m5stack-atoms3-pipeline` | Audio baseline; local serial control and optional USB NDJSON; servos and remote backend compiled out |
| `m5stack-atoms3-pipeline-espnow-monitor` | Audio plus bidirectional ESP-NOW |
| `m5stack-atoms3-pipeline-tilt-espnow-monitor` | Assembled demo: audio, two servos and ESP-NOW |
| `m5stack-stampc5-espnow-bridge` | USB text commands and mixed NDJSON/status/ACK output |
| StickS3 remote targets | Retained SoftAP HTTP status and WebSocket JSON; not the current AtomS3 transport |

The `webxr/` client now has an optional connected demo alongside its local
preview: desktop Web Serial and a WebUSB path, explicit output
controls, applied preset/fill and device-driven visuals. The implementation has
software tests, actual desktop handling and operator-reported initial Quest
USB/state access. VR/Quest work is now on hold; Android is the planned mobile
host, not a verified client. Reuse the desktop path while tuning. See
[16](16_PROGRESS_STATUS.md) for actual connection and handling evidence.
No additional BLE, OSC, cloud or general transport framework is required.

## Starting and controlling the dongle path

The full AtomS3 tilt+ESP-NOW demo image sets `HAPTICS_DEMO_ESPNOW_AUTOSTART=1`.
After successful initialization it enters Idle with both outputs OFF and
enables the radio; StampC5 learns its telemetry source and pairs by Hello.
The flag defaults to OFF, preserving manual activation for other radio builds
and older images: locally enter Idle and issue `espnow link on`.
Link activation requires audio silenced and tilt disabled. The link then stays
active across Live and Idle; do not repeat pairing for every content change.
Radio startup does not enable vibration or servo torque.

StampC5 uses USB at 115200 baud and accepts:

| Command | Meaning |
|---|---|
| `status`, `get state` | Bridge diagnostics or fresh AtomS3 state request |
| `pair`, `stats reset` | Retry pairing or reset bridge observation counters |
| `stop` / `idle` | AtomS3 Safe Idle |
| `live` | Enter Live without arming outputs |
| `audio on` / `audio off` | Explicit audio enable/disable |
| `tilt on` / `tilt off` | Explicit tilt arm/disarm in the dedicated tilt image |
| `tilt clear` | In Safe Idle, rerun torque-off preflight after a fault |
| `preset load <name>` | Load a device preset in Safe Idle |
| `set <path> <number>` | Apply an allowlisted numeric property in Safe Idle |

The property allowlist is:

- `container.{fill,headspace,viscosity,particle_count,particle_hardness,span_x_m,span_y_m,span_z_m}`;
- `mass.{damping_ratio_x,damping_ratio_y,energy_decay_s}`;
- `resonance.master_gain`.

Normal content change is Stop -> preset/properties -> applied ACK -> deliberate
Live and desired output enables. Connecting, reconnecting or choosing a preset
must not silently arm physical output. Tilt arming performs the existing
two-servo preflight; repeated electrical power cycling is not part of this flow.

The local AtomS3 console additionally provides `preset list`, audio diagnostics,
`tilt status`, Safe-Idle `tilt diagnose` (one PING per configured servo, no
actuation), calibration, recorder/replay, and USB telemetry controls.
These are development tools, not mandatory controls for the first client.

## Execution, wire format and telemetry

A radio send result is not an execution result. Requests carry a session and
request ID; the AtomS3 returns applied/rejected/unsupported or another explicit
result with its frame counter. The host must associate an ACK with the request
and distinguish rejection, timeout and stale state from success.

| Contract | Bytes |
|---|---:|
| [Telemetry v4: opt-in pile/pressure state](../schemas/espnow_telemetry_wire_v4.json) | 250 |
| [Telemetry v3](../schemas/espnow_telemetry_wire_v3.json) | 230 |
| [Telemetry v2 compatibility](../schemas/espnow_telemetry_wire_v2.json) | 200 |
| [Telemetry v1 compatibility](../schemas/espnow_telemetry_wire_v1.json) | 164 |
| [Command / execution response](../schemas/espnow_control_wire_v1.json) | 140 / 88 |

These are CRC-protected ESP-NOW frames within 250 bytes on channel 6.
The updated bridge decodes all four telemetry versions. Normal content still
sends v3; active granular-pile or pressure effects send v4. Update StampC5
before selecting these new presets: an older bridge cannot decode v4. Callbacks queue
data; the main loop executes commands and serializes output. Pairing isolates a
bench session but is not cryptographic authentication. Product security is
deferred, not a new demo requirement.

StampC5 emits a canonical telemetry subset as NDJSON alongside human-readable
status, TX and ACK lines. The client must tolerate mixed lines and partial USB
reads. Default telemetry is 10 Hz latest-value observation, not the servo clock.

Available state includes preset name, run mode, raw IMU, mass position/velocity,
fill, events, output/silence state and counters. V2 adds tilt backend state/fault,
communication count, command/status age and per-servo validity, torque,
home/goal/actual position, current, voltage, temperature and mode.
A model command is not a measured position. An invalid or stale readback is
unknown, not a physical zero or confirmed torque-off.

V3 adds `resolved.family`, `resolved.container` (three spans, fill, headspace,
viscosity, particle count/hardness), and `resolved.model`
(`coherent_container_demo`, `device_frame_transform`). These are the applied
device configuration, not browser preset guesses. Fill reuses the snapshot's
existing `mass.fill`. V1/v2 omit `resolved`; dimensions/model then remain
unknown. The extension is deliberately not a full parameter dump or CFD state.

V4 adds optional `mass.demo`: `pile_slope` (surface dy/dx), `granular_flow`
(0..1), `granular_pile_active`, and `pressure` with `enabled`,
`phase` (`sealed`, `burst`, `spent`), `charge` (0..1), `phase_s`, `remaining`
(0..1 of initial content), and `burst_sequence`. The 20-byte extension follows
the unchanged v3 prefix; phase time is quantized to milliseconds (saturates at
65.535 s), remaining content to 1/65535. V1-v3 omit this object. Full JSON and
recordings use the same names. `PressurePop` is event type 7; a sequence edge
creates one pop, not one pop per low-rate snapshot. Radio observation can miss
the short burst onset; the model owns the event and output scheduling.

Immediate command snapshots refresh preset, run mode, idle fill and output
metadata before publication. They retain the last IMU timestamp/frame counter;
an execution result does not pretend that a new motion sample was measured.

Full local USB/remote JSON and recordings also expose
`mass.wall_contact` and `mass.wall_impact_speed_norm_s`: four entries ordered
Front, Back, Top, Bottom. Contact is 0..1; impact is positive pre-bounce approach
speed in normalized distances/s for the current integration step. Low-rate
snapshots can miss brief impacts; event counters remain the occurrence record.
These contact arrays are not included in the compact radio v1-v4 subsets.

Canonical JSON contracts are
[control](../schemas/control_message.schema.json) and
[telemetry](../schemas/telemetry_frame.schema.json).
Frame/new-event/lifetime-event counters distinguish a current event from the
latched last-event label. Raw IMU fields remain in the sensor frame; the
[hardware frame transform](04_HARDWARE_AND_PIN_SPEC.md) applies at the model
boundary. Detailed framing and recovery are in
[Haptic Link](reference/28_ESPNOW_STAMPC5_TELEMETRY.md) and
[local USB telemetry](reference/26_ATOMS3_USB_TELEMETRY.md).

## Connected-client flow

The connected HUD selects transport, material, fill and desired vibration/tilt
outputs. Connect requests status/state only; it does not start output. A content
change sends Stop and the requested device preset/properties, waits for matching
execution ACKs, and displays the reported resolved configuration. Fill applies
`fill` and complementary `headspace`; dimensions come from the device rather
than the preview's 7 cm normalization. Start explicitly sends Live followed by
the selected output enables. Stop remains available during command sequences.

Explicit state refresh or reconnection abandons an old preset-selection wait
only after a successful state request, then displays the reported device
configuration. This handles a reboot that restored another preset; it does not
claim that the abandoned request applied or enable physical output.

The connected box and contents use reported mass position/velocity/activity.
Raw IMU plus the reported mounting-transform flag supplies gravity-referenced
roll/pitch, not absolute yaw. The view is a lightweight visualization of the
shared state, not a second physical haptic solver. Phone tilt, stimulus scripts
and preview-only tuning do not drive connected hardware.

The planned Android presentation need not use AR: ordinary-screen rendering
shares this same applied-state/command contract and still needs target-phone
USB verification. Optional hand-tracked camera AR remains unimplemented.
For that extension, MediaPipe-style hand landmarks are the primary position
reference; device IMU owns tilt. Hand-centered landmarks are not absolute AR
anchors, so camera/hand/device alignment and scale still need implementation.
A marker, including the AtomS3 screen, is an optional alignment aid, not a
continuous-tracking requirement. The phone is not assumed fixed to the haptic
device. Simultaneous camera/AR operation with StampC5 would require a separate
check only when that optional mode is added; see the
[platform references](reference/10_REFERENCES.md).

Disconnected/stale state holds the last view and labels output as unconfirmed;
it does not silently fall back to animated preview. Returning to preview while
connected requests Stop first. Reconnection requires a deliberate new Start.
The MR spatial panel mirrors applied state, device presets, desired outputs and
Start/Stop in connected mode. Transport selection/permission and the detailed
fill control remain on the HUD; connected MR controls use the same command path.

Parser/command-queue regressions and client typecheck/build are software
evidence. Actual desktop Web Serial and visual/handled agreement are recorded
in [16](16_PROGRESS_STATUS.md), alongside initial Quest USB/state reports.
Android support needs the affected target-host check in 07 before it is claimed;
the unfinished Quest rehearsal is deferred, not passed. The existing USB probe
helps diagnose a target-host interface failure; see
[USB reference](reference/19_WEBUSB_QUEST_PROBE.md).
`trigger_event` has a reserved opcode but currently returns unsupported.
The new soda preset internally generates `PressurePop` through the existing
event pipeline; this does not implement external `trigger_event` commands.

## Offline production-engine lab

`?lab=1` or **実機なしラボを開く** selects a separate, explicitly output-free
route. It compiles the production C++ model layers to a lazy-loaded Wasm module;
synthetic body-frame tilt/shake drives Mass through Spatial4 and the tilt model.
The scene consumes the returned state. It neither opens USB nor sends commands,
and cannot run alongside a connected device or an XR session. The ordinary
legacy JS preview remains separate. Displayed channel envelopes and servo
commands are computed values, not measured output or a tactile test.

## Stop and diagnostics

Stop exits calibration/record/replay, silences audio, requests tilt disarm,
resets dynamic state and enters Idle. Live alone does not re-enable outputs.
AtomS3 button hold uses the same local transition. Telemetry silence is not
evidence that a remote Stop executed.

The implemented stale-IMU stop, servo watchdog, feedback limits and output
bounds remain. Software disarm and an applied Stop ACK must not be represented
as verified physical torque-off when a servo reply is missing.

Recorder/replay, calibration and strict host-lab evidence formats remain
available in source and historical records. They are not prerequisites for
the short demonstration in 07.
