# 00 Demo Concept

## What the user should experience

Hold a small container between thumb and index finger. Tilt or move it and feel
its contents shift, roll, flow, and strike the walls. The contact planes give a
sustained directional/inertial cue; short vibrations make contact and material
changes tangible. When a display is attached, the visible container and
contents agree with what the hand feels.

The demonstration must make the contribution of **two tilting fingertip planes
plus four vibration channels acting together** apparent. A successful command
console alone does not demonstrate that concept.

## Shared state, complementary outputs

```text
IMU -> body-frame motion -> shared content state
  |-> Mass -> Event -> Texture -> Resonance -> Spatial4 -> four transducers
  |-> motion + content state -> low-frequency tilt model -> two XL330 servos
  `-> low-rate telemetry -> connected Web visualization
```

Material families use this same pipeline. Geometry influences travel and
collision density. Short contact events express impacts/rolling/scraping;
low-frequency tilt expresses the slower directional cue. The physical device
continues to compute locally when a host is absent.

SystemParams owns applied configuration. TelemetrySnapshot owns reported state;
DriveFrame4 keeps spatial output independent of the audio transport.
HapticPipeline applies commands; radio callbacks only queue them.

## Research alignment

The supplied paper, *A Handheld Haptic Device Integrating Fingertip Contact-plane
Tilting and Four-channel Vibrotactile Stimulation* (VRSJ 2026), motivates a
coherent experience from motion to collision, with both outputs generated from
shared internal state. Its section 3.2 describes content position and vertical
inertia in common motion, and center-of-mass shift and horizontal inertia in
differential motion.

The assembled profile now enables a coherent reduced model: content position
enters common motion, while CoG/inertia supplies the differential component.
The complete composed angle is filtered and slew-limited. Actual wall contacts
from the same moving state create vibration, rather than an independent impact
clock. Generic profiles retain the earlier model. Mounted relative motor
directions are checked; current handling feedback is recorded in [16](16_PROGRESS_STATUS.md).
The paper is design evidence, not perceptual proof.

The current content state is a body x/y cross-section aligned with the servos'
z-axis rotation. Body z is acquired and transformed but does not produce
independent fore/aft content travel or collisions. The connected view may show
pitch; do not describe that as full 3D haptic content dynamics.

The paper also describes FSR-based grip gain. The current firmware uses nominal
grip-force parameters; it has no measured FSR feedback path. That extension is
not needed to finish the presently requested demonstration.

## Demo experience

1. **Pick up and explore.** Start with one rigid inclusion: a clearly moving
   object, brief wall contact, then rest. Include both tilt and vibration.
2. **Change the contents.** Compare a fine granular condition with a liquid or
   hybrid condition that has the clearest currently available contrast.
3. **Show the same object.** The optional client displays the device's applied
   material, fill and dimensions, and responds coherently to actual handling.
4. **Stop and resume.** Ending the experience quiets output. A deliberate start
   restores the selected condition without stale commands or an unexpected jump.

A small curated set can make the first rehearsal readable; do not remove useful
preset/property controls or permanently cap the project at three presets.
Naturalness must be adequate to communicate the concept. Detailed perceptual
fitting can follow that demonstration.

## Visual and device agreement

The client owns presentation and any host-side tracking. AtomS3 owns physical
motion, content response and applied material parameters. PC/shared Web is the
current focus, followed by rich ordinary-screen Android presentation. A flat
screen may still use the shared WebGL renderer; a separate 2D engine is not
implied. Android AR is optional later work. VR/Quest integration is retained but paused.

- Selecting a preset updates the visible object only after device acceptance.
- Displayed fill and dimensions correspond to the physical model. The existing
  visual-only 7 cm normalization is bypassed in connected mode; the renderer
  uses actual resolved dimensions and the camera provides the close view.
- Use reported motion/content state to inform the view. Do not present an
  unrelated scripted animation as live device behavior.
- Presentation can be richer than the reduced firmware model. Bounded liquid
  lag, overshoot and secondary waves may respond to reported orientation and
  content changes, including pitch, while preserving fill and container bounds.
  These visual dynamics are not reported physical state, a replacement haptic
  model or a source of actuator commands. Their source-snapshot clock freezes
  with stale telemetry or Lab pause; visual CoG is not the device's voiced CoG.
- Distinguish physical input, visual-only preview, pending changes and
  disconnected state.
- The offline Lab runs the production C++ content/tilt/vibration layers as
  WebAssembly with synthetic motion input and the shared renderer. Its model
  output is not measured actuator output or evidence of a new physical feel.
- If Android hand-following AR is pursued, MediaPipe hand tracking is the primary
  approach and device IMU tilt supplying the container angle. A marker, including
  the AtomS3 screen, is optional for alignment, not a prerequisite for following
  the hand. Hand-relative landmarks alone are not absolute AR placement.
- Ordinary-screen Android operation needs validation on the chosen device,
  including USB and rendering performance. Camera/AR concurrency is relevant
  only if that optional presentation is added; it is not a gate for a non-AR
  demo. Desktop or earlier Quest checks establish neither Android flow.

## Scope discipline

Build on the demonstrated shared-state, simultaneous-output desktop experience.
The current software adds container-constrained liquid, a granular accumulation
surface and an offline production-model Lab. The gated sand-pile model holds
residual slope/CoG through static and dynamic friction; the gated carbonation
effect progresses from sealed charge through a pop/burst to spent contents.
Visuals use those model states with the presentation-only detail described above.
The explicit sand-pile preset is additional;
the existing normal-sand preset and accepted marble behavior are preserved.
These additions are now flashed; output-OFF v4 checks and the subsequent positive
overall handling report are recorded in [16](16_PROGRESS_STATUS.md). Preserve
the current tested experience as the exhibition baseline; fine tuning takes
priority over new subsystems. The report does not itemize every material.

Use short offline/handled comparisons for a specific parameter change.
The fuller tuning studio (A/B, saved settings and applied
values) and Android hand tracking remain planned, not current Lab capabilities.
Organize the existing dynamic-CG mapping rather than calling it an absent
subsystem. Detailed priorities belong in [08](08_IMPLEMENTATION_PLAN.md).

Preserve the existing preview and diagnostic tools. Add a narrowly scoped effect
or adjustment when it materially improves the demonstration; no architecture
expansion is needed merely to expose controls.

Formal localization/psychophysics, grip sensing, automatic resonance fitting,
recorder/replay recovery, OTA, product security, multi-client sessions, new
transports and publication assets remain later work. Additional collision/cracker
applications remain possible extensions beyond the current carbonation effect.

Current facts: [16](16_PROGRESS_STATUS.md).
Next work: [08](08_IMPLEMENTATION_PLAN.md).
Demo completion: [07](07_TEST_AND_VALIDATION.md).
