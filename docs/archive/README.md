# Historical records

These records explain prior implementation choices and bench observations.
They are not the current plan or an instruction to repeat old safety/bring-up
gates. Start with [current docs](../README.md), [status](../16_PROGRESS_STATUS.md)
and [demo acceptance](../07_TEST_AND_VALIDATION.md).

## Retained evidence

- [Full validation record](2026-09-05/07_TEST_AND_VALIDATION_FULL_RECORD.md):
  the previous validation document, preserved without semantic edits.
- [Environment bring-up](2026-09-05/15_ENVIRONMENT_BRINGUP_NOTES.md).
- [DYNAMIXEL board bring-up](2026-09-05/20_DXL2_BOARD_BRINGUP.md).
- [TDM board bring-up](2026-09-05/21_MAX98357A_TDM_BRINGUP.md).
- [Combined-output probe](2026-09-05/22_ATOMS3_COMBINED_BRINGUP.md).
- [Production integration history](2026-09-05/23_ATOMS3_PRODUCTION_INTEGRATION.md).
- [Integrated demo checkpoint](2026-09-05/16_INTEGRATED_DEMO_CHECKPOINT.md):
  the detailed status snapshot before the Android/tuning plan superseded
  Quest-first work. Its present-tense bench state and next tasks are historical.
- [Bench evidence](2026-09-05/evidence/): original command/telemetry captures
  supporting the integrated handling and radio-recovery observations. Capture
  filenames retain their date; device MACs are identifiers, not credentials.

Dates and paths inside snapshots refer to their original context. In particular,
old Gate 1/11 sequencing, pending checklists and power-off confirmation rules
have been superseded. A passed diagnostic is evidence for that diagnostic, not
automatic acceptance of the current integrated demonstration.

## Cleanup and recovery

On 2026-09-05 the active requirements/architecture/walkthrough documents 01,
02 and 12 were consolidated into 00, 05 and 06. Workflow 25 was consolidated
into AGENTS.md/CONTRIBUTING.md; dongle concept 27 into 00, 05, 08 and the USB
reference. Redundant copies were removed rather than kept as competing plans.
Detailed technical documents now live in `docs/reference/`.

A pre-cleanup local snapshot of `docs/`, `AGENTS.md`, `README.md` and
`CONTRIBUTING.md` was saved outside the repository at:

`C:/Users/tesul/Documents/Codex/2026-09-03/fre/FresnelInertia-doc-backups/docs-before-cleanup-20260905-091422.zip`

This snapshot preserves removed and rewritten text, including uncommitted
content. It is local to this PC; the retained historical records above travel
with the repository. Source code, presets, hardware assets and raw test logs
were not deleted by this cleanup.
