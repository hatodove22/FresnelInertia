# 08 Active Demo Plan

Updated: 2026-09-07, integrating the material/Lab work with the reusable-core,
desktop presentation and research work. Preserve the positively handled
baseline and focus on fine exhibition tuning.
This is the only active plan. [00](00_DESIGN_SPECIFICATION.md) owns the
concept, [16](16_PROGRESS_STATUS.md) the evidence, and
[07](07_TEST_AND_VALIDATION.md) the acceptance criteria.

## Direction and working baseline

Build a compelling shared-state experience using fingertip-plane tilt and four
vibration channels together. The operator positively assessed the current
desktop demo and especially the marble visual. Preserve that baseline and its
useful stimulus strength while improving material expression.

The immediate direction is **fine parameter tuning of the accepted experience**.
Keep the current implementation/defaults as the comparison baseline; make no
engine or control-law rewrite without a concrete remaining problem. A fuller
tuning studio and ordinary-screen Android presentation are optional follow-on
work, not prerequisites for the current exhibition demo. Reuse the existing
renderer, configuration and Haptic Link. AR is optional later work. A flat
screen can use WebGL; do not duplicate the haptic model for another display mode.
Bounded presentation-only water dynamics are appropriate under [00](00_DESIGN_SPECIFICATION.md).
Quest/VR work and
its unfinished physical checks are deferred, not passed and not prerequisites
for this iteration. Do not introduce a separate engine or app stack merely to
add a presentation mode.

The reuse refactor is implemented: hardware-free synthesis composition, pure
accepted-state projections, independently owned material renderers, regression
tests and the explanatory interaction atlas. The material additions retain
these boundaries and existing actuator defaults; they do not require a second
pipeline or command authority.

The connected client already has applied material/fill/dimensions, explicit
Start/Stop, device-driven visuals and a retained MR path. The new offline Lab,
contained material renderer, gated sand-pile model and carbonation effect are
implemented in software. The Lab runs the production C++ layers as WebAssembly,
not a replacement JavaScript physics model. Both pre-integration baseline
firmware images were installed and physical v4 pile/pressure transport was
checked with outputs OFF; the newly merged builds have not been uploaded.
The subsequent user test received a strong positive overall assessment, close
to exhibition use. Its exact per-material coverage was not itemized.
The full tuning studio and Android hand tracking are **not implemented**.
Current verification results belong in [16](16_PROGRESS_STATUS.md).

## 1. Fine-tune the exhibition baseline

The current experience is the working baseline. Do not change parameters merely
to keep development moving. For a concrete felt mismatch, compare one small
change at a time: sustained tilt strength, collision/flow texture and decay, or
the visual response/settling. Hold geometry and fill fixed for that comparison,
keep physical and visual gains distinct, and retain the previous values for
easy return. Record the chosen values once in the owning preset/parameter path.
Use existing controls first; a dedicated tuning application is not required.

Preserve the accepted marble appearance and normal-sand condition. Use the Lab's
manual tilt, repeated tilt/return and shake inputs to compare the same production
model state with its container, content, calculated tilt and four output envelopes.
This is a model preview with no hardware-link/output access, not tactile validation.

- Liquid uses a clipped, volume-preserving container body/free surface,
  including side-on poses. Studio reflections, transmission/absorption, a wet
  contact boundary and approximate submerged-floor caustics are implemented.
  Presentation-only lag, overshoot and damped secondary waves now respond to
  roll/pitch and content changes, with dimension/fill/viscosity-aware response.
  The source clock holds the water and highlights together when paused or stale.
  Judge the visual motion and settling in the Lab, then compare it alongside the
  actual feel; neither full fluid simulation nor a firmware rewrite is required
  to improve presentation.
- The sand-pile feature adds static/dynamic friction and residual slope/CoG.
  Its renderer follows the retained accumulation surface, with local flowing
  grains as detail. Nonperiodic grain shading removes the earlier side banding;
  keep the bed readable during the handled comparison.
- `granular_sand_pile_box` explicitly enables that feature. The ordinary
  `granular_sand_box` factory remains unchanged; the Lab intentionally enables
  the pile option on its sand comparison and lets the operator turn it off.
- Carbonation uses shared sealed/burst/spent state: shaking builds charge,
  the threshold creates a pop, then spray/remaining fill subside. A connected jet,
  asymmetric liquid sheets and foam now carry the main visual, with fine spray
  as secondary detail. Reported phase, time and remaining content own these
  effects. The Lab's optional quarter-speed playback slows input, model and
  display together, and pause holds them together. This is an illustrative
  effect, not calibrated pressure. The requested short common-mode tilt kick
  and weaker vent tail are now implemented from the same burst age; coefficients
  and mapping belong in [06](06_PARAMETER_MODEL.md). The pre-integration AtomS3
  recoil update is flashed;
  the user deferred further hardware work at upload. Next session check the
  connection/servo response noted in [16](16_PROGRESS_STATUS.md), then make one
  short handled soda comparison with vibration and the view. The earlier
  positive baseline report does not establish the new kick's feel.
- Keep the object prominent. Rotation-aware desktop clearance, bounded
  acceleration translation with gentle positional return, vessel styling and
  reusable liquid/particle ingredients are retained alongside the rich material
  visuals. Mixtures can reuse the improved ingredients after
  liquid and sand read well; do not expand the engine to polish presentation.

The current haptic model is body x/y only. In particular, the retained sand pile
has only a dy/dx slope: front/back tilt does not create a fore/aft deposit or
retained CG shift. That limitation is separate from the WebGL rendering pass.
If fore/aft sand behavior becomes a concrete exhibition need, address it in the
shared C++ model/state, followed by the Wasm, telemetry and renderer consumers.
It is not a prerequisite for tuning the accepted baseline. V4 is already 250
bytes, so its extension needs an explicit
compatible wire design. Do not fake fore/aft hysteresis only in the renderer.
Display detail must not invent a competing collision timeline, and rendered
pitch or the new fore/aft liquid waves are not evidence of three-dimensional
haptic dynamics. The bounded visual liquid response does not add retained sand
state, firmware events or actuator output.

The baseline deployment, non-actuating checks and positive user handling report
are recorded in 16; do not restart the general bring-up/comparison sequence.
For a later material adjustment, repeat only its relevant short handled comparison
with both output branches and the view. Simulated envelopes alone do not
establish the feel of a changed setting.

Done: the offline sequence is coherent and the subsequent user-supervised
comparison confirms useful combined cues without regressing the accepted baseline.

## 2. Optional tuning tools (planned, only when existing controls become limiting)

Extend the Lab into a tuning view that preserves the accepted marble condition,
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

## 3. Optional dynamic-CG refinement (planned, requires a concrete felt mismatch)

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

## 4. Reuse the result on an ordinary Android screen (planned)

The user selected Android and accepts a rich non-AR presentation; the phone
model is not yet known. First reuse the WebGL material view with phone framing
and touch-friendly controls. Camera access, hand tracking and markers are not
needed to demonstrate applied state and IMU-aligned tilt on an ordinary screen.

When the actual phone is available, check the existing StampC5 WebUSB path and
the visual workload on that device. API support and a desktop mobile-width
viewport do not establish phone/dongle compatibility or rendering performance.
Do not add another app stack or transport without a concrete device constraint.

Done: on the actual Android phone, applied state, IMU-aligned presentation and
simultaneous haptics agree through a short handling/Stop/reconnect run, with
usable rendering and controls. This does not require AR.

### Optional later hand-following camera AR

If pursued, MediaPipe hand tracking is the primary approach: follow the selected
holding hand's position while device IMU tilt owns the container angle. The hand
tracker and this integration are not implemented. Start with ordinary camera
overlay; avoid requiring the user to acquire or keep a marker visible.

MediaPipe image landmarks use normalized x/y and wrist-relative depth; world
landmarks are metric but centered on the hand. Thus, our inference is that they
cannot alone supply absolute camera/world placement: define scale, camera/grasp
alignment and tracking-loss behavior for the intended overlay. Its synchronous
video detection can move to a worker to keep rendering and controls responsive.
See [the official Web guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).

A device marker or the AtomS3 screen may optionally help initial alignment or
reacquisition; neither is a required primary tracker. IMU alone supplies neither
drift-free position nor absolute yaw. Use WebXR/ARCore spatial features only if
needed and supported; table hit-test placement is not tracking the held device.
Do not assume separate camera capture can coexist with immersive WebXR.
The optional AR increment needs its own simultaneous camera/USB and tracked
placement/handling check; those checks do not block the ordinary-screen demo.

Possible later demonstrations, not added to the current implementation scope:
a snow globe (suspension, settling and soft granular flow), or popcorn
(separate intermittent pops and accumulating light pieces). First judge the
existing soda effect before introducing another behavior.

Official constraints: [Android WebUSB](https://developer.chrome.com/docs/capabilities/build-for-webusb#android),
[WebXR requirements](https://developers.google.com/ar/develop/webxr/requirements),
[ARCore devices](https://developers.google.com/ar/devices).

## Optional experiments through the reusable boundaries

Use the [firmware core](reference/30_REUSABLE_FIRMWARE_CORE.md) for deterministic
offline traces and the [visual ingredients](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md)
for another presentation. Extend the owning layer instead of copying the pipeline.

The delivered [interaction atlas](reference/32_INTERACTION_DESIGN_SPACE.md)
contains 12 proposals and three browser sketches, not 12 required milestones
or physical implementations. C01 hidden/revealed contents and C02 virtual
travel length can use the existing laws. C05 attachment/release is a candidate
new stateful experiment; C04 draining and C06 living capsule are alternatives.
The implemented soda remaining-content effect is not the atlas's general
outflow/contact model. Do not replace shared state with browser vibration clocks
or repeated resetting parameter writes. C10/C11 world contact and C12 compliance
remain conditional on new tracking or sensing/mechanics.

## Scope and verification

Current priority: preserve the accepted baseline -> focused parameter comparison
-> retain the better settings. Tuning tools, controller redesign and Android
presentation are separate follow-on choices, not mandatory steps in this order.
Phone feasibility can run when the actual device is available. Checkpoint each
usable increment instead of waiting for perfect material realism.

Keep existing Stop/recovery and bounds. Use change-specific software checks in
07 and one relevant short handling observation. Do not repeat bring-up, switch,
long-soak or broad safety campaigns without a new observed reason.

Deferred: optional Android AR, Quest/VR finishing, formal psychophysics, FSR feedback, resonance
calibration campaigns, recorder/replay recovery, OTA, generalized event
protocols, accounts/cloud storage and multi-client support. The explanatory
website, film and concept atlas are delivered; additional publication assets
are not a prerequisite for the next handling comparison.
Technical/historical references are not additional active requirements.
