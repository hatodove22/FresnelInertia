# Host lab tool tests

Run the dependency-free fixture suite with:

```text
node tools/lab/lab.mjs self-test
node --test test/lab/self_test.mjs
```

The committed cases cover a passing 30-second static window plus its 33-second
powered capture envelope, a latched
`last_event` that must not count as a new event, a quiet pre-pulse baseline,
pulse response and settling, the exact 40-second Gate 1 timing, shortened
static/pulse rejection, static end-anchor/tail activity, and activity recurring
after an initially completed pulse-silence interval,
pre-existing activity and hidden baseline-event rejection,
first-frame timestamp offsets, safe-integer counter saturation, an actual
`new_evt`, a `frame_counter` gap, telemetry schema rejection, and an NDJSON
parse failure. Expected exit categories and complete finding-code sets are
recorded in `cases.json`.

The Gate 1 templates validate structurally before a run but intentionally carry
`EDIT_ME` evidence fields. A hardware `check` cannot pass until those fields,
operator authorization/observation, and final Safe Idle confirmation are
complete; normalized placeholder aliases including `TODO`, `TBD`, `N/A`, `?`,
and `-` remain incomplete, and the suite covers that rejection explicitly.

Run plans declare `frame_counter_mode`: use `contiguous` for full-rate Recorder
logs and `monotonic` for latest-value USB/wireless snapshots. The latter still
uses `evt_total` deltas to catch events that occur between published frames.
`timestamp_origin: first_frame` treats the check timestamps as offsets from the
first captured frame; reports retain both requested and resolved timestamps.

The integration tests also verify passive stdin capture, retention of
non-JSON transport chatter, byte-exact plan/telemetry evidence, evidence
hashes, report creation on an acceptance
failure, and exclusive output-directory behavior.
Schema/input failures use exit 3 and retain an `input_error` diagnostic bundle
when both source files were readable. The suite also proves that an unsafe
timestamp cannot block byte-exact diagnostic preservation and that an empty
hand-authored PASS report is invalid.
Every check bundle includes the exact three schemas under `schemas/`; manifest
hashes are verified against those copied bytes.
