# Future Parametric Model Reference (v1.0)

> Technical reference; read only when the current task needs this detail. Current scope, facts, and demo acceptance are in ../08_IMPLEMENTATION_PLAN.md, ../16_PROGRESS_STATUS.md, and ../07_TEST_AND_VALIDATION.md.

## 0. Purpose and repo alignment

This document explores a richer on-device model, not the current firmware's
complete implementation or a requirement for the first demo. Consult it only
for a specific model refinement. It covers:

- liquid contents
- shaker-like granular contents such as sand, rice, pebbles, coins, and beads
- hybrid contents such as ice water or gravel water
- a 4-transducer vibrotactile branch for mid/high-frequency texture
- a 2-servo tilt pseudo-force branch for low-frequency weight and inertia cues

The original model was written for StickS3 and four I2S amplifiers. Current
assembled hardware is AtomS3 with MAX98357A TDM4 and two XL330s; see
[hardware](../04_HARDWARE_AND_PIN_SPEC.md).

This specification is the formal math companion to:

- [Pipeline](03_PIPELINE_SPEC.md)
- [Parameters](../06_PARAMETER_MODEL.md)
- [Implemented tilt model](14_TILT_PSEUDOFORCE_SPEC_REV2.md)

Current code modules that this spec maps onto are:

- `MassMotionLayer`
- `EventLayer`
- `TextureLayer`
- `ResonanceLayer`
- `SpatialRenderer4`
- `TiltPseudoForceModel`
- `HapticPipeline`

Important scope note:

- the current firmware already implements a reduced shared latent state through `MassState`
- the explicit liquid modal state and granular macro-transport state below are the target refinement model
- those refinements must be introduced additively and behind safe defaults, not by replacing the current architecture wholesale

Feature-gating policy remains unchanged:

- compile-time gates control whether audio, remote, and tilt backends are built
- runtime gates in `SystemParams.features` and `tilt.enable_pseudoforce` keep the default baseline safe and stable

## 1. Global design principle

### 1.1 Branch responsibilities

The system splits content haptics into two parallel branches.

#### A. Tilt pseudo-force branch

Responsibility:

- generalized weight shifting
- vertical inertia
- horizontal inertia

Output:

- one thumb tilt axis
- one index tilt axis

#### B. Vibrotactile texture branch

Responsibility:

- wall hit
- roll train
- impact cluster
- droplet cluster
- roof slap
- scrape / stick-slip
- flow along wall

Output:

- four wall-aligned transducers

### 1.2 Core separation rule

Low-frequency weight, bias, and inertia cues belong on the tilt branch.
Mid/high-frequency splash, rattle, scrape, and wall texture cues belong on the
4-transducer branch.

Therefore:

- do not replay low-frequency liquid slosh directly on the 4-transducer path as a substitute for pseudo-force
- do not move high-frequency texture rendering into the tilt branch

## 2. Coordinate system and geometry

### 2.1 Container body frame

Define a container-fixed body frame `B`:

- `+x`: toward the thumb side of the grasp
- `+y`: upward along the container
- `+z`: right-handed axis orthogonal to the `x-y` plane

The low-frequency content migration model is primarily expressed in the `x-y`
plane.

### 2.2 Current repo wall mapping

The current firmware names the four vibrotactile sites with `WallId`:

- `Front`
- `Back`
- `Top`
- `Bottom`

For the formal 2D wall model, use the wall-aligned site vectors:

```text
p_front  = [ 1,  0 ]^T
p_top    = [ 0,  1 ]^T
p_back   = [ -1, 0 ]^T
p_bottom = [ 0, -1 ]^T
```

This keeps the formal model aligned with the current wall-oriented renderer in
`SpatialRenderer4` rather than an arbitrary speaker ring.

### 2.3 Effective 2D cross-section

At grasp height, approximate the container by an effective 2D section:

```text
a_x = half-width in x
a_y = half-width in y

L_x = 2 a_x
L_y = 2 a_y
```

In the current firmware:

```text
a_x = 0.5 * container.span_x_m
a_y = 0.5 * container.span_y_m
```

### 2.4 Wall distance definitions

For a physical low-frequency content position `r = [r_x, r_y]^T` in meters:

```text
d_+x(r) = a_x - r_x,  n_+x = [ 1,  0 ]^T
d_-x(r) = a_x + r_x,  n_-x = [ -1, 0 ]^T
d_+y(r) = a_y - r_y,  n_+y = [ 0,  1 ]^T
d_-y(r) = a_y + r_y,  n_-y = [ 0, -1 ]^T
```

As long as the state remains inside the container, each `d_i` is positive.

In the current reduced-state implementation:

```text
r_x = a_x * MassState.pos_norm.x
r_y = a_y * MassState.pos_norm.y
```

## 3. Material parameterization

### 3.1 Formal material parameter vector

Each content is described by a formal parameter vector:

```text
Theta = {
  m_content,
  f,
  nu,
  N_eff,
  e_n,
  mu_f,
  rho_r,
  rho_l,
  rho_g,
  alpha_shape,
  alpha_roof,
  alpha_burst,
  alpha_rough,
  alpha_hard
}
```

Meaning:

- `m_content`: content mass
- `f`: fill ratio in `[0, 1]`
- `nu`: viscosity-like parameter in `[0, 1]`
- `N_eff`: effective particle count
- `e_n`: wall restitution coefficient
- `mu_f`: velocity damping / friction coefficient
- `rho_r`, `rho_l`, `rho_g`: rigid, liquid, and granular content mass fractions
- `alpha_shape`: container-shape effect coefficient
- `alpha_roof`: roof-slap tendency
- `alpha_burst`: burstiness
- `alpha_rough`: scrape / roughness tendency
- `alpha_hard`: hardness

Constraint:

```text
rho_r + rho_l + rho_g = 1
```

### 3.2 Current repo mapping

The current repo does not yet expose every formal symbol directly.
Use the following mapping rules when relating this model to `SystemParams`:

- `m_content` -> `container.content_mass_full_kg * container.fill` for current effective mass use
- `f` -> `container.fill`
- `nu` -> `container.viscosity`
- `N_eff` -> a future physicalized version of `container.particle_count`
- `alpha_hard` -> `container.particle_hardness`
- `alpha_roof` -> `container.enable_roof_contact` plus `event.roof_slap_threshold`
- `alpha_shape` -> derived from `container.span_x_m`, `container.span_y_m`, `container.span_z_m`
- `alpha_burst` -> derived from family-specific event-rate and texture parameters
- `alpha_rough` -> derived from `event.scrape_threshold` and future roughness parameters
- `rho_r`, `rho_l`, `rho_g` -> currently implied by `container.family` and preset choice, and may later be promoted to explicit preset fields

### 3.3 Fill helper

Use the free-surface helper:

```text
eta_f = 4 f (1 - f)
```

Properties:

- `eta_f = 0` at `f = 0` and `f = 1`
- `eta_f` is maximal at `f = 0.5`

## 4. Layer 1: Mass migration layer

This layer updates only the low-frequency internal content state.
It does not yet generate vibrotactile waveforms.

### 4.1 Shell state

The rigid shell is described by:

```text
m_s
r_s = [ x_s, y_s ]^T
```

In the current repo:

- `m_s` -> `container.shell_mass_kg`
- `r_s.x` -> `container.shell_cg_x_m`
- `r_s.y` -> `container.shell_cg_y_m`

### 4.2 Content mass decomposition

Split content mass into rigid, liquid, and granular components:

```text
m_r = rho_r * m_content
m_l = rho_l * m_content
m_g = rho_g * m_content
```

### 4.3 Rigid content state

Treat rigid content mass as a fixed content CoG:

```text
r_r = [ x_r, y_r ]^T
```

For early implementation, `r_r` may remain a fixed preset parameter.

### 4.4 Liquid content state: 2-mode convective model

For each mode `m in {1, 2}` and each axis `d in {x, y}`:

```text
q_ddot(m,d)
+ 2 zeta(m,d) omega(m,d) q_dot(m,d)
+ omega(m,d)^2 q(m,d)
= -gamma(m,d) a_d
```

Where:

- `q(m,d)`: convective-mode displacement
- `a_d`: low-frequency body-frame acceleration
- `omega(m,d)`: modal angular frequency
- `zeta(m,d)`: damping ratio
- `gamma(m,d)`: input gain

#### 4.4.1 Frequency model

Use a size-dependent initial model:

```text
omega(1,x) = k_omega1 * sqrt(g / L_x)
omega(1,y) = k_omega1 * sqrt(g / L_y)

omega(2,x) = k_omega2 * sqrt(g / L_x)
omega(2,y) = k_omega2 * sqrt(g / L_y)
```

Recommended initial values:

- `k_omega1 = 1.0`
- `k_omega2 = 2.2`

#### 4.4.2 Damping model

```text
zeta(1,d) = 0.15 + 0.60 * nu
zeta(2,d) = 0.25 + 0.80 * nu
```

#### 4.4.3 Input gain

```text
gamma(1,d) = 1.0
gamma(2,d) = 0.5
```

#### 4.4.4 Amplitude limits

Limit free-surface displacement by container size and fill:

```text
abs(q(1,d)) <= q_max(1,d) = c_q1 * L_d * eta_f
abs(q(2,d)) <= q_max(2,d) = c_q2 * L_d * eta_f
```

Recommended initial values:

- `c_q1 = 0.18`
- `c_q2 = 0.07`

#### 4.4.5 Liquid CoG contribution

```text
r_l,d = alpha(1,d) * q(1,d) + alpha(2,d) * q(2,d)
r_l   = [ r_l,x, r_l,y ]^T
```

Recommended initial values:

- `alpha(1,d) = 1.0`
- `alpha(2,d) = 0.4`

### 4.5 Granular content state: macro transport model

Do not track every grain individually.
Use one macro-state:

```text
p_dot_g = u_g

u_dot_g =
  -beta_g * u_g
  -mu_g * tanh(u_g / u_0)
  -a
  +sigma_g * xi(t)
```

Where:

- `p_g`: granular CoG transport state
- `u_g`: granular transport velocity
- `beta_g`: linear damping
- `mu_g`: dry-friction-like damping
- `u_0`: `tanh` scale
- `sigma_g * xi(t)`: small random excitation

Recommended initial values:

- `beta_g = 4.0 1/s`
- `mu_g = 0.6 m/s^2`
- `u_0 = 0.02 m/s`

#### 4.5.1 Boundary reflection

When the state reaches a wall, reflect it:

```text
if r_x > a_x:
  r_x <- a_x
  u_x <- -e_n * u_x
```

Apply the same rule to the other walls.

#### 4.5.2 Granular CoG contribution

```text
r_g = p_g
```

### 4.6 Shared activity state

Use one material-agnostic activity scalar:

```text
E(k+1) =
  clamp(
    (1 - dt / tau_E) * E(k)
    + k_a * ||a(k)||
    + k_j * ||j(k)||,
    0,
    1
  )
```

Where:

- `a`: low-frequency dynamic acceleration
- `j`: jerk estimate
- `tau_E`: activity time constant

Recommended initial values:

- `tau_E = 0.25 to 0.60 s`
- `k_a = 0.15`
- `k_j = 0.02`

In the current repo, this role is already carried by `MassState.energy`.

### 4.7 Total content CoG

```text
r_c =
  (m_r * r_r + m_l * r_l + m_g * r_g) /
  (m_r + m_l + m_g + eps)
```

### 4.8 Total system CoG

```text
r_tot =
  (m_s * r_s + m_content * r_c) /
  (m_s + m_content + eps)
```

The tilt pseudo-force branch operates on `r_tot`.

### 4.9 Current implementation note

Today `MassMotionLayer` maintains the reduced shared state:

```text
MassState {
  pos_norm,
  vel_norm_s,
  energy,
  fill,
  headspace,
  container_x_m,
  container_y_m,
  container_z_m,
  family
}
```

This reduced state remains the stable public contract until the explicit liquid
and granular substates are promoted carefully.

## 5. Layer 2: Event layer

This layer transforms low-frequency latent state into discrete symbolic events.

Current `EventType` already covers:

- `WallHit`
- `RollTrain`
- `ImpactCluster`
- `DropletCluster`
- `RoofSlap`
- `Scrape`

`flow along wall` is currently expressed later as a directional
`TextureAtomKind::FlowRipple` companion, not as a separate event enum.

### 5.1 Common wall quantities

Define content CoG velocity `v_c`:

- liquid-dominant: `v_c = r_dot_l`
- granular-dominant: `v_c = u_g`
- mixture: mass-weighted combination

For the current reduced-state implementation, a first approximation is:

```text
v_c.x = a_x * MassState.vel_norm_s.x
v_c.y = a_y * MassState.vel_norm_s.y
```

For each wall `i`:

#### 5.1.1 Toward-wall speed

```text
v_n,i = max(0, v_c . n_i)
```

#### 5.1.2 Tangential speed

```text
v_t,i = || v_c - (v_c . n_i) n_i ||
```

#### 5.1.3 Near-wall activity

```text
h_i =
  sigma((d_th - d_i) / s_d) *
  sigma((v_n,i - v_th) / s_v)
```

With:

```text
sigma(x) = 1 / (1 + exp(-x))
```

Recommended initial values:

- `d_th = 0.15 * min(L_x, L_y)`
- `s_d  = 0.02 * min(L_x, L_y)`
- `v_th = 0.03 m/s`
- `s_v  = 0.01 m/s`

### 5.2 Wall hit

Trigger when content approaches a wall with sufficient normal speed.

```text
A_hit,i =
  k_hit * h_i * (c_v * v_n,i + c_E * sqrt(E))
```

Recommended initial values:

- `k_hit = 1.0`
- `c_v = 1.0`
- `c_E = 0.4`

### 5.3 Roll train

Use for one or a few particles rolling along a wall.

Let `l_g` be an effective particle spacing or collision-spacing parameter.

```text
dt_roll,i = l_g / (v_t,i + eps)

T_roll,i =
  clamp(
    k_roll * L_eff,i / (v_t,i + eps),
    T_roll_min,
    T_roll_max
  )

N_roll,i = floor(T_roll,i / dt_roll,i)
```

This preserves the container-size rule:

- smaller containers shorten travel time
- smaller travel spans also shorten collision spacing and can increase repeated contacts

### 5.4 Impact cluster

Use for dense many-particle collision swarms.

```text
lambda_cl =
  k_cl * N_eff * E^p_cl / (L_eff + eps)

T_cl =
  clamp(
    k_Tcl * L_eff / (||v_c|| + eps),
    T_cl_min,
    T_cl_max
  )
```

Generate a Poisson event train within that window.

Recommended initial values:

- `p_cl = 1.2`
- `T_cl_min = 40 ms`
- `T_cl_max = 180 ms`

### 5.5 Droplet cluster

Use for liquid burst groups:

```text
lambda_drop,i =
  k_drop *
  eta_f *
  (1 - nu) *
  h_i *
  ||v_c||^p_drop

T_drop,i =
  clamp(
    k_dropT * d_th / (v_n,i + eps),
    T_drop_min,
    T_drop_max
  )
```

Recommended initial values:

- `p_drop = 1.0`
- `T_drop_min = 60 ms`
- `T_drop_max = 150 ms`

### 5.6 Roof slap

Trigger when high-fill liquid contacts the upper wall:

```text
f > f_roof
and d_+y < d_roof
and v_n,+y > v_roof
```

Amplitude:

```text
A_roof =
  k_roof * alpha_roof * (v_n,+y + c_roof * E)
```

### 5.7 Scrape / stick-slip

Use for rough, sticky, or rubbing content:

```text
A_scr,i =
  k_scr *
  alpha_rough *
  h_i *
  v_t,i^gamma_scr
```

Stick-slip modulation:

```text
M_ss(t) = 1 + beta_ss * sgn(sin(2 pi f_ss t + phi))

A_scr_eff,i = A_scr,i * M_ss(t)
```

## 6. Layer 3: Texture layer

This layer converts symbolic events into texture atoms.
In the current implementation, each wall ultimately drives low, high, and noise
envelopes before carrier synthesis.

### 6.1 Per-actuator representation

For each actuator `i`:

```text
u_i(t) =
  e_i,L(t) * sin(2 pi f_i,L t + phi_i,L) +
  e_i,H(t) * sin(2 pi f_i,H t + phi_i,H)
```

Where:

- `f_i,L`, `f_i,H`: carrier frequencies
- `e_i,L`, `e_i,H`: carrier envelopes

### 6.2 Hard ping atom

Use for hard wall contacts:

```text
g_ping,L(t) = A_L * exp(-t / tau_L) * H(t)
g_ping,H(t) = A_H * exp(-t / tau_H) * H(t)
```

Recommended initial values:

- `tau_L = 20 to 35 ms`
- `tau_H = 5 to 10 ms`

### 6.3 Wet burst atom

Use for liquid droplets:

```text
g_wet,H(t) = A_H * exp(-t / tau_w) * H(t)
g_wet,L(t) = beta_w * A_H * exp(-t / tau_wL) * H(t)
```

Recommended initial values:

- `tau_w = 4 to 8 ms`
- `beta_w = 0.0 to 0.2`

### 6.4 Dry rattle atom

Use a cluster of micro-pings:

```text
g_rattle(t) = sum_k g_ping(t - t_k; A_k)
```

### 6.5 Scrape noise atom

Continuous carrier AM:

```text
e_i,H(t) += A_scr_eff,i(t) * (1 + beta_n * xi_lp(t))
```

Where `xi_lp(t)` is low-passed zero-mean random noise.

### 6.6 Flow ripple atom

Use staggered bursts across adjacent walls:

```text
t_(k+1) = t_k + dt_flow

dt_flow =
  clamp(
    k_flow / (v_t + eps),
    dt_min,
    dt_max
  )
```

Recommended initial values:

- `dt_min = 5 ms`
- `dt_max = 20 ms`

### 6.7 Current repo atom extensions

The current implementation also carries additive specializations that fit inside
this same layer:

- `KnockPing` for isolated hard single-particle contacts
- `DetentClick` for detented mechanical-like ticks

These remain texture-layer atoms, not architectural exceptions.

## 7. Layer 4: Resonance layer

### 7.1 Carrier calibration

For each transducer `i`, sweep in mounted state and identify low and high
carriers:

```text
(f_i,L, f_i,H)
```

Initial placeholder values:

- `f_i,L = 160 Hz`
- `f_i,H = 320 Hz`

This maps directly to:

- `resonance.low_carrier_hz[4]`
- `resonance.high_carrier_hz[4]`
- `RuntimeCalibrator`

### 7.2 Envelope summation

All atoms eventually contribute envelope increments:

```text
e_i,L(t) = sum_(n in E_i) g_n,L(t - t_n)
e_i,H(t) = sum_(n in E_i) g_n,H(t - t_n)
```

### 7.3 Limiter

Apply soft limiting per transducer:

```text
u_tilde_i = u_i / (1 + alpha * abs(u_i))
```

## 8. Spatial renderer for four actuators

### 8.1 Localized wall-event mapping

For a localized event with wall normal `n_e`:

```text
w_i,loc =
  exp(kappa_loc * p_i^T n_e) /
  sum_j exp(kappa_loc * p_j^T n_e)
```

### 8.2 Distributed agitation mapping

For distributed agitation based on total content offset:

```text
r_hat = r_c / (||r_c|| + eps)

w_i,dist =
  exp(kappa_dist * p_i^T r_hat) /
  sum_j exp(kappa_dist * p_j^T r_hat)
```

### 8.3 Flow mapping

For `flow_ripple`, propagate from the nearest wall toward an adjacent wall.
The direction comes from the sign of the tangential direction vector.

Current adjacency in the repo remains physical-wall adjacency:

- `Front` and `Back` neighbor `Top` and `Bottom`
- `Top` and `Bottom` neighbor `Front` and `Back`

## 9. Tilt pseudo-force branch

This branch uses two servos to render low-frequency apparent force.
It is already represented in the current repo by `TiltPseudoForceModel` plus the
compile-gated `TiltPlaneServoInterface`.

Runtime activation remains gated by:

- `features.enable_tilt_plane`
- `tilt.enable_pseudoforce`

### 9.1 Apparent mass

```text
m_app = m_s + m_content
```

### 9.2 Total CoG

```text
r_tot =
  (m_s * r_s + m_content * r_c) /
  (m_app + eps)
```

### 9.3 Apparent force

```text
F_app = m_app * (g_qs - a_dyn)
```

### 9.4 Torque

```text
tau_z = cross(r_tot, F_app).z
tau_z = x_tot * F_app,y - y_tot * F_app,x
```

### 9.5 Common mode

Use common mode only for vertical inertia:

```text
F_cm = k_cm * (-m_app * a_dyn,y)
```

### 9.6 Differential mode

Use differential mode for generalized weight shifting:

```text
T_df = k_tau * tau_z
```

### 9.7 Per-finger pseudo-force

```text
u_thumb = 0.5 * F_cm + T_df / w_eff
u_index = 0.5 * F_cm - T_df / w_eff
```

### 9.8 Force-to-angle mapping

```text
dphi_thumb =
  atan(k_phi * u_thumb / (F_nom_thumb + eps))

dphi_index =
  atan(k_phi * u_index / (F_nom_index + eps))
```

### 9.9 Recommended limits

- common mode preferred: `+/-1.5 deg`
- common mode hard: `+/-2.5 deg`
- differential preferred: `+/-3 deg`
- differential hard: `+/-5 deg`
- total pseudo-force correction hard: `+/-6 deg`
- final command including base tilt hard: `+/-10 to 12 deg`

### 9.10 Final command

```text
phi_cmd_thumb =
  sat(phi_base_thumb + s_thumb * dphi_thumb)

phi_cmd_index =
  sat(phi_base_index + s_index * dphi_index)
```

The current implementation already follows this structure and exposes related
runtime parameters under `tilt.*`.

## 10. Discretization

### 10.1 Liquid mode update

Use semi-implicit Euler:

```text
q_dot(k+1) =
  q_dot(k) +
  dt * (
    -2 zeta omega q_dot(k)
    -omega^2 q(k)
    -gamma a(k)
  )

q(k+1) =
  sat(
    q(k) + dt * q_dot(k+1),
    -q_max,
    +q_max
  )
```

### 10.2 Granular state update

```text
u_g(k+1) =
  u_g(k) +
  dt * (
    -beta_g u_g(k)
    -mu_g tanh(u_g(k) / u_0)
    -a(k)
    +sigma_g xi(k)
  )

p_g(k+1) = p_g(k) + dt * u_g(k+1)
```

Apply boundary reflection afterward.

### 10.3 Activity update

```text
E(k+1) =
  clamp(
    (1 - dt / tau_E) * E(k)
    + k_a * ||a(k)||
    + k_j * ||j(k)||,
    0,
    1
  )
```

## 11. Recommended initial rates

- IMU acquisition: `400 to 1000 Hz`
- low-frequency state update: `100 to 200 Hz`
- event scheduler update: `100 to 200 Hz`
- audio / actuator output: `24 kHz` or `48 kHz`
- servo update: `100 to 200 Hz`

Current recommended starting point:

- state / event loop: `200 Hz`, `dt = 5 ms`
- audio output: `48 kHz`

## 12. Preset parameter examples

### 12.1 Water

Formal target:

- `rho_l = 1.0`
- `nu = 0.10`
- `N_eff = 0`
- `alpha_burst = 1.0`
- `alpha_rough = 0.1`
- `alpha_hard = 0.2`

Behavior:

- more `droplet_cluster`
- mostly `wet_burst`
- `roof_slap` only at high fill

Current repo correspondence:

- `liquid_small_box`
- `liquid_dense_jar`
- `liquid_half_tube`

### 12.2 Sand

Formal target:

- `rho_g = 1.0`
- `N_eff = 40`
- `e_n = 0.25`
- `mu_f` relatively high
- `alpha_rough = 1.0`
- `alpha_hard = 0.2`

Behavior:

- `impact_cluster` plus `scrape`
- weaker `roll_train`

Current repo correspondence:

- `granular_sand_box`

### 12.3 Coins

Formal target:

- `rho_g = 1.0`
- `N_eff = 8`
- `e_n = 0.8`
- `alpha_hard = 1.0`
- `alpha_rough = 0.1`

Behavior:

- `wall_hit` plus `roll_train`
- mostly `hard_ping`

Current repo correspondence:

- `granular_coin_box`

### 12.4 Ice water

Formal target:

- `rho_l = 0.7`
- `rho_g = 0.3`
- `N_eff = 4`
- `e_n = 0.7`
- `nu = 0.1`

Behavior:

- `droplet_cluster` plus hard `wall_hit`
- mix of `wet_burst` and `hard_ping`

Current repo correspondence:

- `hybrid_ice_water`

## 13. When to use this model

Adopt an equation only to improve an observed limitation in the demonstration
or an explicitly requested later experiment. Do not migrate the entire model
or follow its former subsystem ladder as a prerequisite. The only current plan
and status are [08](../08_IMPLEMENTATION_PLAN.md) and
[16](../16_PROGRESS_STATUS.md).

## 14. Research questions for a future refinement

The richer model could be evaluated for whether:

1. an empty container still produces low-frequency pseudo-force from shell CoG alone
2. adding content changes low-frequency pseudo-force through `r_c`
3. smaller containers shorten roll and hit time scales
4. the four-transducer path can express wall-hit, droplet, and roll spatial distribution
5. liquid and granular materials share the same four-layer architecture
6. the tilt branch does not render high-frequency texture
7. the vibrotactile branch does not render low-frequency weight and inertia

These are research questions, not extra gates on the active
[demo acceptance](../07_TEST_AND_VALIDATION.md).

## 15. Notes

This v1.0 model is an implementation-oriented first-principles research model.
It is not intended to be a full fluid solver or DEM simulator.

Instead, it compresses perceptually important variables such as:

- container size
- fill
- viscosity
- particle count
- activity
- wall distance
- CoG eccentricity

into a small number of on-device states that can be updated at embedded control
rates.

Its main strength is that it can generate:

- liquid-like behavior
- shaker-like granular behavior
- hybrid material behavior
- low-frequency pseudo-force
- mid/high-frequency texture

from one shared internal state model, while preserving the repo's current
architectural split between:

- the four-layer vibrotactile pipeline
- the parallel low-frequency tilt pseudo-force branch
