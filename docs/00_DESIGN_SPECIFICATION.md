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
current focus; Android AR is planned. VR/Quest integration is retained but paused.

- Selecting a preset updates the visible object only after device acceptance.
- Displayed fill and dimensions correspond to the physical model. The existing
  visual-only 7 cm normalization is bypassed in connected mode; the renderer
  uses actual resolved dimensions and the camera provides the close view.
- Use reported motion/content state to inform the view. Do not present an
  unrelated scripted animation as live device behavior.
- Distinguish physical input, visual-only preview, pending changes and
  disconnected state.
- Android operation needs validation on the chosen device, including USB and
  AR running together. Neither its hardware/browser compatibility nor that
  combined flow is established by desktop or earlier Quest checks.

## Scope discipline

Build on the demonstrated shared-state, simultaneous-output desktop experience.
The next iteration is a PC/shared Web tuning studio with A/B comparison, saved
settings and explicit device-applied values, plus clearer liquid and granular
visuals. These are planned improvements, not capabilities of the current
preview trial recorder. Organize and tune the existing dynamic-CG servo mapping;
do not describe it as an absent subsystem or replace it without a concrete need.
Detailed priorities and the Android AR work belong in [08](08_IMPLEMENTATION_PLAN.md).

Preserve the existing preview and diagnostic tools. Add a narrowly scoped effect
or adjustment when it materially improves the demonstration; no architecture
expansion is needed merely to expose controls.

Formal localization/psychophysics, grip sensing, automatic resonance fitting,
recorder/replay recovery, OTA, product security, multi-client sessions, new
transports and publication assets remain later work. Collision/cracker effects
remain possible application extensions, not erased from the concept.

Current facts: [16](16_PROGRESS_STATUS.md).
Next work: [08](08_IMPLEMENTATION_PLAN.md).
Demo completion: [07](07_TEST_AND_VALIDATION.md).
