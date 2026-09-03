## Summary

- What changed?
- Why is this change needed?

## Architecture / compatibility

- [ ] Shared 4-layer haptic pipeline remains consistent with the documented architecture.
- [ ] New hardware/subsystems are behind safe compile-time and/or runtime gates where appropriate.
- [ ] Default behavior is preserved unless the PR explicitly changes it.
- [ ] Preset/schema/protocol compatibility was considered.

## Validation

### Software

- [ ] `pio run -e m5stack-sticks3`
- [ ] `pio run -e m5stack-sticks3-audio` when relevant
- [ ] `pio run -e m5stack-sticks3-remote` when relevant
- [ ] `pio run -e m5stack-sticks3-tilt` when relevant
- [ ] relevant probe environment(s)
- [ ] `cd webxr && npm run typecheck && npm run build` when relevant

### Hardware

Tested hardware/configuration:

- 

Not tested / still needs bench validation:

- 

## Documentation

- [ ] Relevant `docs/` files were updated.
- [ ] Protocol/schema changes were reflected in `schemas/`.
- [ ] Hardware bring-up findings were added to `docs/15_ENVIRONMENT_BRINGUP_NOTES.md` when useful.
