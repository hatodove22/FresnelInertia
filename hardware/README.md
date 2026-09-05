# Hardware Assets

This directory is the publication boundary for the assembled
`M5AtomS3_MAX98357A_4CH_TDM_DXL2` custom PCB and its mechanical integration.

The board was designed in EasyEDA Pro. Authoritative editable design files and
manufacturing exports have not yet been copied into this repository; do not
infer fabrication readiness from the current placeholder.

## Current evidence

- [Hardware contract](../docs/04_HARDWARE_AND_PIN_SPEC.md) — current pins and settings
- [DYNAMIXEL history](../docs/archive/2026-09-05/20_DXL2_BOARD_BRINGUP.md)
- [TDM history](../docs/archive/2026-09-05/21_MAX98357A_TDM_BRINGUP.md)
- [Combined probe](../docs/archive/2026-09-05/22_ATOMS3_COMBINED_BRINGUP.md)
- [Production history](../docs/archive/2026-09-05/23_ATOMS3_PRODUCTION_INTEGRATION.md)
- [Haptic Link](../docs/reference/28_ESPNOW_STAMPC5_TELEMETRY.md)
- [Active demo acceptance](../docs/07_TEST_AND_VALIDATION.md)

These documents record test evidence, not editable PCB source.

## Planned layout

```text
hardware/
|-- README.md
|-- easyeda-pro/       Editable source/archive and export notes
|-- bom/               BOM, sourcing notes, and alternates
|-- manufacturing/     Gerber, drill, placement, and fabrication notes
|-- mechanical/        Enclosure, fixture, and transducer placement
`-- docs/              Assembly, harness, test-point, and revision records
```

## Publication checklist

Deferred publication work, not a prerequisite for the assembled-device demo:

- board name and revision match silkscreen and documentation
- exported schematic PDF and net/pin tables are included
- BOM records exact fitted parts and approved alternates
- fabrication archive is tied to a board revision and checksum
- connector orientation, channel labels, S1 behavior, and power rails are clear
- test points and expected voltages are documented
- four-transducer placement and wall mapping are documented
- XL330 wiring, limits, torque-off behavior, and mechanical stops are documented
- current/thermal limits distinguish short unloaded probes from mounted use
- hardware and software licenses are selected and stated

## Contract to preserve

The current software assumes TDM slots 0–3 map to Front/Back/Top/Bottom, slots
4–7 are zero, AtomS3 GPIO5/6/7 carry BCLK/frame-sync/data, and the production
servo path uses GPIO1 TX / GPIO2 RX with board-side automatic half-duplex.
Any hardware revision that changes this contract must update the profile,
pin/design docs, probes, and acceptance tests together.
