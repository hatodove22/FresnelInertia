# Presets

This folder stores human-readable experimental presets.

Conventions:
- one JSON file per preset
- filenames should be stable and descriptive
- parameters should mirror the registry names in `docs/06_PARAMETER_MODEL.md`
- avoid transport-specific keys here
- built-in firmware presets may be overridden by LittleFS files with the same `preset` name
