# 16 Current Facts

Updated: 2026-09-08. This page describes implemented software, the scope of
dated verification, and actual user observations—not the next work plan.
The research objective is coherent fingertip-plane tilt and four-channel
vibration from one device-owned content state, with an agreeing visual client.
Read [00](00_DESIGN_SPECIFICATION.md) for that objective,
[07](07_TEST_AND_VALIDATION.md) for acceptance and evaluation, and
[08](08_IMPLEMENTATION_PLAN.md) for the only active plan.

## Current position

The earlier combined desktop demo received positive handling feedback, followed
by a positive ordinary-screen phone report. That is the exhibition comparison
baseline, not proof that later software changes have been physically accepted.
The working tree now includes richer presentation, servo recovery changes and
joint preference tuning for water, one marble and retained sand.
No human-optimized profiles or demonstrated tactile benefit from tuning exist.

## Capability and evidence

| Capability | Implemented in current software | Physical evidence / pending boundary |
|---|---|---|
| Shared synthesis and tilt | Mass -> Event -> Texture -> Resonance -> Spatial4, with parallel filtered/bounded position and dynamic-CG/inertia tilt; reusable C++ core | Earlier marble/sand runs used both outputs together; later revisions are not thereby validated |
| Haptic Link and applied state | Bidirectional intent/ACK/telemetry, resolved dimensions/fill/material, v3/v4 and heartbeat v5 state | Current AtomS3/StampC5 uploaded; stopped heartbeat/water switching and tilt readback ACK checked; physical tuning remains pending |
| Stop and servo recovery | Exact-length status matching, visible stopped recovery and assembled-profile bounded live retry; generic defaults retained | Earlier Stop/readbacks passed; reported material-switch interruptions are not yet physically resolved |
| Ordinary desktop/phone view | Applied-state controls, pinned Start/Stop, richer water/sand/ice, visual coin contacts and marble depth | Earlier desktop direction agreement and phone use reported; latest audiovisual/tactile fit and phone performance unmeasured |
| Lab and speaker branch | Output-free production C++/Wasm Lab; separate opt-in source-driven sound with recorded water/soda and authored solid Foley | Recorded water sound approved; newer soda/sand changes have no user acceptance yet |
| Preference workspace and profiles | Joint five-axis A/B for three representative materials, save/resume, seven-value selected profiles and explicit stopped demo application | Software/mock checked only; no real A/B ratings or optimized gains established |
| Fictional heartbeat | Shared C++ primary/secondary pulse and contraction; explicit body-wide texture, bounded tilt, v5 state, Web soft-body rendering and named-event sound | Both devices uploaded; named heartbeat state verified over actual radio with outputs OFF; a short handled check remains pending |
| Standalone distribution | Static GitHub Pages workflow and quality-preserving PWA; full-release cache including lazy sound/physics/Wasm and explicit cache repair | Desktop offline/update/recovery tested; actual Android installed-mode USB/resume not yet checked |

Implementation ownership and limits are in [05](05_INTERFACE_SPEC.md),
[06](06_PARAMETER_MODEL.md), the [firmware core](reference/30_REUSABLE_FIRMWARE_CORE.md)
and [visual contract](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).
The [Web guide](../webxr/README.md) owns controls, launch and import/export use.

## Working tree versus installed firmware

On **2026-09-08**, both current images were uploaded from source revision
`b28f18a` (firmware implementation `9ed08e5`): integrated AtomS3 on COM3
(`34:B7:DA:5E:75:90`) and StampC5 bridge on COM4 (`3C:DC:75:8E:05:7C`).
Both uploaders verified written data and rebooted successfully; no filesystem
upload or storage formatting was performed. Port numbers are this session's
identities, not permanent settings. The 2026-09-05 images are superseded.

Installed AtomS3 code now includes exact-length servo reply matching, bounded
live retry, single coin, sharper soda opening, joint tuning setters/readbacks
and heartbeat. The bridge includes the required v5 heartbeat decoder.
Refreshing the Web client alone still does not update either device.

Post-upload, actual ESP-NOW paired automatically. `get state`, stopped loading
of heartbeat and water, and final Stop all returned applied ACKs. The capture
contained 85 snapshots, all Idle/audio runtime OFF/output silenced/tilt disarmed
with zero actuator levels; heartbeat exposed its named 72 BPM v5 state and
water restored ordinary state. Bridge checks reported zero invalid packets,
gaps, serialization errors and command timeouts during this short check.
No Live, audio-enable or tilt-arm command was sent; pulse motion/tactile quality
was not tested. The final preset is `liquid_small_box`, in Idle.

Both servo status records were invalid with a communication fault; actual
torque/position could not be read. Check servo supply/connections before the
next handled run; this snapshot does not identify the cause or establish that
the exhibition interruption is fixed. The earlier software/browser verification
below remains distinct from this stopped hardware communication check.

## Heartbeat and standalone distribution — 2026-09-08

The selected extension is implemented, not physically accepted. A named C++
state drives a 72 BPM doublet, slower contraction, four-channel output and
bounded opposed logical plane deltas. The same state reaches the regenerated
Wasm Lab and v5 client. The visible soft body has no independent beat clock;
optional speaker sound voices the named events with an authored short thud,
not recorded biological heart sounds. Ordinary presets and v1-v4 remain intact.

Focused C++ core/wire integration passed **55,659 assertions**; existing synthesis
tests passed **12/12** across 61,521 frames. Shipped-Wasm heartbeat tests passed
3/3 and existing engine checks 17/17. Protocol tests cover v1-v5 lengths/CRC,
invalid fields, canonical JSON, Stop and return to ordinary v3/v4 state.
Chromium with mocked USB/Serial checked real WebGL contraction, main/secondary
speaker scheduling, duplicate suppression, stale freeze/silence, recovery and
explicit Stop. No physical device APIs were used.

The final local Web suite passed **416/416**, with TypeScript and production
build PASS (existing large physics/scene chunk advisories remain). Sequential
firmware builds passed: baseline AtomS3 **625,761 B flash / 45,996 B RAM**;
integrated AtomS3 **1,075,265 B / 71,100 B**; StampC5 **1,046,295 B / 54,124 B**.
Those checks established build success; the subsequent upload and its limited
hardware evidence are recorded above.

The PWA caches the exact complete release (about 6.3 MiB), including unvisited
Rapier, Wasm and PCM assets. Desktop Chromium checked all three routes and real
Lab execution offline, a waiting update without hot takeover, next-launch
activation with local records preserved, and explicit repair of missing cached
assets without reloading the active demo. This is not an actual Android
installation, USB connection, listening judgment or performance benchmark.
The permanent [HTTPS demo](https://hatodove22.github.io/FresnelInertia/) is live.
[Pages deployment](https://github.com/hatodove22/FresnelInertia/actions/runs/34175503089)
succeeded for Web revision `8fe9b7e`. Desktop Chromium opened the public
[heartbeat Lab](https://hatodove22.github.io/FresnelInertia/?lab=1&preset=heartbeat_soft_object),
rendered its shared-state contraction without page errors and reported the full
release saved for offline use. The public origin was secure and exposed WebUSB;
this does not establish actual phone installation or device connection.

## Previous refactor verification — 2026-09-08

Web results include two behavior-preserving refactors: shared source-time
classification for five presentation consumers, and a session-independent
parameter space for mapping, profiles and Haptic Link. Portable profile readers
no longer import the session/optimizer implementation. Material recovery rules,
parameter acceptance, output authority and saved formats are unchanged.
Ownership is in the [visual contract](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).
Firmware/policy results below remain from the preceding three-representative
iteration; no firmware code changed during these refactors. Earlier counts
describe their dated revisions, not installed hardware.

| Check | Recorded result and scope |
|---|---|
| Web regression | **397/397 PASS**; TypeScript and production build PASS; existing large scene/physics chunk advisories remain |
| Refactor equivalence | Against `26b4582`: 896 presentation outputs / 144,721 numbers exactly equal; 5,956 parameter/profile/acceptance/command-order comparisons equal |
| Baseline AtomS3 | `m5stack-atoms3-pipeline` build PASS; flash **624,145 B**, RAM **45,668 B** |
| Integrated AtomS3 | `m5stack-atoms3-pipeline-tilt-espnow-monitor` build PASS; flash **1,073,121 B**, RAM **70,772 B** |
| Remote tuning policy | C++/Wasm **192 assertions PASS**; valid three-preset transactions, bounds/pair rejection and cancellation covered |
| Schema / whitespace | Both schema checks and diff whitespace check PASS; no wire-layout change in this tuning increment |
| Documentation cleanup | Affected local links/anchors and incoming references PASS; archived plan/ledger content preserved; current-doc consistency review PASS |

The two firmware builds ran sequentially; neither image was uploaded.
StampC5 was not rebuilt for this increment because its code/layout did not change.
C++/Wasm checks are software execution, not measured actuator behavior.

Repeated Chromium rehearsal checks covered all three production-Wasm conditions,
joint proposals, left-hand controls, same/cross-material reuse without inherited
votes, archive resume, profile JSON and malformed import, 412 px layout, quota
failure and export after a failed same-key profile overwrite.

Chromium with injected Web Serial checked all three stopped applications,
seven values/11 execution ACKs, Q/W presentation and A/D voting, friction
receipts, JSON resume, foreign-material rejection, cancellation and v1/v2
compatibility. Ordinary-demo regression was repeated after refactoring and passed
profile JSON roundtrip,
exact seven-value stopped application, no auto-Start, delayed-set Stop
cancellation/reapplication, keyboard/audio/recovery/mobile Stop/stale flows.
The production Lab solid-depth browser check passed both pitch directions,
pause/reset and mobile layout for marble, coins and single coin. Water/sand
selection, motion and pause were also inspected. There were no page errors.
Mock transport, software WebGL and muted/silent audio are not physical USB,
Android performance or listening evidence.
Reproduction commands are in the [Web guide](../webxr/README.md) and
[development setup](reference/19_DEVELOPMENT_SETUP.md).

## User observations and evaluation status

- **2026-09-05 combined handling:** desktop visual/felt direction agreement;
  marble/sand vibration and tilt ran together. Recorded Stops reached Idle,
  audio OFF and valid servo torque-OFF readback. The user reported improvement,
  no unwanted residual vibration and remaining imperfect smoothness.
- **2026-09-05 pre-kick overall report:** “テストの結果はかなり良好！このまま展示にも使えそうなぐらい！”
  This positive aggregate judgment did not itemize preset/settings coverage,
  duration or every acceptance item. It does not assess later soda recoil.
- **2026-09-07 phone report:** “スマホでも動作検証出来ました！いい感じですね”.
  Phone model/browser, firmware revision, per-flow coverage and performance
  were not recorded; the later speaker/visual changes are outside this report.
- **2026-09-08 listening:** recorded water sound received “音めっちゃ良いじゃん！”.
  This does not approve the subsequent recorded soda or revised sand surface.
- **Preference tuning:** no actual user A/B dataset or validated improvement yet.
  Rehearsal is not tactile evaluation; zero comparisons is unevaluated.
  Device-mode preference labels are self-report, not authenticated or measured
  proof. Exported profiles contain selected settings/provenance, never votes.

Original quotations, counters, captures and their limitations are preserved in
the [development ledger](archive/2026-09-08/16_DEVELOPMENT_LEDGER.md).

## Current issues and unverified behavior

- **Material-switch servo interruptions:** a matching late-response defect was
  reproduced and corrected in software; no incident trace proves it explains
  every exhibition failure. Same-ID/same-length stale replies remain ambiguous.
  The corrected firmware and requested brief live retry are now deployed but
  still lack a handled switch/recovery result; the issue is not closed.
- **Depth versus sound/haptics:** marble depth, individual coin contacts and
  fore/aft liquid motion can occur without corresponding C++ contact events.
  They do not generate extra speaker/haptic hits; exact per-object landing
  synchronization is not supported. The combined perceptual fit is unverified.
- **New physical tuning and soda:** execution ACKs establish parameter writes;
  only four tilt coefficients have numeric readback. Gain/material values do
  not. New profile application, sharper recoil and recovery catch-up feel have
  no handled acceptance. Remaining smoothness has no isolated single cause.
- **Phone coverage:** latest rendering cost, sound latency and feature-specific
  operation remain unmeasured. Desktop narrow-viewport checks are not a phone
  benchmark. Optional hand-following Android AR is not implemented.

## Modeling and evidence limits

Firmware content travel/contact and tilt-force calculations use body x/y.
Body z is acquired/transformed but adds no independent fore/aft haptic dynamics;
the retained sand pile has dy/dx only, not a dy/dz deposit or retained depth CG.
Visual liquid modes, coin rigid bodies and thin sand erosion/deposition are
presentation extensions, not full CFD/DEM or reconstructed physical content CG.

Dynamic CG already exists as a reduced estimate combined with shell CG.
The position-based common cue is empirical; grip gain uses nominal force,
not measured FSR input. Calculated tilt commands are not measured force or angle.
The soda charge/recoil is authored, not a thermodynamic/medical model.
The fictional heartbeat has pulse telemetry but no biometric/grip-sensing path
or demonstrated tactile acceptance. Research proposals and illustrative atlas sketches
are not deployed capabilities or perceptual results.

The previous 1,381-line status ledger is preserved in full under
[2026-09-08](archive/2026-09-08/16_DEVELOPMENT_LEDGER.md), including superseded
approaches and earlier revision-specific checks. The [archive index](archive/README.md)
locates portable evidence and explains local-only captures. Historical bench
states and deferred Quest checks are not current hardware facts or new gates.
Follow [08](08_IMPLEMENTATION_PLAN.md) for priorities; do not derive a second
plan from this status page or archived checklists.
