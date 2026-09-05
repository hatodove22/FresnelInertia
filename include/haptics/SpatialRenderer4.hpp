#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class SpatialRenderer4 {
 public:
  void configure(const SystemParams& params);
  SpatialFrame4 update(const ResonanceFrame<kMaxResonanceVoicesPerFrame>& resonances, float dt_s);

 private:
  struct PendingDrive {
    bool active = false;
    float delay_s = 0.0f;
    float duration_s = 0.0f;
    float density_hz = 0.0f;
    DriveFrame4 drive{};
  };

  void accumulateImmediate(DriveFrame4& drive, const ResonanceVoice& voice);
  void enqueueDelayed(const DriveFrame4& drive, float delay_s,
                      float duration_s = 0.0f, float density_hz = 0.0f);
  SystemParams params_{};
  std::array<PendingDrive, 16> pending_{};
};

}  // namespace haptics
