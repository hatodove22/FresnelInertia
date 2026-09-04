#include "haptics/MotionActivityFilter.hpp"

#include <algorithm>
#include <cmath>
#include <limits>

namespace haptics {
namespace {

constexpr float kPi = 3.14159265358979323846f;

bool finiteVec3(const Vec3f& value) {
  return std::isfinite(value.x) && std::isfinite(value.y) && std::isfinite(value.z);
}

bool finiteSample(const ImuSample& sample) {
  return sample.valid && finiteVec3(sample.accel_g) && finiteVec3(sample.gyro_dps);
}

float sanitizedPositive(float value, float fallback) {
  return std::isfinite(value) && value > 0.0f ? value : fallback;
}

float filterAlpha(float cutoff_hz, float dt_s) {
  return 1.0f - std::exp(-2.0f * kPi * cutoff_hz * dt_s);
}

Vec3f lowPass(const Vec3f& previous, const Vec3f& target, float alpha) {
  Vec3f result{};
  result.x = previous.x + (target.x - previous.x) * alpha;
  result.y = previous.y + (target.y - previous.y) * alpha;
  result.z = previous.z + (target.z - previous.z) * alpha;
  return result;
}

Vec3f subtract(const Vec3f& lhs, const Vec3f& rhs) {
  Vec3f result{};
  result.x = lhs.x - rhs.x;
  result.y = lhs.y - rhs.y;
  result.z = lhs.z - rhs.z;
  return result;
}

Vec3f radialSubtractiveDeadband(const Vec3f& value, float threshold) {
  const float magnitude = std::sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
  if (!std::isfinite(magnitude) || magnitude <= threshold) {
    return {};
  }
  const float scale = (magnitude - threshold) / magnitude;
  Vec3f result{};
  result.x = value.x * scale;
  result.y = value.y * scale;
  result.z = value.z * scale;
  return result;
}

float finiteSaturatingAdd(float lhs, float rhs) {
  const float max_value = std::numeric_limits<float>::max();
  if (lhs > max_value - rhs) {
    return max_value;
  }
  return lhs + rhs;
}

}  // namespace

uint8_t motionIntegrationSubstepCount(float effective_dt_s,
                                      float maximum_step_s) {
  if (!std::isfinite(effective_dt_s) || effective_dt_s <= 0.0f ||
      !std::isfinite(maximum_step_s) || maximum_step_s <= 0.0f) {
    return 0;
  }
  const float requested = std::max(1.0f, std::ceil(effective_dt_s / maximum_step_s));
  if (requested > static_cast<float>(kMotionIntegrationMaxSubsteps)) {
    return 0;
  }
  return static_cast<uint8_t>(requested);
}

bool motionDynamicsAllowTiltArm(float maximum_stable_step_s) {
  // Arming is allowed only when the integrator can honor the complete
  // documented <=50 ms recovery envelope within its bounded substep budget.
  // A merely positive but vanishingly small bound would otherwise permit a
  // torque pulse followed by immediate fail-close on every frame.
  return motionIntegrationSubstepCount(
             kMotionInputResetGapS, maximum_stable_step_s) != 0;
}

void MotionActivityFilter::configure(const SystemParams& params) {
  params_ = params.motion_activity;
  params_.gravity_cutoff_hz = sanitizedPositive(params_.gravity_cutoff_hz, 1.0f);
  params_.motion_cutoff_hz = sanitizedPositive(params_.motion_cutoff_hz, 10.0f);
  params_.accel_deadband_g =
      std::max(0.0f, std::isfinite(params_.accel_deadband_g) ? params_.accel_deadband_g : 0.025f);
  params_.gyro_deadband_dps =
      std::max(0.0f, std::isfinite(params_.gyro_deadband_dps) ? params_.gyro_deadband_dps : 1.5f);
  reset();
}

void MotionActivityFilter::reset() {
  gravity_g_ = {};
  filtered_accel_g_ = {};
  filtered_gyro_dps_ = {};
  pending_dt_s_ = 0.0f;
  initialized_ = false;
}

MotionInputResult MotionActivityFilter::process(const ImuSample& sample, float raw_dt_s) {
  MotionInputResult result{};
  result.gravity_g = gravity_g_;

  // A malformed time step is rejected without touching pending time or any
  // estimator state. The pipeline can therefore skip every downstream
  // integrator without having to repair a partially advanced filter.
  if (!std::isfinite(raw_dt_s) || raw_dt_s <= 0.0f) {
    return result;
  }

  const float effective_dt_s = finiteSaturatingAdd(pending_dt_s_, raw_dt_s);
  if (!finiteSample(sample)) {
    pending_dt_s_ = effective_dt_s;
    result.action = MotionInputAction::HoldNoSample;
    return result;
  }

  pending_dt_s_ = 0.0f;
  result.effective_dt_s = effective_dt_s;
  result.activity.timestamp_us = sample.timestamp_us;
  result.activity.valid = true;

  // Strictly greater than 50 ms resets. The exact fixed boundary remains
  // integrable, which is covered by the native nextafter boundary test.
  if (effective_dt_s > kMotionInputResetGapS) {
    reset();
    result.action = MotionInputAction::ResetNeutral;
    result.activity.timestamp_us = sample.timestamp_us;
    result.activity.valid = true;
    result.gravity_g = gravity_g_;
    return result;
  }

  result.action = MotionInputAction::Integrate;
  if (!initialized_) {
    initialized_ = true;
    gravity_g_ = sample.accel_g;
    filtered_accel_g_ = {};
    filtered_gyro_dps_ = {};
    result.gravity_g = gravity_g_;
    return result;
  }

  const float gravity_alpha = filterAlpha(params_.gravity_cutoff_hz, effective_dt_s);
  gravity_g_ = lowPass(gravity_g_, sample.accel_g, gravity_alpha);
  const Vec3f gravity_removed = subtract(sample.accel_g, gravity_g_);

  const float motion_alpha = filterAlpha(params_.motion_cutoff_hz, effective_dt_s);
  filtered_accel_g_ = lowPass(filtered_accel_g_, gravity_removed, motion_alpha);
  filtered_gyro_dps_ = lowPass(filtered_gyro_dps_, sample.gyro_dps, motion_alpha);

  result.activity.accel_g = radialSubtractiveDeadband(filtered_accel_g_, params_.accel_deadband_g);
  result.activity.gyro_dps = radialSubtractiveDeadband(filtered_gyro_dps_, params_.gyro_deadband_dps);
  result.gravity_g = gravity_g_;
  return result;
}

}  // namespace haptics
