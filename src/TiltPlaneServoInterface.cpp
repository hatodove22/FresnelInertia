#include "haptics/TiltPlaneServoInterface.hpp"

#include <Arduino.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>

#ifndef HAPTICS_ENABLE_TILT_SERVO
#define HAPTICS_ENABLE_TILT_SERVO 0
#endif

#ifndef HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE
#define HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE 0
#endif

#ifndef HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
#define HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND 0
#endif

#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE && \
    !HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
#error "The legacy DIR-pin tilt backend is incompatible with the as-built AtomS3 DXL2 board"
#endif

namespace haptics {
namespace {

float clampf(float value, float lo, float hi) {
  return std::max(lo, std::min(value, hi));
}

#if HAPTICS_ENABLE_TILT_SERVO
HardwareSerial& kTiltSerial = Serial1;
#endif

#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND

constexpr uint8_t kBroadcastId = 0xFE;
constexpr uint8_t kInstructionPing = 0x01;
constexpr uint8_t kInstructionRead = 0x02;
constexpr uint8_t kInstructionWrite = 0x03;
constexpr uint8_t kInstructionSyncWrite = 0x83;
constexpr uint8_t kInstructionStatus = 0x55;
constexpr uint8_t kModePosition = 3;
constexpr uint16_t kAddrOperatingMode = 11;
constexpr uint16_t kAddrTorqueEnable = 64;
constexpr uint16_t kAddrHardwareError = 70;
constexpr uint16_t kAddrPositionPGain = 84;
constexpr uint16_t kAddrBusWatchdog = 98;
constexpr uint16_t kAddrGoalPwm = 100;
constexpr uint16_t kAddrProfileAcceleration = 108;
constexpr uint16_t kAddrProfileVelocity = 112;
constexpr uint16_t kAddrGoalPosition = 116;
constexpr std::size_t kControlStatusLength = 7;  // Torque Enable..Hardware Error
constexpr std::size_t kMotionStatusLength = 31;
constexpr uint32_t kStatusTimeoutMs = 45;
// Startup uses synchronous retries. Runtime uses the same limits incrementally
// so a missing reply never stalls the shared haptic pipeline.
constexpr uint8_t kReadTransactionAttempts = 3;
constexpr uint8_t kBootPreflightAttempts = 3;
constexpr uint32_t kBootPreflightSettleMs = 120;
constexpr std::size_t kPacketCapacity = 128;
constexpr float kDegreesPerPulse = 0.088f;
constexpr int32_t kPositionEnvelopeTolerancePulses = 8;

struct RawFrame {
  std::array<uint8_t, kPacketCapacity> bytes{};
  std::size_t size = 0;
};

struct StatusPacket {
  uint8_t error = 0;
  std::array<uint8_t, 64> params{};
  std::size_t param_length = 0;
};

uint16_t updateCrc(uint16_t crc, const uint8_t* data, std::size_t length) {
  for (std::size_t i = 0; i < length; ++i) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc & 0x8000U) != 0U
                ? static_cast<uint16_t>((crc << 1U) ^ 0x8005U)
                : static_cast<uint16_t>(crc << 1U);
    }
  }
  return crc;
}

uint16_t readLe16(const uint8_t* data) {
  return static_cast<uint16_t>(data[0]) |
         (static_cast<uint16_t>(data[1]) << 8U);
}

int32_t readLe32Signed(const uint8_t* data) {
  const uint32_t value = static_cast<uint32_t>(data[0]) |
                         (static_cast<uint32_t>(data[1]) << 8U) |
                         (static_cast<uint32_t>(data[2]) << 16U) |
                         (static_cast<uint32_t>(data[3]) << 24U);
  return static_cast<int32_t>(value);
}

void writeLe16(uint8_t* output, uint16_t value) {
  output[0] = static_cast<uint8_t>(value & 0xFFU);
  output[1] = static_cast<uint8_t>((value >> 8U) & 0xFFU);
}

void writeLe32(uint8_t* output, uint32_t value) {
  output[0] = static_cast<uint8_t>(value & 0xFFU);
  output[1] = static_cast<uint8_t>((value >> 8U) & 0xFFU);
  output[2] = static_cast<uint8_t>((value >> 16U) & 0xFFU);
  output[3] = static_cast<uint8_t>((value >> 24U) & 0xFFU);
}

void drainInput() {
  while (kTiltSerial.available() > 0) {
    kTiltSerial.read();
  }
}

void restartDxlBus(const SystemParams& params) {
  kTiltSerial.end();
  delay(2);
  pinMode(params.pins.dynamixel_tx, OUTPUT);
  digitalWrite(params.pins.dynamixel_tx, HIGH);
  kTiltSerial.setRxBufferSize(512);
  kTiltSerial.begin(params.tilt.bus_baud, SERIAL_8N1,
                    params.pins.dynamixel_rx, params.pins.dynamixel_tx);
  delay(3);
  drainInput();
}

bool sendInstruction(
    uint8_t id,
    uint8_t instruction,
    const uint8_t* params,
    std::size_t param_length,
    bool wait_for_tx = true,
    std::size_t* tx_bytes = nullptr) {
  if (tx_bytes != nullptr) *tx_bytes = 0;
  if ((param_length > 0U && params == nullptr) ||
      param_length > kPacketCapacity - 10U) {
    return false;
  }
  std::array<uint8_t, kPacketCapacity> packet{};
  packet[0] = 0xFF;
  packet[1] = 0xFF;
  packet[2] = 0xFD;
  packet[3] = 0x00;
  packet[4] = id;
  packet[7] = instruction;

  std::size_t used = 8U;
  for (std::size_t i = 0; i < param_length; ++i) {
    if (used + 3U > packet.size()) {
      return false;
    }
    packet[used++] = params[i];
    if (used >= 10U && packet[used - 3U] == 0xFFU &&
        packet[used - 2U] == 0xFFU && packet[used - 1U] == 0xFDU) {
      packet[used++] = 0xFDU;
    }
  }
  const uint16_t protocol_length = static_cast<uint16_t>(used - 7U + 2U);
  packet[5] = static_cast<uint8_t>(protocol_length & 0xFFU);
  packet[6] = static_cast<uint8_t>((protocol_length >> 8U) & 0xFFU);
  const uint16_t crc = updateCrc(0, packet.data(), used);
  packet[used++] = static_cast<uint8_t>(crc & 0xFFU);
  packet[used++] = static_cast<uint8_t>((crc >> 8U) & 0xFFU);
  if (!wait_for_tx &&
      kTiltSerial.availableForWrite() < static_cast<int>(used)) {
    return false;
  }
  drainInput();
  const std::size_t written = kTiltSerial.write(packet.data(), used);
  if (tx_bytes != nullptr) *tx_bytes = written;
  if (wait_for_tx) {
    kTiltSerial.flush();
  }
  return written == used;
}

bool consumeFrameByte(
    uint8_t value,
    uint8_t* bytes,
    std::size_t capacity,
    std::size_t& used,
    std::size_t& expected) {
  if (used == 0U) {
    if (value == 0xFFU) bytes[used++] = value;
    return false;
  }
  if (used == 1U) {
    if (value == 0xFFU) bytes[used++] = value;
    else used = 0U;
    return false;
  }
  if (used == 2U) {
    if (value == 0xFDU) bytes[used++] = value;
    else if (value != 0xFFU) used = 0U;
    return false;
  }
  if (used == 3U) {
    if (value == 0x00U) bytes[used++] = value;
    else used = 0U;
    return false;
  }
  if (used >= capacity) {
    used = expected = 0U;
    return false;
  }
  bytes[used++] = value;
  if (used == 7U) {
    const uint16_t length = readLe16(&bytes[5]);
    expected = 7U + length;
    if (length < 3U || expected > capacity) {
      used = expected = 0U;
    }
  }
  if (expected != 0U && used == expected) {
    if (readLe16(&bytes[expected - 2U]) == updateCrc(0, bytes, expected - 2U)) {
      return true;
    }
    used = expected = 0U;
  }
  return false;
}

bool decodeStatusPacket(
    const uint8_t* bytes,
    std::size_t size,
    uint8_t expected_id,
    StatusPacket& status) {
  // The PCB keeps RX enabled during TX; instruction echoes are not replies.
  if (size < 11U || bytes[7] != kInstructionStatus || bytes[4] != expected_id) {
    return false;
  }
  status.error = bytes[8];
  status.param_length = 0U;
  const std::size_t param_end = size - 2U;
  for (std::size_t i = 9U; i < param_end; ++i) {
    if (status.param_length >= status.params.size()) {
      return false;
    }
    status.params[status.param_length++] = bytes[i];
    if (i >= 11U && i + 1U < param_end && bytes[i - 2U] == 0xFFU &&
        bytes[i - 1U] == 0xFFU && bytes[i] == 0xFDU && bytes[i + 1U] == 0xFDU) {
      ++i;
    }
  }
  return true;
}

bool readFrame(RawFrame& frame, uint32_t timeout_ms) {
  const uint32_t start_ms = millis();
  std::size_t used = 0;
  std::size_t expected = 0;
  while (millis() - start_ms < timeout_ms) {
    while (kTiltSerial.available() > 0) {
      const int raw = kTiltSerial.read();
      if (raw < 0) break;
      if (consumeFrameByte(static_cast<uint8_t>(raw), frame.bytes.data(),
                           frame.bytes.size(), used, expected)) {
        frame.size = expected;
        return true;
      }
    }
    delay(1);
  }
  return false;
}

bool waitForStatus(
    uint8_t expected_id,
    StatusPacket& status,
    uint32_t timeout_ms = kStatusTimeoutMs) {
  const uint32_t start_ms = millis();
  while (millis() - start_ms < timeout_ms) {
    const uint32_t elapsed_ms = millis() - start_ms;
    RawFrame frame{};
    if (!readFrame(frame, std::max<uint32_t>(1U, timeout_ms - elapsed_ms))) {
      return false;
    }
    if (decodeStatusPacket(frame.bytes.data(), frame.size, expected_id, status)) {
      return true;
    }
  }
  return false;
}

bool ping(uint8_t id, uint16_t& model_number) {
  if (!sendInstruction(id, kInstructionPing, nullptr, 0U)) {
    return false;
  }
  StatusPacket status{};
  if (!waitForStatus(id, status) || status.error != 0U ||
      status.param_length < 3U) {
    return false;
  }
  model_number = readLe16(status.params.data());
  return true;
}

bool readRegisterOnce(
    uint8_t id,
    uint16_t address,
    uint16_t length,
    uint8_t* output,
    std::size_t output_size) {
  if (output == nullptr || length > output_size) {
    return false;
  }
  const uint8_t params[4]{
      static_cast<uint8_t>(address & 0xFFU),
      static_cast<uint8_t>((address >> 8U) & 0xFFU),
      static_cast<uint8_t>(length & 0xFFU),
      static_cast<uint8_t>((length >> 8U) & 0xFFU),
  };
  if (!sendInstruction(id, kInstructionRead, params, sizeof(params))) {
    return false;
  }
  StatusPacket status{};
  if (!waitForStatus(id, status) || status.error != 0U ||
      status.param_length < length) {
    return false;
  }
  std::memcpy(output, status.params.data(), length);
  return true;
}

bool readRegister(
    uint8_t id,
    uint16_t address,
    uint16_t length,
    uint8_t* output,
    std::size_t output_size) {
  if (output == nullptr || length > output_size) {
    return false;
  }
  for (uint8_t attempt = 0U; attempt < kReadTransactionAttempts; ++attempt) {
    if (readRegisterOnce(id, address, length, output, output_size)) {
      return true;
    }
    if (attempt + 1U < kReadTransactionAttempts) {
      delay(1);
    }
  }
  return false;
}

bool writeRegisterVerified(
    uint8_t id,
    uint16_t address,
    const uint8_t* value,
    std::size_t value_length) {
  if (value == nullptr || value_length == 0U || value_length > 4U) {
    return false;
  }
  std::array<uint8_t, 6> params{};
  params[0] = static_cast<uint8_t>(address & 0xFFU);
  params[1] = static_cast<uint8_t>((address >> 8U) & 0xFFU);
  std::memcpy(&params[2], value, value_length);
  if (!sendInstruction(id, kInstructionWrite, params.data(), value_length + 2U)) {
    return false;
  }
  StatusPacket ignored{};
  waitForStatus(id, ignored, 15U);
  std::array<uint8_t, 4> readback{};
  return readRegister(id, address, static_cast<uint16_t>(value_length),
                      readback.data(), readback.size()) &&
         std::memcmp(value, readback.data(), value_length) == 0;
}

bool writeU8Verified(uint8_t id, uint16_t address, uint8_t value) {
  return writeRegisterVerified(id, address, &value, 1U);
}

bool writeU16Verified(uint8_t id, uint16_t address, uint16_t value) {
  std::array<uint8_t, 2> encoded{};
  writeLe16(encoded.data(), value);
  return writeRegisterVerified(id, address, encoded.data(), encoded.size());
}

bool writeU32Verified(uint8_t id, uint16_t address, uint32_t value) {
  std::array<uint8_t, 4> encoded{};
  writeLe32(encoded.data(), value);
  return writeRegisterVerified(id, address, encoded.data(), encoded.size());
}

bool broadcastTorqueOff(bool wait_for_tx = true) {
  const uint8_t params[3]{
      static_cast<uint8_t>(kAddrTorqueEnable & 0xFFU),
      static_cast<uint8_t>((kAddrTorqueEnable >> 8U) & 0xFFU), 0U};
  const bool sent =
      sendInstruction(kBroadcastId, kInstructionWrite, params, sizeof(params),
                      wait_for_tx);
  if (wait_for_tx) {
    delay(3);
    drainInput();
  }
  return sent;
}

bool syncWriteGoalPositions(
    uint8_t thumb_id,
    int32_t thumb_goal,
    uint8_t index_id,
    int32_t index_goal) {
  std::array<uint8_t, 14> params{};
  writeLe16(&params[0], kAddrGoalPosition);
  writeLe16(&params[2], 4U);
  params[4] = thumb_id;
  writeLe32(&params[5], static_cast<uint32_t>(thumb_goal));
  params[9] = index_id;
  writeLe32(&params[10], static_cast<uint32_t>(index_goal));
  return sendInstruction(kBroadcastId, kInstructionSyncWrite, params.data(),
                         params.size(), false);
}

#elif HAPTICS_ENABLE_TILT_SERVO

constexpr uint8_t kInstructionWrite = 0x03;
constexpr uint16_t kAddrOperatingMode = 11;
constexpr uint16_t kAddrTorqueEnable = 64;
constexpr uint16_t kAddrGoalCurrent = 102;
constexpr uint16_t kAddrGoalPosition = 116;
constexpr uint8_t kModePosition = 3;
constexpr uint8_t kModeCurrentBasedPosition = 5;

uint16_t updateCrc(uint16_t crc, const uint8_t* data, uint16_t length) {
  for (uint16_t i = 0; i < length; ++i) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc & 0x8000U) != 0U
                ? static_cast<uint16_t>((crc << 1U) ^ 0x8005U)
                : static_cast<uint16_t>(crc << 1U);
    }
  }
  return crc;
}

uint32_t degreesToRaw(float degrees) {
  return static_cast<uint32_t>(
      (clampf(degrees, -180.0f, 180.0f) + 180.0f) * (4095.0f / 360.0f));
}

void sendLegacyPacket(
    uint8_t id,
    const uint8_t* params,
    uint16_t param_length,
    int direction_pin) {
  const uint16_t length = param_length + 3U;
  uint8_t packet[64]{0xFF, 0xFF, 0xFD, 0x00, id,
                     static_cast<uint8_t>(length & 0xFFU),
                     static_cast<uint8_t>((length >> 8U) & 0xFFU),
                     kInstructionWrite};
  std::memcpy(&packet[8], params, param_length);
  const uint16_t crc = updateCrc(0, packet, 8U + param_length);
  packet[8U + param_length] = static_cast<uint8_t>(crc & 0xFFU);
  packet[9U + param_length] = static_cast<uint8_t>((crc >> 8U) & 0xFFU);
  digitalWrite(direction_pin, HIGH);
  delayMicroseconds(20);
  kTiltSerial.write(packet, 10U + param_length);
  kTiltSerial.flush();
  delayMicroseconds(20);
  digitalWrite(direction_pin, LOW);
}

void writeLegacyRegister(
    uint8_t id,
    uint16_t address,
    const uint8_t* data,
    uint16_t length,
    int direction_pin) {
  uint8_t params[32]{};
  params[0] = static_cast<uint8_t>(address & 0xFFU);
  params[1] = static_cast<uint8_t>((address >> 8U) & 0xFFU);
  std::memcpy(&params[2], data, length);
  sendLegacyPacket(id, params, length + 2U, direction_pin);
}

void writeLegacyU8(uint8_t id, uint16_t address, uint8_t value, int direction_pin) {
  writeLegacyRegister(id, address, &value, 1U, direction_pin);
}

void writeLegacyU16(uint8_t id, uint16_t address, uint16_t value, int direction_pin) {
  uint8_t data[2]{static_cast<uint8_t>(value & 0xFFU),
                  static_cast<uint8_t>((value >> 8U) & 0xFFU)};
  writeLegacyRegister(id, address, data, 2U, direction_pin);
}

void writeLegacyU32(uint8_t id, uint16_t address, uint32_t value, int direction_pin) {
  uint8_t data[4]{static_cast<uint8_t>(value & 0xFFU),
                  static_cast<uint8_t>((value >> 8U) & 0xFFU),
                  static_cast<uint8_t>((value >> 16U) & 0xFFU),
                  static_cast<uint8_t>((value >> 24U) & 0xFFU)};
  writeLegacyRegister(id, address, data, 4U, direction_pin);
}

#endif

}  // namespace

const char* tiltServoStateToString(TiltServoState state) {
  switch (state) {
    case TiltServoState::Disabled: return "disabled";
    case TiltServoState::Checking: return "checking";
    case TiltServoState::ReadyTorqueOff: return "ready_torque_off";
    case TiltServoState::Arming: return "arming";
    case TiltServoState::Armed: return "armed";
    case TiltServoState::FaultLatched: return "fault_latched";
  }
  return "unknown";
}

const char* tiltServoFaultToString(TiltServoFault fault) {
  switch (fault) {
    case TiltServoFault::None: return "none";
    case TiltServoFault::Configuration: return "configuration";
    case TiltServoFault::Communication: return "communication";
    case TiltServoFault::Identity: return "identity";
    case TiltServoFault::OperatingMode: return "operating_mode";
    case TiltServoFault::TorqueState: return "torque_state";
    case TiltServoFault::PositionRange: return "position_range";
    case TiltServoFault::OverCurrent: return "over_current";
    case TiltServoFault::OverTemperature: return "over_temperature";
    case TiltServoFault::SupplyVoltage: return "supply_voltage";
    case TiltServoFault::HardwareError: return "hardware_error";
    case TiltServoFault::CommandTimeout: return "command_timeout";
    case TiltServoFault::ImuSafety: return "imu_safety";
  }
  return "unknown";
}

bool TiltPlaneServoInterface::begin(const SystemParams& params) {
  params_ = params;
  enabled_ = HAPTICS_ENABLE_TILT_SERVO != 0;
  runtime_enabled_ = false;
  last_command_ = {};
  last_submit_ms_ = millis();
  last_command_write_ms_ = last_submit_ms_;
  last_health_poll_ms_ = last_submit_ms_;
  last_status_ms_ = 0U;
  next_health_device_ = 0U;
  status_ = {};
  status_.compile_enabled = enabled_;
  status_.atoms3_dxl2_backend = HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND != 0;
  status_.devices[0].id = params_.tilt.thumb_servo_id;
  status_.devices[1].id = params_.tilt.index_servo_id;

#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  // Match the proven AtomS3 combined probe setup. The custom DXL2 PCB keeps
  // RX active during TX, so idle-high TX and enough RX buffering are required
  // before the automatic half-duplex UART is started.
  cancelHealthRead();
  fault_torque_off_pending_ = false;
  restartDxlBus(params_);
  // Optional tilt failure must not take down the four-channel haptic path.
  // Retry only the torque-off/read-only preflight to tolerate servo/UART
  // startup skew. No motion command or torque-on write is issued here.
  for (uint8_t attempt = 0; attempt < kBootPreflightAttempts; ++attempt) {
    if (attempt > 0U) {
      restartDxlBus(params_);
    }
    delay(kBootPreflightSettleMs);
    if (preflight()) {
      break;
    }
  }
#elif HAPTICS_ENABLE_TILT_SERVO
  pinMode(params_.pins.dynamixel_direction, OUTPUT);
  digitalWrite(params_.pins.dynamixel_direction, LOW);
  kTiltSerial.begin(params_.tilt.bus_baud, SERIAL_8N1,
                    params_.pins.dynamixel_halfduplex_data,
                    params_.pins.dynamixel_halfduplex_data);
  status_.state = TiltServoState::ReadyTorqueOff;
#else
  status_.state = TiltServoState::Disabled;
#endif
  return true;
}

void TiltPlaneServoInterface::configure(const SystemParams& params) {
  const bool disable_requested = runtime_enabled_ && !params.features.enable_tilt_plane;
  params_ = params;
  status_.devices[0].id = params_.tilt.thumb_servo_id;
  status_.devices[1].id = params_.tilt.index_servo_id;
  if (disable_requested) {
    setRuntimeEnabled(false);
  }
}

bool TiltPlaneServoInterface::setRuntimeEnabled(bool enabled) {
  const bool requested = enabled_ && enabled;
  status_.runtime_requested = requested;
  if (!requested) {
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
    cancelHealthRead();
    fault_torque_off_pending_ = false;
#endif
#if HAPTICS_ENABLE_TILT_SERVO
    zeroCurrents();
    const bool torque_off = setTorqueEnabled(false);
    runtime_enabled_ = false;
    if (status_.state != TiltServoState::FaultLatched) {
      status_.state = torque_off ? TiltServoState::ReadyTorqueOff
                                 : TiltServoState::FaultLatched;
      status_.fault = torque_off ? TiltServoFault::None
                                 : TiltServoFault::Communication;
    }
    return torque_off;
#else
    runtime_enabled_ = false;
    status_.state = TiltServoState::Disabled;
    return true;
#endif
  }

#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  return arm();
#elif HAPTICS_ENABLE_TILT_SERVO
  const uint8_t operating_mode = params_.tilt.current_based_position_mode
                                     ? kModeCurrentBasedPosition
                                     : kModePosition;
  for (const uint8_t servo_id : {params_.tilt.thumb_servo_id,
                                 params_.tilt.index_servo_id}) {
    writeLegacyU8(servo_id, kAddrTorqueEnable, 0U,
                  params_.pins.dynamixel_direction);
    writeLegacyU8(servo_id, kAddrOperatingMode, operating_mode,
                  params_.pins.dynamixel_direction);
    writeLegacyU8(servo_id, kAddrTorqueEnable, 1U,
                  params_.pins.dynamixel_direction);
  }
  runtime_enabled_ = true;
  status_.state = TiltServoState::Armed;
  status_.fault = TiltServoFault::None;
  last_submit_ms_ = millis();
  return true;
#else
  return false;
#endif
}

void TiltPlaneServoInterface::home() {
  TiltPlaneCommand command{};
#if !(HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND)
  command.thumb_angle_deg = params_.tilt.thumb_home_deg;
  command.index_angle_deg = params_.tilt.index_home_deg;
#endif
  command.thumb_current_limit_ma = params_.tilt.max_current_ma * 0.25f;
  command.index_current_limit_ma = params_.tilt.max_current_ma * 0.25f;
  submit(command);
}

void TiltPlaneServoInterface::submit(const TiltPlaneCommand& command) {
  if (!enabled_ || !runtime_enabled_) {
    return;
  }

#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  last_command_ = command;
  last_command_.thumb_angle_deg =
      clampf(command.thumb_angle_deg, params_.tilt.min_angle_deg,
             params_.tilt.max_angle_deg);
  last_command_.index_angle_deg =
      clampf(command.index_angle_deg, params_.tilt.min_angle_deg,
             params_.tilt.max_angle_deg);
  last_submit_ms_ = millis();
#elif HAPTICS_ENABLE_TILT_SERVO
  const uint32_t now_ms = millis();
  const float dt_s = std::max(0.010f, (now_ms - last_submit_ms_) * 1.0e-3f);
  last_submit_ms_ = now_ms;
  auto clampAngle = [&](float target_deg, float last_deg, float home_deg) {
    const float bounded = clampf(target_deg,
                                 params_.tilt.min_angle_deg + home_deg,
                                 params_.tilt.max_angle_deg + home_deg);
    const float max_step = params_.tilt.max_velocity_deg_s * dt_s;
    return clampf(bounded, last_deg - max_step, last_deg + max_step);
  };
  const float thumb_angle =
      clampAngle(command.thumb_angle_deg, last_command_.thumb_angle_deg,
                 params_.tilt.thumb_home_deg);
  const float index_angle =
      clampAngle(command.index_angle_deg, last_command_.index_angle_deg,
                 params_.tilt.index_home_deg);
  const uint16_t thumb_current = static_cast<uint16_t>(clampf(
      command.thumb_current_limit_ma, 0.0f, params_.tilt.max_current_ma));
  const uint16_t index_current = static_cast<uint16_t>(clampf(
      command.index_current_limit_ma, 0.0f, params_.tilt.max_current_ma));
  writeLegacyU16(params_.tilt.thumb_servo_id, kAddrGoalCurrent,
                 thumb_current, params_.pins.dynamixel_direction);
  writeLegacyU16(params_.tilt.index_servo_id, kAddrGoalCurrent,
                 index_current, params_.pins.dynamixel_direction);
  writeLegacyU32(params_.tilt.thumb_servo_id, kAddrGoalPosition,
                 degreesToRaw(thumb_angle), params_.pins.dynamixel_direction);
  writeLegacyU32(params_.tilt.index_servo_id, kAddrGoalPosition,
                 degreesToRaw(index_angle), params_.pins.dynamixel_direction);
  last_command_ = command;
  last_command_.thumb_angle_deg = thumb_angle;
  last_command_.index_angle_deg = index_angle;
#else
  (void)command;
#endif
}

void TiltPlaneServoInterface::service(
    uint32_t now_ms,
    bool command_source_healthy) {
  refreshAges(now_ms);
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  if (fault_torque_off_pending_) {
    // Preserve a stop request through temporary UART backpressure without
    // waiting on the haptic thread. This never resumes motion.
    fault_torque_off_pending_ = !broadcastTorqueOff(false);
    return;
  }
  if (!runtime_enabled_ || status_.state != TiltServoState::Armed) {
    return;
  }
  if (!command_source_healthy) {
    latchFault(TiltServoFault::ImuSafety);
    return;
  }
  if (now_ms - last_submit_ms_ > params_.tilt.command_timeout_ms) {
    latchFault(TiltServoFault::CommandTimeout);
    return;
  }
  if (health_pending_) {
    serviceHealthRead(now_ms);
    if (!runtime_enabled_ || health_pending_) {
      return;
    }
  }
  // A reply owns the half-duplex bus until completion/timeout. A due goal gets
  // priority between reads/retries, and only the latest submitted goal is sent.
  if (now_ms - last_command_write_ms_ >= params_.tilt.command_period_ms) {
    if (!writeGoalPositions()) {
      ++status_.communication_errors;
      latchFault(TiltServoFault::Communication);
      return;
    }
    last_command_write_ms_ = now_ms;
  }
  if (!health_active_ &&
      now_ms - last_health_poll_ms_ >= params_.tilt.health_poll_period_ms) {
    health_device_ = next_health_device_;
    next_health_device_ = static_cast<uint8_t>((next_health_device_ + 1U) % 2U);
    last_health_poll_ms_ = now_ms;
    health_candidate_ = status_.devices[health_device_];
    health_stage_ = 0U;
    health_attempt_ = 0U;
    health_active_ = true;
  }
  if (health_active_) {
    startHealthRead(now_ms);
  }
#else
  (void)command_source_healthy;
#endif
}

#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
void TiltPlaneServoInterface::cancelHealthRead() {
  health_active_ = false;
  health_pending_ = false;
  health_stage_ = 0U;
  health_attempt_ = 0U;
  health_rx_size_ = 0U;
  health_rx_expected_ = 0U;
}

bool TiltPlaneServoInterface::startHealthRead(uint32_t now_ms) {
  const uint16_t address = health_stage_ == 0U ? kAddrTorqueEnable
                                               : kAddrGoalPosition;
  const uint16_t length = health_stage_ == 0U ? kControlStatusLength
                                              : kMotionStatusLength;
  std::array<uint8_t, 4> request{};
  writeLe16(request.data(), address);
  writeLe16(&request[2], length);
  health_rx_size_ = 0U;
  health_rx_expected_ = 0U;
  ++health_attempt_;
  if (!sendInstruction(health_candidate_.id, kInstructionRead, request.data(),
                       request.size(), false)) {
    status_.devices[health_device_].status_valid = false;
    ++status_.communication_errors;
    latchFault(TiltServoFault::Communication);
    return false;
  }
  health_read_started_ms_ = now_ms;
  health_pending_ = true;
  return true;
}

void TiltPlaneServoInterface::serviceHealthRead(uint32_t now_ms) {
  bool failed = now_ms - health_read_started_ms_ >= kStatusTimeoutMs;
  // Bound parser work even if the bus carries unexpected traffic. Fragments
  // remain buffered across ticks; echoed TX, wrong ID/length, and bad CRC do
  // not complete the outstanding transaction.
  std::size_t byte_budget = kPacketCapacity;
  while (!failed && byte_budget-- > 0U && kTiltSerial.available() > 0) {
    const int raw = kTiltSerial.read();
    if (raw < 0) break;
    if (!consumeFrameByte(static_cast<uint8_t>(raw), health_rx_.data(),
                          health_rx_.size(), health_rx_size_,
                          health_rx_expected_)) {
      continue;
    }
    const std::size_t frame_size = health_rx_expected_;
    health_rx_size_ = health_rx_expected_ = 0U;
    StatusPacket packet{};
    if (!decodeStatusPacket(health_rx_.data(), frame_size,
                            health_candidate_.id, packet)) {
      continue;
    }
    if (packet.error != 0U) {
      failed = true;
      break;
    }
    const std::size_t expected_length = health_stage_ == 0U
                                            ? kControlStatusLength
                                            : kMotionStatusLength;
    if (packet.param_length != expected_length) {
      continue;
    }
    health_pending_ = false;
    health_attempt_ = 0U;
    if (health_stage_ == 0U) {
      health_candidate_.torque_enabled = packet.params[0] != 0U;
      health_candidate_.hardware_error = packet.params[6];
      health_stage_ = 1U;
      return;
    }
    // 116..146: the same control-table fields as the startup readback path.
    const uint8_t* motion = packet.params.data();
    health_candidate_.goal_position_raw = readLe32Signed(&motion[0]);
    health_candidate_.present_pwm_raw = static_cast<int16_t>(readLe16(&motion[8]));
    health_candidate_.present_current_ma = static_cast<int16_t>(readLe16(&motion[10]));
    health_candidate_.present_position_raw = readLe32Signed(&motion[16]);
    health_candidate_.input_voltage_decivolt = readLe16(&motion[28]);
    health_candidate_.temperature_c = motion[30];
    health_candidate_.status_valid = true;
    auto& device = status_.devices[health_device_];
    // Goals may have advanced between the two reads; retain the current intent.
    health_candidate_.commanded_position_raw = device.commanded_position_raw;
    device = health_candidate_;
    last_status_ms_ = now_ms;
    const std::size_t completed_device = health_device_;
    cancelHealthRead();
    if (!device.torque_enabled) {
      latchFault(TiltServoFault::TorqueState);
    } else {
      deviceStatusSafe(completed_device, false);
    }
    refreshAges(now_ms);
    return;
  }
  if (failed) {
    health_pending_ = false;
    health_rx_size_ = health_rx_expected_ = 0U;
    if (health_attempt_ >= kReadTransactionAttempts) {
      status_.devices[health_device_].status_valid = false;
      ++status_.communication_errors;
      latchFault(TiltServoFault::Communication);
    }
    // Otherwise service() can send a due goal before starting the next retry.
  }
}
#endif

void TiltPlaneServoInterface::latchFault(TiltServoFault fault) {
  status_.fault = fault;
  status_.state = TiltServoState::FaultLatched;
  status_.runtime_requested = false;
  runtime_enabled_ = false;
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  cancelHealthRead();
  // Runtime faults issue torque-off without waiting on a disconnected bus.
  fault_torque_off_pending_ = !broadcastTorqueOff(false);
  if (fault_torque_off_pending_) {
    ++status_.communication_errors;
  }
#elif HAPTICS_ENABLE_TILT_SERVO
  setTorqueEnabled(false);
#endif
}

bool TiltPlaneServoInterface::clearFault() {
  if (!enabled_) {
    return false;
  }
  status_.runtime_requested = false;
  runtime_enabled_ = false;
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  cancelHealthRead();
  fault_torque_off_pending_ = false;
  broadcastTorqueOff();
  // Draining bytes was insufficient to recover one observed UART failure.
  // Explicit Safe-Idle recovery recreates the bus before torque-off preflight.
  restartDxlBus(params_);
  return preflight();
#else
  status_.fault = TiltServoFault::None;
  status_.state = TiltServoState::ReadyTorqueOff;
  return true;
#endif
}

bool TiltPlaneServoInterface::diagnose(std::array<TiltBusPingDiagnostic, 2>& results) {
  results = {};
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  if (!enabled_ || runtime_enabled_) return false;
  // Attended Safe Idle only. Preserve current UART/fault state to observe the
  // failure, and never write torque, positions, operating mode, or PWM here.
  cancelHealthRead();
  const std::array<uint8_t, 2> ids{{params_.tilt.thumb_servo_id, params_.tilt.index_servo_id}};
  for (std::size_t index = 0; index < results.size(); ++index) {
    auto& result = results[index];
    result.id = ids[index];
    if (!sendInstruction(result.id, kInstructionPing, nullptr, 0U, true, &result.tx_bytes)) continue;
    const uint32_t started_ms = millis();
    RawFrame frame{};
    std::size_t used = 0;
    std::size_t expected = 0;
    bool received_expected_status = false;
    while (millis() - started_ms < kStatusTimeoutMs && !received_expected_status) {
      while (kTiltSerial.available() > 0 && millis() - started_ms < kStatusTimeoutMs) {
        const int raw = kTiltSerial.read();
        if (raw < 0) break;
        ++result.rx_bytes;
        if (!consumeFrameByte(static_cast<uint8_t>(raw), frame.bytes.data(),
                              frame.bytes.size(), used, expected)) continue;
        const std::size_t frame_size = expected;
        used = expected = 0;
        if (frame_size >= 10U && frame.bytes[7] == kInstructionPing && frame.bytes[4] == result.id) {
          ++result.echo_packets;
        }
        StatusPacket status{};
        if (!decodeStatusPacket(frame.bytes.data(), frame_size, frame.bytes[4], status)) continue;
        ++result.status_packets;
        result.status_id = frame.bytes[4];
        result.status_error = status.error;
        result.status_param_length = status.param_length;
        result.model_number = status.param_length >= 2U ? readLe16(status.params.data()) : 0U;
        if (result.status_id == result.id) {
          received_expected_status = true;
          result.success = status.error == 0U && status.param_length == 3U;
          break;
        }
      }
      if (!received_expected_status) delay(1);
    }
  }
  return true;  // Diagnostic ran; individual success is reported separately.
#else
  return false;
#endif
}

bool TiltPlaneServoInterface::setTorqueEnabled(bool enabled) {
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  if (!enabled) {
    broadcastTorqueOff();
  }
  bool ok = true;
  for (std::size_t index = 0; index < status_.devices.size(); ++index) {
    const uint8_t id = status_.devices[index].id;
    const bool device_ok =
        writeU8Verified(id, kAddrTorqueEnable, enabled ? 1U : 0U);
    if (device_ok) {
      status_.devices[index].torque_enabled = enabled;
    } else {
      // A failed readback cannot turn an unconfirmed stop into a valid OFF
      // observation. Retain the last value, explicitly marked stale/invalid.
      status_.devices[index].status_valid = false;
    }
    ok = device_ok && ok;
  }
  if (!ok) {
    ++status_.communication_errors;
  }
  return ok;
#elif HAPTICS_ENABLE_TILT_SERVO
  for (const uint8_t servo_id : {params_.tilt.thumb_servo_id,
                                 params_.tilt.index_servo_id}) {
    writeLegacyU8(servo_id, kAddrTorqueEnable, enabled ? 1U : 0U,
                  params_.pins.dynamixel_direction);
  }
  return true;
#else
  (void)enabled;
  return true;
#endif
}

void TiltPlaneServoInterface::zeroCurrents() {
#if HAPTICS_ENABLE_TILT_SERVO && !HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  writeLegacyU16(params_.tilt.thumb_servo_id, kAddrGoalCurrent, 0U,
                 params_.pins.dynamixel_direction);
  writeLegacyU16(params_.tilt.index_servo_id, kAddrGoalCurrent, 0U,
                 params_.pins.dynamixel_direction);
#endif
}

bool TiltPlaneServoInterface::preflight() {
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  cancelHealthRead();
  fault_torque_off_pending_ = false;
  status_.state = TiltServoState::Checking;
  status_.fault = TiltServoFault::None;
  runtime_enabled_ = false;
  if (params_.tilt.current_based_position_mode ||
      params_.tilt.thumb_servo_id == params_.tilt.index_servo_id ||
      params_.tilt.max_travel_pulses <= 0 ||
      params_.tilt.position_p_gain > 16383U ||
      params_.tilt.goal_pwm_limit <= 0 ||
      params_.tilt.goal_pwm_limit > 885 ||
      params_.tilt.abort_current_ma <= 0 ||
      params_.tilt.abort_current_ma > 1750 ||
      params_.tilt.abort_temperature_c == 0U ||
      params_.tilt.abort_temperature_c > 70U ||
      (params_.tilt.thumb_raw_direction != 1 &&
       params_.tilt.thumb_raw_direction != -1) ||
      (params_.tilt.index_raw_direction != 1 &&
       params_.tilt.index_raw_direction != -1)) {
    latchFault(TiltServoFault::Configuration);
    return false;
  }
  if (!broadcastTorqueOff()) {
    ++status_.communication_errors;
    latchFault(TiltServoFault::Communication);
    return false;
  }
  for (std::size_t index = 0; index < status_.devices.size(); ++index) {
    if (!readDeviceStatus(index, true)) {
      latchFault(TiltServoFault::Communication);
      return false;
    }
    auto& device = status_.devices[index];
    if (device.model_number != params_.tilt.expected_model_number) {
      latchFault(TiltServoFault::Identity);
      return false;
    }
    if (device.operating_mode != kModePosition) {
      latchFault(TiltServoFault::OperatingMode);
      return false;
    }
    if (device.torque_enabled) {
      latchFault(TiltServoFault::TorqueState);
      return false;
    }
    if (!deviceStatusSafe(index, true)) {
      return false;
    }
    if (device.present_position_raw < params_.tilt.max_travel_pulses ||
        device.present_position_raw > 4095 - params_.tilt.max_travel_pulses) {
      latchFault(TiltServoFault::PositionRange);
      return false;
    }
    device.home_position_raw = device.present_position_raw;
    device.commanded_position_raw = device.present_position_raw;
  }
  last_status_ms_ = millis();
  status_.state = TiltServoState::ReadyTorqueOff;
  status_.fault = TiltServoFault::None;
  refreshAges(last_status_ms_);
  return true;
#else
  return true;
#endif
}

bool TiltPlaneServoInterface::arm() {
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  if (status_.state == TiltServoState::FaultLatched) {
    status_.runtime_requested = false;
    return false;
  }
  // Safe Idle/ReadyTorqueOff already established that both devices have
  // torque disabled. Recreate the UART before the final arm preflight as well
  // as during fault clear: repeated bench runs showed that clear preflight
  // succeeded immediately after a restart while the following arm preflight
  // could lose ID1 without one.
  restartDxlBus(params_);
  if (!preflight()) {
    status_.runtime_requested = false;
    return false;
  }
  status_.state = TiltServoState::Arming;
  for (auto& device : status_.devices) {
    const uint8_t id = device.id;
    // Operating Mode is EEPROM-backed and was already verified by preflight.
    // Do not rewrite it during routine arming; this matches the proven probe
    // and avoids unnecessary EEPROM writes and their completion latency.
    device.commanded_position_raw = device.home_position_raw;
    const bool configured =
        writeU8Verified(id, kAddrTorqueEnable, 0U) &&
        // Clear RAM state retained from an earlier firmware before preloading
        // Goal Position. Re-arm the watchdog only after the goal is verified.
        writeU8Verified(id, kAddrBusWatchdog, 0U) &&
        (params_.tilt.position_p_gain == 0U ||
         writeU16Verified(id, kAddrPositionPGain,
                          params_.tilt.position_p_gain)) &&
        writeU16Verified(id, kAddrGoalPwm,
                         static_cast<uint16_t>(params_.tilt.goal_pwm_limit)) &&
        writeU32Verified(id, kAddrProfileAcceleration,
                         params_.tilt.profile_acceleration) &&
        writeU32Verified(id, kAddrProfileVelocity,
                         params_.tilt.profile_velocity) &&
        writeU32Verified(id, kAddrGoalPosition,
                         static_cast<uint32_t>(device.home_position_raw)) &&
        writeU8Verified(id, kAddrBusWatchdog,
                        params_.tilt.bus_watchdog_20ms);
    if (!configured) {
      ++status_.communication_errors;
      latchFault(TiltServoFault::Communication);
      return false;
    }
  }
  if (!setTorqueEnabled(true)) {
    latchFault(TiltServoFault::Communication);
    return false;
  }
  for (std::size_t index = 0; index < status_.devices.size(); ++index) {
    if (!readDeviceStatus(index, false)) {
      latchFault(TiltServoFault::Communication);
      return false;
    }
    if (!status_.devices[index].torque_enabled) {
      latchFault(TiltServoFault::TorqueState);
      return false;
    }
    if (!deviceStatusSafe(index, false)) {
      return false;
    }
  }
  const uint32_t now_ms = millis();
  last_submit_ms_ = now_ms;
  last_command_write_ms_ = now_ms;
  last_health_poll_ms_ = now_ms;
  last_status_ms_ = now_ms;
  runtime_enabled_ = true;
  status_.runtime_requested = true;
  status_.state = TiltServoState::Armed;
  status_.fault = TiltServoFault::None;
  return true;
#else
  return false;
#endif
}

bool TiltPlaneServoInterface::readDeviceStatus(
    std::size_t index,
    bool include_identity) {
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  if (index >= status_.devices.size()) {
    return false;
  }
  auto& device = status_.devices[index];
  bool ok = true;
  if (include_identity) {
    ok = ping(device.id, device.model_number);
    uint8_t mode = 0U;
    ok = readRegister(device.id, kAddrOperatingMode, 1U, &mode, 1U) && ok;
    device.operating_mode = mode;
  }
  uint8_t torque = 0U;
  const bool torque_ok =
      readRegister(device.id, kAddrTorqueEnable, 1U, &torque, 1U);
  ok = torque_ok && ok;
  if (torque_ok) {
    device.torque_enabled = torque != 0U;
  }
  uint8_t hardware_error = 0U;
  const bool hardware_error_ok =
      readRegister(device.id, kAddrHardwareError, 1U, &hardware_error, 1U);
  ok = hardware_error_ok && ok;
  if (hardware_error_ok) {
    device.hardware_error = hardware_error;
  }
  std::array<uint8_t, kMotionStatusLength> motion{};
  const bool motion_ok = readRegister(
      device.id, kAddrGoalPosition, static_cast<uint16_t>(motion.size()),
      motion.data(), motion.size());
  ok = motion_ok && ok;
  if (motion_ok) {
    // 116..146 is one contiguous control-table read: Goal Position,
    // Realtime Tick, Moving/Moving Status, Present PWM/Current/Velocity/
    // Position, trajectory fields, voltage, and temperature.
    device.goal_position_raw = readLe32Signed(&motion[0]);
    device.present_pwm_raw = static_cast<int16_t>(readLe16(&motion[8]));
    device.present_current_ma = static_cast<int16_t>(readLe16(&motion[10]));
    device.present_position_raw = readLe32Signed(&motion[16]);
    device.input_voltage_decivolt = readLe16(&motion[28]);
    device.temperature_c = motion[30];
  }
  device.status_valid = ok;
  if (!ok) {
    ++status_.communication_errors;
  }
  return ok;
#else
  (void)index;
  (void)include_identity;
  return true;
#endif
}

bool TiltPlaneServoInterface::deviceStatusSafe(
    std::size_t index,
    bool require_torque_off) {
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  const auto& device = status_.devices[index];
  TiltServoFault fault = TiltServoFault::None;
  if (!device.status_valid) {
    fault = TiltServoFault::Communication;
  } else if (require_torque_off && device.torque_enabled) {
    fault = TiltServoFault::TorqueState;
  } else if (device.hardware_error != 0U) {
    fault = TiltServoFault::HardwareError;
  } else if (std::abs(static_cast<int32_t>(device.present_current_ma)) >
             params_.tilt.abort_current_ma) {
    fault = TiltServoFault::OverCurrent;
  } else if (device.temperature_c > params_.tilt.abort_temperature_c) {
    fault = TiltServoFault::OverTemperature;
  } else if (device.input_voltage_decivolt < params_.tilt.min_voltage_decivolt ||
             device.input_voltage_decivolt > params_.tilt.max_voltage_decivolt) {
    fault = TiltServoFault::SupplyVoltage;
  } else if (!require_torque_off) {
    const int32_t minimum_goal =
        device.home_position_raw - params_.tilt.max_travel_pulses;
    const int32_t maximum_goal =
        device.home_position_raw + params_.tilt.max_travel_pulses;
    const int32_t minimum_position =
        minimum_goal - kPositionEnvelopeTolerancePulses;
    const int32_t maximum_position =
        maximum_goal + kPositionEnvelopeTolerancePulses;
    if (device.goal_position_raw < minimum_goal ||
        device.goal_position_raw > maximum_goal ||
        device.present_position_raw < minimum_position ||
        device.present_position_raw > maximum_position) {
      fault = TiltServoFault::PositionRange;
    }
  }
  if (fault != TiltServoFault::None) {
    latchFault(fault);
    return false;
  }
#else
  (void)index;
  (void)require_torque_off;
#endif
  return true;
}

bool TiltPlaneServoInterface::writeGoalPositions() {
#if HAPTICS_ENABLE_TILT_SERVO && HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  auto goalFor = [&](std::size_t index, float angle_deg, int8_t direction) {
    const int32_t logical_pulses =
        static_cast<int32_t>(std::lround(angle_deg / kDegreesPerPulse));
    const int32_t bounded = std::max(
        -params_.tilt.max_travel_pulses,
        std::min(logical_pulses, params_.tilt.max_travel_pulses));
    return status_.devices[index].home_position_raw + direction * bounded;
  };
  status_.devices[0].commanded_position_raw =
      goalFor(0U, last_command_.thumb_angle_deg,
              params_.tilt.thumb_raw_direction);
  status_.devices[1].commanded_position_raw =
      goalFor(1U, last_command_.index_angle_deg,
              params_.tilt.index_raw_direction);
  return syncWriteGoalPositions(
      status_.devices[0].id, status_.devices[0].commanded_position_raw,
      status_.devices[1].id, status_.devices[1].commanded_position_raw);
#else
  return true;
#endif
}

void TiltPlaneServoInterface::refreshAges(uint32_t now_ms) {
  status_.command_age_ms = now_ms - last_submit_ms_;
  status_.status_age_ms =
      last_status_ms_ == 0U ? UINT32_MAX : now_ms - last_status_ms_;
}

}  // namespace haptics
