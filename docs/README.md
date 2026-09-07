# Documentation

Start with [the concept](00_DESIGN_SPECIFICATION.md),
[current facts](16_PROGRESS_STATUS.md), and [next work](08_IMPLEMENTATION_PLAN.md).
These are the normal context for continuing the project.

The research focus is the coherent combined sensation, not the number of demos
or the tuning infrastructure. Read technical detail for the task at hand;
do not load the entire archive or treat reference proposals as active work.

## Active documents

| Document | Owns |
|---|---|
| [00](00_DESIGN_SPECIFICATION.md) | Research question, intended experience and limits of the claim |
| [04](04_HARDWARE_AND_PIN_SPEC.md) | Assembled hardware, grasp frame and current output settings |
| [05](05_INTERFACE_SPEC.md) | Current control/telemetry contracts and connected-client requirements |
| [06](06_PARAMETER_MODEL.md) | Effective parameters, limits and configuration ownership; lookup only |
| [07](07_TEST_AND_VALIDATION.md) | Integrated demo acceptance, proportionate checks and distinction from research evaluation |
| [08](08_IMPLEMENTATION_PLAN.md) | The only active priority list and deferrals |
| [16](16_PROGRESS_STATUS.md) | Current facts, source versus installed FW, evidence scope and unresolved issues |

AGENTS.md keeps contributor rules. Record a contract or fact in its owner and
link to it. Status is a current summary, not a running implementation diary.

## Read technical detail only when needed

- [Pipeline](reference/03_PIPELINE_SPEC.md)
- [Tilt model](reference/14_TILT_PSEUDOFORCE_SPEC_REV2.md)
- [Future parametric model](reference/17_PARAMETRIC_CONTAINER_HAPTICS_MODEL_SPEC.md)
- [Web client usage](../webxr/README.md)
- [Retained visual/XR implementation detail](reference/18_WEBXR_SMARTPHONE_DEMO.md)
- [Development setup](reference/19_DEVELOPMENT_SETUP.md)
- [WebUSB feasibility](reference/19_WEBUSB_QUEST_PROBE.md)
- [USB telemetry](reference/26_ATOMS3_USB_TELEMETRY.md)
- [ESP-NOW wire/bridge detail](reference/28_ESPNOW_STAMPC5_TELEMETRY.md)
- [Sources](reference/10_REFERENCES.md)
- [Explanatory website and film](reference/29_EXPLAINER_SITE_AND_FILM.md)
- [Reusable firmware core](reference/30_REUSABLE_FIRMWARE_CORE.md)
- [Reusable visual architecture](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md)
- [Interaction space and 12 proposed demos](reference/32_INTERACTION_DESIGN_SPACE.md)
- [Primary-source audit and transfer limits](reference/33_INTERACTION_RESEARCH_SOURCES.md)
- [FW physical-model research, algorithm comparisons and tuning (Japanese)](reference/34_FW_MODEL_RESEARCH.md)

Technical references explain implementations or explicitly future designs.
In particular, 17 and the dated audit/proposals in 34 are not descriptions of
every current model. Their historical status notes do not override 16, and
they add no demo gate. Exact operator workflows belong in the Web guide, not 08.

## Historical evidence

[Archive index](archive/README.md) retains unique bring-up and test observations.
The full development ledger and previous expanded plan were archived on
2026-09-08; no original observation was converted into a new pass or discarded.
Old requirements, estimates, pending tasks and power-switch procedures are
historical context only.

Redundant overviews and handoff/process documents have been merged into the
active owners. See the archive index for the earlier cleanup and recovery record.
