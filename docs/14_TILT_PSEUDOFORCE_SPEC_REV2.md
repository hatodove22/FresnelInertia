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

## 11. XL330 integration and operation policy

### 11.1 Current implementation boundary

`TiltPseudoForceModel` is the current software model for producing the logical
thumb/index commands described in this document. The existing
`TiltPlaneServoInterface`, however, is a legacy StickS3-oriented prototype. It
assumes one shared UART data pin plus a firmware-controlled direction pin and
uses the older StickS3 pin and baud defaults. Those assumptions do not match the
assembled AtomS3 `M5AtomS3_MAX98357A_4CH_TDM_DXL2` board.

The as-built AtomS3 board instead uses:

- `GPIO1` as DYNAMIXEL TX
- `GPIO2` as DYNAMIXEL RX
- automatic half-duplex direction control on the PCB
- no firmware direction pin
- `57,600 bps` for the two currently provisioned XL330 units

Therefore the legacy `TiltPlaneServoInterface` must not be enabled on the
AtomS3 board. The current `m5stack-atoms3-pipeline` production-oriented
environment deliberately builds with `HAPTICS_ENABLE_TILT_SERVO=0`. The
dedicated DXL2 and combined probes remain the only approved AtomS3 servo paths
until the state machine in this section is implemented and validated.

This compile-out does not remove the logical pseudo-force model or change the
four-transducer pipeline. It prevents unvalidated logical commands from being
converted into physical servo motion.

### 11.2 Arming and run-mode policy

Physical servo output requires both compile-time inclusion and an explicit
runtime arm operation. Enabling the pseudo-force model is not itself permission
to energize either servo.

The default policy is:

- boot, reset, and configuration changes leave both servos torque-off
- only `Live` and `Record` modes may request an arm
- `Idle`, `Calibration`, and `Replay` keep the servo branch disarmed by default
- remote stop/disarm is always allowed
- remote arm is rejected by default and requires a separate, explicit safety
  authorization before it may be added
- changing an unrelated runtime parameter must never rewrite an XL330 operating
  mode or re-enable torque
- a disabled pseudo-force correction returns `delta_phi` to zero with a soft
  ramp, while an explicit servo disarm proceeds to verified torque-off

### 11.3 Required DXL2 safety state machine

The AtomS3 production backend should use an explicit state machine:

```text
Disabled
  -> Checking
  -> ReadyTorqueOff
  -> Arming
  -> Armed
  -> FaultLatched
```

Required behavior:

1. `Disabled` initializes the UART and requests broadcast torque-off only.
2. `Checking` verifies IDs `1` and `2`, model `1190`, operating mode, current
   position, voltage, temperature, present current, and Hardware Error Status.
3. `ReadyTorqueOff` means both units passed read-back and remain torque-off.
4. `Arming` first writes a safe goal equal to the present or calibrated home
   position, installs the bounded RAM settings and watchdog, and only then
   enables torque with read-back.
5. `Armed` accepts rate-limited low-frequency commands and periodically reads
   both devices' health and position.
6. Any limit violation, stale IMU, communication timeout, malformed status,
   watchdog error, or explicit stop requests torque-off and enters
   `FaultLatched`.
7. `FaultLatched` cannot re-arm automatically. It requires an operator clear
   followed by a complete new check.

The DYNAMIXEL Bus Watchdog is a second line of defense for a stalled controller;
it does not replace verified torque-off, health polling, or the fault latch.

### 11.4 Initial AtomS3 motion envelope

The first production integration must reproduce the already proven unloaded
probe envelope before any wider motion or current-based position experiment:

- TX=`GPIO1`, RX=`GPIO2`, `57,600 bps`
- expected IDs `1` and `2`, expected model `1190`
- Position Control Mode (`Operating Mode = 3`)
- automatic torque-on disabled
- measured session or calibrated raw home for each servo
- maximum initial travel: `+/-40 pulses` (about `+/-3.52 deg`)
- Profile Acceleration `1`
- Profile Velocity `5`
- Goal PWM limit `150` (about 17 percent)
- Bus Watchdog `50` (1 second)
- abort above `350 mA`
- abort above `45 C`
- abort outside `4.5` to `5.6 V`
- abort on any hardware error, status-read failure, stale IMU, or motion timeout

These are bring-up limits, not final loaded-system limits. Wider travel and
higher sustained effort require a separate mounted-mechanism validation.

Current-based Position Control Mode (`Operating Mode = 5`) remains the intended
later control policy because it can bound finger force while tracking position.
It must not be selected automatically during ordinary startup or configuration.
Changing Operating Mode is a separate, explicit provisioning step, and Mode 5
may be enabled only after the Mode 3 integration above passes. Software raw
position limits remain mandatory because the XL330 Min/Max Position Limit
registers do not constrain Current-based Position Control Mode.

### 11.5 Home and direction calibration

Logical degrees must be converted relative to a calibrated raw neutral rather
than assuming that logical zero is encoder position `2047`:

```text
goal_raw = home_raw
         + raw_direction * round(logical_angle_deg / 0.088)
```

Each servo requires:

- `home_raw`
- `home_raw_valid`
- `raw_direction` (`+1` or `-1`)
- an absolute software raw-position window around `home_raw`

An invalid or missing home calibration rejects arming. `raw_direction` describes
the mechanical encoder direction and is distinct from `s_thumb` / `s_index`,
which describe the perceptual sign of the pseudo-force correction.

### 11.6 Scheduling and branch separation

The servo interface should store the latest logical command and service the bus
at a bounded low-frequency cadence rather than issuing several blocking UART
writes from every pipeline tick. Two-device synchronized writes are preferred,
with slower alternating status reads. UART service time, command age, status
age, communication errors, watchdog state, and actual position/current/voltage/
temperature must be exposed through telemetry.

The servo branch consumes only the IMU and shared low-frequency mass state. It
must not consume wall events, texture atoms, resonance voices, or `DriveFrame4`.
Likewise, servo enable/disable state must not alter the four TDM wall channels.

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
9. The current AtomS3 production environment keeps physical servo output
   compile-disabled until the new DXL2 state machine is implemented.
10. Boot, reset, preset changes, and unrelated runtime parameter changes produce
    no servo motion and leave both units torque-off.
11. Preflight accepts only IDs `1` and `2` reporting model `1190` at
    `57,600 bps`, with plausible voltage and temperature, zero hardware error,
    and verified torque-off.
12. The first integrated motion test uses Mode 3, stays within `+/-40 pulses` of
    each validated `home_raw`, applies Profile Acceleration `1`, Profile Velocity
    `5`, and Goal PWM `150`, and returns to home within the defined tolerance.
13. Missing home calibration, invalid direction, mode mismatch, device mismatch,
    or unsafe initial position rejects arming.
14. Absolute current above `350 mA`, temperature above `45 C`, voltage outside
    `4.5` to `5.6 V`, a hardware error, stale IMU, status timeout, or command
    timeout causes a fault-latched stop and verified torque-off.
15. A controller stall is bounded by Bus Watchdog `50` (1 second), and recovery
    cannot re-arm without clearing the watchdog error and repeating preflight.
16. Only `Live` and `Record` may be armed; `Idle`, `Calibration`, and `Replay`
    remain disarmed by default, and a remote arm request is rejected by default.
17. Servo activation does not change the canonical Front/Back/Top/Bottom TDM
    mapping, the upstream `DriveFrame4`, or the four-transducer output level.
18. Simultaneous IMU, two-servo, and four-channel operation completes with live
    health read-back, no I2S error or reset, no unexpected motion, and final
    torque-off confirmation.
19. Current-based Position Mode is not accepted for production use until it has
    a separate sign, load, current, thermal, software-position-limit, watchdog,
    and fault-recovery validation record.

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
