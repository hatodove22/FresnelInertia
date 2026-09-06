# 16 Current Status

Updated: 2026-09-07. This is the evidence ledger, not a second work plan.
Read [00](00_DESIGN_SPECIFICATION.md) for the concept and
[08](08_IMPLEMENTATION_PLAN.md) for the next iteration.

## Current position

The integrated handheld demo works on desktop with encouraging user feedback.
Four-channel vibration, two-servo tilt, ESP-NOW and the connected visual client
have run together. The operator confirmed visual/felt directional agreement,
then explored multiple properties. After the pre-kick firmware deployment and
richer water/WebGL iteration, the operator reported very good test results,
close to exhibition use; see the latest handling report below. Preserve this
working baseline and focus on fine parameter tuning.

The user has selected **Android** and now accepts a rich ordinary-screen phone
demo without requiring AR. Immediate work is exhibition-oriented parameter tuning;
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
A full tuning studio, dynamic-CG law refinement,
saved A/B workflow, perceptual-shape controls and tracked Android AR remain
**planned, not implemented**. Markers are optional alignment aids, not the main
tracking method. Existing Quest evidence is retained, but its unfinished
checks are not current prerequisites. No full Android demonstration is claimed;
camera/AR validation is not a gate for an ordinary-screen phone demo.

The 2026-09-07 integration combines local material/Lab work with remote
`121e342` (reusable firmware/visual boundaries, desktop placement/recovery and
explanatory/research assets). Earlier dated checks belong to the source
revisions on which they ran, not automatically to the merged revision.

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
| StampC5 link | Bidirectional commands/telemetry, resolved-state v3, execution ACK; v4 pile/pressure state received from deployed pre-kick firmware in output-OFF model runs | Exact per-material handling coverage and actual Android phone/USB combination unverified; camera concurrency only needed for optional AR |
| Desktop visual client | Applied preset/fill/dimensions, Start/Stop, existing visual/felt agreement; richer materials and C++ Lab; latest post-flash test positively assessed | Fine visual/tactile tuning; full studio/A-B/save not implemented |
| Quest client | User confirmed WebUSB applied state and MR container/panel visibility | MR handling/recovery not passed; VR work deferred |
| Stop/recovery | Current combined run verified Idle/audio OFF and both servo torque-OFF readbacks; desktop reconnect stayed OFF | Historical observation is not a claim about current live output |

The complete next-stage Android experience is not yet finished. Passing builds
or separate component tests are not an end-to-end handling result.

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
[the visual architecture](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#desktop-visual-pass-2026-09-06).
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
gap/restart rules are recorded in [31](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#desktop-visual-pass-2026-09-06).
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

Hardware/frame/default details belong in [04](04_HARDWARE_AND_PIN_SPEC.md);
protocol and parameter semantics belong in [05](05_INTERFACE_SPEC.md) and
[06](06_PARAMETER_MODEL.md). In particular, existing preview controls and trial
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
contracts are in [07](07_TEST_AND_VALIDATION.md) and references
[30](reference/30_REUSABLE_FIRMWARE_CORE.md),
[31](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).

**Research/design deliverable:** 14 primary works audited, 12 proposed demos
mapped to hardware conditions (3 presentation, 6 software, 2 tracking, 1
mechanical/sensing). Each has an explicit first falsifiable comparison.
The independent atlas has three interactive illustrative scenarios: attached
cargo, draining grains and a waking capsule. They have no device transport and
do not constitute firmware implementations or perceptual results. Full scope
and source-access limitations are in references
[32](reference/32_INTERACTION_DESIGN_SPACE.md) and
[33](reference/33_INTERACTION_RESEARCH_SOURCES.md).

The atlas is published to the existing owner-only explanatory site at
[/atlas](https://fresnel-inertia-explained.hatodove.chatgpt.site/atlas). An
authenticated HTTP check returned 200 and the validated entry script. All
interactive browser checks above ran against the matching local build.

## FW model research, 2026-09-06

The requested exploratory review is recorded in
[FW physical-model research (Japanese)](reference/34_FW_MODEL_RESEARCH.md).
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
content dynamics; the shared-model extension is tracked in [08](08_IMPLEMENTATION_PLAN.md).

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
[06](06_PARAMETER_MODEL.md). Existing signs, bounds, filters and slew remain;
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
[Marble capture](archive/2026-09-05/evidence/bench-coherent-marble-handling-20260905.txt),
[sand capture](archive/2026-09-05/evidence/bench-coherent-sand-handling-20260905.txt).

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
[Diagnosis](archive/2026-09-05/evidence/quest-atom-link-diagnostic-20260905.txt),
[restoration](archive/2026-09-05/evidence/quest-atom-link-restored-20260905.txt),
[automatic boot](archive/2026-09-05/evidence/quest-atom-autostart-boot-20260905.txt).

**Earlier no-RX incident.** Both servo IDs temporarily returned no bytes, also
under an independent probe firmware; normal replies returned after restoring
the integrated image. This does not identify a specific cable/electrical cause.
Detailed chronology and the earlier jerky-tilt diagnosis are preserved in the
[checkpoint snapshot](archive/2026-09-05/16_INTEGRATED_DEMO_CHECKPOINT.md), with
[raw captures](archive/2026-09-05/evidence/). Do not repeat bring-up solely because
these historical incidents appear in the archive.

## Known boundaries

- Content dynamics and tilt-force calculations use body x/y. All three IMU axes
  are transformed, but body z does not drive independent fore/aft content
  motion/collisions. Visible pitch is not proof of 3D haptic dynamics.
- Grip gain uses nominal force parameters, not measured FSR input.
- Body CG is a reduced-model estimate, not a tracked physical liquid centroid.
- Several legacy parameters are inactive in the coherent path; the remote
  allowlist and preset loader do not expose every stored parameter.
- Remaining smoothness has not been isolated to a single cause.
- Android model, USB host behavior and real-phone rendering performance remain
  unverified. Concurrent camera/AR and hand tracking need verification only if
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
[development setup](reference/19_DEVELOPMENT_SETUP.md) and the
[client README](../webxr/README.md).

## Articulated CAD explanation, 2026-09-06

The explanation now uses the actual Fusion mesh as an articulated mechanism.
Read-only joint and analytic-surface inspection established separate contact
pad and driver axes, approximately 20 mm apart. Ten mesh nodes move; 47 stay
fixed. The nominal equal-and-opposite gear ratio is inferred from the CAD tooth
geometry, not measured servo calibration. The Japanese site provides common,
differential, and four-location pulse illustrations; the new English film
uses the same renderer. The earlier Japanese film is retained.

See [media reference](reference/29_EXPLAINER_SITE_AND_FILM.md) and
[CAD kinematic evidence](../explainer/production/CAD_KINEMATICS.md) for scope
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
