#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <vector>

#include "haptics/Parameters.hpp"
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

std::size_t HardwareSerial::write(const uint8_t* bytes, std::size_t length) {
  writes.emplace_back(bytes, bytes + length);
  if (length >= 10 && bytes[7] == 1 && bytes[4] < diagnostic_replies.size()) {
    if (diagnostic_echo) receive(writes.back());
    receive(diagnostic_replies[bytes[4]]);
  }
  if (confirm_torque_off && length >= 10 && bytes[4] != 0xfe) {
    if (bytes[7] == 3) receive(reply(bytes[4], {}));
    if (bytes[7] == 2) receive(reply(bytes[4], {0}));
  }
  return length;
}

haptics::TiltPlaneServoInterface armed(uint32_t now = 100) {
  Serial1 = {};
  diagnostic_echo = false;
  diagnostic_replies = {};
  test_clock_ms = now;
  test_delay_calls = 0;
  haptics::TiltPlaneServoInterface servo;
  servo.enabled_ = servo.runtime_enabled_ = true;
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

void retryDropsLateBytesAndUsesLatestGoal() {
  auto servo = armed();
  tick(servo, 100);
  receive(reply(1, {1, 0, 0, 0, 0, 0, 0}));
  servo.last_command_.thumb_angle_deg = 8;
  // A reply first serviced after its deadline is discarded before the retry.
  tick(servo, 145);
  CHECK(servo.health_stage_ == 0 && servo.health_attempt_ == 2);
  CHECK(servo.status_.devices[0].commanded_position_raw != 2048);
  const auto latest_goal = servo.status_.devices[0].commanded_position_raw;
  receive(reply(1, {1, 0, 0, 0, 0, 0, 0}));
  tick(servo, 146);
  receive(reply(1, motion()));
  tick(servo, 147);
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

int main() {
  fragmentsAndAtomicCommit();
  missingRepliesDoNotWait();
  retryDropsLateBytesAndUsesLatestGoal();
  stopCancelsAndLateReplyCannotResume();
  faultsCancelWithoutReplyWait();
  failedStopReadbackStaysUnknown();
  fullTxRetainsFaultStop();
  wrapsClockAndServicesAtGoalCadence();
  diagnosticIsIndependentBoundedAndPingOnly();
  std::puts("Tilt runtime: 9 fake-UART regressions passed.");
}
