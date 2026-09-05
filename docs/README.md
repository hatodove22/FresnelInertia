# Documentation

Start with [the concept](00_DESIGN_SPECIFICATION.md),
[current facts](16_PROGRESS_STATUS.md), and [next work](08_IMPLEMENTATION_PLAN.md).
These are the normal context for continuing the project.

The active direction is PC/shared Web tuning and presentation, with Android AR
planned and VR/Quest on hold. Planned functionality and target-host validation
are distinct from the implemented demo; follow 08 for scope and 16 for evidence.

## Active documents

| Document | Owns |
|---|---|
| [00](00_DESIGN_SPECIFICATION.md) | Intended experience, shared-state architecture and paper alignment |
| [04](04_HARDWARE_AND_PIN_SPEC.md) | Assembled hardware, grasp frame and current output settings |
| [05](05_INTERFACE_SPEC.md) | Current control/telemetry contracts and connected-client requirements |
| [06](06_PARAMETER_MODEL.md) | Effective parameters, limits and configuration ownership; lookup only |
| [07](07_TEST_AND_VALIDATION.md) | Minimum meaningful demo acceptance and proportionate checks |
| [08](08_IMPLEMENTATION_PLAN.md) | The only active priority list and deferrals |
| [16](16_PROGRESS_STATUS.md) | Dated results, unresolved issues and last known bench state |

The eighth top-level document is this index. AGENTS.md keeps contributor rules.
Record a fact in its owner and link to it.

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

Technical references explain implementations or explicitly future designs.
Their historical status notes do not override 16, and they add no demo gate.

## Historical evidence

[Archive index](archive/README.md) retains unique bring-up and test observations.
Old requirements, estimates, pending tasks and power-switch procedures are
historical context only.

Redundant overviews and handoff/process documents have been merged into the
active owners. See the archive index for the earlier cleanup and recovery record.
