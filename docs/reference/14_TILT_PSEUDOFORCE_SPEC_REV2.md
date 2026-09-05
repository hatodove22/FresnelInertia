# Tilt Pseudoforce Model Reference

This records the implemented reduced model and its open conceptual mapping.
It is not a second operating-limit or acceptance document. Current hardware
settings are in [04](../04_HARDWARE_AND_PIN_SPEC.md), parameters in
[06](../06_PARAMETER_MODEL.md), and demo acceptance in
[07](../07_TEST_AND_VALIDATION.md).

## Role and implementation boundary

[Source](../../src/TiltPseudoForceModel.cpp) derives two low-frequency contact
plane commands from body-frame IMU and shared MassState. Four-transducer
texture/events stay on the separate branch; no second material simulator or
servo waveform transport is needed.

The coherent assembled formula is:
`final angle = full-command filter/slew(bound_pair(sign * (base + correction)))`.
Generic defaults retain `base + signed filtered correction`.

The paper assigns content position and vertical inertia to common motion, and
CoG shift/horizontal inertia to differential motion. The coherent position base
now follows that common-motion assignment. Mounted relative motor directions
have been checked. Combined handling and desktop visual/felt direction have
positive evidence in [16](../16_PROGRESS_STATUS.md); this is not a perceptual
validation of every term. The proposed reference-angle/CG refinement in
[08](../08_IMPLEMENTATION_PLAN.md) is not implemented and will need its own
focused comparison against this accepted baseline.

## Coordinates and state

Use the right-handed body frame: +x thumb to index, +y nominally upward,
+z toward the wrist. Semantic forward is -z. Both servo axes are parallel,
not mirror-mounted. The measured raw IMU transform is in 04 and applies to
acceleration and gyro at the model boundary; telemetry remains raw.

The model estimates quasi-static gravity `g_qs` by low-pass filtering measured
acceleration, then low-pass filters `acceleration - g_qs` as `a_dyn`.
First valid input initializes gravity without an artificial dynamic impulse.

Normalized content position maps to a bounded planar content CoG:
`0.5 * container span * content_cg_span_fraction * family_scale * pos_norm`.
Family scales are liquid 1.0, hybrid 0.85, granular 0.60, detented 0.35,
custom 0.70. This estimate is filtered by `content_cg_cutoff_hz`.

## Current force and torque calculation

```text
m_content = max(0, content_mass_full_kg) * clamp(fill, 0, 1)
m_app = max(0, shell_mass_kg) + m_content
r_cg = (m_shell * r_shell + m_content * r_content) / (m_app + eps)

F_app = m_app * (g_qs - a_dyn)
tau_z = r_cg.x * F_app.y - r_cg.y * F_app.x
F_cm = k_cm * (-m_app * a_dyn.y)
T_df = k_tau * tau_z
```

Here common motion represents dynamic vertical inertia; differential torque
combines CoG eccentricity, gravity and horizontal acceleration.
Nominal grip-force parameters are fixed inputs, not measured FSR feedback.

For each finger, calculate common and differential angles separately:
```text
phi_cm_thumb = atan(k_phi * 0.5 * F_cm / (Ft_nom_thumb + eps))
phi_cm_index = atan(k_phi * 0.5 * F_cm / (Ft_nom_index + eps))
phi_df_thumb = atan(k_phi * ( T_df / (w_eff + eps)) / (Ft_nom_thumb + eps))
phi_df_index = atan(k_phi * (-T_df / (w_eff + eps)) / (Ft_nom_index + eps))

clamp each common angle to +/- max_delta_cm
clamp each differential angle to +/- max_delta_df
target_delta = clamp(phi_cm + phi_df, +/- max_delta_total)
```

Convert radians to degrees before the subsequent degree-domain operations.
Do not replace the separate atan terms with a single atan of their sum when
describing the current implementation; they are not equivalent.

## Base, correction and final command

With `enable_coherent_container_demo=true` (assembled profile):

```text
content_gain = clamp(m_content / 0.005 kg, 0, 1)
base_thumb = base_index = content_gain * clamp(pos.x, -1, 1) * max_tilt_deg
target_i = sign_i * (base_i + target_delta_i)
scale both targets together until max(abs(target_i)) <= max_total_cmd_deg
relative_i = slew_limit(lowpass(target_i, command_cutoff_hz),
                        min(max_velocity_deg_s, pseudoforce_slew_deg_s))
```

Signs calibrate the complete command. The pairwise scale preserves the target
common/differential ratio before filtering. The content base fades to zero as
content approaches empty; shell inertia can still remain. There is no hard
correction deadband. Telemetry base/delta values describe pre-composition terms,
not a sum that equals the instantaneous filtered final angle.

With the flag false, the preserved legacy formula is:

```text
base_thumb =  clamp(mass.pos_norm.x, -1, 1) * max_tilt_deg
base_index = -clamp(mass.pos_norm.x, -1, 1) * max_tilt_deg

delta = lowpass(target_delta, command_cutoff_hz)
delta = slew_limit(delta, pseudoforce_slew_deg_s)
delta = deadband(delta, command_deadband_deg)

relative_thumb = clamp(base_thumb + sign_thumb * delta_thumb, +/- max_total_cmd)
relative_index = clamp(base_index + sign_index * delta_index, +/- max_total_cmd)
```

The model adds its logical home offsets to these relative angles.
Disabling pseudo-force sets target_delta to zero; filtering lets the correction
decay while the base remains. Explicit output disarm is a separate operation.

Only the correction is filtered/slew-limited in the legacy path. Its base is
summed afterward. AtomS3 clamps the complete command and maps it to session-home
pulses; the legacy backend's `max_velocity_deg_s` limiter does not apply to
that legacy AtomS3 path. The coherent model supplies full-angle continuity
before the backend, regardless of the transport.

The assembled useful strength was established by user handling; generic
small-angle examples are not universal perceptual thresholds. There is no
requirement that the correction stay weaker than the base. Tune their relation
to communicate content motion while respecting the current usable envelope.

## Servo realization and observation

AtomS3 uses Position Mode 3, synchronized goals with a nominal 10 ms period,
and periodic health feedback through its TX/RX automatic half-duplex adapter.
Goal PWM bounds drive authority; it is not an open-loop PWM angle command.
Current-based Position Mode is not required for this demonstration.

Each logical angle maps through:
`goal_raw = home_raw + raw_direction * round(angle_deg / 0.088)`.
Session homes come from measured positions; model signs and raw encoder
directions have separate meanings.

Runtime health reads are incremental and retried, with one outstanding reply.
They no longer block model/texture processing. Goal writes wait for that reply
or its timeout; a configured period is not proof of measured smooth output.
Preflight/arm/explicit Stop verification remain synchronous.
Telemetry exposes model commands separately from servo validity and
home/goal/actual position. Compare the full command with fresh feedback before
attributing jerk to radio cadence, gain, the mechanical connection or a stop.

Historical tuning and measured motion remain in
[validation history](../archive/2026-09-05/07_TEST_AND_VALIDATION_FULL_RECORD.md).
Do not repeat that bring-up ladder. The next test is the continuous,
directionally coherent combined experience described in 07.
