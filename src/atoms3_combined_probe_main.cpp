#include "haptics/AtomS3CombinedProbeConfig.h"

#if HAPTICS_ATOMS3_COMBINED_PROBE_ENABLE

#include <Arduino.h>
#include <M5Unified.h>
#include <driver/i2s.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>

namespace {

using namespace haptics::atoms3_combined_probe;

constexpr i2s_port_t kI2sPort = I2S_NUM_0;
constexpr float kTau = 6.28318530717958647692f;
constexpr uint8_t kBroadcastId = 0xFE;
constexpr uint8_t kPingInstruction = 0x01;
constexpr uint8_t kReadInstruction = 0x02;
constexpr uint8_t kWriteInstruction = 0x03;
constexpr uint8_t kStatusInstruction = 0x55;
constexpr uint16_t kAddrDriveMode = 10;
constexpr uint16_t kAddrOperatingMode = 11;
constexpr uint16_t kAddrMaxPositionLimit = 48;
constexpr uint16_t kAddrMinPositionLimit = 52;
constexpr uint16_t kAddrTorqueEnable = 64;
constexpr uint16_t kAddrHardwareError = 70;
constexpr uint16_t kAddrBusWatchdog = 98;
constexpr uint16_t kAddrGoalPwm = 100;
constexpr uint16_t kAddrProfileAcceleration = 108;
constexpr uint16_t kAddrProfileVelocity = 112;
constexpr uint16_t kAddrGoalPosition = 116;
constexpr uint16_t kAddrMoving = 122;
constexpr uint16_t kAddrPresentPwm = 124;
constexpr uint16_t kAddrPresentCurrent = 126;
constexpr uint32_t kStatusTimeoutMs = 45;
constexpr size_t kPacketCapacity = 128;

enum class ProbeMode : uint8_t {
  IdleSilent,
  Running,
  FaultSilent,
};

struct ProbeState {
  ProbeMode mode = ProbeMode::FaultSilent;
  bool i2s_ready = false;
  bool imu_ready = false;
  bool preflight_ready = false;
  float haptic_level = kDefaultHapticLevel;
  uint32_t i2s_blocks = 0;
  uint32_t i2s_errors = 0;
  uint32_t last_i2s_service_us = 0;
  uint32_t max_i2s_service_gap_us = 0;
  bool i2s_gap_fault = false;
  uint64_t tone_sample_cursor = 0;
  float phase = 0.0f;
  uint32_t imu_updates_total = 0;
  uint32_t imu_updates_run = 0;
  uint32_t last_imu_update_ms = 0;
  float max_dynamic_accel_g = 0.0f;
  float max_gyro_dps = 0.0f;
  uint32_t run_started_ms = 0;
  uint32_t successful_runs = 0;
} g_state;

struct StatusPacket {
  uint8_t id = 0;
  uint8_t error = 0;
  std::array<uint8_t, 64> params{};
  size_t param_length = 0;
};

struct RawFrame {
  std::array<uint8_t, kPacketCapacity> bytes{};
  size_t size = 0;
};

struct MotionSample {
  uint8_t moving = 0;
  int16_t present_pwm = 0;
  int16_t present_current_ma = 0;
  int32_t present_position_raw = 0;
  uint16_t input_voltage_decivolt = 0;
  uint8_t temperature_c = 0;
  uint8_t hardware_error = 0;
};

struct ServoPlan {
  uint8_t id = 0;
  int32_t home = 0;
  int32_t target = 0;
  int32_t max_current_ma = 0;
  MotionSample last{};
};

HardwareSerial& g_dxl = Serial1;
std::array<int16_t, kFramesPerBlock * kSlotsPerFrame> g_tdm_block{};
char g_console_buffer[64]{};
size_t g_console_length = 0;

const char* modeName() {
  switch (g_state.mode) {
    case ProbeMode::IdleSilent:
      return "IDLE/SILENT";
    case ProbeMode::Running:
      return "RUNNING";
    case ProbeMode::FaultSilent:
      return "FAULT/SILENT";
  }
  return "UNKNOWN";
}

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
  return static_cast<uint16_t>(data[0]) |
         (static_cast<uint16_t>(data[1]) << 8);
}

int32_t readLe32Signed(const uint8_t* data) {
  const uint32_t value = static_cast<uint32_t>(data[0]) |
                         (static_cast<uint32_t>(data[1]) << 8) |
                         (static_cast<uint32_t>(data[2]) << 16) |
                         (static_cast<uint32_t>(data[3]) << 24);
  return static_cast<int32_t>(value);
}

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

int32_t absoluteDifference(int32_t lhs, int32_t rhs) {
  const int64_t difference = static_cast<int64_t>(lhs) - static_cast<int64_t>(rhs);
  return static_cast<int32_t>(difference < 0 ? -difference : difference);
}

void drainDxlInput() {
  while (g_dxl.available() > 0) {
    g_dxl.read();
  }
}

bool sendInstruction(
    uint8_t id,
    uint8_t instruction,
    const uint8_t* params,
    size_t param_length) {
  const size_t total_length = 10 + param_length;
  if (total_length > kPacketCapacity) {
    return false;
  }

  std::array<uint8_t, kPacketCapacity> packet{};
  const uint16_t protocol_length = static_cast<uint16_t>(param_length + 3);
  packet[0] = 0xFF;
  packet[1] = 0xFF;
  packet[2] = 0xFD;
  packet[3] = 0x00;
  packet[4] = id;
  packet[5] = static_cast<uint8_t>(protocol_length & 0xFF);
  packet[6] = static_cast<uint8_t>((protocol_length >> 8) & 0xFF);
  packet[7] = instruction;
  if (params != nullptr && param_length > 0) {
    std::memcpy(&packet[8], params, param_length);
  }
  const uint16_t crc = updateCrc(0, packet.data(), 8 + param_length);
  packet[8 + param_length] = static_cast<uint8_t>(crc & 0xFF);
  packet[9 + param_length] = static_cast<uint8_t>((crc >> 8) & 0xFF);

  drainDxlInput();
  const size_t written = g_dxl.write(packet.data(), total_length);
  g_dxl.flush();
  return written == total_length;
}

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
        } else if (value != 0xFF) {
          used = 0;
        }
        continue;
      }
      if (used == 3) {
        if (value == 0x00) {
          frame.bytes[used++] = value;
        } else {
          used = 0;
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
        if (received_crc == updateCrc(0, frame.bytes.data(), expected - 2)) {
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

bool waitForStatus(
    uint8_t expected_id,
    StatusPacket& status,
    uint32_t timeout_ms = kStatusTimeoutMs) {
  const uint32_t start_ms = millis();
  while (millis() - start_ms < timeout_ms) {
    const uint32_t elapsed_ms = millis() - start_ms;
    RawFrame frame{};
    if (!readFrame(frame, std::max<uint32_t>(1, timeout_ms - elapsed_ms))) {
      return false;
    }
    if (frame.size < 11 || frame.bytes[7] != kStatusInstruction ||
        frame.bytes[4] != expected_id) {
      continue;
    }
    status.id = frame.bytes[4];
    status.error = frame.bytes[8];
    status.param_length = std::min(status.params.size(), frame.size - 11);
    if (status.param_length > 0) {
      std::memcpy(status.params.data(), &frame.bytes[9], status.param_length);
    }
    return true;
  }
  return false;
}

bool ping(uint8_t id, uint16_t& model) {
  if (!sendInstruction(id, kPingInstruction, nullptr, 0)) {
    return false;
  }
  StatusPacket status{};
  if (!waitForStatus(id, status) || status.error != 0 || status.param_length < 3) {
    return false;
  }
  model = readLe16(status.params.data());
  return true;
}

bool readRegister(
    uint8_t id,
    uint16_t address,
    uint16_t length,
    uint8_t* output,
    size_t output_size) {
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
  if (!waitForStatus(id, status) || status.error != 0 ||
      status.param_length < length) {
    return false;
  }
  std::memcpy(output, status.params.data(), length);
  return true;
}

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
  StatusPacket ignored{};
  waitForStatus(id, ignored, 15);
  std::array<uint8_t, 4> readback{};
  return readRegister(
             id,
             address,
             static_cast<uint16_t>(value_length),
             readback.data(),
             readback.size()) &&
         std::memcmp(value, readback.data(), value_length) == 0;
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

void broadcastTorqueOff() {
  const uint8_t params[3] = {
      static_cast<uint8_t>(kAddrTorqueEnable & 0xFF),
      static_cast<uint8_t>((kAddrTorqueEnable >> 8) & 0xFF),
      0,
  };
  sendInstruction(kBroadcastId, kWriteInstruction, params, sizeof(params));
  delay(3);
  drainDxlInput();
}

bool writeTorqueOff(uint8_t id) {
  return writeRegisterU8(id, kAddrTorqueEnable, 0);
}

bool readMotionSample(uint8_t id, MotionSample& sample) {
  std::array<uint8_t, 25> data{};
  if (!readRegister(id, kAddrMoving, data.size(), data.data(), data.size())) {
    return false;
  }
  if (!readRegister(id, kAddrHardwareError, 1, &sample.hardware_error, 1)) {
    return false;
  }
  sample.moving = data[0];
  sample.present_pwm =
      static_cast<int16_t>(readLe16(&data[kAddrPresentPwm - kAddrMoving]));
  sample.present_current_ma =
      static_cast<int16_t>(readLe16(&data[kAddrPresentCurrent - kAddrMoving]));
  sample.present_position_raw = readLe32Signed(&data[10]);
  sample.input_voltage_decivolt = readLe16(&data[22]);
  sample.temperature_c = data[24];
  return true;
}

bool motionSampleIsSafe(uint8_t id, const MotionSample& sample) {
  const int32_t current = sample.present_current_ma < 0
                              ? -static_cast<int32_t>(sample.present_current_ma)
                              : static_cast<int32_t>(sample.present_current_ma);
  const bool safe = current <= kMotionAbortCurrentMa &&
                    sample.temperature_c <= kMotionAbortTemperatureC &&
                    sample.input_voltage_decivolt >= kMotionMinVoltageDecivolt &&
                    sample.input_voltage_decivolt <= kMotionMaxVoltageDecivolt &&
                    sample.hardware_error == 0;
  if (!safe) {
    Serial.printf(
        "ABORT ID%u safety: current=%ldmA voltage=%.1fV temp=%uC hwerr=0x%02X\n",
        static_cast<unsigned>(id),
        static_cast<long>(current),
        sample.input_voltage_decivolt * 0.1f,
        static_cast<unsigned>(sample.temperature_c),
        static_cast<unsigned>(sample.hardware_error));
  }
  return safe;
}

void fillTdmBlock(bool active) {
  const uint32_t period_samples = std::max<uint32_t>(
      1, (static_cast<uint64_t>(kBurstPeriodMs) * kSampleRateHz) / 1000u);
  const uint32_t burst_samples = std::min<uint32_t>(
      period_samples,
      (static_cast<uint64_t>(kBurstOnMs) * kSampleRateHz) / 1000u);
  const uint32_t ramp_samples = std::min<uint32_t>(
      burst_samples / 2u,
      (static_cast<uint64_t>(kRampMs) * kSampleRateHz) / 1000u);
  const float phase_step = kTau * kToneHz / static_cast<float>(kSampleRateHz);

  for (size_t frame = 0; frame < kFramesPerBlock; ++frame) {
    int16_t value = 0;
    if (active) {
      const uint32_t cycle_sample =
          static_cast<uint32_t>(g_state.tone_sample_cursor % period_samples);
      float envelope = 0.0f;
      if (cycle_sample < burst_samples) {
        envelope = 1.0f;
        if (ramp_samples > 0 && cycle_sample < ramp_samples) {
          envelope = static_cast<float>(cycle_sample) /
                     static_cast<float>(ramp_samples);
        } else if (ramp_samples > 0 &&
                   cycle_sample >= burst_samples - ramp_samples) {
          envelope = static_cast<float>(burst_samples - cycle_sample) /
                     static_cast<float>(ramp_samples);
        }
      }
      const float sample =
          std::sin(g_state.phase) * envelope * g_state.haptic_level;
      value = static_cast<int16_t>(sample * 32767.0f);
      g_state.phase += phase_step;
      if (g_state.phase >= kTau) {
        g_state.phase -= kTau;
      }
      ++g_state.tone_sample_cursor;
    }
    const size_t base = frame * kSlotsPerFrame;
    for (uint8_t slot = 0; slot < kSlotsPerFrame; ++slot) {
      g_tdm_block[base + slot] = active && slot < kDrivenSlots ? value : 0;
    }
  }
}

bool writeTdmBlock(bool active) {
  const uint32_t now_us = micros();
  if (g_state.last_i2s_service_us != 0 && g_state.mode == ProbeMode::Running) {
    const uint32_t gap = now_us - g_state.last_i2s_service_us;
    g_state.max_i2s_service_gap_us =
        std::max(g_state.max_i2s_service_gap_us, gap);
    if (gap > kMaximumI2sServiceGapUs) {
      g_state.i2s_gap_fault = true;
    }
  }

  fillTdmBlock(active);
  size_t bytes_written = 0;
  const esp_err_t result = i2s_write(
      kI2sPort,
      g_tdm_block.data(),
      sizeof(g_tdm_block),
      &bytes_written,
      pdMS_TO_TICKS(40));
  g_state.last_i2s_service_us = micros();
  if (result != ESP_OK || bytes_written != sizeof(g_tdm_block)) {
    ++g_state.i2s_errors;
    return false;
  }
  ++g_state.i2s_blocks;
  return true;
}

bool writeSilenceBlocks(uint8_t count) {
  for (uint8_t i = 0; i < count; ++i) {
    if (!writeTdmBlock(false)) {
      return false;
    }
  }
  return true;
}

bool installTdm() {
  const i2s_channel_t slots = static_cast<i2s_channel_t>(
      I2S_TDM_ACTIVE_CH0 | I2S_TDM_ACTIVE_CH1 | I2S_TDM_ACTIVE_CH2 |
      I2S_TDM_ACTIVE_CH3 | I2S_TDM_ACTIVE_CH4 | I2S_TDM_ACTIVE_CH5 |
      I2S_TDM_ACTIVE_CH6 | I2S_TDM_ACTIVE_CH7);
  const i2s_config_t config = {
      .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = kSampleRateHz,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_MULTIPLE,
      .communication_format = I2S_COMM_FORMAT_STAND_PCM_SHORT,
      .intr_alloc_flags = 0,
      .dma_buf_count = kDmaBufferCount,
      .dma_buf_len = static_cast<int>(kFramesPerBlock),
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0,
      .mclk_multiple = I2S_MCLK_MULTIPLE_256,
      .bits_per_chan = I2S_BITS_PER_CHAN_16BIT,
      .chan_mask = slots,
      .total_chan = kSlotsPerFrame,
      .left_align = false,
      .big_edin = false,
      .bit_order_msb = false,
      .skip_msk = false,
  };
  const i2s_pin_config_t pins = {
      .mck_io_num = I2S_PIN_NO_CHANGE,
      .bck_io_num = kBclkPin,
      .ws_io_num = kLrclkPin,
      .data_out_num = kDataOutPin,
      .data_in_num = I2S_PIN_NO_CHANGE,
  };
  i2s_driver_uninstall(kI2sPort);
  if (i2s_driver_install(kI2sPort, &config, 0, nullptr) != ESP_OK ||
      i2s_set_pin(kI2sPort, &pins) != ESP_OK ||
      i2s_zero_dma_buffer(kI2sPort) != ESP_OK) {
    i2s_driver_uninstall(kI2sPort);
    return false;
  }
  g_state.i2s_ready = true;
  return writeSilenceBlocks(3);
}

void serviceImu() {
  if (!g_state.imu_ready || !M5.Imu.update()) {
    return;
  }
  const auto data = M5.Imu.getImuData();
  const float accel_magnitude = std::sqrt(
      data.accel.x * data.accel.x + data.accel.y * data.accel.y +
      data.accel.z * data.accel.z);
  const float gyro_magnitude = std::sqrt(
      data.gyro.x * data.gyro.x + data.gyro.y * data.gyro.y +
      data.gyro.z * data.gyro.z);
  const float dynamic_accel = std::fabs(accel_magnitude - 1.0f);
  g_state.max_dynamic_accel_g =
      std::max(g_state.max_dynamic_accel_g, dynamic_accel);
  g_state.max_gyro_dps = std::max(g_state.max_gyro_dps, gyro_magnitude);
  ++g_state.imu_updates_total;
  if (g_state.mode == ProbeMode::Running) {
    ++g_state.imu_updates_run;
  }
  g_state.last_imu_update_ms = millis();
}

void drawStatus(const char* message = nullptr) {
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(
      g_state.mode == ProbeMode::FaultSilent ? TFT_RED : TFT_WHITE,
      TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(4, 4);
  M5.Display.println("COMBINED");
  M5.Display.setTextSize(1);
  M5.Display.printf("%s\n", modeName());
  M5.Display.printf("IMU %s n=%lu\n",
                    g_state.imu_ready ? "OK" : "FAIL",
                    static_cast<unsigned long>(g_state.imu_updates_total));
  M5.Display.printf("I2S %s err=%lu\n",
                    g_state.i2s_ready ? "OK" : "FAIL",
                    static_cast<unsigned long>(g_state.i2s_errors));
  M5.Display.printf("4CH %.1f%% 180Hz\n",
                    static_cast<double>(g_state.haptic_level * 100.0f));
  M5.Display.println("DXL ID1+ID2");
  M5.Display.println("S1 OFF=AMP MUTE");
  if (message != nullptr) {
    M5.Display.println(message);
  } else {
    M5.Display.println("check -> go");
  }
}

void printStatus() {
  Serial.printf(
      "combined: mode=%s preflight=%u imu=%u imu_total=%lu imu_run=%lu "
      "i2s=%u blocks=%lu errors=%lu max_gap_us=%lu level=%.3f runs=%lu\n",
      modeName(),
      static_cast<unsigned>(g_state.preflight_ready),
      static_cast<unsigned>(g_state.imu_ready),
      static_cast<unsigned long>(g_state.imu_updates_total),
      static_cast<unsigned long>(g_state.imu_updates_run),
      static_cast<unsigned>(g_state.i2s_ready),
      static_cast<unsigned long>(g_state.i2s_blocks),
      static_cast<unsigned long>(g_state.i2s_errors),
      static_cast<unsigned long>(g_state.max_i2s_service_gap_us),
      static_cast<double>(g_state.haptic_level),
      static_cast<unsigned long>(g_state.successful_runs));
  Serial.printf(
      "imu_peak: dynamic_accel=%.4fg gyro=%.2fdps; amp_switch=manual; "
      "digital_silence=%u\n",
      static_cast<double>(g_state.max_dynamic_accel_g),
      static_cast<double>(g_state.max_gyro_dps),
      static_cast<unsigned>(g_state.mode != ProbeMode::Running));
}

void forceDigitalSilence() {
  g_state.phase = 0.0f;
  g_state.tone_sample_cursor = 0;
  if (g_state.i2s_ready) {
    i2s_zero_dma_buffer(kI2sPort);
    writeSilenceBlocks(2);
  }
}

void safeStopServos() {
  broadcastTorqueOff();
  writeTorqueOff(kServoId1);
  writeTorqueOff(kServoId2);
  writeRegisterU8(kServoId1, kAddrBusWatchdog, 0);
  writeRegisterU8(kServoId2, kAddrBusWatchdog, 0);
}

void enterFault(const char* reason) {
  forceDigitalSilence();
  safeStopServos();
  g_state.mode = ProbeMode::FaultSilent;
  g_state.preflight_ready = false;
  Serial.printf("COMBINED ABORT: %s; digital silence + torque OFF requested.\n",
                reason);
  Serial.println("Turn S1 OFF and remove 12V before inspection.");
  drawStatus("ABORT / S1 OFF");
}

bool serviceCombinedTick(bool haptic_active) {
  if (!writeTdmBlock(haptic_active)) {
    Serial.println("ABORT: I2S write failed.");
    return false;
  }
  serviceImu();
  M5.update();
  if (M5.BtnA.wasHold()) {
    Serial.println("ABORT: operator button hold.");
    return false;
  }
  if (g_state.i2s_gap_fault) {
    Serial.printf("ABORT: I2S service gap exceeded %luus (max=%luus).\n",
                  static_cast<unsigned long>(kMaximumI2sServiceGapUs),
                  static_cast<unsigned long>(g_state.max_i2s_service_gap_us));
    return false;
  }
  const uint32_t now = millis();
  if (now - g_state.run_started_ms >= kCombinedRunWatchdogMs) {
    Serial.println("ABORT: combined run watchdog expired.");
    return false;
  }
  if (g_state.last_imu_update_ms == 0 ||
      now - g_state.last_imu_update_ms > kImuStaleAbortMs) {
    Serial.println("ABORT: IMU data became stale.");
    return false;
  }
  return true;
}

bool inspectAndConfigureServo(uint8_t id, bool prefer_positive, ServoPlan& plan) {
  uint16_t model = 0;
  if (!ping(id, model) || model != kExpectedServoModel || !writeTorqueOff(id)) {
    Serial.printf("CHECK FAIL ID%u: expected model 1190 or torque-off failed.\n",
                  static_cast<unsigned>(id));
    return false;
  }

  uint8_t drive_mode = 0xFF;
  uint8_t operating_mode = 0xFF;
  if (!readRegister(id, kAddrDriveMode, 1, &drive_mode, 1) ||
      !readRegister(id, kAddrOperatingMode, 1, &operating_mode, 1) ||
      operating_mode != 3 || (drive_mode & 0x08u) != 0u) {
    Serial.printf("CHECK FAIL ID%u: mode=%u drive=0x%02X.\n",
                  static_cast<unsigned>(id),
                  static_cast<unsigned>(operating_mode),
                  static_cast<unsigned>(drive_mode));
    return false;
  }

  std::array<uint8_t, 4> encoded{};
  if (!readRegister(id, kAddrMaxPositionLimit, 4, encoded.data(), encoded.size())) {
    return false;
  }
  const int32_t maximum_position = readLe32Signed(encoded.data());
  if (!readRegister(id, kAddrMinPositionLimit, 4, encoded.data(), encoded.size())) {
    return false;
  }
  const int32_t minimum_position = readLe32Signed(encoded.data());

  MotionSample initial{};
  if (minimum_position < 0 || maximum_position > 4095 ||
      minimum_position > maximum_position || !readMotionSample(id, initial) ||
      !motionSampleIsSafe(id, initial) ||
      initial.present_position_raw < minimum_position ||
      initial.present_position_raw > maximum_position) {
    Serial.printf("CHECK FAIL ID%u: unsafe position/limits/status.\n",
                  static_cast<unsigned>(id));
    return false;
  }

  int32_t target = initial.present_position_raw;
  const int32_t preferred = prefer_positive ? kMotionTravelPulses
                                             : -kMotionTravelPulses;
  const int32_t alternate = -preferred;
  if (target + preferred >= minimum_position &&
      target + preferred <= maximum_position) {
    target += preferred;
  } else if (target + alternate >= minimum_position &&
             target + alternate <= maximum_position) {
    target += alternate;
  } else {
    Serial.printf("CHECK FAIL ID%u: no safe 40-pulse travel.\n",
                  static_cast<unsigned>(id));
    return false;
  }

  if (!writeRegisterU32(id, kAddrProfileAcceleration, kMotionProfileAcceleration) ||
      !writeRegisterU32(id, kAddrProfileVelocity, kMotionProfileVelocity) ||
      !writeRegisterU16(id, kAddrGoalPwm,
                        static_cast<uint16_t>(kMotionGoalPwmLimit)) ||
      !writeRegisterU8(id, kAddrBusWatchdog, kMotionBusWatchdog20Ms) ||
      !writeRegisterU32(id, kAddrGoalPosition,
                        static_cast<uint32_t>(initial.present_position_raw))) {
    Serial.printf("CHECK FAIL ID%u: conservative RAM setup failed.\n",
                  static_cast<unsigned>(id));
    return false;
  }

  plan.id = id;
  plan.home = initial.present_position_raw;
  plan.target = target;
  plan.last = initial;
  Serial.printf(
      "SERVO READY ID%u home=%ld target=%ld travel=%ld (%.2fdeg) %.1fV %uC\n",
      static_cast<unsigned>(id),
      static_cast<long>(plan.home),
      static_cast<long>(plan.target),
      static_cast<long>(plan.target - plan.home),
      static_cast<double>(absoluteDifference(plan.target, plan.home) * 0.088f),
      initial.input_voltage_decivolt * 0.1f,
      static_cast<unsigned>(initial.temperature_c));
  return true;
}

bool runPreflight(bool configure_motion, ServoPlan* first, ServoPlan* second) {
  forceDigitalSilence();
  broadcastTorqueOff();
  serviceImu();
  if (!g_state.i2s_ready || !g_state.imu_ready ||
      g_state.last_imu_update_ms == 0 ||
      millis() - g_state.last_imu_update_ms > kImuStaleAbortMs) {
    Serial.println("CHECK FAIL: I2S or IMU not ready.");
    return false;
  }

  ServoPlan local_first{};
  ServoPlan local_second{};
  if (!inspectAndConfigureServo(kServoId1, true, local_first) ||
      !inspectAndConfigureServo(kServoId2, false, local_second)) {
    safeStopServos();
    return false;
  }
  safeStopServos();
  if (configure_motion && first != nullptr && second != nullptr) {
    *first = local_first;
    *second = local_second;
  }
  g_state.preflight_ready = true;
  g_state.mode = ProbeMode::IdleSilent;
  Serial.println("CHECK PASS: IMU live, I2S silent, ID1+ID2 safe and torque OFF.");
  drawStatus("CHECK PASS / OFF");
  return true;
}

void updateServoPeak(ServoPlan& plan) {
  const int32_t current = plan.last.present_current_ma < 0
                              ? -static_cast<int32_t>(plan.last.present_current_ma)
                              : static_cast<int32_t>(plan.last.present_current_ma);
  plan.max_current_ma = std::max(plan.max_current_ma, current);
}

bool waitForBothTargets(
    ServoPlan& first,
    int32_t first_target,
    ServoPlan& second,
    int32_t second_target,
    const char* phase) {
  const uint32_t phase_start_ms = millis();
  uint32_t last_status_ms = 0;
  while (millis() - phase_start_ms < kMotionPhaseTimeoutMs) {
    if (!serviceCombinedTick(true)) {
      return false;
    }
    const uint32_t now = millis();
    if (now - last_status_ms < kServoStatusPeriodMs) {
      continue;
    }
    last_status_ms = now;

    if (!readMotionSample(first.id, first.last) ||
        !serviceCombinedTick(true) ||
        !readMotionSample(second.id, second.last) ||
        !serviceCombinedTick(true)) {
      Serial.printf("ABORT %s: combined status/service failure.\n", phase);
      return false;
    }
    if (!motionSampleIsSafe(first.id, first.last) ||
        !motionSampleIsSafe(second.id, second.last)) {
      return false;
    }
    updateServoPeak(first);
    updateServoPeak(second);
    Serial.printf(
        "RUN %s ID1 pos=%ld/%ld cur=%ldmA %.1fV %uC | "
        "ID2 pos=%ld/%ld cur=%ldmA %.1fV %uC | imu=%lu gap=%luus\n",
        phase,
        static_cast<long>(first.last.present_position_raw),
        static_cast<long>(first_target),
        static_cast<long>(first.max_current_ma),
        first.last.input_voltage_decivolt * 0.1f,
        static_cast<unsigned>(first.last.temperature_c),
        static_cast<long>(second.last.present_position_raw),
        static_cast<long>(second_target),
        static_cast<long>(second.max_current_ma),
        second.last.input_voltage_decivolt * 0.1f,
        static_cast<unsigned>(second.last.temperature_c),
        static_cast<unsigned long>(g_state.imu_updates_run),
        static_cast<unsigned long>(g_state.max_i2s_service_gap_us));

    const bool first_reached =
        absoluteDifference(first.last.present_position_raw, first_target) <=
            kMotionPositionTolerancePulses &&
        first.last.moving == 0;
    const bool second_reached =
        absoluteDifference(second.last.present_position_raw, second_target) <=
            kMotionPositionTolerancePulses &&
        second.last.moving == 0;
    if (first_reached && second_reached) {
      return true;
    }
  }
  Serial.printf("ABORT %s: %lums motion timeout.\n",
                phase,
                static_cast<unsigned long>(kMotionPhaseTimeoutMs));
  return false;
}

bool runActiveHold(uint32_t duration_ms) {
  const uint32_t start_ms = millis();
  while (millis() - start_ms < duration_ms) {
    if (!serviceCombinedTick(true)) {
      return false;
    }
  }
  return true;
}

void runCombinedTest() {
  if (g_state.mode == ProbeMode::Running) {
    Serial.println("GO rejected: test already running.");
    return;
  }

  ServoPlan first{};
  ServoPlan second{};
  if (!runPreflight(true, &first, &second)) {
    enterFault("preflight failed");
    return;
  }
  if (!writeRegisterU8(first.id, kAddrBusWatchdog, kMotionBusWatchdog20Ms) ||
      !writeRegisterU8(second.id, kAddrBusWatchdog, kMotionBusWatchdog20Ms) ||
      !writeRegisterU8(first.id, kAddrTorqueEnable, 1) ||
      !writeRegisterU8(second.id, kAddrTorqueEnable, 1)) {
    enterFault("torque-on read-back failed");
    return;
  }

  delay(30);
  if (!readMotionSample(first.id, first.last) ||
      !readMotionSample(second.id, second.last) ||
      !motionSampleIsSafe(first.id, first.last) ||
      !motionSampleIsSafe(second.id, second.last)) {
    enterFault("armed servo status invalid");
    return;
  }

  g_state.mode = ProbeMode::Running;
  g_state.preflight_ready = false;
  g_state.run_started_ms = millis();
  g_state.imu_updates_run = 0;
  g_state.max_dynamic_accel_g = 0.0f;
  g_state.max_gyro_dps = 0.0f;
  g_state.max_i2s_service_gap_us = 0;
  g_state.i2s_gap_fault = false;
  g_state.last_i2s_service_us = micros();
  g_state.phase = 0.0f;
  g_state.tone_sample_cursor = 0;
  drawStatus("RUN / HOLD=STOP");
  Serial.printf(
      "COMBINED GO: ID1 %+ld and ID2 %+ld pulses with 4CH %.1f%% burst.\n",
      static_cast<long>(first.target - first.home),
      static_cast<long>(second.target - second.home),
      static_cast<double>(g_state.haptic_level * 100.0f));

  if (!writeTdmBlock(true) || !writeTdmBlock(true) || !writeTdmBlock(true) ||
      !writeRegisterU32(first.id, kAddrGoalPosition,
                        static_cast<uint32_t>(first.target)) ||
      !writeRegisterU32(second.id, kAddrGoalPosition,
                        static_cast<uint32_t>(second.target)) ||
      !waitForBothTargets(first, first.target, second, second.target, "OUT") ||
      !runActiveHold(300) ||
      !writeRegisterU32(first.id, kAddrGoalPosition,
                        static_cast<uint32_t>(first.home)) ||
      !writeRegisterU32(second.id, kAddrGoalPosition,
                        static_cast<uint32_t>(second.home)) ||
      !waitForBothTargets(first, first.home, second, second.home, "HOME")) {
    enterFault("simultaneous run failed");
    return;
  }

  forceDigitalSilence();
  g_state.mode = ProbeMode::IdleSilent;
  const bool first_off = writeTorqueOff(first.id);
  const bool second_off = writeTorqueOff(second.id);
  const bool first_watchdog = writeRegisterU8(first.id, kAddrBusWatchdog, 0);
  const bool second_watchdog = writeRegisterU8(second.id, kAddrBusWatchdog, 0);
  MotionSample first_final{};
  MotionSample second_final{};
  const bool final_status = readMotionSample(first.id, first_final) &&
                            readMotionSample(second.id, second_final);
  if (!first_off || !second_off || !first_watchdog || !second_watchdog ||
      !final_status || !motionSampleIsSafe(first.id, first_final) ||
      !motionSampleIsSafe(second.id, second_final) ||
      absoluteDifference(first_final.present_position_raw, first.home) >
          kMotionPositionTolerancePulses ||
      absoluteDifference(second_final.present_position_raw, second.home) >
          kMotionPositionTolerancePulses ||
      g_state.i2s_errors != 0 || g_state.i2s_gap_fault ||
      g_state.imu_updates_run == 0) {
    enterFault("final safety/read-back validation failed");
    return;
  }

  ++g_state.successful_runs;
  Serial.printf(
      "COMBINED PASS: level=%.1f%% ID1 home=%ld peak=%ldmA %.1fV %uC; "
      "ID2 home=%ld peak=%ldmA %.1fV %uC; imu=%lu peak_dyn=%.4fg "
      "peak_gyro=%.2fdps; i2s_blocks=%lu errors=%lu max_gap=%luus; torque OFF.\n",
      static_cast<double>(g_state.haptic_level * 100.0f),
      static_cast<long>(first_final.present_position_raw),
      static_cast<long>(first.max_current_ma),
      first_final.input_voltage_decivolt * 0.1f,
      static_cast<unsigned>(first_final.temperature_c),
      static_cast<long>(second_final.present_position_raw),
      static_cast<long>(second.max_current_ma),
      second_final.input_voltage_decivolt * 0.1f,
      static_cast<unsigned>(second_final.temperature_c),
      static_cast<unsigned long>(g_state.imu_updates_run),
      static_cast<double>(g_state.max_dynamic_accel_g),
      static_cast<double>(g_state.max_gyro_dps),
      static_cast<unsigned long>(g_state.i2s_blocks),
      static_cast<unsigned long>(g_state.i2s_errors),
      static_cast<unsigned long>(g_state.max_i2s_service_gap_us));
  drawStatus("PASS / TORQUE OFF");
}

void printHelp() {
  Serial.println("Commands:");
  Serial.println("  status       - show IMU/I2S/combined state");
  Serial.println("  check        - verify IMU + ID1/ID2 with torque OFF");
  Serial.println("  level PCT    - set 4CH run level from 2.5 to 15.0% while idle");
  Serial.println("  go           - simultaneous servo + IMU + 4CH burst test");
  Serial.println("  stop         - digital silence and torque OFF request");
  Serial.println("  help         - print this list");
  Serial.println("Boot is silent/torque-off. S1 remains a manual amplifier switch.");
}

void handleConsoleCommand(const char* command) {
  if (std::strcmp(command, "status") == 0) {
    printStatus();
  } else if (std::strcmp(command, "check") == 0) {
    if (!runPreflight(false, nullptr, nullptr)) {
      enterFault("check failed");
    }
  } else if (std::strcmp(command, "go") == 0) {
    runCombinedTest();
  } else if (std::strcmp(command, "stop") == 0 ||
             std::strcmp(command, "mute") == 0) {
    forceDigitalSilence();
    safeStopServos();
    g_state.mode = ProbeMode::IdleSilent;
    g_state.preflight_ready = false;
    Serial.println("SAFE STOP: digital silence and torque OFF requested.");
    drawStatus("SAFE STOP / OFF");
  } else if (std::strncmp(command, "level ", 6) == 0) {
    if (g_state.mode == ProbeMode::Running) {
      Serial.println("Level change rejected while running.");
      return;
    }
    float percent = 0.0f;
    if (std::sscanf(command + 6, "%f", &percent) != 1) {
      Serial.println("Invalid level. Use: level 2.5..15.0");
      return;
    }
    const float level = percent / 100.0f;
    if (level < kMinimumHapticLevel || level > kMaximumHapticLevel) {
      Serial.println("Level rejected: allowed range is 2.5..15.0%.");
      return;
    }
    g_state.haptic_level = level;
    Serial.printf("Combined haptic level set to %.1f%%.\n",
                  static_cast<double>(percent));
    drawStatus();
  } else if (std::strcmp(command, "help") == 0 ||
             std::strcmp(command, "?") == 0) {
    printHelp();
  } else if (command[0] != '\0') {
    Serial.printf("Unknown command: %s\n", command);
    printHelp();
  }
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
  const uint32_t wait_start_ms = millis();
  while (!Serial && millis() - wait_start_ms < 1200) {
    delay(10);
  }

  M5.Display.setRotation(0);
  drawStatus("BOOT SAFE");

  g_state.imu_ready = M5.Imu.begin(&M5.In_I2C, M5.getBoard());
  g_state.i2s_ready = installTdm();

  pinMode(kDxlTxPin, OUTPUT);
  digitalWrite(kDxlTxPin, HIGH);
  g_dxl.setRxBufferSize(512);
  g_dxl.begin(kDxlBaud, SERIAL_8N1, kDxlRxPin, kDxlTxPin);
  delay(3);
  broadcastTorqueOff();

  Serial.println();
  Serial.println("AtomS3 combined IMU + XL330x2 + 4CH TDM probe started.");
  Serial.println("Safety: boot sends TDM zeros and DYNAMIXEL torque OFF only.");
  Serial.println("Motion and 4CH haptics require explicit GO after CHECK.");
  Serial.println("S1 is manual: OFF=hardware amplifier mute; firmware cannot read it.");

  if (!g_state.imu_ready || !g_state.i2s_ready) {
    enterFault("IMU or I2S initialization failed");
    return;
  }

  const uint32_t imu_wait_start = millis();
  while (g_state.last_imu_update_ms == 0 &&
         millis() - imu_wait_start < kImuStaleAbortMs) {
    writeTdmBlock(false);
    serviceImu();
  }
  if (g_state.last_imu_update_ms == 0) {
    enterFault("IMU produced no initial sample");
    return;
  }

  g_state.mode = ProbeMode::IdleSilent;
  printHelp();
  printStatus();
  drawStatus();
}

void loop() {
  M5.update();
  pollConsole();
  if (M5.BtnA.wasHold()) {
    forceDigitalSilence();
    safeStopServos();
    g_state.mode = ProbeMode::IdleSilent;
    g_state.preflight_ready = false;
    Serial.println("SAFE STOP: button hold requested silence and torque OFF.");
    drawStatus("SAFE STOP / OFF");
  }
  if (g_state.i2s_ready) {
    if (!writeTdmBlock(false)) {
      enterFault("idle I2S write failed");
    }
  }
  serviceImu();
  delay(1);
}

#endif  // HAPTICS_ATOMS3_COMBINED_PROBE_ENABLE
