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
| Haptic Link and applied state | Bidirectional intent/ACK/telemetry, resolved dimensions/fill/material, v3 and optional v4 pile/pressure state | Deployed pre-integration firmware transported v4 with outputs OFF; new tuning setters/readback remain unflashed |
| Stop and servo recovery | Exact-length status matching, visible stopped recovery and assembled-profile bounded live retry; generic defaults retained | Earlier Stop/readbacks passed; reported material-switch interruptions are not yet physically resolved |
| Ordinary desktop/phone view | Applied-state controls, pinned Start/Stop, richer water/sand/ice, visual coin contacts and marble depth | Earlier desktop direction agreement and phone use reported; latest audiovisual/tactile fit and phone performance unmeasured |
| Lab and speaker branch | Output-free production C++/Wasm Lab; separate opt-in source-driven sound with recorded water/soda and authored solid Foley | Recorded water sound approved; newer soda/sand changes have no user acceptance yet |
| Preference workspace and profiles | Joint five-axis A/B for three representative materials, save/resume, seven-value selected profiles and explicit stopped demo application | Software/mock checked only; no real A/B ratings or optimized gains established |

Implementation ownership and limits are in [05](05_INTERFACE_SPEC.md),
[06](06_PARAMETER_MODEL.md), the [firmware core](reference/30_REUSABLE_FIRMWARE_CORE.md)
and [visual contract](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).
The [Web guide](../webxr/README.md) owns controls, launch and import/export use.

## Working tree versus installed firmware

The current source includes the 2026-09-07 integration and subsequent changes.
The latest confirmed AtomS3 upload was the **2026-09-05 pre-integration soda
common-mode recoil increment**. StampC5 last received the earlier same-day
pile/pressure-capable baseline. Neither device received the later merged build.
Refreshing the Web client updates presentation/Lab, not installed device code.

Unflashed AtomS3 changes include exact-length servo reply matching, bounded live
retry, the single-coin preset, sharper soda opening and three-material tuning
setters/four tilt readbacks. These additions do not require a StampC5 update.
Existing preset defaults, physical output bounds and Stop remain preserved.

The last directly captured bench snapshot followed that recoil upload: AtomS3
reported Idle/audio OFF/tilt disabled, neither servo answered the non-actuating
PING, and StampC5 was absent/unpaired. The user ended hardware work at upload.
This is a **dated observation, not the present connection, power or fault state**.
Later phone feedback does not identify its exact installed firmware.
No hardware was accessed, flashed or actuated during the latest software checks
or this documentation consolidation.

## Latest software verification — 2026-09-08

Web checks include the documentation/code-hygiene pass: unused IWSDK runtime
dependencies/logging were removed and material labels reused from their registry.
The development plugin and retained WebXR path remain. Firmware and policy
results below are from the preceding three-representative/profile iteration;
that code was unchanged during cleanup. Earlier counts belong to their dated
revisions in the [ledger](archive/2026-09-08/16_DEVELOPMENT_LEDGER.md).

| Check | Recorded result and scope |
|---|---|
| Web regression | **386/386 PASS**; TypeScript and production build PASS; existing large scene/physics chunk advisories remain |
| Baseline AtomS3 | `m5stack-atoms3-pipeline` build PASS; flash **624,145 B**, RAM **45,668 B** |
| Integrated AtomS3 | `m5stack-atoms3-pipeline-tilt-espnow-monitor` build PASS; flash **1,073,121 B**, RAM **70,772 B** |
| Remote tuning policy | C++/Wasm **192 assertions PASS**; valid three-preset transactions, bounds/pair rejection and cancellation covered |
| Schema / whitespace | Both schema checks and diff whitespace check PASS; no wire-layout change in this tuning increment |
| Documentation cleanup | Affected local links/anchors and incoming references PASS; archived plan/ledger content preserved; current-doc consistency review PASS |

The two firmware builds ran sequentially; neither image was uploaded.
StampC5 was not rebuilt for this increment because its code/layout did not change.
C++/Wasm checks are software execution, not measured actuator behavior.

Prior Chromium rehearsal checks covered all three production-Wasm conditions,
joint proposals, left-hand controls, same/cross-material reuse without inherited
votes, archive resume, profile JSON and malformed import, 412 px layout, quota
failure and export after a failed same-key profile overwrite.

Chromium with injected Web Serial checked all three stopped applications,
seven values/11 execution ACKs, Q/W presentation and A/D voting, friction
receipts, JSON resume, foreign-material rejection, cancellation and v1/v2
compatibility. Ordinary-demo regression was repeated after cleanup and passed
profile JSON roundtrip,
exact seven-value stopped application, no auto-Start, delayed-set Stop
cancellation/reapplication, keyboard/audio/recovery/mobile Stop/stale flows.
Cleanup also checked the tuning page's C++ A/B rehearsal and keyboard answer
advancing to the next comparison while stopped. There were no page errors.
Mock transport, software WebGL and muted/silent
audio are not physical USB, Android performance or listening evidence.
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
  The corrected firmware and requested brief live retry still lack deployment
  and a handled switch/recovery result; the issue is not closed.
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
The fictional heartbeat remains unimplemented; it has no pulse telemetry or
biometric/grip-sensing path. Research proposals and illustrative atlas sketches
are not deployed capabilities or perceptual results.

The previous 1,381-line status ledger is preserved in full under
[2026-09-08](archive/2026-09-08/16_DEVELOPMENT_LEDGER.md), including superseded
approaches and earlier revision-specific checks. The [archive index](archive/README.md)
locates portable evidence and explains local-only captures. Historical bench
states and deferred Quest checks are not current hardware facts or new gates.
Follow [08](08_IMPLEMENTATION_PLAN.md) for priorities; do not derive a second
plan from this status page or archived checklists.
