# 28 ESP-NOW StampC5 Haptic Link

> Technical reference; read only when the current task needs this detail. Current scope, facts, and demo acceptance are in ../08_IMPLEMENTATION_PLAN.md, ../16_PROGRESS_STATUS.md, and ../07_TEST_AND_VALIDATION.md.

## 1. Purpose and scope

The bench needs cable-free AtomS3 motion while retaining a conventional USB
capture and control point. The implemented prototype is bidirectional:

```text
AtomS3 four-layer pipeline
  -> telemetry/state over ESP-NOW
  -> StampC5 -> USB NDJSON -> host

host -> StampC5 USB command
  -> structured ESP-NOW request
  -> AtomS3 execution -> structured ACK -> StampC5 USB
```

This is an additive first Haptic Link implementation. It does not replace the
normal `m5stack-atoms3-pipeline` image, canonical `TelemetrySnapshot`, local
button safety, or USB/JTAG recovery. The AtomS3 remains the owner of applied
state and physical safety decisions. The dongle sends intent and reports the
AtomS3 execution result.

## 2. Build, activation, and pairing gates

- `m5stack-atoms3-pipeline` retains `HAPTICS_ENABLE_ESPNOW_TELEMETRY=0`.
- `m5stack-atoms3-pipeline-espnow-monitor` is the haptic-only Haptic Link
  environment. `m5stack-atoms3-pipeline-tilt-espnow-monitor` adds the guarded
  AtomS3 DXL2 backend and explicit paired-dongle tilt-arm authorization.
- `features.enable_espnow_telemetry` defaults false and pipeline initialization
  leaves it false. Only the full tilt+ESP-NOW demo target sets
  `HAPTICS_DEMO_ESPNOW_AUTOSTART=1`: successful setup enters Idle/output OFF,
  then invokes the existing local radio-enable path. Other builds retain
  manual activation. No preset or radio request can enable the radio.
- Local AtomS3 commands `espnow link on|off` require Safe Idle: Idle run
  mode, audio output silenced, and tilt disabled. `espnow link status` is
  read-only and available in any mode. The earlier `espnow telemetry ...`
  spelling remains an alias.
- Each radio start generates a new nonzero session ID and clears the prior
  paired source and request sequence.
- The StampC5 learns the AtomS3 MAC only from a CRC-valid telemetry frame and
  automatically sends `hello`.
- The AtomS3 accepts the first `hello` only in Safe Idle and pins that source
  MAC. Later requests require the same source, session ID, and a strictly
  increasing request ID.
- The link remains active across Live and Safe Idle so the dongle can return
  postcondition telemetry. It can be switched off only from the local AtomS3
  console in Safe Idle.

This is physical-presence pairing, not cryptographic authentication. ESP-NOW
payload encryption and provisioned keys remain required before treating the
link as a product security boundary. The current bench link carries no private
data and is deliberately limited by an Atom-side operation/parameter policy.

## 3. Wire contracts

All frames are packed, little-endian, CRC-32 protected, and within the
250-byte legacy ESP-NOW payload bound:

| Frame | Direction | Magic | Bytes | Contract |
|---|---|---:|---:|---|
| telemetry v3 | AtomS3 -> StampC5 broadcast | `FHT1` | 230 | `schemas/espnow_telemetry_wire_v3.json` |
| telemetry v2 compatibility | AtomS3 -> StampC5 broadcast | `FHT1` | 200 | `schemas/espnow_telemetry_wire_v2.json` |
| telemetry v1 compatibility | AtomS3 -> StampC5 broadcast | `FHT1` | 164 | `schemas/espnow_telemetry_wire_v1.json` |
| command | StampC5 -> paired AtomS3 unicast | `FHC1` | 140 | `schemas/espnow_control_wire_v1.json` |
| execution response | AtomS3 -> paired StampC5 unicast | `FHA1` | 88 | `schemas/espnow_control_wire_v1.json` |

The radio callback on each device only validates/copies a bounded frame into a
fixed queue. State mutation, JSON serialization, command execution, and USB
printing occur on the main loop.

The bridge reuses one static JSON document for loop-owned serialization. Keeping
that workspace local alongside the v3 receive buffers overflowed the loop task
stack on hardware; static storage fixed the observed restart without increasing
task stack size or changing the wire protocol.

Wire v3 preserves v2 offsets through byte 195, adds 30 bytes of applied
configuration, and places its CRC at byte 226. Upgrade StampC5 before using a
v3 AtomS3 sender: the updated bridge accepts v1/v2/v3, but older receivers do
not understand v3. Commands and execution responses are unchanged.

## 4. Implemented command policy

The StampC5 USB interface accepts:

- `status` and `stats reset`
- `pair`
- `get state`
- `idle` or `stop`
- `live`
- `audio on|off`
- `tilt on|off|clear`
- `preset load <name>`
- `set <path> <number>`

AtomS3 policy is narrower than its local console:

- `hello`: Safe Idle only
- `get_state`: paired session; an immediate telemetry frame follows
- `safe_idle`: paired session; this is allowed from an active state
- `live`: paired session and the existing IMU safety interlock; it never arms
  audio by itself
- `audio off`: paired session; clears channel-test state
- `audio on`: Live only and still subject to the existing compile and IMU
  physical-arm interlocks
- `tilt off`: always requests verified disarm
- `tilt on`: Live only, only in the dedicated remote-arm image, and still
  subject to DXL2 preflight plus IMU/motion safety interlocks
- `tilt clear`: Safe Idle only; reruns torque-off preflight after a latched fault
- `load_preset`: Safe Idle only
- `set_param`: Safe Idle, finite numeric value, and only this allowlist:
  `container.{fill,headspace,viscosity,particle_count,particle_hardness,span_x_m,span_y_m,span_z_m}`,
  `mass.{damping_ratio_x,damping_ratio_y,energy_decay_s}`, and
  `resonance.master_gain`
- `trigger_event`: reserved in wire v1 but returns `unsupported` until the
  external-event ingress into the shared Event/Texture/Resonance path exists

Every CRC-valid request receives an execution response when the source can be
reached. Results distinguish applied, rejected, unsupported, not-paired,
bad-session, stale-request, invalid-request, and busy. An ACK reports execution
at an AtomS3 frame counter; it is not merely a radio-delivery callback.

## 5. Telemetry, loss, and USB output

The AtomS3 broadcasts the latest snapshot at `iface.telemetry_period_ms`,
clamped to 50--5000 ms; the current default is 100 ms (10 Hz). Its `tx` counter
means the ESP-NOW API accepted the request. Receiver sequence gaps remain the
authoritative delivery-loss signal.

If a valid packet from the current AtomS3 has a sequence less than or equal to
the preceding sequence, StampC5 treats it as an AtomS3 radio restart: it counts
`sequence_resets`, discards the stale control session and any pending request,
then uses the existing auto-Hello path to obtain the new random session. A true
32-bit wrap is intentionally handled the same way; at 10 Hz it occurs only
after years of continuous operation.

The StampC5 emits the transported canonical telemetry subset as NDJSON. Wire v2
adds the servo state/fault, command/status age, communication count, and two
devices' torque, home/goal/actual position, current, voltage, temperature,
hardware-error, and operating-mode fields. The updated receiver still accepts
wire v1. Wire v3 additionally emits:

```json
{"resolved":{"family":"Granular","container":{"span_x_m":0.055,"span_y_m":0.09,"span_z_m":0.04,"fill":0.35,"headspace":0.65,"viscosity":0.1,"particle_count":0.75,"particle_hardness":0.8},"model":{"coherent_container_demo":true,"device_frame_transform":true}}}
```

This object is added to the normal snapshot, not sent as a separate message.
The producer caches applied `SystemParams` at configure; `fill` comes from the
same snapshot's existing `mass.fill`. Immediate control snapshots refresh
preset, run mode, idle mass/fill and output status before publication, without
pretending to advance the IMU sample/frame counter. Wait for an applied ACK
and matching resolved state; a preset-name match alone is not geometry proof.
v1/v2 omit `resolved`, so a client must mark dimensions/model as unknown.

`imu` remains in raw sensor coordinates. If `device_frame_transform` is true,
the mounted transform is `body.x=-raw.y`, `body.y=(raw.x+raw.z)/sqrt(2)`,
`body.z=(raw.z-raw.x)/sqrt(2)`; false means identity. Internal positive body z
points toward the wrist, so semantic forward is negative body z. The client
can derive orientation from these values; no second gravity estimate is sent.
`coherent_container_demo` identifies the new shared content/contact model.

Status
separately reports valid/invalid telemetry, sequence gaps/restarts, callback queue drops,
wrong-length frames, JSON serialization errors, USB output drops, valid/invalid
responses, rejected responses, command sends/errors/timeouts, pairing/session,
pending request, last sequence, and AtomS3 MAC. Human-readable status, TX, and
ACK lines coexist with JSON; host capture must tolerate mixed logs.

USB output drops can legitimately accumulate while no host has the StampC5
port open. Reset statistics after opening the port when evaluating a capture.
They are distinct from radio loss and JSON serialization failure.

Focused software checks are `test/espnow_resolved/test_main.cpp` (production
encoder/validator, fixed offsets, CRC, invalid fields, v1/v2 compatibility) and
`node test/schema/validate_resolved_telemetry.mjs` (optional canonical object).
Actual radio/USB transfer and visual agreement still need the normal demo run.

## 6. Initial link diagnostic (not required each run)

The short normal demo flow is in [05](../05_INTERFACE_SPEC.md). The following
sequence is retained for a new link implementation or a relevant recovery bug;
do not re-upload or reboot both boards before every handling trial. Build
StampC5 using the isolated cache in [setup](19_DEVELOPMENT_SETUP.md).

1. Upload both dedicated environments and open StampC5 USB at 115200 baud.
2. The current full demo image automatically starts the radio in Idle/output
   OFF. For another radio build or an older image, use AtomS3 local USB to
   enter Safe Idle and issue `espnow link on`.
3. Require advancing JSON plus `paired=1` on StampC5. Use `pair` only to retry
   discovery explicitly.
   Reboot AtomS3 once with StampC5 left running; require one sequence restart,
   automatic session replacement, and a successful post-restart `get state`.
4. Send `get state`; require a matching applied ACK and a newer telemetry frame.
5. Exercise `live`, then `stop`, without `audio on`. Require two applied ACKs
   and a final state of Idle, audio runtime false, output silenced true, and
   tilt disarmed.
6. Run `stats reset`, observe a short open-port interval, and require no radio
   invalid/gap/queue/length/response errors. USB output drops are evaluated only
   while the port is open.
7. Disconnect or route away only the AtomS3 USB cable. Use StampC5 for the
   intended orientation/material test. Physical output is enabled only by the
   explicit `live` then `audio on` sequence.
8. `stop` is available through the paired dongle, but telemetry loss never
   proves that output stopped. The AtomS3 button and on-device safety paths
   remain authoritative.
9. Reconnect AtomS3 USB for flashing or `espnow link off`.

## 7. Evidence on 2026-09-04

- AtomS3 and StampC5 bidirectional builds succeeded and both images were
  uploaded on COM3 and COM4 respectively.
- StampC5 discovered AtomS3 `34:B7:DA:5E:75:90`, automatically paired, and
  received a nonzero session ID.
- `get state`, `live`, and `stop` requests each received an `applied` execution
  ACK with matching request IDs.
- 41/41 captured telemetry lines parsed as JSON during that check.
- final received state was Idle, audio runtime false, output silenced true, and
  tilt disarmed.
- at the end of the check: 179 valid telemetry packets, zero invalid packets,
  zero radio sequence gaps, zero callback queue drops, zero length errors, four
  valid responses, zero invalid/rejected responses, zero command send errors,
  and zero command timeouts.
- one earlier USB write failure accumulated while COM4 was not being drained;
  it motivated separating USB-output drops from serialization errors.
- after uploading that counter split, a fresh open-COM4 run parsed 97/97
  complete telemetry lines as JSON. The post-reset `status` snapshot reported
  41 valid packets with zero invalid packets, sequence gaps, callback queue
  drops, length errors, serialization errors, or USB output drops.
- `stop` and `get state` received matching applied ACKs. An intentional
  `audio on` request while Idle received `rejected` with
  `live_required_to_enable_audio`; the final state remained Idle, audio runtime
  false, output silenced true, and tilt disarmed.
- the current StampC5 restart-recovery image is RAM 49,996 bytes (15.3%) and
  flash 1,029,393 bytes (78.5%).
- a powered AtomS3 reflash/reset produced `sequence_resets=1`; StampC5 replaced
  session `8829EB91` with `58941D87`, automatically paired, and received
  applied ACKs for post-restart `get state` and `stop`.

## 8. Cable-free handled tilt evidence on 2026-09-05

- With the AtomS3 USB cable removed and only the StampC5 connected on COM4,
  ESP-NOW telemetry remained paired. A 440-frame observation and a subsequent
  `get state` transaction had zero invalid packets, sequence gaps, sequence
  resets, or callback queue drops; the request received an `applied` ACK.
- After reseating the local XL330 power, ground, and signal wiring, a remote
  `tilt on` reached `armed` with both torque readbacks true at 5.1--5.2 V.
- During a slow handled roll, the operator reported a directionally plausible
  but jerky response. At the same time the XL330 communication-error counter
  increased from 11 to 12, the tilt backend latched `communication`, and ID 2
  status became invalid. The paired ESP-NOW session remained active.
- The following remote `stop` received an `applied` Safe-Idle ACK and requested
  torque-off for both devices. Its verification attempt added one more XL330
  communication error, leaving ID 2 without a fresh valid status readback.
- The observer rate does not clock servo commands. Goals target 10 ms on-device,
  but synchronous DXL health reads can stall both goal and model updates; actual
  gaps were not measured. The abrupt response coincided with exhausted local
  read retries, without isolating an electrical, UART or scheduling cause.
  Check continuity and full commanded/actual motion as described in
  [the active plan](../08_IMPLEMENTATION_PLAN.md), then judge trajectory quality.
