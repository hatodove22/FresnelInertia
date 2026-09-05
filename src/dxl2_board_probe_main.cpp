#include <Arduino.h>
#include <M5Unified.h>

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>

#include "haptics/Dxl2BoardProbeConfig.h"

namespace {

using haptics::dxl2_probe::kDesignBaud;
using haptics::dxl2_probe::kDefaultBaud;
using haptics::dxl2_probe::kDxlRxPin;
using haptics::dxl2_probe::kDxlTxPin;
using haptics::dxl2_probe::kExpectedXl330M077Model;
using haptics::dxl2_probe::kMotionAbortCurrentMa;
using haptics::dxl2_probe::kMotionAbortTemperatureC;
using haptics::dxl2_probe::kMotionBusWatchdog20Ms;
using haptics::dxl2_probe::kMotionGoalPwmLimit;
using haptics::dxl2_probe::kMotionMaxVoltageDecivolt;
using haptics::dxl2_probe::kMotionMinVoltageDecivolt;
using haptics::dxl2_probe::kMotionPositionTolerancePulses;
using haptics::dxl2_probe::kMotionPositionPGain;
using haptics::dxl2_probe::kMotionProfileAcceleration;
using haptics::dxl2_probe::kMotionProfileVelocity;
using haptics::dxl2_probe::kMotionTravelPulses;
using haptics::dxl2_probe::kQuickScanLastId;
using haptics::dxl2_probe::kTorqueOffValue;

constexpr uint8_t kBroadcastId = 0xFE;
constexpr uint8_t kStatusInstruction = 0x55;
constexpr uint8_t kPingInstruction = 0x01;
constexpr uint8_t kReadInstruction = 0x02;
constexpr uint8_t kWriteInstruction = 0x03;
constexpr uint16_t kAddrId = 7;
constexpr uint16_t kAddrDriveMode = 10;
constexpr uint16_t kAddrOperatingMode = 11;
constexpr uint16_t kAddrHomingOffset = 20;
constexpr uint16_t kAddrPwmLimit = 36;
constexpr uint16_t kAddrMaxPositionLimit = 48;
constexpr uint16_t kAddrMinPositionLimit = 52;
constexpr uint16_t kAddrTorqueEnable = 64;
constexpr uint16_t kAddrHardwareError = 70;
constexpr uint16_t kAddrPositionDGain = 80;
constexpr uint16_t kAddrPositionIGain = 82;
constexpr uint16_t kAddrPositionPGain = 84;
constexpr uint16_t kAddrFeedforward2ndGain = 88;
constexpr uint16_t kAddrFeedforward1stGain = 90;
constexpr uint16_t kAddrBusWatchdog = 98;
constexpr uint16_t kAddrGoalPwm = 100;
constexpr uint16_t kAddrProfileAcceleration = 108;
constexpr uint16_t kAddrProfileVelocity = 112;
constexpr uint16_t kAddrGoalPosition = 116;
constexpr uint16_t kAddrMoving = 122;
constexpr uint16_t kAddrPresentPwm = 124;
constexpr uint16_t kAddrPresentCurrent = 126;
constexpr uint16_t kPresentStatusLength = 21;
constexpr uint32_t kStatusTimeoutMs = 45;
constexpr size_t kMaxDevices = 16;
constexpr size_t kMaxPacketBytes = 128;
constexpr std::array<uint32_t, 2> kProbeBauds{kDefaultBaud, kDesignBaud};

HardwareSerial& g_dxl = Serial1;
uint32_t g_active_baud = 0;
char g_console_buffer[48]{};
size_t g_console_length = 0;

struct StatusPacket {
  uint8_t id = 0;
  uint8_t error = 0;
  std::array<uint8_t, 64> params{};
  size_t param_length = 0;
};

struct DeviceInfo {
  bool valid = false;
  uint8_t id = 0;
  uint32_t baud = 0;
  uint16_t model_number = 0;
  uint8_t firmware_version = 0;
  bool torque_read_valid = false;
  bool torque_enabled = false;
  bool torque_off_confirmed = false;
  bool status_valid = false;
  bool control_config_valid = false;
  uint8_t drive_mode = 0;
  uint8_t operating_mode = 0;
  uint8_t hardware_error = 0;
  int32_t homing_offset_raw = 0;
  uint16_t pwm_limit_raw = 0;
  uint16_t position_d_gain = 0;
  uint16_t position_i_gain = 0;
  uint16_t position_p_gain = 0;
  uint16_t feedforward_2nd_gain = 0;
  uint16_t feedforward_1st_gain = 0;
  uint8_t bus_watchdog = 0;
  int16_t goal_pwm_raw = 0;
  uint32_t profile_acceleration = 0;
  uint32_t profile_velocity = 0;
  int32_t goal_position_raw = 0;
  int32_t min_position_limit_raw = 0;
  int32_t max_position_limit_raw = 0;
  int16_t present_pwm_raw = 0;
  int16_t present_current_ma = 0;
  int32_t present_position_raw = 0;
  float input_voltage_v = 0.0f;
  uint8_t temperature_c = 0;
};

std::array<DeviceInfo, kMaxDevices> g_devices{};
size_t g_device_count = 0;

uint16_t updateCrc(uint16_t crc, const uint8_t* data, size_t length) {
  for (size_t i = 0; i < length; ++i) {
    crc ^= static_cast<uint16_t>(data[i]) << 8;
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc & 0x8000u) != 0u ? static_cast<uint16_t>((crc << 1) ^ 0x8005u)
                                  : static_cast<uint16_t>(crc << 1);
    }
  }
  return crc;
}

uint16_t readLe16(const uint8_t* data) {
  return static_cast<uint16_t>(data[0]) | (static_cast<uint16_t>(data[1]) << 8);
}

int32_t readLe32Signed(const uint8_t* data) {
  const uint32_t raw = static_cast<uint32_t>(data[0]) |
                       (static_cast<uint32_t>(data[1]) << 8) |
                       (static_cast<uint32_t>(data[2]) << 16) |
                       (static_cast<uint32_t>(data[3]) << 24);
  return static_cast<int32_t>(raw);
}

#if DXL2_MOTION_TEST_ENABLE
void writeLe16(uint8_t* output, uint16_t value) {
  output[0] = static_cast<uint8_t>(value & 0xFF);
  output[1] = static_cast<uint8_t>((value >> 8) & 0xFF);
}

void writeLe32(uint8_t* output, uint32_t value) {
  output[0] = static_cast<uint8_t>(value & 0xFF);
  output[1] = static_cast<uint8_t>((value >> 8) & 0xFF);
  output[2] = static_cast<uint8_t>((value >> 16) & 0xFF);
  output[3] = static_cast<uint8_t>((value >> 24) & 0xFF);
}

int32_t absDifference(int32_t lhs, int32_t rhs) {
  const int64_t difference = static_cast<int64_t>(lhs) - static_cast<int64_t>(rhs);
  return static_cast<int32_t>(difference < 0 ? -difference : difference);
}
#endif

void drainDxlInput() {
  while (g_dxl.available() > 0) {
    g_dxl.read();
  }
}

void beginDxlBus(uint32_t baud) {
  if (g_active_baud == baud) {
    drainDxlInput();
    return;
  }

  if (g_active_baud != 0) {
    g_dxl.end();
    delay(2);
  }

  // The DXL2 PCB handles half-duplex direction in hardware. GPIO1 is TX and
  // GPIO2 is the always-on echo/status RX path. No direction GPIO is used.
  g_dxl.begin(baud, SERIAL_8N1, kDxlRxPin, kDxlTxPin);
  g_active_baud = baud;
  delay(3);
  drainDxlInput();
}

bool sendInstruction(uint8_t id, uint8_t instruction, const uint8_t* params, size_t param_length) {
  if ((param_length > 0 && params == nullptr) ||
      param_length > kMaxPacketBytes - 10) {
    return false;
  }

  std::array<uint8_t, kMaxPacketBytes> packet{};
  packet[0] = 0xFF;
  packet[1] = 0xFF;
  packet[2] = 0xFD;
  packet[3] = 0x00;
  packet[4] = id;
  packet[7] = instruction;

  size_t used = 8;
  for (size_t i = 0; i < param_length; ++i) {
    if (used + 3 > packet.size()) {
      return false;
    }
    packet[used++] = params[i];
    if (used >= 10 && packet[used - 3] == 0xFF &&
        packet[used - 2] == 0xFF && packet[used - 1] == 0xFD) {
      packet[used++] = 0xFD;
    }
  }
  const uint16_t protocol_length = static_cast<uint16_t>(used - 7 + 2);
  packet[5] = static_cast<uint8_t>(protocol_length & 0xFF);
  packet[6] = static_cast<uint8_t>((protocol_length >> 8) & 0xFF);
  const uint16_t crc = updateCrc(0, packet.data(), used);
  packet[used++] = static_cast<uint8_t>(crc & 0xFF);
  packet[used++] = static_cast<uint8_t>((crc >> 8) & 0xFF);

  drainDxlInput();
  const size_t written = g_dxl.write(packet.data(), used);
  g_dxl.flush();
  return written == used;
}

struct RawFrame {
  std::array<uint8_t, kMaxPacketBytes> bytes{};
  size_t size = 0;
};

bool readFrame(RawFrame& frame, uint32_t timeout_ms) {
  const uint32_t start_ms = millis();
  size_t used = 0;
  size_t expected = 0;

  while (millis() - start_ms < timeout_ms) {
    while (g_dxl.available() > 0) {
      const int raw = g_dxl.read();
      if (raw < 0) {
        break;
      }
      const uint8_t value = static_cast<uint8_t>(raw);

      if (used == 0) {
        if (value == 0xFF) {
          frame.bytes[used++] = value;
        }
        continue;
      }
      if (used == 1) {
        if (value == 0xFF) {
          frame.bytes[used++] = value;
        } else {
          used = 0;
        }
        continue;
      }
      if (used == 2) {
        if (value == 0xFD) {
          frame.bytes[used++] = value;
        } else if (value == 0xFF) {
          frame.bytes[0] = 0xFF;
          frame.bytes[1] = 0xFF;
          used = 2;
        } else {
          used = 0;
        }
        continue;
      }
      if (used == 3) {
        if (value == 0x00) {
          frame.bytes[used++] = value;
        } else {
          used = value == 0xFF ? 1 : 0;
          if (used == 1) {
            frame.bytes[0] = 0xFF;
          }
        }
        continue;
      }

      if (used >= frame.bytes.size()) {
        used = 0;
        expected = 0;
        continue;
      }
      frame.bytes[used++] = value;

      if (used == 7) {
        const uint16_t protocol_length = readLe16(&frame.bytes[5]);
        expected = 7 + protocol_length;
        if (protocol_length < 3 || expected > frame.bytes.size()) {
          used = 0;
          expected = 0;
        }
      }

      if (expected != 0 && used == expected) {
        const uint16_t received_crc = readLe16(&frame.bytes[expected - 2]);
        const uint16_t calculated_crc = updateCrc(0, frame.bytes.data(), expected - 2);
        if (received_crc == calculated_crc) {
          frame.size = expected;
          return true;
        }
        used = 0;
        expected = 0;
      }
    }
    delay(1);
  }
  return false;
}

bool waitForStatus(uint8_t expected_id, StatusPacket& status, uint32_t timeout_ms = kStatusTimeoutMs) {
  const uint32_t start_ms = millis();
  while (millis() - start_ms < timeout_ms) {
    const uint32_t elapsed_ms = millis() - start_ms;
    RawFrame frame{};
    if (!readFrame(frame, std::max<uint32_t>(1, timeout_ms - elapsed_ms))) {
      return false;
    }

    // The DXL2 receiver is always enabled, so the transmitted instruction is
    // echoed first. Ignore it and wait for the 0x55 status packet.
    if (frame.size < 11 || frame.bytes[7] != kStatusInstruction || frame.bytes[4] != expected_id) {
      continue;
    }

    status.id = frame.bytes[4];
    status.error = frame.bytes[8];
    status.param_length = 0;
    const size_t param_end = frame.size - 2;
    for (size_t i = 9; i < param_end; ++i) {
      if (status.param_length >= status.params.size()) {
        return false;
      }
      status.params[status.param_length++] = frame.bytes[i];
      if (i >= 11 && i + 1 < param_end &&
          frame.bytes[i - 2] == 0xFF && frame.bytes[i - 1] == 0xFF &&
          frame.bytes[i] == 0xFD && frame.bytes[i + 1] == 0xFD) {
        ++i;
      }
    }
    return true;
  }
  return false;
}

bool ping(uint8_t id, DeviceInfo& device) {
  if (!sendInstruction(id, kPingInstruction, nullptr, 0)) {
    return false;
  }

  StatusPacket status{};
  if (!waitForStatus(id, status) || status.error != 0 || status.param_length < 3) {
    return false;
  }

  device.valid = true;
  device.id = id;
  device.baud = g_active_baud;
  device.model_number = readLe16(status.params.data());
  device.firmware_version = status.params[2];
  return true;
}

bool readRegister(uint8_t id, uint16_t address, uint16_t length, uint8_t* output, size_t output_size) {
  if (output == nullptr || length > output_size) {
    return false;
  }

  const uint8_t params[4] = {
      static_cast<uint8_t>(address & 0xFF),
      static_cast<uint8_t>((address >> 8) & 0xFF),
      static_cast<uint8_t>(length & 0xFF),
      static_cast<uint8_t>((length >> 8) & 0xFF),
  };
  if (!sendInstruction(id, kReadInstruction, params, sizeof(params))) {
    return false;
  }

  StatusPacket status{};
  if (!waitForStatus(id, status) || status.error != 0 || status.param_length < length) {
    return false;
  }
  std::memcpy(output, status.params.data(), length);
  return true;
}

#if DXL2_MOTION_TEST_ENABLE
bool writeRegisterVerified(
    uint8_t id,
    uint16_t address,
    const uint8_t* value,
    size_t value_length) {
  if (value == nullptr || value_length == 0 || value_length > 4) {
    return false;
  }

  std::array<uint8_t, 6> params{};
  params[0] = static_cast<uint8_t>(address & 0xFF);
  params[1] = static_cast<uint8_t>((address >> 8) & 0xFF);
  std::memcpy(&params[2], value, value_length);
  if (!sendInstruction(id, kWriteInstruction, params.data(), value_length + 2)) {
    return false;
  }

  // Status Return Level may suppress the write response, so verify the RAM
  // register directly instead of depending on that response.
  StatusPacket write_status{};
  const bool received_write_status = waitForStatus(id, write_status, 15);
  if (received_write_status && write_status.error != 0) {
    Serial.printf(
        "DXL WRITE STATUS ERROR ID%u addr=%u error=0x%02X.\n",
        static_cast<unsigned>(id),
        static_cast<unsigned>(address),
        static_cast<unsigned>(write_status.error));
    return false;
  }

  // The half-duplex receiver occasionally misses the first verification reply.
  // Retry reads only; never repeat the write or accept an unverified value.
  for (uint8_t attempt = 0; attempt < 3; ++attempt) {
    std::array<uint8_t, 4> readback{};
    if (readRegister(
            id,
            address,
            static_cast<uint16_t>(value_length),
            readback.data(),
            readback.size())) {
      return std::memcmp(value, readback.data(), value_length) == 0;
    }
    delay(3);
  }
  return false;
}

bool writeRegisterU8(uint8_t id, uint16_t address, uint8_t value) {
  return writeRegisterVerified(id, address, &value, 1);
}

bool writeRegisterU16(uint8_t id, uint16_t address, uint16_t value) {
  std::array<uint8_t, 2> encoded{};
  writeLe16(encoded.data(), value);
  return writeRegisterVerified(id, address, encoded.data(), encoded.size());
}

bool writeRegisterU32(uint8_t id, uint16_t address, uint32_t value) {
  std::array<uint8_t, 4> encoded{};
  writeLe32(encoded.data(), value);
  return writeRegisterVerified(id, address, encoded.data(), encoded.size());
}
#endif

bool writeTorqueOff(uint8_t id) {
  const uint8_t params[3] = {
      static_cast<uint8_t>(kAddrTorqueEnable & 0xFF),
      static_cast<uint8_t>((kAddrTorqueEnable >> 8) & 0xFF),
      kTorqueOffValue,
  };
  if (!sendInstruction(id, kWriteInstruction, params, sizeof(params))) {
    return false;
  }

  // A write status packet is optional depending on Status Return Level. Drain
  // it when present, then verify Torque Enable by reading the register.
  StatusPacket ignored{};
  waitForStatus(id, ignored, 15);
  uint8_t torque_enable = 0xFF;
  return readRegister(id, kAddrTorqueEnable, 1, &torque_enable, 1) && torque_enable == 0;
}

#if DXL2_PROVISION_ID_ENABLE
bool writeDeviceId(uint8_t source_id, uint8_t target_id) {
  const uint8_t params[3] = {
      static_cast<uint8_t>(kAddrId & 0xFF),
      static_cast<uint8_t>((kAddrId >> 8) & 0xFF),
      target_id,
  };
  if (!sendInstruction(source_id, kWriteInstruction, params, sizeof(params))) {
    return false;
  }

  // The status packet may use the old or new ID depending on when the EEPROM
  // change takes effect. Allow it to drain, then verify through the new ID.
  StatusPacket ignored{};
  waitForStatus(source_id, ignored, 30);
  delay(80);

  DeviceInfo target{};
  if (!ping(target_id, target)) {
    return false;
  }
  uint8_t stored_id = 0xFF;
  return readRegister(target_id, kAddrId, 1, &stored_id, 1) && stored_id == target_id;
}
#endif

void sendBroadcastTorqueOffAtActiveBaud() {
  const uint8_t params[3] = {
      static_cast<uint8_t>(kAddrTorqueEnable & 0xFF),
      static_cast<uint8_t>((kAddrTorqueEnable >> 8) & 0xFF),
      kTorqueOffValue,
  };
  sendInstruction(kBroadcastId, kWriteInstruction, params, sizeof(params));
  delay(3);
  drainDxlInput();
}

void emergencyTorqueOff() {
  for (const uint32_t baud : kProbeBauds) {
    beginDxlBus(baud);
    sendBroadcastTorqueOffAtActiveBaud();
  }
  Serial.println("SAFE STOP: broadcast torque-off sent at 57600 and 1000000 bps.");
}

void readDeviceStatus(DeviceInfo& device) {
  beginDxlBus(device.baud);

  std::array<uint8_t, 2> identity_config{};
  const bool identity_config_valid = readRegister(
      device.id, kAddrDriveMode, identity_config.size(),
      identity_config.data(), identity_config.size());
  if (identity_config_valid) {
    device.drive_mode = identity_config[0];
    device.operating_mode = identity_config[1];
  }

  std::array<uint8_t, 4> encoded32{};
  const bool homing_offset_valid = readRegister(
      device.id, kAddrHomingOffset, encoded32.size(), encoded32.data(),
      encoded32.size());
  if (homing_offset_valid) {
    device.homing_offset_raw = readLe32Signed(encoded32.data());
  }

  std::array<uint8_t, 2> encoded16{};
  const bool pwm_limit_valid = readRegister(
      device.id, kAddrPwmLimit, encoded16.size(), encoded16.data(),
      encoded16.size());
  if (pwm_limit_valid) {
    device.pwm_limit_raw = readLe16(encoded16.data());
  }

  std::array<uint8_t, 8> position_limits{};
  const bool position_limits_valid = readRegister(
      device.id, kAddrMaxPositionLimit, position_limits.size(),
      position_limits.data(), position_limits.size());
  if (position_limits_valid) {
    device.max_position_limit_raw = readLe32Signed(&position_limits[0]);
    device.min_position_limit_raw = readLe32Signed(&position_limits[4]);
  }

  uint8_t torque = 0;
  device.torque_read_valid = readRegister(device.id, kAddrTorqueEnable, 1, &torque, 1);
  device.torque_enabled = device.torque_read_valid && torque != 0;
  device.torque_off_confirmed = device.torque_read_valid && torque == 0;

  std::array<uint8_t, 12> position_gains{};
  const bool position_gains_valid = readRegister(
      device.id, kAddrPositionDGain, position_gains.size(),
      position_gains.data(), position_gains.size());
  if (position_gains_valid) {
    device.position_d_gain = readLe16(&position_gains[0]);
    device.position_i_gain = readLe16(&position_gains[2]);
    device.position_p_gain = readLe16(&position_gains[4]);
    device.feedforward_2nd_gain = readLe16(&position_gains[8]);
    device.feedforward_1st_gain = readLe16(&position_gains[10]);
  }

  uint8_t hardware_error = 0;
  const bool error_valid = readRegister(device.id, kAddrHardwareError, 1, &hardware_error, 1);
  if (error_valid) {
    device.hardware_error = hardware_error;
  }

  std::array<uint8_t, 6> command_limits{};
  const bool command_limits_valid = readRegister(
      device.id, kAddrBusWatchdog, command_limits.size(),
      command_limits.data(), command_limits.size());
  if (command_limits_valid) {
    device.bus_watchdog = command_limits[0];
    device.goal_pwm_raw = static_cast<int16_t>(readLe16(&command_limits[2]));
  }

  std::array<uint8_t, 12> profile_and_goal{};
  const bool profile_and_goal_valid = readRegister(
      device.id, kAddrProfileAcceleration, profile_and_goal.size(),
      profile_and_goal.data(), profile_and_goal.size());
  if (profile_and_goal_valid) {
    device.profile_acceleration =
        static_cast<uint32_t>(readLe32Signed(&profile_and_goal[0]));
    device.profile_velocity =
        static_cast<uint32_t>(readLe32Signed(&profile_and_goal[4]));
    device.goal_position_raw = readLe32Signed(&profile_and_goal[8]);
  }

  std::array<uint8_t, kPresentStatusLength + 2> present{};
  const bool present_valid = readRegister(
      device.id,
      kAddrPresentPwm,
      present.size(),
      present.data(),
      present.size());
  if (present_valid) {
    device.present_pwm_raw = static_cast<int16_t>(readLe16(&present[0]));
    device.present_current_ma = static_cast<int16_t>(readLe16(&present[2]));
    device.present_position_raw = readLe32Signed(&present[8]);
    device.input_voltage_v = readLe16(&present[20]) * 0.1f;
    device.temperature_c = present[22];
  }
  device.control_config_valid =
      identity_config_valid && homing_offset_valid && pwm_limit_valid &&
      position_limits_valid && position_gains_valid && command_limits_valid &&
      profile_and_goal_valid;
  device.status_valid = device.torque_read_valid && identity_config_valid &&
                        error_valid && present_valid &&
                        device.control_config_valid;
}

#if DXL2_MOTION_TEST_ENABLE
struct MotionSample {
  uint8_t moving = 0;
  uint8_t moving_status = 0;
  int16_t present_pwm = 0;
  int16_t present_current_ma = 0;
  int32_t present_velocity_raw = 0;
  int32_t present_position_raw = 0;
  uint16_t input_voltage_decivolt = 0;
  uint8_t temperature_c = 0;
  uint8_t hardware_error = 0;
};

bool readMotionSample(uint8_t id, MotionSample& sample) {
  std::array<uint8_t, 25> data{};
  if (!readRegister(id, kAddrMoving, data.size(), data.data(), data.size())) {
    return false;
  }
  uint8_t hardware_error = 0;
  if (!readRegister(id, kAddrHardwareError, 1, &hardware_error, 1)) {
    return false;
  }

  sample.moving = data[0];
  sample.moving_status = data[1];
  sample.present_pwm = static_cast<int16_t>(readLe16(&data[kAddrPresentPwm - kAddrMoving]));
  sample.present_current_ma =
      static_cast<int16_t>(readLe16(&data[kAddrPresentCurrent - kAddrMoving]));
  sample.present_velocity_raw = readLe32Signed(&data[6]);
  sample.present_position_raw = readLe32Signed(&data[10]);
  sample.input_voltage_decivolt = readLe16(&data[22]);
  sample.temperature_c = data[24];
  sample.hardware_error = hardware_error;
  return true;
}

bool motionSampleIsSafe(uint8_t id, const MotionSample& sample) {
  const int32_t absolute_current = sample.present_current_ma < 0
                                       ? -static_cast<int32_t>(sample.present_current_ma)
                                       : static_cast<int32_t>(sample.present_current_ma);
  const bool safe = absolute_current <= kMotionAbortCurrentMa &&
                    sample.temperature_c <= kMotionAbortTemperatureC &&
                    sample.input_voltage_decivolt >= kMotionMinVoltageDecivolt &&
                    sample.input_voltage_decivolt <= kMotionMaxVoltageDecivolt &&
                    sample.hardware_error == 0;
  if (!safe) {
    Serial.printf(
        "MOTION ABORT ID%u: current=%ldmA voltage=%.1fV temp=%uC hwerr=0x%02X\n",
        static_cast<unsigned>(id),
        static_cast<long>(absolute_current),
        sample.input_voltage_decivolt * 0.1f,
        static_cast<unsigned>(sample.temperature_c),
        static_cast<unsigned>(sample.hardware_error));
  }
  return safe;
}

bool waitForMotionTarget(
    uint8_t id,
    int32_t target,
    int32_t minimum_safe_position,
    int32_t maximum_safe_position,
    const char* phase,
    int32_t& maximum_current_ma) {
  const uint32_t start_ms = millis();
  uint32_t last_log_ms = 0;
  while (millis() - start_ms < 4000) {
    MotionSample sample{};
    if (!readMotionSample(id, sample)) {
      Serial.printf("MOTION ABORT ID%u %s: status read failed.\n",
                    static_cast<unsigned>(id), phase);
      return false;
    }
    if (!motionSampleIsSafe(id, sample)) {
      return false;
    }
    if (sample.present_position_raw < minimum_safe_position ||
        sample.present_position_raw > maximum_safe_position) {
      Serial.printf(
          "MOTION ABORT ID%u %s: pos=%ld outside guarded envelope [%ld,%ld].\n",
          static_cast<unsigned>(id), phase,
          static_cast<long>(sample.present_position_raw),
          static_cast<long>(minimum_safe_position),
          static_cast<long>(maximum_safe_position));
      return false;
    }

    const int32_t absolute_current = sample.present_current_ma < 0
                                         ? -static_cast<int32_t>(sample.present_current_ma)
                                         : static_cast<int32_t>(sample.present_current_ma);
    maximum_current_ma = std::max(maximum_current_ma, absolute_current);
    if (millis() - last_log_ms >= 200) {
      Serial.printf(
          "MOTION ID%u %s pos=%ld target=%ld current=%ldmA pwm=%d moving=%u %.1fV %uC\n",
          static_cast<unsigned>(id),
          phase,
          static_cast<long>(sample.present_position_raw),
          static_cast<long>(target),
          static_cast<long>(absolute_current),
          static_cast<int>(sample.present_pwm),
          static_cast<unsigned>(sample.moving),
          sample.input_voltage_decivolt * 0.1f,
          static_cast<unsigned>(sample.temperature_c));
      last_log_ms = millis();
    }

    if (absDifference(sample.present_position_raw, target) <= kMotionPositionTolerancePulses &&
        sample.moving == 0) {
      return true;
    }
    delay(20);
  }

  Serial.printf("MOTION ABORT ID%u %s: 4 s timeout.\n",
                static_cast<unsigned>(id), phase);
  return false;
}
#endif

bool alreadyRecorded(uint8_t id, uint32_t baud) {
  for (size_t i = 0; i < g_device_count; ++i) {
    if (g_devices[i].id == id && g_devices[i].baud == baud) {
      return true;
    }
  }
  return false;
}

void printDevice(const DeviceInfo& device) {
  Serial.printf(
      "DXL id=%u baud=%lu model=%u fw=%u torque=%s off_confirmed=%u "
      "drive=0x%02X mode=%u vin=%.1fV temp=%uC pwm=%d current=%dmA "
      "pos=%ld goal=%ld hwerr=0x%02X status=%u cfg=%u\n",
      static_cast<unsigned>(device.id),
      static_cast<unsigned long>(device.baud),
      static_cast<unsigned>(device.model_number),
      static_cast<unsigned>(device.firmware_version),
      device.torque_read_valid ? (device.torque_enabled ? "ON" : "OFF") : "?",
      static_cast<unsigned>(device.torque_off_confirmed),
      static_cast<unsigned>(device.drive_mode),
      static_cast<unsigned>(device.operating_mode),
      device.input_voltage_v,
      static_cast<unsigned>(device.temperature_c),
      static_cast<int>(device.present_pwm_raw),
      static_cast<int>(device.present_current_ma),
      static_cast<long>(device.present_position_raw),
      static_cast<long>(device.goal_position_raw),
      static_cast<unsigned>(device.hardware_error),
      static_cast<unsigned>(device.status_valid),
      static_cast<unsigned>(device.control_config_valid));
  Serial.printf(
      "  control: homing=%ld limits=[%ld,%ld] pwm_limit=%u goal_pwm=%d "
      "profile=(%lu,%lu) PID=(P%u I%u D%u) FF=(1st%u 2nd%u) watchdog=%u\n",
      static_cast<long>(device.homing_offset_raw),
      static_cast<long>(device.min_position_limit_raw),
      static_cast<long>(device.max_position_limit_raw),
      static_cast<unsigned>(device.pwm_limit_raw),
      static_cast<int>(device.goal_pwm_raw),
      static_cast<unsigned long>(device.profile_acceleration),
      static_cast<unsigned long>(device.profile_velocity),
      static_cast<unsigned>(device.position_p_gain),
      static_cast<unsigned>(device.position_i_gain),
      static_cast<unsigned>(device.position_d_gain),
      static_cast<unsigned>(device.feedforward_1st_gain),
      static_cast<unsigned>(device.feedforward_2nd_gain),
      static_cast<unsigned>(device.bus_watchdog));
}

void drawSummary(const char* heading) {
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(4, 4);
  M5.Display.println("DXL2 SAFE PROBE");
  M5.Display.setTextColor(TFT_CYAN, TFT_BLACK);
  M5.Display.println(heading);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.printf("TX:G1 RX:G2\nfound: %u\n", static_cast<unsigned>(g_device_count));

  const size_t shown = std::min<size_t>(g_device_count, 3);
  for (size_t i = 0; i < shown; ++i) {
    const auto& device = g_devices[i];
    M5.Display.printf("ID%u %luk\n", static_cast<unsigned>(device.id),
                      static_cast<unsigned long>(device.baud / 1000));
    M5.Display.printf("%s %.1fV %uC\n",
                      device.torque_off_confirmed ? "OFF" : "CHECK",
                      device.input_voltage_v,
                      static_cast<unsigned>(device.temperature_c));
  }

  M5.Display.setTextColor(TFT_YELLOW, TFT_BLACK);
  M5.Display.println("click: scan");
  M5.Display.println("hold: SAFE STOP");
}

#if DXL2_PROVISION_ID_ENABLE
void runIdProvisioning() {
  constexpr uint8_t source_id = DXL2_PROVISION_SOURCE_ID;
  constexpr uint8_t target_id = DXL2_PROVISION_TARGET_ID;

  g_devices.fill(DeviceInfo{});
  g_device_count = 0;
  drawSummary("VERIFY ID CHANGE");
  Serial.printf("ID PROVISION: source=%u target=%u baud=%lu expected_model=%u\n",
                static_cast<unsigned>(source_id),
                static_cast<unsigned>(target_id),
                static_cast<unsigned long>(kDefaultBaud),
                static_cast<unsigned>(kExpectedXl330M077Model));
  Serial.println("Requirement: exactly one XL330 must be connected; torque-on is never sent.");

  emergencyTorqueOff();
  beginDxlBus(kDefaultBaud);

  DeviceInfo source{};
  DeviceInfo target{};
  const bool source_found = ping(source_id, source);
  const bool target_found = ping(target_id, target);

  if (source_found && target_found) {
    Serial.println("ID PROVISION ABORT: both source and target IDs responded.");
    drawSummary("ABORT: ID COLLISION");
    return;
  }
  if (!source_found && !target_found) {
    Serial.println("ID PROVISION ABORT: neither source nor target ID responded at 57600 bps.");
    drawSummary("ABORT: NOT FOUND");
    return;
  }

  if (source_found) {
    if (source.model_number != kExpectedXl330M077Model) {
      Serial.printf("ID PROVISION ABORT: unexpected model=%u.\n",
                    static_cast<unsigned>(source.model_number));
      drawSummary("ABORT: WRONG MODEL");
      return;
    }
    if (!writeTorqueOff(source_id)) {
      Serial.println("ID PROVISION ABORT: could not confirm source torque OFF.");
      drawSummary("ABORT: TORQUE CHECK");
      return;
    }

    Serial.printf("Writing EEPROM ID %u -> %u...\n",
                  static_cast<unsigned>(source_id),
                  static_cast<unsigned>(target_id));
    if (!writeDeviceId(source_id, target_id)) {
      Serial.println("ID PROVISION FAIL: target ID did not verify after write.");
      drawSummary("FAIL: ID VERIFY");
      return;
    }
  } else {
    Serial.println("Target ID already responds; no EEPROM write needed.");
  }

  beginDxlBus(kDefaultBaud);
  DeviceInfo verified{};
  if (!ping(target_id, verified) || verified.model_number != kExpectedXl330M077Model) {
    Serial.println("ID PROVISION FAIL: target identity/model verification failed.");
    drawSummary("FAIL: TARGET VERIFY");
    return;
  }

  const bool target_off = writeTorqueOff(target_id);
  readDeviceStatus(verified);
  DeviceInfo old_id_check{};
  const bool old_id_still_present = ping(source_id, old_id_check);
  verified.torque_off_confirmed = target_off && verified.torque_off_confirmed;
  verified.status_valid = verified.status_valid && !old_id_still_present;
  printDevice(verified);

  if (!verified.torque_off_confirmed || old_id_still_present || !verified.status_valid) {
    Serial.printf("ID PROVISION FAIL: torque_off=%u old_id_present=%u status=%u.\n",
                  static_cast<unsigned>(verified.torque_off_confirmed),
                  static_cast<unsigned>(old_id_still_present),
                  static_cast<unsigned>(verified.status_valid));
    drawSummary("FAIL: FINAL CHECK");
    return;
  }

  g_devices[0] = verified;
  g_device_count = 1;
  Serial.printf("ID PROVISION PASS: ID %u -> %u, model=%u, torque OFF confirmed.\n",
                static_cast<unsigned>(source_id),
                static_cast<unsigned>(target_id),
                static_cast<unsigned>(verified.model_number));
  drawSummary("ID 2 READY");
}
#endif

#if DXL2_MOTION_TEST_ENABLE
bool g_motion_test_attempted = false;

void stopMotionTestBus(uint8_t id) {
  beginDxlBus(kDefaultBaud);
  writeTorqueOff(id);
  writeRegisterU8(id, kAddrBusWatchdog, 0);
  emergencyTorqueOff();
}

bool runSingleServoMotion(uint8_t id, DeviceInfo& final_device) {
  beginDxlBus(kDefaultBaud);
  DeviceInfo identity{};
  if (!ping(id, identity) || identity.model_number != kExpectedXl330M077Model) {
    Serial.printf("MOTION ABORT ID%u: expected model 1190 not found.\n",
                  static_cast<unsigned>(id));
    return false;
  }
  if (!writeTorqueOff(id)) {
    Serial.printf("MOTION ABORT ID%u: torque OFF could not be confirmed.\n",
                  static_cast<unsigned>(id));
    return false;
  }
  // A servo can retain a watchdog value left by another firmware until its own
  // power cycle. Normalize that RAM state before writing the pre-arm goal.
  if (!writeRegisterU8(id, kAddrBusWatchdog, 0)) {
    Serial.printf("MOTION ABORT ID%u: retained Bus Watchdog could not be cleared.\n",
                  static_cast<unsigned>(id));
    return false;
  }

  uint8_t drive_mode = 0xFF;
  uint8_t operating_mode = 0xFF;
  std::array<uint8_t, 4> encoded{};
  if (!readRegister(id, kAddrDriveMode, 1, &drive_mode, 1) ||
      !readRegister(id, kAddrOperatingMode, 1, &operating_mode, 1) ||
      operating_mode != 3 || (drive_mode & 0x08u) != 0u) {
    Serial.printf("MOTION ABORT ID%u: mode=%u drive=0x%02X; require position mode 3 and auto-torque disabled.\n",
                  static_cast<unsigned>(id),
                  static_cast<unsigned>(operating_mode),
                  static_cast<unsigned>(drive_mode));
    return false;
  }

  uint32_t maximum_position = 0;
  uint32_t minimum_position = 0;
  if (!readRegister(id, kAddrMaxPositionLimit, 4, encoded.data(), encoded.size())) {
    return false;
  }
  maximum_position = static_cast<uint32_t>(readLe32Signed(encoded.data()));
  if (!readRegister(id, kAddrMinPositionLimit, 4, encoded.data(), encoded.size())) {
    return false;
  }
  minimum_position = static_cast<uint32_t>(readLe32Signed(encoded.data()));
  if (maximum_position > 4095 || minimum_position > maximum_position) {
    Serial.printf("MOTION ABORT ID%u: invalid position limits min=%lu max=%lu.\n",
                  static_cast<unsigned>(id),
                  static_cast<unsigned long>(minimum_position),
                  static_cast<unsigned long>(maximum_position));
    return false;
  }

  MotionSample initial{};
  if (!readMotionSample(id, initial) || !motionSampleIsSafe(id, initial) ||
      initial.present_position_raw < static_cast<int32_t>(minimum_position) ||
      initial.present_position_raw > static_cast<int32_t>(maximum_position)) {
    Serial.printf("MOTION ABORT ID%u: unsafe initial status or position.\n",
                  static_cast<unsigned>(id));
    return false;
  }

  const auto requireSetupWrite = [id](bool succeeded, const char* label, uint16_t address) {
    if (!succeeded) {
      Serial.printf(
          "MOTION SETUP WRITE FAIL ID%u: %s (addr=%u).\n",
          static_cast<unsigned>(id),
          label,
          static_cast<unsigned>(address));
      if (address == kAddrGoalPosition) {
        std::array<uint8_t, 4> goal_raw{};
        uint8_t watchdog_raw = 0xFF;
        const bool goal_read = readRegister(
            id, kAddrGoalPosition, goal_raw.size(), goal_raw.data(), goal_raw.size());
        const bool watchdog_read =
            readRegister(id, kAddrBusWatchdog, 1, &watchdog_raw, 1);
        Serial.printf(
            "MOTION SETUP STATE ID%u: goal=%s%ld watchdog=%s%u.\n",
            static_cast<unsigned>(id),
            goal_read ? "" : "read-fail/",
            static_cast<long>(goal_read ? readLe32Signed(goal_raw.data()) : 0),
            watchdog_read ? "" : "read-fail/",
            static_cast<unsigned>(watchdog_read ? watchdog_raw : 0));
      }
    }
    return succeeded;
  };
  const bool position_gain_configured =
      kMotionPositionPGain == 0U ||
      requireSetupWrite(
          writeRegisterU16(id, kAddrPositionPGain, kMotionPositionPGain),
          "Position P Gain",
          kAddrPositionPGain);
  if (!position_gain_configured ||
      !requireSetupWrite(
          writeRegisterU32(id, kAddrProfileAcceleration, kMotionProfileAcceleration),
          "Profile Acceleration",
          kAddrProfileAcceleration) ||
      !requireSetupWrite(
          writeRegisterU32(id, kAddrProfileVelocity, kMotionProfileVelocity),
          "Profile Velocity",
          kAddrProfileVelocity) ||
      !requireSetupWrite(
          writeRegisterU16(id, kAddrGoalPwm, static_cast<uint16_t>(kMotionGoalPwmLimit)),
          "Goal PWM",
          kAddrGoalPwm) ||
      !requireSetupWrite(
          writeRegisterU32(
              id,
              kAddrGoalPosition,
              static_cast<uint32_t>(initial.present_position_raw)),
          "Goal Position",
          kAddrGoalPosition) ||
      !requireSetupWrite(
          writeRegisterU8(id, kAddrBusWatchdog, kMotionBusWatchdog20Ms),
          "Bus Watchdog",
          kAddrBusWatchdog)) {
    Serial.printf("MOTION ABORT ID%u: conservative RAM setup failed; exact register logged above.\n",
                  static_cast<unsigned>(id));
    stopMotionTestBus(id);
    return false;
  }

  if (!writeRegisterU8(id, kAddrTorqueEnable, 1)) {
    Serial.printf("MOTION ABORT ID%u: torque ON read-back failed.\n",
                  static_cast<unsigned>(id));
    stopMotionTestBus(id);
    return false;
  }
  delay(30);

  MotionSample armed{};
  if (!readMotionSample(id, armed) || !motionSampleIsSafe(id, armed)) {
    stopMotionTestBus(id);
    return false;
  }

  const int32_t home = armed.present_position_raw;
  int32_t target = home;
  if (home + kMotionTravelPulses <= static_cast<int32_t>(maximum_position)) {
    target = home + kMotionTravelPulses;
  } else if (home - kMotionTravelPulses >= static_cast<int32_t>(minimum_position)) {
    target = home - kMotionTravelPulses;
  } else {
    Serial.printf("MOTION ABORT ID%u: no safe %ld-pulse travel inside limits.\n",
                  static_cast<unsigned>(id),
                  static_cast<long>(kMotionTravelPulses));
    stopMotionTestBus(id);
    return false;
  }

  Serial.printf(
      "MOTION START ID%u: home=%ld target=%ld travel=%ld pulses (%.2f deg), profile=(%lu,%lu), p_gain=%u, pwm_limit=%d.\n",
      static_cast<unsigned>(id),
      static_cast<long>(home),
      static_cast<long>(target),
      static_cast<long>(target - home),
      static_cast<double>(absDifference(target, home) * 0.088f),
      static_cast<unsigned long>(kMotionProfileAcceleration),
      static_cast<unsigned long>(kMotionProfileVelocity),
      static_cast<unsigned>(kMotionPositionPGain),
      static_cast<int>(kMotionGoalPwmLimit));

  const int32_t minimum_safe_position = std::max(
      static_cast<int32_t>(minimum_position),
      std::min(home, target) - kMotionPositionTolerancePulses);
  const int32_t maximum_safe_position = std::min(
      static_cast<int32_t>(maximum_position),
      std::max(home, target) + kMotionPositionTolerancePulses);
  int32_t maximum_current_ma = 0;
  if (!writeRegisterU32(id, kAddrGoalPosition, static_cast<uint32_t>(target)) ||
      !waitForMotionTarget(id, target, minimum_safe_position,
                           maximum_safe_position, "out", maximum_current_ma)) {
    stopMotionTestBus(id);
    return false;
  }
  delay(150);
  if (!writeRegisterU32(id, kAddrGoalPosition, static_cast<uint32_t>(home)) ||
      !waitForMotionTarget(id, home, minimum_safe_position,
                           maximum_safe_position, "home", maximum_current_ma)) {
    stopMotionTestBus(id);
    return false;
  }

  beginDxlBus(kDefaultBaud);
  const bool torque_off = writeTorqueOff(id);
  const bool watchdog_cleared = writeRegisterU8(id, kAddrBusWatchdog, 0);
  readDeviceStatus(identity);
  final_device = identity;
  if (!torque_off || !watchdog_cleared || !identity.torque_off_confirmed ||
      !identity.status_valid || identity.hardware_error != 0 ||
      absDifference(identity.present_position_raw, home) > kMotionPositionTolerancePulses) {
    Serial.printf("MOTION FAIL ID%u: final safety/read-back check failed.\n",
                  static_cast<unsigned>(id));
    emergencyTorqueOff();
    return false;
  }

  Serial.printf(
      "MOTION PASS ID%u: returned=%ld max_current=%ldmA voltage=%.1fV temp=%uC torque=OFF.\n",
      static_cast<unsigned>(id),
      static_cast<long>(identity.present_position_raw),
      static_cast<long>(maximum_current_ma),
      identity.input_voltage_v,
      static_cast<unsigned>(identity.temperature_c));
  return true;
}

void runMotionTest() {
  if (g_motion_test_attempted) {
    Serial.println("MOTION LOCKED: this boot already attempted motion. Reset to run again.");
    return;
  }
  g_motion_test_attempted = true;
  Serial.println("MOTION TEST ARMED BY EXPLICIT GO: sequential ID1 then ID2, one excursion each.");
  drawSummary("MOTION TEST RUNNING");

  emergencyTorqueOff();
  beginDxlBus(kDefaultBaud);
  DeviceInfo first_identity{};
  DeviceInfo second_identity{};
  if (!ping(1, first_identity) || !ping(2, second_identity) ||
      first_identity.model_number != kExpectedXl330M077Model ||
      second_identity.model_number != kExpectedXl330M077Model) {
    Serial.println("MOTION ABORT: IDs 1 and 2 must both be model 1190 at 57600 bps.");
    emergencyTorqueOff();
    drawSummary("MOTION ABORT");
    return;
  }

  DeviceInfo first_final{};
  DeviceInfo second_final{};
  if (!runSingleServoMotion(1, first_final) || !runSingleServoMotion(2, second_final)) {
    emergencyTorqueOff();
    drawSummary("MOTION FAIL / OFF");
    return;
  }

  emergencyTorqueOff();
  g_devices.fill(DeviceInfo{});
  g_devices[0] = first_final;
  g_devices[1] = second_final;
  g_device_count = 2;
  Serial.println("MOTION TEST PASS: both servos returned home; broadcast torque OFF sent.");
  drawSummary("MOTION PASS / OFF");
}
#endif

void scanDevices(uint8_t last_id) {
  g_devices.fill(DeviceInfo{});
  g_device_count = 0;
  drawSummary(last_id == 0xFC ? "FULL SCAN..." : "SCAN 0..10...");
  Serial.printf("Scanning DYNAMIXEL Protocol 2.0 IDs 0..%u (torque-on is never sent).\n",
                static_cast<unsigned>(last_id));

  emergencyTorqueOff();

  for (const uint32_t baud : kProbeBauds) {
    beginDxlBus(baud);
    Serial.printf("scan baud=%lu\n", static_cast<unsigned long>(baud));
    for (uint16_t raw_id = 0; raw_id <= last_id; ++raw_id) {
      const uint8_t id = static_cast<uint8_t>(raw_id);
      DeviceInfo device{};
      if (!ping(id, device) || alreadyRecorded(id, baud)) {
        continue;
      }

      device.torque_off_confirmed = writeTorqueOff(id);
      readDeviceStatus(device);
      if (g_device_count < g_devices.size()) {
        g_devices[g_device_count++] = device;
      }
      printDevice(device);
    }
  }

  if (g_device_count == 0) {
    Serial.println("No DYNAMIXEL found. Check power-off wiring, ID, baud, and J9/J10 pin order.");
    drawSummary("NO SERVO FOUND");
  } else {
    Serial.printf("Scan complete: %u device(s). All detected devices were commanded torque OFF.\n",
                  static_cast<unsigned>(g_device_count));
    drawSummary("SCAN COMPLETE");
  }
}

void refreshKnownDevices() {
  if (g_device_count == 0) {
    Serial.println("No known devices. Run 'scan' first.");
    return;
  }
  for (size_t i = 0; i < g_device_count; ++i) {
    readDeviceStatus(g_devices[i]);
    printDevice(g_devices[i]);
  }
  drawSummary("STATUS UPDATED");
}

void printHelp() {
  Serial.println("Commands:");
#if DXL2_MOTION_TEST_ENABLE
  Serial.println("  go         - run one locked, sequential 3.52-degree out-and-home test");
  Serial.println("  torqueoff  - broadcast torque OFF at both supported baud rates");
  Serial.println("  help       - print this list");
  Serial.println("Motion never starts at boot; explicit 'go' or one button click is required.");
#else
  Serial.println("  scan       - scan IDs 0..10 at 57600 and 1000000 bps");
  Serial.println("  scan all   - scan IDs 0..252 (slow, still read-only apart from torque OFF)");
  Serial.println("  status     - re-read detected servo status");
  Serial.println("  torqueoff  - broadcast torque OFF at both supported baud rates");
  Serial.println("  help       - print this list");
  Serial.println("This probe has no torque-on or motion command.");
#endif
}

void handleConsoleCommand(const char* command) {
#if DXL2_MOTION_TEST_ENABLE
  if (std::strcmp(command, "go") == 0) {
    runMotionTest();
  } else if (std::strcmp(command, "torqueoff") == 0) {
    emergencyTorqueOff();
    drawSummary("SAFE STOP SENT");
  } else if (std::strcmp(command, "help") == 0 || std::strcmp(command, "?") == 0) {
    printHelp();
  } else if (command[0] != '\0') {
    Serial.printf("Unknown command: %s\n", command);
    printHelp();
  }
#else
  if (std::strcmp(command, "scan") == 0) {
    scanDevices(kQuickScanLastId);
  } else if (std::strcmp(command, "scan all") == 0) {
    scanDevices(0xFC);
  } else if (std::strcmp(command, "status") == 0) {
    refreshKnownDevices();
  } else if (std::strcmp(command, "torqueoff") == 0) {
    emergencyTorqueOff();
    refreshKnownDevices();
  } else if (std::strcmp(command, "help") == 0 || std::strcmp(command, "?") == 0) {
    printHelp();
  } else if (command[0] != '\0') {
    Serial.printf("Unknown command: %s\n", command);
    printHelp();
  }
#endif
}

void pollConsole() {
  while (Serial.available() > 0) {
    const int raw = Serial.read();
    if (raw < 0) {
      return;
    }
    const char ch = static_cast<char>(raw);
    if (ch == '\r' || ch == '\n') {
      if (g_console_length > 0) {
        g_console_buffer[g_console_length] = '\0';
        handleConsoleCommand(g_console_buffer);
        g_console_length = 0;
      }
      continue;
    }
    if (g_console_length + 1 < sizeof(g_console_buffer)) {
      g_console_buffer[g_console_length++] = ch;
    }
  }
}

}  // namespace

void setup() {
  auto config = M5.config();
  config.fallback_board = m5::board_t::board_M5AtomS3;
  config.internal_imu = false;
  config.internal_rtc = false;
  config.internal_mic = false;
  config.output_power = false;
  M5.begin(config);

  Serial.begin(115200);
  const uint32_t serial_wait_start = millis();
  while (!Serial && millis() - serial_wait_start < 1200) {
    delay(10);
  }

  pinMode(kDxlTxPin, OUTPUT);
  digitalWrite(kDxlTxPin, HIGH);
  g_dxl.setRxBufferSize(512);

  M5.Display.setRotation(0);
  drawSummary("BOOT SAFE");

  Serial.println();
#if DXL2_PROVISION_ID_ENABLE
  Serial.println("DXL2 one-shot ID provisioner started.");
  Serial.println("Safety: only EEPROM ID and torque OFF may be written; no motion command exists.");
  runIdProvisioning();
#elif DXL2_MOTION_TEST_ENABLE
  Serial.println("DXL2 unloaded motion probe started.");
  Serial.println("Safety: boot only sends torque OFF; motion requires explicit GO.");
  Serial.println("Plan: ID1 then ID2, 40 pulses (3.52 deg) out-and-home, then torque OFF.");
  emergencyTorqueOff();
  printHelp();
  drawSummary("TYPE GO / CLICK");
#else
  Serial.println("DXL2 board safe probe started.");
  Serial.println("Hardware: AtomS3 GPIO1 TX / GPIO2 RX / automatic half-duplex direction.");
  Serial.println("Safety: torque OFF is sent at boot; no torque-on or goal-position command exists.");
  printHelp();

  scanDevices(kQuickScanLastId);
#endif
}

void loop() {
  M5.update();
  pollConsole();

  if (M5.BtnA.wasHold()) {
    emergencyTorqueOff();
    drawSummary("SAFE STOP SENT");
#if DXL2_PROVISION_ID_ENABLE
  } else if (M5.BtnA.wasClicked()) {
    runIdProvisioning();
#elif DXL2_MOTION_TEST_ENABLE
  } else if (M5.BtnA.wasClicked()) {
    runMotionTest();
#else
  } else if (M5.BtnA.wasClicked()) {
    scanDevices(kQuickScanLastId);
#endif
  }

  delay(2);
}
