# 11 Codex Start Prompt

Use this concise prompt when starting a fresh automated-development session:

```text
Read AGENTS.md, docs/08_IMPLEMENTATION_PLAN.md,
docs/16_PROGRESS_STATUS.md, docs/24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md, and
docs/25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md.
Treat AGENTS.md as invariant rules, document 08 as the only roadmap,
document 16 as factual status, document 24 as the current runbook, and
document 25 as the supporting test/automation workflow.

Continue only the active Gate 1 task. Its non-hardware preparation is complete:
the default-off gravity-separated activity path, raw sample/time guard, reset
contract, canonical event counters, native regression matrix, and passive host
lab runner are implemented. Preserve the reviewed feature-disabled fingerprint
and do not retune material thresholds to hide a hardware result.

The next step is the controlled AtomS3 hardware retest in document 24. First
confirm the software matrix and prepare a uniquely identified copy of the Gate
1 plan in tools/lab/plans/. Upload, physical output, S1/12 V changes, and device
commands require the user's explicit authorization and live confirmations.
Capture canonical telemetry and evaluate it with tools/lab/lab.mjs; retain the
hashed evidence bundle and the operator's tactile observation. If hardware
reveals a failure, diagnose it against that evidence before changing code.

Do not tune material thresholds, enable the production servo backend, add a
new product transport, format LittleFS, upload firmware, or emit hardware
output unless the relevant documented gate and user authorization are
satisfied. Monitor-only developer infrastructure may proceed only under the
separate-environment and command-policy restrictions in document 25.
Update code, acceptance criteria, and current status together, and run the
Definition of Done matrix in document 08 before handoff.
```

After Gate 1 passes on hardware, update documents 08, 16, and 24, then generate
the next task from document 08 rather than reusing this prompt unchanged.
