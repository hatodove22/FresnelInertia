#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class TiltPseudoForceModel {
 public:
  void configure(const SystemParams& params);
  void reset();
  TiltPlaneCommand update(const ImuSample& sample, const MassState& mass, float dt_s);

 private:
  float contentCgScale(MaterialFamily family) const;

  SystemParams params_{};
  Vec2f g_qs_ms2_{};
  Vec2f a_dyn_ms2_{};
  Vec2f content_cg_m_{};
  Vec2f delta_deg_{};
  bool initialized_ = false;
};

}  // namespace haptics
