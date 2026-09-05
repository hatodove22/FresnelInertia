# Passive host lab tool

This dependency-free Node.js tool validates recorded telemetry and turns a
bench run into a reproducible evidence directory. It never opens a serial or
network connection and never sends a device command. A serial monitor,
WebSocket client, or other producer must provide newline-delimited input.

This is an optional strict experiment tool. Its retained Gate 1 templates and
hash/metadata rules are not the current demo acceptance contract. Ordinary
handling checks follow [demo acceptance](../../docs/07_TEST_AND_VALIDATION.md);
do not repeat the historical campaign merely to run the demonstration.

## Commands

```text
node tools/lab/lab.mjs self-test
node tools/lab/lab.mjs validate --plan tools/lab/plans/gate1-static.template.json
<producer> | node tools/lab/lab.mjs capture --out artifacts/lab/raw-UNIQUE-ID
node tools/lab/lab.mjs check --plan RUN-PLAN.json --telemetry TELEMETRY.ndjson --out artifacts/lab/evidence-UNIQUE-ID
```

`capture` first retains the stdin stream byte-for-byte as `mixed-input.raw` and
hashes that raw artifact. It then uses fatal UTF-8 decoding, retaining every
valid JSON line in `telemetry.ndjson` and every other line, including blank or
malformed lines, in `transport.log`. Invalid UTF-8 returns input failure while
leaving the exact raw bytes and an `input_error` capture manifest; it is never
repaired with replacement characters. `check` then validates each telemetry
object against the canonical schema and evaluates the plan. Output directories
are exclusive and are never overwritten.

Exit codes are stable: `0` pass, `2` acceptance failure, `3` input/schema
failure, and `4` tool failure.

## Run plans

Start from one of these templates and give every physical run a unique
`run_id`:

- `plans/gate1-static.template.json`: two-second settling window followed by
  30 seconds with no new event, with the fixed powered Live context and quiet
  signal/event envelope retained through a 33-second minimum-capture anchor
- `plans/gate1-pulse.template.json`: two-second quiet baseline, deliberate
  actuator-and-Mass-energy response, silence onset within two seconds, then a 30-second continuous
  event-free silence interval that must remain quiet in powered Live through a
  40-second minimum-capture anchor
- `plans/gate1-pulse-s1-off.template.json`: the same software response/settling
  bounds with an explicit S1-OFF physical no-vibration observation

`minimum_capture_duration_ms` is part of the immutable Gate 1 contract: `33000`
for static and `40000` for both pulse variants. A shorter log, an early Safe
Idle frame in place of the powered end anchor, or activity recurring after the
first qualifying silence interval fails.

Every configured positive response minimum is conjunctive: actuator and Mass
energy minima must both be reached in the response window. `new_evt` and
`evt_total` retain their integrity role, but a wall event is not required for a
bounded pulse.

Use `frame_counter_mode="contiguous"` only for a full-rate recording. Use
`"monotonic"` for latest-value remote telemetry where skipped firmware frames
are expected. `timestamp_origin="first_frame"` interprets the configured
static/pulse timestamps as offsets from the first captured frame, so device
uptime does not need to be copied into the plan.
Plan/report timing and counter values plus canonical `timestamp_ms` are bounded
to the JSON safe-integer maximum; rounded values above `9007199254740991` are
input errors.

Before the final `check`, replace every `EDIT_ME` metadata value and set the
authorization, final Safe Idle, and `evidence_complete` booleans truthfully.
Normalized placeholder identities such as `TODO`, `TBD`, `N/A`, `?`, `-`,
`pending`, `unknown`, or `not applicable` are also rejected; changing the
spelling or punctuation of an unfinished value does not complete the record.
The required record includes git/build identity, PlatformIO environment and
hardware profile, preset ID/source/hash, resolved feature flags, calibration
identity, fixed Gate 1 run variant, effective output limit, S1 and 12 V states,
fixture orientation,
expected compiled/installed/runtime audio backend, transport/layout/channel
count, explicit physical-output authorization, a structured
`operator_observation_outcome` plus notes, final Safe Idle confirmation, and
structured `usb_telemetry_status_before` / `_after` snapshots copied from the
two console status lines. A
hardware plan with a placeholder `run_id` or other
missing/template metadata returns `RUN_METADATA_INCOMPLETE` even when the
signal checks pass.

Physical-output evidence is a fixed Gate 1 production contract, not a generic
"match whatever the plan declares" check. A completed hardware plan must name
`m5stack-atoms3-pipeline`, the `as-built AtomS3 custom board` profile,
`liquid_small_box`, 12 V ON, Live mode, the
compiled/installed/runtime audio backend, TDM8, `quad_wall_4ch`, four active
channels, and the initial `0.08` effective peak limit. The `active` variant
requires S1 ON and may use one canonical static or pulse measurement; the
`s1_off_control` variant requires S1 OFF and the canonical pulse measurement.
Every physical plan uses `timestamp_origin="first_frame"`,
`frame_counter_mode="monotonic"`, exactly one 500 ms sequence check, and
exactly one measurement check with the committed template thresholds. Missing,
duplicated, or relaxed checks return `RUN_PLAN_CONTRACT_MISMATCH`. Changing both
the plan and telemetry to a muted,
2-channel, demo-compatible, or other degraded state remains a failure.
A plan carrying a Gate 1 variant or production-environment marker cannot bypass
this contract by setting `physical_output_authorization_required=false`.

For a completed `first_frame` physical run, every canonical frame from the
first frame through the 33/40-second minimum-capture anchor must match the fixed
preset and the fixed Gate 1 run/audio context above. The static signal/event
envelope includes both its first canonical assessment-end anchor and every
subsequent frame through the minimum-capture anchor. Across the entire canonical log,
`audio.test_mode` and `audio.demo_compat_mode` must be false, `test_wall` must
be `None`, fault injection must be inactive, and tilt must remain disarmed. In
the active window,
`audio.output_peak_limit` must be `0.08`. Runtime ON requires
`audio.output_silenced=false` and `safety.audio_zero_asserted=false`; runtime
OFF requires their inverse. The same frames must show
`safety.imu_stale_safe_stop=false`,
`safety.imu_fault_injection_active=false`, and
`safety.tilt_disarmed=true`; every active frame must also contain
`imu.valid=true`. The static check requires a canonical anchor at or after its
assessment end, no more than 500 ms late, and compares signal bounds and
`evt_total` through its 33-second anchor so an end-gap or tail failure cannot be
hidden. Pulse silence must qualify by its original settle deadline and then
remain continuous through its 40-second anchor.
`audio.underrun_count` may not change through the final frame. Every
post-active frame must be either the unchanged fixed Live context or the full
Safe Idle postcondition; after the first Safe Idle frame, Live cannot re-arm in
the same log. Otherwise
`check` returns
`RUN_TELEMETRY_CONTEXT_MISMATCH`. The final frame must occur after the active
window and prove Idle, zero Mass position/velocity/energy, zero actuators and
current/latched events, `evt_total` unchanged from the active-end frame, the
production backend/transport/layout/channel state,
audio runtime OFF with zero asserted and test/demo modes cleared, tilt disarmed,
and no stale stop; otherwise it returns
`FINAL_SAFE_IDLE_NOT_PROVEN`. An operator outcome of `fail` returns
`OPERATOR_OBSERVATION_FAILED`; free-form observation text alone can never turn
a physical rejection into a pass. The machine-readable
`metrics.hardware_evidence.complete` flag is true only when metadata, plan/USB
contract, canonical context, operator outcome, post-active transitions, and
final Safe Idle all pass.

The before/after USB snapshots must both report compile ON, runtime OFF, the
fixed 100 ms Gate 1 period, and zero pending bytes. The `transmitted_frames` delta must exactly
equal the canonical telemetry frame count, while
`dropped_frames`, `backpressure_dropped_frames`,
`console_interrupted_frames`, `unterminated_partial_frames`, and
`serialization_errors` must remain unchanged. Any difference returns
`USB_TELEMETRY_EVIDENCE_FAILED`; this strict Gate 1 contract requires a fresh
attempt rather than accepting an unbound transport-log explanation.
Each snapshot must also satisfy
`dropped_frames = backpressure_dropped_frames + console_interrupted_frames`.

The committed thresholds describe the historical Gate 1 analysis contract.
They neither command output nor require its old power/switch sequence.
Current hardware operation is described in
[the hardware contract](../../docs/04_HARDWARE_AND_PIN_SPEC.md).

## Evidence directory

Every `check` result includes byte-exact copies of the input run plan and
telemetry, including malformed UTF-8 diagnostic inputs, plus derived metrics,
JSON and Markdown reports, a manifest, and exact copies of the three schemas
used. The manifest stores byte counts and SHA-256 hashes. Acceptance failures
still produce a report; readable schema/input failures produce an
`input_error` report when possible. `validate --report` checks semantic
finding/check counts, the exact finding-code set, overall status, unique check
IDs, and finding-to-failed-check references after schema validation. A PASS
report must contain a positive frame count, a positive check count, and at
least one passing check; an empty hand-authored PASS is invalid. Diagnostic
duration uses only ordered schema-safe timestamps, so an out-of-range timestamp
cannot prevent the original plan and telemetry bytes from being preserved.
Input files are decoded with fatal UTF-8 validation; malformed bytes produce an
`input_error` and are still preserved byte-for-byte and hashed in the evidence
bundle rather than being silently replaced before JSON parsing.

Run implementation tests with:

```text
node --test test/lab/self_test.mjs
```
