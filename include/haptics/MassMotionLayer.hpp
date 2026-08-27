#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class MassMotionLayer {
 public:
  void configure(const SystemParams& params);
  MassState update(const ImuSample& sample, float dt_s);
  MassState updateWithActivity(const ImuSample& raw_sample,
                               const ImuSample& activity_sample,
                               float dt_s);
  const MassState& state() const { return state_; }
  float maxStableStepS() const;

 private:
  MassState updateImpl(const ImuSample& raw_sample,
                       const ImuSample& activity_sample,
                       float dt_s,
                       bool gravity_separated_activity);

  SystemParams params_{};
  MassState state_{};
  Vec2f filtered_drive_{};
  Vec2f convective_bias_{};
  Vec2f agitation_bias_{};
  float agitation_phase_rad_ = 0.0f;
};

}  // namespace haptics
