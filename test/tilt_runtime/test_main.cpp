#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <vector>

#include "haptics/Parameters.hpp"
#include "haptics/HardwareProfiles.hpp"
#include "haptics/Types.hpp"
// Set up an already-armed runtime without running the unrelated boot probe.
#define private public
#include "haptics/TiltPlaneServoInterface.hpp"
#undef private
#include <Arduino.h>

uint32_t test_clock_ms = 100;
uint32_t test_delay_calls = 0;
HardwareSerial Serial1;
bool diagnostic_echo = false;
std::array<std::vector<uint8_t>, 3> diagnostic_replies{};
std::vector<uint8_t> late_torque_read_reply;
bool omit_torque_read_reply = false;
bool register_bank_replies = false;
bool omit_watchdog_reply = false;
std::array<bool, 3> servo_online{{false, true, true}};
std::array<std::array<uint8_t, 147>, 3> servo_registers{};

#define CHECK(condition) do { if (!(condition)) { \
  std::fprintf(stderr, "line %d: %s\n", __LINE__, #condition); std::exit(1); \
} } while (false)

uint16_t crc(const std::vector<uint8_t>& bytes) {
  uint16_t result = 0;
  for (uint8_t value : bytes) {
    result ^= static_cast<uint16_t>(value) << 8;
    for (unsigned bit = 0; bit < 8; ++bit) {
      result = static_cast<uint16_t>((result << 1) ^
                                    ((result & 0x8000) ? 0x8005 : 0));
    }
  }
  return result;
}

std::vector<uint8_t> reply(uint8_t id, const std::vector<uint8_t>& params,
                           uint8_t error = 0) {
  std::vector<uint8_t> bytes{0xff, 0xff, 0xfd, 0, id, 0, 0, 0x55, error};
  for (uint8_t value : params) {
    bytes.push_back(value);
    const auto count = bytes.size();
    if (count >= 10 && bytes[count - 3] == 0xff &&
        bytes[count - 2] == 0xff && bytes[count - 1] == 0xfd) {
      bytes.push_back(0xfd);
    }
  }
  const uint16_t length = static_cast<uint16_t>(bytes.size() - 7 + 2);
  bytes[5] = length & 0xff;
  bytes[6] = length >> 8;
  const uint16_t checksum = crc(bytes);
  bytes.push_back(checksum & 0xff);
  bytes.push_back(checksum >> 8);
  return bytes;
}

void receive(const std::vector<uint8_t>& bytes) {
  Serial1.rx.insert(Serial1.rx.end(), bytes.begin(), bytes.end());
}

void enableRegisterReplies() {
  register_bank_replies = true;
  servo_registers = {};
  for (uint8_t id : {1, 2}) {
    auto& registers = servo_registers[id];
    registers[0] = 1190 & 0xff;
    registers[1] = 1190 >> 8;
    registers[11] = 3;  // Position mode; no EEPROM writes are needed to arm.
    registers[64] = 1;
    registers[98] = 50;
    registers[117] = registers[133] = 8;  // Goal / present position 2048.
    registers[144] = 51;
    registers[146] = 30;
  }
}

std::size_t HardwareSerial::write(const uint8_t* bytes, std::size_t length) {
  CHECK(is_open);  // No packets may be issued between UART end and begin.
  writes.emplace_back(bytes, bytes + length);
  if (register_bank_replies && length >= 10) {
    const uint8_t id = bytes[4];
    const uint8_t instruction = bytes[7];
    if (instruction == 1 && id < servo_registers.size() && servo_online[id]) {
      receive(reply(id, {servo_registers[id][0], servo_registers[id][1], 1}));
    } else if (instruction == 2 && length >= 14 &&
               id < servo_registers.size() && servo_online[id]) {
      const std::size_t address = bytes[8] | (bytes[9] << 8);
      const std::size_t count = bytes[10] | (bytes[11] << 8);
      CHECK(address + count <= servo_registers[id].size());
      if (address == 98 && omit_watchdog_reply) return length;
      if (address == 64 && count == 1) {
        receive(late_torque_read_reply);
        late_torque_read_reply.clear();
      }
      receive(reply(id, {servo_registers[id].begin() + address,
                         servo_registers[id].begin() + address + count}));
    } else if (instruction == 3 && length >= 13) {
      const std::size_t address = bytes[8] | (bytes[9] << 8);
      // These regressions use small, unstuffed RAM configuration values.
      const std::size_t count = length - 12;
      for (uint8_t target : {1, 2}) {
        if (id != target && id != 0xfe) continue;
        if (!servo_online[target]) continue;
        CHECK(address + count <= servo_registers[target].size());
        std::copy(bytes + 10, bytes + 10 + count,
                  servo_registers[target].begin() + address);
      }
      if (id != 0xfe && servo_online[id]) receive(reply(id, {}));
    } else if (instruction == 0x83 && length == 24) {
      CHECK(bytes[8] == 116 && bytes[10] == 4);
      for (std::size_t offset : {12U, 17U}) {
        const uint8_t target = bytes[offset];
        CHECK(target > 0 && target < servo_registers.size());
        if (!servo_online[target] || servo_registers[target][98] == 0xff) continue;
        std::copy(bytes + offset + 1, bytes + offset + 5,
                  servo_registers[target].begin() + 116);
      }
    }
    return length;
  }
  if (length >= 10 && bytes[7] == 1 && bytes[4] < diagnostic_replies.size()) {
    if (diagnostic_echo) receive(writes.back());
    receive(diagnostic_replies[bytes[4]]);
  }
  if (confirm_torque_off && length >= 10 && bytes[4] != 0xfe) {
    if (bytes[7] == 3) receive(reply(bytes[4], {}));
    if (bytes[7] == 2) {
      // A cancelled runtime read may finish after Stop has sent its readback.
      receive(late_torque_read_reply);
      late_torque_read_reply.clear();
      if (!omit_torque_read_reply) receive(reply(bytes[4], {0}));
    }
  }
  return length;
}

haptics::TiltPlaneServoInterface armed(uint32_t now = 100) {
  Serial1 = {};
  diagnostic_echo = false;
  diagnostic_replies = {};
  late_torque_read_reply.clear();
  omit_torque_read_reply = false;
  register_bank_replies = false;
  omit_watchdog_reply = false;
  servo_online = {{false, true, true}};
  servo_registers = {};
  test_clock_ms = now;
  test_delay_calls = 0;
  haptics::TiltPlaneServoInterface servo;
  servo.enabled_ = servo.runtime_enabled_ = true;
  servo.params_.tilt.current_based_position_mode = false;
  servo.params_.tilt.bus_baud = 57600;
  servo.params_.tilt.command_period_ms = 10;
  servo.params_.tilt.health_poll_period_ms = 100;
  servo.params_.tilt.max_travel_pulses = 114;
  servo.last_submit_ms_ = now;
  servo.last_command_write_ms_ = now - 10;
  servo.last_health_poll_ms_ = now - 100;
  servo.last_status_ms_ = now;
  servo.status_.state = haptics::TiltServoState::Armed;
  for (std::size_t index = 0; index < 2; ++index) {
    auto& device = servo.status_.devices[index];
    device.id = static_cast<uint8_t>(index + 1);
    device.status_valid = device.torque_enabled = true;
    device.home_position_raw = device.present_position_raw = 2048;
    device.goal_position_raw = device.commanded_position_raw = 2048;
    device.input_voltage_decivolt = 51;
    device.temperature_c = 30;
  }
  return servo;
}

void tick(haptics::TiltPlaneServoInterface& servo, uint32_t now,
          bool healthy = true) {
  test_clock_ms = now;
  servo.submit(servo.last_command_);
  const auto delays = test_delay_calls;
  const auto flushes = Serial1.flush_calls;
  servo.service(now, healthy);
  CHECK(test_delay_calls == delays);
  CHECK(Serial1.flush_calls == flushes);
  CHECK(test_clock_ms == now);
}

std::size_t instructionCount(uint8_t instruction) {
  return std::count_if(Serial1.writes.begin(), Serial1.writes.end(),
                       [=](const auto& bytes) { return bytes[7] == instruction; });
}

void put32(std::vector<uint8_t>& bytes, std::size_t offset, uint32_t value) {
  for (unsigned i = 0; i < 4; ++i) bytes[offset + i] = value >> (8 * i);
}

std::vector<uint8_t> motion(uint32_t position = 2050) {
  std::vector<uint8_t> values(31);
  put32(values, 0, position);
  put32(values, 16, position);
  // Force protocol byte stuffing in the unrendered velocity field.
  values[12] = 0xff; values[13] = 0xff; values[14] = 0xfd;
  values[28] = 51;
  values[30] = 30;
  return values;
}

void fragmentsAndAtomicCommit() {
  auto servo = armed();
  tick(servo, 100);
  CHECK(servo.health_pending_ && instructionCount(2) == 1);
  receive(Serial1.writes.back());  // Automatic half-duplex PCB echoes TX.
  const auto control = reply(1, {1, 0, 0, 0, 0, 0, 0});
  receive({control.begin(), control.begin() + 5});
  tick(servo, 101);
  CHECK(instructionCount(2) == 1 && servo.health_rx_size_ == 5);
  receive({control.begin() + 5, control.end()});
  tick(servo, 102);
  CHECK(servo.health_stage_ == 1 && instructionCount(2) == 2);
  CHECK(servo.status_.devices[0].present_position_raw == 2048);
  CHECK(servo.last_status_ms_ == 100);
  // Wrong ID, late previous-phase reply, and bad CRC cannot complete motion.
  receive(reply(2, motion()));
  receive(control);
  auto corrupt = reply(1, motion());
  corrupt.back() ^= 0x80;
  receive(corrupt);
  tick(servo, 103);
  CHECK(servo.health_pending_ && servo.last_status_ms_ == 100);
  const auto state = reply(1, motion());
  receive({state.begin(), state.begin() + 12});
  tick(servo, 104);
  receive({state.begin() + 12, state.end()});
  tick(servo, 105);
  CHECK(!servo.health_active_ && !servo.health_pending_);
  CHECK(servo.status_.devices[0].present_position_raw == 2050);
  CHECK(servo.status_.devices[0].goal_position_raw == 2050);
  CHECK(servo.status_.devices[0].status_valid && servo.last_status_ms_ == 105);
  CHECK(servo.status_.fault == haptics::TiltServoFault::None);
}

void missingRepliesDoNotWait() {
  auto servo = armed();
  CHECK(servo.params_.tilt.communication_recovery_ms == 0);
  tick(servo, 100);
  for (uint32_t now = 101; now < 145; ++now) tick(servo, now);
  CHECK(instructionCount(0x83) == 1 && instructionCount(2) == 1);
  tick(servo, 145);
  CHECK(instructionCount(0x83) == 2 && instructionCount(2) == 2);
  tick(servo, 190);
  CHECK(instructionCount(0x83) == 3 && instructionCount(2) == 3);
  tick(servo, 235);
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(servo.status_.communication_errors == 1);
  CHECK(!servo.status_.devices[0].status_valid);
  CHECK(!servo.runtime_enabled_ && !servo.health_pending_);
  CHECK(Serial1.writes.back()[4] == 0xfe && Serial1.writes.back()[7] == 3);
}

void bufferedReplyAtDeadlineUsesLatestGoal() {
  auto servo = armed();
  tick(servo, 100);
  receive(reply(1, {1, 0, 0, 0, 0, 0, 0}));
  servo.last_command_.thumb_angle_deg = 8;
  // A valid buffered reply is read before deciding the transaction timed out.
  tick(servo, 145);
  CHECK(servo.health_stage_ == 1 && servo.health_attempt_ == 1);
  CHECK(servo.status_.devices[0].commanded_position_raw != 2048);
  const auto latest_goal = servo.status_.devices[0].commanded_position_raw;
  receive(reply(1, motion()));
  tick(servo, 190);
  CHECK(servo.status_.devices[0].commanded_position_raw == latest_goal);
  CHECK(servo.status_.communication_errors == 0);
}

void stopCancelsAndLateReplyCannotResume() {
  auto servo = armed();
  tick(servo, 100);
  Serial1.confirm_torque_off = true;
  CHECK(servo.setRuntimeEnabled(false));
  CHECK(!servo.health_pending_ && !servo.health_active_ && !servo.runtime_enabled_);
  CHECK(!servo.status_.devices[0].torque_enabled && !servo.status_.devices[1].torque_enabled);
  const auto count = Serial1.writes.size();
  receive(reply(1, motion()));
  tick(servo, 150);
  CHECK(Serial1.writes.size() == count);
}

void faultsCancelWithoutReplyWait() {
  auto servo = armed();
  tick(servo, 100);
  tick(servo, 101, false);
  CHECK(servo.status_.fault == haptics::TiltServoFault::ImuSafety);
  CHECK(!servo.health_pending_ && !servo.health_active_);
  servo = armed();
  tick(servo, 100);
  receive(reply(1, {1, 0, 0, 0, 0, 0, 0}));
  tick(servo, 101);
  auto hot = motion(); hot[30] = 70;
  receive(reply(1, hot));
  tick(servo, 102);
  CHECK(servo.status_.fault == haptics::TiltServoFault::OverTemperature);
}

void failedStopReadbackStaysUnknown() {
  auto servo = armed();
  tick(servo, 100);
  CHECK(!servo.setRuntimeEnabled(false));
  CHECK(!servo.status_.devices[0].status_valid && !servo.status_.devices[1].status_valid);
  CHECK(servo.status_.devices[0].torque_enabled && servo.status_.devices[1].torque_enabled);
  CHECK(!servo.runtime_enabled_ && !servo.health_pending_);
}

void stopIgnoresLateHealthReply() {
  for (const auto stale_length : {7U, 31U}) {
    auto servo = armed();
    tick(servo, 100);
    Serial1.confirm_torque_off = true;
    std::vector<uint8_t> stale_health(stale_length);
    stale_health[0] = 1;  // Old torque ON / goal low byte, not current readback.
    late_torque_read_reply = reply(1, stale_health);
    CHECK(servo.setRuntimeEnabled(false));
    CHECK(servo.status_.fault == haptics::TiltServoFault::None);
    CHECK(servo.status_.state == haptics::TiltServoState::ReadyTorqueOff);
    CHECK(!servo.runtime_enabled_ && !servo.health_active_ && !servo.health_pending_);
    CHECK(!servo.status_.devices[0].torque_enabled && !servo.status_.devices[1].torque_enabled);
    CHECK(servo.status_.communication_errors == 0);
  }

  auto servo = armed();
  tick(servo, 100);
  Serial1.confirm_torque_off = true;
  omit_torque_read_reply = true;
  // A stale response whose first byte is zero must not falsely confirm OFF.
  late_torque_read_reply = reply(1, std::vector<uint8_t>(31));
  CHECK(!servo.setRuntimeEnabled(false));
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(!servo.status_.devices[0].status_valid && !servo.status_.devices[1].status_valid);
  CHECK(servo.status_.devices[0].torque_enabled && servo.status_.devices[1].torque_enabled);
  CHECK(!servo.runtime_enabled_ && !servo.health_pending_);
}

void stopMaterialConfigureAndRestartWithLateHealthReply() {
  auto servo = armed();
  enableRegisterReplies();
  tick(servo, 100);
  CHECK(servo.health_pending_);
  late_torque_read_reply = reply(1, {1, 0, 0, 0, 0, 0, 0});
  CHECK(servo.setRuntimeEnabled(false));
  CHECK(servo.status_.fault == haptics::TiltServoFault::None);
  CHECK(servo.status_.state == haptics::TiltServoState::ReadyTorqueOff);

  auto sand = haptics::makeDefaultGranularSandPreset();
  sand.tilt = servo.params_.tilt;
  sand.features.enable_tilt_plane = false;
  servo.configure(sand);
  CHECK(!servo.runtime_enabled_ && !servo.status_.runtime_requested);
  CHECK(servo.params_.container.family == haptics::MaterialFamily::Granular);
  CHECK(servo_registers[1][64] == 0 && servo_registers[2][64] == 0);
  const auto restart_count = Serial1.begin_calls;
  sand.features.enable_tilt_plane = true;
  servo.configure(sand);
  CHECK(!servo.runtime_enabled_);  // Material/feature configuration never arms.
  CHECK(servo.setRuntimeEnabled(true));
  CHECK(Serial1.begin_calls == restart_count + 1);
  CHECK(servo.status_.state == haptics::TiltServoState::Armed);
  CHECK(servo.status_.fault == haptics::TiltServoFault::None);
  CHECK(servo_registers[1][64] == 1 && servo_registers[2][64] == 1);
  CHECK(servo.status_.devices[0].home_position_raw == 2048);
  CHECK(servo.status_.devices[1].home_position_raw == 2048);
  servo.home();
  const auto arm_time = test_clock_ms;
  tick(servo, arm_time + 100);
  tick(servo, arm_time + 101);
  tick(servo, arm_time + 102);
  CHECK(servo.runtime_enabled_ && !servo.health_pending_);
  CHECK(servo.status_.communication_errors == 0);
  CHECK(servo.setRuntimeEnabled(false));
}

void genuineCommunicationFaultNeedsFreshExplicitRecovery() {
  auto servo = armed();
  tick(servo, 100);
  tick(servo, 145);
  tick(servo, 190);
  tick(servo, 235);
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(servo.status_.state == haptics::TiltServoState::FaultLatched);
  CHECK(!servo.setRuntimeEnabled(true));
  CHECK(!servo.clearFault());  // No fresh bus reply: still latched, never armed.
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(!servo.runtime_enabled_);

  enableRegisterReplies();
  const auto before_clear = Serial1.writes.size();
  const auto restart_count = Serial1.begin_calls;
  CHECK(servo.clearFault());
  CHECK(Serial1.begin_calls == restart_count + 1);
  CHECK(servo.status_.state == haptics::TiltServoState::ReadyTorqueOff);
  CHECK(servo.status_.fault == haptics::TiltServoFault::None);
  CHECK(!servo.runtime_enabled_ && !servo.status_.runtime_requested);
  CHECK(servo_registers[1][64] == 0 && servo_registers[2][64] == 0);
  for (std::size_t index = before_clear; index < Serial1.writes.size(); ++index) {
    const auto& packet = Serial1.writes[index];
    // Explicit Clear restarts UART and reads/preflights; it never requests motion.
    CHECK(packet[7] != 0x83);
    if (packet[7] == 3) CHECK(packet[8] == 64 && packet[10] == 0);
  }
  CHECK(servo.setRuntimeEnabled(true));
  CHECK(servo.runtime_enabled_ && servo.status_.state == haptics::TiltServoState::Armed);
  CHECK(servo.setRuntimeEnabled(false));
}

void fullTxRetainsFaultStop() {
  auto servo = armed();
  Serial1.tx_capacity = 0;
  tick(servo, 100);
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(servo.fault_torque_off_pending_ && Serial1.writes.empty());
  tick(servo, 101);
  CHECK(servo.fault_torque_off_pending_ && Serial1.writes.empty());
  Serial1.tx_capacity = 256;
  tick(servo, 102);
  CHECK(!servo.fault_torque_off_pending_ && !servo.runtime_enabled_);
  CHECK(Serial1.writes.size() == 1 && Serial1.writes[0][7] == 3);
}

void wrapsClockAndServicesAtGoalCadence() {
  auto servo = armed(UINT32_MAX - 20);
  tick(servo, UINT32_MAX - 20);
  CHECK(servo.health_pending_);
  tick(servo, 25);
  CHECK(servo.health_attempt_ == 2 && servo.health_pending_);
  servo = armed();
  tick(servo, 100);
  receive(reply(1, {1, 0, 0, 0, 0, 0, 0}));
  tick(servo, 110);
  receive(reply(1, motion()));
  tick(servo, 120);
  CHECK(!servo.health_active_ && servo.last_status_ms_ == 120);
}

void diagnosticIsIndependentBoundedAndPingOnly() {
  auto servo = armed();
  std::array<haptics::TiltBusPingDiagnostic, 2> results{};
  CHECK(!servo.diagnose(results));
  CHECK(Serial1.writes.empty());
  servo.runtime_enabled_ = false;
  servo.status_.state = haptics::TiltServoState::FaultLatched;
  servo.status_.fault = haptics::TiltServoFault::Communication;
  diagnostic_echo = true;
  diagnostic_replies[1] = reply(2, {0xa6, 0x04, 1}); // Wrong ID for first PING.
  diagnostic_replies[2] = reply(2, {0xa6, 0x04, 1});
  const uint32_t start = test_clock_ms;
  CHECK(servo.diagnose(results));
  CHECK(test_clock_ms - start <= 90);
  CHECK(Serial1.writes.size() == 2);
  CHECK(!results[0].success && results[0].status_id == 2);
  CHECK(results[0].echo_packets == 1 && results[0].status_packets == 1);
  CHECK(results[1].success && results[1].model_number == 1190);
  CHECK(results[1].status_param_length == 3 && results[1].status_error == 0);
  CHECK(results[1].tx_bytes == 10 && results[1].rx_bytes == 24);
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(servo.status_.state == haptics::TiltServoState::FaultLatched);
  CHECK(servo.status_.devices[0].home_position_raw == 2048);
  CHECK(!servo.runtime_enabled_);
  for (const auto& bytes : Serial1.writes) CHECK(bytes[7] == 1 && bytes.size() == 10);

  Serial1.writes.clear();
  diagnostic_replies[1] = reply(1, {0xa6, 0x04, 1}, 0x80);
  diagnostic_replies[2].clear();
  CHECK(servo.diagnose(results));
  CHECK(!results[0].success && results[0].status_error == 0x80 && results[0].model_number == 1190);
  CHECK(!results[1].success && results[1].rx_bytes == 10 && results[1].echo_packets == 1);
  CHECK(results[1].status_packets == 0 && results[1].status_id == 0xff);

  Serial1.writes.clear();
  diagnostic_replies[1] = reply(1, {0xa6, 0x04, 1, 0, 0, 0, 0}); // Late same-ID READ, not PING.
  diagnostic_replies[2] = reply(2, {0xa6, 0x04, 1});
  CHECK(servo.diagnose(results));
  CHECK(!results[0].success && results[0].status_id == 1 && results[0].status_param_length == 7);
  CHECK(results[1].success && results[1].status_param_length == 3);
  CHECK(Serial1.writes.size() == 2);

  Serial1.writes.clear();
  diagnostic_echo = false;
  diagnostic_replies = {};
  const uint32_t no_rx_start = test_clock_ms;
  CHECK(servo.diagnose(results));
  CHECK(test_clock_ms - no_rx_start == 90);
  CHECK(results[0].rx_bytes == 0 && results[1].rx_bytes == 0);
  CHECK(!results[0].success && !results[1].success && Serial1.writes.size() == 2);
  for (const auto& bytes : Serial1.writes) CHECK(bytes[7] == 1 && bytes.size() == 10);
}

haptics::TiltPlaneServoInterface recoverable(uint32_t now = 100) {
  auto servo = armed(now);
  servo.params_.tilt.communication_recovery_ms = 500;
  servo.status_.runtime_requested = true;
  enableRegisterReplies();
  return servo;
}

void transientOutagesResumeWithoutTorqueCycle() {
  for (uint32_t outage_ms : {150U, 300U}) {
    auto servo = recoverable();
    servo_online[1] = servo_online[2] = false;
    servo.last_command_.thumb_angle_deg = 8;
    servo.last_command_.index_angle_deg = -6;
    for (uint32_t now = 100; now <= 100 + outage_ms + 150; ++now) {
      if (now == 100 + outage_ms) {
        servo_online[1] = servo_online[2] = true;
        // Only the current model target should be sent, never an old FIFO.
        servo.last_command_.thumb_angle_deg = -4;
      }
      tick(servo, now);
      CHECK(servo.runtime_enabled_ && servo.status_.runtime_requested);
      CHECK(servo.status_.state != haptics::TiltServoState::FaultLatched);
    }
    CHECK(!servo.communication_recovering_);
    CHECK(servo.status_.state == haptics::TiltServoState::Armed);
    CHECK(servo.status_.fault == haptics::TiltServoFault::None);
    CHECK(servo.status_.devices[0].status_valid && servo.status_.devices[1].status_valid);
    CHECK(servo.status_.devices[0].home_position_raw == 2048);
    CHECK(servo.status_.devices[1].home_position_raw == 2048);
    CHECK(servo.status_.devices[0].commanded_position_raw == 2003);
    CHECK(servo.status_.communication_errors >= 3);
    CHECK(Serial1.end_calls == 1 && Serial1.begin_calls == 1);
    CHECK(instructionCount(3) == 0);  // No torque/PWM/configuration writes.
    CHECK(servo_registers[1][64] == 1 && servo_registers[2][64] == 1);
  }
}

void persistentOutageExpiresOnceAndNeverAutoArms() {
  auto servo = recoverable();
  servo_online[1] = servo_online[2] = false;
  for (uint32_t now = 100; now < 645; ++now) {
    tick(servo, now);
    CHECK(servo.runtime_enabled_);
  }
  CHECK(servo.recovery_started_ms_ == 145);
  tick(servo, 645);
  CHECK(servo.status_.state == haptics::TiltServoState::FaultLatched);
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(!servo.runtime_enabled_ && !servo.status_.runtime_requested);
  CHECK(!servo.communication_recovering_ && !servo.health_pending_);
  CHECK(Serial1.end_calls == 1 && Serial1.begin_calls == 1);
  CHECK(Serial1.writes.back()[7] == 3 && Serial1.writes.back()[10] == 0);
  const auto count = Serial1.writes.size();
  servo_online[1] = servo_online[2] = true;
  receive(reply(1, motion()));
  for (uint32_t now = 646; now < 950; ++now) tick(servo, now);
  CHECK(Serial1.writes.size() == count && !servo.runtime_enabled_);
}

void healthyServoCannotHideOtherOutage() {
  auto servo = recoverable();
  servo_online[2] = false;
  for (uint32_t now = 100; now <= 600; ++now) tick(servo, now);
  CHECK(servo.communication_recovering_ && servo.runtime_enabled_);
  CHECK(servo.recovery_started_ms_ == 245);
  CHECK(servo.recovery_valid_mask_ == 1);
  CHECK(servo.status_.devices[0].status_valid && !servo.status_.devices[1].status_valid);
  CHECK(servo.last_status_ms_ > servo.recovery_started_ms_);
  for (uint32_t now = 601; now <= 745; ++now) tick(servo, now);
  CHECK(servo.status_.state == haptics::TiltServoState::FaultLatched);
  CHECK(!servo.runtime_enabled_ && Serial1.end_calls == 1);
}

void txPressureDefersAndRecoversWithoutCountingUnsentReads() {
  for (uint32_t blockage_ms : {5U, 180U}) {
    auto servo = recoverable();
    Serial1.tx_capacity = 0;
    for (uint32_t now = 100; now < 100 + blockage_ms; ++now) {
      tick(servo, now);
      CHECK(servo.runtime_enabled_ && servo.communication_recovering_);
      CHECK(servo.health_attempt_ == 0 && Serial1.writes.empty());
    }
    CHECK(servo.status_.communication_errors == 1);
    Serial1.tx_capacity = 256;
    for (uint32_t now = 100 + blockage_ms; now < 150 + blockage_ms; ++now) {
      tick(servo, now);
    }
    CHECK(!servo.communication_recovering_ && servo.runtime_enabled_);
    CHECK(servo.status_.fault == haptics::TiltServoFault::None);
    CHECK(Serial1.end_calls == (blockage_ms > 135 ? 1U : 0U));
    CHECK(instructionCount(3) == 0);
  }

  auto servo = recoverable();
  // Exercise the health-request TX path independently from goal TX.
  servo.last_command_write_ms_ = 100;
  Serial1.tx_capacity = 0;
  tick(servo, 100);
  CHECK(servo.health_active_ && !servo.health_pending_ && servo.health_attempt_ == 0);
  CHECK(servo.communication_recovering_ && servo.status_.communication_errors == 1);
  Serial1.tx_capacity = 256;
  for (uint32_t now = 101; now < 130; ++now) tick(servo, now);
  CHECK(servo.runtime_enabled_ && !servo.communication_recovering_);

  servo = recoverable();
  Serial1.tx_capacity = 0;
  for (uint32_t now = 100; now <= 600; ++now) tick(servo, now);
  CHECK(!servo.runtime_enabled_ && servo.fault_torque_off_pending_);
  CHECK(servo.status_.state == haptics::TiltServoState::FaultLatched);
  CHECK(Serial1.writes.empty() && Serial1.end_calls == 1);
  Serial1.tx_capacity = 256;
  tick(servo, 601);
  CHECK(!servo.fault_torque_off_pending_ && !servo.runtime_enabled_);
  CHECK(Serial1.writes.size() == 1 && Serial1.writes[0][7] == 3);
  CHECK(servo_registers[1][64] == 0 && servo_registers[2][64] == 0);
}

void stopCancelsEachUartRecoveryPhase() {
  for (uint32_t stop_time : {145U, 235U, 237U, 240U}) {
    auto servo = recoverable();
    servo_online[1] = servo_online[2] = false;
    for (uint32_t now = 100; now <= stop_time; ++now) tick(servo, now);
    CHECK(servo.communication_recovering_);
    if (stop_time == 235) CHECK(servo.recovery_uart_phase_ == 1);
    if (stop_time == 237) CHECK(servo.recovery_uart_phase_ == 2);
    servo_online[1] = servo_online[2] = true;
    CHECK(servo.setRuntimeEnabled(false));
    CHECK(Serial1.is_open && !servo.runtime_enabled_ && !servo.communication_recovering_);
    CHECK(servo.recovery_uart_phase_ == 0 && !servo.health_pending_);
    CHECK(servo.status_.state == haptics::TiltServoState::ReadyTorqueOff);
    CHECK(servo.status_.fault == haptics::TiltServoFault::None);
    CHECK(servo_registers[1][64] == 0 && servo_registers[2][64] == 0);
    const auto writes = Serial1.writes.size();
    const auto begins = Serial1.begin_calls;
    receive(reply(1, motion()));
    const auto stopped_at = test_clock_ms;
    for (uint32_t elapsed = 1; elapsed <= 600; ++elapsed) tick(servo, stopped_at + elapsed);
    CHECK(Serial1.writes.size() == writes && Serial1.begin_calls == begins);
  }
  auto servo = recoverable();
  servo_online[1] = servo_online[2] = false;
  for (uint32_t now = 100; now <= 235; ++now) tick(servo, now);
  CHECK(servo.recovery_uart_phase_ == 1);
  CHECK(!servo.setRuntimeEnabled(false));  // Missing OFF confirmation is not success.
  CHECK(Serial1.is_open && !servo.communication_recovering_ && !servo.runtime_enabled_);
  CHECK(servo.status_.state == haptics::TiltServoState::FaultLatched);
  CHECK(!servo.status_.devices[0].status_valid && !servo.status_.devices[1].status_valid);
  const auto writes = Serial1.writes.size();
  const auto stopped_at = test_clock_ms;
  servo_online[1] = servo_online[2] = true;
  tick(servo, stopped_at + 1);
  CHECK(Serial1.writes.size() == writes && !servo.runtime_enabled_);
}

void nonCommunicationFaultsInterruptRecovery() {
  for (uint32_t fail_time : {145U, 235U, 237U}) {
    auto servo = recoverable();
    servo_online[1] = servo_online[2] = false;
    for (uint32_t now = 100; now <= fail_time; ++now) tick(servo, now);
    tick(servo, fail_time + 1, false);
    CHECK(servo.status_.fault == haptics::TiltServoFault::ImuSafety);
    CHECK(!servo.runtime_enabled_ && !servo.communication_recovering_);
    CHECK(Serial1.is_open && Serial1.writes.back()[7] == 3);
  }
  for (const auto failure : {haptics::TiltServoFault::TorqueState,
                             haptics::TiltServoFault::HardwareError,
                             haptics::TiltServoFault::OverTemperature}) {
    auto servo = recoverable();
    servo_online[1] = servo_online[2] = false;
    for (uint32_t now = 100; now <= 145; ++now) tick(servo, now);
    servo_online[1] = servo_online[2] = true;
    omit_watchdog_reply = true;
    if (failure == haptics::TiltServoFault::TorqueState) servo_registers[1][64] = 0;
    if (failure == haptics::TiltServoFault::HardwareError) servo_registers[1][70] = 8;
    if (failure == haptics::TiltServoFault::OverTemperature) servo_registers[1][146] = 70;
    for (uint32_t now = 146; now <= 220; ++now) tick(servo, now);
    CHECK(servo.status_.fault == failure);
    CHECK(!servo.runtime_enabled_ && !servo.communication_recovering_);
    CHECK(Serial1.writes.back()[7] == 3);
  }
  auto servo = recoverable();
  servo_online[1] = servo_online[2] = false;
  for (uint32_t now = 100; now <= 145; ++now) tick(servo, now);
  test_clock_ms = 496;
  servo.service(496);  // No new model command: grace never masks source starvation.
  CHECK(servo.status_.fault == haptics::TiltServoFault::CommandTimeout);
  CHECK(!servo.runtime_enabled_);
}

void watchdogLatchCannotAppearRecovered() {
  auto servo = recoverable();
  servo_online[1] = servo_online[2] = false;
  for (uint32_t now = 100; now <= 145; ++now) tick(servo, now);
  servo_registers[1][98] = 0xff;
  servo_online[1] = servo_online[2] = true;
  for (uint32_t now = 146; now <= 220; ++now) tick(servo, now);
  CHECK(servo.status_.state == haptics::TiltServoState::FaultLatched);
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(!servo.runtime_enabled_ && !servo.communication_recovering_);
  CHECK(servo_registers[1][98] == 0xff);  // No autonomous watchdog clear.
  for (const auto& packet : Serial1.writes) {
    if (packet[7] == 3) CHECK(packet[8] == 64 && packet[10] == 0);
  }
}

void graceClockWrapsAndFreshControlFaultIsImmediate() {
  auto servo = recoverable(UINT32_MAX - 70);
  const auto started = test_clock_ms;
  servo_online[1] = servo_online[2] = false;
  for (uint32_t elapsed = 0; elapsed <= 544; ++elapsed) {
    tick(servo, started + elapsed);
    CHECK(servo.runtime_enabled_);
  }
  tick(servo, started + 545);
  CHECK(!servo.runtime_enabled_ && servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(Serial1.end_calls == 1);

  servo = recoverable();
  register_bank_replies = false;
  tick(servo, 100);
  receive(reply(1, {1, 0, 0, 0, 0, 0, 8}));
  tick(servo, 101);
  CHECK(servo.status_.fault == haptics::TiltServoFault::HardwareError);
  CHECK(!servo.runtime_enabled_ && instructionCount(2) == 1);
  servo = recoverable();
  register_bank_replies = false;
  tick(servo, 100);
  receive(reply(1, {}, 0x80));
  tick(servo, 101);
  CHECK(servo.status_.fault == haptics::TiltServoFault::HardwareError);
  CHECK(!servo.communication_recovering_);
}

void recoveryConfigurationRemainsProfileOwnedAndBounded() {
  auto params = haptics::makeDefaultGranularSandPreset();
  CHECK(params.tilt.communication_recovery_ms == 0);
  haptics::applyAsBuiltAtomS3Profile(params);
  CHECK(params.tilt.communication_recovery_ms == 500);
  CHECK(params.tilt.bus_watchdog_20ms == 50);
  auto servo = recoverable();
  servo.params_.tilt.communication_recovery_ms = UINT16_MAX;
  servo_online[1] = servo_online[2] = false;
  for (uint32_t now = 100; now < 895; ++now) {
    tick(servo, now);
    CHECK(servo.runtime_enabled_);
  }
  tick(servo, 895);  // First missing read145 + hard maximum750, not65535.
  CHECK(!servo.runtime_enabled_ && !servo.communication_recovering_);
  CHECK(servo.status_.fault == haptics::TiltServoFault::Communication);
  CHECK(Serial1.end_calls == 1);
}

void interruptedRecoverySampleCannotReusePreResetTorque() {
  auto servo = recoverable();
  register_bank_replies = false;
  tick(servo, 100);
  tick(servo, 145);  // Enter the fixed recovery episode after the first miss.
  receive(reply(1, {1, 0, 0, 0, 0, 0, 0}));
  tick(servo, 146);
  receive(reply(1, motion()));
  tick(servo, 147);
  receive(reply(1, {50}));
  tick(servo, 148);
  CHECK(servo.recovery_valid_mask_ == 1);
  receive(reply(2, {1, 0, 0, 0, 0, 0, 0}));
  tick(servo, 149);
  receive(reply(2, motion()));
  tick(servo, 150);
  CHECK(servo.health_device_ == 1 && servo.health_stage_ == 2);
  // The second servo resets after its motion read, while the watchdog reply
  // is missing. A later watchdog=0 cannot validate its pre-reset torque ON.
  tick(servo, 195);
  CHECK(servo.recovery_started_ms_ == 145);
  CHECK(servo.health_stage_ == 0 && servo.health_pending_);
  CHECK(Serial1.writes.back()[8] == 64);
  receive(reply(2, {0}));  // Late watchdog reply must not finish fresh control.
  tick(servo, 196);
  CHECK(servo.communication_recovering_ && servo.health_stage_ == 0);
  CHECK(servo.recovery_valid_mask_ == 1);
  receive(reply(2, {0, 0, 0, 0, 0, 0, 0}));
  tick(servo, 197);
  CHECK(servo.status_.state == haptics::TiltServoState::FaultLatched);
  CHECK(servo.status_.fault == haptics::TiltServoFault::TorqueState);
  CHECK(!servo.runtime_enabled_ && !servo.communication_recovering_);
  CHECK(!servo.status_.devices[1].torque_enabled);
}

int main() {
  fragmentsAndAtomicCommit();
  missingRepliesDoNotWait();
  bufferedReplyAtDeadlineUsesLatestGoal();
  stopCancelsAndLateReplyCannotResume();
  faultsCancelWithoutReplyWait();
  failedStopReadbackStaysUnknown();
  stopIgnoresLateHealthReply();
  stopMaterialConfigureAndRestartWithLateHealthReply();
  genuineCommunicationFaultNeedsFreshExplicitRecovery();
  fullTxRetainsFaultStop();
  wrapsClockAndServicesAtGoalCadence();
  diagnosticIsIndependentBoundedAndPingOnly();
  transientOutagesResumeWithoutTorqueCycle();
  persistentOutageExpiresOnceAndNeverAutoArms();
  healthyServoCannotHideOtherOutage();
  txPressureDefersAndRecoversWithoutCountingUnsentReads();
  stopCancelsEachUartRecoveryPhase();
  nonCommunicationFaultsInterruptRecovery();
  watchdogLatchCannotAppearRecovered();
  graceClockWrapsAndFreshControlFaultIsImmediate();
  recoveryConfigurationRemainsProfileOwnedAndBounded();
  interruptedRecoverySampleCannotReusePreResetTorque();
  std::puts("Tilt runtime: 22 fake-UART regressions passed.");
}
