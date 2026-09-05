#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

#ifndef HAPTICS_ENABLE_TILT_SERVO
#define HAPTICS_ENABLE_TILT_SERVO 0
#endif

#ifndef HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
#define HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND 0
#endif

namespace haptics {

struct TiltBusPingDiagnostic {
  uint8_t id = 0;
  std::size_t tx_bytes = 0;
  std::size_t rx_bytes = 0;
  uint16_t echo_packets = 0;
  uint16_t status_packets = 0;
  uint8_t status_id = 0xFF;
  uint8_t status_error = 0xFF;
  std::size_t status_param_length = 0;
  uint16_t model_number = 0;
  bool success = false;
};

class TiltPlaneServoInterface {
 public:
  bool begin(const SystemParams& params);
  void configure(const SystemParams& params);
  bool setRuntimeEnabled(bool enabled);
  void service(uint32_t now_ms, bool command_source_healthy = true);
  void latchFault(TiltServoFault fault);
  bool clearFault();
  bool diagnose(std::array<TiltBusPingDiagnostic, 2>& results);
  void home();
  void submit(const TiltPlaneCommand& command);
  bool isCompileEnabled() const { return HAPTICS_ENABLE_TILT_SERVO != 0; }
  bool isEnabled() const { return enabled_ && runtime_enabled_; }
  const TiltServoStatus& status() const { return status_; }

 private:
  bool setTorqueEnabled(bool enabled);
  void zeroCurrents();
  bool preflight();
  bool arm();
  bool readDeviceStatus(std::size_t index, bool include_identity);
  bool deviceStatusSafe(std::size_t index, bool require_torque_off);
  bool writeGoalPositions();
  void refreshAges(uint32_t now_ms);
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  void cancelHealthRead();
  bool startHealthRead(uint32_t now_ms);
  void serviceHealthRead(uint32_t now_ms);

  // Runtime RX is incremental; no reply wait runs on the haptic thread.
  std::array<uint8_t, 128> health_rx_{};
  std::size_t health_rx_size_ = 0;
  std::size_t health_rx_expected_ = 0;
  TiltServoDeviceStatus health_candidate_{};
  uint32_t health_read_started_ms_ = 0;
  uint8_t health_device_ = 0;
  uint8_t health_stage_ = 0;
  uint8_t health_attempt_ = 0;
  bool health_active_ = false;
  bool health_pending_ = false;
  bool fault_torque_off_pending_ = false;
#endif

  SystemParams params_{};
  bool enabled_ = false;
  bool runtime_enabled_ = false;
  TiltPlaneCommand last_command_{};
  uint32_t last_submit_ms_ = 0;
  uint32_t last_command_write_ms_ = 0;
  uint32_t last_health_poll_ms_ = 0;
  uint32_t last_status_ms_ = 0;
  uint8_t next_health_device_ = 0;
  TiltServoStatus status_{};
};

const char* tiltServoStateToString(TiltServoState state);
const char* tiltServoFaultToString(TiltServoFault fault);

}  // namespace haptics
