# Schema Validation Samples

This directory contains dependency-free host-side samples for the current
control and telemetry JSON schemas.

Run from the repository root:

```sh
node test/schema/validate_schemas.mjs
```

The validator intentionally implements only the JSON Schema features currently
used by `schemas/control_message.schema.json` and
`schemas/telemetry_frame.schema.json`:

- `type`
- `required`
- `enum`
- `properties`
- `items`
- `additionalProperties`
- `minimum`
- `minItems`
- `maxItems`

It is not a full Draft 2020-12 validator. If the schemas start using features
such as `oneOf`, `$ref`, `pattern`, `format`, or conditional keywords, replace
or extend this script before treating these samples as complete validation.

The telemetry schema already uses `maximum`, which this validator does not yet
implement. Until Slice 1 of
`docs/25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md` adds that keyword and
expected-invalid fixtures, a passing run does not prove numeric upper bounds
were enforced.

Files:

- `control_messages.valid.jsonl` covers every current control `type` enum.
- `telemetry_frames.valid.jsonl` contains representative telemetry snapshots
  matching the documented telemetry frame shape.
