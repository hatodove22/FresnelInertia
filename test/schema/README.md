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

Files:

- `control_messages.valid.jsonl` covers every current control `type` enum.
- `telemetry_frames.valid.jsonl` contains representative telemetry snapshots
  matching the documented telemetry frame shape.
