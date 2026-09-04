# Tests

## Automated now

Schema validation checks the committed control and telemetry samples:

```powershell
node test/schema/validate_schemas.mjs
```

Current samples:

- `schema/control_messages.valid.jsonl`
- `schema/control_messages.invalid.jsonl`
- `schema/telemetry_frames.valid.jsonl`
- `schema/telemetry_frames.invalid.jsonl`

See `schema/README.md` for the intentionally supported JSON Schema subset.
Expected-invalid fixtures must be rejected for exactly their committed error
codes; an accidental rejection for a different reason does not pass. Numeric
upper bounds such as `audio.output_peak_limit <= 1`, `new_evt <= 16`, and the
JavaScript-safe boot-counter limit are enforced. Current coverage is 11 valid
and 5 invalid control messages, plus 4 valid and 13 invalid telemetry frames.

## Native Gate 1 suite

Gate 1 in `docs/08_IMPLEMENTATION_PLAN.md` requires a small deterministic
mass-motion test harness. The production-layer baseline is now available as:

```powershell
pio test -e native-layers
```

It now runs 20 tests against production sources. Coverage includes:

- the unchanged feature-disabled legacy fingerprint and layer reset equivalence
- generic-default OFF and as-built AtomS3-profile ON policy
- all six one-g orientations plus a diagonal pose
- fixed sensor bias and a committed numeric stationary-noise trace
- bounded pulse rise and decay to `energy<=0.02` within two seconds
- 1/4/8 Hz translation and 70/90 Hz alias attenuation
- invalid/non-finite samples, NaN/Inf/non-positive `dt`, missing-frame time
  accumulation, exact/above-50-ms behavior, and filter reset equivalence
- raw planar position drive separated from filtered energy/agitation drive
- the Mass-disabled/Tilt-enabled input-boundary policy
- unsupported Mass stability bounds select the neutral-and-disarm Tilt safety
  action instead of retaining a prior command, and those bounds reject a later
  Tilt re-arm
- IMU injection/stale interlocks reject non-Live operational modes and new
  physical arms; the production stale-state policy remains latched across a
  valid-sample/deadline recovery or unexpected feature disable, with Safe Idle
  required to release an asserted diagnostic
- Replay active-to-complete transitions select Safe Idle rather than a
  real-IMU fallthrough
- a shared 16-event recovery-frame budget, including extreme scheduler rates
  with no deferred burst or unbounded loop

Do not replace these checks with subjective hardware observation. Hardware
tests remain necessary, but deterministic input/output checks must fail before
an unstable activity-path change reaches the board.

The suite compiles the production `MotionActivityFilter`; it does not contain a
host-only copy of the motion model. The committed numeric noise trace avoids
host-standard-library random-sequence differences. Unit tests prove
configure/explicit reset equivalence. Firmware/HIL validation must still prove
that the selected invalid-bound safety action reaches the physical servo
backend, along with preset, Safe Idle, and 300 ms stale-stop call paths; these
are not claimed by the native suite.

The orientation acceptance is a finite posture transition followed by a hold:
`energy<=0.02` within two seconds and summed `new_evt=0` for the next 30 seconds;
it passes in the native suite. Accelerometer-only continuous rotation cannot be distinguished
from translation at the same frequency, so it is not specified as a separate
indefinite classification test. The exact enabled-estimator time contract and
golden-update rules are in document 25.

## Passive host lab suite

The Node-standard-library-only runner in `tools/lab/` validates canonical
NDJSON, checks sequence/event-counter integrity, evaluates 30-second static
and pulse-to-silence plans, and writes a self-contained hashed evidence
directory. Run its committed dry cases with:

```text
node tools/lab/lab.mjs self-test
node --test test/lab/self_test.mjs
```

The fixture suite contains twenty exact exit/finding-code cases, including
full-timing Gate 1 pass/late-settle cases plus pre-existing-activity and
hidden-event pulse-baseline rejections plus incomplete hardware-evidence
rejection. It also proves structured operator rejection and canonical
preset/run/audio/channel-test/output-limit/safety context matching from the
first canonical frame through the active end for physical plans. The
integration suite contains eight tests for capture, byte-exact
input retention with fatal UTF-8 rejection, template/fixture alignment, first-frame timestamp resolution,
latest-value telemetry, safe-integer counter saturation, failure reports,
schema/report-semantic diagnostics, hashes, and no-overwrite behavior. Operational details
and Gate 1 plan templates are in `tools/lab/README.md`.

## Embedded compile matrix

Run all 22 compile-only firmware environments with:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build_firmware_matrix.ps1
```

The script isolates the pinned pioarduino smoke environment in a short user
cache and restores the caller's `PLATFORMIO_CORE_DIR` afterward.

## Future coverage

- event onset/single-shot behavior
- texture envelope lifetime
- spatial delay queue behavior
- recorder/replay determinism
- parameter/preset round trips
- control-codec and remote command-policy positive/negative cases
- bounded WebSocket parsing, queue overflow, and receive-flood behavior
