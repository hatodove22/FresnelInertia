#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>

#include "haptics/EspNowControlProtocol.hpp"
#include "haptics/EspNowTelemetryProtocol.hpp"
#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

#ifndef HAPTICS_ENABLE_ESPNOW_TELEMETRY
#define HAPTICS_ENABLE_ESPNOW_TELEMETRY 0
#endif

#ifndef HAPTICS_DEMO_ESPNOW_AUTOSTART
#define HAPTICS_DEMO_ESPNOW_AUTOSTART 0
#endif

#if HAPTICS_DEMO_ESPNOW_AUTOSTART && !HAPTICS_ENABLE_ESPNOW_TELEMETRY
#error "Demo ESP-NOW autostart requires the ESP-NOW telemetry backend"
#endif

#if HAPTICS_ENABLE_ESPNOW_TELEMETRY && HAPTICS_ENABLE_REMOTE_BACKEND
#error "ESP-NOW telemetry and the legacy Wi-Fi remote backend are separate environments"
#endif

namespace haptics {

struct EspNowTelemetryStatus {
  bool compile_enabled = false;
  bool initialized = false;
  bool runtime_enabled = false;
  uint8_t channel = 6U;
  uint16_t period_ms = 100U;
  uint16_t packet_bytes = 0U;
  uint32_t sequence = 0U;
  uint32_t transmitted_packets = 0U;
  uint32_t dropped_packets = 0U;
  uint32_t send_errors = 0U;
  uint32_t control_responses = 0U;
  uint32_t control_applied = 0U;
  uint32_t control_rejected = 0U;
  bool control_paired = false;
  uint32_t control_session_id = 0U;
};

struct EspNowControlEnvelope {
  uint8_t source[6]{};
  EspNowControlPacketV1 packet{};
};

// Latest-value telemetry transport plus a bounded structured control return
// path. Radio enable/disable occurs locally while Safe Idle. The dedicated
// demo setup may enable it automatically after establishing Idle/output OFF;
// begin() itself leaves the radio disabled for all configurations.
class EspNowTelemetryProducer {
 public:
  bool begin(const SystemParams& params);
  void configure(const SystemParams& params);
  bool setRuntimeEnabled(bool enabled);
  void publish(const TelemetrySnapshot& snapshot);
  void publishNow(const TelemetrySnapshot& snapshot);
  bool popControlRequest(EspNowControlEnvelope& request);
  EspNowControlResult authorizeControl(const EspNowControlEnvelope& request,
                                       bool safe_idle);
  bool sendControlResponse(const EspNowControlEnvelope& request,
                           EspNowControlResult result,
                           uint64_t applied_frame_counter,
                           const char* detail);
  void noteControlResult(EspNowControlResult result);
  bool enqueueControlFromRadio(const uint8_t source[6],
                               const uint8_t* data,
                               std::size_t length);
  void describeStatus(char* out, std::size_t size) const;

  const EspNowTelemetryStatus& status() const { return status_; }
  bool isEnabled() const { return status_.runtime_enabled; }

 private:
  bool startRadio();
  void stopRadio();
  bool sendSnapshot(const TelemetrySnapshot& snapshot);
  bool sourceMatchesPaired(const uint8_t source[6]) const;
  bool ensurePeer(const uint8_t address[6]);

  static constexpr uint16_t kMinPeriodMs = 50U;
  static constexpr uint16_t kMaxPeriodMs = 5000U;
  EspNowTelemetryStatus status_{};
  EspNowResolvedState resolved_{};
  uint32_t last_emit_ms_ = 0U;
  uint32_t last_control_request_id_ = 0U;
  uint8_t paired_source_[6]{};
  void* control_queue_ = nullptr;
  std::atomic<uint32_t> callback_control_received_{0U};
  std::atomic<uint32_t> callback_control_invalid_{0U};
  std::atomic<uint32_t> callback_control_queue_drops_{0U};
};

}  // namespace haptics
