# 25 Development Workflow and Wireless Debug Plan

## 1. Status and authority

This is a supporting execution plan for the active Gate 1 work. It does not
replace the roadmap in `08_IMPLEMENTATION_PLAN.md`, change the required order
in `AGENTS.md`, or claim that wireless operation has been validated.

The purpose is to minimize bench-only iteration while preserving the current
safe production defaults. Work in this plan may proceed ahead of hardware only
when it does not enable a physical output, tune around the powered-settling
failure, or bypass a roadmap gate.

Gate 1 changes an already implemented mass-motion baseline only to remove a
powered safety defect that blocks safe execution of the already implemented
resonance-identification baseline. It is corrective work, not an attempt to
move a new Gate 3 feature ahead of the required `AGENTS.md` order.

Implementation checkpoint on `2026-08-27`:

- Slice 1 schema validation is implemented: retained valid samples pass and
  eleven expected-invalid fixtures are rejected for their exact reasons,
  including the previously unenforced `maximum` bound.
- `native-layers` is implemented with pinned native/Unity versions, a strict
  six-production-layer source filter, seven passing deterministic tests, and a
  reviewed 400-frame legacy fingerprint with no automatic update path.
- `m5stack-atoms3-pipeline` still builds after the host-test dependency cleanup.
- The extended Gate 1 activity fixtures and Slice 2 behavior remain next; no
  gravity-separation firmware change or upload is claimed by this checkpoint.

## 2. Primary decisions

1. The critical path remains:

   ```text
   native harness -> legacy fingerprint -> activity fix + new_evt
     -> USB-only Gate 1 -> powered Gate 1 -> mounted resonance Gate 2

   diagnostic contract -> codec/policy/schema + bounded scheduler
     -> muted wireless observer
     -> optional post-Gate-1 wireless OFF/ON comparison
        (required before wireless is used in powered work; it does not block Gate 2)
   ```

2. Wireless debugging will reuse the existing SoftAP, HTTP, WebSocket, JSON,
   and telemetry foundations. BLE, UDP, OSC, and a new binary protocol are not
   needed for the first developer workflow.
   Here, wireless debugging means observation, log capture, automated
   assertions, and later bounded control; USB/JTAG remains the path for
   breakpoint and low-level crash debugging.
3. The normal `m5stack-atoms3-pipeline` environment remains remote-compile-off.
   Wireless observation is introduced in a separate AtomS3 debug environment.
4. The first wireless build is telemetry-only and accepts no network request
   that changes pipeline state. A priority Safe Idle network command is a
   separate sub-slice after queue clearing, command-generation invalidation,
   and dual policy checks exist. Remote output arm, Live entry, calibration
   start, replay start, tilt arm, safety-disable, and output-limit changes stay
   rejected.
5. OTA is not part of the first wireless slice. Wireless telemetry must prove
   stable first, and OTA later requires a separate maintenance gate, local
   consent, image authentication, rollback, and retained USB recovery.
6. `HapticPipeline` will not be broadly HAL-refactored to obtain tests. The
   existing deterministic rendering layers will be tested directly first;
   narrow clock, safety, storage, and audio-writer seams are added only when a
   concrete fault-injection test needs them.

## 3. Current leverage and gaps

### Reusable now

- `MassMotionLayer`, `EventLayer`, `TextureLayer`, `SpatialRenderer4`, and
  `TiltPseudoForceModel` use explicit `dt_s`; `ResonanceLayer` is stateless and
  does not need `dt_s`. These layers contain no random source. Most reset
  through `configure()`; `TiltPseudoForceModel` requires its explicit
  `reset()` as well.
- `MassMotionLayer.cpp` no longer carries its unused `Arduino.h` dependency and
  is directly compiled by the host harness without changing its legacy output.
- `TelemetrySnapshot` and every serializer now carry always-present
  `frame_counter`, current-frame `new_evt`, and boot-cumulative `evt_total`;
  optional `pipeline_debug.event_count` mirrors `new_evt` for compatibility.
- `RemoteInterface` already provides SoftAP/station setup, an HTTP status page,
  WebSocket JSON telemetry, bounded client buffers, and a control-message
  queue for retained StickS3 targets.
- control and telemetry schemas now have positive and expected-invalid samples.

### Gaps to close before AtomS3 wireless enablement

- the native layer environment and legacy fingerprint exist; the extended
  orientation/noise/motion/alias/pulse fixture library is not complete yet
- build/profile identity, boot identity, IMU age, loop timing, and bounded
  transport/drop counters are not yet part of the canonical frame
- JSON codec and command policy are embedded in `RemoteInterface.cpp`
- missing or invalid `run_mode` currently falls back to Live
- the existing remote control path can enable audio, start calibration, and
  alter safety-related flags
- queue-full, parse failure, and output-drop cases are not all observable
- receive work per control-loop tick is not budgeted tightly enough
- no request ID or ACK/NACK with an explicit rejection reason
- no host-side capture/assertion tool produces a reproducible bench artifact
- no build/profile identity is automatically attached to telemetry or logs

## 4. Parallel work lanes

| Lane | Can proceed without hardware | Dependency | May change physical behavior |
|---|---|---|---|
| A - deterministic core | native environment, fixtures, legacy fingerprint, activity-filter tests | first priority | no |
| B - observability contract | `new_evt`, frame/build/profile identity, timing and drop counters, schema samples | agree field names with Lane A | no |
| C - protocol safety | extract JSON codec and command policy; negative, queue, and frame tests | telemetry/control contract | no |
| D - lab automation | NDJSON capture, offline assertions, run manifest, report generation | Lane B schema | no |
| E - wireless observer | separate AtomS3 environment, monitor policy, low-rate SoftAP telemetry | Lanes B and C | no; output remains locally gated |
| F - future-gate tests | wall-hit single-shot, atom lifetime, spatial adjacency, resonance CSV analysis | native harness | no tuning or new atoms |

Lane A owns `Parameters.hpp`, `MassMotionLayer.*`, the future activity filter,
and the Gate 1 algorithm. Lane B/C work should prefer new protocol/test files
until Lane A stabilizes, reducing merge conflicts in `HapticPipeline.cpp` and
`HardwareProfiles.hpp`.

Planned ownership-oriented layout:

```text
include/haptics/
  MotionActivityFilter.hpp       production estimator used by host tests
  ControlProtocol.hpp            transport-independent JSON contract
  RemoteCommandPolicy.hpp        pure access decision
src/
  MotionActivityFilter.cpp
  ControlProtocol.cpp
  RemoteCommandPolicy.cpp
test/
  native_layers/                 Unity production-layer tests
    fixtures/imu/                committed numeric input traces
  native_protocol/               codec/policy/scheduler tests
  schema/                        positive and expected-invalid JSON samples
tools/lab/                       capture, assertions, manifest, report
schemas/
  control_result.schema.json     planned ACK/NACK contract
```

Names may be adjusted during implementation, but the production estimator and
policy must not be duplicated inside the test or host-tool directories.

## 5. Small implementation slices

Each slice answers one question and should remain independently reviewable.
Hardware evidence is committed separately from the code that produced it.

### Slice 1 - Make validation trustworthy

Scope:

- add `maximum` support to `test/schema/validate_schemas.mjs`
- add invalid fixtures for required fields, unknown fields, enum errors,
  actuator count, and peak-limit overflow
- add a PlatformIO native test environment with, at minimum,
  `platform = native`, `test_framework = unity`, and
  `test_build_src = yes`; use a strict `build_src_filter` that starts with
  `-<*>` and includes only the production layers under test
- set `test_filter = native_layers/test_native_layers` for the first suite so
  fixture directories cannot be discovered as independent PlatformIO test
  suites
- pin the exact native-platform and Unity/tool versions resolved by this
  slice in repository configuration rather than relying on a floating latest;
  record the host compiler name/version in test output, and pin that compiler
  in CI/container execution when the workflow is added
- remove only the unused Arduino include required to compile the production
  mass layer on the host
- create a deterministic 400-frame production-layer trace runner at 250 Hz
- capture the feature-disabled legacy output as a deliberate fingerprint with
  an exact discrete timeline hash and tolerance-bounded output-shape statistics

The first source filter covers only `MassMotionLayer`, `EventLayer`,
`TextureLayer`, `ResonanceLayer`, `SpatialRenderer4`, and
`TiltPseudoForceModel`; the new activity filter and protocol-policy sources
are added explicitly when their slices begin. Pulling all of `src/` into the
native build is not acceptable because it silently imports Arduino, storage,
Wi-Fi, and audio dependencies.

The legacy golden file stores exact discrete fields and tolerance-bounded or
quantized floating-point fields. Expected output is never regenerated during
a normal test. Updating it requires a focused manual initializer edit, a reason
in the change description, and review of the golden diff; the test binary has
no update/write mode.

Acceptance:

- valid schema samples pass and invalid samples fail for the expected reason
- native tests execute production layer code rather than a reimplementation
- repeated runs match the reviewed fingerprint within its documented
  quantization/tolerance
- `configure()`/explicit layer reset returns stateful layer output to the
  result of a fresh instance; separate firmware/HIL tests remain responsible
  for proving that preset change, Safe Idle, and stale-stop paths actually
  invoke those resets
- firmware source behavior is unchanged
- the standard firmware build matrix still passes

### Slice 2 - Close the Gate 1 signal-path defect

Scope:

- add a shared deterministic IMU fixture runner whose metadata fixes sample
  rate, axis, phase, amplitude, warm-up, measurement window, and comparison
  tolerance
- add six principal one-g poses plus at least one diagonal pose
- add a committed numeric stationary-noise trace with fixed accelerometer and
  gyro biases; do not depend on `std::normal_distribution`, whose sequence can
  vary between standard-library implementations even with a fixed seed
- add separate gravity-vector rotation and translation-on-gravity traces at 1,
  4, and 8 Hz, plus 70/90 Hz alias traces and a fixed pulse followed by a
  30-second hold
- add a small production-owned `MotionActivityFilter` or equivalent state
- keep quasi-static gravity available to latent position and tilt
- use only gravity-separated, band-limited, deadbanded motion for energy and
  agitation
- keep the feature default `false`; opt in only from the as-built AtomS3
  profile
- reset filter state on configure, Safe Idle, preset transition, a raw long
  time gap, and stale-safe-stop; a single invalid IMU sample follows the hold
  contract below rather than being described ambiguously as a reset

Capture raw sample validity and raw `dt_s` before the current pipeline replaces
large values with its nominal interval. Put that guard in a production-owned
boundary used before any enabled-path `MassMotionLayer` update, and exercise
that same boundary in native tests. The raw long-gap indication must reach the
filter before any downstream `dt_s` normalization. Do not implement this only
inside a host fixture or only inside the filter while still passing the raw
invalid value to the Mass integrator.

The enabled estimator has an explicit input-time contract. A non-finite or
non-positive `dt_s` is rejected before the Mass update without advancing
estimator or Mass dynamic state. A single invalid IMU sample holds estimator
and latent position state, presents zero current-frame motion activity, and
cannot create a new event. A valid sample with raw `dt_s > 0.05 s` clears the
enabled estimator and dynamic Mass state and produces neutral activity for
that sample.
The existing 300 ms IMU-stale transition remains a separate pipeline safety
path and clears all relevant dynamic state. The feature-disabled legacy path
retains its current valid-input behavior and current long-gap normalization;
the non-finite/non-positive guard is a separately reviewed safety correction.

Acceptance at fixed `dt=0.004 s`:

- all six static `+/-X`, `+/-Y`, `+/-Z` one-g orientations settle below
  `energy=0.02` for the enabled path
- the committed diagonal, bias, and numeric-noise-trace cases satisfy the same
  settled bound
- a bounded pulse raises activity and returns below `0.02` within two seconds
- after any allowed initialization transient, the sum of current-frame
  `new_evt` is zero during the following 30-second simulated hold
- translation-on-gravity at 1, 4, and 8 Hz remains observable, while a slow
  rotation of the gravity vector does not become persistent agitation; the
  numeric observable lower bounds are committed with the fixtures before the
  filter result is accepted
- carrier/alias candidates are strongly attenuated relative to 4 Hz motion;
  the primary metric is RMS of the `MotionActivityFilter` translational output
  and the secondary metric is downstream `MassState.energy`. The initial
  filter-output target is no more than 25 percent of the 4 Hz case, with a
  separate committed energy bound. Any threshold change requires fixture
  evidence, a stated reason, and review before hardware tuning
- finite bounds hold for sensor bias, invalid, NaN/Inf, non-positive `dt`, and
  a long time step
- feature-disabled output matches the Slice 1 fingerprint

### Slice 3 - Add the minimum diagnostic contract

Implementation checkpoint on `2026-08-27`: the first three event/sequence
items below are complete across `TelemetrySnapshot`, serial, Recorder, Remote,
schema, and positive/expected-invalid fixtures. The wider identity, timing,
heap, and transport-health portion remains open.

Scope:

- print current-frame event count as `new_evt`; retain `last_event` as history
- emit `frame_counter` and a boot-cumulative `evt_total`, with both saturated
  at the JSON safe-integer limit
- preserve `evt_total` while clearing `new_evt` on Safe Idle, stale stop,
  preset/reconfiguration, Record, and Replay transitions
- add schema/build/profile identity needed to associate a log with firmware
- expose a per-boot `boot_id`, reset reason/count, IMU sample age, and a
  bounded loop-period summary including p99, p99.9, maximum, and missed 4 ms
  periods
- expose I2S error/underrun deltas, current/minimum free heap, largest free
  block, remote processing-time summary, and remote parse/queue/drop counters
  as optional debug telemetry
- keep full-rate raw IMU and PCM data out of the wireless stream

Acceptance:

- a latched prior event is distinguishable from `new_evt=0`
- every captured file identifies the firmware build, PlatformIO environment or
  hardware profile, preset source, effective output limit, and schema version
- reset, I2S, heap, loop-deadline, IMU-age, and remote-load fields needed by
  the later acceptance tests are present or the test is explicitly marked
  unsupported; no acceptance decision relies on an unrecorded value
- debug fields are feature-gated and do not change baseline output
- Remote, Recorder, schema fixtures, serial status, and documentation agree

### Slice 4 - Separate and test protocol policy

Scope:

- move JSON parse/serialize into a transport-independent codec
- represent missing/invalid enums as rejection, never a Live default
- add a pure deny-by-default command-policy function with explicit access
  modes and a compile-time maximum access level for each environment
- carry transport origin, authenticated monitor session, access level,
  mutating-authority generation, and any control lease with every accepted
  message; enforce policy both before queue insertion and immediately before
  execution
- add a protocol version/capability envelope, server `boot_id`/session nonce,
  monotonic client request sequence, and a `control_result` ACK/NACK envelope
- define ACK as the executed result, not merely parse or queue success; reject
  old-session, duplicate, and out-of-order requests without executing them
- retain the existing StickS3 v1 behavior only in its existing environments;
  the Atom observer requires the new protocol capability and never silently
  falls back to the legacy command semantics
- keep Wi-Fi network admission separate from command authorization; a later
  mutating lease uses a secret delivered through the local approval channel
  and never normal telemetry. Without WSS, every mutating request uses an HMAC
  bound to the server session nonce, monotonic request sequence, and canonical
  command body; a replayable bearer token is not accepted
- validate the intended WebSocket path and allowed origin policy, require
  masked client frames, handle close/ping correctly, and reject unsupported
  fragmentation or payload sizes explicitly
- bound receive bytes, decoded frames, and processing time per tick
- count malformed, oversized, unauthenticated, rejected, queue-full, and
  transmit-drop cases
- require command-specific fields and maximum string/array lengths, reject
  forbidden/extra fields and silent truncation, and add negative fixtures for
  every command; if conditional JSON Schema keywords are used, extend or
  replace the local validator before relying on them

Safe Idle is also the mutating-authority invalidation point. Entering it clears
queued mutating work, invalidates the control lease/token, increments the
mutating command generation, and prevents a delayed or replayed arm command
from surviving. The transport connection is downgraded to Monitor rather than
destroyed, so it can return the executed ACK and postcondition telemetry. A
later remote Safe Idle command uses a separate priority, idempotent path and is
accepted only from an authenticated monitor session; it is not part of the
first telemetry-only observer.

Initial access modes:

| Mode | Allowed |
|---|---|
| Disabled | no network service |
| Monitor | outbound telemetry and request-telemetry only; no state mutation |
| Monitor + safe stop | later: Monitor plus priority, authenticated, idempotent Safe Idle |
| Tune muted | later: allowlisted non-output parameters only while Idle, audio zero, and tilt disarmed |
| Bench lease | later: locally approved, expiring authority for selected output commands |

Acceptance:

- missing, unknown, stale, duplicate, malformed, and oversized commands are
  rejected with an observable reason
- every command type has a policy-table test
- Monitor mode cannot arm audio/tilt, enter Live, start calibration/replay, or
  disable an IMU safety or hard output clamp
- direct queue injection, every command type, every `set_param` path, and
  preset-loading attempts cannot bypass either policy check
- once the later safe-stop sub-slice exists, parser/scheduler tests prove it
  cannot be starved by a backlog, invalidates earlier work, and is confirmed
  only by a newer telemetry sample reporting Idle, audio disabled, digital
  zero asserted, tilt disarmed, and dynamic state cleared

### Slice 5 - Add the AtomS3 wireless observer

Scope:

- add a separate environment such as
  `m5stack-atoms3-pipeline-wireless-debug`
- keep the normal production environment unchanged and remote-compile-off
- add a local-only runtime enable/disable switch so the exact observer binary
  can be measured with Wi-Fi OFF and ON; it remains OFF until credentials are
  provisioned, and every capture records the resolved state. Toggling is
  allowed only in Safe Idle with audio zero asserted and tilt disarmed; a
  request to start or stop the radio from Live or another active mode is
  rejected
- start with SoftAP only, one client, telemetry-only Monitor policy, and 5 Hz
  latest-value telemetry; compile OTA and HTTP application/status routes out
  of this image, retaining only the bounded HTTP Upgrade needed for WebSocket
- use a device-specific SSID and a cryptographically random credential stored
  in NVS and revealed or rotated only through a deliberate local button/USB
  procedure while outputs are safe; generation failure disables networking,
  and there is no hard-coded fallback
- treat WPA admission as the initial monitor-only trust boundary and document
  its denial-of-service limitation; any later mutating command additionally
  requires a boot-bound authenticated token from the local approval channel
- never place a password/token in normal logs, telemetry, HTTP content, or a
  URL query; define credential rotation and factory-reset erasure before use
- fail closed to network-disabled if credentials are absent, corrupt, or the
  wrong length, or if SoftAP creation, socket bind, or server start fails;
  runtime status reports disabled plus a USB-readable reason rather than
  claiming the observer is active
- save telemetry on the host rather than LittleFS
- use a dedicated lab client first. The HTTPS
  WebXR app cannot be assumed to connect directly to an insecure `ws://`
  endpoint because of browser mixed-content policy; WSS or a trusted bridge is
  a later Gate 11 decision

Initial scheduler budgets, to be confirmed or tightened by USB profiling
before the first powered comparison, are:

- at most one client, 256 received bytes and one total frame of any opcode per
  4 ms control tick
- a 500 microsecond hard remote-work budget per tick, covering handshake,
  receive, every WebSocket opcode, JSON parse/serialize, socket-capacity
  checks, and writes; bounded atomic operations must fit the remaining budget,
  while unfinished work is deferred or dropped by a tested counter-visible
  rule
- a 2048-byte maximum inbound application frame, a separately bounded
  4096-byte outbound telemetry frame, and a two-second deadline for both
  handshake completion and an incomplete frame
- immediate rejection of a second client; repeated telemetry requests are
  coalesced
- telemetry is latest-only, is written only when the socket has capacity,
  increments a drop counter otherwise, and disconnects a client after a fixed
  tested run of consecutive drops (initially 20)
- serialization overflow, missing required output fields, schema-invalid test
  output, or a partial socket write never emits a truncated frame; increment a
  dedicated counter and disconnect when needed to discard a partial frame

Host tests cover Upgrade/Connection/Version 13/Key/path/origin validation,
mandatory client masking, FIN/RSV handling, binary/fragment rejection,
ping/pong/close control frames, length rejection before allocation, partial
handshake/frame deadlines, slow readers, malformed floods, and connection
churn. Each limit is a named constant and is reported in the build/profile
manifest.

Acceptance with output disabled:

- boot remains `audio=0`, `zero=1`, `tilt=0`
- no network request can produce a nonzero output or arm a servo
- a short worst-case scheduler test runs on every observer iteration;
  connect, disconnect, reconnect, slow-client, and malformed-flood cases each
  stay inside their receive/time budgets
- a one-hour monitor soak is an integration gate, not an inner-loop test, and
  causes no reset, I2S error growth, post-warm-up heap regression, or false
  IMU stale stop
- slow clients lose telemetry frames rather than delaying the haptic loop, and
  loss is counted
- AtomS3 BtnA and USB `stop` still enter Safe Idle during connection churn and
  bounded receive-load tests
- from local command/button detection, software audio-zero assertion occurs
  within two control periods (8 ms); the I2S backend zero call completes in
  that action and measured line-output silence occurs within one configured
  DMA block plus 2 ms. Record these separately rather than calling an ACK
  physical silence
- the observer binary contains no OTA route or OTA update library
- the regular AtomS3 production image remains behaviorally unchanged

### Slice 6 - Add the bench runner and evidence bundle

The host tool should initially work against recorded fixtures, USB serial, and
wireless telemetry passively. It does not change device state during ordinary
capture or assertion work.

For each run it records:

- run ID, date/time, git commit/build ID, environment/profile, schema version
- preset source/path or hash, resolved feature flags, calibration identity,
  effective output limit
- operator-confirmed S1 and 12 V states
- fixture/orientation and requested procedure
- raw NDJSON telemetry, derived metrics, operator tactile observation, and the
  final Safe Idle state

The runner may prepare the next command, but it must not automatically arm
physical output without an explicit operator confirmation at that step. The
only automatic mutation allowed is a best-effort Safe Idle request when an
already-authorized active run fails or is interrupted and a validated control
channel is still present. Its result is accepted only after the required newer
postcondition telemetry arrives. If the connection is lost, record device
state as unknown and instruct the operator to use USB/BtnA, switch S1 OFF, and
switch the 12 V/servo supply OFF before handling the device. Never report an
unconfirmed remote stop as Safe Idle. Firmware cannot infer the physical S1 or
12 V supply state.

Acceptance:

- the 30-second static, pulse-to-silence, no-new-event, schema-validity, and
  sequence-gap checks pass on committed dry-run fixtures
- a failure produces a useful nonzero exit and Markdown/JSON summary
- the same evidence format works for USB and wireless capture

### Slice 7 - Cross the hardware gates in order

1. Require the native deterministic suite to pass, then run the USB-only
   zero/status checks with S1 OFF and 12 V OFF.
2. Complete the exact powered Gate 1 sequence in document 24 without Wi-Fi.
3. Gate 1 completion immediately permits mounted resonance Gate 2; wireless
   evaluation is an optional parallel developer-infrastructure branch and
   must not block that roadmap gate.
4. Before wireless is used in any powered work, establish three conditions:
   production compile-OFF regression, the same observer binary with Wi-Fi
   runtime OFF, and that binary with Wi-Fi ON under a fixed traffic profile.
   The OFF manifest confirms that the radio is actually in `WIFI_OFF`, not
   only that telemetry publication is disabled.
   Select the radio state while Safe Idle and verify it before any output arm;
   never toggle Wi-Fi during the powered active interval.
5. Fix firmware/build, fixture, preset, power state, warm-up, repetitions, AP
   channel/RSSI, and client implementation. Run normal 5 Hz, slow-client,
   reconnect-churn, and malformed-flood traffic as separate scenarios.
6. Compare loop p99/p99.9/maximum and missed 4 ms periods, remote processing
   time, IMU age, I2S errors/underruns, reset count/reason, current/minimum
   heap and largest block, `energy`, `new_evt`, and tactile stopping behavior.
7. Treat a Wi-Fi-only regression as a wireless-debug failure, not as a reason
   to retune the material model.

Initial wireless A/B acceptance:

- Wi-Fi does not change the Gate 1 pass/fail result
- no I2S error or underrun growth and no reset
- before Wi-Fi is enabled, freeze run frame count, loop p99.9/maximum,
  missed-deadline-rate, IMU-age, remote-time, and heap tolerances in the run
  manifest from the USB and runtime-OFF baselines; do not move them after
  seeing the ON result
- compare `missed_4ms_periods / observed_frame_count` against the predeclared
  rate-difference allowance rather than assigning cause to individual misses;
  the repository-default hard maximum loop gap is 20 ms until baseline
  evidence justifies tightening it, and the fixed remote scheduler budgets
  remain satisfied
- after warm-up, free heap has no sustained negative trend and minimum heap
  and largest free block remain within the predeclared baseline tolerance
- sequence gaps and dropped telemetry are visible in the host record
- Safe Idle still takes precedence during connection churn and traffic load

### Slice 8 - Optional locally approved bench control

This slice starts only after Gate 1, the monitor soak, and the wireless OFF/ON
comparison pass. It is developer bench control, not Gate 11 product control.

- a distinct local physical action while Idle, audio zero, and tilt disarmed
  opens a short control lease; the existing BtnA-hold Safe Idle action remains
  unchanged and always wins
- lease expiry uses the device monotonic clock in the control loop; queued
  packets, a blocked network task, reconnect, or an old heartbeat cannot
  extend authority
- the display or USB channel shows lease state and expiry
- remote output arm, calibration start, replay start, or other active commands
  require both the live lease and a per-request session/sequence/body-bound
  HMAC, or a later trusted WSS bridge; no bearer credential is sufficient
- the initial lease keeps the 8% integration limit; it cannot disable the IMU
  stale stop or compiled hard clamp
- the initial lease/heartbeat validity window is at most 400 ms. Once expiry,
  disconnect, or a policy violation is detected, Safe Idle and an immediate
  DXL torque-off request begin within one control period, and software audio
  zero follows the 8 ms local bound. The independent bus watchdog is a
  fallback, not an additional window: from the last valid authority renewal to
  its enforced stop deadline has a 500 ms end-to-end maximum. Read back
  torque-off when communication remains available. If confirmation is absent
  at the deadline, latch an unconfirmed-stop fault, prohibit re-arm, instruct
  the operator to switch the 12 V supply OFF, and never record torque-off as
  confirmed. Each stage is measured separately and a new local approval is
  required before re-arm
- S1 and 12 V remain operator-confirmed physical gates that software cannot
  infer

This is the point at which a genuinely cable-free powered bench session becomes
reasonable. It is deliberately later than read-only monitoring so convenience
cannot expand the initial failure surface.

## 6. Test architecture after Gate 1

The native harness becomes the reusable base for later gates without changing
their order:

- Event: one wall approach produces one hit; re-arm requires leaving the zone;
  cooldown and 16-item bounds hold
- Texture: attack occurs once; voices expire at the intended lifetime; full
  arrays remain bounded
- Resonance: carrier selection and envelopes stay finite and reproducible
- Spatial: Front/Back neighbors are Top/Bottom and vice versa; delayed SOA
  energy is emitted once; full queues remain safe
- Full layer chain: each preset produces finite, repeatable event and four-wall
  peak/RMS statistics, without requiring exact equality for tunable perceptual
  values
- Audio renderer, when a narrow seam is justified: muted PCM is zero, TDM
  slots 0 through 3 preserve wall order, slots 4 through 7 are zero, and the
  hard peak clamp cannot be bypassed

Golden data is split into:

- a quantized/tolerance-bounded legacy fingerprint, updated only by an
  explicit review operation
- physical invariants and statistical ranges that tolerate intentional tuning

## 7. Validation cadence

### During a small iteration

- native tests for the touched layer
- schema positive/negative tests when the contract changes
- the directly affected firmware environment
- `m5stack-atoms3-pipeline` for Gate 1 changes

### Before integration

- all native tests
- schema tests
- the seven-environment standard firmware matrix
- the remote/observer environment when touched
- WebXR typecheck/build only when the client changes
- `git diff --check`

### Before an upload

- all integration checks above
- a build/run manifest with commit and environment identity
- confirmed COM port and explicit S1/12 V preparation
- no automatic output arm

This cadence keeps fast feedback during development while retaining the full
repository Definition of Done at integration boundaries.

### CI after the local commands stabilize

Once Slices 1 through 4 have stable local entry points, add CI as release
hygiene rather than inventing a second workflow:

- native unit/fingerprint tests, with ASan/UBSan on the Linux host build where
  practical
- schema positive and expected-invalid fixtures
- the seven-environment firmware matrix plus the observer environment when it
  exists
- WebXR typecheck/build

CI proves reproducibility of software checks only. It must not promote a
compile, synthetic trace, or network soak into production hardware evidence.

## 8. OTA policy for a later slice

The locally installed `default_8MB.csv` layout contains two OTA application
slots and the current image is well within either slot, so capacity is not the
primary blocker. Safety and recovery are.

The first observer compiles OTA routes and libraries out entirely. A future OTA
slice must commit its partition CSV to this repository rather than depend on a
locally installed `default_8MB.csv` file. OTA remains behind a separate compile
flag, default OFF, and may start only when:

- Safe Idle is active
- audio is OFF and digital zero is asserted
- tilt is disarmed
- a local button action opens a short maintenance window
- the operator has confirmed S1 OFF and the 12 V/servo supply OFF
- the image is authenticated; a checksum alone is not authentication

The signed manifest binds board/profile, firmware version, image size, and
cryptographic hash. Its trust key is stored separately from the wireless debug
credential, and the downgrade policy is explicit. A trial image has a fixed
boot-attempt count, mark-valid deadline, and self-test covering safe defaults,
storage readability, and internal controller/safe-zero initialization that is
valid with S1 and external 12 V power OFF. It does not require an XL330 or
amplifier response.

Before `mark-valid`, the trial image must not irreversibly migrate NVS or
LittleFS. Any required format change is backward-compatible or uses a
versioned copy-on-write migration that is exercised by rollback tests.

After the internal test marks the image valid, outputs remain OFF. XL330,
amplifier, and transducer checks occur only in a separate operator-confirmed
post-update bring-up gate before that image is used for powered work.

Power interruption is tested during erase, write, metadata/swap, and reboot.
Maintenance mode rejects normal network control and continuously asserts
digital zero. An interrupted or rejected update boots the prior image, and a
rollback boot starts with remote control disabled, audio OFF, and tilt
disarmed. OTA must not format LittleFS or NVS, must keep USB flashing
available, and must not enable Secure Boot or burn eFuses without a separate
explicit decision because those actions can be irreversible.

## 9. Work that still requires the operator

Automation should reduce the operator's role to observations and physical
authority that software cannot provide:

- confirm the actual COM port before upload
- confirm S1 and 12 V state at every power gate
- connect or reposition hardware and mounted fixtures
- explicitly authorize each nonzero-output phase
- report tactile vibration/no-vibration and abnormal sound, heat, rail, or
  mechanical behavior
- perform the final mounted localization, resonance, and servo-mechanics tests

Everything else - builds, fixtures, schema checks, log capture, numeric
assertions, comparison reports, and failure summaries - should be automated
before asking for bench time.

## 10. Immediate next start point

The Slice 1 harness, negative schema checks, and reviewed legacy fingerprint
are complete. The next behavior change is Slice 2: extend the native fixtures,
implement the default-off Gate 1 activity filter behind the raw sample/time
guard, and expose truthful current-frame event diagnostics. Protocol and
host-tool work may proceed in parallel in new files, but the Atom wireless
environment must not be connected until the Monitor policy is tested.
