# 11 Codex Start Prompt

Use this concise prompt when starting a fresh automated-development session:

```text
Read AGENTS.md, docs/08_IMPLEMENTATION_PLAN.md,
docs/16_PROGRESS_STATUS.md, and docs/24_ATOMS3_LIVE_PIPELINE_FOLLOWUP.md.
Treat AGENTS.md as invariant rules, document 08 as the only roadmap,
document 16 as factual status, and document 24 as the current runbook.

Continue only the active Gate 1 task: implement a default-off,
gravity-separated and motion-band-limited mass-activity path, enable it only
for the AtomS3 production profile, expose current-frame new_evt in serial
status, add deterministic tests, and preserve all generic defaults.

Do not tune material thresholds, enable the production servo backend, add a
new transport, format LittleFS, upload firmware, or emit hardware output unless
the relevant documented gate and user authorization are satisfied.
Update code, acceptance criteria, and current status together, and run the
Definition of Done matrix in document 08 before handoff.
```

After Gate 1 passes, generate the next task from document 08 rather than
reusing this prompt unchanged.
