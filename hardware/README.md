# Hardware README

This folder is reserved for the future open-source hardware design.

## Intended contents

```text
hardware/
├── README.md
├── kicad/
├── bom/
├── manufacturing/
├── mechanical/
└── docs/
```

## What to place here later

### `kicad/`
- schematic
- PCB
- symbol/footprint libraries if required
- versioned project files

### `bom/`
- human-readable BOM
- sourcing notes
- alternates for amplifier / IMU / connector parts

### `manufacturing/`
- gerbers
- drill files
- pick-and-place
- fabrication notes

### `mechanical/`
- transducer placement drawings
- enclosure / fixture models
- tilt-plane mechanical integration

### `docs/`
- assembly instructions
- cable harness notes
- bring-up checklist
- test-point map

## Required documentation for future publication

Please include at minimum:
- board revision history
- electrical block diagram
- connector and pinout tables
- power rail summary
- expected current budget
- actuator mounting notes
- safety notes for XL330 and haptic outputs

## Software/hardware contract to preserve

The hardware design should preserve the assumptions documented in `docs/04_HARDWARE_AND_PIN_SPEC.md` unless the software docs are updated in sync.
