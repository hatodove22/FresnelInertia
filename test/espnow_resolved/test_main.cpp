#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>

#include "haptics/EspNowTelemetryProtocol.hpp"
#include "haptics/Parameters.hpp"
#ifdef HAPTICS_TEST_DEMO_JSON
#include "haptics/DemoTelemetryJson.hpp"
#endif

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

void testServoRetryUsesExistingWireFields() {
  auto source = snapshot();
  source.tilt_servo.state = TiltServoState::Checking;
  source.tilt_servo.fault = TiltServoFault::Communication;
  source.tilt_servo.runtime_requested = true;
  source.tilt_servo.communication_errors = 3;
  source.tilt_servo.devices[0].status_valid = false;
  source.safety.tilt_disarmed = false;
  const auto v2 = encodeEspNowTelemetryPacketV2(source, 78U);
  const auto v3 = encodeEspNowTelemetryPacketV3(source, 78U, makeEspNowResolvedState(params()));
  const auto v4 = encodeEspNowTelemetryPacketV4(source, 78U, makeEspNowResolvedState(params()));
  CHECK(validateEspNowTelemetryPacketV2(&v2, sizeof(v2)));
  CHECK(validateEspNowTelemetryPacketV3(&v3, sizeof(v3)));
  CHECK(validateEspNowTelemetryPacketV4(&v4, sizeof(v4)));
  CHECK(v2.tilt_servo_state == 1 && v2.tilt_servo_fault == 2);
  CHECK(v2.safety_tilt_disarmed == 0 && v2.tilt_communication_errors == 3);
  CHECK((v2.tilt_device_flags & 1U) == 0);  // Missing feedback is not healthy.
  CHECK(v2.tilt_reserved == 0 && v3.tilt_reserved == 0 && v4.tilt_reserved == 0);
  CHECK(v3.tilt_servo_state == v2.tilt_servo_state && v4.tilt_servo_fault == v2.tilt_servo_fault);
  // A hard stop remains distinct without extending enums or the 250-byte wire.
  source.tilt_servo.state = TiltServoState::FaultLatched;
  source.safety.tilt_disarmed = true;
  const auto stopped = encodeEspNowTelemetryPacketV3(source, 79U, makeEspNowResolvedState(params()));
  CHECK(validateEspNowTelemetryPacketV3(&stopped, sizeof(stopped)));
  CHECK(stopped.tilt_servo_state == 5 && stopped.tilt_servo_fault == 2 && stopped.safety_tilt_disarmed == 1);
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

EspNowTelemetryPacketV4 demoPacket() {
  auto source = snapshot();
  source.last_event.type = EventType::PressurePop;
  source.mass.pile_slope = -0.625f;
  source.mass.granular_flow = 0.375f;
  source.mass.granular_pile_active = true;
  source.mass.pressure.enabled = true;
  source.mass.pressure.phase = PressurePhase::Burst;
  source.mass.pressure.charge = 0.875f;
  source.mass.pressure.phase_s = 1.234f;
  source.mass.pressure.remaining = 0.25f;
  source.mass.pressure.burst_sequence = 412U;
  return encodeEspNowTelemetryPacketV4(source, 77U, makeEspNowResolvedState(params()));
}

void seal(EspNowTelemetryPacketV4& value) {
  value.crc32 = espNowTelemetryCrc32(&value, offsetof(EspNowTelemetryPacketV4, crc32));
}

void expectInvalid(EspNowTelemetryPacketV4 value) {
  seal(value);
  CHECK(!validateEspNowTelemetryPacketV4(&value, sizeof(value)));
}

void testV4PrefixAndRoundTrip() {
  auto source = snapshot();
  source.last_event.type = EventType::PressurePop;
  const auto v3 = encodeEspNowTelemetryPacketV3(source, 77U, makeEspNowResolvedState(params()));
  const auto v4 = demoPacket();
  CHECK(sizeof(v4) == 250U && v4.version == 4U);
  CHECK(validateEspNowTelemetryPacketV3(&v3, sizeof(v3)));
  CHECK(validateEspNowTelemetryPacketV4(&v4, sizeof(v4)));
  CHECK(!validateEspNowTelemetryPacketV3(&v4, sizeof(v4)));
  CHECK(!validateEspNowTelemetryPacketV4(&v3, sizeof(v3)));
  const auto* before = reinterpret_cast<const unsigned char*>(&v3);
  const auto* after = reinterpret_cast<const unsigned char*>(&v4);
  CHECK(std::memcmp(before, after, 4U) == 0);
  CHECK(std::memcmp(before + 7U, after + 7U, 219U) == 0);
  CHECK(v4.last_event_type == 7U && v4.demo.flags == 3U);
  CHECK(after[238] == 0xD2U && after[239] == 0x04U); // 1234 ms
  CHECK(after[240] == 0x9CU && after[241] == 0x01U); // sequence 412
  CHECK(after[242] == 1U && after[243] == 3U);
  CHECK(after[244] == 0U && after[245] == 0x40U); // 16384 / 65535
  const auto decoded = decodeEspNowDemoState(v4.demo);
  CHECK(decoded.granular_pile_active && decoded.pressure.enabled);
  CHECK(decoded.pile_slope == -0.625f && decoded.granular_flow == 0.375f);
  CHECK(decoded.pressure.phase == PressurePhase::Burst && decoded.pressure.charge == 0.875f);
  CHECK(std::abs(decoded.pressure.phase_s - 1.234f) < 0.00001f);
  CHECK(std::abs(decoded.pressure.remaining - 0.25f) <= 0.5f / 65535.0f);
  CHECK(decoded.pressure.burst_sequence == 412U);
}

void testV4ValidationAndSaturation() {
  auto v4 = demoPacket();
  CHECK(!validateEspNowTelemetryPacketV4(nullptr, sizeof(v4)));
  CHECK(!validateEspNowTelemetryPacketV4(&v4, sizeof(v4) - 1U));
  v4.demo.pressure_charge -= 0.1f;
  CHECK(!validateEspNowTelemetryPacketV4(&v4, sizeof(v4)));
  v4 = demoPacket(); v4.version = 3U; expectInvalid(v4);
  v4 = demoPacket(); v4.packet_size = 230U; expectInvalid(v4);
  v4 = demoPacket(); v4.magic = 0U; expectInvalid(v4);
  v4 = demoPacket(); v4.last_event_type = 8U; expectInvalid(v4);
  v4 = demoPacket(); v4.tilt_reserved = 1U; expectInvalid(v4);
  v4 = demoPacket(); v4.resolved.span_x_m = 0.0f; expectInvalid(v4);
  v4 = demoPacket(); v4.demo.pressure_phase = 3U; expectInvalid(v4);
  for (unsigned bit = 2U; bit < 8U; ++bit) {
    v4 = demoPacket(); v4.demo.flags = 1U << bit; expectInvalid(v4);
  }
  for (float invalid : {-0.01f, 1.01f, std::numeric_limits<float>::infinity(), std::numeric_limits<float>::quiet_NaN()}) {
    v4 = demoPacket(); v4.demo.pressure_charge = invalid; expectInvalid(v4);
    v4 = demoPacket(); v4.demo.granular_flow = invalid; expectInvalid(v4);
  }
  v4 = demoPacket(); v4.demo.pile_slope = std::numeric_limits<float>::quiet_NaN(); expectInvalid(v4);
  auto source = snapshot();
  source.mass.pressure.enabled = true;
  source.mass.pressure.phase_s = 100.0f;
  source.mass.pressure.remaining = 1.0f;
  source.mass.pressure.phase = PressurePhase::Spent;
  v4 = encodeEspNowTelemetryPacketV4(source, 1U, makeEspNowResolvedState(params()));
  CHECK(v4.demo.pressure_phase_ms == 65535U && v4.demo.pressure_remaining == 65535U);
  CHECK(v4.demo.flags == kEspNowDemoPressure && validateEspNowTelemetryPacketV4(&v4, sizeof(v4)));
  CHECK(decodeEspNowDemoState(v4.demo).pressure.phase == PressurePhase::Spent);
  source.mass.pressure.phase_s = 0.0f; source.mass.pressure.remaining = 0.0f;
  v4 = encodeEspNowTelemetryPacketV4(source, 1U, makeEspNowResolvedState(params()));
  CHECK(v4.demo.pressure_phase_ms == 0U && v4.demo.pressure_remaining == 0U);
}

EspNowTelemetryPacketV5 heartbeatPacket() {
  auto source = snapshot();
  std::strcpy(source.active_preset, "heartbeat_soft_object");
  source.last_event.type = EventType::HeartbeatPulse;
  source.last_event.primary_wall = WallId::None;
  auto& heartbeat = source.mass.heartbeat;
  heartbeat.enabled = true;
  heartbeat.phase = 0.125f;
  heartbeat.bpm = 72.0f;
  heartbeat.beat_sequence = 0x12345678U;
  heartbeat.primary = 0.875f;
  heartbeat.secondary = 0.25f;
  heartbeat.contraction = 0.625f;
  return encodeEspNowTelemetryPacketV5(source, 79U, makeEspNowResolvedState(params()));
}

void seal(EspNowTelemetryPacketV5& value) {
  value.crc32 = espNowTelemetryCrc32(&value, offsetof(EspNowTelemetryPacketV5, crc32));
}

void expectInvalid(EspNowTelemetryPacketV5 value) {
  seal(value);
  CHECK(!validateEspNowTelemetryPacketV5(&value, sizeof(value)));
}

void testV5PrefixAndRoundTrip() {
  const auto v5 = heartbeatPacket();
  CHECK(sizeof(v5) == 250U && v5.version == 5U);
  CHECK(validateEspNowTelemetryPacketV5(&v5, sizeof(v5)));
  const auto v4 = demoPacket();
  CHECK(!validateEspNowTelemetryPacketV4(&v5, sizeof(v5)));
  CHECK(!validateEspNowTelemetryPacketV5(&v4, sizeof(v4)));
  CHECK(!validateEspNowTelemetryPacketV3(&v5, sizeof(v5)));
  // Reconstruct v3's identical common prefix, with the one v5-only event reset.
  auto source = snapshot();
  std::strcpy(source.active_preset, "heartbeat_soft_object");
  source.last_event.primary_wall = WallId::None;
  const auto v3 = encodeEspNowTelemetryPacketV3(source, 79U, makeEspNowResolvedState(params()));
  auto common = v5;
  common.version = v3.version;
  common.packet_size = v3.packet_size;
  common.last_event_type = v3.last_event_type;
  CHECK(std::memcmp(&common, &v3, offsetof(EspNowTelemetryPacketV3, crc32)) == 0);
  const auto* bytes = reinterpret_cast<const unsigned char*>(&v5);
  CHECK(bytes[234] == 0x78U && bytes[235] == 0x56U && bytes[236] == 0x34U && bytes[237] == 0x12U);
  CHECK(bytes[244] == 1U && bytes[245] == 0U);
  CHECK(v5.crc32 == espNowTelemetryCrc32(bytes, 246U));
  const auto decoded = decodeEspNowHeartbeatState(v5.heartbeat);
  CHECK(decoded.enabled && decoded.phase == 0.125f && decoded.bpm == 72.0f);
  CHECK(decoded.beat_sequence == 0x12345678U);
  CHECK(std::fabs(decoded.primary - 0.875f) <= 0.5f / 65535.0f);
  CHECK(std::fabs(decoded.secondary - 0.25f) <= 0.5f / 65535.0f);
  CHECK(std::fabs(decoded.contraction - 0.625f) <= 0.5f / 65535.0f);
  CHECK(!decodeEspNowDemoState(v4.demo).heartbeat.enabled);
}

void testV5MalformedAndBounds() {
  auto value = heartbeatPacket();
  CHECK(!validateEspNowTelemetryPacketV5(nullptr, sizeof(value)));
  CHECK(!validateEspNowTelemetryPacketV5(&value, sizeof(value) - 1U));
  CHECK(!validateEspNowTelemetryPacketV5(&value, sizeof(value) + 1U));
  value.heartbeat.beat_sequence++;
  CHECK(!validateEspNowTelemetryPacketV5(&value, sizeof(value)));
  value = heartbeatPacket(); value.version = 4U; expectInvalid(value);
  value = heartbeatPacket(); value.packet_size = 230U; expectInvalid(value);
  value = heartbeatPacket(); value.magic = 0U; expectInvalid(value);
  value = heartbeatPacket(); value.flags = 1U; expectInvalid(value);
  value = heartbeatPacket(); value.heartbeat.enabled = 0U; expectInvalid(value);
  value = heartbeatPacket(); value.heartbeat.enabled = 2U; expectInvalid(value);
  value = heartbeatPacket(); value.heartbeat.reserved = 1U; expectInvalid(value);
  value = heartbeatPacket(); value.tilt_reserved = 1U; expectInvalid(value);
  value = heartbeatPacket(); value.resolved.span_x_m = 0.0f; expectInvalid(value);
  value = heartbeatPacket(); value.last_event_type = 9U; expectInvalid(value);
  value = heartbeatPacket(); value.last_event_primary_wall = static_cast<uint8_t>(WallId::Top); expectInvalid(value);
  for (float invalid : {-0.01f, 1.0f, 1.1f, std::numeric_limits<float>::infinity(), std::numeric_limits<float>::quiet_NaN()}) {
    value = heartbeatPacket(); value.heartbeat.phase = invalid; expectInvalid(value);
  }
  for (float invalid : {39.9f, 140.1f, std::numeric_limits<float>::infinity(), std::numeric_limits<float>::quiet_NaN()}) {
    value = heartbeatPacket(); value.heartbeat.bpm = invalid; expectInvalid(value);
  }
  for (float bpm : {40.0f, 140.0f}) for (float phase : {0.0f, 0.999999f}) {
    value = heartbeatPacket(); value.heartbeat.bpm = bpm; value.heartbeat.phase = phase;
    value.heartbeat.primary = 0U; value.heartbeat.secondary = UINT16_MAX;
    value.heartbeat.contraction = UINT16_MAX; value.heartbeat.beat_sequence = UINT32_MAX;
    seal(value);
    CHECK(validateEspNowTelemetryPacketV5(&value, sizeof(value)));
    const auto decoded = decodeEspNowHeartbeatState(value.heartbeat);
    CHECK(decoded.primary == 0.0f && decoded.secondary == 1.0f && decoded.contraction == 1.0f);
    CHECK(decoded.beat_sequence == UINT32_MAX);
  }
}

#ifdef HAPTICS_TEST_DEMO_JSON
void testCanonicalDemoJson() {
  StaticJsonDocument<3072> doc;
  auto mass = doc.createNestedObject("mass");
  appendDemoTelemetryJson(mass, MassState{});
  CHECK(!mass.containsKey("demo"));
  const auto value = decodeEspNowDemoState(demoPacket().demo);
  appendDemoTelemetryJson(mass, value);
  CHECK(!doc.overflowed());
  CHECK(mass["demo"]["pile_slope"].as<float>() == value.pile_slope);
  CHECK(mass["demo"]["granular_flow"].as<float>() == value.granular_flow);
  CHECK(mass["demo"]["granular_pile_active"].as<bool>());
  const auto pressure = mass["demo"]["pressure"].as<JsonObjectConst>();
  CHECK(pressure.size() == 6U && pressure["enabled"].as<bool>());
  CHECK(std::strcmp(pressure["phase"].as<const char*>(), "burst") == 0);
  CHECK(pressure["charge"].as<float>() == value.pressure.charge);
  CHECK(pressure["phase_s"].as<float>() == value.pressure.phase_s);
  CHECK(pressure["remaining"].as<float>() == value.pressure.remaining);
  CHECK(pressure["burst_sequence"].as<uint16_t>() == value.pressure.burst_sequence);
  char json[512]{};
  CHECK(serializeJson(doc, json, sizeof(json)) < sizeof(json) - 1U);
  CHECK(std::strstr(json, "\"burst_sequence\":412") != nullptr);
  doc.clear(); // Same reuse policy as the bridge when the next packet is v3.
  mass = doc.createNestedObject("mass");
  appendDemoTelemetryJson(mass, MassState{});
  CHECK(!mass.containsKey("demo"));
  CHECK(!mass.containsKey("heartbeat"));
  std::puts("Canonical demo JSON: optional state, names, values and reuse passed.");
}

void testCanonicalHeartbeatJson() {
  StaticJsonDocument<3072> doc;
  auto mass = doc.createNestedObject("mass");
  MassState state{};
  state.heartbeat = decodeEspNowHeartbeatState(heartbeatPacket().heartbeat);
  appendDemoTelemetryJson(mass, state);
  CHECK(!doc.overflowed() && !mass.containsKey("demo"));
  const auto heartbeat = mass["heartbeat"].as<JsonObjectConst>();
  CHECK(heartbeat.size() == 7U && heartbeat["enabled"].as<bool>());
  CHECK(heartbeat["phase"].as<float>() == state.heartbeat.phase);
  CHECK(heartbeat["bpm"].as<float>() == state.heartbeat.bpm);
  CHECK(heartbeat["beat_sequence"].as<uint32_t>() == state.heartbeat.beat_sequence);
  CHECK(heartbeat["primary"].as<float>() == state.heartbeat.primary);
  CHECK(heartbeat["secondary"].as<float>() == state.heartbeat.secondary);
  CHECK(heartbeat["contraction"].as<float>() == state.heartbeat.contraction);
  // Exercise serialized decimal precision too: a valid phase must not round
  // to 1, which correctly fails the browser's [0,1) heartbeat contract.
  state.heartbeat.phase = std::nextafter(1.0f, 0.0f);
  doc.clear(); mass = doc.createNestedObject("mass");
  appendDemoTelemetryJson(mass, state);
  char json[512]{};
  CHECK(serializeJson(doc, json, sizeof(json)) < sizeof(json) - 1U);
  StaticJsonDocument<1024> parsed;
  CHECK(!deserializeJson(parsed, json));
  CHECK(parsed["mass"]["heartbeat"]["phase"].as<double>() < 1.0);
  doc.clear();
  mass = doc.createNestedObject("mass");
  appendDemoTelemetryJson(mass, MassState{});
  CHECK(!mass.containsKey("heartbeat") && !mass.containsKey("demo"));
}
#endif

}  // namespace

int main() {
  testVersionsAndPrefix();
  testServoRetryUsesExistingWireFields();
  testResolvedConfigurationAndOffsets();
  testEnvelopeAndCrc();
  testNumericValidation();
  testInheritedValidation();
  testV4PrefixAndRoundTrip();
  testV4ValidationAndSaturation();
  testV5PrefixAndRoundTrip();
  testV5MalformedAndBounds();
#ifdef HAPTICS_TEST_DEMO_JSON
  testCanonicalDemoJson();
  testCanonicalHeartbeatJson();
#endif
  std::puts("ESP-NOW v3/v4/v5: 10 regression groups passed (v1-v4 compatibility retained).");
  return 0;
}
