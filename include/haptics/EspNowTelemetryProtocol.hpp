#pragma once

#include <cstddef>
#include <cstdint>
#include <limits>

#include "haptics/Types.hpp"

namespace haptics {

constexpr uint32_t kEspNowTelemetryMagic = 0x31544846U;  // "FHT1" little-endian.
constexpr uint8_t kEspNowTelemetryVersionV1 = 1U;
constexpr uint8_t kEspNowTelemetryVersionV2 = 2U;
constexpr uint8_t kEspNowTelemetryVersionV3 = 3U;
constexpr uint8_t kEspNowTelemetryVersion = kEspNowTelemetryVersionV1;
constexpr std::size_t kEspNowTelemetryMaximumPacketBytes = 250U;
constexpr uint8_t kEspNowResolvedCoherentContainer = 1U << 0U;
constexpr uint8_t kEspNowResolvedDeviceFrameTransform = 1U << 1U;

struct SystemParams;

#pragma pack(push, 1)
struct EspNowTelemetryPacketV1 {
  uint32_t magic = kEspNowTelemetryMagic;
  uint16_t packet_size = 0U;
  uint8_t version = kEspNowTelemetryVersion;
  uint8_t flags = 0U;
  uint32_t sequence = 0U;
  uint32_t timestamp_ms = 0U;
  uint64_t frame_counter = 0U;
  uint16_t new_evt = 0U;
  uint64_t evt_total = 0U;
  char active_preset[32]{};
  uint8_t run_mode = 0U;
  uint8_t imu_valid = 0U;
  float imu_accel_g[3]{};
  float imu_gyro_dps[3]{};
  float mass_pos_norm[2]{};
  float mass_vel_norm_s[2]{};
  float mass_energy = 0.0f;
  float mass_fill = 0.0f;
  uint8_t last_event_type = 0U;
  uint8_t last_event_primary_wall = 0U;
  float last_event_amplitude = 0.0f;
  float actuators[4]{};
  uint8_t audio_compile_enabled = 0U;
  uint8_t audio_driver_installed = 0U;
  uint8_t audio_runtime_enabled = 0U;
  uint8_t audio_output_silenced = 1U;
  uint8_t audio_test_mode = 0U;
  uint8_t audio_demo_compat_mode = 0U;
  uint8_t audio_transport = 0U;
  uint8_t audio_output_layout = 0U;
  uint8_t audio_active_output_channels = 0U;
  uint8_t audio_test_wall = 0U;
  float audio_output_peak_limit = 0.0f;
  uint32_t audio_underrun_count = 0U;
  uint8_t safety_imu_stale_safe_stop = 0U;
  uint8_t safety_imu_fault_injection_active = 0U;
  uint8_t safety_audio_zero_asserted = 1U;
  uint8_t safety_tilt_disarmed = 1U;
  uint32_t crc32 = 0U;
};

// Wire v2 preserves every v1 offset through safety_tilt_disarmed (byte 159)
// and uses the former CRC position onward for compact DXL2 health telemetry.
struct EspNowTelemetryPacketV2 {
  uint32_t magic = kEspNowTelemetryMagic;
  uint16_t packet_size = 0U;
  uint8_t version = kEspNowTelemetryVersionV2;
  uint8_t flags = 0U;
  uint32_t sequence = 0U;
  uint32_t timestamp_ms = 0U;
  uint64_t frame_counter = 0U;
  uint16_t new_evt = 0U;
  uint64_t evt_total = 0U;
  char active_preset[32]{};
  uint8_t run_mode = 0U;
  uint8_t imu_valid = 0U;
  float imu_accel_g[3]{};
  float imu_gyro_dps[3]{};
  float mass_pos_norm[2]{};
  float mass_vel_norm_s[2]{};
  float mass_energy = 0.0f;
  float mass_fill = 0.0f;
  uint8_t last_event_type = 0U;
  uint8_t last_event_primary_wall = 0U;
  float last_event_amplitude = 0.0f;
  float actuators[4]{};
  uint8_t audio_compile_enabled = 0U;
  uint8_t audio_driver_installed = 0U;
  uint8_t audio_runtime_enabled = 0U;
  uint8_t audio_output_silenced = 1U;
  uint8_t audio_test_mode = 0U;
  uint8_t audio_demo_compat_mode = 0U;
  uint8_t audio_transport = 0U;
  uint8_t audio_output_layout = 0U;
  uint8_t audio_active_output_channels = 0U;
  uint8_t audio_test_wall = 0U;
  float audio_output_peak_limit = 0.0f;
  uint32_t audio_underrun_count = 0U;
  uint8_t safety_imu_stale_safe_stop = 0U;
  uint8_t safety_imu_fault_injection_active = 0U;
  uint8_t safety_audio_zero_asserted = 1U;
  uint8_t safety_tilt_disarmed = 1U;
  uint8_t tilt_servo_state = 0U;
  uint8_t tilt_servo_fault = 0U;
  uint8_t tilt_device_flags = 0U;  // valid[1:0], torque[3:2]
  uint8_t tilt_reserved = 0U;
  uint16_t tilt_communication_errors = 0U;
  uint16_t tilt_command_age_ms = 0U;
  uint16_t tilt_status_age_ms = 0U;
  uint8_t tilt_device_id[2]{};
  uint16_t tilt_present_position_raw[2]{};
  uint16_t tilt_goal_position_raw[2]{};
  uint16_t tilt_home_position_raw[2]{};
  int16_t tilt_present_current_ma[2]{};
  uint8_t tilt_input_voltage_decivolt[2]{};
  uint8_t tilt_temperature_c[2]{};
  uint8_t tilt_hardware_error[2]{};
  uint8_t tilt_operating_mode[2]{};
  uint32_t crc32 = 0U;
};
// Applied configuration, not client guesses or a second simulation state.
// Fill remains in the common mass_fill field; raw IMU values remain unchanged.
struct EspNowResolvedState {
  uint8_t family = 0U;
  uint8_t model_flags = 0U;
  float span_x_m = 0.0f;
  float span_y_m = 0.0f;
  float span_z_m = 0.0f;
  float headspace = 0.0f;
  float viscosity = 0.0f;
  float particle_count = 0.0f;
  float particle_hardness = 0.0f;
};

// v3 retains v2 offsets through byte 195, replacing its CRC with resolved
// configuration. Keep explicit fields so all versions are standard-layout.
struct EspNowTelemetryPacketV3 {
  uint32_t magic = kEspNowTelemetryMagic;
  uint16_t packet_size = 0U;
  uint8_t version = kEspNowTelemetryVersionV3;
  uint8_t flags = 0U;
  uint32_t sequence = 0U;
  uint32_t timestamp_ms = 0U;
  uint64_t frame_counter = 0U;
  uint16_t new_evt = 0U;
  uint64_t evt_total = 0U;
  char active_preset[32]{};
  uint8_t run_mode = 0U;
  uint8_t imu_valid = 0U;
  float imu_accel_g[3]{};
  float imu_gyro_dps[3]{};
  float mass_pos_norm[2]{};
  float mass_vel_norm_s[2]{};
  float mass_energy = 0.0f;
  float mass_fill = 0.0f;
  uint8_t last_event_type = 0U;
  uint8_t last_event_primary_wall = 0U;
  float last_event_amplitude = 0.0f;
  float actuators[4]{};
  uint8_t audio_compile_enabled = 0U;
  uint8_t audio_driver_installed = 0U;
  uint8_t audio_runtime_enabled = 0U;
  uint8_t audio_output_silenced = 1U;
  uint8_t audio_test_mode = 0U;
  uint8_t audio_demo_compat_mode = 0U;
  uint8_t audio_transport = 0U;
  uint8_t audio_output_layout = 0U;
  uint8_t audio_active_output_channels = 0U;
  uint8_t audio_test_wall = 0U;
  float audio_output_peak_limit = 0.0f;
  uint32_t audio_underrun_count = 0U;
  uint8_t safety_imu_stale_safe_stop = 0U;
  uint8_t safety_imu_fault_injection_active = 0U;
  uint8_t safety_audio_zero_asserted = 1U;
  uint8_t safety_tilt_disarmed = 1U;
  uint8_t tilt_servo_state = 0U;
  uint8_t tilt_servo_fault = 0U;
  uint8_t tilt_device_flags = 0U;
  uint8_t tilt_reserved = 0U;
  uint16_t tilt_communication_errors = 0U;
  uint16_t tilt_command_age_ms = 0U;
  uint16_t tilt_status_age_ms = 0U;
  uint8_t tilt_device_id[2]{};
  uint16_t tilt_present_position_raw[2]{};
  uint16_t tilt_goal_position_raw[2]{};
  uint16_t tilt_home_position_raw[2]{};
  int16_t tilt_present_current_ma[2]{};
  uint8_t tilt_input_voltage_decivolt[2]{};
  uint8_t tilt_temperature_c[2]{};
  uint8_t tilt_hardware_error[2]{};
  uint8_t tilt_operating_mode[2]{};
  EspNowResolvedState resolved{};
  uint32_t crc32 = 0U;
};
#pragma pack(pop)

static_assert(sizeof(float) == 4U, "ESP-NOW telemetry requires IEEE-754 binary32 floats");
static_assert(std::numeric_limits<float>::is_iec559,
              "ESP-NOW telemetry requires IEEE-754 floats");
static_assert(sizeof(EspNowTelemetryPacketV1) == 164U,
              "ESP-NOW wire-v1 packet layout changed");
static_assert(offsetof(EspNowTelemetryPacketV1, active_preset) == 34U,
              "ESP-NOW wire-v1 preset offset changed");
static_assert(offsetof(EspNowTelemetryPacketV1, imu_accel_g) == 68U,
              "ESP-NOW wire-v1 IMU offset changed");
static_assert(offsetof(EspNowTelemetryPacketV1, actuators) == 122U,
              "ESP-NOW wire-v1 actuator offset changed");
static_assert(offsetof(EspNowTelemetryPacketV1, audio_compile_enabled) == 138U,
              "ESP-NOW wire-v1 audio offset changed");
static_assert(offsetof(EspNowTelemetryPacketV1, crc32) == 160U,
              "ESP-NOW wire-v1 CRC offset changed");
static_assert(sizeof(EspNowTelemetryPacketV1) <= kEspNowTelemetryMaximumPacketBytes,
              "ESP-NOW wire-v1 must remain below the v1-compatible payload bound");
static_assert(sizeof(EspNowTelemetryPacketV2) == 200U,
              "ESP-NOW wire-v2 packet layout changed");
static_assert(offsetof(EspNowTelemetryPacketV2, safety_tilt_disarmed) == 159U,
              "ESP-NOW wire-v2 common prefix changed");
static_assert(offsetof(EspNowTelemetryPacketV2, tilt_servo_state) == 160U,
              "ESP-NOW wire-v2 tilt extension offset changed");
static_assert(offsetof(EspNowTelemetryPacketV2, crc32) == 196U,
              "ESP-NOW wire-v2 CRC offset changed");
static_assert(sizeof(EspNowTelemetryPacketV2) <= kEspNowTelemetryMaximumPacketBytes,
              "ESP-NOW wire-v2 exceeds the transport payload bound");
static_assert(sizeof(EspNowResolvedState) == 30U,
              "ESP-NOW resolved-state layout changed");
static_assert(sizeof(EspNowTelemetryPacketV3) == 230U,
              "ESP-NOW wire-v3 packet layout changed");
static_assert(offsetof(EspNowTelemetryPacketV3, tilt_servo_state) == 160U,
              "ESP-NOW wire-v3 common prefix changed");
static_assert(offsetof(EspNowTelemetryPacketV3, resolved) == 196U,
              "ESP-NOW wire-v3 resolved extension offset changed");
static_assert(offsetof(EspNowTelemetryPacketV3, crc32) == 226U,
              "ESP-NOW wire-v3 CRC offset changed");
static_assert(sizeof(EspNowTelemetryPacketV3) <= kEspNowTelemetryMaximumPacketBytes,
              "ESP-NOW wire-v3 exceeds the transport payload bound");

uint32_t espNowTelemetryCrc32(const void* data, std::size_t length);
EspNowTelemetryPacketV1 encodeEspNowTelemetryPacketV1(
    const TelemetrySnapshot& snapshot,
    uint32_t sequence);
bool validateEspNowTelemetryPacketV1(const void* data, std::size_t length);
EspNowTelemetryPacketV2 encodeEspNowTelemetryPacketV2(
    const TelemetrySnapshot& snapshot,
    uint32_t sequence);
bool validateEspNowTelemetryPacketV2(const void* data, std::size_t length);
EspNowResolvedState makeEspNowResolvedState(const SystemParams& params);
EspNowTelemetryPacketV3 encodeEspNowTelemetryPacketV3(
    const TelemetrySnapshot& snapshot,
    uint32_t sequence,
    const EspNowResolvedState& resolved);
bool validateEspNowTelemetryPacketV3(const void* data, std::size_t length);

}  // namespace haptics
