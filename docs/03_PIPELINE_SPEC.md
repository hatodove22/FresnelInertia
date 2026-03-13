# 03 Pipeline Specification

## 1. Layer overview

The signal path is a four-layer model:

1. **Mass Motion Layer**
2. **Event Layer**
3. **Texture Layer**
4. **Resonance Layer**

The output of the resonance layer is then mapped by a **4-channel spatial renderer**.

## 2. Mass Motion Layer

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
- flow-along-wall

#### Granular
- impact-cluster
- roll-train
- scrape

#### Hybrid
- liquid events + sparse rigid impact events

#### Detented/custom
- scrape / discrete detents / custom patterns

## 4. Texture Layer

### Purpose
Convert symbolic events into short time-structured haptic atoms.

### Initial atom library

- `hard_ping`
- `wet_burst`
- `dry_rattle`
- `scrape_noise`
- `flow_ripple`

### Key design choice
Apparent motion should be encoded primarily through timing (SOA), not only amplitude.

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
That role belongs to the future tilt-plane channel.

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
4. `flow_ripple`: apparent motion across adjacent walls using SOA

## 7. Future low-frequency tilt-plane path

The same mass-motion state later drives:
- thumb tilt-plane command
- index tilt-plane command

This path is explicitly **not** part of the 4-channel texture renderer.
It is a parallel low-frequency augmentation path.
