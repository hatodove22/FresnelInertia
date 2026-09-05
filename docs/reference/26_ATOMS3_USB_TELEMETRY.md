# AtomS3 USB Telemetry Reference

Optional implementation detail for direct AtomS3 USB observation.
[Interfaces](../05_INTERFACE_SPEC.md) describes the demo transport;
[demo acceptance](../07_TEST_AND_VALIDATION.md) defines normal validation.
Current results live in [project status](../16_PROGRESS_STATUS.md).

## Enable and observe

The producer sends newline-delimited canonical JSON on the existing
115200-baud USB console. It does not change run mode or physical output.

Two gates must be open:

- Compile: `HAPTICS_ENABLE_USB_TELEMETRY=1`, enabled by
  `m5stack-atoms3-pipeline` and its derived environments. The source default is 0.
- Runtime: `features.enable_usb_telemetry=true`. Boot always forces it OFF;
  only the local console command enables it. Presets and remote parameter
  changes cannot start the stream.

```text
usb telemetry status
usb telemetry on
usb telemetry off
```

An enabled build starts with `compile=1 runtime=0`. Safe Idle leaves observation
enabled so the resulting state can be inspected. Starting observation does not
enable audio or tilt. For cable-free handling, use the StampC5 stream described
in the [Haptic Link reference](28_ESPNOW_STAMPC5_TELEMETRY.md).

## Framing and scheduling

`iface.telemetry_period_ms` is locally clamped to 50–5000 ms; the production
default is 100 ms. This is latest-value observation, not a full-rate recorder.
Skipped `frame_counter` values are expected because the pipeline runs faster.
Use `evt_total` to notice events that occurred between observations;
`new_evt` describes only the sampled pipeline frame.

The producer holds at most one pending JSON line in a 3072-byte buffer.
Each update writes up to 256 bytes, bounded by `Serial.availableForWrite()`.
If another sample is due while a line is pending, it drops the new sample
instead of waiting for the host. Serialization overflow increments an error
and does not publish a truncated JSON object.

The application requests a 4096-byte Serial TX ring before `Serial.begin()`
when this producer is compiled. This avoids the observed partial-frame stalls
with the original 256-byte HWCDC ring. The boot log reports actual and requested
allocation sizes. Buffer allocation does not enable streaming.

Explicit console commands remain available during streaming. Periodic verbose
output is suppressed. Before a human-readable response, a pending frame is
discarded and counted as a console interruption; an already-started frame gets
a best-effort newline. If that newline cannot be written, `unterminated`
increments. Keep those malformed/console lines as transport text when parsing
a mixed log; do not mistake them for canonical telemetry or silently repair them.

## Fields and counters

Each frame follows [the telemetry schema](../../schemas/telemetry_frame.schema.json):
`timestamp_ms`, `frame_counter`, `new_evt`, `evt_total`, `preset`, `run_mode`,
`mass`, four `actuators`, and `safety`. This producer also emits raw `imu`,
`last_event`, `audio`, and `tilt_servo`.

Audio fields include enable/silence state, backend/layout, active channel count,
test state, effective peak limit, and underrun count. Tilt fields include state,
fault, communication errors, command/status ages, and two device records with
validity, torque, position/goal, current, voltage, and temperature.
Interpret device values together with `status_valid`; a cached torque flag with
invalid status is not a fresh physical confirmation. IMU values remain raw,
before the mounted-frame transform.

`usb telemetry status` exposes these producer-local values:

| Console field | Meaning |
|---|---|
| `compile`, `runtime`, `period_ms` | Availability, enabled state, effective observation interval |
| `pending` | Bytes not yet accepted by the Serial buffer |
| `tx` | Complete frames submitted to Serial, not host-receipt acknowledgments |
| `dropped` | Sum of backpressure and console-interruption drops |
| `backpressure` | Samples skipped because a previous line remains pending |
| `console_interrupt` | Pending lines discarded for an explicit console response |
| `unterminated` | Started lines whose closing newline could not be written |
| `errors` | JSON serialization failures, separate from audio underruns or DXL errors |

Counters accumulate from producer initialization; toggling the runtime stream
does not reset them. Compare before/after values when diagnosing a capture.
Known command interruptions explain framing gaps without proving a haptic fault.

## Optional recorded-log analysis

For an ordinary demo, inspect live state and keep a short result in the status
document. The passive [lab tool](../../tools/lab/README.md) can split a recorded mixed
log or investigate a specific failure; it does not open a device or send commands.

For example, from the repository root with an existing UTF-8 monitor log:

```powershell
cmd.exe /d /c "node tools/lab/lab.mjs capture --out artifacts/lab/usb-capture-UNIQUE < MONITOR.log"
```

Choose a new output directory. Capture retains exact input bytes as
`mixed-input.raw`, JSON lines as `telemetry.ndjson`, and other lines as
`transport.log`. Invalid UTF-8 preserves the raw input and returns a failure.
Schema checking happens during `check`; parseable JSON alone is not validation.

The lab's strict Gate 1 templates intentionally enforce their historical fixed
context and metadata. They are optional tools for reproducing that experiment,
not prerequisites for the current demo or combined tilt/vibration run.
[The historical validation record](../archive/2026-09-05/07_TEST_AND_VALIDATION_FULL_RECORD.md)
retains the old acceptance details.

Implementation: [producer](../../src/UsbTelemetryProducer.cpp),
[status/buffer definitions](../../include/haptics/UsbTelemetryProducer.hpp),
[console integration](../../src/HapticPipeline.cpp), and [TX setup](../../src/main.cpp).
