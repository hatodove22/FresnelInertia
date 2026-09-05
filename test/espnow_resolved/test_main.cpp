#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>

#include "haptics/EspNowTelemetryProtocol.hpp"
#include "haptics/Parameters.hpp"

using namespace haptics;

#define CHECK(condition) do { if (!(condition)) { \
  std::fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #condition); \
  std::exit(1); } } while (false)

namespace {

TelemetrySnapshot snapshot() {
  TelemetrySnapshot value{};
  std::strcpy(value.active_preset, "applied_granular");
  value.timestamp_ms = 12345U;
  value.frame_counter = (uint64_t{1} << 40U) + 27U;
  value.evt_total = (uint64_t{1} << 33U) + 5U;
  value.new_evt = 1U;
  value.run_mode = RunMode::Live;
  value.imu.valid = true;
  value.imu.accel_g.x = 0.125f;
  value.imu.accel_g.y = -0.5f;
  value.imu.accel_g.z = 0.75f;
  value.mass.fill = 0.375f;
  value.mass.pos_norm.x = -0.625f;
  value.mass.pos_norm.y = 0.25f;
  value.audio.active_output_channels = 4U;
  value.tilt_servo.state = TiltServoState::Armed;
  value.tilt_servo.devices[0].id = 1U;
  value.tilt_servo.devices[1].id = 2U;
  value.tilt_servo.devices[0].status_valid = true;
  value.tilt_servo.devices[0].torque_enabled = true;
  value.tilt_servo.devices[0].present_position_raw = 2100;
  value.tilt_servo.devices[1].present_current_ma = -123;
  return value;
}

SystemParams params() {
  SystemParams value{};
  value.container.family = MaterialFamily::Granular;
  value.container.span_x_m = 0.125f;
  value.container.span_y_m = 0.25f;
  value.container.span_z_m = 0.0625f;
  value.container.headspace = 0.625f;
  value.container.viscosity = 0.25f;
  value.container.particle_count = 0.75f;
  value.container.particle_hardness = 0.875f;
  value.features.enable_coherent_container_demo = true;
  value.features.enable_device_frame_transform = true;
  return value;
}

EspNowTelemetryPacketV3 packet() {
  return encodeEspNowTelemetryPacketV3(snapshot(), 77U,
                                       makeEspNowResolvedState(params()));
}

void seal(EspNowTelemetryPacketV3& value) {
  value.crc32 = espNowTelemetryCrc32(&value, offsetof(EspNowTelemetryPacketV3, crc32));
}

void expectInvalid(EspNowTelemetryPacketV3 value) {
  seal(value);  // These checks exercise semantics, not just the checksum.
  CHECK(!validateEspNowTelemetryPacketV3(&value, sizeof(value)));
}

void testVersionsAndPrefix() {
  const auto source = snapshot();
  const auto v1 = encodeEspNowTelemetryPacketV1(source, 77U);
  const auto v2 = encodeEspNowTelemetryPacketV2(source, 77U);
  const auto v3 = packet();
  CHECK(sizeof(v1) == 164U && sizeof(v2) == 200U && sizeof(v3) == 230U);
  CHECK(sizeof(v3) <= 250U);
  CHECK(validateEspNowTelemetryPacketV1(&v1, sizeof(v1)));
  CHECK(validateEspNowTelemetryPacketV2(&v2, sizeof(v2)));
  CHECK(validateEspNowTelemetryPacketV3(&v3, sizeof(v3)));
  CHECK(!validateEspNowTelemetryPacketV1(&v3, sizeof(v3)));
  CHECK(!validateEspNowTelemetryPacketV2(&v3, sizeof(v3)));
  CHECK(!validateEspNowTelemetryPacketV3(&v1, sizeof(v1)));
  CHECK(!validateEspNowTelemetryPacketV3(&v2, sizeof(v2)));
  const auto* before = reinterpret_cast<const unsigned char*>(&v2);
  const auto* after = reinterpret_cast<const unsigned char*>(&v3);
  CHECK(std::memcmp(before, after, 4U) == 0);
  CHECK(std::memcmp(before + 7U, after + 7U, 189U) == 0);
  CHECK(v3.frame_counter == source.frame_counter);
  CHECK(v3.evt_total == source.evt_total);
  CHECK(v3.tilt_present_current_ma[1] == -123);
  CHECK(v3.imu_accel_g[0] == source.imu.accel_g.x);  // No hidden frame rotation.
  CHECK(v3.mass_fill == source.mass.fill);
}

void testResolvedConfigurationAndOffsets() {
  const auto value = packet();
  const auto& r = value.resolved;
  CHECK(r.family == 1U && r.model_flags == 3U);
  CHECK(r.span_x_m == 0.125f && r.span_y_m == 0.25f && r.span_z_m == 0.0625f);
  CHECK(r.headspace == 0.625f && r.viscosity == 0.25f);
  CHECK(r.particle_count == 0.75f && r.particle_hardness == 0.875f);
  const auto* bytes = reinterpret_cast<const unsigned char*>(&value);
  CHECK(bytes[4] == 230U && bytes[5] == 0U && bytes[6] == 3U);
  CHECK(bytes[196] == 1U && bytes[197] == 3U);
  float decoded = 0.0f;
  std::memcpy(&decoded, bytes + 198U, sizeof(decoded));
  CHECK(decoded == r.span_x_m);
  std::memcpy(&decoded, bytes + 222U, sizeof(decoded));
  CHECK(decoded == r.particle_hardness);
  CHECK(value.crc32 == espNowTelemetryCrc32(bytes, 226U));

  auto changed = params();
  changed.container.family = MaterialFamily::Liquid;
  changed.container.span_x_m = 0.045f;
  changed.features.enable_coherent_container_demo = false;
  changed.features.enable_device_frame_transform = false;
  const auto resolved = makeEspNowResolvedState(changed);
  CHECK(resolved.family == 0U && resolved.model_flags == 0U);
  CHECK(resolved.span_x_m == changed.container.span_x_m);
}

void testEnvelopeAndCrc() {
  auto value = packet();
  CHECK(!validateEspNowTelemetryPacketV3(nullptr, sizeof(value)));
  CHECK(!validateEspNowTelemetryPacketV3(&value, sizeof(value) - 1U));
  CHECK(!validateEspNowTelemetryPacketV3(&value, sizeof(value) + 1U));
  value.resolved.viscosity += 0.125f;
  CHECK(!validateEspNowTelemetryPacketV3(&value, sizeof(value)));
  value = packet(); value.magic ^= 1U; expectInvalid(value);
  value = packet(); value.packet_size = 200U; expectInvalid(value);
  value = packet(); value.version = 2U; expectInvalid(value);
  value = packet(); value.flags = 1U; expectInvalid(value);
  value = packet(); value.resolved.family = 5U; expectInvalid(value);
  for (unsigned bit = 2U; bit < 8U; ++bit) {
    value = packet(); value.resolved.model_flags |= 1U << bit; expectInvalid(value);
  }
}

void testNumericValidation() {
  const float invalid_spans[]{0.0f, -0.01f,
      std::numeric_limits<float>::infinity(), std::numeric_limits<float>::quiet_NaN()};
  const std::size_t span_offsets[]{offsetof(EspNowResolvedState, span_x_m),
      offsetof(EspNowResolvedState, span_y_m), offsetof(EspNowResolvedState, span_z_m)};
  for (std::size_t offset : span_offsets) {
    for (float invalid : invalid_spans) {
      auto value = packet();
      std::memcpy(reinterpret_cast<unsigned char*>(&value.resolved) + offset,
                   &invalid, sizeof(invalid));
      expectInvalid(value);
    }
  }
  const float invalid_units[]{-0.01f, 1.01f,
      std::numeric_limits<float>::infinity(), std::numeric_limits<float>::quiet_NaN()};
  const std::size_t unit_offsets[]{offsetof(EspNowTelemetryPacketV3, mass_fill),
      196U + offsetof(EspNowResolvedState, headspace),
      196U + offsetof(EspNowResolvedState, viscosity),
      196U + offsetof(EspNowResolvedState, particle_count),
      196U + offsetof(EspNowResolvedState, particle_hardness)};
  for (std::size_t offset : unit_offsets) {
    for (float invalid : invalid_units) {
      auto value = packet();
      std::memcpy(reinterpret_cast<unsigned char*>(&value) + offset,
                   &invalid, sizeof(invalid));
      expectInvalid(value);
    }
    for (float boundary : {0.0f, 1.0f}) {
      auto value = packet();
      std::memcpy(reinterpret_cast<unsigned char*>(&value) + offset,
                   &boundary, sizeof(boundary));
      seal(value);
      CHECK(validateEspNowTelemetryPacketV3(&value, sizeof(value)));
    }
  }
}

void testInheritedValidation() {
  auto value = packet(); value.tilt_reserved = 1U; expectInvalid(value);
  value = packet(); value.tilt_device_flags = 0x80U; expectInvalid(value);
  value = packet(); value.tilt_servo_state = 255U; expectInvalid(value);
  value = packet(); value.tilt_servo_fault = 255U; expectInvalid(value);
  value = packet(); value.tilt_device_id[0] = 253U; expectInvalid(value);
  value = packet(); value.active_preset[31] = 'x'; expectInvalid(value);
  value = packet(); value.run_mode = 255U; expectInvalid(value);
  value = packet(); value.imu_valid = 2U; expectInvalid(value);
  value = packet(); value.imu_accel_g[0] = std::numeric_limits<float>::quiet_NaN(); expectInvalid(value);
}

}  // namespace

int main() {
  testVersionsAndPrefix();
  testResolvedConfigurationAndOffsets();
  testEnvelopeAndCrc();
  testNumericValidation();
  testInheritedValidation();
  std::puts("ESP-NOW resolved v3: 5 regression groups passed (v1/v2 compatibility retained).");
  return 0;
}
