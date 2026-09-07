# 00 Research Concept

## The experience we are building

Make a small object feel as though it contains something that moves:
tilting or shaking it produces a shift of contents, contact with a wall, flow,
and eventual rest. The hand should feel **one coherent object**, not a servo
effect and a vibration effect played alongside an animation.

Two fingertip contact planes convey sustained direction, apparent center-of-mass
shift and inertia. Four vibration channels convey localized contacts, flow and
texture. Their relationship under the user's own motion is the core of the
research; more presets, a more elaborate simulator, or a prettier screen are
means to improve that relationship, not the research objective.

## Research question and scope of the claim

**Can coordinated contact-plane tilting and spatially distributed vibration
convey the behavior and material character of moving contents in a compact
handheld device?**

The working hypothesis is that a continuous directional cue and transient
material cues, derived from the same evolving state, can be perceived as one
causal sequence. We want to establish:

- Coherence: moving contents lead into contacts and settling with intelligible
  direction and timing.
- Material character: water, a rigid inclusion and sand differ by more than
  overall stimulus strength.
- Useful integration: both output branches contribute to the intended
  experience while remaining usable together in the actual grasp.

These are design aims and questions, not established perceptual advantages.
Operator reports and software checks are valuable but do not establish
comparative superiority, novelty against prior art, or a general realism score.
[Current evidence](16_PROGRESS_STATUS.md) and
[demo acceptance versus research evaluation](07_TEST_AND_VALIDATION.md) stay distinct.

The supplied VRSJ 2026 manuscript, *A Handheld Haptic Device Integrating Fingertip
Contact-plane Tilting and Four-channel Vibrotactile Stimulation*, is the design
anchor. Gravity Grabber and pseudo-weight-shifting/material work are related
design inputs, not interchangeable mechanisms or transferable motor signs.
The [source notes](reference/10_REFERENCES.md) retain those distinctions.

## One source of haptic state

```text
IMU -> body-frame motion -> shared content state
  |-> Mass Motion -> Event -> Texture -> Resonance -> Spatial4 -> 4 transducers
  |-> motion + content state -> low-frequency tilt model -> 2 XL330 servos
  `-> telemetry -> Web presentation (visuals and optional speaker sound)
```

AtomS3 owns the content model and physical output commands. Material and
container geometry affect that model's movement and contacts. StampC5 carries
high-level commands and reported state; the held device needs no USB cable.

The hardware-free synthesis core composes the existing layers. HapticPipeline
retains sensor input, configuration, Stop/recovery and actuator dispatch.
The Web client presents accepted state, never a second source of actuator
commands. Exact boundaries belong in the
[firmware](reference/30_REUSABLE_FIRMWARE_CORE.md) and
[visual](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md) contracts.

## Representative experiences

| Condition | What should be legible in the combined feel |
|---|---|
| One marble | Travel, a distinct wall contact, and return/rest |
| Water | Lag, sloshing and a sustained change of apparent load |
| Retained sand | Yielding/flow, friction and a residual center-of-mass offset |

These three organize tuning and comparison; they do not limit the available
demo presets. Carbonation is an expressive extension of the same principle:
shared charge/burst state coordinates a pop, recoil and diminishing flow.
The fictional heartbeat proposal is a separate later demo, not a calibration
condition or a new main research direction.

Judge vibration and tilt together when tuning a material. The five-dimensional
preference search is a tool for choosing useful settings, not itself proof of
a haptic contribution. Retain the starting setting and judgments; a transferred
profile is another material's starting point, not evidence that it is optimized.
Effective coordinates and reuse semantics belong in [06](06_PARAMETER_MODEL.md).

## Fidelity boundaries that matter

- The FW content model is a reduced body x/y cross-section, with servo rotation
  around body z. Acquiring all three IMU axes does not make it a 3D haptic model.
- Richer visual liquid motion, marble depth and individual coin physics are
  presentation detail. They use accepted input/source time but are not measured
  content positions or individually synchronized haptic collisions.
- Speaker sound is optional Web presentation, not the transducers' output PCM.
  Aggregate telemetry cannot reproduce every contact sample-accurately.
- Contact-plane motion represents apparent weight/inertia; it does not add
  actual mass or arbitrary net force. Grip force is nominal, not FSR-measured.
  Four electrical channels do not by themselves prove four perceptually
  independent locations.

These limitations guide interpretation, not a demand to implement full fluid
physics, tracking or force sensing. Add model detail only when a concrete
mismatch prevents the intended sensation. Do not hide a tactile mismatch with
an unrelated visual effect or equate stronger output with greater realism.

## Experience and development priorities

Preserve useful stimulus strength and the positively handled baseline.
A person should be able to pick up the device, compare contents, see a compatible
response on desktop/Android, and stop/restart without disrupting the demonstration.
Ordinary-screen Android is sufficient; hand-tracked AR is optional and Quest/VR
work is deferred. An attractive display supports the tactile concept, not replaces it.

For every proposed change ask: **which observable or felt mismatch does this
resolve, and how will we tell?** Prefer a short end-to-end comparison over more
infrastructure. Keep current facts in [16](16_PROGRESS_STATUS.md), the next
actions in [08](08_IMPLEMENTATION_PLAN.md), and acceptance in [07](07_TEST_AND_VALIDATION.md).
