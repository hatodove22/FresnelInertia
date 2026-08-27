# 11 Codex Start Prompt

Use this concise prompt when starting a fresh automated-development session:

```text
Read AGENTS.md, docs/08_IMPLEMENTATION_PLAN.md,
docs/16_PROGRESS_STATUS.md, docs/24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md, and
docs/25_DEVELOPMENT_WORKFLOW_AND_WIRELESS_DEBUG_PLAN.md.
Treat AGENTS.md as invariant rules, document 08 as the only roadmap,
document 16 as factual status, document 24 as the current runbook, and
document 25 as the supporting test/automation workflow.

Continue only the active Gate 1 task. Start with Slice 1 in document 25: make
the schema validator enforce the keywords already used, add expected-invalid
fixtures, add a native deterministic layer harness, and capture a reviewed
feature-disabled legacy fingerprint without changing firmware behavior. Only
then implement the default-off gravity-separated activity path and expose
current-frame new_evt.

Do not tune material thresholds, enable the production servo backend, add a
new product transport, format LittleFS, upload firmware, or emit hardware
output unless the relevant documented gate and user authorization are
satisfied. Monitor-only developer infrastructure may proceed only under the
separate-environment and command-policy restrictions in document 25.
Update code, acceptance criteria, and current status together, and run the
Definition of Done matrix in document 08 before handoff.
```

After Gate 1 passes, generate the next task from document 08 rather than
reusing this prompt unchanged.
