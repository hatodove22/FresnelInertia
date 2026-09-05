#pragma once

#include <cstddef>
#include <cstdint>

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

#ifndef HAPTICS_ENABLE_USB_TELEMETRY
#define HAPTICS_ENABLE_USB_TELEMETRY 0
#endif

namespace haptics {

struct UsbTelemetryStatus {
  bool compile_enabled = false;
  bool runtime_enabled = false;
  uint16_t period_ms = 100;
  uint16_t pending_bytes = 0;
  uint32_t transmitted_frames = 0;
  uint32_t dropped_frames = 0;
  uint32_t backpressure_dropped_frames = 0;
  uint32_t console_interrupted_frames = 0;
  uint32_t unterminated_partial_frames = 0;
  uint32_t serialization_errors = 0;
};

// Passive, latest-value telemetry over the existing USB console. The producer
// never changes run mode or physical-output state. Runtime enablement is kept
// separate from configuration so boot-time params cannot arm the stream.
class UsbTelemetryProducer {
 public:
  bool begin(const SystemParams& params);
  void configure(const SystemParams& params);
  bool setRuntimeEnabled(bool enabled);
  void publish(const TelemetrySnapshot& snapshot);
  void update();

  // Prevent a human console response from being inserted into a partially
  // transmitted JSON object. A partial object is invalidated; a best-effort
  // newline terminates it, and failure is counted for later diagnosis. The
  // passive host capture tool classifies the resulting line as transport text.
  void prepareForConsoleOutput();

  void describeStatus(char* out, std::size_t size) const;
  const UsbTelemetryStatus& status() const { return status_; }
  bool isEnabled() const { return status_.runtime_enabled; }

 private:
  static constexpr uint16_t kMinPeriodMs = 50;
  static constexpr uint16_t kMaxPeriodMs = 5000;
#if HAPTICS_ENABLE_USB_TELEMETRY
  static constexpr std::size_t kPayloadCapacity = 3072;
#else
  static constexpr std::size_t kPayloadCapacity = 1;
#endif

  bool queueSnapshot(const TelemetrySnapshot& snapshot);
  void clearPending();
  void refreshPendingStatus();

  UsbTelemetryStatus status_{};
  uint32_t last_emit_ms_ = 0;
  char pending_[kPayloadCapacity]{};
  std::size_t pending_length_ = 0;
  std::size_t pending_offset_ = 0;
};

}  // namespace haptics
