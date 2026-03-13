# Contributing

## Expectations

- preserve the baseline build
- keep changes additive unless a broader refactor is explicitly required
- update `docs/` when behavior or interfaces change
- keep new subsystems behind safe feature gates
- verify at least the affected PlatformIO envs before handing work off

## Pull request checklist

- build passes for the relevant envs
- docs and schemas are updated if types or protocols changed
- default behavior remains safe when new features are disabled
- hardware-specific code is compile-gated
- validation notes mention what was and was not tested on hardware
