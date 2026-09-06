# Fresnel Inertia — Container Haptics

A handheld demonstration in which the contents feel as though they move inside
the object: two fingertip planes provide sustained directional/inertial cues,
and four transducers provide impacts, flow and texture from the same state.

AtomS3 runs the shared Mass -> Event -> Texture -> Resonance -> Spatial4 pipeline
and the parallel XL330 tilt branch. A StampC5 ESP-NOW dongle connects the Web
client without a USB cable on the held device.

The prototype has demonstrated simultaneous tilt/vibration through its radio
dongle and operator-confirmed visual/felt agreement on desktop. Current work
centers on the PC/shared Web experience. The first desktop visual refinement
pass is implemented; the tuning studio and Android AR remain planned. VR/Quest work is
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
- explainer/: independent Japanese principle/film site and interactive concept atlas
- presets/ and schemas/: material and protocol data
- test/ and tools/: reusable validation and build helpers
- docs/: eight active concept/contract/status documents including the index
- docs/reference/: technical detail read on demand
- docs/archive/: historical bench evidence, not current work instructions
- hardware/: publication boundary for future design assets

Source hardware assets and final licenses are not published; see
[hardware/README.md](hardware/README.md) and [LICENSE_TODO.md](LICENSE_TODO.md).

## Visual explanation

The independent [Japanese explainer](explainer/README.md) presents the principle
with articulated Fusion CAD, same/opposite contact-plane motion, a transparent
mechanism view, four transducer highlights, and an English narrated film.
The website remains Japanese. It does not connect to or control the device.
See the [explanation and media reference](docs/reference/29_EXPLAINER_SITE_AND_FILM.md)
for asset provenance, model boundaries, and validation.

The [interactive possibility atlas](https://fresnel-inertia-explained.hatodove.chatgpt.site/atlas.html)
adds 12 research-grounded future demos and three manipulable design sketches.
Each recipe identifies the shared state, slow/fast cues, required additions,
limitations and first comparison. These are proposals, not new hardware modes.

## Reuse and extension

- [Firmware synthesis core](docs/reference/30_REUSABLE_FIRMWARE_CORE.md): the
  production layer composition can run without hardware; runtime authority
  and output drivers remain in `HapticPipeline`.
- [Visual architecture](docs/reference/31_REUSABLE_VISUAL_ARCHITECTURE.md): pure
  accepted-state projections and reusable liquid/particle ingredients with
  explicit resource ownership.
- [Interaction design space](docs/reference/32_INTERACTION_DESIGN_SPACE.md)
  and [primary-source audit](docs/reference/33_INTERACTION_RESEARCH_SOURCES.md):
  what to build, where it belongs, and what the cited studies actually support.
