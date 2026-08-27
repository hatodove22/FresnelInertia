# Tests

## Automated now

Schema validation checks the committed control and telemetry samples:

```powershell
node test/schema/validate_schemas.mjs
```

Current samples:

- `schema/control_messages.valid.jsonl`
- `schema/telemetry_frames.valid.jsonl`

See `schema/README.md` for the intentionally supported JSON Schema subset.
The validator does not yet implement the `maximum` keyword already used by the
telemetry schema and has no expected-invalid fixtures. Closing that gap is the
first validation task in
`docs/25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md`.

## Required next harness

Gate 1 in `docs/08_IMPLEMENTATION_PLAN.md` requires a small deterministic
mass-motion test harness. It must cover:

- constant gravity in multiple orientations
- a bounded acceleration pulse and decay
- high-frequency/carrier-alias rejection
- feature-disabled legacy behavior

Do not replace these checks with subjective hardware observation. Hardware
tests remain necessary, but deterministic input/output checks must fail before
an unstable activity-path change reaches the board.

The planned harness will use PlatformIO native tests against the production
layer/filter code. It will first capture a feature-disabled legacy fingerprint,
then cover all six one-g orientations plus a diagonal pose, fixed sensor bias
and a committed numeric noise trace, pulse-and-settle, separate
gravity-rotation and translational
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
