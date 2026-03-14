#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class MassMotionLayer {
 public:
  void configure(const SystemParams& params);
  MassState update(const ImuSample& sample, float dt_s);

 private:
  SystemParams params_{};
  MassState state_{};
  Vec2f filtered_drive_{};
  Vec2f convective_bias_{};
  Vec2f agitation_bias_{};
  float agitation_phase_rad_ = 0.0f;
};

}  // namespace haptics
