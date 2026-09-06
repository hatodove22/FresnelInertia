# 08 Active Demo Plan

Updated: 2026-09-06, after the requested firmware/visual refactor and interaction
research and the user-requested desktop visual pass. This is the only active plan. [00](00_DESIGN_SPECIFICATION.md) owns the
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

The reuse refactor is implemented: hardware-free synthesis composition, pure
accepted-state projections, independently owned material renderers, regression
tests and the explanatory interaction atlas. It preserves the content laws and
actuator defaults. [16](16_PROGRESS_STATUS.md) records verification.

The tuning studio and Android work below remain **planned, not implemented**.
The initial material/placement pass in section 2 is implemented; the user requested
that visible defects be addressed before continuing the studio. The current client already has
connection, applied material/fill/dimensions, explicit Start/Stop, device-driven
visuals and an MR path. It does not yet have the new tuning studio or tracked
Android AR. These planned experiences were not enabled by the reuse refactor.

## Reuse the new boundaries for the next experiment

Use the [firmware core](reference/30_REUSABLE_FIRMWARE_CORE.md) for deterministic
offline traces and the [visual ingredients](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md)
for new presentations. Extend the appropriate owner instead of copying the
pipeline or adding preview physics to the connected view.

The [interaction atlas](reference/32_INTERACTION_DESIGN_SPACE.md) proposes 12
experiences with source links, additions and first comparisons. Treat them as
a candidate pool, not twelve new mandatory milestones. The practical choices are:

- First combine the existing comparison work with **C01 hidden/revealed
  contents**, initially rigid versus granular, and **C02 virtual travel length**.
  These can test a meaningful story without new haptic laws. Preserve explicit
  applied-state confirmation and stopped configuration changes.
- For the first new stateful content experiment, prefer **C05 attachment and
  release**: its held position, release transient and subsequent travel have
  clear observable transitions. Add state/model/telemetry together behind a
  default-off experiment and compare with high damping using the same gesture.
- **C04 outflow/remaining mass** and **C06 living capsule** are subsequent
  options. Do not simulate these by streaming resetting parameter writes or
  adding an unrelated vibration clock in the browser.
- Defer **C10/C11 world-contact interactions** to a verified tracking input and
  **C12 squeeze/compliance** to the required sensing/mechanics. The existing
  Android direction stays intact; current hardware is not assumed to supply
  tracked position, measured grip force or rigid resistance.

The atlas's three interactive sketches are deliverables for explanation and
design review; they do not count as these future physical demos being built.

## 1. Make the existing experience comparable and reproducible

First deliver a tuning view that preserves the accepted marble condition,
compares A/B settings, restores the baseline and saves/reloads a configuration.
Keep geometry and fill fixed when comparing a material-response parameter.
Separate physical parameters from presentation gains.

Use the [FW model research](reference/34_FW_MODEL_RESEARCH.md) as a lookup for
the current coherent-path parameter applicability, mass/fill semantics and
bounded comparisons of contact timing, excitation and material state. These
are research candidates; they do not add prerequisites or change this order.

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

The first desktop pass is implemented: contained constant-volume liquid,
rotation-aware stage clearance, bounded acceleration translation, quieter
surroundings, bevels/rims/bottle shoulder, and distinct grain/coin/ice materials.
The marble geometry, color, roughness and reported-position mapping are retained.
See [16](16_PROGRESS_STATUS.md) for software evidence and
[31](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md) for display semantics.

- Liquid: review the new contained surface during actual handling, then tune
  transparency, slosh/detail and state-to-surface bias. Overflow and full fluid
  simulation are not implemented.
- Sand: communicate accumulation and avalanching flow, with local grains as
  detail rather than an unrelated particle cloud.
- Mixtures: the improved ingredients are composed; coherent individual floating,
  contact and packing still need richer shared state and a perceptual comparison.
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

After the requested initial visual pass: tuning/A-B baseline -> further
material refinement -> controller comparison -> Android integration; phone feasibility runs early in parallel. Checkpoint each
usable increment instead of waiting for perfect material realism.

Keep existing Stop/recovery and bounds. Use change-specific software checks in
07 and one relevant short handling observation. Do not repeat bring-up, switch,
long-soak or broad safety campaigns without a new observed reason.

Deferred: Quest/VR finishing, formal psychophysics, FSR feedback, resonance
calibration campaigns, recorder/replay recovery, OTA, generalized event
protocols, accounts/cloud storage and multi-client support. The explanatory
website, film and concept atlas are delivered; additional publication assets
are not a prerequisite for the next handling comparison.
Technical/historical references are not additional active requirements.
