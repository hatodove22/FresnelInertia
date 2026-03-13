#include "haptics/TiltPlaneServoInterface.hpp"

#include <Arduino.h>

#ifndef HAPTICS_ENABLE_TILT_SERVO
#define HAPTICS_ENABLE_TILT_SERVO 0
#endif

namespace haptics {
namespace {

#if HAPTICS_ENABLE_TILT_SERVO
HardwareSerial& kTiltSerial = Serial1;
constexpr uint8_t kInstructionWrite = 0x03;
constexpr uint16_t kAddrOperatingMode = 11;
constexpr uint16_t kAddrTorqueEnable = 64;
constexpr uint16_t kAddrGoalCurrent = 102;
constexpr uint16_t kAddrGoalPosition = 116;
constexpr uint8_t kModePosition = 3;
constexpr uint8_t kModeCurrentBasedPosition = 5;

uint16_t updateCrc(uint16_t crc_accum, const uint8_t* data_blk_ptr, uint16_t data_blk_size) {
  static const uint16_t crc_table[256] = {
      0x0000, 0x8005, 0x800F, 0x000A, 0x801B, 0x001E, 0x0014, 0x8011, 0x8033, 0x0036, 0x003C, 0x8039,
      0x0028, 0x802D, 0x8027, 0x0022, 0x8063, 0x0066, 0x006C, 0x8069, 0x0078, 0x807D, 0x8077, 0x0072,
      0x0050, 0x8055, 0x805F, 0x005A, 0x804B, 0x004E, 0x0044, 0x8041, 0x80C3, 0x00C6, 0x00CC, 0x80C9,
      0x00D8, 0x80DD, 0x80D7, 0x00D2, 0x00F0, 0x80F5, 0x80FF, 0x00FA, 0x80EB, 0x00EE, 0x00E4, 0x80E1,
      0x00A0, 0x80A5, 0x80AF, 0x00AA, 0x80BB, 0x00BE, 0x00B4, 0x80B1, 0x8093, 0x0096, 0x009C, 0x8099,
      0x0088, 0x808D, 0x8087, 0x0082, 0x8183, 0x0186, 0x018C, 0x8189, 0x0198, 0x819D, 0x8197, 0x0192,
      0x01B0, 0x81B5, 0x81BF, 0x01BA, 0x81AB, 0x01AE, 0x01A4, 0x81A1, 0x01E0, 0x81E5, 0x81EF, 0x01EA,
      0x81FB, 0x01FE, 0x01F4, 0x81F1, 0x81D3, 0x01D6, 0x01DC, 0x81D9, 0x01C8, 0x81CD, 0x81C7, 0x01C2,
      0x0140, 0x8145, 0x814F, 0x014A, 0x815B, 0x015E, 0x0154, 0x8151, 0x8173, 0x0176, 0x017C, 0x8179,
      0x0168, 0x816D, 0x8167, 0x0162, 0x8123, 0x0126, 0x012C, 0x8129, 0x0138, 0x813D, 0x8137, 0x0132,
      0x0110, 0x8115, 0x811F, 0x011A, 0x810B, 0x010E, 0x0104, 0x8101, 0x8303, 0x0306, 0x030C, 0x8309,
      0x0318, 0x831D, 0x8317, 0x0312, 0x0330, 0x8335, 0x833F, 0x033A, 0x832B, 0x032E, 0x0324, 0x8321,
      0x0360, 0x8365, 0x836F, 0x036A, 0x837B, 0x037E, 0x0374, 0x8371, 0x8353, 0x0356, 0x035C, 0x8359,
      0x0348, 0x834D, 0x8347, 0x0342, 0x03C0, 0x83C5, 0x83CF, 0x03CA, 0x83DB, 0x03DE, 0x03D4, 0x83D1,
      0x83F3, 0x03F6, 0x03FC, 0x83F9, 0x03E8, 0x83ED, 0x83E7, 0x03E2, 0x83A3, 0x03A6, 0x03AC, 0x83A9,
      0x03B8, 0x83BD, 0x83B7, 0x03B2, 0x0390, 0x8395, 0x839F, 0x039A, 0x838B, 0x038E, 0x0384, 0x8381,
      0x0280, 0x8285, 0x828F, 0x028A, 0x829B, 0x029E, 0x0294, 0x8291, 0x82B3, 0x02B6, 0x02BC, 0x82B9,
      0x02A8, 0x82AD, 0x82A7, 0x02A2, 0x82E3, 0x02E6, 0x02EC, 0x82E9, 0x02F8, 0x82FD, 0x82F7, 0x02F2,
      0x02D0, 0x82D5, 0x82DF, 0x02DA, 0x82CB, 0x02CE, 0x02C4, 0x82C1, 0x8243, 0x0246, 0x024C, 0x8249,
      0x0258, 0x825D, 0x8257, 0x0252, 0x0270, 0x8275, 0x827F, 0x027A, 0x826B, 0x026E, 0x0264, 0x8261,
      0x0220, 0x8225, 0x822F, 0x022A, 0x823B, 0x023E, 0x0234, 0x8231, 0x8213, 0x0216, 0x021C, 0x8219,
      0x0208, 0x820D, 0x8207, 0x0202};

  for (uint16_t j = 0; j < data_blk_size; ++j) {
    const uint16_t i = ((crc_accum >> 8) ^ data_blk_ptr[j]) & 0xFF;
    crc_accum = (crc_accum << 8) ^ crc_table[i];
  }
  return crc_accum;
}

float clampf(float value, float lo, float hi) {
  return std::max(lo, std::min(value, hi));
}

uint32_t degreesToRaw(float degrees) {
  const float wrapped = clampf(degrees, -180.0f, 180.0f);
  return static_cast<uint32_t>((wrapped + 180.0f) * (4095.0f / 360.0f));
}

uint16_t currentToRaw(float current_ma) {
  return static_cast<uint16_t>(clampf(current_ma, 0.0f, 1000.0f));
}

void sendPacket(uint8_t id, const uint8_t* params, uint16_t param_len, int dir_pin) {
  const uint16_t length = param_len + 3;
  uint8_t packet[64]{0xFF, 0xFF, 0xFD, 0x00, id, static_cast<uint8_t>(length & 0xFF),
                      static_cast<uint8_t>((length >> 8) & 0xFF), kInstructionWrite};
  for (uint16_t i = 0; i < param_len; ++i) {
    packet[8 + i] = params[i];
  }
  const uint16_t crc = updateCrc(0, packet, 8 + param_len);
  packet[8 + param_len] = static_cast<uint8_t>(crc & 0xFF);
  packet[9 + param_len] = static_cast<uint8_t>((crc >> 8) & 0xFF);

  digitalWrite(dir_pin, HIGH);
  delayMicroseconds(20);
  kTiltSerial.write(packet, 10 + param_len);
  kTiltSerial.flush();
  delayMicroseconds(20);
  digitalWrite(dir_pin, LOW);
}

void writeRegister(uint8_t id, uint16_t address, const uint8_t* data, uint16_t length, int dir_pin) {
  uint8_t params[32]{};
  params[0] = static_cast<uint8_t>(address & 0xFF);
  params[1] = static_cast<uint8_t>((address >> 8) & 0xFF);
  for (uint16_t i = 0; i < length; ++i) {
    params[2 + i] = data[i];
  }
  sendPacket(id, params, static_cast<uint16_t>(length + 2), dir_pin);
}

void writeU8(uint8_t id, uint16_t address, uint8_t value, int dir_pin) {
  writeRegister(id, address, &value, 1, dir_pin);
}

void writeU16(uint8_t id, uint16_t address, uint16_t value, int dir_pin) {
  uint8_t data[2] = {static_cast<uint8_t>(value & 0xFF), static_cast<uint8_t>((value >> 8) & 0xFF)};
  writeRegister(id, address, data, 2, dir_pin);
}

void writeU32(uint8_t id, uint16_t address, uint32_t value, int dir_pin) {
  uint8_t data[4] = {
      static_cast<uint8_t>(value & 0xFF),
      static_cast<uint8_t>((value >> 8) & 0xFF),
      static_cast<uint8_t>((value >> 16) & 0xFF),
      static_cast<uint8_t>((value >> 24) & 0xFF),
  };
  writeRegister(id, address, data, 4, dir_pin);
}
#endif

}  // namespace

bool TiltPlaneServoInterface::begin(const SystemParams& params) {
  params_ = params;
  enabled_ = HAPTICS_ENABLE_TILT_SERVO != 0;
  runtime_enabled_ = enabled_ && params.features.enable_tilt_plane;
  last_command_ = {};
  last_submit_ms_ = millis();

#if HAPTICS_ENABLE_TILT_SERVO
  pinMode(params_.pins.dynamixel_direction, OUTPUT);
  digitalWrite(params_.pins.dynamixel_direction, LOW);
  kTiltSerial.begin(params_.tilt.bus_baud, SERIAL_8N1, params_.pins.dynamixel_halfduplex_data, params_.pins.dynamixel_halfduplex_data);
  if (runtime_enabled_) {
    configure(params_);
    home();
  }
#endif
  return true;
}

void TiltPlaneServoInterface::configure(const SystemParams& params) {
  params_ = params;
  runtime_enabled_ = enabled_ && params.features.enable_tilt_plane;

#if HAPTICS_ENABLE_TILT_SERVO
  if (!runtime_enabled_) {
    return;
  }

  const uint8_t operating_mode =
      params_.tilt.current_based_position_mode ? kModeCurrentBasedPosition : kModePosition;
  for (const uint8_t servo_id : {params_.tilt.thumb_servo_id, params_.tilt.index_servo_id}) {
    writeU8(servo_id, kAddrTorqueEnable, 0, params_.pins.dynamixel_direction);
    writeU8(servo_id, kAddrOperatingMode, operating_mode, params_.pins.dynamixel_direction);
    writeU8(servo_id, kAddrTorqueEnable, 1, params_.pins.dynamixel_direction);
  }
#endif
}

void TiltPlaneServoInterface::setRuntimeEnabled(bool enabled) {
  runtime_enabled_ = enabled_ && enabled;
}

void TiltPlaneServoInterface::home() {
  TiltPlaneCommand command{};
  command.thumb_angle_deg = params_.tilt.thumb_home_deg;
  command.index_angle_deg = params_.tilt.index_home_deg;
  command.thumb_current_limit_ma = params_.tilt.max_current_ma * 0.25f;
  command.index_current_limit_ma = params_.tilt.max_current_ma * 0.25f;
  submit(command);
}

void TiltPlaneServoInterface::submit(const TiltPlaneCommand& command) {
  if (!enabled_ || !runtime_enabled_) {
    return;
  }

#if HAPTICS_ENABLE_TILT_SERVO
  const uint32_t now_ms = millis();
  const float dt_s = std::max(0.010f, (now_ms - last_submit_ms_) * 1.0e-3f);
  last_submit_ms_ = now_ms;

  auto clampAngle = [&](float target_deg, float last_deg) {
    const float bounded =
        clampf(target_deg, params_.tilt.min_angle_deg + params_.tilt.thumb_home_deg, params_.tilt.max_angle_deg + params_.tilt.thumb_home_deg);
    const float max_step = params_.tilt.max_velocity_deg_s * dt_s;
    return clampf(bounded, last_deg - max_step, last_deg + max_step);
  };

  const float thumb_angle = clampAngle(command.thumb_angle_deg, last_command_.thumb_angle_deg);
  const float index_angle = clampAngle(command.index_angle_deg, last_command_.index_angle_deg);
  const float thumb_current = clampf(command.thumb_current_limit_ma, 0.0f, params_.tilt.max_current_ma);
  const float index_current = clampf(command.index_current_limit_ma, 0.0f, params_.tilt.max_current_ma);

  writeU16(params_.tilt.thumb_servo_id, kAddrGoalCurrent, currentToRaw(thumb_current), params_.pins.dynamixel_direction);
  writeU16(params_.tilt.index_servo_id, kAddrGoalCurrent, currentToRaw(index_current), params_.pins.dynamixel_direction);
  writeU32(params_.tilt.thumb_servo_id, kAddrGoalPosition, degreesToRaw(thumb_angle), params_.pins.dynamixel_direction);
  writeU32(params_.tilt.index_servo_id, kAddrGoalPosition, degreesToRaw(index_angle), params_.pins.dynamixel_direction);

  last_command_ = command;
  last_command_.thumb_angle_deg = thumb_angle;
  last_command_.index_angle_deg = index_angle;
  last_command_.thumb_current_limit_ma = thumb_current;
  last_command_.index_current_limit_ma = index_current;
#else
  (void)command;
#endif
}

}  // namespace haptics
