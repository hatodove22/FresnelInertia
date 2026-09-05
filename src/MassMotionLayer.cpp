#include "haptics/MassMotionLayer.hpp"

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

float familyDampingMultiplier(const SystemParams& params) {
  const float viscosity = clampf(params.container.viscosity, 0.0f, 1.0f);
  const float particle_count = clampf(params.container.particle_count, 0.0f, 1.0f);
  const float fill = clampf(params.container.fill, 0.05f, 0.95f);
  float multiplier = 1.0f + viscosity * 0.85f;
  switch (params.container.family) {
    case MaterialFamily::Granular:
      return multiplier * (0.90f + 0.10f * particle_count);
    case MaterialFamily::Hybrid:
      return multiplier * (1.00f + 0.30f * viscosity);
    case MaterialFamily::Detented:
      return multiplier * 1.30f;
    case MaterialFamily::Liquid:
    case MaterialFamily::Custom:
    default:
      return multiplier * (1.00f + 0.25f * fill);
  }
}

float stableAxisStepS(float natural_freq_hz,
                      float span_gain,
                      float damping_ratio) {
  if (!std::isfinite(natural_freq_hz) || natural_freq_hz < 0.0f ||
      !std::isfinite(damping_ratio) || damping_ratio < 0.0f) {
    return 0.0f;
  }
  const float omega = 2.0f * kPi * natural_freq_hz * std::sqrt(span_gain);
  if (omega <= 0.0f) {
    return 0.004f;
  }

  // For the damped semi-implicit Euler update used below, stability requires
  // r^2 + 4*zeta*r < 4 for r=omega*dt. Use 75% of the positive root and cap
  // at the normal 250 Hz control period.
  const float root = 2.0f /
                     (std::sqrt(damping_ratio * damping_ratio + 1.0f) +
                      damping_ratio);
  return std::min(0.004f, 0.75f * root / omega);
}

}  // namespace

void MassMotionLayer::configure(const SystemParams& params) {
  params_ = params;
  state_ = {};
  filtered_drive_ = {};
  convective_bias_ = {};
  agitation_bias_ = {};
  agitation_phase_rad_ = 0.0f;
  coherent_initialized_ = false;
  state_.container_x_m = params.container.span_x_m;
  state_.container_y_m = params.container.span_y_m;
  state_.container_z_m = params.container.span_z_m;
  state_.fill = params.container.fill;
  state_.headspace = params.container.headspace;
  state_.family = params.container.family;
}

float MassMotionLayer::maxStableStepS() const {
  if (params_.features.enable_coherent_container_demo) {
    return 0.002f;
  }
  const float span_gain_x =
      clampf(kReferenceSpanM / safeSpan(params_.container.span_x_m), 0.60f, 2.40f);
  const float span_gain_y =
      clampf(kReferenceSpanM / safeSpan(params_.container.span_y_m), 0.60f, 2.40f);
  const float damping_multiplier = familyDampingMultiplier(params_);
  const float step_x = stableAxisStepS(
      params_.mass.natural_freq_x_hz,
      span_gain_x,
      params_.mass.damping_ratio_x * damping_multiplier);
  const float step_y = stableAxisStepS(
      params_.mass.natural_freq_y_hz,
      span_gain_y,
      params_.mass.damping_ratio_y * damping_multiplier);
  return std::min(step_x, step_y);
}

MassState MassMotionLayer::update(const ImuSample& sample, float dt_s) {
  return updateImpl(sample, sample, dt_s, false);
}

MassState MassMotionLayer::updateWithActivity(const ImuSample& raw_sample,
                                              const ImuSample& activity_sample,
                                              float dt_s) {
  return updateImpl(raw_sample, activity_sample, dt_s, true);
}

MassState MassMotionLayer::updateImpl(const ImuSample& raw_sample,
                                      const ImuSample& activity_sample,
                                      float dt_s,
                                      bool gravity_separated_activity) {
  if (params_.features.enable_coherent_container_demo) {
    return updateCoherent(raw_sample, activity_sample, dt_s);
  }
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
  const float damping_multiplier = familyDampingMultiplier(params_);
  float rebound_multiplier = 0.85f;
  float energy_multiplier = 1.0f;
  float convective_gain = 0.0f;
  float convective_decay = 0.0f;

  switch (params_.container.family) {
    case MaterialFamily::Granular:
      mobility *= 1.05f + 0.20f * particle_hardness;
      rebound_multiplier = 1.00f + 0.30f * particle_hardness;
      energy_multiplier = 1.10f + 0.20f * particle_count;
      break;
    case MaterialFamily::Hybrid:
      mobility *= 0.95f + 0.20f * headspace;
      rebound_multiplier = 0.90f + 0.20f * particle_hardness;
      energy_multiplier = 1.00f + 0.10f * particle_count;
      convective_gain = clampf(0.18f + 0.35f * headspace - 0.10f * viscosity, 0.08f, 0.48f);
      convective_decay = clampf(1.40f + 1.00f * viscosity + 0.60f * fill, 1.20f, 2.60f);
      break;
    case MaterialFamily::Detented:
      mobility *= 0.60f;
      rebound_multiplier = 0.55f;
      energy_multiplier = 0.85f;
      break;
    case MaterialFamily::Liquid:
    case MaterialFamily::Custom:
    default:
      mobility *= 0.95f - 0.15f * fill;
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
  const float ax = raw_sample.valid ? raw_sample.accel_g.x : 0.0f;
  const float ay = raw_sample.valid ? raw_sample.accel_g.y : 0.0f;
  const float az = raw_sample.valid ? raw_sample.accel_g.z : 0.0f;
  const float gx = raw_sample.valid ? raw_sample.gyro_dps.x : 0.0f;
  const float gy = raw_sample.valid ? raw_sample.gyro_dps.y : 0.0f;
  const float gz = raw_sample.valid ? raw_sample.gyro_dps.z : 0.0f;
  const float activity_ax = activity_sample.valid ? activity_sample.accel_g.x : 0.0f;
  const float activity_ay = activity_sample.valid ? activity_sample.accel_g.y : 0.0f;
  const float activity_az = activity_sample.valid ? activity_sample.accel_g.z : 0.0f;
  const float activity_gx = activity_sample.valid ? activity_sample.gyro_dps.x : 0.0f;
  const float activity_gy = activity_sample.valid ? activity_sample.gyro_dps.y : 0.0f;
  const float activity_gz = activity_sample.valid ? activity_sample.gyro_dps.z : 0.0f;

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
  const float dynamic_accel_g = gravity_separated_activity
                                    ? clampf(length3(activity_ax, activity_ay, activity_az), 0.0f, 2.0f)
                                    : clampf(accel_mag - 1.0f, 0.0f, 2.0f);
  const float spin_norm =
      clampf((gravity_separated_activity ? activity_gz : gz) / 180.0f, -1.5f, 1.5f);
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
  const float accel_activity = gravity_separated_activity
                                   ? length2(activity_ax, activity_ay)
                                   : length2(ax, ay);
  const float gyro_activity = gravity_separated_activity
                                  ? length2(activity_gx, activity_gy)
                                  : length2(gx, gy);
  const float drive = (accel_activity * params_.mass.accel_to_energy_gain * mobility * geometry_activity +
                       gyro_activity * params_.mass.gyro_to_energy_gain) *
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

MassState MassMotionLayer::updateCoherent(const ImuSample& raw_sample,
                                         const ImuSample& activity_sample,
                                         float dt_s) {
  (void)activity_sample;
  constexpr float gravity_ms2 = 9.80665f;
  constexpr float rest_speed_m_s = 0.035f;
  constexpr float contact_epsilon = 1.0e-5f;
  state_.wall_impact_speed_norm_s.fill(0.0f);
  if (!raw_sample.valid || !std::isfinite(raw_sample.accel_g.x) ||
      !std::isfinite(raw_sample.accel_g.y) || !std::isfinite(dt_s) ||
      dt_s <= 0.0f) {
    return state_;
  }

  const float half_x = 0.5f * safeSpan(params_.container.span_x_m);
  const float half_y = 0.5f * safeSpan(params_.container.span_y_m);
  const float viscosity = clampf(params_.container.viscosity, 0.0f, 1.0f);
  const float particles = clampf(params_.container.particle_count, 0.0f, 1.0f);
  const float hardness = clampf(params_.container.particle_hardness, 0.0f, 1.0f);
  const bool liquid = params_.container.family == MaterialFamily::Liquid;
  const bool hybrid = params_.container.family == MaterialFamily::Hybrid;
  const bool sparse = params_.container.family == MaterialFamily::Granular &&
                      particles <= 0.10f && hardness >= 0.80f;
  const bool detented = params_.container.family == MaterialFamily::Detented;
  const float fill = clampf(params_.container.fill, 0.0f, 1.0f);
  const float headspace = clampf(params_.container.headspace, 0.0f, 1.0f);
  if (!detented && (fill <= 0.0f || params_.container.content_mass_full_kg <= 0.0f)) {
    state_.pos_norm = {};
    state_.vel_norm_s = {};
    state_.energy = 0.0f;
    state_.fill = fill;
    state_.headspace = headspace;
    state_.wall_contact.fill(0.0f);
    coherent_initialized_ = false;
    return state_;
  }

  // Specific force is in g; this converts it to normalized container distance
  // per second squared. The old O(1) forcing against an O(200) spring could
  // never take ordinary handling to a wall.
  const float force_x = -raw_sample.accel_g.x * gravity_ms2 / half_x;
  const float force_y = -raw_sample.accel_g.y * gravity_ms2 / half_y;
  const float omega_x = 2.0f * kPi * std::max(0.1f, params_.mass.natural_freq_x_hz);
  const float omega_y = 2.0f * kPi * std::max(0.1f, params_.mass.natural_freq_y_hz);
  // A liquid is represented by a damped slosh mode. Rigid inclusions have no
  // artificial tether to the center and settle against their supporting wall.
  // A fuller container has a stiffer, less freely traveling slosh mode.
  // Bounds remain physical wall locations; fill must not move an invisible wall.
  const float fill_stiffness = clampf((0.55f + 0.75f * fill) /
                                         (0.65f + 0.70f * headspace),
                                     0.45f, 2.0f);
  const float restoring = (liquid ? 1.0f : (hybrid ? 0.40f : 0.0f)) * fill_stiffness;
  const float spring_x = restoring * omega_x * omega_x;
  const float spring_y = restoring * omega_y * omega_y;
  const float drag = liquid ? (3.0f + 18.0f * viscosity) * (0.75f + 0.50f * fill)
                           : (hybrid ? (4.0f + 10.0f * viscosity) * (0.75f + 0.50f * fill)
                                     : (sparse ? 1.4f : 3.0f + 6.0f * particles));
  const float drag_x = drag * std::max(0.0f, params_.mass.damping_ratio_x) / 0.35f;
  const float drag_y = drag * std::max(0.0f, params_.mass.damping_ratio_y) / 0.35f;
  const float restitution = liquid ? 0.035f
                                  : (hybrid ? 0.12f
                                            : clampf(params_.mass.rebound *
                                                         (0.35f + 0.45f * hardness),
                                                     0.03f, 0.42f));
  const auto updateContacts = [&]() {
    const float zone_x = clampf(0.0025f / half_x, 0.025f, 0.15f);
    const float zone_y = clampf(0.0025f / half_y, 0.025f, 0.15f);
    state_.wall_contact[0] = clampf(1.0f - (1.0f - state_.pos_norm.x) / zone_x, 0.0f, 1.0f);
    state_.wall_contact[1] = clampf(1.0f - (1.0f + state_.pos_norm.x) / zone_x, 0.0f, 1.0f);
    state_.wall_contact[2] = clampf(1.0f - (1.0f - state_.pos_norm.y) / zone_y, 0.0f, 1.0f);
    state_.wall_contact[3] = clampf(1.0f - (1.0f + state_.pos_norm.y) / zone_y, 0.0f, 1.0f);
  };

  state_.fill = fill;
  state_.headspace = headspace;
  state_.container_x_m = 2.0f * half_x;
  state_.container_y_m = 2.0f * half_y;
  state_.container_z_m = safeSpan(params_.container.span_z_m);
  state_.family = params_.container.family;

  if (!coherent_initialized_) {
    const auto initialPosition = [](float force, float spring, float accel_g) {
      if (spring > 0.0f) {
        return clampf(force / spring, -1.0f, 1.0f);
      }
      return std::fabs(accel_g) < 0.10f ? 0.0f : (force >= 0.0f ? 1.0f : -1.0f);
    };
    state_.pos_norm.x = initialPosition(force_x, spring_x, raw_sample.accel_g.x);
    state_.pos_norm.y = initialPosition(force_y, spring_y, raw_sample.accel_g.y);
    state_.vel_norm_s = {};
    state_.energy = 0.0f;
    coherent_initialized_ = true;
    updateContacts();
    return state_;
  }

  // Small internal steps keep direct callers and the outer pipeline equivalent.
  // Impacts are accumulated for this call only, before restitution changes sign.
  const unsigned steps = std::max(1U, static_cast<unsigned>(std::ceil(dt_s / 0.002f)));
  const float step_s = dt_s / static_cast<float>(steps);
  const auto integrateAxis = [&](float& pos, float& velocity, float force,
                                 float spring, float half_span, float axis_drag,
                                 std::size_t positive_wall,
                                 std::size_t negative_wall) {
    float acceleration = force - spring * pos;
    if (detented) {
      // Shallow periodic detents share the same traveling state and contacts.
      acceleration -= 32.0f * std::sin(4.0f * kPi * pos);
    }
    if ((pos >= 1.0f - contact_epsilon && velocity >= 0.0f && acceleration >= 0.0f) ||
        (pos <= -1.0f + contact_epsilon && velocity <= 0.0f && acceleration <= 0.0f)) {
      velocity = 0.0f;  // Support force; gravity must not manufacture repeated taps.
      return;
    }
    velocity = (velocity + acceleration * step_s) * std::exp(-axis_drag * step_s);
    pos += velocity * step_s;
    if (pos > 1.0f || pos < -1.0f) {
      const bool positive = pos > 1.0f;
      const std::size_t wall = positive ? positive_wall : negative_wall;
      const float incoming = std::fabs(velocity);
      if (incoming * half_span >= rest_speed_m_s) {
        state_.wall_impact_speed_norm_s[wall] =
            std::max(state_.wall_impact_speed_norm_s[wall], incoming);
      }
      pos = positive ? 1.0f : -1.0f;
      velocity = incoming * half_span * restitution < rest_speed_m_s
                     ? 0.0f
                     : -velocity * restitution;
    }
  };
  for (unsigned step = 0; step < steps; ++step) {
    integrateAxis(state_.pos_norm.x, state_.vel_norm_s.x,
                  force_x, spring_x, half_x, drag_x, 0U, 1U);
    integrateAxis(state_.pos_norm.y, state_.vel_norm_s.y,
                  force_y, spring_y, half_y, drag_y, 2U, 3U);
  }
  updateContacts();

  const float speed_m_s = length2(state_.vel_norm_s.x * half_x,
                                  state_.vel_norm_s.y * half_y);
  // Energy describes the actual content motion. A raw accelerometer reading
  // at gravitational rest must not hold activity above zero.
  const float energy_target = clampf(0.75f * speed_m_s / 0.30f, 0.0f, 1.0f);
  const float energy_tau = energy_target > state_.energy
                               ? 0.035f
                               : std::max(0.04f, params_.mass.energy_decay_s);
  state_.energy += (energy_target - state_.energy) *
                   (1.0f - std::exp(-dt_s / energy_tau));
  for (std::size_t wall = 0; wall < 4U; ++wall) {
    const float impact_m_s = state_.wall_impact_speed_norm_s[wall] *
                             (wall < 2U ? half_x : half_y);
    state_.energy = std::max(state_.energy, clampf(impact_m_s / 0.60f, 0.0f, 1.0f));
  }
  return state_;
}

}  // namespace haptics
