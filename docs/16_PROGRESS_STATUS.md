# 16 Current Status

Updated: 2026-09-05. This is the evidence ledger, not a second work plan.
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
VR/Quest. The tuning studio, A/B/save workflow, perceptual-shape controls, new
liquid/sand visuals, refined CG mapping and tracked Android AR are **planned,
not implemented**. Existing Quest evidence is retained, but its unfinished
checks are not current prerequisites. No full Android demonstration is claimed.

## Capability and evidence

| Capability | Established | Remaining limitation |
|---|---|---|
| Shared haptic pipeline | Coherent Mass/contact/Event, Texture, Resonance and Spatial4 implemented; marble/sand handled together with tilt | Liquid/hybrid naturalness and remaining smoothness |
| Tilt-plane output | Useful strength and relative directions accepted; filtered common-position plus dynamic-CG/inertia commands | CG/reference-angle semantics and perceptual tuning; not an absent dynamic-CG subsystem |
| StampC5 link | Bidirectional commands/telemetry, resolved-state v3, real execution ACK and applied configuration | Actual Android phone/USB/camera combination untested |
| Desktop visual client | Applied preset/fill/dimensions, Start/Stop, device-driven visual/felt agreement and Idle page reconnect | New studio/A-B/save and material-visual improvements not implemented |
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
