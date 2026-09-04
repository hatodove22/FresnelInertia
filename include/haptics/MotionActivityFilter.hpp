#pragma once

#include <cstdint>

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

constexpr float kMotionInputResetGapS = 0.050f;
constexpr float kMotionIntegrationMaxStepS = 0.004f;
constexpr uint8_t kMotionIntegrationMaxSubsteps = 64;

constexpr bool motionInputBoundaryEnabled(bool feature_enabled,
                                          bool mass_enabled,
                                          bool tilt_enabled) {
  return feature_enabled && (mass_enabled || tilt_enabled);
}

uint8_t motionIntegrationSubstepCount(
    float effective_dt_s,
    float maximum_step_s = kMotionIntegrationMaxStepS);

bool motionDynamicsAllowTiltArm(float maximum_stable_step_s);

enum class MotionIntegrationSafetyAction : uint8_t {
  Continue = 0,
  ResetNeutralAndDisarmTilt,
};

constexpr MotionIntegrationSafetyAction motionIntegrationSafetyAction(
    uint8_t substep_count) {
  return substep_count == 0
             ? MotionIntegrationSafetyAction::ResetNeutralAndDisarmTilt
             : MotionIntegrationSafetyAction::Continue;
}

// Result of inspecting one raw pipeline frame before any downstream time-step
// normalization. The four states intentionally keep rejected time, missing
// sensor data, normal integration, and a long-gap reset distinguishable.
enum class MotionInputAction : uint8_t {
  RejectFrame = 0,
  HoldNoSample,
  Integrate,
  ResetNeutral,
};

struct MotionInputResult {
  MotionInputAction action = MotionInputAction::RejectFrame;
  ImuSample activity{};
  Vec3f gravity_g{};
  float effective_dt_s = 0.0f;
};

// Production-owned input boundary and activity estimator for the optional
// gravity-separated mass path. Raw/quasi-static acceleration remains available
// to the caller; only `activity` is gravity removed, band limited, and
// deadbanded for Mass energy/agitation.
class MotionActivityFilter {
 public:
  void configure(const SystemParams& params);
  void reset();
  MotionInputResult process(const ImuSample& sample, float raw_dt_s);

  bool initialized() const { return initialized_; }
  float pendingDtS() const { return pending_dt_s_; }
  const Vec3f& gravity() const { return gravity_g_; }

 private:
  MotionActivityFilterParams params_{};
  Vec3f gravity_g_{};
  Vec3f filtered_accel_g_{};
  Vec3f filtered_gyro_dps_{};
  float pending_dt_s_ = 0.0f;
  bool initialized_ = false;
};

}  // namespace haptics
