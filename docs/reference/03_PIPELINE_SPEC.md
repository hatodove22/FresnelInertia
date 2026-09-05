# 03 Pipeline Specification

> Technical reference; read only when the current task needs this detail. Current scope, facts, and demo acceptance are in ../08_IMPLEMENTATION_PLAN.md, ../16_PROGRESS_STATUS.md, and ../07_TEST_AND_VALIDATION.md.

## 1. Layer overview

The signal path is a four-layer model:

1. **Mass Motion Layer**
2. **Event Layer**
3. **Texture Layer**
4. **Resonance Layer**

The output of the resonance layer is then mapped by a **4-channel spatial renderer**.

## 2. Mass Motion Layer

### Current assembled profile

`features.enable_coherent_container_demo` selects the shared contact model;
the initial/legacy scaffold described below remains the generic default.
Specific force is converted through physical half-span; a damped liquid slosh
mode or untethered granular state reaches walls under ordinary handling.
Mass records four wall-contact weights and pre-bounce approach speeds. Event
consumes those crossings and contact travel, not an independent impact clock.
Supported rest creates no taps. Empty content creates no material events.
Liquid contacts excite WetBurst/FlowRipple; rigid contacts keep the harder
atoms. Resonance passes duration/density to Spatial4, which plays a complete
delayed FlowRipple neighbor envelope. The same content position feeds the
common tilt base, composed with CoG/inertia before full-command smoothing.
Parameter semantics and gates are in [06](../06_PARAMETER_MODEL.md).

### Purpose
Represent the internal content state as a compact latent state, rather than directly synthesizing waveforms from IMU.

### Canonical latent state

- content position `(x, y)` in normalized container coordinates
- content velocity `(vx, vy)`
- energy/activity `E`
- fill / headspace
- material family
- container geometry `(Lx, Ly, Lz)`

### Design rule
Container geometry constrains the latent dynamics.

This layer must capture the fact that:

- smaller containers yield shorter travel times,
- collision opportunities increase when the same motion traverses a shorter distance,
- rolling trains decay faster in short spans,
- fill changes the balance between wall impacts, free-surface events, and roof contact.

### Initial liquid model
For early development, use a 2D damped mass scaffold.
Later, refine into geometry-aware impulsive/convective liquid state.
The current scaffold may also fold vertical/yaw agitation into the 2D state so ordinary hand shaking does not disappear when it is poorly aligned with the container plane.

### Initial granular model
Use a mean-field state with:

- CoG-like content offset,
- activity `E`,
- rolling tendency,
- scrape tendency.

## 3. Event Layer

### Purpose
Convert latent motion into discrete symbolic events.

### Event set

- `wall_hit`
- `roll_train`
- `impact_cluster`
- `droplet_cluster`
- `roof_slap`
- `scrape`

### Event semantics by material family

#### Liquid

- wall-hit
- droplet-cluster
- roof-slap (high fill)
- flow-along-wall via direction-aware `flow_ripple` companions on the contacted wall

#### Granular

- impact-cluster
- roll-train
- scrape

#### Hybrid

- liquid events + sparse rigid impact events

#### Detented/custom

- intermittent scrape plus discrete detent-like ticks / custom patterns
- detent ticks should bias toward a short low-mid click rather than reusing the same bright wall-hit rendering as liquid / granular families

## 4. Texture Layer

### Purpose
Convert symbolic events into short time-structured haptic atoms.

### Initial atom library

- `hard_ping`
- `knock_ping`
- `detent_click`
- `wet_burst`
- `dry_rattle`
- `scrape_noise`
- `flow_ripple`

### Key design choice
Apparent motion should be encoded primarily through timing (SOA), not only amplitude.
That timing should follow the carried motion direction so lead/trail neighbors do not collapse into a symmetric blur.

Clustered wet and granular events may emit a short companion low-band body voice
in addition to their primary atom so that single-transducer and low-channel
benches still preserve a clear tactile "mass" impression instead of only a
thin splash or rattle.
The same rule also applies to scrape-like textures on the current mono bench:
keep some tonal/body content alongside broadband grain so scrape does not vanish.
Detented presets should likewise use a dedicated click atom with stronger low-carrier weight so mechanical notch steps remain tangible on the current transducer bench.
Very sparse hard-particle presets such as a single marble should use a dedicated short `knock_ping` atom so isolated impacts feel like one rigid bead contacting the wall, not like a softened mini-cluster.

## 5. Resonance Layer

### Purpose
Project event-derived envelopes onto the mounted actuator system.

### Initial rendering policy
Each transducer receives at least two resonance carriers:

- low carrier
- high carrier

Later versions may add:

- per-channel equalization,
- plant compensation,
- nonlinear drive limits,
- actuator health checks.

### Important rule
Do not use the low-frequency latent slosh signal directly as a long AM envelope for the 4-transducer path.
That role belongs to the parallel tilt-plane channel.

## 6. Spatial Renderer (4 channels)

### Channel layout
Recommended canonical ordering:

- channel 0 = Front
- channel 1 = Back
- channel 2 = Top
- channel 3 = Bottom

### Mapping rules

1. `wall_hit`: mostly local wall, slight bleed to adjacent walls
2. `impact_cluster`: local + neighbors
3. `droplet_cluster`: local + neighbors with stronger high-frequency weighting
4. `flow_ripple`: apparent motion across the physically adjacent walls using SOA and preserved motion direction

Adjacency is wall-physical rather than index-ring based:

- Front / Back neighbor Top / Bottom
- Top / Bottom neighbor Front / Back

## 7. Low-frequency tilt-plane branch

The same mass-motion state now also drives a parallel low-frequency tilt-plane branch:

- thumb tilt-plane command
- index tilt-plane command

The final per-finger command remains additive:

- `phi_cmd = phi_base + delta_phi_pseudoforce`

Where:

- `phi_base` is the existing container-attitude renderer
- `delta_phi_pseudoforce` is the low-frequency pseudo-force correction

This branch is explicitly **not** part of the 4-channel texture renderer.
It remains a separate low-frequency augmentation path for:

- generalized weight shifting
- vertical inertia
- horizontal inertia

The current implementation uses:

- shell mass and shell CoG from `ContainerParams`
- effective content mass from the active preset fill state
- filtered body-frame quasi-static gravity `g_qs`
- filtered gravity-removed low-frequency acceleration `a_dyn`
- smoothed content CoG estimated from `MassState.pos_norm`

The pseudo-force branch then decomposes into:

- common mode for vertical inertia
- differential mode for torque about the thumb/index grasp width

Hard limits are applied to:

- common-mode correction
- differential correction
- total pseudo-force correction
- final command angle
