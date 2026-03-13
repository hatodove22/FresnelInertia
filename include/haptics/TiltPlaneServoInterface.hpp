#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class TiltPlaneServoInterface {
 public:
  bool begin(const SystemParams& params);
  void configure(const SystemParams& params);
  void setRuntimeEnabled(bool enabled);
  void home();
  void submit(const TiltPlaneCommand& command);
  bool isEnabled() const { return enabled_ && runtime_enabled_; }

 private:
  SystemParams params_{};
  bool enabled_ = false;
  bool runtime_enabled_ = false;
  TiltPlaneCommand last_command_{};
  uint32_t last_submit_ms_ = 0;
};

}  // namespace haptics
