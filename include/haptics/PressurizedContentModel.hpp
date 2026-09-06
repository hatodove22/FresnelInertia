#pragma once

#include <algorithm>
#include <cmath>
#include "haptics/Parameters.hpp"

namespace haptics {

// A small optional mass-state effect. Both firmware and Wasm use this code;
// no clock or independent pressure simulation belongs in the visual renderer.
class PressurizedContentModel {
 public:
  void configure(const SystemParams& params) {
    enabled_ = params.features.enable_coherent_container_demo &&
               params.features.enable_pressurized_demo &&
               params.container.family == MaterialFamily::Liquid;
    fill_ = params.container.fill;
    state_ = {};
    state_.enabled = enabled_;
    initialized_ = false;
    gravity_ = {};
  }

  void update(const ImuSample& raw, const ImuSample& activity,
              float dt_s, MassState& mass, bool gravity_separated = false) {
    if (!enabled_) { mass.pressure = {}; return; }
    if (!raw.valid || !activity.valid || !std::isfinite(dt_s) || dt_s <= 0.0f ||
        !finite(raw.accel_g) || !finite(activity.accel_g) || !finite(activity.gyro_dps)) {
      mass.pressure = state_;
      return;
    }
    const float dt = std::min(dt_s, 0.05f);
    if (!initialized_) {
      gravity_ = raw.accel_g;
      initialized_ = true;
      mass.pressure = state_;
      return;
    }
    const float blend = 1.0f - std::exp(-dt * 6.2831853f);
    gravity_.x += blend * (raw.accel_g.x - gravity_.x);
    gravity_.y += blend * (raw.accel_g.y - gravity_.y);
    gravity_.z += blend * (raw.accel_g.z - gravity_.z);
    Vec3f motion = activity.accel_g;
    if (!gravity_separated) {
      motion.x = raw.accel_g.x - gravity_.x;
      motion.y = raw.accel_g.y - gravity_.y;
      motion.z = raw.accel_g.z - gravity_.z;
    }
    if (fill_ <= 0.0f) {
      state_ = {};
      state_.enabled = true;
      state_.remaining = 0.0f;
      mass.pressure = state_;
      return;
    }
    state_.phase_s = std::min(60.0f, state_.phase_s + dt);
    if (state_.phase == PressurePhase::Sealed) {
      const float agitation = std::max(0.0f, magnitude(motion) - 0.12f) +
                               0.0008f * magnitude(activity.gyro_dps);
      state_.charge = clamp(state_.charge +
                            (0.65f * std::min(agitation, 4.0f) - 0.045f) * dt);
      if (state_.charge >= 1.0f) {
        state_.phase = PressurePhase::Burst;
        state_.phase_s = 0.0f;
        ++state_.burst_sequence;
      }
    } else if (state_.phase == PressurePhase::Burst) {
      state_.charge = std::exp(-state_.phase_s / 0.70f);
      state_.remaining = 0.24f + 0.76f * std::exp(-state_.phase_s / 0.65f);
      if (state_.phase_s >= 2.8f) {
        state_.phase = PressurePhase::Spent;
        state_.phase_s = 0.0f;
        state_.charge = 0.0f;
        state_.remaining = 0.25f;
      }
    }
    mass.pressure = state_;
  }

 private:
  static float clamp(float x) { return std::max(0.0f, std::min(1.0f, x)); }
  static bool finite(const Vec3f& v) {
    return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z);
  }
  static float magnitude(const Vec3f& v) {
    return std::sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  bool enabled_ = false;
  float fill_ = 0.0f;
  bool initialized_ = false;
  Vec3f gravity_{};
  PressureState state_{};
};

}  // namespace haptics
