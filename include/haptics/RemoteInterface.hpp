#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class RemoteInterface {
 public:
  bool begin(const SystemParams& params);
  void configure(const SystemParams& params);
  void update();
  void publishTelemetry(const TelemetrySnapshot& telemetry);
  void describeStatus(char* out, std::size_t size) const;
  bool popMessage(ControlMessage& message);
  void pushMessage(const ControlMessage& message);
  void adjustClientCount(int delta);
  void noteReceivedMessage();
  const RemoteStatus& status() const { return status_; }
  bool isEnabled() const { return status_.runtime_enabled; }

 private:
  SystemParams params_{};
  RemoteStatus status_{};
  std::array<ControlMessage, 8> queue_{};
  std::size_t queue_head_ = 0;
  std::size_t queue_tail_ = 0;
  std::size_t queue_count_ = 0;
  uint32_t last_telemetry_ms_ = 0;
  TelemetrySnapshot last_telemetry_{};
  bool has_telemetry_ = false;
};

}  // namespace haptics
