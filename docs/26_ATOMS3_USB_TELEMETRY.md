# AtomS3 USB canonical telemetry

## Purpose and boundary

The `m5stack-atoms3-pipeline` image contains a passive USB telemetry producer
for the next Gate 1 bench session. It emits newline-delimited JSON compatible
with `schemas/telemetry_frame.schema.json` over the existing 115200-baud USB
console. It does not open a second transport and it never changes run mode,
audio enable, audio gain/limit, tilt enable, or any other physical-output
state.

This document only prepares the evidence path. It does not authorize an
upload, 12 V power, S1 ON, servo torque, or haptic output. Use
`24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md` for the physical sequence and stop
conditions.

## Two independent gates

The stream is available only when both gates are open:

1. `HAPTICS_ENABLE_USB_TELEMETRY=1` at compile time. This is set only for the
   `m5stack-atoms3-pipeline` environment. Other builds use the source default
   of `0` unless deliberately overridden.
2. `features.enable_usb_telemetry=true` at runtime. Its parameter default is
   `false`, boot always forces the producer off, and only the local command
   `usb telemetry on` may open this gate. Presets and remote `set_param`
   traffic cannot arm it.

`usb telemetry on` and `usb telemetry off` report that physical output state
is unchanged. Safe Idle does not turn observation off, so its postcondition
can be recorded. Conversely, starting telemetry does not run `audio on` or
`tilt on`.

The producer uses `iface.telemetry_period_ms`, clamped locally to
`50..5000 ms`; the AtomS3 production default is `100 ms`. It keeps at most one
bounded JSON line pending, writes at most 256 currently-available bytes per
pipeline update, and drops a telemetry sample rather than waiting for a slow
or disconnected host. `usb telemetry status` exposes transmitted, dropped,
backpressure-drop, console-interrupt, unterminated-partial,
serialization-error, and pending-byte counters. `dropped` is the total of the
two explicit drop classes. The status field named `errors` counts USB JSON
serialization failures only; it is not the audio/I2S `underrun_count`.

## Canonical frame

Each JSON line contains all schema-required properties:

- `timestamp_ms`, `frame_counter`, `new_evt`, and `evt_total`
- `preset` and `run_mode`
- `mass`, four-element `actuators`, and `safety`

It also contains `imu`, `last_event`, and `audio`. In particular, every frame
used for physical-plan checking carries:

- `audio.compile_enabled`, `audio.driver_installed`, and
  `audio.runtime_enabled`
- `audio.output_silenced`, `audio.test_mode`, and `audio.test_wall`
- `audio.transport`, `audio.output_layout`, and
  `audio.active_output_channels`
- `audio.output_peak_limit` and `audio.underrun_count`
- `safety.imu_stale_safe_stop`
- `safety.imu_fault_injection_active` (schema-optional for legacy logs, but
  emitted by this producer)
- `safety.audio_zero_asserted`
- `safety.tilt_disarmed`

Current-schema physical Gate 1 evidence additionally requires the `imu` object
with `valid=true` in every active frame. The field remains schema-optional so
legacy non-physical logs still validate, but omission or intermittent invalid
samples cannot pass the production hardware contract.

The stream is latest-value telemetry, not a 250 Hz recorder. Skipped
`frame_counter` values are expected; use `frame_counter_mode: "monotonic"` in
the host run plan. At the 100 ms default, use a maximum sample gap no smaller
than the committed Gate 1 template value. `evt_total` remains the monotonic
event-integrity signal when a short-lived `new_evt` occurs between USB frames.

## Console commands

At boot, before any physical-output command:

```text
usb telemetry status
```

The AtomS3 production image must report `compile=1` and `runtime=0`. Start and
stop the passive stream with:

```text
usb telemetry on
usb telemetry off
```

The same build exposes local `imu fault on|off|status` for the dedicated stale
safety test in document 24. It is runtime OFF at boot and cannot be armed by a
preset, generic parameter, replay, or remote path. After stale-stop asserts,
`imu fault off` is rejected. Injection/stale interlocks also reject safety
disable, Calibration/Record/Replay entry, and new physical-output arms;
`idle` is the mandatory recovery so injection clear and every output disarm
happen together. A naturally recovered valid sample cannot clear an asserted
stale-stop; the latch is released only by that Safe Idle transition. Replay
EOF independently enters Safe Idle rather than
falling through to the real IMU path.

The ordinary console remains available while JSON is active. Periodic human
verbose output is suppressed to protect JSON framing; explicit commands such
as `status`, `idle`, and `usb telemetry status` still work. Their human-readable
lines are intentionally captured as transport chatter. If a command arrives
mid-frame, the partial frame is invalidated and counted as a console
interruption. The producer attempts a one-byte newline without waiting; if the
USB buffer cannot accept it, `unterminated` increments and the next human/JSON
newline closes a transport-chatter line. Either form is excluded from
canonical telemetry by the host capture classifier.

## Exact mixed-log to evidence workflow

Choose a unique identifier for every attempt. The examples below use
`20260828-gate1-a`; replace it rather than reusing an existing output path.
Run these commands from the repository root during the future authorized bench
session. They are documentation only and were not executed while implementing
this producer.

1. With the correct production image already uploaded by an authorized
   operator, start an interactive USB monitor with PlatformIO's UTF-8 file
   logger. The monitor prints the exact generated `logs/device-monitor-*.log`
   path when it starts:

   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\Users\tesul\.codex\skills\goosebumps-device-ops\scripts\Run-Pio.ps1 device monitor -e m5stack-atoms3-pipeline -b 115200 --filter log2file
   ```

2. Keep canonical telemetry OFF through document 24 steps 1--6 while the board,
   preset, Live mode, and 8% audio limit are prepared in that monitor session.
   Record `usb telemetry status` and `imu fault status` once before enabling
   the stream; transcribe the complete USB line into the plan's structured
   `usb_telemetry_status_before` snapshot. Normal
   static and pulse evidence requires `imu_fault_injection_active=false`.
   Use that newly started log for exactly one planned static or pulse attempt,
   and type `usb telemetry on` immediately before its measurement window. With
   `timestamp_origin: "first_frame"`, that first JSON frame defines time zero;
   a pulse plan therefore applies the one deliberate motion five seconds after
   the stream starts. Keep channel test/demo/wall-test and IMU fault injection
   disabled and tilt disarmed in every canonical frame. Keep the fixed
   Live/unsilenced context through the template's
   `minimum_capture_duration_ms` anchor (`33000` static, `40000` pulse). Static
   signal/event limits extend through its 33-second tail; pulse silence must
   qualify by the original settle deadline and remain unbroken through 40
   seconds. Only then finish the attempt with `idle` (or the documented
   physical Safe Idle action) and retain at least one later JSON frame proving
   neutral Mass/actuators/event state plus audio-zero/channel-test-off and
   tilt-disarmed postconditions with `evt_total` unchanged from the active-end
   frame. Every intervening post-active frame must be the fixed Live context or
   the full Safe Idle state, and the stream must never re-arm after its first
   Safe Idle frame. Then type `usb telemetry off` followed by
   `usb telemetry status`, transcribe it into
   `usb_telemetry_status_after`, and record `imu fault status` after the final
   Safe Idle. Keep these final snapshots in the same mixed log so changes in `tx`,
   `dropped`, `backpressure`, `console_interrupt`,
   `unterminated`, and `errors` are auditable. End the monitor with `Ctrl+C`.
   Re-arm explicitly with a new run ID/log for each later
   orientation, S1 state, or pulse attempt.

   In the plan object, console `compile`, `runtime`, `pending`, and `tx` map to
   `compile_enabled`, `runtime_enabled`, `pending_bytes`, and
   `transmitted_frames`; `period_ms` is unchanged. The remaining console
   counters map to `dropped_frames`, `backpressure_dropped_frames`,
   `console_interrupted_frames`, `unterminated_partial_frames`, and
   `serialization_errors`.

3. Preserve the newest generated monitor log under the unique run ID, then
   split valid JSON from console/transport text without opening a device:

   ```powershell
   New-Item -ItemType Directory -Force .\artifacts\lab | Out-Null
   $usbMonitorLog = Get-ChildItem -LiteralPath .\logs -Filter 'device-monitor-*.log' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   Copy-Item -LiteralPath $usbMonitorLog.FullName -Destination .\artifacts\lab\20260828-gate1-a.mixed.log
   cmd.exe /d /c "node .\tools\lab\lab.mjs capture --out .\artifacts\lab\capture-20260828-gate1-a < .\artifacts\lab\20260828-gate1-a.mixed.log"
   ```

   `capture-20260828-gate1-a/mixed-input.raw` is the byte-exact stdin stream and
   is hashed in `capture-manifest.json`; the direct input redirection above
   avoids PowerShell text decoding. `telemetry.ndjson` contains only parseable
   JSON lines. Human console messages and any partial JSON line are retained in
   `transport.log`; they are not silently discarded. Invalid UTF-8 makes
   `capture` return input failure while preserving `mixed-input.raw` and an
   `input_error` manifest, without emitting replacement-character-repaired
   telemetry.

4. Copy the applicable Gate 1 plan template to a uniquely named run-plan
   file. Fill every hardware/evidence field truthfully, including Git/build
   identity, profile, the fixed `liquid_small_box` preset ID/source/hash,
   `gate1_run_variant`, resolved feature flags,
   calibration identity, expected Live/audio backend/runtime/TDM/layout/4CH
   state, effective output limit, matching S1 and 12 V state, fixture,
   authorization, structured `operator_observation_outcome`, notes, final Safe
   Idle, and both typed USB status snapshots. Do not replace incomplete values
   with aliases such as `TODO`, `TBD`, `N/A`, `?`, `-`,
   `pending`, `unknown`, or `not applicable`; normalized placeholder identities
   are rejected. Do not change the template's
   first-frame/monotonic modes, single sequence/single measurement shape, 500 ms
   gap, fixed `minimum_capture_duration_ms`, or measurement thresholds. The
   checker uses all canonical frames from a `first_frame` origin through the
   powered 33/40-second active-check end (also including a static
   assessment-end anchor), validates every post-active
   transition, and requires the later final JSON frame to prove Safe Idle with
   an unchanged active-end `evt_total`. Pre-active
   canonical JSON is intentionally a context mismatch; preparation text may
   remain in the mixed log only as non-JSON transport evidence. Then run:

   ```powershell
   node .\tools\lab\lab.mjs check --plan .\artifacts\lab\20260828-gate1-a.plan.json --telemetry .\artifacts\lab\capture-20260828-gate1-a\telemetry.ndjson --out .\artifacts\lab\evidence-20260828-gate1-a
   ```

5. Treat a nonzero command exit, schema failure, sequence/sample-gap failure,
   `RUN_METADATA_INCOMPLETE`, USB-producer `errors` growth, unexpected
   dropped/backpressure/console-interrupt/unterminated growth between the two
   recorded status snapshots, a `tx` delta different from the canonical JSON
   frame count, a period other than the fixed Gate 1 `100 ms`, an inconsistent
   `dropped = backpressure + console_interrupt`
   snapshot, nonzero pending
   bytes, `RUN_PLAN_CONTRACT_MISMATCH`, `USB_TELEMETRY_EVIDENCE_FAILED`, an
   `audio.underrun_count` change reported as
   `RUN_TELEMETRY_CONTEXT_MISMATCH`, or
   `FINAL_SAFE_IDLE_NOT_PROVEN` as a failed or
   incomplete run. Because the current checker does not bind a transport-log
   line to a specific interruption, any `console_interrupt` increment is a
   strict Gate 1 failure and requires a fresh attempt even if its cause appears
   understandable. Preserve both the mixed log and the generated evidence
   directory.

## Software verification before upload

No device access is needed for these checks:

- build `m5stack-atoms3-pipeline` and confirm the compile-time backend is
  included;
- build at least one retained non-Atom baseline to prove the compile-off stub;
- run the existing schema validator and passive lab self/integration tests;
- inspect that boot/default params keep `enable_usb_telemetry=false` and that
  no remote parameter path can set it true.

The implementation is not hardware-accepted until a future session confirms
USB framing and drop counters with a real AtomS3. Until then, the producer is
software-prepared only.
