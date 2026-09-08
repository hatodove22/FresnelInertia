# 06 Parameter Model

This is a lookup for tuning the shared model, not a mandatory tuning campaign.
The full field/default catalog lives in [Parameters.hpp](../include/haptics/Parameters.hpp);
runtime handling in [HapticPipeline.cpp](../src/HapticPipeline.cpp);
preset overlays in [PresetStore.cpp](../src/PresetStore.cpp).
Use [08](08_IMPLEMENTATION_PLAN.md) to choose what actually needs work.

For the 2026-09-06 code-level applicability audit and proposals separating
physical properties, model state, perceptual gains and device compensation,
see [FW model research (Japanese)](reference/34_FW_MODEL_RESEARCH.md).
Its candidate parameters and algorithms are not new implemented controls.

## Three different surfaces

1. C++ parameters describe the complete model and hardware/session settings.
2. Preset JSON overlays only its supported fields.
3. Runtime commands expose a subset; the dongle has a smaller allowlist than
   the local/backend parameter handler. See [05](05_INTERFACE_SPEC.md).

A model field is not automatically writable from the client. Generic defaults
and the assembled-device profile also differ intentionally. Keep user controls
meaningful: material, fill, dimensions and useful perceptual strength, rather
than exposing every filter coefficient.

## Useful tuning groups

| Group | Principal fields | Intended effect |
|---|---|---|
| Geometry | `container.span_x_m/span_y_m/span_z_m` | x/y travel and collision spacing; z supplies depth metadata/display in the current coherent cross-section model |
| Amount | `container.fill/headspace` | Content amount and available motion |
| Material | `container.family/viscosity/particle_count/particle_hardness/enable_roof_contact` | Shared pipeline's liquid, granular, hybrid or custom behavior |
| Mass response | `mass.natural_freq_x_hz/natural_freq_y_hz/damping_ratio_x/damping_ratio_y/rebound` | Motion lag, settling and rebound |
| Activity | `mass.energy_decay_s/accel_to_energy_gain/gyro_to_energy_gain` | Motion-driven event activity |
| Events | `event.wall_threshold/roll_rate_hz/impact_rate_hz/droplet_rate_hz/splash_threshold/roof_slap_threshold/scrape_threshold` | Contact threshold and event population |
| Texture | `texture.hard_ping_low_ms/hard_ping_high_ms/wet_burst_ms/dry_rattle_ms/scrape_noise_ms/flow_ripple_soa_ms/default_high_bias` | Event character and directional timing |
| Resonance | `resonance.low_carrier_hz/high_carrier_hz/low_gain/high_gain` (four entries each), `master_gain` | Carrier and per-channel response |
| Spatial | `spatial.wall_softmax_delta/neighbor_bleed/opposite_bleed` | Distribution across four walls |

`particle_count` is a normalized 0..1 population proxy, not a literal particle
count. The sparse hard-particle corner uses `knock_ping`; a single-marble
preset or single-coin preset therefore does not require a separate engine. In the retained legacy
path, `wall_threshold` adjusts the active wall zone and `splash_threshold` is
an activity reference. The coherent path below uses actual contacts instead.

`flow_ripple_soa_ms` sets a lead/trail neighbor delay.
`hard_ping_high_ms` controls the high-band tail independently of the low band.
Tune these only when a felt defect makes them relevant. Coherent FlowRipple
preserves the delayed neighbor's complete envelope, not just one update frame.

## Coherent assembled-device model

`features.enable_coherent_container_demo` is false generically and true in the
as-built AtomS3 profile. Changing it through the backend handler requires Idle;
it is not exposed by the dongle's numeric allowlist. Ordinary preset loads preserve
it; explicit new pile/pressure presets require and enable the coherent path.

- Acceleration is converted from g to normalized distance/s² using half-span.
  Liquids use a damped slosh mode; rigid/granular content has no center spring.
- Liquid/hybrid fill and headspace affect restoring force and drag. Axis damping
  ratios and viscosity affect settling; granular hardness/rebound affect impact.
- Real wall crossings supply pre-bounce impact speed. Static support does not
  create repeated taps. Contact travel distance drives rolling/flow density.
- Empty fill or zero full-content mass produces no content motion or events
  (the custom Detented interaction is exempt). Sparse marble remains perceptible
  at its small positive fill; this is a perceptual reduced model, not particle CFD.
- Legacy energy-driven event-rate/threshold fields remain for compatibility;
  they do not schedule coherent collisions. `energy_decay_s` still shapes the
  reported activity tail. Do not tune an inactive field expecting a new effect.

## Opt-in material demonstrations

`granular_single_coin_box` adds an explicit one-coin comparison based on
`granular_coin_box`. It retains the 50 x 50 x 30 mm container, 75 g shell,
viscosity 0.05, hardness 0.90 and existing coin response/output settings.
Its fill is 0.04, headspace 0.96 and normalized `particle_count` 0.03, selecting
the existing sparse hard-inclusion path (`particle_count <= 0.10`, hardness
`>= 0.80`). Coherent wall contacts become individual `WallHit` events rather
than bulk `ImpactCluster` events; no new dynamics or control law is added.
`content_mass_full_kg=0.125` multiplied by fill gives 0.005 kg effective content
mass, not a 125 g coin. The [JSON metadata](../presets/granular_single_coin_box.json)
matches this new built-in. Existing coin, marble and sand presets are unchanged.

The Lab runs both coin conditions through the production C++ model. Connected
single-coin selection needs the next AtomS3 firmware upload containing this
built-in; an older image can reject the name, and the client keeps the actual
applied material visible. Existing generic preset-name transport and resolved
configuration carry it without a new wire format or StampC5 update. The richer
coin rendering is Web presentation only; single-coin model checks do not
establish its physical feel. Visual ownership is described in
[31](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md).

Generic defaults and the existing marble/sand presets are unchanged. Built-ins
`granular_sand_pile_box` and `liquid_soda_bottle` select new behavior explicitly.
Their material-owned feature flags are applied on preset load, unlike preserved
hardware/session gates; loading an ordinary preset clears these two flags.
Both need updated AtomS3 and StampC5 firmware for connected use (v4 state).

- `features.enable_granular_pile_demo`: coherent dense, softer granular material
  (`particle_count >= 0.5`, `particle_hardness < 0.8`). A constant-volume x/y pile
  uses `mass.granular_static_friction=0.55` and dynamic friction `0.35`.
  Static friction retains the free-surface slope after returning to level;
  sufficient opposite tilt or agitation releases it. Clipped-section area and
  first moments supply `mass.pos_norm`; the renderer uses that same slope and
  fill. This is a reduced pile, not full 3D grain simulation or an inversion model.
- `features.enable_pressurized_demo`: coherent liquid only. Motion charges a
  stylized sealed state, which emits one `PressurePop`, then a roughly 2.8 s
  decaying spray and a spent state. Reset/reload reseals. Charge is an authored
  effect value, not measured or physically simulated gas pressure. Remaining
  content scales visible fill, event voicing and effective tilt content mass;
  the underlying slosh fill remains the initial configured amount. It is not a
  mass-conserving multiphase fluid solver.

The offline Lab enables the pile flag explicitly for its sand comparison and
lets the user switch it OFF against the old model. This does not change the
firmware's existing `granular_sand_box`. Its API exposes selected model fields
for offline use only; it does not widen the dongle parameter allowlist.

The mass-layer pile centroid is geometric; the tilt branch still applies its
accepted material voicing, CG span and filtering. Do not label that filtered
tilt-model CG as the exact visible pile centroid or a measured force.

### Fictional heartbeat

`heartbeat_soft_object` is a built-in Custom preset, explicitly enabling
`features.enable_heartbeat_demo`; all existing presets keep it disabled.
The shared `HeartbeatModel` owns phase and envelopes, not the browser or an
independent servo timer. Its dimensions are 65 × 85 × 50 mm, fill 1, and
`resonance.master_gain=0.65`.

`heartbeat.bpm=72`, `pulse_gain=0.95`, `secondary_gain=0.58` and
`contraction_deg=4` are authored defaults. Primary/secondary sin² windows start
at cycle phases 0.06/0.28 with widths 0.15/0.12; the slower contraction starts
at 0.06 with width 0.43. The explicit pulse event passes through texture,
resonance and Spatial4. The contraction adds opposed logical plane deltas
inside existing calibrated signs, angle/velocity bounds and output authority.
That logical mapping is not yet a handled perceptual result.

The Wasm API exposes experimental heartbeat setters bounded to 40–140 BPM,
0–1 pulse/secondary gains and 0–10° contraction; ordinary remote
commands do not expose these extra knobs. This is not part of the three-material
joint preference space and measures neither grip force nor biological heart rate.
Connected use needs both AtomS3 and StampC5 v5 support ([05](05_INTERFACE_SPEC.md)).

## Motion input and coordinates

The assembled profile enables `features.enable_gravity_separated_mass_activity`.
Its `motion_activity` defaults are gravity cutoff 1 Hz, motion cutoff 10 Hz,
acceleration deadband 0.025 g and gyro deadband 1.5 deg/s. Attitude still moves
the latent position; gravity-separated activity drives legacy agitation/energy.
Quiet content stops scheduling new events rather than retaining an autonomous
rattle floor. These session settings survive preset loading.

`features.enable_device_frame_transform` applies the measured IMU rotation to
both acceleration and gyro before model processing. It is profile-owned, not
a generic remote setter. Telemetry/recorded IMU remains raw. See
[04](04_HARDWARE_AND_PIN_SPEC.md) for the exact axes and rotation.

`mass.control_rate_hz=250` is a nominal integration setting, not a measured
fixed-rate loop. The implementation bounds recovery/substeps and treats long
gaps separately. Runtime servo feedback now advances without blocking that loop;
preflight, arm and explicit Stop verification remain synchronous.
Those implementation details are not independent demo acceptance gates.

`tilt.communication_recovery_ms` is profile-owned: 0 in generic defaults
(retain the existing terminal communication-fault policy), 500 ms in the
assembled AtomS3 profile, with a runtime hard cap of 750 ms. It is not a remote
setter or material parameter and survives preset selection with the other tilt
configuration. It grants a bounded live DYNAMIXEL retry window, not permission to restart after Stop or a
hardware/IMU fault. [04](04_HARDWARE_AND_PIN_SPEC.md) owns the recovery behavior.

## Audio

| Setting | Assembled profile |
|---|---|
| `audio.transport` / `output_layout` | `tdm8_slot` / `quad_wall_4ch` |
| `sample_rate_hz` | 48000 |
| `dma_buf_len` / `dma_buf_count` | 240 / 12 |
| `keep_driver_installed_when_muted` | true; output digital zeros |
| `runtime_enable` | false at boot |
| `output_gain` | 1.0 initial gain |
| `output_peak_limit` | 0.08 initially; compiled ceiling 0.15 |

The peak clamp is applied after mixing/gain. It is normalized PCM amplitude,
not electrical power or perceptual intensity. Short combined operation has
been demonstrated; these numbers are not a continuous-drive rating.

Both `features.enable_audio_output` and `audio.runtime_enable` gate output.
Changing transport, layout or `demo_compat_mode` requires runtime audio OFF.
The retained `dual_i2s`, `front_back_2ch` and bus-A demo compatibility options
serve legacy diagnostics; do not substitute them for the four-channel demo.
Demo compatibility is not accepted with TDM. Read-only silence status reports
the software zero assertion, not the manual S1 position.

## Tilt-plane branch

| Purpose | Parameters |
|---|---|
| Content-position base cue | `tilt.max_tilt_deg` (coherent law; not the final mechanical command bound) |
| Shell/content mass and CoG | `container.shell_mass_kg/content_mass_full_kg/shell_cg_x_m/shell_cg_y_m` |
| Enable model correction | `tilt.enable_pseudoforce` |
| Force/torque conversion | `tilt.k_cm/k_tau/k_phi/w_eff_m/Ft_nom_thumb_N/Ft_nom_index_N` |
| Model direction | `tilt.sign_thumb/sign_index` |
| Correction bounds | `tilt.max_delta_cm_deg/max_delta_df_deg/max_delta_total_deg` |
| Final command bound | `tilt.max_total_cmd_deg` |
| State filtering | `tilt.g_qs_cutoff_hz/a_dyn_cutoff_hz/content_cg_cutoff_hz` |
| Correction filtering | `tilt.command_cutoff_hz/command_deadband_deg/pseudoforce_slew_deg_s` |

Dynamic center of gravity is already implemented, not a proposed new subsystem.
The moving `mass.pos_norm` is mapped to a filtered content CG using the x/y
spans, `tilt.content_cg_span_fraction` and a material-family scale. The model
combines it with shell CG and fill-dependent content mass before calculating
the differential load/inertia cue. This remains a reduced x/y model, not full
3D content motion or a measured center of gravity.

The coherent model combines common content position with pseudo-force and
differential CoG/inertia. It scales both angles together to the travel bound,
then low-passes and slew-limits the complete command using the smaller of
`max_velocity_deg_s` and `pseudoforce_slew_deg_s`. The ordinary assembled value
is 80 degrees/s; the brief soda opening has the bounded exception below.
No hard correction deadband is applied in this path. Generic legacy
behavior still filters only the correction and uses a differential position base.

The opt-in coherent liquid pressure effect adds an authored negative-body-Y
recoil to the common-force term during `Burst`, opposite the body +Y outlet.
In [TiltPseudoForceModel.cpp](../src/TiltPseudoForceModel.cpp), the cue holds
`-0.055 N` for 50 ms, then cosine-blends to `-0.007 N * charge` by 160 ms;
the whole cue scales by `clamp(fill / 0.62, 0, 1)`. These are fixed tactile
coefficients, not measured thrust or new remotely adjustable parameters.
It uses shared `pressure.phase_s`, not a timer restarted when tilt is enabled.
The existing `common_force_n` now includes this term after `k_cm` inertia
scaling; the existing signs, common-angle cap and full-command travel scaling
still apply. To sharpen the opening without changing ordinary response, its
fill-scaled cosine envelope also blends the positive command cutoff toward at
least 24 Hz and multiplies `pseudoforce_slew_deg_s` by up to 1.5, still capped
by `max_velocity_deg_s`. At full soda fill this is 24 Hz / 120 degrees/s on the
assembled profile, returning to 6 Hz / 80 degrees/s by 160 ms. An intentionally
disabled (nonpositive) filter remains disabled; a higher cutoff is not reduced.
The boost requires enabled pseudoforce and a valid opening, not charge alone
or the whole vent phase. No new independent clock or event is introduced.

The shaping remains after full-command composition, so simultaneous CG motion
also passes through that brief faster filter. Outside the opening its response
is unchanged. Existing +/-10-degree total travel and 5-degree common correction
remain: an already saturated same-direction pose has no additional kick room.
Pressure evolution, vibration excitation, wire fields, current/PWM and servo
bus/profile settings are unchanged. A physical feel judgment needs the updated
AtomS3; rebuilding/refreshing the Web page changes only the output-free Lab.

`sign_thumb/sign_index` calibrate the complete coherent command (only the
correction in legacy mode). The
separate hardware `thumb_raw_direction/index_raw_direction` map logical angle
to DYNAMIXEL encoder direction. Parallel-mounted motors use +1/+1 raw
directions; their relative common/differential response was checked.
The overall coherent response and desktop visual/felt agreement now have
positive operator evidence in [16](16_PROGRESS_STATUS.md); that does not isolate
the perceptual contribution of each position/inertia term.

Grip forces `Ft_nom_*` are nominal parameters, not measured FSR input.
The assembled backend uses Position Mode 3 at 57,600 bps and session homes
from measured positions; generic 1,000,000-bps settings belong to the legacy
path. Current accepted strength, bounds and bus details belong in
[04](04_HARDWARE_AND_PIN_SPEC.md), not a second parameter-limit table here.

## Gates and runtime state

New optional behavior must preserve generic defaults. The assembled profile
opts into physical master gain, attack-preserving texture, single-shot spatial
delay, gravity-separated activity, the device transform, coherent container
rendering and stale-IMU stop.

USB telemetry and ESP-NOW each have compile gates and default-OFF local
session enables. The dedicated tilt+ESP-NOW demo alone opts into radio startup
after establishing Idle/output OFF; see [05](05_INTERFACE_SPEC.md).
`features.allow_remote_tilt_arm` is false generically;
the dedicated tilt+ESP-NOW image explicitly authorizes its paired arm command.
Generic `set_param` cannot arm tilt. Stop resets dynamic state and disables
audio/tilt; Live alone leaves output off. The current command rules are in 05.

Debug telemetry, calibration sweeps, interface cadence and recorder flush
settings remain available as specialist controls. Fault injection is a local
diagnostic, not a preset/property. No new safety test campaign is implied by
keeping these existing mechanisms.

## Preset ownership and connected visuals

Built-in C++ presets are always available to firmware. Root `presets/*.json`
files feed the visual demo and reach firmware only if explicitly provisioned
to LittleFS under `/presets`. There is no automatic data-image/uploadfs workflow.

The sources are not identical: `liquid_small_box.json` specifies wall threshold
0.72 and droplet rate 40, while its built-in counterpart uses 0.62 and 24.
The built-in single-marble preset is available in the connected device selector,
although it is absent from the separate JSON-preview list. The browser also
has preview-only shapes without matching built-in firmware presets.

The connected view now uses device-applied material, dimensions, fill and motion
from telemetry, rather than importing JSON values under the same name. The
connected selector lists firmware built-ins; the reported applied name and
configuration remain authoritative if LittleFS overlays differ. No filesystem
format or preset upload is needed for this path.

The 230-byte ESP-NOW v3 packet adds `resolved.family`, three spans, headspace,
viscosity, normalized particle count/hardness and coherent-model/frame flags.
Fill comes from the same snapshot's `mass.fill`. The bridge exposes these as
`resolved.container` and `resolved.model`; see [05](05_INTERFACE_SPEC.md).
It still decodes v1/v2, which lack resolved configuration and therefore cannot
establish connected geometry agreement. This is a small applied-state exchange,
not a complete parameter dump or fluid/particle CFD representation.

The connected HUD currently offers preset selection and a fill control that
also sets `headspace = 1 - fill`; the firmware's underlying two parameters remain
independent. Other allowlisted properties remain available through the dongle
commands. Preset/fill edits first Stop; execution ACKs and reported applied state
separate a requested change from success. Start then enables the user's selected
outputs explicitly. Client build/parser tests do not establish physical
Android transfer or perceptual agreement. The latest positive smartphone report
and its unitemized device/flow coverage are recorded in
[16](16_PROGRESS_STATUS.md); it does not verify the newly added coin condition.
Existing desktop and initial Quest evidence is retained there;
VR/Quest work is on hold.

## Joint preference search

The [preference workspace](../webxr/README.md#preference-tuning) compares
three fixed representative conditions with all five normalized coordinates proposed together:
`liquid_small_box`, `granular_single_marble_box` and `granular_sand_pile_box`.
The judgment concerns the combined vibration and fingertip-plane experience,
not separately optimized output branches.

The Web implementation owns these definitions in
[`TuningParameterSpace`](../webxr/src/tuning/TuningParameterSpace.ts), independent
of session history and inference. Session mapping, portable profiles and Haptic
Link consume the same ordered paths and coupling definitions. Their distinct
import/remote acceptance policies remain at each boundary; see the
[dependency contract](reference/31_REUSABLE_VISUAL_ARCHITECTURE.md#preference-tuning-workspace).

| Search coordinate | Applied field(s) | Range | Meaning in the coherent model |
|---|---|---|---|
| Vibration strength | `resonance.master_gain` | 0.10–1.00 | Four-channel vibration gain, not servo strength |
| Material response (water / marble) | `mass.damping_ratio_x/y` (equal values) | 0.05–1.50 | Slosh / single-particle drag and downstream cues |
| Material response (sand instead of damping) | `mass.granular_static_friction`, `mass.granular_dynamic_friction` | static 0.20–0.90; dynamic = static × 7/11 | Collapse threshold, flow and retained center of mass |
| Content position | `tilt.max_tilt_deg` | 0–10 degrees | Base angle from content position, not a mechanical travel limit |
| Vertical inertia | `tilt.k_cm` | 0–1 | Common pseudo-force contribution |
| CoG / horizontal inertia | `tilt.k_tau` | 0–1 | Differential torque contribution |

`tilt.k_phi` is saved as a fixed, positive value no greater than 8. For this
ordinary coherent conditions the force/torque gains depend on `k_phi*k_cm` and
`k_phi*k_tau`; searching all three would add a redundant scale. It is not a
sixth search coordinate. Each current v3 candidate therefore applies exactly
seven numeric fields, including this fixed multiplier and the material pair.
The pile path bypasses the generic damping calculation; searching damping for
that condition would have no effect. Its friction axis replaces damping, so
each material still has five dimensions, not six. High friction can prevent a
collapse during a moderate tilt; that is an intended candidate behavior.
The control law, preset/default values, correction limits, `max_total_cmd_deg`
and hardware limits are unchanged. Existing v1 sessions remain two-dimensional
and apply only their original vibration/damping fields; import never invents
tilt values for an old comparison. V2 retains the original joint water meaning.
V3 records a material identity and keeps votes separate for each session.

Current candidate application requires the new AtomS3 firmware extension,
which is implemented but not yet flashed; StampC5 needs no change. Before a
preset or parameter write, the client checks support using the existing state
request. The four tilt coefficients are read back as applied numbers with
`%.6g` precision; vibration and damping/friction values still have execution ACKs only.
Wire/application details belong in [05](05_INTERFACE_SPEC.md), current checks
and deployment facts in [16](16_PROGRESS_STATUS.md). Session JSON retains
the exploration history; a separate selected-profile JSON retains just the
seven settings and source/evaluation labels. Same-material reuse is exact;
cross-material reuse copies only vibration and the four tilt coefficients onto
the target's own material baseline. It never imports votes. Neither format
is a persistent device preset write. Perceptual-shape controls and arbitrary
material editing remain planned in [08](08_IMPLEMENTATION_PLAN.md).

Preset loads preserve hardware/session gates, transport, interface/recorder
settings and calibrated carriers. For the demo, record the actual target and
material/settings that affect the result. A full reproducibility snapshot is
future experiment work, not a prerequisite for every handling check.
