# AGENTS.md

## Objective

Deliver a compelling, fully working handheld container-content demo aligned
with the user's concept: fingertip-plane tilt conveys sustained direction,
center-of-mass shift and inertia; four transducers convey collisions, flow and
material texture. Both derive from the same on-device state. The shared Web
client presents that state through Haptic Link. The next direction is desktop
tuning followed by Android AR; Quest/VR work is deferred. Planned features and
physical checks remain distinct from implemented behavior and verified results.

Read docs/00_DESIGN_SPECIFICATION.md for the experience,
docs/16_PROGRESS_STATUS.md for facts, and docs/08_IMPLEMENTATION_PLAN.md for the
next work. Consult other documents only when the task needs them.

## Architecture to preserve

- Mass Motion -> Event -> Texture -> Resonance -> Spatial4.
- Two XL330 servos form the parallel low-frequency branch.
- Container geometry affects travel and collision behavior.
- AtomS3 owns rendering and actuator commands; the client sends high-level intent.
- Preserve the baseline build and generic defaults. Gate new subsystems with an
  appropriate compile-time and/or runtime flag, initially inactive where needed.
- Make focused changes; broad architecture refactors need a demonstrated reason.

## Demo-first execution

The earlier subsystem development order is historical scaffolding, not a set
of prerequisites to repeat. Prioritize the missing end-to-end behavior in
document 08. Reuse working components and completed hardware evidence.

The user has authorized ordinary powered bench testing and asked to avoid
repeated power-OFF confirmations. Keep power ON for normal supervised tests.
Request physical intervention only when the next operation actually needs it,
such as changing wiring, handling a mechanism, or collecting a tactile judgment.
Do not actuate unattended hardware while the user is away.

Keep the implemented Stop path and output bounds working. Adjust a protection
policy only to solve an observed problem, with truthful fault reporting and a
bounded recovery. Do not grow safety procedures for hypothetical risks.

## Appropriate validation

- Documentation-only work: links, consistency, diff check.
- Client changes: typecheck/build and the affected user interaction.
- Protocol changes: valid/invalid message tests and relevant firmware targets.
- Firmware changes: affected build, baseline when shared code changes, and one
  focused regression/reproduction.
- Hardware: one representative handling/recovery check; repeat only after a
  relevant change, failure, or uncertainty.

Do not require a full legacy build matrix, six-pose campaign, long soak, repeated
switch checks, or hashed evidence bundle for every demo iteration. Existing
test tools remain available when useful. Skipped tests stay skipped, not passed.

## Definition of done

A feature is done when its intended behavior works, relevant checks pass,
defaults remain compatible, and the owning document reflects it. Update
schemas/telemetry if the observable state or protocol changed.

A complete demo must pass docs/07_TEST_AND_VALIDATION.md, including simultaneous
tilt and vibration and actual client/device agreement. Compilation or separate
component tests alone do not establish this.

## Documentation and repository hygiene

- docs/00: concept; 04: hardware; 05: interfaces; 06: parameters.
- docs/07: demo acceptance; 08: only active plan; 16: current facts.
- docs/reference/: optional technical detail and future design.
- docs/archive/: historical evidence; never active instructions.
- Record a fact once and link to it. Avoid new handoff or process documents.
- Preserve uncommitted work and unique evidence during cleanup.
- Do not format device storage or erase evidence as a housekeeping step.
- Run PlatformIO builds sequentially; follow the isolated pioarduino cache
  procedure in docs/reference/19_DEVELOPMENT_SETUP.md.
