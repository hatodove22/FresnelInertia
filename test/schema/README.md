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
- `maximum`
- `minItems`
- `maxItems`

It is not a full Draft 2020-12 validator. If the schemas start using features
such as `oneOf`, `$ref`, `pattern`, `format`, or conditional keywords, replace
or extend this script before treating these samples as complete validation.

Files:

- `control_messages.valid.jsonl` covers every current control `type` enum.
- `telemetry_frames.valid.jsonl` contains representative telemetry snapshots
  matching the documented telemetry frame shape.
- `control_messages.invalid.jsonl` covers required fields, unknown properties,
  enums, and numeric lower bounds.
- `telemetry_frames.invalid.jsonl` covers required fields, unknown properties,
  enums, the exact four-actuator count, and output peak-limit overflow.

Each expected-invalid line is a fixture object with `name`, `value`, and
`expected_error_codes`. The runner compares the complete actual and expected
error-code sets. An invalid value therefore passes only when it is rejected for
exactly the committed reason or reasons; rejection caused by an unrelated
schema error is a test failure.

Error codes have the form `keyword|JSON path|discriminator`, for example
`maximum|$.audio.output_peak_limit|1`. When adding a schema constraint, add a
valid boundary sample when useful and an expected-invalid fixture for the
rejection path.
