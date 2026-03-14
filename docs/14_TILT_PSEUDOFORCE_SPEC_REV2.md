# 14 Tilt Pseudoforce Spec Rev2

## 0. Purpose

This document defines the revised low-frequency tilt-plane control law for the
two-servo pseudo-force branch.

This branch uses:

- 1 DOF tilt plane at the thumb
- 1 DOF tilt plane at the index finger
- XL330-M077-T x2

This branch is responsible for:

- generalized weight shifting
- vertical inertia
- horizontal inertia

This branch is not responsible for:

- droplet / splash / wall-hit / rolling / scraping textures
- high-frequency vibrotactile rendering

Those remain on the 4-actuator vibrotactile branch.

## 1. Design principles

### 1.1 Separation of responsibilities

Final command angle per finger:

```text
phi_cmd = phi_base + delta_phi_pseudoforce
```

Where:

- `phi_base`: existing container-attitude renderer
- `delta_phi_pseudoforce`: additive low-frequency correction from this branch

Do not replace `phi_base`.
Do not move high-frequency texture into this branch.

### 1.2 Generalized weight shifting

Low-frequency tilt feeling comes from the apparent force acting on the total
center of gravity of the shell plus contents.

This includes:

- rigid shell CoG effect
- content CoG shift effect
- horizontal inertia induced torque
- slow weight migration

### 1.3 Perceptual amplitude policy

Recommended initial levels:

- subtle: about `1 deg`
- clear: `2` to `3 deg`
- strong: `4` to `5 deg`
- often too dominant: more than `6 deg`

Recommended initial limits:

- differential branch nominal target: `0` to `3 deg` per finger
- differential branch hard limit: `+/-5 deg`
- common branch nominal target: `0` to `1.5 deg` per finger
- common branch hard limit: `+/-2.5 deg`
- total pseudo-force correction hard limit: `+/-6 deg`
- total final angle including base tilt hard limit: about `+/-10` to `12 deg`

## 2. Coordinate system

Define a container-fixed frame `B`:

- `+x`: toward thumb side
- `+y`: upward along the container
- `+z`: out of the `x-y` plane

Represent the low-frequency center of gravity in body frame as:

```text
r_cg_total = [x_cg, y_cg, 0]
```

The grasp center is the origin, and `w_eff` is the effective thumb-index grasp width in meters.

## 3. Inputs from upstream model

The branch receives:

- `m_shell`
- `m_content_eff`
- `r_shell`
- `r_content`
- `g_qs`
- `a_dyn`

If the upstream content migration model is still approximate:

- set `m_content_eff` from the preset
- estimate `r_content` from the current content model
- use `m_content_eff = 0` for empty-container presets

## 4. Unified physical model

### 4.1 Total apparent mass

```text
m_app = m_shell + m_content_eff
```

### 4.2 Total center of gravity

```text
r_cg_total =
  (m_shell * r_shell + m_content_eff * r_content) / (m_app + eps)
```

### 4.3 Apparent force

```text
F_app = m_app * (g_qs - a_dyn)
```

### 4.4 Torque around grasp center

```text
tau_z = cross(r_cg_total, F_app).z
tau_z = x_cg * F_app_y - y_cg * F_app_x
```

This captures shell CoG offset, content migration, slow tilt, and horizontal inertia torque in one term.

## 5. Mode decomposition

### 5.1 Common mode

Common mode is used only for dynamic vertical inertia:

```text
F_cm_raw = -m_app * a_dyn_y
F_cm = k_cm * F_cm_raw
```

### 5.2 Differential mode

Differential mode is used for generalized weight-shifting torque:

```text
tau_df = k_tau * tau_z
```

## 6. Finger-wise pseudo-force command

```text
u_thumb = 0.5 * F_cm + tau_df / w_eff
u_index = 0.5 * F_cm - tau_df / w_eff
```

## 7. Force-to-tilt mapping

Use `atan` mapping for stability:

```text
delta_phi_thumb_raw = atan( k_phi * u_thumb / (Ft_nom_thumb + eps) )
delta_phi_index_raw = atan( k_phi * u_index / (Ft_nom_index + eps) )
```

Clamp in this order:

1. common branch
2. differential branch
3. combined pseudo-force correction
4. final command including base tilt

## 8. Recommended initial values

```text
w_eff_m = 0.050
Ft_nom_thumb_N = 1.0
Ft_nom_index_N = 1.0

max_delta_cm_deg = 2.5
max_delta_df_deg = 5.0
max_delta_total_deg = 6.0
max_total_cmd_deg = 10.0

k_cm = 0.35
k_tau = 0.25
k_phi = 1.00
```

## 9. Base tilt interaction rule

Base tilt must remain dominant.

- pseudo-force correction should usually stay below about `50` to `70 percent` of the maximum base tilt amplitude
- pseudo-force correction should not exceed base tilt in ordinary operation

Final commands:

```text
phi_thumb_cmd = clamp(phi_thumb_base + delta_phi_thumb, -max_total_cmd, +max_total_cmd)
phi_index_cmd = clamp(phi_index_base + delta_phi_index, -max_total_cmd, +max_total_cmd)
```

## 10. Filtering and temporal shaping

This branch is low-frequency only.

Recommended processing:

- IMU acquisition: `400` to `1000 Hz`
- low-frequency state update: `100` to `200 Hz`
- servo command update: `100` to `200 Hz`

Recommended filters:

- `g_qs` cutoff: `2` to `5 Hz`
- `a_dyn` low-pass cutoff: `6` to `10 Hz`
- `r_content` low-pass cutoff: `3` to `6 Hz`
- command smoothing cutoff: `5` to `8 Hz`

Recommended command shaping:

- pseudo-force slew: `60` to `100 deg/s`
- starting hard upper bound: `120 deg/s`
- deadband: `0.1` to `0.2 deg`

## 11. XL330 operation policy

Use current-based position control mode.

Policy:

- position target from `phi_cmd`
- conservative current limit
- watchdog enabled
- profile velocity and acceleration limited

Safety:

- communication timeout returns safely to base tilt or neutral
- disabled branch forces `delta_phi = 0` with a soft ramp
- avoid sustaining long high current

## 12. Reference implementation equations

```text
m_app = m_shell + m_content_eff

r_cg_total =
  (m_shell * r_shell + m_content_eff * r_content) / (m_app + eps)

F_app_x = m_app * (g_qs_x - a_dyn_x)
F_app_y = m_app * (g_qs_y - a_dyn_y)

tau_z = r_cg_total_x * F_app_y - r_cg_total_y * F_app_x

F_cm = k_cm * (-m_app * a_dyn_y)
T_df = k_tau * tau_z

u_thumb = 0.5 * F_cm + T_df / w_eff
u_index = 0.5 * F_cm - T_df / w_eff

phi_cm_thumb = atan( k_phi * (0.5 * F_cm) / (Ft_nom_thumb + eps) )
phi_cm_index = atan( k_phi * (0.5 * F_cm) / (Ft_nom_index + eps) )

phi_df_thumb = atan( k_phi * ( T_df / w_eff ) / (Ft_nom_thumb + eps) )
phi_df_index = atan( k_phi * (-T_df / w_eff ) / (Ft_nom_index + eps) )

Clamp phi_cm_* to +/- max_delta_cm
Clamp phi_df_* to +/- max_delta_df

delta_phi_thumb = clamp(phi_cm_thumb + phi_df_thumb, -max_delta_total, +max_delta_total)
delta_phi_index = clamp(phi_cm_index + phi_df_index, -max_delta_total, +max_delta_total)

phi_thumb_cmd = clamp(phi_thumb_base + s_thumb * delta_phi_thumb, -max_total_cmd, +max_total_cmd)
phi_index_cmd = clamp(phi_index_base + s_index * delta_phi_index, -max_total_cmd, +max_total_cmd)
```

`s_thumb` and `s_index` are hardware sign calibration constants.

## 13. Default initialization example

```text
max_delta_cm_rad = deg2rad(2.5)
max_delta_df_rad = deg2rad(5.0)
max_delta_total_rad = deg2rad(6.0)
max_total_cmd_rad = deg2rad(10.0)

k_cm = 0.35
k_tau = 0.25
k_phi = 1.00

Ft_nom_thumb_N = 1.0
Ft_nom_index_N = 1.0
w_eff_m = 0.050
```

## 14. Acceptance criteria

1. Base tilt remains intact when pseudo-force is disabled.
2. Empty container generates low-frequency torque through shell CoG only.
3. Filled container adds torque through content CoG migration.
4. Vertical inertia appears as common-mode tilt.
5. Weight shifting and horizontal inertia appear as differential tilt.
6. Ordinary operation usually stays within:
   - common mode <= about `1.5 deg`
   - differential <= about `3 deg`
7. Hard limits are respected:
   - common <= `2.5 deg`
   - differential <= `5 deg`
   - total pseudo-force <= `6 deg`
   - total command <= `10 deg` initially
8. The branch remains low-frequency and does not reproduce vibrotactile textures.

## 15. Notes for future integration

Later revisions may add:

- tighter coupling with the shared latent state
- smartphone / HMD tuning workflows
- stronger hardware sign and load calibration

The branch should remain:

- low-frequency
- additive on top of base tilt
- physically interpretable
- cleanly separated from texture rendering
