# Fresnel Inertia — Container Haptics

A handheld demonstration in which the contents feel as though they move inside
the object: two fingertip planes provide sustained directional/inertial cues,
and four transducers provide impacts, flow and texture from the same state.

AtomS3 runs the shared Mass -> Event -> Texture -> Resonance -> Spatial4 pipeline
and the parallel XL330 tilt branch. A StampC5 ESP-NOW dongle connects the Web
client without a USB cable on the held device.

The prototype has demonstrated simultaneous tilt/vibration through its radio
dongle and operator-confirmed visual/felt agreement on desktop. Current work
centers on the PC/shared Web experience; the tuning studio, visual refinements
and Android AR direction are planned, not delivered features. VR/Quest work is
on hold, and target Android hardware and simultaneous USB/AR operation are
unverified. See [current status](docs/16_PROGRESS_STATUS.md) and
[next work](docs/08_IMPLEMENTATION_PLAN.md).

## Start here

1. [Concept and experience](docs/00_DESIGN_SPECIFICATION.md)
2. [Current facts](docs/16_PROGRESS_STATUS.md)
3. [Next work](docs/08_IMPLEMENTATION_PLAN.md)
4. [Demo acceptance](docs/07_TEST_AND_VALIDATION.md)

[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) guide development.
The [documentation index](docs/README.md) routes hardware, protocol and parameter
work to their owning references.

## Main build targets

| Environment | Role |
|---|---|
| m5stack-atoms3-pipeline | Haptic baseline |
| m5stack-atoms3-pipeline-tilt-espnow-monitor | Current integrated device firmware |
| m5stack-stampc5-espnow-bridge | USB/radio dongle |

Build commands, including the separate pioarduino cache for StampC5, are in
[development setup](docs/reference/19_DEVELOPMENT_SETUP.md).
Visual-client instructions are in [webxr/README.md](webxr/README.md).
Run checks for the affected path; documentation changes do not need the full
firmware matrix.

## Layout

- src/ and include/haptics/: firmware and interfaces
- webxr/: visual client and USB feasibility probe
- presets/ and schemas/: material and protocol data
- test/ and tools/: reusable validation and build helpers
- docs/: eight active concept/contract/status documents including the index
- docs/reference/: technical detail read on demand
- docs/archive/: historical bench evidence, not current work instructions
- hardware/: publication boundary for future design assets

Source hardware assets and final licenses are not published; see
[hardware/README.md](hardware/README.md) and [LICENSE_TODO.md](LICENSE_TODO.md).
