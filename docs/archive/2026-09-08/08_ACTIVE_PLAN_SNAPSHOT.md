> Archived 2026-09-08 during documentation cleanup. This is the previous plan,
> not active instructions or evidence of completion. See the [current plan](../../08_IMPLEMENTATION_PLAN.md).
> Original content is retained; relative links are rebased for this location.

# 08 Active Demo Plan

Updated: 2026-09-08. Preserve the positively handled desktop/phone baseline
while refining the ordinary-screen material experience. The user now approves
the recorded water sound. The requested preference workspace now searches
vibration and fingertip-tilt gains together in five dimensions for water, a
single marble and retained sand. Selected profiles can seed another session or
be reapplied in the ordinary device demo. Next upload the
required AtomS3 extension and use one short handled A/B comparison when hardware
is available. The recorded soda/sand refinements still await subjective judgment.
Software facts belong in [16](16_DEVELOPMENT_LEDGER.md).
This is the only active plan. [00](../../00_DESIGN_SPECIFICATION.md) owns the
concept, [16](16_DEVELOPMENT_LEDGER.md) the evidence, and
[07](../../07_TEST_AND_VALIDATION.md) the acceptance criteria.

## Direction and working baseline

Build a compelling shared-state experience using fingertip-plane tilt and four
vibration channels together. The operator positively assessed the current
desktop demo and especially the marble visual. Preserve that baseline and its
useful stimulus strength while improving material expression.

The next hardware priority is **verify the material-switch servo fix**
(section 0), when the operator resumes AtomS3 work. The requested coin visuals,
single-coin condition and exhibition keyboard controls are implemented;
software/browser evidence and the positive phone report are in [16](16_DEVELOPMENT_LEDGER.md).
The requested optional speaker effects now accompany those source states.
The ordinary-screen controls now separate preview, device and Lab actions,
with pinned physical Start/Stop and optional settings folded away. Preserve
these source boundaries during tuning; the control guide is in the
[Web README](../../../webxr/README.md#demo-controls).
The requested stronger soda pop now has a sharper, short opening trajectory
in source and the rebuilt Lab. Its physical effect needs the next AtomS3
upload and one brief handled comparison; parameter ownership is in
[06](../../06_PARAMETER_MODEL.md), software evidence in [16](16_DEVELOPMENT_LEDGER.md).
Coins now use visual rigid-body contacts instead of triggered flips. Sand now
has a source-driven surface skin over the existing retained pile; no new
fore/aft sand mass model is implied. Compare tilt-return/reversal and pause,
and listen to soda's single opening followed by burst-only fizz. Keep the
approved recorded water and accepted marble intact. Compare local volume/timbre
and material motion with the accepted visual/tactile experience;
sound is not a new firmware subsystem or a reason to repeat hardware bring-up.
Single-coin selection on hardware needs the next AtomS3 upload; it is already
available without hardware in the Lab. Follow with a short coin comparison and
fine parameter tuning of the accepted experience.
Keep the current implementation/defaults as the comparison baseline; make no
engine or control-law rewrite without a concrete remaining problem. The joint
five-axis representative-material preference workspace is available; arbitrary
material editing is follow-on work driven by felt comparisons. Ordinary-screen phone use has received
a positive operator report. Reuse the existing
renderer, configuration and Haptic Link. AR is optional later work. A flat
screen can use WebGL; do not duplicate the haptic model for another display mode.
Bounded presentation-only water dynamics are appropriate under [00](../../00_DESIGN_SPECIFICATION.md).
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
The combined vibration/tilt A/B workflow is implemented separately from the
Lab. A general all-material parameter studio and Android hand tracking are
**not implemented**.
Current verification results belong in [16](16_DEVELOPMENT_LEDGER.md).

## 0. Close the reported material-switch servo fault

The software fix and regression evidence are in
[16](16_DEVELOPMENT_LEDGER.md#material-switch-servo-fix-2026-09-07).
The subsequent requested brief-link retry policy is described in
[04](../../04_HARDWARE_AND_PIN_SPEC.md#brief-live-dynamixel-interruptions).
The operator has deferred AtomS3 hardware work. Upload the affected integrated
image when the operator is available;
this fix does not require a StampC5 update. Refresh the built Web client.
Make one short handled material-switch/restart check with both output branches.
Transient on-device retry should remain distinct from a latched fault, and
Stop must cancel it. If a latched fault appears, use the visible
**停止してサーボ復帰** and then explicitly start; record the fault/result if
communication still cannot be recovered. Judge catch-up feel during that
same short handling check, not in a separate long campaign.
Do not repeat general bring-up or expand the control law for this fault.

Done: material switching and deliberate restart work in the actual setup,
with no spurious servo fault; a brief live link interruption can recover
without restarting the demo, while explicit Stop stays stopped. Any required
manual recovery succeeds without reboot
once bus communication is available. Software checks alone do not close this.

## 1. Fine-tune the exhibition baseline

The current experience is the working baseline. Do not change parameters merely
to keep development moving. For a concrete felt mismatch, compare one small
change at a time: sustained tilt strength, collision/flow texture and decay, or
the visual response/settling. Hold geometry and fill fixed for that comparison,
keep physical and visual gains distinct, and retain the previous values for
easy return. Record the chosen values once in the owning preset/parameter path.
For the requested subjective gain search, use the focused preference workspace
in section 2. It reuses the existing model and transport rather than exposing
all parameters or adding another haptic engine.

Preserve the accepted marble appearance and normal-sand condition. Use the Lab's
manual tilt, repeated tilt/return and shake inputs to compare the same production
model state with its container, content, calculated tilt and four output envelopes.
This is a model preview with no hardware-link/output access, not tactile validation.

- The requested visual-only fore/aft motion is implemented for marble, coins
  and single coin. Compare both signs of **前後**, return to level and pause:
  the marble rolls, while coins need enough tilt to overcome friction. Compact
  coin packing leaves room for visible travel. The shared C++ x/y model and
  sound/haptic events stay unchanged; next judge this presentation alongside
  the existing feel, without making a 3D firmware rewrite a prerequisite.
  The user rejected a triggered coin-flip animation. Coins now have individual
  3D contact physics from accepted IMU input, without aggregate x/y pose locking.
  **コイン / コイン1枚 → 振ってみる** uses spatial input: compare sliding,
  rim contacts, possible turnover and settling, not a guaranteed half-turn.
  Verify the visual/acoustic/tactile fit later; this adds no haptic events.
- Liquid uses a clipped, volume-preserving container body/free surface,
  including side-on poses. Studio reflections, transmission/absorption, a wet
  contact boundary and approximate submerged-floor caustics are implemented.
  Presentation-only lag, overshoot and damped secondary waves now respond to
  roll/pitch and content changes, with dimension/fill/viscosity-aware response.
  The source clock holds the water and highlights together when paused or stale.
  Judge the visual motion and settling in the Lab, then compare it alongside the
  actual feel; neither full fluid simulation nor a firmware rewrite is required
  to improve presentation.
  After the operator found the added water sheets visually disconnected,
  that overlay was replaced by one continuous deforming surface and matching
  wall-side volume: a rising shoulder draws down surrounding water, and the
  wall waterline moves with it. Accepted acceleration also excites this view.
  Compare **水 → 振ってみる**, then a manual fore/aft tilt and pause. This is
  bounded presentation, not a new shared airborne/contact model;
  implementation limits belong in [the visual contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#integrated-material-presentation).
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
  and mapping belong in [06](../../06_PARAMETER_MODEL.md). The pre-integration AtomS3
  recoil update is flashed; the subsequent sharper-opening revision is not.
  The user deferred further hardware work at upload. Next session check the
  connection/servo response noted in [16](16_DEVELOPMENT_LEDGER.md), then make one
  short handled soda comparison with vibration and the view after uploading
  that revision. The earlier
  positive baseline report does not establish the new kick's feel.
- Keep the object prominent. Rotation-aware desktop clearance, bounded
  acceleration translation with gentle positional return, vessel styling and
  reusable liquid/particle ingredients are retained alongside the rich material
  visuals. Mixtures can reuse the improved ingredients after
  liquid and sand read well; do not expand the engine to polish presentation.
- Speaker sound uses separate Web-only ON/volume controls and a bundled
  Foley bank. The operator found the previous pitch-swept
  synthesis unnatural; the revision removes those sweeps and shortens hard
  contacts, with four variants and quieter rolling/friction. Use the Lab to
  compare coin clinks, hard contacts, grit, slosh
  and soda opening/venting, then make a brief subjective comparison on the
  intended phone/speaker. Source/Stop/pause behavior is software-checked, not
  proof of acoustic quality or phone audio latency; no FW update is needed.
  The user still found the synthetic water unnatural. Water/hybrid now use
  licensed real water recordings, a long motion loop and less frequent accents.
  Compare **水 → 効果音をON → 振ってみる**, listening for coherent water motion
  and settling. Do not infer perceptual success from playback tests alone.

The current haptic model is body x/y only. In particular, the retained sand pile
has only a dy/dx slope: front/back tilt does not create a fore/aft deposit or
retained CG shift. That limitation is separate from the WebGL rendering pass.
If fore/aft sand behavior becomes a concrete exhibition need, address it in the
shared C++ model/state, followed by the Wasm, telemetry and renderer consumers.
It is not a prerequisite for tuning the accepted baseline. V4 is already 250
bytes, so its extension needs an explicit
compatible wire design. Do not fake fore/aft hysteresis only in the renderer.
The user-requested visual-only marble/coin depth response is a separate,
bounded presentation extension, not retained sand state. Neither it nor the
fore/aft liquid waves establish three-dimensional haptic dynamics. Visual wall
responses must not generate a competing speaker/haptic collision timeline or
actuator output.

The baseline deployment, non-actuating checks and positive user handling report
are recorded in 16; do not restart the general bring-up/comparison sequence.
For a later material adjustment, repeat only its relevant short handled comparison
with both output branches and the view. Simulated envelopes alone do not
establish the feel of a changed setting.

Done: the offline sequence is coherent and the subsequent user-supervised
comparison confirms useful combined cues without regressing the accepted baseline.

## 2. Joint vibration/tilt preference tuning (software implemented)

The user requested parametric gain search using subjective realism judgments.
The [workspace](../../../webxr/README.md#preference-tuning) proposes all five
experience coordinates together using a preference GP, saves/resumes sessions,
and can reapply the initial or currently selected values for water, one marble,
and retained sand. Vibration strength, material response (damping for water/marble,
coupled friction for the pile), content-position tilt, common inertia and differential
CoG/inertia are one candidate, not independent search groups. The fixed
`k_phi` removes a redundant scale; parameter meanings belong in
[06](../../06_PARAMETER_MODEL.md#joint-preference-search). Rehearsal is output-free
and separate from physical ratings. Software evidence is in
[16](16_DEVELOPMENT_LEDGER.md); no human-optimized settings or tactile improvement
have yet been established.

When handled testing resumes, keep the same real-water reference, container,
fill, grip and tilt-return gesture. Upload the new AtomS3 extension first;
StampC5 does not need updating. In the same short session as the pending servo
recovery check, confirm combined A/B application/readback and explicit Start.
After checking handling readiness once, the left-hand Q/W shortcuts deliberately
apply and start A/B; the next proposal never starts automatically. Use the same
motion, make a few useful comparisons, pause, and recheck the selected candidate
against the initial baseline. No fixed count establishes perceptual convergence.
Keep existing accepted preset defaults unchanged. Explore each representative
material in its own session. Save a selected profile after a useful comparison
batch; apply it in the ordinary demo while stopped, then deliberately Start.
For a different material, use only its common vibration/tilt coefficients as
a new starting point. Do not transfer material-specific damping/friction or
past judgments. The receiving material still needs its own tactile evaluation.

The new FW returns four applied tilt coefficients; vibration/material response still
have execution ACKs only, not numeric readback. The client checks capability
before changing the preset/parameters and rejects pre-tilt FW for v2/v3 sessions.
An intermediate image with tilt readback but no remote friction setters may
reject sand after loading its preset; this stays stopped and is not rolled back.
Saved v1 comparisons continue with their original two axes and three values;
v2 comparisons keep their joint water semantics. V3 stores the material identity;
they are not silently expanded. Distinguish reported configuration from actual
force or tactile realism, and do not conflate vibration gain with servo strength.

Use the [FW model research](../../reference/34_FW_MODEL_RESEARCH.md) as a lookup for
the current coherent-path parameter applicability, mass/fill semantics and
bounded comparisons of contact timing, excitation and material state. These
are research candidates; they do not add prerequisites or change this order.

- Keep the four tilt readbacks separate from the three ACK-only vibration/material values;
  never label imported history as current device state.
- Expose only parameters used by the selected model. The current remote
  allowlist does not include every tilt/texture/mass control; extend only those
  needed and return their applied values through a defined configuration path.
- Respect preset semantics in [06](../../06_PARAMETER_MODEL.md). Editing preset JSON
  is not automatically an update to the running firmware.
- Apply the complete candidate while stopped, then explicitly start. Q/W is
  one deliberate shortcut through that same transaction, not permission to
  stream configuration or automatically play the next candidate.
- Keep numerical controls available but secondary. A brief touch-only comparison
  can distinguish felt improvement from visual expectation; no study-management
  system or factorial campaign is required.

Bouba/Kiki-like parametric shapes are a proposed perceptual interface, not a
validated universal mapping. Candidate axes are round/sharp (contact envelope
and spectral balance), gathered/dispersed (event density and spatial spread),
and free-flowing/viscous (damping and flow persistence). Refine them by A/B
handling. Keep mass, dimensions and fill separate; heavier must not simply mean
louder. Abstract tuning shapes must not silently change physical geometry.

Next increment done: the real device comparison can apply/start both candidates,
retain a preferred setting and return to the known initial baseline, with no
implicit arming or loss of the saved session. Record its actual user assessment;
software/mock tests alone do not close the physical tuning workflow.

### Separate expressive demo: heartbeat (planned, not implemented)

The user proposed a fictional heart-like object held in the hand. This is a
separate expressive demo, not a fourth calibration condition. First implement
a named heartbeat state on the AtomS3/shared C++ model: a softer second beat
after the main pulse, plus a slower contraction envelope. That one state should
drive four-channel low thuds, bounded fingertip-plane angle motion and visual
contraction. A separate browser clock, fabricated collisions, or repurposed
sand/pressure telemetry would break the shared-state concept.

Keep the feature off for existing presets. Add explicit pulse events/texture
and center/all-channel routing (the current no-wall path otherwise produces no
output), using existing final tilt bounds/filtering. Stop, long gaps and restart
must not catch up with a rapid sequence of missed beats. The existing 250-byte
v4 telemetry is full: give heartbeat a versioned dedicated state payload and
update the bridge/parser/schema coherently, while preserving v3/v4 ordinary
demos. This would require both AtomS3 and StampC5 updates, unlike gain tuning.
Use an abstract non-medical visual first. No measured heart rate, grip-force
sensor, actual squeeze-force actuator or anatomical/clinical accuracy is implied.
Do not expand this into a new engine, biosignal system or medical simulation.

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

## 4. Ordinary Android screen (first operator report received)

The user selected Android and accepts a rich non-AR presentation; the phone
model is not yet known. The operator reports successful smartphone demo use on
2026-09-07; the exact phone and individual Stop/reconnect checks were not
itemized. Reuse the shared WebGL material view with phone framing
and touch-friendly controls. Camera access, hand tracking and markers are not
needed to demonstrate applied state and IMU-aligned tilt on an ordinary screen.

For the next changed feature, collect only its relevant phone observation;
do not repeat general phone bring-up. API support and a desktop mobile-width
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

Use the [firmware core](../../reference/30_REUSABLE_FIRMWARE_CORE.md) for deterministic
offline traces and the [visual ingredients](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md)
for another presentation. Extend the owning layer instead of copying the pipeline.

The delivered [interaction atlas](../../reference/32_INTERACTION_DESIGN_SPACE.md)
contains 12 proposals and three browser sketches, not 12 required milestones
or physical implementations. C01 hidden/revealed contents and C02 virtual
travel length can use the existing laws. C05 attachment/release is a candidate
new stateful experiment; C04 draining and C06 living capsule are alternatives.
The implemented soda remaining-content effect is not the atlas's general
outflow/contact model. Do not replace shared state with browser vibration clocks
or repeated resetting parameter writes. C10/C11 world contact and C12 compliance
remain conditional on new tracking or sensing/mechanics.

## Scope and verification

Current priority: when hardware is available, upload the integrated AtomS3
revision with the servo fix, single-coin preset and tuning readback -> focused
switch/recovery and combined A/B comparison -> retain the better settings.
The five-axis preference workspace supports those requested gain comparisons;
controller redesign and tracked Android AR remain
separate choices, not mandatory steps in this order. Checkpoint each
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
