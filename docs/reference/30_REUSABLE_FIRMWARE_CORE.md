# Reusable firmware synthesis core

The existing model composition is now callable without Arduino, an IMU driver,
serial ports, audio hardware or servo hardware. The production
[HapticSynthesisCore](../../include/haptics/HapticSynthesisCore.hpp) owns the
motion filter, Mass, Event, Texture, Resonance, Spatial4 and parallel tilt model.
[HapticPipeline](../../src/HapticPipeline.cpp) remains the device runtime and
calls that same core. There is no second simulation engine.

The reason for this extraction is concrete: the previous runtime mixed about
150 lines of deterministic per-frame composition with wall-clock safety,
calibration, recording, telemetry and physical output. The same seven model
objects also needed repeated configuration/reset wiring. Testing the complete
composition required reconstructing that wiring outside the runtime. The core
now owns its sequencing and reset semantics once, and returns a compact frame
that can be checked or consumed by another application.

This changes code ownership, not the content algorithms, applied parameter
defaults, control protocol or remote parameter allowlist. Current experience
and physical limitations remain in [00](../00_DESIGN_SPECIFICATION.md); current
evidence belongs in [16](../16_PROGRESS_STATUS.md).

## Ownership and extension points

| Boundary | Owner | Reuse contract |
|---|---|---|
| Applied settings | `HapticPipeline::params_`, a `SystemParams` | Pass the same applied settings to configuration and frame processing. The core adds no configuration store. |
| Sensor acquisition, validation and mounting transform | Runtime | Give the core a finite, validated sample in model/body coordinates; `valid=false` represents missing data. |
| Time integration and content contact | Core, existing Mass/Event layers | Pass raw elapsed seconds. Keep the body x/y model and common content state. |
| Event envelopes and four output channels | Core, existing Texture/Resonance/Spatial4 layers | `SynthesisFrame::spatial` contains transport-independent `DriveFrame4` and display summary. |
| Parallel normal tilt model | Core, existing `TiltPseudoForceModel` | Tilt consumes exactly the MassState returned for that frame. |
| Per-frame intent | `SynthesisFrame` | Accepted/rejected, mass, last event, stage counts, four-channel output, and explicit tilt action. |
| Physical output and authority | Runtime and existing backends | Arming, Stop, IMU-stale deadlines, fault latching, bounded manual tests, calibration override and output submission remain here. |
| External observation | Runtime telemetry | Existing counters, schemas, resolved state and device/client agreement remain unchanged. |

The core uses fixed-size layer state and frame arrays. Processing performs no
dynamic allocation, reads no clock, acquires no sensor and writes no actuator.
It has no radio, storage, Arduino or operating-system dependency.

For a new desktop model experiment, initialize one core with a known applied
configuration, feed recorded or synthetic **body-frame** IMU samples, and read
its returned content/output state. For a new on-device presentation, retain
`HapticPipeline` and change the high-level application inputs or presets. That
preserves the already-established runtime interlocks and telemetry path.

```cpp
#include "haptics/HapticSynthesisCore.hpp"

haptics::SystemParams applied = haptics::makeDefaultGranularSingleMarblePreset();
haptics::HapticSynthesisCore model;

void beginExperiment() {
  applied.features.enable_coherent_container_demo = true;
  applied.features.enable_gravity_separated_mass_activity = true;
  applied.features.enable_tilt_plane = true;
  model.reset(applied);
}

haptics::SynthesisFrame evaluate(const haptics::ImuSample& body_sample,
                                float elapsed_s) {
  haptics::SynthesisContext context{};
  context.outputs_allowed = true;
  context.tilt_allowed = true;  // calculate model intent; no physical arm
  return model.step(applied, body_sample, elapsed_s, context);
}
```

This example is an offline calculation. Device code continues to resolve
`outputs_allowed` and `tilt_allowed` from run mode, feature flags and the stale
IMU interlock. A result is not proof that an actuator accepted a command.

## Lifecycle and temporal behavior

| Operation | Exact effect |
|---|---|
| `configure(params)` | Configure all existing model stages, resetting motion, events, texture and spatial histories while preserving the tilt filter history, as existing parameter reconfiguration did. |
| `reset(params)` | Perform that configuration and clear tilt history. Used for startup/Stop/discontinuities as appropriate. |
| `resetTilt()` | Clear only the parallel tilt history, preserving the existing preset/model-switch behavior. |
| `configureOutput(params)` | Refresh Resonance and Spatial4 only, including clearing spatial pending state; preserve content motion, Event, Texture and tilt. Used for calibration output refresh. |
| `step(params, sample, raw_dt, context)` | Advance the configured model with current runtime feature gates and return the frame; reject nonpositive/nonfinite time without changing model state. |
| `maxStableStepS()` | Expose the existing dynamics bound used by the runtime's arming interlock. |
| `defaultMassState(params)` | Produce the existing neutral content metadata for suppressed output and Idle telemetry. |

Layer-setting changes still require `configure` or `reset`. Passing different
parameters to `step` alone does not retune the configured leaf models. Runtime
feature gates are read from the supplied applied settings every frame, so a
tilt gate change does not silently reset moving content.

The existing compatibility behavior is retained: legacy long frame intervals
use the nominal period when the motion boundary is unrequested. The optional
gravity-separated path holds sensor-driven state on missing samples while
advancing texture/spatial tails by elapsed time. A long recovered gap resets
dynamic state; the first fresh baseline cannot manufacture an event. Bounded
substeps retain the shared event-slot budget for the whole frame.

The caller handles tilt intent explicitly:

| Action | Runtime behavior |
|---|---|
| `Disabled` | Do not submit a model command; disarm an enabled tilt backend. |
| `Submit` | Submit the returned model command only if the backend is already enabled. |
| `Hold` | Keep the previously reported/issued command; do not resubmit a fresh goal. |
| `FaultNeutral` | Submit neutral and latch the existing `ImuSafety` fault. |

`Hold` differs from `FaultNeutral`: recoverable missing data keeps the previous
command, while unsupported integration dynamics requests the existing neutral
fault transition. Neither action independently changes physical torque.
`use_tilt_model=false` preserves the existing local diagnostic bypass: on a
`Submit` result the runtime substitutes its bounded manual command and leaves
normal tilt history unadvanced. It adds no remote override operation.

New material models can still extend the owning leaf layer under an appropriate
inactive-by-default feature gate. Event-driven application effects can reuse
the existing Event/Texture/Resonance/Spatial interfaces, but direct external
event injection is not a new core or protocol capability. Desktop playback,
parameter search and additional demonstrations are opportunities enabled by
this boundary, not delivered applications or evidence of Android support.

## Equivalence and verification

[The synthesis suite](../../test/synthesis_core/test_synthesis_core/test_main.cpp) compares the
extracted composition with a test-only
[frozen orchestration reference](../../test/synthesis_core/test_synthesis_core/pre_extraction_reference.hpp)
from the pre-extraction `HapticPipeline.cpp` at `e007885`. The reference shares
the production leaf algorithms deliberately: the comparison detects changed
sequencing, gates, time budgets and resets. Existing leaf tests remain the
independent checks on the model algorithms. Do not update the frozen reference
automatically when making an intentional future behavior change.

The suite exercises nine built-in presets in legacy and coherent paths, every
combination of the five layer gates and tilt, Live/Record/Replay/Calibration/Idle
contexts, stale suppression, irregular sampling, missing data, configuration
and reset transitions, and manual override/resume. It compares all exposed
mass/event/output/tilt fields, stage counts and float bit patterns. Independent
contracts cover rejected time without state mutation, hold versus neutral
fault, first-sample event suppression and stopped output.

The focused PlatformIO host command is:

```powershell
pio test -e native-synthesis-core
```

The existing [Wasm fallback](19_DEVELOPMENT_SETUP.md) can compile the same suite
when its Unity Editor WebGL SDK is installed:

```powershell
& .\tools\test_cpp_wasm.ps1 -Name synthesis-core -TestSource test/synthesis_core/test_synthesis_core/test_main.cpp -Source @('src/HapticSynthesisCore.cpp','src/MotionActivityFilter.cpp','src/MassMotionLayer.cpp','src/EventLayer.cpp','src/TextureLayer.cpp','src/ResonanceLayer.cpp','src/SpatialRenderer4.cpp','src/TiltPseudoForceModel.cpp')
```

Follow the current environment configuration for host test dependencies. The
runtime integration also requires the affected AtomS3 baseline and integrated
firmware builds, run sequentially as described in [development setup](19_DEVELOPMENT_SETUP.md).
Software equivalence and builds do not establish new physical timing,
perceptual quality or an end-to-end hardware rehearsal.
