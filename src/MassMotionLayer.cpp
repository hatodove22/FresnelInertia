#include "haptics/MassMotionLayer.hpp"

#include <Arduino.h>
#include <algorithm>
#include <cmath>

namespace haptics {
namespace {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kReferenceSpanM = 0.060f;

float clampf(float v, float lo, float hi) {
  return std::max(lo, std::min(v, hi));
}

float length2(float x, float y) {
  return std::sqrt(x * x + y * y);
}

float length3(float x, float y, float z) {
  return std::sqrt(x * x + y * y + z * z);
}

float safeSpan(float span_m) {
  return std::max(0.020f, span_m);
}

}  // namespace

void MassMotionLayer::configure(const SystemParams& params) {
  params_ = params;
  state_ = {};
  filtered_drive_ = {};
  convective_bias_ = {};
  agitation_bias_ = {};
  agitation_phase_rad_ = 0.0f;
  state_.container_x_m = params.container.span_x_m;
  state_.container_y_m = params.container.span_y_m;
  state_.container_z_m = params.container.span_z_m;
  state_.fill = params.container.fill;
  state_.headspace = params.container.headspace;
  state_.family = params.container.family;
}

MassState MassMotionLayer::update(const ImuSample& sample, float dt_s) {
  const float span_x_m = safeSpan(params_.container.span_x_m);
  const float span_y_m = safeSpan(params_.container.span_y_m);
  const float span_gain_x = clampf(kReferenceSpanM / span_x_m, 0.60f, 2.40f);
  const float span_gain_y = clampf(kReferenceSpanM / span_y_m, 0.60f, 2.40f);
  const float freq_scale_x = std::sqrt(span_gain_x);
  const float freq_scale_y = std::sqrt(span_gain_y);

  const float fill = clampf(params_.container.fill, 0.05f, 0.95f);
  const float headspace = clampf(params_.container.headspace, 0.05f, 0.95f);
  const float viscosity = clampf(params_.container.viscosity, 0.0f, 1.0f);
  const float particle_count = clampf(params_.container.particle_count, 0.0f, 1.0f);
  const float particle_hardness = clampf(params_.container.particle_hardness, 0.0f, 1.0f);

  float mobility = clampf(0.55f + 0.90f * headspace, 0.35f, 1.40f);
  float damping_multiplier = 1.0f + viscosity * 0.85f;
  float rebound_multiplier = 0.85f;
  float energy_multiplier = 1.0f;
  float convective_gain = 0.0f;
  float convective_decay = 0.0f;

  switch (params_.container.family) {
    case MaterialFamily::Granular:
      mobility *= 1.05f + 0.20f * particle_hardness;
      damping_multiplier *= 0.90f + 0.10f * particle_count;
      rebound_multiplier = 1.00f + 0.30f * particle_hardness;
      energy_multiplier = 1.10f + 0.20f * particle_count;
      break;
    case MaterialFamily::Hybrid:
      mobility *= 0.95f + 0.20f * headspace;
      damping_multiplier *= 1.00f + 0.30f * viscosity;
      rebound_multiplier = 0.90f + 0.20f * particle_hardness;
      energy_multiplier = 1.00f + 0.10f * particle_count;
      convective_gain = clampf(0.18f + 0.35f * headspace - 0.10f * viscosity, 0.08f, 0.48f);
      convective_decay = clampf(1.40f + 1.00f * viscosity + 0.60f * fill, 1.20f, 2.60f);
      break;
    case MaterialFamily::Detented:
      mobility *= 0.60f;
      damping_multiplier *= 1.30f;
      rebound_multiplier = 0.55f;
      energy_multiplier = 0.85f;
      break;
    case MaterialFamily::Liquid:
    case MaterialFamily::Custom:
    default:
      mobility *= 0.95f - 0.15f * fill;
      damping_multiplier *= 1.00f + 0.25f * fill;
      rebound_multiplier = 0.70f;
      convective_gain = clampf(0.28f + 0.55f * headspace - 0.35f * viscosity, 0.12f, 0.72f);
      convective_decay = clampf(1.00f + 1.80f * viscosity + 0.85f * fill, 0.90f, 3.40f);
      break;
  }

  const float wx = 2.0f * kPi * params_.mass.natural_freq_x_hz * freq_scale_x;
  const float wy = 2.0f * kPi * params_.mass.natural_freq_y_hz * freq_scale_y;
  const float damping_x = params_.mass.damping_ratio_x * damping_multiplier;
  const float damping_y = params_.mass.damping_ratio_y * damping_multiplier;
  const float rebound = clampf(params_.mass.rebound * rebound_multiplier, 0.08f, 0.92f);
  const float ax = sample.valid ? sample.accel_g.x : 0.0f;
  const float ay = sample.valid ? sample.accel_g.y : 0.0f;
  const float az = sample.valid ? sample.accel_g.z : 0.0f;
  const float gx = sample.valid ? sample.gyro_dps.x : 0.0f;
  const float gy = sample.valid ? sample.gyro_dps.y : 0.0f;
  const float gz = sample.valid ? sample.gyro_dps.z : 0.0f;

  // Map board acceleration into normalized container acceleration. A smaller container yields
  // larger normalized excursions for the same physical motion, which shortens travel time.
  const float target_drive_x = -ax * span_gain_x * mobility;
  const float target_drive_y = -ay * span_gain_y * mobility;
  const float drive_lerp = clampf(dt_s * 10.0f, 0.0f, 1.0f);
  filtered_drive_.x += (target_drive_x - filtered_drive_.x) * drive_lerp;
  filtered_drive_.y += (target_drive_y - filtered_drive_.y) * drive_lerp;

  // Couple vertical/agitation motion into the 2D latent plane so pure up/down shakes
  // and yaw-dominant motion can still excite liquid and detented families.
  const float accel_mag = length3(ax, ay, az);
  const float dynamic_accel_g = clampf(accel_mag - 1.0f, 0.0f, 2.0f);
  const float spin_norm = clampf(gz / 180.0f, -1.5f, 1.5f);
  const float span_gain_mean = 0.5f * (span_gain_x + span_gain_y);
  float agitation_gain = 0.06f;
  switch (params_.container.family) {
    case MaterialFamily::Liquid:
      agitation_gain = 0.18f + 0.18f * headspace;
      break;
    case MaterialFamily::Hybrid:
      agitation_gain = 0.14f + 0.12f * headspace;
      break;
    case MaterialFamily::Detented:
      agitation_gain = 0.24f;
      break;
    case MaterialFamily::Granular:
      agitation_gain = 0.08f + 0.06f * particle_count;
      break;
    case MaterialFamily::Custom:
    default:
      agitation_gain = 0.10f;
      break;
  }

  agitation_phase_rad_ += dt_s * (3.2f + 4.4f * std::fabs(spin_norm));
  agitation_phase_rad_ += dt_s * 2.4f * spin_norm;
  if (agitation_phase_rad_ > 2.0f * kPi) {
    agitation_phase_rad_ -= 2.0f * kPi;
  } else if (agitation_phase_rad_ < 0.0f) {
    agitation_phase_rad_ += 2.0f * kPi;
  }

  Vec2f agitation_target{};
  const float agitation_drive = agitation_gain * span_gain_mean * dynamic_accel_g;
  agitation_target.x =
      agitation_drive * std::cos(agitation_phase_rad_) + agitation_gain * 0.12f * spin_norm * (1.0f + std::fabs(state_.pos_norm.y));
  agitation_target.y =
      agitation_drive * std::sin(agitation_phase_rad_) - agitation_gain * 0.12f * spin_norm * (1.0f + std::fabs(state_.pos_norm.x));
  const float agitation_lerp = clampf(dt_s * (4.0f + 5.0f * agitation_gain + 3.0f * dynamic_accel_g), 0.0f, 1.0f);
  agitation_bias_.x += (agitation_target.x - agitation_bias_.x) * agitation_lerp;
  agitation_bias_.y += (agitation_target.y - agitation_bias_.y) * agitation_lerp;

  if (convective_gain > 0.0f) {
    const float span_z_m = safeSpan(params_.container.span_z_m);
    const float vertical_scale = clampf(kReferenceSpanM / span_z_m, 0.70f, 1.60f);
    const float convective_lerp = clampf(dt_s * convective_decay, 0.0f, 1.0f);
    Vec2f convective_target{};
    convective_target.x =
        (-0.65f * filtered_drive_.x + 0.20f * state_.vel_norm_s.y) * convective_gain * vertical_scale;
    convective_target.y =
        (-0.65f * filtered_drive_.y - 0.20f * state_.vel_norm_s.x) * convective_gain * vertical_scale;
    convective_bias_.x += (convective_target.x - convective_bias_.x) * convective_lerp;
    convective_bias_.y += (convective_target.y - convective_bias_.y) * convective_lerp;
  } else {
    const float convective_lerp = clampf(dt_s * 6.0f, 0.0f, 1.0f);
    convective_bias_.x += (0.0f - convective_bias_.x) * convective_lerp;
    convective_bias_.y += (0.0f - convective_bias_.y) * convective_lerp;
  }

  state_.vel_norm_s.x +=
      (-2.0f * damping_x * wx * state_.vel_norm_s.x - wx * wx * state_.pos_norm.x + filtered_drive_.x +
       convective_bias_.x + agitation_bias_.x) *
      dt_s;
  state_.vel_norm_s.y +=
      (-2.0f * damping_y * wy * state_.vel_norm_s.y - wy * wy * state_.pos_norm.y + filtered_drive_.y +
       convective_bias_.y + agitation_bias_.y) *
      dt_s;

  state_.pos_norm.x += state_.vel_norm_s.x * dt_s;
  state_.pos_norm.y += state_.vel_norm_s.y * dt_s;

  const float wall_soft_zone_x = clampf(2.0f * params_.event.wall_decay_span_m / span_x_m, 0.08f, 0.40f);
  const float wall_soft_zone_y = clampf(2.0f * params_.event.wall_decay_span_m / span_y_m, 0.08f, 0.40f);
  if (std::fabs(state_.pos_norm.x) > 1.0f - wall_soft_zone_x && state_.pos_norm.x * state_.vel_norm_s.x > 0.0f) {
    state_.vel_norm_s.x *= (1.0f - 0.35f * wall_soft_zone_x);
  }
  if (std::fabs(state_.pos_norm.y) > 1.0f - wall_soft_zone_y && state_.pos_norm.y * state_.vel_norm_s.y > 0.0f) {
    state_.vel_norm_s.y *= (1.0f - 0.35f * wall_soft_zone_y);
  }

  if (std::fabs(state_.pos_norm.x) > 1.0f) {
    state_.pos_norm.x = (state_.pos_norm.x > 0.0f) ? 1.0f : -1.0f;
    state_.vel_norm_s.x *= -rebound;
  }
  if (std::fabs(state_.pos_norm.y) > 1.0f) {
    state_.pos_norm.y = (state_.pos_norm.y > 0.0f) ? 1.0f : -1.0f;
    state_.vel_norm_s.y *= -rebound;
  }

  const float geometry_activity = 0.5f * (span_gain_x + span_gain_y);
  const float boundary_proximity =
      std::max(std::fabs(state_.pos_norm.x) / std::max(0.50f, 1.0f - wall_soft_zone_x),
               std::fabs(state_.pos_norm.y) / std::max(0.50f, 1.0f - wall_soft_zone_y));
  const float drive = (length2(ax, ay) * params_.mass.accel_to_energy_gain * mobility * geometry_activity +
                       length2(gx, gy) * params_.mass.gyro_to_energy_gain) *
                      energy_multiplier;
  const float decay = std::exp(-dt_s / std::max(0.001f, params_.mass.energy_decay_s));
  const float collision_bonus = clampf(boundary_proximity - 0.75f, 0.0f, 0.40f) *
                                length2(state_.vel_norm_s.x, state_.vel_norm_s.y) * 0.03f;
  state_.energy = clampf(state_.energy * decay + drive * dt_s + collision_bonus, 0.0f, 1.0f);

  state_.fill = fill;
  state_.headspace = headspace;
  state_.container_x_m = span_x_m;
  state_.container_y_m = span_y_m;
  state_.container_z_m = safeSpan(params_.container.span_z_m);
  state_.family = params_.container.family;
  return state_;
}

}  // namespace haptics
