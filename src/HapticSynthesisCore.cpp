#include "haptics/HapticSynthesisCore.hpp"

#include <algorithm>
#include <cmath>

namespace haptics {
namespace {
template <std::size_t Capacity>
void appendEvents(EventFrame<Capacity>& destination,
                  const EventFrame<Capacity>& source) {
  for (std::size_t i = 0;
       i < source.count && destination.count < destination.items.size(); ++i) {
    destination.items[destination.count++] = source.items[i];
  }
}
}  // namespace

void HapticSynthesisCore::configure(const SystemParams& params) {
  motion_activity_filter_.configure(params);
  mass_layer_.configure(params);
  event_layer_.configure(params);
  texture_layer_.configure(params);
  configureOutput(params);
  tilt_model_.configure(params);
}

void HapticSynthesisCore::configureOutput(const SystemParams& params) {
  resonance_layer_.configure(params);
  spatial_renderer_.configure(params);
}

void HapticSynthesisCore::reset(const SystemParams& params) {
  configure(params);
  resetTilt();
}

void HapticSynthesisCore::resetTilt() {
  tilt_model_.reset();
}

MassState HapticSynthesisCore::defaultMassState(const SystemParams& params) {
  MassState state{};
  state.fill = params.container.fill;
  state.headspace = params.container.headspace;
  state.container_x_m = params.container.span_x_m;
  state.container_y_m = params.container.span_y_m;
  state.container_z_m = params.container.span_z_m;
  state.family = params.container.family;
  return state;
}

SynthesisFrame HapticSynthesisCore::step(const SystemParams& params,
                                         const ImuSample& model_sample,
                                         float dt_s,
                                         const SynthesisContext& context) {
  SynthesisFrame result{};
  if (!std::isfinite(dt_s) || dt_s <= 0.0f) {
    return result;
  }
  const float raw_dt_s = dt_s;
  const float nominal_dt_s = 1.0f / std::max(1.0f, params.mass.control_rate_hz);
  const bool motion_path_requested = motionInputBoundaryEnabled(
      params.features.enable_gravity_separated_mass_activity,
      params.features.enable_mass_layer,
      params.features.enable_tilt_plane);
  if (!motion_path_requested && dt_s > kMotionInputResetGapS) {
    dt_s = nominal_dt_s;
  }

  const bool tilt_mode_allowed = context.outputs_allowed &&
      context.tilt_allowed && params.features.enable_tilt_plane;
  const bool mass_enabled = context.outputs_allowed && params.features.enable_mass_layer;
  const bool event_enabled = context.outputs_allowed && params.features.enable_event_layer;
  const bool texture_enabled = context.outputs_allowed && params.features.enable_texture_layer;
  const bool resonance_enabled = context.outputs_allowed && params.features.enable_resonance_layer;
  const bool spatial_enabled = context.outputs_allowed && params.features.enable_spatial_renderer;
  const bool gravity_separated_activity = motionInputBoundaryEnabled(
      params.features.enable_gravity_separated_mass_activity,
      mass_enabled,
      tilt_mode_allowed);

  MassState mass = mass_enabled ? mass_layer_.state() : defaultMassState(params);
  EventFrame<kMaxEventsPerFrame> events{};
  float sensor_dt_s = dt_s;
  bool hold_tilt_command = false;
  bool fail_closed_tilt_command = false;

  if (gravity_separated_activity) {
    const bool was_motion_initialized = motion_activity_filter_.initialized();
    const MotionInputResult motion_input =
        motion_activity_filter_.process(model_sample, raw_dt_s);
    if (motion_input.action == MotionInputAction::RejectFrame) {
      return result;
    }

    if (motion_input.action == MotionInputAction::ResetNeutral) {
      // A long sensor gap is a discontinuity, not a large integration step.
      // Clear every dynamic layer and leave the physical tilt command held
      // until a fresh valid sample re-establishes the estimator baseline.
      reset(params);
      mass = mass_layer_.state();
      hold_tilt_command = true;
    } else if (motion_input.action == MotionInputAction::HoldNoSample) {
      // Existing texture/resonance/spatial tails still advance below using
      // raw wall-clock time. Sensor-driven Mass/Event/Tilt state is held.
      mass = mass_layer_.state();
      hold_tilt_command = true;
    } else {
      sensor_dt_s = motion_input.effective_dt_s;
      const uint8_t substep_count =
          motionIntegrationSubstepCount(sensor_dt_s,
                                        mass_layer_.maxStableStepS());
      const MotionIntegrationSafetyAction safety_action =
          motionIntegrationSafetyAction(substep_count);
      if (safety_action ==
          MotionIntegrationSafetyAction::ResetNeutralAndDisarmTilt) {
        // Unlike a recoverable missing-sample gap, invalid or unsupported
        // dynamics cannot safely retain an earlier physical tilt command.
        reset(params);
        mass = mass_layer_.state();
        fail_closed_tilt_command = true;
      } else {
        const float substep_dt_s = sensor_dt_s / substep_count;
        for (uint8_t substep = 0; substep < substep_count; ++substep) {
          if (mass_enabled) {
            mass = mass_layer_.updateWithActivity(
                model_sample, motion_input.activity, substep_dt_s);
          }
          // The first valid sample establishes gravity and may move the
          // quasi-static mass path, but it must never manufacture an event.
          if (mass_enabled && event_enabled && was_motion_initialized) {
            const std::size_t remaining_event_slots =
                events.items.size() - events.count;
            appendEvents(
                events,
                event_layer_.update(
                    mass, substep_dt_s, remaining_event_slots));
          }
        }
      }
    }
  } else {
    if (mass_enabled) {
      mass = mass_layer_.update(model_sample, dt_s);
    }
    if (event_enabled) {
      events = event_layer_.update(mass, dt_s);
    }
  }

  const float tail_dt_s = gravity_separated_activity ? raw_dt_s : dt_s;
  const auto textures = texture_enabled
                            ? texture_layer_.update(events, tail_dt_s)
                            : TextureFrame<kMaxTexturesPerFrame>{};
  const auto resonances =
      resonance_enabled ? resonance_layer_.update(textures) : ResonanceFrame<kMaxResonanceVoicesPerFrame>{};
  const auto spatial =
      spatial_enabled ? spatial_renderer_.update(resonances, tail_dt_s) : SpatialFrame4{};
  result.tilt_action = fail_closed_tilt_command
      ? SynthesisTiltAction::FaultNeutral
      : !tilt_mode_allowed ? SynthesisTiltAction::Disabled
      : hold_tilt_command ? SynthesisTiltAction::Hold
      : SynthesisTiltAction::Submit;
  if (result.tilt_action == SynthesisTiltAction::Submit &&
      context.use_tilt_model) {
    result.tilt = tilt_model_.update(model_sample, mass, sensor_dt_s);
  }
  const HapticEvent last_event = event_enabled ? event_layer_.lastEvent() : HapticEvent{};

  result.accepted = true;
  result.mass = mass;
  result.last_event = last_event;
  result.spatial = spatial;
  result.debug.event_count = static_cast<uint16_t>(events.count);
  result.debug.texture_count = static_cast<uint16_t>(textures.count);
  result.debug.resonance_count = static_cast<uint16_t>(resonances.count);
  result.debug.mass_enabled = mass_enabled;
  result.debug.event_enabled = event_enabled;
  result.debug.texture_enabled = texture_enabled;
  result.debug.resonance_enabled = resonance_enabled;
  result.debug.spatial_enabled = spatial_enabled;
  return result;
}

}  // namespace haptics
