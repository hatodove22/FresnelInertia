# 16 Current Status

Updated: 2026-09-06. This is the evidence ledger, not a second work plan.
Read [00](00_DESIGN_SPECIFICATION.md) for the concept and
[08](08_IMPLEMENTATION_PLAN.md) for the next iteration.

## Current position

The integrated handheld demo works on desktop with encouraging user feedback.
Four-channel vibration, two-servo tilt, ESP-NOW and the connected visual client
have run together. The operator confirmed visual/felt directional agreement,
then explored multiple properties and reported that the experience was quite
good. Marble visuals were singled out positively; smoothness and other material
visuals still need refinement.

The user has now selected **Android** for the next AR direction and deferred
VR/Quest. The first desktop visual pass is implemented (see below). The tuning
studio, A/B/save workflow, perceptual-shape controls, granular accumulation,
refined CG mapping and tracked Android AR remain **planned, not implemented**. Existing Quest evidence is retained, but its unfinished
checks are not current prerequisites. No full Android demonstration is claimed.

## Capability and evidence

| Capability | Established | Remaining limitation |
|---|---|---|
| Shared haptic pipeline | Coherent Mass/contact/Event, Texture, Resonance and Spatial4 implemented; marble/sand handled together with tilt | Liquid/hybrid naturalness and remaining smoothness |
| Tilt-plane output | Useful strength and relative directions accepted; filtered common-position plus dynamic-CG/inertia commands | CG/reference-angle semantics and perceptual tuning; not an absent dynamic-CG subsystem |
| StampC5 link | Bidirectional commands/telemetry, resolved-state v3, real execution ACK and applied configuration | Actual Android phone/USB/camera combination untested |
| Desktop visual client | Applied preset/fill/dimensions, Start/Stop, device-driven visual/felt agreement and Idle page reconnect | New studio/A-B/save and granular accumulation not implemented; revised visual/tactile agreement not yet rechecked |
| Quest client | User confirmed WebUSB applied state and MR container/panel visibility | MR handling/recovery not passed; VR work deferred |
| Stop/recovery | Current combined run verified Idle/audio OFF and both servo torque-OFF readbacks; desktop reconnect stayed OFF | Historical observation is not a claim about current live output |

The complete next-stage Android experience is not yet finished. Passing builds
or separate component tests are not an end-to-end handling result.

## Desktop visual pass, 2026-09-06

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
Sand/ice remain representative device-driven instances, with no connected
particle packing, avalanche, independent buoyancy or overflow simulation.

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
  and mean absolute difference below 0.005 on the 0?255 scale); the final run
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
  observed loop-task-stack restart.
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

Proposed contact timing/impulse fields, granular states, liquid modes, modal
synthesis and optimization workflows remain unimplemented. This research turn
changed documentation only; it did not build or upload firmware, use device
ports, actuate hardware, or add physical/perceptual evidence. The existing
tuning-studio-first direction in 08 is unchanged.

Documentation checks passed: 102 local links across the six touched documents,
the new report's table/fence/encoding and whitespace checks, tracked-document
diff whitespace, and analytic example calculations. Independent reviews of
the code/physics, synthesis and perception/tuning sections were incorporated.

## Physical observations, 2026-09-05

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
- Android model, USB host behavior, concurrent camera/AR and marker tracking
  remain unverified. The WebXR path and ordinary marker-camera AR are distinct
  implementation choices, not already integrated features.

## Verification for repository synchronization

No source changes, firmware uploads or actuator commands were made during this
documentation/synchronization turn. Existing uncommitted implementation and
tests are included in the checkpoint. Software checks repeated on 2026-09-05:

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

Last known transport arrangement: StampC5 returned to PC COM4; AtomS3 firmware
was last updated through COM3, and later USB removal was requested for handling.
Do not infer present cable connection, power or output from this historical
record. After the user's latest property exploration no new physical-state
readback was captured. This cleanup did not open a serial/USB device.

Normal powered, supervised testing remains authorized. Do not claim a browser's
USB port concurrently or actuate unattended hardware. Record/Replay remains
deferred; skipped tests remain skipped. Old tunnel URLs are ephemeral, not a
portable launch requirement. Use the client setup instructions on another PC.

Active docs stay limited to 00/04/05/06/07/08/16 and the index. Detailed design
references and historical evidence are separate. Selected original bench logs
travel with the repository; scratch screenshots/PDF renderings remain local and
ignored. The archive index records how removed/replaced documents can be recovered.
All 188 local Markdown links across 37 documents resolved during this cleanup;
the staged whitespace check also passed. Build outputs, dependencies, paper
renderings and scratch captures are excluded from the synchronization.
