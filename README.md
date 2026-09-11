# Fresnel Inertia — Container Haptics

A compact handheld device that makes moving contents tangible through
**two tilting fingertip contact planes and four vibration channels acting together**.
The aim is one coherent sensation of shifting, contacting and flowing contents,
not independent effects or a visual simulation alone.

AtomS3 owns the shared content model and actuator commands. A StampC5 ESP-NOW
dongle connects the Web client without a USB cable on the held device.
Desktop/phone operation and encouraging handled feedback are recorded, but
later source changes and research claims have distinct verification status.

## Understand the project

Read these three documents, in order:

1. [Concept](docs/00_DESIGN_SPECIFICATION.md): the experience, research question and limits.
2. [Current facts](docs/16_PROGRESS_STATUS.md): what works, what was physically checked and what remains unverified.
3. [Active plan](docs/08_IMPLEMENTATION_PLAN.md): the next short iteration, not a catalogue of completed work.

[Demo acceptance](docs/07_TEST_AND_VALIDATION.md) distinguishes a working
experience from evidence for a research claim. Exact hardware, interfaces,
parameters and optional technical detail are routed by the [documentation index](docs/README.md).

## Use the Web client

| Entry | Purpose |
|---|---|
| `/` | Ordinary desktop/Android presentation; connect StampC5 for device-driven operation, or use the explicit local preview |
| `/?lab=1` | Hardware-free production-C++/Wasm Lab with synthetic input and calculated outputs |
| `/tune.html` | Joint vibration/tilt preference search for water, one marble and sand; save/reuse selected profiles |
| `/webusb.html` | Separate USB diagnostic probe, not the demo |

Start/build instructions and controls are in the [Web guide](webxr/README.md).
Lab/rehearsal is not measured haptic output. Ordinary-screen Android does not
require AR; retained Quest/WebXR work is deferred.

## Try the Unity material study

[Fresnel Studio for Unity 6.3](unity/README.md) presents water, retained sand
and a soft fictional heartbeat with tilt and rapid shaking. The reusable
[Container Materials package](unity/FresnelContainerDemo/Packages/com.fresnel.container-materials/README.md)
has its own MIT license and independent sample. Download the Windows demo,
Android development APK, package and motion film from the
[Unity v0.3.0 experimental release](https://github.com/hatodove22/FresnelInertia/releases/tag/unity-v0.3.0).
Software verification and the still-pending phone/physical checks are in
[current facts](docs/16_PROGRESS_STATUS.md#optional-unity-study--2026-09-10).

## Source map

| Location | Responsibility |
|---|---|
| `src/`, `include/haptics/` | Shared synthesis, runtime authority, hardware drivers |
| `webxr/` | Presentation, Haptic Link, Lab and preference workspace |
| `unity/` | Unity client, reusable materials, build helpers and software verification |
| `presets/`, `schemas/` | Material configuration and observable contracts |
| `test/`, `tools/` | Reusable firmware/protocol checks and build helpers |
| `docs/` | Current concept, contracts, acceptance, plan and facts |
| `docs/reference/`, `docs/archive/` | On-demand detail and historical evidence; not extra active tasks |
| `explainer/` | Independent explanation, films and concept sketches; no device control |

The preserved baseline is `m5stack-atoms3-pipeline`; the integrated device is
`m5stack-atoms3-pipeline-tilt-espnow-monitor`; the dongle is
`m5stack-stampc5-espnow-bridge`. Use the sequential builds and isolated StampC5
package store in [development setup](docs/reference/19_DEVELOPMENT_SETUP.md).

Follow [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
Make focused changes, preserve working defaults and unique evidence, and
verify the affected behavior rather than rerunning all historical bring-up.

## Explanation and publication

The [explainer](explainer/README.md) presents articulated CAD, the principle,
films and an interaction atlas. Those are explanations/proposals, not additional
implemented haptic modes. [Media provenance](docs/reference/29_EXPLAINER_SITE_AND_FILM.md)
and [research source limits](docs/reference/33_INTERACTION_RESEARCH_SOURCES.md)
are retained. Hardware source assets and final licenses are not published;
see [hardware](hardware/README.md) and [license status](LICENSE_TODO.md).
