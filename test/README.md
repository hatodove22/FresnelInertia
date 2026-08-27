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
upper bounds such as `audio.output_peak_limit <= 1` are enforced.

## Native baseline and required next fixtures

Gate 1 in `docs/08_IMPLEMENTATION_PLAN.md` requires a small deterministic
mass-motion test harness. The production-layer baseline is now available as:

```powershell
pio test -e native-layers
```

It retains the feature-disabled legacy fingerprint and layer reset-equivalence
checks. Gate 1 must extend that same suite to cover:

- constant gravity in multiple orientations
- a bounded acceleration pulse and decay
- high-frequency/carrier-alias rejection
- feature-disabled legacy behavior

Do not replace these checks with subjective hardware observation. Hardware
tests remain necessary, but deterministic input/output checks must fail before
an unstable activity-path change reaches the board.

The implemented harness uses PlatformIO native tests against production layer
code. Its next slice adds the production activity filter and covers all six
one-g orientations plus a diagonal pose, fixed sensor bias and a committed
numeric noise trace, pulse-and-settle, separate gravity-rotation and translational
1--8 Hz motion, 70/90 Hz sampled alias candidates, invalid/non-finite input,
non-positive `dt`, and long time gaps. Unit tests prove configure/explicit
reset equivalence; firmware/HIL tests separately prove preset, Safe Idle, and
300 ms stale-stop call paths. The exact enabled-estimator `dt` contract and
golden-update rules are in document 25. Do not create a separate host-only
implementation of the motion model.

In implementation, commit the numeric noise trace rather than relying on a
standard-library random distribution, use an explicit `native_layers` test
suite/filter so fixture folders are not discovered as tests, and record the
host compiler version. The tested production guard must inspect raw `dt` and
sample validity before any nominal-step substitution or Mass-layer update.

## Future coverage

- event onset/single-shot behavior
- texture envelope lifetime
- spatial delay queue behavior
- recorder/replay determinism
- parameter/preset round trips
- control-codec and remote command-policy positive/negative cases
- bounded WebSocket parsing, queue overflow, and receive-flood behavior
- host-side NDJSON capture and bench acceptance reports
