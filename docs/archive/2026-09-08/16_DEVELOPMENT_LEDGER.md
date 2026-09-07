# Development ledger archived on 2026-09-08

This is the complete former `docs/16_PROGRESS_STATUS.md` development ledger,
preserved before the current-facts rewrite. It is historical evidence, not a
current plan, hardware-state report or instruction to repeat earlier tests.
Dated checks apply to their tested revisions; superseded sections remain here
to preserve unique observations, failed approaches and verification scope.

The original text and section anchors follow unchanged, except that relative
Markdown link destinations are rebased from `docs/` to this directory and
original plan links point to the companion 08 snapshot. Links to other active
documents retain their original fragments and may describe an older structure. Inline scratch paths retain their original context;
ignored/local captures are not newly included in the repository.

Current facts: [16](../../16_PROGRESS_STATUS.md).
Active plan: [08](../../08_IMPLEMENTATION_PLAN.md).
Archive index: [README](../README.md).

---

# 16 Current Status

Updated: 2026-09-08. This is the evidence ledger, not a second work plan.
Read [00](../../00_DESIGN_SPECIFICATION.md) for the concept and
[08](08_ACTIVE_PLAN_SNAPSHOT.md) for the next iteration.

## Current position

The integrated handheld demo works on desktop with encouraging user feedback;
the operator now also reports successful smartphone demo use (see below).
Four-channel vibration, two-servo tilt, ESP-NOW and the connected visual client
have run together. The operator confirmed visual/felt directional agreement,
then explored multiple properties. After the pre-kick firmware deployment and
richer water/WebGL iteration, the operator reported very good test results,
close to exhibition use; see the latest handling report below. Preserve this
working baseline. A later exhibition report describes an intermittent servo
fault on material switching; the targeted software fix and subsequently
requested brief servo-link recovery below are not yet uploaded or physically
verified.

The user has selected **Android** and now accepts a rich ordinary-screen phone
demo without requiring AR. After the targeted servo-fix check, resume parameter tuning;
hand-tracked camera AR is optional later work and VR/Quest remains deferred.
The new output-free C++ Lab, contained liquid/sand
rendering, retained granular pile and soda burst are implemented in software.
The pre-integration baseline AtomS3 and StampC5 images were installed, and
output-OFF checks confirmed physical v4 pile/pressure transport. Subsequent handling received a
strong positive overall assessment; per-preset coverage was not itemized.
The later requested soda tilt kick is implemented, software-checked and flashed
below, but is not included in that positive physical report. At the user's
request, that session ended at firmware upload; handled recoil testing is
deferred. Neither device has received the newly merged build.
A three-representative preference workspace now provides saved A/B sessions,
joint vibration/tilt proposals and reusable selected profiles (see below).
Arbitrary material editing, the separate fictional heartbeat demo,
dynamic-CG law refinement, perceptual-shape controls and tracked Android
AR remain **planned, not implemented**. Markers are optional alignment aids, not the main
tracking method. Existing Quest evidence is retained, but its unfinished
checks are not current prerequisites. Phone use now has positive operator
evidence, though its exact device and per-flow coverage were not itemized;
camera/AR validation is not a gate for an ordinary-screen phone demo.

The 2026-09-07 integration combines local material/Lab work with remote
`121e342` (reusable firmware/visual boundaries, desktop placement/recovery and
explanatory/research assets). Earlier dated checks belong to the source
revisions on which they ran, not automatically to the merged revision.

## Three representative searches and reusable selected profiles, 2026-09-08

The requested representative conditions are now water, one marble and retained
sand. Each new v3 session jointly explores vibration, one effective material
response coordinate and three tilt gains. Water/marble use damping; the pile
uses coupled static/dynamic friction because its code path bypasses damping.
Existing v1/v2 data retains its original meaning. The
[parameter model](../../06_PARAMETER_MODEL.md#joint-preference-search) owns exact
fields/ranges and the [Web guide](../../../webxr/README.md#preference-tuning) owns controls.

A separate selected-profile format exports seven values and source/mode/
comparison labels without votes. Same-material reuse preserves the selected
coefficients; cross-material seeding keeps only common vibration/tilt gains
on the receiving material's baseline, then starts an empty-history session.
The ordinary demo exposes profile import/export/selection and matching-material
stopped application, never automatic Start or a persistent FW preset write.
Imported self-reported labels are provenance, not authenticated or measured
physical evidence. Rehearsal profiles remain labeled as not tactile-evaluated.

Software checks in this iteration:

- All 385 Web tests pass, including the selected-profile controller tests;
  TypeScript/build pass. Existing large scene/physics chunk warnings remain.
- Browser rehearsal exercises the shipped C++/Wasm for all three A/B conditions,
  left-hand controls, same/cross-material reuse with no inherited votes, archive
  resume, profile JSON, malformed import, and 412 px layout. Session quota
  recovery and a failed same-key profile overwrite retain the latest in-memory
  selection for export. No physical USB, camera or speaker output was used.
- Actual Chromium with injected Web Serial verifies all three stopped
  applications, Q/W presentation and A/D voting, complete friction receipts and
  JSON resume, foreign-material rejection, material-switch cancellation and
  retained v1/v2 compatibility. Sand Idle correctly reports an inactive/default
  dynamic state; preset identity and executed friction writes establish the
  stopped condition, not the running-only pile-active flag.
- The ordinary-demo Chromium/mock-serial regression passes profile JSON
  import/export, exact seven-value stopped application, no auto-Start, a
  delayed-set Stop cancellation and complete reapplication. Existing keyboard,
  audio, servo-recovery, mobile Stop and stale-state flows still pass, with no
  page errors. This uses software WebGL and mocked transport, not hardware.
- Remote application tests cover valid three-preset seven-value transactions,
  invalid bounds/pairs with zero I/O, and cancellation/partial failure. The
  new remote friction setters reject values outside 0–2; the browser search is
  narrower. C++/Wasm tuning-policy checks pass 192 assertions.
- The explicit pile preset is also addressable in PreviewEngine; its existing
  static/dynamic friction readouts are reused. No alternate material model,
  protocol packet layout, actuator bound or existing preset default was changed.
- Sequential builds pass: baseline `m5stack-atoms3-pipeline` (flash 624,145 B,
  RAM 45,668 B) and integrated `m5stack-atoms3-pipeline-tilt-espnow-monitor`
  (flash 1,073,121 B, RAM 70,772 B). StampC5 needs no update for this feature.

Neither image was flashed and no device was actuated in this iteration.
There are still no human-optimized profiles or demonstrated tactile benefit
from this search; the next short handled comparison remains in [08](08_ACTIVE_PLAN_SNAPSHOT.md).

The user's separate heart-like pulse idea was reviewed and recorded as
**planned, not implemented** in [08](08_ACTIVE_PLAN_SNAPSHOT.md#separate-expressive-demo-heartbeat-planned-not-implemented).
It requires its own shared pulse state and coherent telemetry/bridge support,
not a browser-only clock or relabeled collisions. No medical/biometric claim
or grip-force sensing was added.

## Joint vibration/tilt preference search and left-hand controls, 2026-09-08

The user requested tilt gains and explicitly rejected separating vibration
from tilt comparisons. The new v2 sessions therefore jointly explore five
dimensions: vibration master gain, coupled x/y damping, content-position angle
gain, common vertical inertia, and differential CG/lateral-inertia torque.
The common pseudo-force multiplier stays fixed because, for ordinary water,
its products with the two force gains would create redundant search directions.
Existing v1 two-axis records remain readable/replayable without adding tilt
writes or silently reinterpreting their historical votes. The
[operator guide](../../../webxr/README.md#preference-tuning) owns current controls;
the [parameter reference](../../06_PARAMETER_MODEL.md) owns their meaning and limits.

Q/W performs the complete A/B application and explicit Start with one left-hand
keypress after the handling check; A/D selects the preferred combined feel,
S records a tie, X skips, and Space/Esc stops. Typing, held keys and IME input
do not activate shortcuts; focus can remain on the handling checkbox.
Votes update the joint preference GP and prepare the next pair without starting
it. Projection selectors change only the displayed two-axis map, not which
parameters the five-dimensional optimizer explores. Rehearsal now also plots
both finger commands and near-limit time under the same tilt/vertical input.
Those are calculated commands, not measured forces or tactile ratings.

FW exposes four existing tilt coefficients while stopped and returns their
actual values in the existing GetState ACK detail. Candidate application
checks compatibility before preset/set writes, applies seven values with
11 execution ACKs, verifies four tilt readbacks, and rechecks before Start.
Old FW is explicitly refused for v2, while v1 remains usable. The existing
packet sizes, StampC5 code, controller law, defaults, signs, physical bounds,
bus settings and output limits are unchanged. See [05](../../05_INTERFACE_SPEC.md)
for the compatible ACK-detail extension; water gain/damping still have no
numeric readback. The shipped C++ Wasm preview was regenerated for the setters
and parameter snapshots.

Verification: **364/364 Web tests PASS**, typecheck/production build PASS.
New pure tests cover five-dimensional joint proposals, an interaction-dependent
synthetic preference function, posterior consistency, 60-comparison save/resume,
v1 compatibility, applied readback and unchanged mass/vibration for tilt-only
changes. Actual Chromium rehearsal/JSON/projection/mobile-width checks pass;
fully mocked Web Serial passes seven-value application, older FW rejection,
post-apply/pre-Start mismatch, left-hand keyboard flow, Stop/reset/disconnect
and old v1 transfer. No hardware or audio output occurred in browser testing.

The focused C++/Wasm remote-policy/ACK regression passes **174 checks**.
PlatformIO builds run sequentially: `m5stack-atoms3-pipeline` PASS
(623,945-byte flash) and `m5stack-atoms3-pipeline-tilt-espnow-monitor` PASS
(1,072,933-byte flash). No firmware was uploaded, no servo/transducer was driven,
and no real A/B ratings or improved gains have been established. This new
physical tuning flow needs the updated AtomS3 and one handled comparison;
it does not require a new StampC5 image. The other pending integrated FW work
remains unflashed as before.

## Initial two-axis preference workspace, 2026-09-08 — superseded for new sessions

Historical software evidence for v1 follows. New sessions use the joint v2
workflow above; saved v1 data retains the old behavior.

The user requested parametric tuning of subjective haptic realism, potentially
through Bayesian optimization. The separate `/tune.html` now offers an initial
two-axis water workspace using a preference Gaussian process. It compares the
current selected candidate with a proposal, randomizes A/B labels, learns from
A/B/tie votes, and records uncertain/skipped judgments without learning from
them. Sessions and the active pair can be saved/resumed/exported; initial and
selected settings remain available for comparison. There is no new parameter
engine, FW command, protocol, WebAudio or rendered material scene. The
[Web guide](../../../webxr/README.md#preference-tuning) owns usage/ranges and the
[implementation contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#preference-tuning-workspace)
owns optimizer semantics.

The two controls are existing remote water master gain and coupled x/y damping.
Servo/CG/inertia gains are not available through this workspace. Device mode
requires explicit application while stopped and a separate Start for each
candidate. Six execution ACKs and a fresh stopped water/configuration snapshot
gate Start, but current wire telemetry does not read back the gain numbers.
Imported receipts are history, not authority to start. Reboot, stale state or
USB loss invalidates applied/previously checked candidates. Rehearsal executes
the shipped C++ with a fixed input and keeps its choices out of device learning.

Verification: **348/348 Web tests PASS**, typecheck/production build PASS.
This includes preference-posterior/acquisition and synthetic-search checks,
session/history validation, and bounded cancelable tuning transactions.
Actual Chromium rehearsal checks pass for A/B/tie/skip, save/import/resume,
non-destructive malformed import, mode separation, and a 412-pixel viewport
without horizontal overflow. Rechecking initial/selected candidates does not
cast votes. A simulated storage quota failure leaves the previous save intact,
keeps a warning visible and permits export of the newer in-memory history.
Actual Chromium with fully mocked Web Serial passes apply/Start/vote/Stop,
six-command receipts, same-preset Atom reset detection, LIVE USB loss and Stop
during a delayed parameter ACK. No page errors, hardware access, speaker output
or external requests occurred in these browser tests.

The tuning chunk is about 27 kB before gzip, reusing the existing Wasm preview
wrapper; it does not load the main renderer or sound bank. Firmware, Wasm,
presets and defaults were not modified for tuning. Prior dirty FW work remains
separate and unflashed. **No real A/B tactile ratings or optimized gain values
have been collected**; physical transfer, perceived improvement and Android
tuning interaction still need the focused next comparison in [08](08_ACTIVE_PLAN_SNAPSHOT.md).

## Recorded soda and persistent sand surface, 2026-09-08

The user strongly approved the recorded water sound ("音めっちゃ良いじゃん！")
and requested the same direction for soda, plus more realistic sand behavior.
This is direct water-audio feedback, not an approval of the subsequent soda or
sand changes. The approved water/hybrid and solid PCM clips were preserved
byte-for-byte while adding actual CC0 cork and carbonation recordings.
The opening uses the existing one-shot PressurePop; a separate fizz bed runs
only from accepted burst phase/charge/age/remaining. Sealed movement uses water
slosh; spent, Stop, pause, reset and mute cancel the vent. See the
[speaker guide](../../../webxr/README.md#speaker-sound) for sources and playback.

Sand replaces the old oscillating grain positions with persistent, directional
surface transport and shallow local erosion/deposition. Actual granular flow
excites it; flow stopping retains the changed grain positions and relief.
The reported pile slope and bulk model are unchanged. Final triangle sampling
keeps the grains in contact with the rendered, volume-corrected surface.
This is a thin presentation layer, not new fore/aft granular mass dynamics,
calibrated DEM or new sound/haptic events. Details live in the
[visual contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).

Verification: **309/309 Web tests PASS**, typecheck/production build PASS.
The sand checks include both flow signs, duplicate/missing/gapped source time,
rest retention, and 42 size/fill/slope combinations for actual mesh volume,
wall bounds and grain/surface contact. Chromium/WebAudio confirms burst-only
recorded fizz, one opening, spent/resume behavior and tail cancellation; the
approved water playback/cancellation regression also passes. Audio output was
muted during automation, so soda timbre and tactile fit still need user judgment.
The agent-browser page loads and renders sand, accepts tilt controls, and has
no page errors. Desktop sand screenshots were inspected. The shipped main
chunk is about 798 kB; the audio bank is lazy-loaded (see Web guide).
The focused Chromium sand flow also passes: both +/-45-degree tilts retain
opposite source slopes after returning level, with flow then zero. The actual
1,225-grain GPU uploads follow that surface. Pause holds the source, all grain
matrices and canvas pixels exactly; water/sand switching and Reset work, and
the 412 x 915 viewport has no horizontal overflow. No hardware/audio I/O is
used by that visual test. Documentation local links and diff checks PASS.
No FW, Wasm, wire format, haptic model or hardware output was changed in this
iteration. Prior uncommitted firmware work remains separate and unflashed.

## Natural coin dynamics and recorded water, 2026-09-08

The user rejected the triggered flip and still found synthetic water unnatural.
Coins now use individual 3D rigid bodies with accepted gravity/acceleration,
friction and contacts, not a prescribed 180-degree turn. Visual x/y/z is no
longer glued to the firmware's aggregate centroid. One/multiple coins can
slide, rock and overturn without a special flip event. The Lab coin shake now
supplies the same spatial input to both models. Haptic/sound events, FW,
production C++ Wasm, wire formats and actuator commands are unchanged.

Water/hybrid use Joseph SARDIN's CC0 real water recording, with a long motion
loop and less frequent recorded accents. Solid/marble/sand/soda PCM remains
unchanged. The generated bank has 58 clips / 2,125,004 bytes. Loading stays
explicit and cached, with default sound OFF. Provenance/license and processing
are retained with the source; see the [Web guide](../../../webxr/README.md#speaker-sound).

The [visual contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#coin-presentation)
owns the physical solver, source-clock/loading/disposal details and its limits.
Observed thin-rim penetration was corrected with exact wall-support constraints
and contact-point impulses, never a target angle. Sustained low-speed sleep
prevents idle drift. This is presentation physics, not calibrated coin dynamics
or exact individual visual/acoustic/haptic contact synchronization.

Verification: **293/293 Web tests PASS**, including 17 physical-coin renderer/
model checks; typecheck/production build PASS. The build retains large-chunk
advisories: main ~791 kB and lazy Rapier ~2.86 MB. Actual Chromium/WebGL uploads
show edge and reverse poses for both coin conditions, exact pause holding and
reset to the initial arrangement. Four captured poses and mobile-width layout
were inspected; the 412 x 915 viewport has no horizontal overflow. The coin
chunk is absent on first water load and fetched when coins are selected.
An intentionally failed download shows a visible error in the Lab, preserves
its controls, and succeeds after reload/reselection. A structural regression
keeps this status outside preview-only/collapsed sections.

Chromium/WebAudio confirms recorded water excerpts, one bank load and
pause/reset/mute/material cancellation without delayed replay. Browser output
was muted: this verifies playback/routing, not perceived naturalness. The
agent-browser flow also loads, selects/shakes coins and reports no page errors.
Documentation links and diff whitespace checks PASS. Old trigger tests were
retired/replaced, not relabeled as passing physical-model tests.

Subjective listening, Android performance and handled audiovisual/tactile
agreement are not yet verified for this revision. No device was accessed or
actuated; the previous pending firmware work remains pending.

## Visual coin turnover, 2026-09-07 — superseded

Historical evidence: the user rejected this scripted approach. It is replaced
by the 2026-09-08 contact model above; the old helper and two trigger-specific
test files were removed from the active tree, with local copies retained in
ignored `tmp/replaced-scripted-coin-flip/`. The results below apply only to that
earlier implementation, not to the current dynamics.

The requested coin flip is implemented for the single coin and multi-coin
presentation. Strong accepted acceleration with moving contents starts a full
half-turn, lifting the edge clear of its support and settling on the opposite
face. Front numeral and reverse rosette make the change visible. Multiple coins
turn one upper disc at a time; actual oriented-cylinder extents reserve wall
and layer clearance. This is constrained visual packing, not independent
rigid-body simulation or a new physical collision timeline. Gentle tilt keeps
the existing slide/depth behavior. Paused/repeated source time holds the pose;
source/preset replacement and time discontinuities restore a quiet baseline.

No FW, Wasm, sound, protocol or actuator path changed. The
[coin presentation contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#coin-presentation)
owns trigger/clock details and limitations; the [Web guide](../../../webxr/README.md)
describes **コイン / コイン1枚 → 振ってみる** and slow inspection.

Focused turnover tests **10/10 PASS**: source cadence/lifecycle, full face reversal,
no held-input retrigger or queued gesture, shipped production-Wasm shake for
both conditions, finite transformed-cylinder bounds and layer separation.
Actual Chromium/WebGL instance uploads confirm edge-on then reverse-face-up
poses for both production-Lab conditions, pause holding the exact matrices,
and reset restoring the front face. All four screenshots were inspected;
agent-browser also exercised single coin/shake without page errors. No device,
camera or audio was accessed during the browser check. Physical/phone handling
and perceived visual/tactile fit of the new turnover remain untested.

Review reproduced a shallow-vessel roof clip under sustained x/y velocity;
the original geometry test had made velocity zero after launch. Layout now
reserves full-turn headroom, and only decorative base rocking is attenuated
when its combined supports would exceed the roof. A sustained-velocity
regression covers floor/roof placement and several stack densities while
requiring the complete face reversal and layer separation.

Final verification: **296/296 Web tests PASS**, typecheck/production build PASS
with the existing bundle advisory. The final-build browser turnover/pause/reset
check passes for both conditions, plus a 412 x 915 viewport without horizontal
overflow. The initial full run exposed a missing single-coin name in its new
description; the label was restored before the passing final run. Documentation
links and whitespace check PASS; no firmware was built or uploaded this turn.

## Broad liquid speaker sound, 2026-09-07 — water timbre superseded

Historical evidence: water/hybrid synthesis below was subsequently judged
unnatural by the user and replaced by real recordings above. Solid/soda material
and source cancellation rules remain; the old sound tests are not proof of
the new recording's perceived naturalness.

The user requested a **ジャバジャバ** water sound. Liquid Foley contacts now
combine a broad low/mid water-body arrival, irregular wet folds/spray and a
short aerated tail. Water/hybrid lower the continuous wash and group dense
fresh contacts, discarding skipped accents rather than replaying them later.
The first browser check showed that production water shaking mainly reports
flow events, not impact events: energetic RollTrain/Scrape now selects the
broad slosh timbre too, while gentle movement keeps the shorter wet sample.
This is speaker voicing of existing events, not new firmware/visual contacts.

Solid-contact, pressure-pop and continuous-flow PCM are unchanged. The shipped
58-clip bank was regenerated (1,432,364 bytes); it remains locally synthesized
Foley, not recordings or AI-model output. No FW, Wasm, visual dynamics,
transport, actuator control or sound-enable defaults changed. The
[speaker contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#optional-speaker-branch)
and [Web guide](../../../webxr/README.md#speaker-sound) own implementation/use details.

Verification: full Web suite **285/285 PASS** before the final flow-timbre
mapping; the final affected sound/state/bank suites **32/32 PASS** and final
typecheck/production build PASS with the existing bundle advisory. Waveform
tests cover a sustained water body, quiet tail, sample-rate/seed/DC/edges and
unchanged solid/pop/flow PCM. Runtime tests cover strongest-contact grouping,
flow-event timbre, no autonomous accent clock, no delayed replay and cancellation
of longer tails. Perceived naturalness and phone acoustics still need listening;
software waveform checks do not establish those qualities.

Final Chromium/WebAudio check PASS: the production water shake plays the broad
slosh buffer, bank loading remains once-only, and pause/reset/mute/material
switching cancel without replay. Audio ran through a silent processing sink;
no microphone, external sound service, serial or USB calls occurred. Agent-browser
also checked the rebuilt Lab's water/shake controls with no page errors. No
hardware was accessed or flashed. Documentation links and whitespace check PASS.

## Visual-only solid depth, 2026-09-07

Following the user's explicit request to add a visual fore/aft axis without
changing FW, the shared marble, coin and single-coin renderers now add bounded
body-z motion from accepted orientation/acceleration. Marble rolling resistance
is lower than coin static/sliding friction. Returning level lets motion settle
where friction stops it, without a spring to the center. Compact staggered coin
packing leaves room for travel in both horizontal directions.

Reported x/y motion remains authoritative. Source timestamps advance this
presentation; pause/repeated samples hold it, and missing time, rewind or a
long gap establishes a quiet centered baseline. This does not add independent
coin bodies, 3D haptic contacts or sound events. Firmware, Wasm, protocol and
actuator/speaker paths are unchanged in this iteration. Implementation details
belong in the [visual contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#visual-only-solid-depth).

Verification: **278/278 Web tests PASS**, typecheck/production build PASS with
the existing bundle advisory. New tests check pitch sign, friction/settling,
10/30/60/120 Hz source cadence, finite bounds, unchanged x/y projection, and
pause/reset/source lifecycle. Real Chromium rendered all three production-Lab
conditions under positive and negative pitch, retaining zero C++ x motion and
contact counts for pure pitch; paused canvases stayed identical. Reset and a
412 x 915 viewport passed with no page/shader errors or serial, USB, camera or
audio access. Screenshots were inspected. No hardware was accessed or flashed;
actual phone performance and felt agreement of this extension remain untested.

## Foley sample revision and solid-axis clarification, 2026-09-07

The operator reported a synthetic "pitch-glide" quality in the speaker sound.
Water/pop frequency sweeps and rhythmic noise modulation were removed. New
locally authored Foley PCM uses short fixed inharmonic coin contacts, harder
marble taps, granular friction and broadband liquid/air-release textures.
Four variants per contact and quieter solid rolling/friction reduce repetition
and masking. This is procedural synthesis, **not recorded or AI-model-generated
audio**, and perceptual naturalness remains for the user to judge.

The player now uses a bundled 58-clip WAV bank (1.21 MB). Explicit sound ON
loads/decodes it once; material contacts read cached clips, without generation
or fetching at impact time. Loading failure stays OFF with a retryable error.
The existing source/event ownership, Stop/pause and output controls remain;
no firmware, motion model, transport or physical output was changed. The
[speaker contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#optional-speaker-branch)
and [Web guide](../../../webxr/README.md#speaker-sound) own generation/use details.

Verification: **264/264 Web tests PASS**, typecheck/production build PASS with
the existing bundle advisory. Checks cover exact generated-WAV/source agreement,
sample-rate conversion, short decay/DC/edges/variation, removal of the old
chirps and periodic modulation, lazy load/retry/cancellation and cached playback.
These waveform checks are not listening acceptance. The listening reel is
ignored `tmp/audio/foley-audition.wav` (coin, marble, sand, water, soda, hybrid).
Real Chromium/WebAudio with a silent sink passes one-time bank fetch/decode,
six Lab material gestures, gain control, pause/reset/material/mute/hidden-page
cutoff and no repeated soda opening on burst/spent resume. No third-party
audio, microphone, media playback, serial or USB calls occurred. The first
browser run waited for a now-collapsed diagnostic label; the harness was
updated to match the existing disclosure UI and the rerun passed.
Agent-browser also confirmed the rebuilt Lab, coin shake/pause and no page errors.
No device was accessed or firmware uploaded; actual phone audio quality/latency
has not been re-tested.

The user's solid-motion observation was also confirmed: Lab/connected state
owns body x/y, with no independent z travel or collision. Once resting on the
floor, coins and a marble therefore appear to move mainly along x. In the
shipped Wasm, neutral to +/-40-degree pitch for one second leaves the marble,
coin and single-coin conditions at position [0,-1], velocity [0,0], zero events.
Ordinary Preview has separate illustrative x/z motion; this is a source-model
distinction, not a WebGL limitation. That revision did not add visual z motion;
the subsequently requested presentation extension is recorded above.

## Continuous water revision, 2026-09-07

The operator found the previous water overlay visually disconnected. It has
been removed: broad surges and the surrounding drawdown now deform the same
free surface, while the body walls and wet boundary share its moving waterline.
Normal detail and floor caustics are quieter, with matched surface/body color
and reflection strength. FW, protocol, actuator parameters and the accepted
marble rendering are unchanged. The implementation and conservative tapered-wall
and reference-buoyancy limits are owned by the
[visual contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#integrated-material-presentation).

Verification: **251/251 Web tests PASS**; typecheck/production build PASS with
the existing bundle-size advisory. New checks verify actual mesh volume,
shared surface/wall seam, connected free-surface topology, crest plus drawdown,
wave-only wet-edge updates, and source freeze/reset. Review exposed a 16.39 mm
shape jump at a dominant-axis tie in an 80 x 120 x 50 mm test cavity. A narrow
smooth attenuation around the tie removes that finite discontinuity; the same
44.9999 to 45.0001 degree comparison now differs by 0.000279 mm. This is a
geometry regression, not a physical performance measurement.

`tests/browser-water.mjs` passes on the rebuilt served client: production-Wasm
shake, identical rendered canvas while paused, settling, fore/aft input,
412 x 915 layout, material switches and return to Preview. No page/shader errors
or hardware/camera calls occurred. Agent-browser inspection also covered the
changed waterline and calmer optics. Captures are in ignored `tmp/browser/`.
Actual Android performance and the revised visual/tactile fit await the next
user comparison; functional tests do not establish visual acceptance.
No device was accessed or firmware uploaded. Rejected overlay code/tests and
their comparison images were copied to ignored `tmp/water-overlay-baseline-*`
before removing that code from the active renderer.

## Rising and detached water presentation, 2026-09-07 (superseded)

Historical evidence only: the operator subsequently rejected the visual
cohesion of this version. The continuous revision above replaces its added
sheet/lobe implementation; the following checks describe the earlier version.

That visual update kept the shared Web stack and added source-driven
water sheets that lift, curl inward and return, with a small number of detached
stretched lobes. Accepted body acceleration now reaches both the water modes
and secondary detail before desktop placement drops its vertical component.
The Lab's **水 → 振ってみる** exposes the update without hardware. The base fill,
firmware model, protocol, actuator parameters and output authority are unchanged.
This is authored secondary motion, not a full fluid solver, general spilling,
exact total composite-volume conservation or new tactile landing events. The
owning implementation/limits are in the
[visual contract](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#integrated-material-presentation).

Verification: 252/252 Web tests PASS, including seven breakup tests and new
acceleration/source-freeze regressions. Typecheck/production build PASS with
the existing bundle-size advisory. A subsequent optical-only adjustment also
passes the five caustics tests. Geometry checks cover box, bottle and tapered
cup containment, tilted/inverted poses, rest/viscosity, pause/stale time,
rewind/gap, source replacement and resource ownership. Browser inspection
prompted rounded sheet shoulders instead of a straight hard-looking rim and
quieter floor caustics. Browser/phone-width checks are presentation evidence;
actual Android performance and the new visual/tactile fit need the next user
comparison. No physical device was accessed or firmware uploaded this turn.

`tests/browser-water.mjs` passed on that version's served build: production-Wasm
water shake, source-timed pause with identical rendered canvas, settling,
fore/aft input, 412 x 915 layout, material switches and return to Preview.
No page/shader errors or hardware/camera calls occurred. Agent-browser also
reviewed the raised water detail. Its comparison captures are retained in
ignored `tmp/water-overlay-baseline-*`; software-WebGL timing is not an Android benchmark.

## Demo screen UX cleanup, 2026-09-07

The operator requested less duplicate UI and clearer demonstration controls.
Preview now exposes its own Japanese-labelled material picker and hides the
unavailable device session controls. Connected mode exposes only the device
picker; Lab retains its own six choices and explicit output-free identity.
Duplicate phone-tilt and MR proxy buttons are removed, while their single
remaining actions and existing keyboard routing are retained. Details live
behind labelled disclosures instead of competing with the main actions.

Physical Start/Stop are direct HUD children outside the scroll region and
disclosures. Recovery remains visible outside settings; applied/pending/fault/
stale reporting and command sequencing are unchanged. Lab entry/exit restores
source badge and focus immediately, independent of the next render frame.
Sensor permission feedback stays visible; speaker errors/interruption open
their otherwise collapsed settings. The guide is owned by the
[Web README](../../../webxr/README.md#demo-controls).

Verification: 242/242 Web tests and typecheck/production build PASS (existing
bundle-size advisory). New structural regressions check exclusive source
wrappers, unique controls, pinned actions, exposed recovery and closed defaults;
Lab tests check immediate badge/focus restoration without hardware access.
Real-browser/mock-serial coverage passes connection, material/fill, keyboard
Start/Stop, delayed state, servo retry/recovery/restart and stale source, plus
exclusive visible pickers. At 390 x 844, Stop remains inside the HUD/viewport
and is the actual hit target after scrolling expanded settings to the bottom.
The first browser run exposed the test's fixed 150 ms sound-baseline assumption
under software WebGL; the successful rerun waits for completed animation frames
instead. This was test synchronization, not a new device or sound-model change.

Agent-browser and in-app review covered the ordinary screen, Lab material/
pause/details/return, Japanese preview selection and volume disclosure. A
412 x 915 viewport has no horizontal overflow; Lab return restores Preview and
focus to its opener. No page errors were observed. This is software/viewport
evidence, not new Android, assistive-technology or handled hardware acceptance.
No firmware, protocol or physical output changed; refresh the client to use it.

## Sharper soda opening trajectory, 2026-09-07

The operator requested a stronger tactile pop, specifically a more abrupt
contact-plane tilt. The installed firmware revision behind that judgment was
not identified. The new revision strengthens and shortens the existing
pressure-owned common cue, with faster opening-only command shaping and the
same weak vent tail. It does not increase vibration gain or change ordinary
material response, current/PWM, servo bus/profile, travel bounds or Stop.
Exact coefficients and the occupied-travel limitation belong in
[06](../../06_PARAMETER_MODEL.md#tilt-plane-branch).

The production-model regression compares the centered cue against its frozen
previous waveform/filter: after 20 ms, displacement is 1.6 -> 2.4 degrees;
after 40 ms, about 3.1 -> 4.4–4.6 degrees. Reaching 90% of the respective
target takes 76–90 -> 40–50 ms across 2/4/10 ms update intervals. New peak is
about 5 degrees. These are commanded trajectories, not measured servo speed
or proven tactile salience. A same-direction position already using the full
travel cannot receive another excursion; the tests retain that bound.

Verification: pressure/recoil 14 groups, coherent tilt 10 tests and synthesis
core 12 tests PASS under C++/Wasm, including the pressure-pop/Stop/reset path.
Sequential AtomS3 baseline/integrated builds PASS: RAM 45,668 / 70,772 B; flash
623,373 / 1,072,433 B. The initial firmware build exposed a C++11 aggregate
initialization incompatibility missed by the C++17 host test; explicit member
assignment corrected it before both successful builds. The rebuilt shipped
Wasm and affected Web suites pass 44/44, including actual-pop-phase attack
timing, one event, unchanged vent, reset and source/sound behavior.
Typecheck/production Web build PASS with the existing bundle-size advisory.
Browser verification of the served Lab confirmed soda selection, shake,
sealed -> burst -> spent, then reset to sealed and pause, with no page errors.
This checks the model/view flow, not the physical kick or sub-frame timing.

No device was connected, flashed or actuated in this iteration. AtomS3 must
receive this revision before its physical pop changes; refreshing the page
alone only updates the output-free C++ Lab. No StampC5 update is required.
One short handled soda comparison remains, alongside the previously deferred
servo/single-coin firmware work. Earlier positive physical evidence does not
establish this new trajectory's feel.

## Ice and coin presentation refinement, 2026-09-07

The operator subsequently reported weak ice appearance and sluggish coins.
The production coin model was not slowed: shipped Wasm, after a neutral
baseline with 2 ms steps, reached the wall at 20 degrees in 134 ms (coins) /
126 ms (single coin), and at 30 degrees in 110 / 104 ms. The old ordinary
preview equations instead took approximately 2.33 / 1.40 seconds at those
already-settled angles. Separately, the eight-coin fixed grid reserved most of
the visual footprint, compressing source x travel to about 10.1 mm end-to-end
in the 50 mm-wide box.

This Web-only iteration corrects those presentation issues:

- A compact shingled coin pile with bounded differential slip leaves about
  29.3 mm of x travel in that box. The one-coin condition stays one legible disc.
  Local-preview acceleration now uses SI units and actual travel, with short
  substeps, friction and a settling rebound. Preview vessel easing is time-based,
  preserving its 60 Hz response at other display rates. Device/Lab mass and
  events remain unchanged; their coin depth is still the reduced model's fixed
  depth, not newly simulated fore/aft content motion.
- Ice/water now composes shared water with a dedicated clear, rounded ice
  ingredient: four chunks at the default descriptor, frosted/internal details,
  instanced air pockets and partial submersion on the existing liquid plane.
  Pitch/roll use that surface rather than generic grain placement. Browser
  inspection caught internal-detail occlusion/grey opaque-looking cubes;
  depth-write removal and alpha/transmission compositing retain visible water
  and inclusions without pretending to provide recursive refraction. Opaque
  cube shadows were removed. Full geometry remains cavity-bounded.

The implementation and its illustrative packing/flotation limits are owned by
[31](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#coin-presentation) and
[ice presentation](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#ice-presentation).
No firmware, actuator settings, wire fields or device storage changed in this
iteration; no hardware was accessed. The prior single-coin/servo firmware
updates still need their separately deferred upload/handling.

Verification: 235/235 Web tests, typecheck and production build PASS (existing bundle
size advisory). New regressions cover prompt coin arrival and settling at
30/60/120 Hz, source/stale consistency, complete coin/ice bounds, partial
submersion under pitch, resource disposal and the unchanged accepted marble.
Agent-browser/Chromium checked actual WebGL before/after, ice/water material
selection, tilted preview and reset, plus both production-Lab coin conditions
with keyboard tilt/shake/pause. Desktop and 412 x 915 layouts rendered without
page/console errors. This is browser viewport/software evidence, not a new
Android or physical visual/tactile acceptance. Refresh the built client to try it.

## Optional speaker sound, 2026-09-07

At the user's request, the Web presentation now adds independently enabled
speaker effects: metallic coin contacts, short hard-body taps, granular friction,
liquid motion and the soda opening/vent. Initial state is OFF with local volume
35%; nothing constructs/unlocks WebAudio until the user presses **効果音をON**.
This speaker control neither enables nor changes the four haptic transducers.
It needs no new firmware, radio layout, downloaded sample or microphone access.
The older single-coin/servo changes still await their separate AtomS3 update.

The connected source uses actual live motion and cumulative/latest event
telemetry; it does not recover every contact missed between radio snapshots.
The Lab uses production C++ events, while ordinary preview remains an explicitly
approximate source. Deduplication suppresses retained events on source entry,
mute/pause resume, rewind and reconnect. Soda opening additionally follows the
reported burst sequence. Flow is excited by motion/flow/venting, not static
residual energy. The architecture/limits are owned by
[31](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#optional-speaker-branch), with
controls in the [Web guide](../../../webxr/README.md#speaker-sound).

Browser testing found that waiting for the next WebGL frame delayed the acoustic
cutoff on heavy sand rendering. Lab pause/reset/material/close now signal
speaker silence synchronously; stopped/invalid device notifications and page
hiding do likewise. Continuous sound also expires after 260 ms without a new
source sample. This changes only the speaker branch, not actuator stop policy.

Verification: 226/226 Web tests and typecheck/production build PASS (existing
bundle-size advisory); modified documentation links and diff check PASS.
Waveform/state/player checks cover bounded distinct PCM, source/event dedup,
unlock failure/retry, pool limits and prioritizing the opening pop over dense
ordinary contacts. The shipped C++ soda model produces one acoustic opening
candidate followed by its shared spent state. Browser checks used:

- agent-browser/Chromium for default OFF, explicit unlock, meaningful WebGL/UI,
  and 412 x 915 controls; no page/console errors.
- Real Chromium WebAudio graph processing with a **silent sink**, not speakers:
  all six Lab gestures, volume change, pause/reset/material/mute/hidden-source
  cutoff, context reuse and soda burst/spent pause-resume without another pop.
  Quarter-speed under SwiftShader was too slow for the browser wait, so the
  focused soda check ran at normal model speed; this was not a phone performance
  measurement. The startup/control checks and focused soda rerun both passed.
- Mocked serial for explicit sound enable while Idle (no output commands), one
  reported Live hit without repeating its retained event, Stop cancelling old
  sound and the existing material/servo recovery flows. No physical USB involved.

This is authored sound synthesis and software integration, not a listening
acceptance or real-phone speaker/latency measurement. The earlier positive
phone report predates this addition. No hardware was accessed or flashed.

## Phone report and coin/keyboard iteration, 2026-09-07

The operator reported: **「スマホでも動作検証出来ました！いい感じですね」**.
This follows the existing Android ordinary-screen/StampC5 setup and QR handoff.
It establishes a positive real-phone use report, not a measured frame-rate
benchmark or itemized coverage of every material, Stop and reconnect. Phone
model/browser version were not recorded. It predates the coin/keyboard changes
below and does not verify the unflashed servo fixes.

Delivered in this iteration:

- Coin rendering now uses legible minted discs with finite thickness and
  reserved footprints/layer clearance. It no longer reuses a collapsing grain
  cloud or flips orientation through `atan2(velocity)` at rest. Device/Lab
  presentation is deterministic from reported position/velocity; only the
  ordinary local preview integrates sliding. Several displayed coins are
  illustrative, not individually simulated rigid bodies; see
  [visual ownership/limits](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#coin-presentation).
  The accepted marble renderer is unchanged.
- `granular_single_coin_box` is a separate builtin plus JSON/Web/production-Wasm
  preset. Its sparse single-inclusion path produces the existing WallHit events,
  retaining the coin gains; effective content mass is 5 g. Parameter ownership
  is in [06](../../06_PARAMETER_MODEL.md). Lab now offers six materials, including both
  coin conditions. Real-device selection needs the next AtomS3 upload; old-FW
  rejection leaves the actually applied material intact and explains the update.
  No wire layout or StampC5 update is required.
- Exhibition keys reuse existing controls and command sequencing: Enter starts
  explicitly, Escape stops, digits/brackets choose materials. Lab additionally
  has tilt/shake/reset/pause keys. Field editing, IME and repeats do not trigger
  global actions; Escape remains available while editing. The exact mapping and
  focused-button behavior are in the [Web guide](../../../webxr/README.md#keyboard-controls).

Software verification: 203/203 Web tests PASS, including minted geometry,
single-coin model/reset/event coverage, partial-row bounds/non-overlap,
stale-state determinism and keyboard modes. Typecheck/production build PASS
(existing bundle-size advisory). Rebuilt production preview Wasm. Sequential
AtomS3 baseline/integrated builds PASS: RAM 45,668 / 70,772 B; flash
623,249 / 1,072,329 B. No hardware was accessed, flashed or driven in this
iteration; single-coin feel and the earlier servo fixes remain to be handled.

Browser checks: agent-browser/Chromium rendered both coin conditions in the
C++ Lab, exercised material/tilt/shake/reset/pause keys, and inspected desktop
and 412 x 915 layouts without page/console errors. The key reference is collapsed
by default to leave room for phone controls. A separate mocked-serial browser
run verified focused/global Enter Start, Space suppression on the Start button,
Escape Stop with selector focus during servo retry, and the existing
switch/recovery/stale-link flows. This is software-browser evidence, not a new
phone or physical USB result. Captures are ignored under `tmp/browser/`.

## Material-switch servo fix, 2026-09-07

The operator reported several exhibition interruptions requiring a restart:
servos had been moving, then apparently only servo communication failed at
the instant of changing demo/material. Continued vibration/visual operation
and the exact on-device fault code were not captured. This is an observed
failure to address, not a new general safety qualification requirement.

A matching software defect was reproduced against `f7e1944`: Stop cancels an
incremental health read, but its late 7/31-byte status can arrive during the
one-byte torque-OFF readback. The synchronous reader accepted a longer payload
as that readback. A nonzero first byte caused Stop to fail and latch
`Communication` despite a fresh OFF reply queued behind it; Start then refused
the latched fault. Synchronous Ping/Read/Write-ACK matching now requires the
exact decoded response length, skipping unrelated replies within the existing
timeout. The corrected reproduction reaches `ReadyTorqueOff` with no fault.
The negative case (stale zero-valued health response without a fresh readback)
still reports failure/unknown feedback. No timeout, output strength/bounds or
automatic fault-clearing/arming policy changed in this first fix. The later
bounded live retry is a separate, explicitly requested policy change below.

The existing Stop -> clear fault/UART preflight -> get state operation is now
exposed as **停止してサーボ復帰**, outside the collapsed client settings. Fault
text points to it and then to a separate explicit Start. A rejected recovery
keeps its error detail; recovery alone does not enable either output branch.

Checks at this first corrected-source checkpoint (before the live-retry change):

- 12 fake-UART C++/Wasm groups PASS, including delayed replies, Stop -> material
  configure -> explicit arm, and real missing-reply fault -> failed clear while
  unavailable -> fresh explicit clear (OFF) -> deliberate arm. No hardware UART
  is involved in these tests.
- 173/173 Web tests PASS; typecheck/build PASS. The existing bundle-size
  advisory remains. Recovery tests cover rejection/retry, duplicate actions and
  priority Stop during an in-flight recovery.
- Sequential AtomS3 baseline/integrated builds PASS: RAM 45,628 / 70,716 B;
  flash 623,137 / 1,071,449 B. StampC5 and the wire schema are unchanged.
- Chromium with SwiftShader and mocked serial checked material-change fault
  guidance, visible recovery with settings closed, failed recovery then retry,
  remaining Idle/OFF until explicit Start, plus existing material/fill/refresh
  and stale-link behavior. No page errors. Desktop/narrow captures are local
  ignored files under `tmp/browser/`; this is not phone or physical USB evidence.

The delayed-response defect matches the report, but no incident trace proves
it caused every exhibition interruption. Same-ID/same-length old replies
cannot be distinguished by length matching. No hardware was accessed or
flashed in this fix session; one affected handled switch/recovery check remains
in [08](08_ACTIVE_PLAN_SNAPSHOT.md#0-close-the-reported-material-switch-servo-fault).

## Brief servo-link recovery, 2026-09-07

At the operator's subsequent request, the assembled profile now tolerates a
brief local servo-bus interruption during Live. The bounded recovery policy is
owned by [04](../../04_HARDWARE_AND_PIN_SPEC.md#brief-live-dynamixel-interruptions):
500 ms from the first observed failed transaction, one UART-only restart,
continued model/vibration and fresh feedback from both servos before recovery.
Generic defaults remain unchanged. Explicit Stop and confirmed actuator/source
faults still cancel recovery; this is not automatic rearming after a latched stop.

The client distinguishes **サーボ通信を再試行中** from a latched fault, leaving
Stop available and rejecting duplicate Start. Its display returns to Live only
from fresh device state; the host sends no automatic recovery/Start commands.
The combination uses existing wire fields described in [05](../../05_INTERFACE_SPEC.md);
StampC5 does not require an update.

Software checks on this revision:

- 22 fake-UART C++/Wasm groups PASS: 150/300 ms interruptions, sustained or
  one-sided loss, TX backpressure, Stop throughout UART-restart phases, retained
  homes/latest bounded goals, watchdog expiry, physical/source faults and clock
  rollover. A review regression reproduced stale partial-sample reuse after a
  later missing reply; restarting that sample now passes without extending grace.
- 180/180 Web tests, typecheck and production build PASS. Chromium/SwiftShader
  with mocked serial verified retry -> Live without host commands and retry ->
  explicit Stop without automatic restart, plus existing manual-recovery,
  material/refresh/stale-link flows. No page errors; no physical USB involved.
- 8 resolved-telemetry C++/Wasm groups and both schema scripts PASS; the retry
  state survives existing v2/v3/v4 layouts without new wire fields.
- Sequential AtomS3 baseline/integrated builds PASS: RAM 45,668 / 70,772 B;
  flash 623,173 / 1,072,249 B. StampC5 was not rebuilt or flashed.

No hardware was accessed or flashed. Physical continuity, actual driver recovery
timing and the feel of catching up to the current target remain unverified;
the focused handled check is deferred in [08](08_ACTIVE_PLAN_SNAPSHOT.md#0-close-the-reported-material-switch-servo-fault).

## Integration verification, 2026-09-07

The Lab now calls the same `HapticSynthesisCore` as `HapticPipeline`; a fixed-size
current-event array supplies its existing C ABI without duplicating production
composition. Leaf mathematics, actuator defaults and the accepted control law
are unchanged by this integration. Pure visual-state adapters carry v4 state
and source time into the reusable liquid/particle renderers. Rich water/soda
optics coexist with remote vessel styling and desktop recovery/framing.

The Lab shake now enters the common bounded desktop acceleration cue after
orientation, instead of writing a position overwritten by desktop placement.
It uses model elapsed time, so quarter-speed and pause preserve timing; Reset
explicitly clears the previous positional cue instead of slowly recentering it.

| Merged-source check | Result |
|---|---|
| Web client | 168/168 tests PASS with serial test execution; typecheck and production build PASS; existing large-chunk advisory remains |
| AtomS3 baseline | Build PASS; RAM 45,628 B, flash 623,137 B |
| Integrated AtomS3 tilt/radio | Build PASS; RAM 70,716 B, flash 1,071,441 B |
| Synthesis core, C++/Wasm | 12 groups PASS, including 61,521 full-frame comparisons |
| Existing layers / codec / pressure-recoil | 23 / 7 / 11 groups PASS under C++/Wasm |
| Schema fixtures | Both schema scripts PASS, including 21 malformed v3/v4 cases |
| Lab composition parity | 9,600 complete old/new Wasm JSON snapshots byte-equal through material, reset and gap cases |

Firmware builds ran sequentially. The C++ tests used the installed Unity
Emscripten fallback, not native Windows or hardware execution. The expanded
parallel Web run reproduced the existing wall-clock discovery-test sensitivity
under renderer-test load; `npm test` now runs files serially, without changing
the transport timeouts or weakening assertions.

Chromium/Playwright checked normal preview with Start disabled, marble, retained
sand after tilt/return (about -5.3 mm model CG), two-axis water and pause, soda
sealed -> burst -> spent -> reset, 390 x 844 framing, and return from Lab to
preview. The first default-GPU attempt reported context warnings and timed out
before the model had reached burst. A final-renderer-build repeat with explicit
SwiftShader and a longer observation window completed with no JS errors,
warnings, failed assets, live-scene context loss or hardware API calls. This is
desktop software-rendered browser evidence, not Android/GPU performance or
tactile validation. Captures/report are local ignored artifacts under
`output/merge-verification/`. The subsequent immediate positional-reset fix is
covered by the final controller regression/build above.

No serial/USB hardware was accessed, no image was uploaded to either device,
and no new tactile acceptance is claimed.

## Capability and evidence

| Capability | Established | Remaining limitation |
|---|---|---|
| Shared haptic pipeline | Coherent Mass/contact/Event, Texture, Resonance and Spatial4; existing marble/sand handled together with tilt; opt-in pile/soda implemented; latest post-flash handling positively assessed | Fine material tuning; latest report does not itemize every preset |
| Tilt-plane output | Useful strength and relative directions accepted; filtered common-position plus dynamic-CG/inertia commands | CG/reference-angle semantics and perceptual tuning; not an absent dynamic-CG subsystem |
| StampC5 link | Bidirectional commands/telemetry, resolved-state v3, execution ACK; v4 pile/pressure state received from deployed pre-kick firmware in output-OFF model runs; subsequent phone use positively reported | Exact phone model/browser and per-material/Stop/reconnect coverage not itemized; camera concurrency only needed for optional AR |
| Shared desktop/phone visual client | Applied preset/fill/dimensions, Start/Stop, visual/felt agreement; richer materials and C++ Lab; desktop and subsequent phone use positively assessed; coin/keyboard improvements software-checked | New coin handling and fine visual/tactile tuning; full studio/A-B/save not implemented |
| Quest client | User confirmed WebUSB applied state and MR container/panel visibility | MR handling/recovery not passed; VR work deferred |
| Stop/recovery | Earlier combined run verified Idle/audio OFF and both torque-OFF readbacks; desktop reconnect stayed OFF; reported material-switch fault has the software fix above | Corrected FW upload and focused handled check remain; historical success is not evidence that exhibition recovery is resolved |

Ordinary-screen phone use has a positive report; tracked Android AR remains
unimplemented. Passing builds or separate component tests are not an
end-to-end handling result for subsequent changes.

## Desktop visual pass, 2026-09-06

This is the remote branch's pre-integration visual pass and verification.
At the user's request, the visible defects were addressed before resuming the
studio work. The client now keeps a rotated vessel above the desktop, uses a
small bounded acceleration translation cue with a stable camera anchor, and
renders liquid as a wall-constrained volume with a gravity-referenced surface.
Box bevels, bottle shoulder/neck/cap, cup rims, material finishes and the stage
were revised; old wood/grid/cables and front labels were removed. The marble's
sphere, radius, color, roughness and reported-position mapping are retained.

Implementation semantics and display gains are in
[the visual architecture](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#desktop-visual-pass-2026-09-06).
Acceleration translation is a filtered presentation cue, not position tracking.
Liquid shape illustrates aggregate state; it is not exact FW CoM reconstruction.
At this revision, sand/ice remained representative device-driven instances,
with no connected particle packing, avalanche, independent buoyancy or overflow
simulation. The local opt-in pile/soda and rich liquid additions below extend
that revision; they do not add individual-grain packing or independent buoyancy.

Validation for this pass:

- 91/91 client tests PASS; typecheck and production build PASS. The existing
  Vite large-chunk advisory remains (main bundle about 699 kB, 185 kB gzip).
- Geometry regressions cover empty/full and near-empty/full liquid, sideways
  and inverted poses, inner-wall constraints, non-degenerate sideways UVs,
  rotated cap/rim clearance, round-vessel preview particles, bounded/no-drift
  acceleration, stable camera target and preserved XR translation.
- Local Chromium/Playwright rendered 23 desktop/narrow cases (1440 x 1000 and
  390 x 844): 20 material/shape/source cases plus three direct synthetic geometry
  checks for sideways, inverted-full and empty liquid. A separate synthetic
  acceleration step moved the container 4.09 mm in x while the camera stayed
  fixed. Real preview preset and stimulus controls were also exercised.
- Stale device transforms, liquid vertices, particle instance matrices and
  texture phase stayed exactly unchanged for all four tested materials. Raw
  WebGL RGBA checks allow tiny raster variation (at most 0.1% changed channels
  and mean absolute difference below 0.005 on the 0–255 scale); the final run
  observed at most 0.0315% changed channels and maximum channel difference 5.
  Strict byte-identical PNG/pixel rendering is not claimed.
- No JavaScript errors, failed assets, WebGL context loss, DOM overflow or
  browser warnings were reported. Geometry/texture counts stayed constant
  across 12 material switches. Preview and connected screenshots were inspected.

The harness blocks every hardware operation by intercepting HapticLink in the
browser; captures, diagnostics and the report are local ignored artifacts in
`output/playwright/visual-refresh/`. No firmware/protocol/default actuator settings were changed;
no hardware commands, uploads or handling tests were performed. Prior desktop
physical evidence remains valid for its tested revision, and no new tactile or
Android/XR acceptance is claimed for this visual pass.

### Gentle positional recovery follow-up

The connected desktop acceleration cue now uses elapsed device time for a
weaker quiet-input return, while retaining responsive motion onset. Timing and
gap/restart rules are recorded in [31](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#desktop-visual-pass-2026-09-06).
Held pitch/roll remain gravity-referenced; the initial orientation is not an
automatic levelling target. No firmware or local-preview dynamics changed.

93/93 client tests and production build (including typecheck) PASS. New checks
cover recovery at 5/10/20 Hz, sustained tilt, repeated timestamps, uint32 wrap,
restart/gap timing, and a stale view held partway through return. A focused
synthetic Chromium run retained 4.9787% of the quiet-input offset after 2.4 s,
kept the held roll at 0.500000095 rad for a 0.5 rad input, kept the camera fixed,
and held position/pose exactly on stale telemetry. No hardware calls, JS errors,
missing assets or context loss occurred. The run did emit a WebGL shader
constant-precision warning; the existing Vite large-chunk advisory remains.
Local screenshots and the report are in `output/playwright/recenter/`.
This is software evidence, not a new physical/tactile acceptance result.

## Implemented software checkpoint

- Opt-in coherent motion/contact engine: physical acceleration scaling, static
  support, pre-bounce impacts, distance-based flow and wet-liquid voicing.
  Empty contents stop content events; FlowRipple envelopes and spatial weights
  share this state.
- The complete tilt command, including its position-based cue, is bounded,
  filtered and slew-limited. Content CG is material-scaled and combined with
  shell CG before torque calculation. Current useful output authority is retained.
- Incremental DXL runtime reads replace blocking feedback transactions. Failed
  Stop readback remains unknown; pending fault torque-off retries do not block.
  A nominal 10 ms goal period is not proof of a measured fixed update rate.
- Radio v3 carries resolved material, dimensions, fill and model flags in a
  230-byte snapshot. StampC5's enlarged JSON workspace is static, fixing the
  observed loop-task-stack restart. The gated material effects add optional
  250-byte v4 pile/pressure state; older versions remain supported.
- The dedicated full-demo target sets HAPTICS_DEMO_ESPNOW_AUTOSTART=1: after
  successful initialization it enters Idle/output OFF and starts the radio.
  Generic builds retain default-OFF/manual activation.
- The connected client uses actual resolved dimensions and device content state;
  corrected pitch/roll mapping matches the measured downhill direction. Stale
  or disconnected motion freezes rather than continuing a preview animation.
- MR lifecycle/panel handling, selected-right-hand position following and
  transient discovery recovery are implemented. Orientation remains IMU-owned.
  Successful explicit state refresh clears a stale pending preset selection;
  refresh/reconnect do not replay a preset or enable output.

Hardware/frame/default details belong in [04](../../04_HARDWARE_AND_PIN_SPEC.md);
protocol and parameter semantics belong in [05](../../05_INTERFACE_SPEC.md) and
[06](../../06_PARAMETER_MODEL.md). In particular, existing preview controls and trial
recording are not the planned real-device tuning studio.

## Reuse refactor and interaction research, 2026-09-06

Started from current `origin/main` at `e007885` after fetching remote state.
The previously created explanatory site/CAD/film work was preserved. This was
a software/refactoring and design-research session; no upload, serial access,
actuation or new physical handling result was produced.

**Firmware:** extracted the existing deterministic layer composition and
parallel tilt model into `HapticSynthesisCore`. It accepts body-frame IMU/time
and applied settings, returns a fixed-size synthesis frame and explicit
Disabled/Submit/Hold/FaultNeutral tilt intent, and performs no dynamic allocation
or physical I/O. Runtime stale deadlines, faults, Stop, calibration overrides,
manual diagnostics, telemetry and physical dispatch remain in `HapticPipeline`.
Content formulas, protocol, remote allowlist and defaults were not changed.

**Visuals:** separated accepted-state adaptation from THREE/DOM and split
container geometry, liquid and particle renderers. Hybrid composes those same
ingredients. Fixed owned GPU-resource disposal and cross-scene texture state.
Two observed defects were also corrected: fresh configuration arriving before
mass no longer leaves the connected scene in preview simulation; tilted
containers now fit narrow desktop canvases above the HUD. Neither fix adds
Android AR support or a new material model.

| Verification | Result |
|---|---|
| AtomS3 audio baseline | `m5stack-atoms3-pipeline` PASS; RAM 45,340 B, flash 616,941 B |
| AtomS3 integrated output/radio | `m5stack-atoms3-pipeline-tilt-espnow-monitor` PASS; RAM 70,436 B, flash 1,064,869 B |
| Native leaf regressions | 23/23 PASS |
| New native synthesis suite | 9/9 groups PASS; 56,921 full-frame comparisons with frozen old orchestration and 600 additional invalid-time continuity comparisons |
| Web client | 87/87 tests, typecheck and production build PASS |
| Renderer equivalence | 18 preview/device scene combinations preserved geometry, particles and transforms exactly before the distinct authority/framing fixes |
| Actual client WebGL | 16 reviewed desktop/narrow captures; synthetic stale state freezes pixels; new mass changes pixels; GPU counts stable over 12 material changes |
| Explanatory sketch model | 8/8 tests PASS, including 30/60/120Hz replay equality, attachment/release, depletion/silence, recovery and catalog citation integrity |
| Atlas browser | Three transitions, pause/step/reset, four capability filters, deep links, research links, JSON download, reduced motion and 1440/768/390/320 layouts PASS |
| Existing explanation | Material controls, keyboard flow, real CAD load, 109.37s video playback/seek, captions and mobile layout PASS |

The firmware builds ran sequentially and produced no compiler warnings. The
native legacy suite still emits the existing protocol `-Wclass-memaccess`
warnings. Browser builds retain their large-bundle warnings; Chrome reports
the existing `PCFSoftShadowMap` deprecation/fallback warning. No JS errors,
failed local assets or WebGL context losses were found in the reviewed flows.

The registry download stalled; exact pinned M5GFX 0.2.28 was recovered from
official tag commit `d91077b9a607b59404e4e4a49f775c792bfae382`. All 294 files
matched official Git blob hashes. M5Unified 0.2.13 and ArduinoJson 6.21.6
remained unchanged. No dependency pins were relaxed. Logs and provenance are
local ignored files in `output/refactor-session/`; visual evidence is under
`output/playwright/` and `output/explainer-qa/`. Reproduction commands and
contracts are in [07](../../07_TEST_AND_VALIDATION.md) and references
[30](../../reference/30_REUSABLE_FIRMWARE_CORE.md),
[31](../../reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).

**Research/design deliverable:** 14 primary works audited, 12 proposed demos
mapped to hardware conditions (3 presentation, 6 software, 2 tracking, 1
mechanical/sensing). Each has an explicit first falsifiable comparison.
The independent atlas has three interactive illustrative scenarios: attached
cargo, draining grains and a waking capsule. They have no device transport and
do not constitute firmware implementations or perceptual results. Full scope
and source-access limitations are in references
[32](../../reference/32_INTERACTION_DESIGN_SPACE.md) and
[33](../../reference/33_INTERACTION_RESEARCH_SOURCES.md).

The atlas is published to the existing owner-only explanatory site at
[/atlas](https://fresnel-inertia-explained.hatodove.chatgpt.site/atlas). An
authenticated HTTP check returned 200 and the validated entry script. All
interactive browser checks above ran against the matching local build.

## FW model research, 2026-09-06

The requested exploratory review is recorded in
[FW physical-model research (Japanese)](../../reference/34_FW_MODEL_RESEARCH.md).
It combines a read-only audit of the current coherent path with primary
literature, analytic examples, algorithm tradeoffs and falsifiable tuning
comparisons. It distinguishes physical properties, dynamic state, perceptual
gains and device compensation, and identifies inactive controls and historical
assumptions in reference 17. Source-access limitations are recorded in the report.

The audited code was the remote pre-integration revision. Proposed contact
timing/impulse fields, mobile/static grain exchange, physical liquid modes,
modal synthesis and optimization workflows were not implemented by this
research. The local reduced pile and presentation-only liquid modes below are
distinct from those fuller proposals. This research turn
changed documentation only; it did not build or upload firmware, use device
ports, actuate hardware, or add physical/perceptual evidence. The existing
work priority is now the fine-tuning direction in 08.

Documentation checks passed: 102 local links across the six touched documents,
the new report's table/fence/encoding and whitespace checks, tracked-document
diff whitespace, and analytic example calculations. Independent reviews of
the code/physics, synthesis and perception/tuning sections were incorporated.
## Software-only material iteration, 2026-09-05

The operator is away from the hardware. This iteration did not open a serial
or USB device, upload firmware, change device storage, or command actuators.
The existing physical observations below refer to the earlier firmware.

- The explicit **実機なしラボ** / `?lab=1` compiles the production C++ layers
  to Wasm. Synthetic body-frame roll/pitch and shake drive the model; returned
  mass, events, channel envelopes and tilt commands drive the visual/debug UI.
  This is not a second JS physics engine and cannot connect to hardware.
- New pile dynamics preserve a constant-volume sand slope/centroid below static
  friction and yield under sufficient tilt/agitation. The Lab's sand opts in
  explicitly and can disable the gate for comparison. The existing physical
  sand preset is unchanged; `granular_sand_pile_box` selects the new behavior.
- `liquid_soda_bottle` accumulates an authored charge, emits one `PressurePop`,
  vents with diminishing remaining content, and stays spent until reset/reload.
  It is a stylized sealed-container effect, not thermodynamic pressure or a CFD
  solver. Both visual and haptic voicing consume the same pressure state.
- Contained liquid volume/free-surface geometry follows gravity inside the box;
  the sand bed uses the shared pile slope. Foam, grains and spray are visual
  realizations of aggregate state, not separately simulated physical contents.
- Optional 250-byte v4 telemetry carries pile/pressure state with CRC; regular
  operation stays v3. The bridge retains v1-v3 decoding. New presets require
  updating both firmware images before physical use; neither has been uploaded
  in this iteration. Idle/configure can still report v3 until new-model updates.
- The accepted servo strength and existing material-scaled/filtering model are
  retained. The geometric pile centroid is not the same quantity as voiced tilt
  CG; three-dimensional haptic dynamics and measured grip force remain absent.

Software checks for this iteration:

- Web regressions 105/105 PASS; final focused renderer/Lab/production-Wasm
  rerun 27/27 PASS. Typecheck and production build PASS. Wasm is generated from
  the current production source; the ordinary Web build needs no SDK.
- C++/Wasm: granular pile 8, coherent container 8, generic layers 23 and
  pressurized content 5 groups PASS. V4 codec 7 groups and schema valid/invalid
  fixtures PASS. These are software results, not native or physical execution.
- ArduinoJson full serializer bodies (USB, Recorder, Remote and bridge) tested
  with 32-bit slots and maximal representative state: no 3072-byte overflow or
  truncation compared with a larger document. No workspace-size increase needed.
- Actual in-app browser: sand at +50 degrees then level retained a visible
  slope and about -5 mm model CG offset; liquid waterline stayed gravity-aligned;
  soda charged, visibly sprayed and settled. Pause/reset, closing/reopening the
  Lab and 390x844 responsive layout checked. Final assets reported no JS/shader
  errors. This is not an Android phone performance or USB/camera check.
- AtomS3 baseline and integrated tilt+ESP-NOW firmware builds PASS after fixing
  a C++11 aggregate-initialization incompatibility; model mathematics unchanged.
  Isolated-cache StampC5 bridge build also PASS. No images have been uploaded.
- Documentation link check: 193 local links across 37 Markdown files PASS;
  whitespace diff check PASS.

The existing large-Vite-chunk warning remains; it is not a measured mobile
performance failure. No new tactile pass is inferred from these checks.

## WebGL visual follow-up, 2026-09-05

The user requested richer liquid and carbonation visuals, accepting an ordinary
phone screen instead of requiring AR. The rendering/Lab follow-up implements:

- Procedural studio reflections and a WebGL backdrop that transmission can
  actually sample, refractive/absorptive water with a linear normal-data map,
  a wet contact lip following the exact shared waterline, and approximate
  caustics clipped to submerged floor regions. These are authored optics,
  not ray-traced light or a new fluid solver.
- A continuous foamy soda jet, rounded irregular crest and four asymmetric
  liquid sheets; smaller elongated spray is secondary detail. Pressure phase,
  time, charge and remaining content own the effect; stale/paused state freezes it.
- Lab-only quarter-speed playback, default OFF, that slows synthetic inputs,
  the C++ model and display together. No actuator-speed control is added.
  Phone framing reserves burst headroom without a mid-burst camera zoom.
- Bounded reusable geometry and release of per-preset optical materials,
  textures and instance buffers; shared baseline materials/grip are retained.

Shared C++ models, generated Wasm, wire formats and firmware were unchanged in
this follow-up. No hardware access, upload or tactile verification occurred.

Verification: typecheck and production build PASS; full Web regressions
125/125 PASS with `--test-concurrency=1`. The first concurrent run had one
failure in the existing short wall-clock discovery-retry test under load;
isolated link tests 27/27 and the final serial full suite passed. Link code was
not changed to hide that timing sensitivity. The pre-existing Vite chunk-size
warning remains; actual Android GPU performance is not established by a build.

Final optical-coefficient adjustment: focused renderer regressions 27/27 PASS.
The actual in-app browser verified water reflection/transmission and combined
roll/pitch, retained marble display, normal-speed soda sealed -> burst -> spent
-> reset, and quarter-speed/pause inspection. At 390x844 the reserved framing
keeps the grown jet above the controls and inside the viewport; controls scroll
within their panel. Final assets emitted no JavaScript or shader errors/warnings.
This responsive browser check is not an actual Android device performance test.
Documentation local links resolve and whitespace diff check PASS.

The reported sand front/back limitation remains: its retained pile has a dy/dx
slope only. The WebGL polish does not add a dy/dz deposit or independent fore/aft
content dynamics; the shared-model extension is tracked in [08](08_ACTIVE_PLAN_SNAPSHOT.md).

## Presentation-only water dynamics, 2026-09-05

Following the user's request to enrich visual water motion independently of the
firmware model, the shared renderer now adds two-axis bulk lag/overshoot and six
damped surface modes. Resolved dimensions, fill and viscosity affect the visual
response; pitch changes can excite waves even when the body-x/y haptic model
reports no activity. This is bounded presentation detail, not CFD, reported
physical CoG or a new haptic-state owner.

The source snapshot time advances the response. Pause/repeated timestamps freeze
geometry and highlights; first samples, time rewind and long recovery gaps rebase
quietly. Missing time uses a static fallback. Wave edges stay on the waterline;
mean correction and global compression preserve mesh volume and wall bounds,
with smooth shared surface normals. Optical flow follows the visual response.
The Lab water shake is a wider 1.35 Hz input; other materials retain 5 Hz. The same
synthetic input drives body motion and the production model; quarter-speed playback
still slows the complete sequence.

Firmware, Wasm, wire formats and actuator control are unchanged. No hardware was
accessed and no new tactile agreement is claimed. Verification: production build
(including TypeScript) PASS and all 144 Web tests PASS. Final-build browser checks
confirmed pitch-only visual response with zero model activity, broad water
run-up/return, quarter-speed inspection, and normal-speed settling after shaking.
The 390x844 viewport retains the full container above the scrolling controls;
no JavaScript or shader errors/warnings were recorded. This is a responsive
browser check, not an actual Android device performance or tactile test.

## Soda common-mode recoil increment, 2026-09-05

The requested soda opening kick and weaker vent tail now enter the existing
common-force branch from shared pressure state. The authored negative-body-Y
cue, source-phase timing and fixed coefficients are documented in
[06](../../06_PARAMETER_MODEL.md). Existing signs, bounds, filters and slew remain;
CG, pressure evolution, generic behavior and other materials are unchanged.
The existing `common_force_n` includes the cue; no parameter, telemetry field
or wire-format change was added, so the StampC5 image needs no update for it.

Software verification: C++/Wasm pressure/recoil 11 groups and coherent-tilt
10 groups PASS; baseline and integrated AtomS3 firmware builds PASS. Production
Wasm was regenerated; the Web build and 45 focused Web tests PASS. An isolated
as-built model test reached a 4.571-degree common command peak, not a measured
servo displacement or a tactile result. The rebuilt Lab was browser-checked
through sealed -> burst -> spent, quarter-speed pause/hold, normal-speed
settling and reset; no JavaScript/shader errors or warnings were recorded.

The integrated AtomS3 image was uploaded through COM3 with flash hash
verification. StampC5 was not changed. The post-boot check reported Idle,
audio OFF/silenced and tilt disabled; `liquid_soda_bottle` was selected while
stopped. Both servos had a communication fault/no valid boot readback, and
a subsequent non-actuating PING received no bytes from either ID. Only AtomS3
was enumerated; StampC5 was absent and the radio unpaired. External power/link
restoration was requested, but the user explicitly deferred further hardware
work and ended this session at upload. No actuator-on command or handled kick
test occurred. Local boot capture: `tmp/bench-soda-recoil-boot-20260905.txt`
(ignored). Next time restore/check the actual connection and servo response,
then make one short soda comparison. Do not infer current power/output from
this snapshot. The following deployment and positive handling evidence belong
to the pre-kick baseline.

## Baseline firmware deployment and output-OFF checks, 2026-09-05

On the user's return, the then-current pre-integration AtomS3 target
`m5stack-atoms3-pipeline-tilt-espnow-monitor` was built and uploaded through COM3.
The then-current `m5stack-stampc5-espnow-bridge` was built and uploaded through COM4
using its isolated pioarduino package store. Both uploads completed with flash
hash verification. Device storage was not formatted or replaced. The latest
presentation-only water changes remain client-side, not a new firmware model.

- Post-boot AtomS3 reported Idle, audio OFF/silenced and tilt disabled, with no
  tilt fault or communication errors. Boot readbacks identified both servos as
  model 1190, position mode 3, torque OFF; a subsequent fresh PING returned
  `ok=1` for both IDs. PING confirms response, not a new register readback.
- Through StampC5, output-OFF model-only Live checks loaded
  `granular_sand_pile_box` and `liquid_soda_bottle`. Later snapshots contained
  the respective `mass.demo` pile/pressure state, establishing physical v4
  transport. Initial transition/Idle frames may legitimately omit that state.
- All 112 captured frames passed the schema-subset validator and the actual
  client `parseHapticLinkLine` telemetry parser, including 15 pile-active and
  15 pressure-enabled frames. All reported audio runtime OFF and tilt disarmed,
  with no servo fault. Commands were applied with no rejection, timeout or
  invalid bridge packets.
  The final reported condition was `liquid_small_box`, Idle and both outputs OFF.

Local captures are `tmp/bench-water-flash-atom-20260905.txt` and
`tmp/bench-material-v4-flash-20260905.txt` (ignored bench output, not portable
repository evidence). These checks did not enable actuators or collect a tactile
judgment. The subsequent operator handling report follows; this output-OFF
capture itself is not evidence of simultaneous actuator output.

## Physical observations, 2026-09-05

**Latest post-flash handling report (pre-kick).** After the AtomS3/StampC5 update
and the invitation to test the connected water demo, the operator reported:
"テストの結果はかなり良好！このまま展示にも使えそうなぐらい！"
They consider the remaining work fine parameter adjustment. This establishes
a positive user-observed result for the latest tested experience and makes it
the working exhibition baseline. Exact preset/settings coverage, host, duration
and a fresh Stop readback were not supplied with this report; no new counters
were captured. Do not turn the aggregate assessment into a pass for every
material, Android, or every acceptance item. No specific new failure was reported.

**Cable-free combined run.** Integrated AtomS3 with its USB unplugged, StampC5
on PC COM4, about 30 seconds comparing marble and sand. All 321 captured frames
passed schema/positive-span checks and the browser parser. Marble had 123
simultaneous-output frames and 21 accumulated events; sand had 124 and 70
additional events. Reported DXL errors, servo faults and audio underruns were
zero; feedback positions changed with commands. Each Stop had an applied ACK,
Idle/audio OFF/tilt disarmed and valid torque-OFF readback. The operator reported
considerable improvement, no unwanted residual vibration and imperfect
smoothness. These counters are not perceptual scores.
[Marble capture](../2026-09-05/evidence/bench-coherent-marble-handling-20260905.txt),
[sand capture](../2026-09-05/evidence/bench-coherent-sand-handling-20260905.txt).

**Desktop connected run.** Actual Chrome Web Serial via COM4 showed sand
60 x 60 x 40 mm/35%, then accepted marble 50 x 50 x 50 mm/4% and fill 4 -> 7 -> 4%
without arming. Start/handling/Stop showed LIVE/both ON then IDLE/both OFF.
The operator confirmed visual/felt direction matched and page refresh/reconnect
retained Idle/both OFF. Later multi-property exploration was positively reported,
but exact settings, per-material descriptions and a new Stop readback were not
captured. Do not promote that aggregate feedback to every acceptance item.

**Quest and radio recovery.** Main-app WebUSB applied-state display and MR entry
were user-confirmed. Handled MR then failed with discovery trouble. With the
dongle still on Quest, direct AtomS3 diagnostics found radio OFF/uninitialized;
local radio enable restored pairing. A subsequent dedicated-demo firmware boot
automatically paired with the Quest dongle, while Idle/audio OFF/tilt OFF and
valid servo torque0 readback were observed. This verifies radio boot, not a
successful Quest handling/recovery rehearsal. Quest's battery later ran out;
StampC5 returned to PC.
[Diagnosis](../2026-09-05/evidence/quest-atom-link-diagnostic-20260905.txt),
[restoration](../2026-09-05/evidence/quest-atom-link-restored-20260905.txt),
[automatic boot](../2026-09-05/evidence/quest-atom-autostart-boot-20260905.txt).

**Earlier no-RX incident.** Both servo IDs temporarily returned no bytes, also
under an independent probe firmware; normal replies returned after restoring
the integrated image. This does not identify a specific cable/electrical cause.
Detailed chronology and the earlier jerky-tilt diagnosis are preserved in the
[checkpoint snapshot](../2026-09-05/16_INTEGRATED_DEMO_CHECKPOINT.md), with
[raw captures](../2026-09-05/evidence/). Do not repeat bring-up solely because
these historical incidents appear in the archive.

## Known boundaries

- Firmware content dynamics and tilt-force calculations use body x/y. All three
  IMU axes are transformed, but body z does not drive independent fore/aft haptic
  motion/collisions. Visual marble/coin depth and liquid waves are presentation
  extensions, not proof of 3D haptic dynamics.
- Grip gain uses nominal force parameters, not measured FSR input.
- Body CG is a reduced-model estimate, not a tracked physical liquid centroid.
- Several legacy parameters are inactive in the coherent path; the remote
  allowlist and preset loader do not expose every stored parameter.
- Remaining smoothness has not been isolated to a single cause.
- Phone operation received the positive report above; exact Android model,
  browser and measured rendering performance were not recorded. Concurrent
  camera/AR and hand tracking need verification only if
  that optional extension is built; WebXR and ordinary camera AR remain distinct
  implementation choices, not already integrated Android features.

## Verification for repository synchronization

The earlier documentation/synchronization checkpoint is commit `e007885`.
It did not upload firmware or command actuators. Its completed checks were:

- Client: 73/73 tests, typecheck and production build PASS. The existing large
  Vite bundle warning is non-blocking; Android performance remains unmeasured.
- C++ under the installed Unity WebGL SDK/Wasm/Node: existing 23, coherent
  container 8, tilt 10, spatial 7, resolved-state 5 groups and fake-UART runtime
  9 groups PASS. This is not native Windows or hardware execution.
- Control/telemetry schema fixtures and resolved-state rejection checks PASS.
- Host-lab fixtures 20/20 and host-lab regression tests 8/8 PASS (synthetic data,
  not additional physical trials).
- AtomS3 baseline, integrated tilt+ESP-NOW and isolated-cache StampC5 firmware
  builds PASS.

Prior desktop/mobile-width browser-mock flows also passed, including the
reproduced stale-preset recovery case. Those flows were not a new physical
Android or Quest result. Reproducible commands are in
[development setup](../../reference/19_DEVELOPMENT_SETUP.md) and the
[client README](../../../webxr/README.md).

## Articulated CAD explanation, 2026-09-06

The explanation now uses the actual Fusion mesh as an articulated mechanism.
Read-only joint and analytic-surface inspection established separate contact
pad and driver axes, approximately 20 mm apart. Ten mesh nodes move; 47 stay
fixed. The nominal equal-and-opposite gear ratio is inferred from the CAD tooth
geometry, not measured servo calibration. The Japanese site provides common,
differential, and four-location pulse illustrations; the new English film
uses the same renderer. The earlier Japanese film is retained.

See [media reference](../../reference/29_EXPLAINER_SITE_AND_FILM.md) and
[CAD kinematic evidence](../../../explainer/production/CAD_KINEMATICS.md) for scope
and reproduction. This revision changes explanatory media only; no CAD save,
firmware change, hardware actuation, or new tactile evidence is implied.

## Bench and handoff boundaries

The latest observed bench state is the soda-recoil upload described above:
AtomS3 on COM3, StampC5 absent, Idle/audio OFF/tilt disabled, and neither servo
answering the non-actuating PING. The user deferred further hardware work.
The earlier two-device baseline ended in water/Idle with both outputs OFF;
it is not the latest connection snapshot. Do not infer present cable, power or
output state from either historical observation. Repository integration does
not change the firmware already on either device.

Normal powered, supervised testing remains authorized. Do not claim a browser's
USB port concurrently or actuate unattended hardware. Record/Replay remains
deferred; skipped tests remain skipped. Old tunnel URLs are ephemeral, not a
portable launch requirement. Use the client setup instructions on another PC.

Active docs stay limited to 00/04/05/06/07/08/16 and the index. Detailed design
references and historical evidence are separate. Selected original bench logs
travel with the repository; scratch screenshots/PDF renderings remain local and
ignored. The archive index records how removed/replaced documents can be recovered.
At checkpoint `e007885`, all 188 local Markdown links across 37 documents
resolved and the staged whitespace check passed. Build outputs, dependencies, paper
renderings and scratch captures are excluded from the synchronization.
