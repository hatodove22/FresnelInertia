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

## Future coverage

- event onset/single-shot behavior
- texture envelope lifetime
- spatial delay queue behavior
- recorder/replay determinism
- parameter/preset round trips
