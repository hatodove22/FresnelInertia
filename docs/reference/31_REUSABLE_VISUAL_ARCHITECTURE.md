# Reusable visual state and material rendering

Implemented 2026-09-06; integrated with the material/Lab work 2026-09-07.
This is the extension reference for the shared Web
renderer. The experience is defined in [00](../00_DESIGN_SPECIFICATION.md),
the active work in [08](../08_IMPLEMENTATION_PLAN.md), and hardware evidence in
[16](../16_PROGRESS_STATUS.md). A subsequent visual pass replaces the old liquid
profile and decorative assets and adds desktop placement/motion cues. The
material work adds retained sand, source-clock liquid dynamics/optics and soda
spray. A joint vibration/tilt preference workspace is now separate from the
material scene; broader material controls and Android tracking remain planned.

## Boundaries with current consumers

| Owner | Responsibility | Current consumers |
|---|---|---|
| [visualState.ts](../../webxr/src/visualState.ts) | Pure snapshot adapters, applied descriptor, body-x/y particle layout and acceleration residual; no DOM, THREE runtime, transport implementation or clock | DeviceDemo, liquid renderer, particle renderer; pure contract tests |
| [SourceTime](../../webxr/src/SourceTime.ts) | Pure classification of accepted sample time; no mutable clock or material reset policy | Liquid slosh, marble depth, sand surface, coin bodies and speaker timeline |
| [DeviceDemo](../../webxr/src/deviceDemo.ts) | Accept snapshots, hold stale/missing state, filter gravity once per accepted sample, display actual applied configuration and coordinate explicit commands | Desktop HUD and the retained spatial panel |
| [VisualSimulator](../../webxr/src/simulator.ts) | Browser-local approximate motion from preview tilt and `PreviewMotionTuning` | Existing touch/phone/scripted preview selected in main.ts |
| [PreviewEngine](../../webxr/src/lab/PreviewEngine.ts) | Production C++ model via Wasm with synthetic body-frame input; no hardware link or output | Explicit output-free Lab, separate from the approximate preview |
| [ContainerScene](../../webxr/src/renderer/ContainerScene.ts) | Shell, desktop placement/motion, explicit source selection and composition of material ingredients | Desktop and retained XR use the same scene instance |
| [ContainerGeometry](../../webxr/src/renderer/ContainerGeometry.ts) | One shape/dimension definition and geometric constraints | Shell, liquid volume/surface and particle travel limits |
| [desktopView](../../webxr/src/renderer/desktopView.ts) | Camera framing from rendered size; retain desktop close-up and fit narrow viewports above the HUD | main.ts desktop/narrow presentation; projected-corner tests |
| [LiquidContentRenderer](../../webxr/src/renderer/LiquidContentRenderer.ts) | Contained volume, bounded visual slosh, source-clock optical detail and pressure-driven soda presentation | Liquid and Hybrid |
| [ParticleContentRenderer](../../webxr/src/renderer/ParticleContentRenderer.ts) | Solid instances; reported x/y projection with visual-only marble depth, otherwise grain integration only in preview | Non-coin Granular, including the single marble |
| [CoinContentRenderer](../../webxr/src/renderer/CoinContentRenderer.ts) | Minted discs with source-clock 3D contact physics from accepted IMU input | Granular coin and explicit single-coin presets |
| [IceContentRenderer](../../webxr/src/renderer/IceContentRenderer.ts) | Rounded clear ice, internal inclusions and bounded placement on the existing water surface | Hybrid ice/water |
| [SoundState](../../webxr/src/audio/SoundState.ts) / [MaterialSound](../../webxr/src/audio/MaterialSound.ts) | Pure source/event selection, then optional speaker synthesis; never device commands | Device snapshots, production C++ Lab, explicitly approximate preview |

`main.ts` still owns animation timing, placement and input selection. It already
chooses accepted device state, explicit production-model Lab state or the
approximate VisualSimulator preview. The renderer does not need a second application stack or a
general plugin registry. The existing `ContainerScene` entry points and type
re-exports remain compatible; `SpatialPanelState` remains an alias for the
presentation-independent preview tuning fields.

Hybrid composes the shared liquid ingredient with a dedicated ice ingredient;
water improvements therefore also reach ice/water. Pure device-state
projection does not advance a physics model. Bounded presentation-only liquid and solid-depth
response uses accepted source timestamps, never free-running wall time; repeated
or stale snapshots freeze it. It may enrich visible motion without creating
firmware events, haptic CG or actuator commands. Independent bulk-grain
integration remains preview-only. The connected pile instead uses reported
aggregate slope/flow with source-driven surface-grain detail; this detail is
not an independent bulk or body-z haptic model. Soda follows reported pressure state.

## Preference tuning workspace

[`tune.html`](../../webxr/tune.html) and
[`tuning/main.ts`](../../webxr/src/tuning/main.ts) compose the existing Haptic
Link for deliberate physical comparisons and PreviewEngine for output-free
rehearsal. They do not load THREE, the material sound bank, or another haptic
model. The [operator guide](../../webxr/README.md#preference-tuning) owns the
workflow, supported ranges and distinction between ACKs and numeric readback.

[`TuningParameterSpace`](../../webxr/src/tuning/TuningParameterSpace.ts) owns
axis meanings, ordered physical paths, bounds, material coupling and normalized
coordinate conversion. Its explicit context is space/material/fixed values,
not a session or DOM selection. The dependencies are:

```text
TuningParameterSpace -> TuningSession (history and proposals)
                    -> TuningProfile (portable settings and reuse)
                    -> HapticLink (validated stopped application)
TuningSession -> ProfileFromSession -> TuningProfile
```

Here arrows mean "is consumed by". Ordinary profile readers do not import
the session implementation or optimizer. This is a responsibility/consistency
improvement, not a claimed rendering-speed or bundle-size improvement.

Only definitions are shared. Boundary-specific acceptance remains explicit:
legacy Link candidates permit unequal water damping, current candidates couple
it; remote phi may be zero while search/profile phi is positive. Sand's remote
dynamic-friction bound and tighter ratio tolerance differ from profile import.
Profile reuse can accept an uncoupled target baseline without silently fitting
it. Shared definitions do not replace any of these policies or the Stop/Start
transaction. Session exports and saved v1/v2/v3 formats remain compatible.

[`PreferenceOptimizer`](../../webxr/src/tuning/PreferenceOptimizer.ts) is a
dependency-free preference GP on normalized coordinates. It uses a unit-variance
RBF prior (length scale 0.30), a three-outcome ordered-logistic likelihood with
tie margin 0.30, and a whitened MAP/Laplace posterior. A tie is interval evidence,
not two conflicting votes; skipped comparisons never enter the fit.
Cholesky solves avoid explicit matrix inversion. Hyperparameters are fixed,
not estimated from this person's few judgments.

The proposal scores a seeded finite Halton/local candidate pool by posterior
expected positive utility difference from the current user-selected candidate,
including their joint covariance. Exploration therefore comes from posterior
uncertainty; it is not a random proposal relabeled Bayesian optimization.
This remains an approximate model and finite candidate search, not certified
global optimization or calibrated probabilities of perceptual realism.
The pure implementation supports 1–5 dimensions and bounded data. The current
workspace searches vibration strength, material response and three fingertip-tilt
gains together in five dimensions, with at most 60 comparisons. There is no
independent vibration-versus-tilt search. The candidate coverage includes a
fifth Halton base; the kernel length scale is unchanged. Scalar-posterior,
fifth-coordinate and covariance-acquisition checks plus a synthetic objective
with cross-branch interactions test the mathematics, not human improvement
or convergence within a particular number of comparisons.

[`TuningSession`](../../webxr/src/tuning/TuningSession.ts) owns validated,
copy-on-write choices, initial/selected values and the active A/B pair.
Independent seeded streams separate proposal generation from A/B label order.
History is authoritative on import; inconsistent summaries/observations are
rejected. V2 stores `space: combined`, all five normalized coordinates and only
the fixed positive `tilt.k_phi`. Its seven applied fields and their physical
meanings belong in [06](../06_PARAMETER_MODEL.md#joint-preference-search).
The multiplicative `k_phi*k_cm` / `k_phi*k_tau` redundancy is not another search
dimension. Legacy v1 stays two-dimensional and returns only its old three
water fields: import/resume never invents a tilt configuration. V3 adds a
strict representative identity (water / one marble / retained sand). Water and
marble use coupled damping; sand replaces that coordinate with coupled
static/dynamic friction because the pile path bypasses generic damping. A
material change creates a separate session, not a pooled or relabeled posterior.

[`ProfileFromSession`](../../webxr/src/tuning/ProfileFromSession.ts) explicitly
converts a validated history into selected settings; `createProfile(session)`
lives there rather than in the portable codec.
[`TuningProfile`](../../webxr/src/tuning/TuningProfile.ts) serializes a selected
seven-value configuration separately from the history. Source mode/session,
material, comparison count and evaluation label travel with it, not likelihood
observations. Same-material reuse is exact. Cross-material seeding copies only
the common vibration/tilt fields onto the target's own material baseline, with
zero inherited votes. Ordinary device-demo reapplication requires a matching
material and the same stopped Haptic Link transaction; selection/import does
not grant output authority. No result is automatically written as an NVS preset.

The UI saves the session, a reported condition fingerprint and command
receipts. V2/v3 application collects 11 ACKs: Stop, a capability state request,
preset, seven setters and final state request. The new AtomS3 returns the four
applied tilt coefficients at `%.6g` precision; the client verifies those values
before granting Start. Vibration/material response remain ACK-only. A pre-tilt
FW is rejected before preset/set writes; an intermediate tilt-capable FW may
reject new sand setters after preset load and remains stopped, without rollback.
The StampC5 forwarding path is unchanged. Legacy v1
retains its six-ACK workflow. Protocol ownership is in [05](../05_INTERFACE_SPEC.md).

Rehearsal/device records are isolated; imported receipts never authorize Start.
Q/W deliberately applies and starts a candidate through the same transaction
after handling readiness is checked. Rating only creates the next stopped
proposal; baseline/preferred reapplication is not a vote. Input/IME/long-press
guards prevent repeated shortcut actions. No cloud, account system, study
manager or alternate haptic control law is introduced. The AtomS3 extension is
not yet flashed and physical comparisons remain pending; current verification
and deployment evidence belong in [16](../16_PROGRESS_STATUS.md).

The approach is motivated by preference-based human-in-the-loop haptic
optimization; [Çatkın and Patoğlu's 2023 repository abstract](https://research.sabanciuniv.edu/id/eprint/50131/)
specifically studies perceived realism. That abstract is not a calibration or
validation of this device or implementation. Mathematical background includes
[Brochu et al. (2007)](https://papers.nips.cc/paper_files/paper/2007/file/b6a1085a27ab7bff7550f8a3bd017df8-Paper.pdf)
and the [BoTorch preference example](https://botorch.org/docs/v0.17.2/tutorials/preference_bo).
Our small ordinal-logistic/Laplace implementation is not BoTorch's code or an
exact reproduction of those experiments.

## Source authority and the pure adapter

### Shared time classification, separate material state

`sourceTimeStep(previousS, currentS)` classifies missing, initial, duplicate,
advancing, rewound and long-gap samples. It returns the original elapsed time;
only `advance` permits integration. Exactly 0.5 seconds still advances; a
larger gap does not replay unseen motion. The function reads no clock, retains
no state and cannot emit events or drive hardware. Each consumer owns its
previous timestamp and source identity.

This replaces repeated time arithmetic, **not** the different recovery policies:

| Consumer | Missing time | Rewind / long gap |
|---|---|---|
| Water slosh | Hold surface and previous time | Quietly rebase to current orientation |
| Marble depth | Clear offset/velocity and previous time | Clear to a new baseline |
| Coin bodies | Keep poses, clear velocities and previous time | Rebuild initial poses on rewind; keep poses and quiet on gap |
| Sand surface | Retain grains/deposit, clear flow and previous time | Clear deposit on rewind; retain it and quiet on gap |
| Speaker timeline | Silence and remember interrupted identity | Establish a quiet baseline; no historical hits |

Repeated visual timestamps do not advance dynamics. Sand still validates its
geometry before that check. Sound still consumes same-time event counters and
prioritizes source/preset/counter resets, preventing delayed duplicate hits.
Those policies stay with the consumer, as do empty content and geometry changes.
`visualSampleInterval` remains the distinct millisecond-wrap-aware device
acceleration adapter; it is not a visual physics or sound clock.

### Accepted device projection

`DeviceVisualSink` is the small presentation contract used by DeviceDemo:
`setPreset`, `setDeviceState`, `setDeviceOrientation`, and optional
`setDeviceAcceleration`. ContainerScene satisfies
it without an extra wrapper. DeviceDemo no longer depends on that concrete
renderer class. A future presentation can implement the same sink; a transport
or protocol change is not needed merely to change a view.

- `resolvedPresetFromSnapshot(snapshot)` returns a copied applied descriptor or
  null. It never fills missing configuration from local preset JSON.
- `contentFromSnapshot(snapshot, appliedFill)` returns a sanitized aggregate
  state or null for missing motion. `sanitizeDeviceContent` also supports direct
  callers of the projection API.
- `orientationFromSnapshot(snapshot, previousGravity)` returns filtered gravity
  and pitch/roll plus body-frame acceleration residual (g), or null for invalid IMU data. The controller owns the previous
  gravity and calls this once per new accepted snapshot.
- `deviceParticleLayout(size, state, family, single)` and
  `deviceParticlePose(layout, index, count)` project the reported body x/y mass
  to a wall-bounded illustrative cloud. Symmetric pairs keep its centroid at
  the reported mass. They do not represent measured individual grains.
  The marble renderer adds its visual-only z response after this unchanged
  pure projection; it is not a new field in `DeviceContentState`.
- [ContainedVolume](../../webxr/src/renderer/ContainedVolume.ts) clips the inner
  vessel against a plane and solves its height for the requested volume fraction.
  LiquidContentRenderer projects accepted orientation and body-x/y motion into
  this surface. The rich liquid path adds bounded, mean-corrected wave detail;
  the pile bed instead uses its retained reported slope. The obsolete floating
  liquid block is not a fallback for connected contents.

For example, a non-THREE explanatory or analytical view can consume the same
particle projection without loading browser rendering or the Haptic Link
implementation:

```ts
import {
  sanitizeDeviceContent, deviceParticleLayout, deviceParticlePose
} from "./visualState";

const state = sanitizeDeviceContent(input);
const layout = deviceParticleLayout({ x: 0.05, y: 0.05, z: 0.05 }, state, "Granular", true);
const marble = deviceParticlePose(layout, 0, 1);
// Draw marble.x/y/z in metres with layout.radius.
```

An explanatory source must remain visibly identified as illustrative. Importing
these formulas does not establish device measurement, full 3D dynamics or a
felt effect. The current on-device dynamics remain body x/y; visible pitch and
solid-depth motion do not add independent fore/aft haptic collisions.

Stale telemetry retains the last device state and pose. An explicit return to
preview clears the state only after the existing Stop/disconnect path. Preset
requests and ACKs do not become visible applied configuration before reported
state; Start, pending work and reconnect policy remain in DeviceDemo/HapticLink.

One behavior fix accompanies the extraction: on a first connection, resolved
configuration can arrive before `mass`. Previously that sequence could leave
ContainerScene in local preview mode until motion arrived. DeviceDemo now
installs a zero-fill device state and holds it, then displays reported content
when it arrives. This placeholder is a source-selection safeguard, not an
observed empty-container reading or confirmation of physical output state.

Actual-browser review also found a pre-existing narrow-view framing problem:
at 390 x 844, tilted 60 mm liquid/sand boxes could clip the screen edges even
though the DOM had no horizontal overflow. `frameDesktopContainer` now fits an
orientation-independent container bound to the narrow field of view above the
HUD, using `ContainerScene.getSize()` for actual rendered dimensions. It changes
camera distance only when a narrow view needs more room; the established
desktop distance/offset and physical geometry stay unchanged. XR continues to
use its tracked camera.

## Coin presentation

[CoinContentRenderer](../../webxr/src/renderer/CoinContentRenderer.ts) uses one
minted disc for `granular_single_coin_box` and an illustrative count for the
ordinary coin preset. Each disc has a distinct front/reverse texture. Its
initial staggered layout reserves finite radius and thickness in the cavity.

[CoinRigidBodies](../../webxr/src/renderer/CoinRigidBodies.ts) replaces the
rejected threshold-triggered half-turn animation with independent 3D linear
and angular dynamics. Accepted container orientation sets body-local gravity;
accepted acceleration residual supplies opposing inertia. Friction, floor/wall
and coin/coin contacts determine sliding, edge rocking, tumbling and rest.
No flip threshold, target angle, duration, upper-coin sequence or lift animation
remains. A gentle gesture can simply slide; overturning is not guaranteed.

This deliberately changes the coin presentation contract: individual x/y/z poses
are **not locked to the firmware's aggregate mass position**. The same accepted
IMU input drives the two models, but this richer visual physics is not measured
device state, exact haptic CoG, or a 3D firmware replacement. Its contacts emit
no sound or actuator events. Acoustic/haptic contacts still come from the
existing C++ model; exact individual visual/acoustic contact alignment is not
claimed and needs a later short handling comparison.

Rapier 0.20.0 is a pinned runtime dependency loaded only when coins are selected.
Its embedded Wasm is a separate local chunk (~2.86 MB before gzip); it uses no
CDN or background timer. Independent worlds are disposed on preset/source
replacement; a late load releases an abandoned world, not a new material.
A loading/error message stays separate from device status. Failure leaves a
static coin; reload the page to retry a failed module download.

Physics uses fixed 1/480 s source-clock substeps in centimetres, finite cylinder
colliders and six inner planes at half extents [0.48W, 0.474H, 0.48D].
An exact cylinder-support constraint corrects residual wall penetration and
outward contact velocity with an impulse at the physical support point.
It never writes a target orientation. This addresses observed thin-rim
penetration in the general solver, not a guessed haptic safety condition.
Equal relative coin masses, contact friction/damping and sustained low-speed
sleep are visual tuning parameters, not calibrated material measurements.
Sleeping bodies wake on changed input or contacts; a fully sleeping scene
does not keep stepping and creeping.

Duplicate timestamps hold all poses. Missing time or gaps over 0.5 s hold the
last pose and discard velocity. A gap sample itself is a quiet baseline;
after missing time, the next valid sample establishes that baseline.
A rewind/reset restores the initial arrangement. Loading has no queued gesture
to replay; empty fill hides coins. Ordinary preview uses the same physics with
preview tilt and its own time, without inventing a flip from impact/agitation.
The Lab coin shake now supplies an actual three-axis synthetic acceleration
to both C++ and visual models; water and other material gestures are unchanged.

Renderer-owned geometry, face textures and materials are disposed independently.
The existing marble and all firmware/protocol/actuator paths are unchanged.
The separate physical single-coin preset still has its previously pending
AtomS3 upload; its parameters belong in [06](../06_PARAMETER_MODEL.md).

## Visual-only solid depth

[SolidDepthMotion](../../webxr/src/renderer/SolidDepthMotion.ts) remains the
single marble's bounded visual z extension. It uses accepted gravity and
acceleration, rolling resistance and a damped wall response; reported x/y
position and appearance stay unchanged. Coins now use the full visual dynamics
above, not a translated stack or this independent depth integrator.

Marble depth advances only on source time: duplicates hold; missing/nonfinite
time, rewind or gaps over 0.5 s rebase quietly at the center; empty/no travel
clears it. Level input does not spring to center. Source/preset replacement
disposes its old state. It emits no speaker/haptic contacts and does not add
body-z state to firmware. Ordinary grains, retained sand and ice do not receive
this extension.

## Ice presentation

Ice/water composes the unchanged liquid renderer with a few legible rounded
chunks, frosted faces, a cloudy interior and sparse air/fracture details. The
chunks use the liquid's current surface normal/height, including fore/aft tilt,
instead of the generic grain cloud's body-mass y coordinate. Placement is
partially submerged and consumes the existing surface; it does not create a
second fluid or buoyancy simulation. Reported horizontal mass/velocity adds
bounded position/rocking detail without independently generated collisions.

The full oriented formation is fitted into the shared cavity, with reduced
size or inward placement only where the full/side-on/narrow vessel cannot hold
the illustrative formation at its free surface. Counts and poses are not
individually measured ice bodies. Empty fill hides ice; static/repeated source
state cannot start an idle bobbing clock. Resources are exclusively owned by
the ice leaf. This is a Web-only presentation change, not a firmware update.

## Resource ownership

### Optional speaker branch

`SoundState` projects accepted live telemetry, C++ Lab frames or local preview
motion into an acoustic cue. `SoundTimeline` deduplicates source time and event
counters, suppresses historical contacts on entry/reset and never expands a
dropped telemetry interval into a catch-up train. The device supplies only its
latest aggregate event; this is not lossless per-contact audio synchronization.
The Lab uses its actual C++ event batch; ordinary preview uses a latched local
impact pulse and remains illustrative. A soda opening additionally needs the
current burst phase and a distinct shared burst sequence. Stationary residual
energy or charge alone must not generate flowing sound.

`MaterialSound` owns a lazy WebAudio context, bounded voices, decoded samples
and local volume. Solid contacts/grit remain locally
authored synthesis in `FoleySamples.ts`, without the earlier tonal sweeps.
Water and the wet part of hybrid now use **actual recorded water**, not
synthetic water noise or AI-model output: Joseph SARDIN's CC0
[Swirl in the water](https://bigsoundbank.com/swirl-in-the-water-s0192.html).
[Source credits/provenance](../../webxr/src/assets/audio/sources/CREDITS.md)
retain the license, hashes and processing details.

Recorded motion uses a 5.8 s loop and 0.75–1.05 s contact excerpts with natural
tails, cleanup and seam fades, without pitch shifts. Water/hybrid/soda voice at
most the strongest fresh contact per 350 ms of source time and at most two
accent tails. Skipped events are discarded, never queued. Energetic
RollTrain/Scrape can use a broader recorded excerpt; flow alone starts no
autonomous splash accents. Gain follows existing source motion and contacts,
not visual-only waves. The approved water/hybrid and solid PCM is preserved
when adding recorded soda below.
The recording's original context is hand-moved water, not measured sound from
the demo container. Listening and audiovisual/tactile fit remain subjective.

Soda uses Joseph SARDIN's CC0 [Champagne cork #2](https://bigsoundbank.com/champagne-cork-2-s0648.html)
for its opening and [Sparkling water](https://bigsoundbank.com/sparkling-water-s0230.html)
for a separate 3.6 s fizz loop. Sealed shaking uses the same recorded-water
motion/excerpts as water, without venting. A speaker-only `vent` projection
from the existing burst phase/charge/age/remaining state renews the fizz gain;
spent/empty/invalid state does not vent. This is not a wire or firmware field.
The existing distinct `PressurePop` owns the one opening, never a new timer.
Pause/reset/mute/source change cancels the vent together with other voices.

`npm run audio:generate` creates the shipped mono 24 kHz PCM16 WAV atlas and
clip manifest from authored solids and recorded water/soda (59 clips,
approximately 2.66 MB). A test rejects
stale generated PCM. `FoleyBank` fetches this one fingerprinted same-origin
asset only after explicit sound enable, then decodes/splits it once; contact
frames neither fetch nor synthesize PCM. Clip times survive WebAudio resampling.
Re-enabling reuses the bank; load/decode failure stays silent, visible and
retryable, and a late load cannot undo mute/disposal. No third-party sound
service, microphone, hardware audio command or new firmware field is used. The sound controls
default OFF/35%; the user explicitly unlocks audio. Muting affects speakers,
not the four transducers. Source clocks determine excitation; acoustic buffer
decays run at audio rate and are cut on pause rather than time-stretched with
the Lab's quarter-speed mode.

Continuous gain is renewed only by fresh source samples and expires after
260 ms without another sample. Lab pause/reset/preset/close signal silence
synchronously, as do invalid/stopped/disconnected device-state notifications;
they do not wait for a heavy WebGL frame. Hiding the page also stops voices.
Source interruption/re-entry establishes a new baseline without replaying old
hits. Ended sources disconnect their nodes; material/source changes cancel old
tails, and disposal closes the owned context. Audio unlock failure remains
visible and retryable; it does not prevent the existing visual/haptic demo.

The gesture/unlock and separate user controls follow the
[WebAudio best-practice guidance](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).
Actual phone acoustics/latency and perceived audiovisual/haptic fit require a
listening comparison; waveform/graph checks alone do not establish them.

### Render resources

Each material ingredient owns its group, geometry, instance buffers, materials
and textures. In particular, every liquid ingredient owns its normal texture;
preview animation in one scene cannot change the texture phase of a held
connected scene. ContainerScene owns its shell and its ingredients.

On preset/source rebuild, ContainerScene disposes the replaced ingredients and
shell resources. Grip pads survive these rebuilds. `dispose()` tears down
the entire container, disposes the grip once and detaches the group. Repeated
disposal is harmless; a disposed ContainerScene cannot receive another preset.

[disposeObjectTree](../../webxr/src/renderer/disposeObjectTree.ts) deduplicates
geometry/material/texture disposal within an exclusively owned subtree and
releases InstancedMesh resources. The grip's two pads share their resources
within their owner. Resources are not shared across independent container
instances. Do not attach borrowed materials/textures under this disposal owner.
If future work introduces shared GPU resources, introduce explicit ownership at
that point rather than silently disposing another scene's resources.

## Extension recipe

1. For another presentation mode, reuse ContainerScene and change its outer
   placement/camera. Feed it accepted state through the existing sink. Future
   Android tracking supplies placement; it must not become a second content
   simulator or command sender.
2. For a material improvement, edit the owning ingredient. Keep the connected
   method dependent on accepted state, geometry and source time. Keep bounded
   presentation dynamics separate from the physical state projection, and
   approximate preview physics in the preview method. Shared liquid changes also
   reach Hybrid; its ice optics/placement have a separate owner. Preserve the single-marble reference.
3. For a new combined material, first compose the existing liquid/solid
   ingredients. Add a new ingredient only when it has different rendering or
   resource responsibilities. Keep construction, updates and disposal together.
4. For a new observed state field or actual haptic behavior, change the owning
   firmware/protocol and applied-state path separately. A renderer-only visual
   cannot claim a new device event, haptic 3D axis or material model.
5. Extend the affected state/projection and scene tests, then typecheck/build.
   For appearance changes, inspect the actual rendered view; for changed felt
   behavior, use the relevant handling acceptance in [07](../07_TEST_AND_VALIDATION.md).

## Verification of the original extraction

The results below describe the remote pre-integration revision, not a rerun of
the merged material implementation. Current merge checks belong in 16.

Run from `webxr/`:

```powershell
node --test test/*.test.mjs tests/*.test.mjs
npm.cmd run typecheck
npm.cmd run build
```

The 73 existing tests remain, with 14 added tests for the pure model contract,
material switching, accepted preview trajectories/marble assets, independent
scene textures, rebuild/teardown ownership and the real-ContainerScene
metadata-before-motion regression, plus desktop/narrow projected-camera bounds.
All 87 pass; typecheck and production build
pass. Vite still reports its existing large-bundle warning.

During extraction, 18 deterministic scene combinations (three families, three
preview shapes, both source modes) matched the original positions, rotations,
content vertices and particle matrices exactly. That extraction parity is historical; the subsequent visual pass intentionally
replaces old liquid trajectories and decorative material details. This parity check applies to the renderer formulas;
the metadata-before-motion fix intentionally changes that controller edge.

The automated unit checks use actual THREE geometry/matrices with a canvas
stub. A subsequent local Chrome/Playwright review rendered and inspected 16
WebGL screenshots at 1440 x 1000 and 390 x 844: bead/liquid/sand/hybrid local
previews and marble/liquid/sand/hybrid synthetic device states. The existing
single-marble appearance is connected/resolved-only; bead preview was not
treated as that reference.

After the narrow-framing fix, the projected container stays inside the viewport
above the HUD. There were no JavaScript errors, failed assets, context loss or
horizontal DOM overflow. A freshly rendered marble canvas remained identical
when the synthetic telemetry became stale and changed when new synthetic mass
position arrived. Actual renderer geometry/texture counts stayed stable over
12 material switches (three passes through four materials). Chrome reported
the existing `PCFSoftShadowMap` deprecation/fallback warning.

The temporary harness, screenshots, before-framing captures and JSON report
are local ignored files under `output/playwright/`. The harness intercepts the
HapticLink module in the browser and rejects every hardware operation; no
public test route was added. These are WebGL and synthetic-state checks, not
new hardware, USB, tactile or Android AR evidence. The visual pass below
superseded the floating-liquid limitation; the later integration also adds the
opt-in reduced pile model, not individual-grain simulation.

## Desktop visual pass, 2026-09-06

This records the remote pass. Placement, recovery and vessel styling are
retained in the integrated renderer; liquid/sand/soda detail is extended by
the material work described below.

- **Placement:** cache the vessel vertices, including cap/rims, and place its
  lowest rotated point 0.8 mm above the stage. The camera looks at a stable
  nominal anchor so it does not cancel container translation. Narrow framing
  reserves an extra 20% size margin. XR keeps tracked translation; this desktop
  placement is disabled while XR is presenting.
- **Acceleration cue:** take body acceleration minus the existing filtered
  gravity estimate once per accepted snapshot, rotate into world coordinates
  and use only the desktop x/z plane. A 0.025 g deadband, 18 mm/g display gain,
  and radial limit of min(10 mm, 18% of the shortest span) bound the cue.
  No velocity or position integration is performed. Follow moving input with
  a 0.12 s exponential time constant; quiet input recenters the positional
  offset with a weaker 0.8 s constant (~95% return after 2.4 s of quiet input).
  Use accepted device timestamps, including uint32 wrap, for elapsed time.
  Repeated timestamps do not advance recovery; the first sample, a device
  restart or a gap over 0.5 s takes one 0.1 s step without catching up offline
  time. Stale samples hold the view, including a partly returned offset.
  Pitch/roll continue following gravity, never the initial orientation: a
  deliberately held tilt must not be slowly cancelled. The estimate
  can mix rapid tilt with acceleration and depends on telemetry cadence: it is
  a tunable display cue, not measured translation or a new firmware parameter.
  Local preview instead derives a smaller bounded cue from preview velocity.
  The production-C++ Lab feeds its synthetic body acceleration through the same
  bounded cue after applying orientation, using model elapsed time. It does not
  write container position behind the desktop placement owner; quarter-speed
  scales that timeline and pause submits no advancing updates.
- **Liquid:** the inner cavity reserves 2% per side for walls/base. Box, 40-sided
  bottle body and tapered cup are clipped against the same surface plane;
  18 bisection steps retain fill fraction through sideways/inverted poses.
  Fixed GPU buffers are reused, unchanged plane/fill skips mesh uploads, and
  a held desktop device state skips pose/particle updates.
  The plane follows gravity plus bounded body-x/y mass/velocity bias; it is an
  illustrative response to aggregate state, not an exact reconstruction of FW
  center of mass or additional fore/aft content dynamics. Normal-map activity
  and phase also come from device state. The merged optical/slosh path advances
  only with new accepted source time; stale or paused state holds it.
- **Appearance:** the old wood/grid/cables and large front label are removed.
  Vessel edges are beveled; bottle shoulder/neck/cap now fit their nominal
  height, cups have narrow rims, and a sparse stage provides spatial references.
  Environment reflections and finer shadow framing improve depth. Sand uses
  smaller faceted preview grains, coins use discs, beads have a smooth finish,
  and ice uses rounded blocks. Preview solids respect round inner walls and
  the local liquid plane; connected solids remain symmetric representative
  instances around the reported mass. No connected grain/ice integration was
  added in that pass. Marble x/y position, radius, sphere tessellation, color
  and roughness stay unchanged; scene lighting around it is improved. Its
  subsequent visual-only z extension is documented separately above.

Bottle preview fill still refers to the body below the neck. Full cups retain
volume, with no general spilling; particle packing, individual-grain avalanches,
independent ice buoyancy and exact mixture reconstruction remain unimplemented. These are
explicit model limits, not physical validation results. No protocol or actuator
parameter changed. Validation and local browser evidence belong to [16](../16_PROGRESS_STATUS.md).

## Integrated material presentation

`LiquidSlosh` adds two-axis bulk lag and six damped visual modes, using resolved
dimensions, fill and viscosity. Snapshot time is its clock: repeated samples
hold, missing time has a static fallback, and rewind/long gaps rebase quietly.
Wave mean correction and compression preserve contained volume and wall bounds.
Pitch-only visual waves do not add a body-z haptic model or reported CoG.

The water is now one continuous free surface and matching side volume. The
earlier independent sheet/lobe overlay was removed after the operator found
it visually disconnected. Broad directional modes, weaker reflected modes
and smooth crest steepening raise one shoulder while drawing down surrounding
water. Excitation comes from changes in accepted orientation, mass/velocity
and body-frame acceleration residual, not an idle activity clock.
ContainerScene copies acceleration before desktop placement discards its
vertical component. This does not add body-z haptic dynamics or landing events.

`ContainedVolume` area-weights the displacement to zero mean, then applies a
common wall-bounded scale. Its actual surface/body mesh volume retains fill,
not just an undeformed reference body beneath an added effect. Wave samples
move along one body axis, with unit projection onto the reference normal;
parallel walls slide to the exact same sampled waterline. Concave wall polygons
are triangulated against that contour. Caps and incompatible tapered walls
pin their seam with a smooth nearby attenuation. Near dominant-axis ties,
the wave amplitude smoothly reaches zero to avoid a shape jump; the bulk
plane remains continuous. Fixed GPU buffers are reused.

First samples, rewind and gaps over 0.5 s establish a quiet baseline. Repeated
times freeze geometry and optics; viscosity damps the response, held inputs
settle, and empty/full cavities suppress waves. The local surface can move in
fore/aft and vertical response without corresponding FW CoG travel. Existing
`heightAt` and centroid consumers still use the reduced reference volume, not
local wave height or independent ice buoyancy. There is no detached water,
general spilling, overturning wave solver or full fluid simulation. Do not
feed a visual crest/return back to sound, FW or actuators.

`MaterialStudio`, `LiquidContactLine` and `LiquidCaustics` provide procedural
reflections, transmission/absorption, a matching wet lip and restrained
submerged-floor lighting. The wet lip consumes the shared deformed boundary
and geometry revision, so waves update it even at a fixed reference plane.
`SodaJet` supplies a connected foam jet, sheets and
fine spray from reported phase, age, charge and remaining content. These are
authored optics and presentation, not CFD or independent pressure physics.

The opt-in dense sand bed follows the reported constant-volume pile slope.
`SandSurfaceFlow` transports a persistent minority of fine grains in local
body-x lanes using fresh source time, actual `granularFlow` and the sign of
`velocityX` (fresh slope change is a fallback). Grains no longer oscillate back
to their initial grid; edge fading hides recycling. A shallow, irregular
erosion/deposition field evolves only during flow and retains its shape at
rest. This is presentation detail, not DEM or extra body-z granular dynamics.
The field is transformed into the clipped plane basis, pinned at its boundary
and mean-corrected by `ContainedVolume` to conserve actual mesh volume.
`SandSurfaceSampler` samples the final triangle surface so grains cannot float
above an uncorrected height estimate. Slopes and the reference centroid remain
device-owned; local relief is not claimed to preserve exact first moments.
First/missing/long-gap source samples do not catch up motion, repeated samples
hold, and rewind resets the skin. No surface detail generates new sound,
haptic events or actuator commands. Missing/inactive v4 state leaves ordinary
material behavior intact; a preset name alone must not invent pile or pressure.
The production-C++ Lab uses these same visual ingredients without hardware
access. Its optional quarter-speed mode slows input, model and display together;
it is not an actuator-speed control. Resource ownership and source transitions
must preserve the same disposal and stale-state guarantees above.
