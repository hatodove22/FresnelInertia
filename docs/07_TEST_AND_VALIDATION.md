# 07 Demo Acceptance

This document defines meaningful end-to-end acceptance, not a test campaign.
[00](00_DESIGN_SPECIFICATION.md) owns the concept,
[08](08_IMPLEMENTATION_PLAN.md) owns priorities, and
[16](16_PROGRESS_STATUS.md) alone owns results, deployment and host coverage.
Earlier bring-up observations remain in the [archive](archive/README.md).
A previous result applies to its recorded revision and condition; a skipped
trial is not a pass.

## Integrated demo quality

The core experience is one handheld container whose shared content state drives
two fingertip planes and four vibration channels. Tilt conveys sustained
direction, center-of-mass shift and inertia; vibration conveys contacts, flow
and texture. They should feel like consequences of the same contents, not
unrelated effects. This is a demo-quality judgment, not yet proof that combining
the branches improves perception relative to either branch alone.

| Acceptance | What the handled demonstration must show |
|---|---|
| Causal content response | Deliberate tilt/motion produces legible movement, contact and settling. Holding still does not sustain unexplained chatter; retained sand bias may remain. |
| Direction and simultaneous output | Both gripped contact planes and all four vibration channels remain usable together. Motion reversal and content movement give coherent directional cues without disruptive pauses or unwanted residual output. |
| Material contrast | The same gesture reveals a meaningful difference between representative conditions, not only arbitrary loudness. Water, one marble and retained sand cover flow, collision and friction/CoG; choose the conditions relevant to the change. |
| Connected presentation | The claimed host shows device-applied material, fill and dimensions, distinguishes pending/stale/preview state, and preserves a convincing visual/felt relation during handling. |
| Stop and recovery | Stop quiets output. A material change or reconnect reports actual state and requires deliberate restart; stale data or a rejected command never appears as successful application. An affected recovery fix must work without relying on reboot as its success criterion. |

The device model is a body x/y cross-section, not full 3D content dynamics.
Visual marble depth, liquid detail and independent coin bodies enrich that
presentation; they do not add body-z haptic contacts or measured device CoG.
Individual visual coin landings need not equal the aggregate haptic contacts.
Judge whether this approximation works for the claimed experience; do not
describe convincing imagery alone as evidence of exact physical agreement.
Optional speaker audio is another presentation branch, not the four-channel
actuator signal or a lossless replay of every contact.

## One focused rehearsal

Reuse completed hardware evidence for unchanged paths. Use the installed
firmware, usual grip and existing effective limits; normal supervised testing
does not require repeated power cycling.

1. Identify the changed behavior, firmware/profile and host. Begin stopped and
   inspect the actual connection/device state. Use the existing recovery action
   only if a present fault requires it.
2. Deliberately start simultaneous tilt and vibration. For about 30 seconds,
   hold still, tilt/reverse, make a content-moving gesture, then settle. Judge
   strength, direction, continuity and the shared cause of the two cues.
3. Compare the relevant material conditions with the same gesture. For a
   material-switch change, perform Stop -> selection/application -> explicit
   Start once. For a recovery change, exercise its relevant interruption and
   recovery, judging any catch-up as well as whether communication returns.
4. On a connected run, check the applied scene and felt response on the actual
   host being claimed. Test reconnect/restart when that path changed. Prior
   desktop, phone or Quest evidence does not establish a different host,
   untested flow or later firmware revision; use the recorded scope in 16.
5. Stop and inspect fresh reported Idle/output-off state. Distinguish software
   output status from actuator readback; missing confirmation is unknown, not
   success. Record the short outcome and any remaining defect in 16.

If a step fails, retain the action, observed sensation and relevant state change,
repair that failure and repeat the affected portion. Do not restart unrelated
bring-up. Hardware setup and operating commands belong in
[04](04_HARDWARE_AND_PIN_SPEC.md) and [05](05_INTERFACE_SPEC.md).
AR, hand tracking and Quest are not prerequisites for ordinary-screen use.

## Proportionate software checks

| Changed area | Relevant check |
|---|---|
| Documentation | Diff, consistency and affected local links. |
| Web interaction or renderer | Typecheck/build, focused tests and the affected browser flow; inspect the actual scene for visual changes. |
| Firmware/model | Affected build and deterministic regression; baseline when shared code or gates change. Follow with the changed handled behavior, not an exhaustive retest. |
| Protocol/applied state | Valid/invalid and compatibility fixtures, sender/receiver builds, and the affected application/Stop path. |
| Recovery/output logic | Reproduce the observed fault, test bounded recovery and Stop cancellation, then one representative handled check. |

[Development setup](reference/19_DEVELOPMENT_SETUP.md) owns executable commands,
including sequential PlatformIO builds and the isolated StampC5 cache.
The [Web guide](../webxr/README.md) owns browser/Lab operation;
the [explainer guide](../explainer/README.md) owns CAD, atlas and film checks.
Those publication checks are not handheld-demo acceptance gates.

While handling is unavailable, use the output-free production-C++ Lab and
mock-transport browser tests. They establish model, presentation and command
behavior, not measured actuator response, touch quality or actual mobile USB.
Build success, synthetic timing and test counts do not establish those results.
Long soaks, exhaustive poses, old test matrices and evidence hashes are not
routine prerequisites for a focused demo iteration.

## Research evaluation — not yet performed

The research question is whether shared-state fingertip tilt and spatial
vibration provide useful complementary cues for a coherent contents experience.
The implementation and positive operator reports motivate that question; they
do not establish novelty, perceptual superiority, four independently perceived
locations, a measured equivalent mass, or the contribution of each branch.

The three-material joint five-axis preference workspace is a tuning tool.
Ordinary comparisons evaluate vibration and tilt together, preserve the
baseline, and keep different materials and rehearsal/device votes separate.
A selected setting is a recorded preference, not a validated optimum or a
demonstration that the optimizer improves human performance.

If branch contributions or research efficacy are later evaluated, define a
separate experimental protocol: a stated outcome, fixed gains/geometry/gesture
conditions, presentation order, and control of visual/speaker and mechanical
sound cues. A comparison with one branch removed answers a different question
from finding a good combined setting. Participant counts and analysis belong
to that future design; no ablation study is required by the present demo task.
A fictional heartbeat or another expressive extension is a separate application,
not evidence for the container model or a new core acceptance requirement.
