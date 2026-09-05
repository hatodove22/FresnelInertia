# 08 Active Demo Plan

Updated: 2026-09-05, after the planning discussion and the user's selection of
Android. This is the only active plan. [00](00_DESIGN_SPECIFICATION.md) owns the
concept, [16](16_PROGRESS_STATUS.md) the evidence, and
[07](07_TEST_AND_VALIDATION.md) the acceptance criteria.

## Direction and working baseline

Build a compelling shared-state experience using fingertip-plane tilt and four
vibration channels together. The operator positively assessed the current
desktop demo and especially the marble visual. Preserve that baseline and its
useful stimulus strength while improving material expression.

The next direction is a **parameter-tuning studio followed by Android AR**,
sharing the existing renderer, configuration and Haptic Link. Quest/VR work and
its unfinished physical checks are deferred, not passed and not prerequisites
for this iteration. Do not introduce a separate engine or app stack merely to
add a presentation mode.

The work below is **planned, not implemented**. The current client already has
connection, applied material/fill/dimensions, explicit Start/Stop, device-driven
visuals and an MR path. It does not yet have the new tuning studio or tracked
Android AR. Planning did not change firmware or actuator behavior.

## 1. Make the existing experience comparable and reproducible

First deliver a tuning view that preserves the accepted marble condition,
compares A/B settings, restores the baseline and saves/reloads a configuration.
Keep geometry and fill fixed when comparing a material-response parameter.
Separate physical parameters from presentation gains.

- Display actual applied values; a sent slider value is not confirmation.
- Expose only parameters used by the selected model. The current remote
  allowlist does not include every tilt/texture/mass control; extend only those
  needed and return their applied values through a defined configuration path.
- Respect preset semantics in [06](06_PARAMETER_MODEL.md). Editing preset JSON
  is not automatically an update to the running firmware.
- Initially apply a coherent parameter set while stopped, then explicitly start.
  Do not stream pipeline-resetting configuration on every pointer move.
- Keep numerical controls available but secondary. A brief touch-only comparison
  can distinguish felt improvement from visual expectation; no study-management
  system or factorial campaign is required.

Bouba/Kiki-like parametric shapes are a proposed perceptual interface, not a
validated universal mapping. Candidate axes are round/sharp (contact envelope
and spectral balance), gathered/dispersed (event density and spatial spread),
and free-flowing/viscous (damping and flow persistence). Refine them by A/B
handling. Keep mass, dimensions and fill separate; heavier must not simply mean
louder. Abstract tuning shapes must not silently change physical geometry.

Done: an A/B setting can be applied, its actual values confirmed, saved and
reloaded without losing the baseline or implicitly arming outputs.

## 2. Improve material visuals from the same device state

Preserve the marble appearance. Prioritize liquid, then sand, then mixtures.

- Liquid: replace the floating-volume impression with a container-constrained
  volume and plausible free surface/wall contact, then improve transparency,
  reflections and small-scale motion. Full fluid simulation is not required.
- Sand: communicate accumulation and avalanching flow, with local grains as
  detail rather than an unrelated particle cloud.
- Mixtures: combine improved solid and liquid ingredients after each reads well.
- Keep the object prominent in the tuning view. Reuse the material renderer in AR.

AtomS3 remains the source of content motion/events. Display interpolation may
smooth sparse telemetry but must not invent a competing collision timeline.
The current haptic model is body x/y only; rendered pitch is not independent
fore/aft content dynamics. Any later axis extension must update the shared
state, spatial mapping and observable protocol together.

Done: material looks contained and responds in the same direction and sequence
as felt motion/contact; marble remains a useful reference.

## 3. Refine the existing dynamic-CG tilt law with an A/B reference

Dynamic CG already exists: material-scaled content position is combined with
shell CG and used in a torque calculation. The supplied weight-shifting/inertia
figure suggests clarifying this mapping, not adding a missing subsystem.

- Define shell and content CG relative to one thumb/index grasp origin,
  including the offset from that origin to the simulated container center.
- Separate reference contact-plane angle from weight-shift and inertia
  corrections. The current position-proportional common cue is empirical,
  not automatically the figure's geometric Tilt term.
- Use the moving CG vector in the moment calculation; do not add another
  fixed-lever inertia term on top of the existing torque.
- Keep vertical-inertia/common and CG-torque/differential contributions tunable.
  Resolve IMU specific-force conventions before labeling a term physical gravity
  or linear acceleration. Apply motor direction conversion once using the actual
  grasp frame; the reference figure's x direction differs.
- Grip force remains nominal, not sensed. Relative-content reaction forces are
  an optional later refinement; do not double-count body acceleration.

Keep the accepted controller selectable as A while comparing the refined B.
Preserve useful travel/torque authority. Investigate smoothness through actual
command/feedback behavior rather than automatically increasing filtering.

Done: a short handling comparison gives coherent weight-shift/inertia cues,
without regression in useful strength or simultaneous vibration.

## 4. Reuse the result in Android AR

The user selected Android; the phone model is not yet known. Perform a short
USB-plus-camera/AR feasibility check early, alongside desktop work. Use the
existing StampC5 WebUSB path. API support does not prove this particular
phone/dongle combination or simultaneous camera operation.

For a held-device overlay, a small device-mounted visual marker is the initial
tracking candidate: it supplies position and an orientation reference; align
the device IMU tilt through the calibrated mounting/frame relationship. IMU
alone does not provide drift-free position or absolute yaw. Table hit-test
placement and moving-device tracking are different capabilities.

First determine whether ordinary camera-based marker AR meets the experience.
Use WebXR/ARCore spatial features only if needed and supported on the target.
Do not assume separate camera capture can run alongside immersive WebXR.
Add no relay/transport unless a concrete device constraint requires it.

Official constraints: [Android WebUSB](https://developer.chrome.com/docs/capabilities/build-for-webusb#android),
[WebXR requirements](https://developers.google.com/ar/develop/webxr/requirements),
[ARCore devices](https://developers.google.com/ar/devices).

Done: on the actual Android phone, applied state, tracked placement, IMU-aligned
tilt and simultaneous haptics agree through a short handling/Stop/reconnect run.

## Scope and verification

Order: tuning/A-B baseline -> liquid/sand visuals -> controller comparison ->
Android integration; phone feasibility runs early in parallel. Checkpoint each
usable increment instead of waiting for perfect material realism.

Keep existing Stop/recovery and bounds. Use change-specific software checks in
07 and one relevant short handling observation. Do not repeat bring-up, switch,
long-soak or broad safety campaigns without a new observed reason.

Deferred: Quest/VR finishing, formal psychophysics, FSR feedback, resonance
calibration campaigns, recorder/replay recovery, OTA, generalized event
protocols, accounts/cloud storage, multi-client support and publication assets.
Technical/historical references are not additional active requirements.
