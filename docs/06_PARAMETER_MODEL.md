# 06 Parameter Model

This is a lookup for tuning the shared model, not a mandatory tuning campaign.
The full field/default catalog lives in [Parameters.hpp](../include/haptics/Parameters.hpp);
runtime handling in [HapticPipeline.cpp](../src/HapticPipeline.cpp);
preset overlays in [PresetStore.cpp](../src/PresetStore.cpp).
Use [08](08_IMPLEMENTATION_PLAN.md) to choose what actually needs work.

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
preset therefore does not require a separate engine. In the retained legacy
path, `wall_threshold` adjusts the active wall zone and `splash_threshold` is
an activity reference. The coherent path below uses actual contacts instead.

`flow_ripple_soa_ms` sets a lead/trail neighbor delay.
`hard_ping_high_ms` controls the high-band tail independently of the low band.
Tune these only when a felt defect makes them relevant. Coherent FlowRipple
preserves the delayed neighbor's complete envelope, not just one update frame.

## Coherent assembled-device model

`features.enable_coherent_container_demo` is false generically and true in the
as-built AtomS3 profile. Changing it through the backend handler requires Idle;
it is not exposed by the dongle's numeric allowlist. Preset loads preserve it.

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
`max_velocity_deg_s` and `pseudoforce_slew_deg_s`. The assembled value is 80
degrees/s. No hard correction deadband is applied in this path. Generic legacy
behavior still filters only the correction and uses a differential position base.

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
Android transfer or perceptual agreement; that mobile path remains planned
and unverified. Existing desktop and initial Quest evidence is retained in 16;
VR/Quest work is on hold.

The proposed tuning studio, perceptual-axis controls, A/B comparison and saving
of tuned configurations are not implemented client features. They are distinct
from the existing dynamic CG model and device-driven content visualization.
Their next steps belong in [08](08_IMPLEMENTATION_PLAN.md); this field catalog
does not imply that every underlying parameter is already a UI control.

Preset loads preserve hardware/session gates, transport, interface/recorder
settings and calibrated carriers. For the demo, record the actual target and
material/settings that affect the result. A full reproducibility snapshot is
future experiment work, not a prerequisite for every handling check.
