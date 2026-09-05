# Contributing

Read AGENTS.md, docs/00_DESIGN_SPECIFICATION.md, docs/16_PROGRESS_STATUS.md and
docs/08_IMPLEMENTATION_PLAN.md. Read the owning technical document only when
needed. The active acceptance contract is docs/07_TEST_AND_VALIDATION.md.

Make one focused change that improves the actual demonstration or resolves an
observed failure. Preserve the shared four-layer renderer, its parallel tilt
branch, baseline builds and generic defaults. Use feature gates when adding a
subsystem. Keep schemas and telemetry aligned with observable behavior.

Run checks appropriate to the changed path. Documentation-only changes need
link and consistency checks. Parser/protocol changes need valid and invalid
cases. Client changes need typecheck/build and the affected interaction.
Firmware needs the affected target and relevant shared baseline regression.

The full legacy matrix and archived evidence tools are optional diagnostics,
not prerequisites for every edit. Build PlatformIO environments sequentially
and use the separate pioarduino package store documented in
docs/reference/19_DEVELOPMENT_SETUP.md.

Ordinary powered bench tests are authorized in this session. Ask for physical
intervention or a tactile observation when needed; do not repeat passed switch,
power-cycle or calibration sequences without a relevant change or failure.
Keep existing stop behavior and bounds functional. Report unverified state
truthfully, and finish output tests with Stop.

Update one owning document for each changed contract and 16 for material new
evidence. Keep priorities only in 08. Historical evidence belongs in docs/archive
and detailed optional specifications in docs/reference. Avoid duplicate handoff
documents, guessed completion percentages and reprinting entire test logs in
several files.

Preserve user changes. Review the diff and run git diff --check before handoff.
Do not commit generated build output, credentials or local runtime state.
