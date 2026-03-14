#pragma once

#include <cstdint>

#include "haptics/Parameters.hpp"

namespace haptics {

class DisplayDebugView {
 public:
 void render(const TelemetrySnapshot& telemetry, const SystemParams& params);
  void clear();
  void showBootBanner();

 private:
  void begin();

  bool initialized_ = false;
  bool visible_ = false;
  uint32_t last_draw_ms_ = 0;
};

}  // namespace haptics
