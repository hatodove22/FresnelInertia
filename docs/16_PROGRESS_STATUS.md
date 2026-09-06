# 16 Current Status

Updated: 2026-09-05. This is the evidence ledger, not a second work plan.
Read [00](00_DESIGN_SPECIFICATION.md) for the concept and
[08](08_IMPLEMENTATION_PLAN.md) for the next iteration.

## Current position

The integrated handheld demo works on desktop with encouraging user feedback.
Four-channel vibration, two-servo tilt, ESP-NOW and the connected visual client
have run together. The operator confirmed visual/felt directional agreement,
then explored multiple properties. After the latest firmware deployment and
richer water/WebGL iteration, the operator reported very good test results,
close to exhibition use; see the latest handling report below. Preserve this
working baseline and focus on fine parameter tuning.

The user has selected **Android** and now accepts a rich ordinary-screen phone
demo without requiring AR. Immediate work is exhibition-oriented parameter tuning;
hand-tracked camera AR is optional later work and VR/Quest remains deferred.
The new output-free C++ Lab, contained liquid/sand
rendering, retained granular pile and soda burst are implemented in software;
the tested baseline AtomS3 and StampC5 images are installed, and output-OFF checks
confirmed physical v4 pile/pressure transport. Subsequent handling received a
strong positive overall assessment; per-preset coverage was not itemized.
The later requested soda tilt kick is implemented, software-checked and flashed
below, but is not included in that positive physical report. At the user's
request, this session ended at firmware upload; handled recoil testing is deferred.
A full tuning studio,
saved A/B workflow, perceptual-shape controls and tracked Android AR remain
**planned, not implemented**. Markers are optional alignment aids, not the main
tracking method. Existing Quest evidence is retained, but its unfinished
checks are not current prerequisites. No full Android demonstration is claimed;
camera/AR validation is not a gate for an ordinary-screen phone demo.

## Capability and evidence

| Capability | Established | Remaining limitation |
|---|---|---|
| Shared haptic pipeline | Coherent Mass/contact/Event, Texture, Resonance and Spatial4; existing marble/sand handled together with tilt; opt-in pile/soda implemented; latest post-flash handling positively assessed | Fine material tuning; latest report does not itemize every preset |
| Tilt-plane output | Useful strength and relative directions accepted; filtered common-position plus dynamic-CG/inertia commands | CG/reference-angle semantics and perceptual tuning; not an absent dynamic-CG subsystem |
| StampC5 link | Bidirectional commands/telemetry, resolved-state v3, execution ACK; v4 pile/pressure state received from current firmware in output-OFF model runs | New-material handling/visual agreement and actual Android phone/USB combination untested; camera concurrency only needed for optional AR |
| Desktop visual client | Applied preset/fill/dimensions, Start/Stop, existing visual/felt agreement; richer materials and C++ Lab; latest post-flash test positively assessed | Fine visual/tactile tuning; full studio/A-B/save not implemented |
| Quest client | User confirmed WebUSB applied state and MR container/panel visibility | MR handling/recovery not passed; VR work deferred |
| Stop/recovery | Current combined run verified Idle/audio OFF and both servo torque-OFF readbacks; desktop reconnect stayed OFF | Historical observation is not a claim about current live output |

The complete next-stage Android experience is not yet finished. Passing builds
or separate component tests are not an end-to-end handling result.

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

On the user's return, the current integrated AtomS3 target
`m5stack-atoms3-pipeline-tilt-espnow-monitor` was built and uploaded through COM3.
The current `m5stack-stampc5-espnow-bridge` was built and uploaded through COM4
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

**Latest post-flash handling report.** After the current AtomS3/StampC5 update
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

## Bench and handoff boundaries

Last observed transport arrangement: the current deployment used AtomS3 on COM3
and StampC5 on PC COM4. The deployment/check section above records the latest
readback, ending in water/Idle with both outputs OFF. Do not infer a later cable,
power or output state from that snapshot. Earlier software-only iterations did
not open devices; the subsequent deliberate firmware deployment did.

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
