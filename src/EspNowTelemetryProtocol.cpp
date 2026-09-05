#include "haptics/EspNowTelemetryProtocol.hpp"
#include "haptics/Parameters.hpp"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstring>

namespace haptics {
namespace {

uint8_t flag(bool value) {
  return value ? 1U : 0U;
}

bool isFlag(uint8_t value) {
  return value <= 1U;
}

bool isWall(uint8_t value) {
  return value <= static_cast<uint8_t>(WallId::Bottom) ||
         value == static_cast<uint8_t>(WallId::None);
}

bool finiteArray(const float* values, std::size_t count) {
  for (std::size_t i = 0; i < count; ++i) {
    if (!std::isfinite(values[i])) {
      return false;
    }
  }
  return true;
}

}  // namespace

uint32_t espNowTelemetryCrc32(const void* data, std::size_t length) {
  const auto* bytes = static_cast<const uint8_t*>(data);
  uint32_t crc = 0xffffffffU;
  for (std::size_t i = 0; i < length; ++i) {
    crc ^= bytes[i];
    for (uint8_t bit = 0U; bit < 8U; ++bit) {
      const uint32_t mask = 0U - (crc & 1U);
      crc = (crc >> 1U) ^ (0xedb88320U & mask);
    }
  }
  return ~crc;
}

EspNowTelemetryPacketV1 encodeEspNowTelemetryPacketV1(
    const TelemetrySnapshot& snapshot,
    uint32_t sequence) {
  EspNowTelemetryPacketV1 packet{};
  packet.packet_size = static_cast<uint16_t>(sizeof(packet));
  packet.sequence = sequence;
  packet.timestamp_ms = snapshot.timestamp_ms;
  packet.frame_counter = snapshot.frame_counter;
  packet.new_evt = snapshot.new_evt;
  packet.evt_total = snapshot.evt_total;
  std::strncpy(packet.active_preset, snapshot.active_preset,
               sizeof(packet.active_preset) - 1U);
  packet.run_mode = static_cast<uint8_t>(snapshot.run_mode);
  packet.imu_valid = flag(snapshot.imu.valid);
  packet.imu_accel_g[0] = snapshot.imu.accel_g.x;
  packet.imu_accel_g[1] = snapshot.imu.accel_g.y;
  packet.imu_accel_g[2] = snapshot.imu.accel_g.z;
  packet.imu_gyro_dps[0] = snapshot.imu.gyro_dps.x;
  packet.imu_gyro_dps[1] = snapshot.imu.gyro_dps.y;
  packet.imu_gyro_dps[2] = snapshot.imu.gyro_dps.z;
  packet.mass_pos_norm[0] = snapshot.mass.pos_norm.x;
  packet.mass_pos_norm[1] = snapshot.mass.pos_norm.y;
  packet.mass_vel_norm_s[0] = snapshot.mass.vel_norm_s.x;
  packet.mass_vel_norm_s[1] = snapshot.mass.vel_norm_s.y;
  packet.mass_energy = snapshot.mass.energy;
  packet.mass_fill = snapshot.mass.fill;
  packet.last_event_type = static_cast<uint8_t>(snapshot.last_event.type);
  packet.last_event_primary_wall =
      static_cast<uint8_t>(snapshot.last_event.primary_wall);
  packet.last_event_amplitude = snapshot.last_event.amplitude;
  for (std::size_t channel = 0; channel < 4U; ++channel) {
    packet.actuators[channel] = snapshot.actuators.ch[channel];
  }
  packet.audio_compile_enabled = flag(snapshot.audio.compile_enabled);
  packet.audio_driver_installed = flag(snapshot.audio.driver_installed);
  packet.audio_runtime_enabled = flag(snapshot.audio.runtime_enabled);
  packet.audio_output_silenced = flag(snapshot.audio.output_silenced);
  packet.audio_test_mode = flag(snapshot.audio.test_mode);
  packet.audio_demo_compat_mode = flag(snapshot.audio.demo_compat_mode);
  packet.audio_transport = static_cast<uint8_t>(snapshot.audio.transport);
  packet.audio_output_layout = static_cast<uint8_t>(snapshot.audio.output_layout);
  packet.audio_active_output_channels = snapshot.audio.active_output_channels;
  packet.audio_test_wall = static_cast<uint8_t>(snapshot.audio.test_wall);
  packet.audio_output_peak_limit = snapshot.audio.output_peak_limit;
  packet.audio_underrun_count = snapshot.audio.underrun_count;
  packet.safety_imu_stale_safe_stop =
      flag(snapshot.safety.imu_stale_safe_stop);
  packet.safety_imu_fault_injection_active =
      flag(snapshot.safety.imu_fault_injection_active);
  packet.safety_audio_zero_asserted =
      flag(snapshot.safety.audio_zero_asserted);
  packet.safety_tilt_disarmed = flag(snapshot.safety.tilt_disarmed);
  packet.crc32 = espNowTelemetryCrc32(
      &packet, offsetof(EspNowTelemetryPacketV1, crc32));
  return packet;
}

bool validateEspNowTelemetryPacketV1(const void* data, std::size_t length) {
  if (data == nullptr || length != sizeof(EspNowTelemetryPacketV1)) {
    return false;
  }
  EspNowTelemetryPacketV1 packet{};
  std::memcpy(&packet, data, sizeof(packet));
  if (packet.magic != kEspNowTelemetryMagic ||
      packet.packet_size != sizeof(EspNowTelemetryPacketV1) ||
      packet.version != kEspNowTelemetryVersion || packet.flags != 0U ||
      packet.crc32 != espNowTelemetryCrc32(
                          &packet, offsetof(EspNowTelemetryPacketV1, crc32))) {
    return false;
  }
  if (packet.active_preset[sizeof(packet.active_preset) - 1U] != '\0' ||
      packet.run_mode > static_cast<uint8_t>(RunMode::Replay) ||
      packet.last_event_type > static_cast<uint8_t>(EventType::Scrape) ||
      !isWall(packet.last_event_primary_wall) ||
      packet.audio_transport > static_cast<uint8_t>(AudioTransport::Tdm8Slot) ||
      packet.audio_output_layout >
          static_cast<uint8_t>(AudioOutputLayout::FrontBack2Ch) ||
      packet.audio_active_output_channels > 4U ||
      !isWall(packet.audio_test_wall)) {
    return false;
  }
  const uint8_t flags[]{
      packet.imu_valid,
      packet.audio_compile_enabled,
      packet.audio_driver_installed,
      packet.audio_runtime_enabled,
      packet.audio_output_silenced,
      packet.audio_test_mode,
      packet.audio_demo_compat_mode,
      packet.safety_imu_stale_safe_stop,
      packet.safety_imu_fault_injection_active,
      packet.safety_audio_zero_asserted,
      packet.safety_tilt_disarmed,
  };
  for (uint8_t value : flags) {
    if (!isFlag(value)) {
      return false;
    }
  }
  return finiteArray(packet.imu_accel_g, 3U) &&
         finiteArray(packet.imu_gyro_dps, 3U) &&
         finiteArray(packet.mass_pos_norm, 2U) &&
         finiteArray(packet.mass_vel_norm_s, 2U) &&
         std::isfinite(packet.mass_energy) && std::isfinite(packet.mass_fill) &&
         std::isfinite(packet.last_event_amplitude) &&
         finiteArray(packet.actuators, 4U) &&
         std::isfinite(packet.audio_output_peak_limit);
}

EspNowTelemetryPacketV2 encodeEspNowTelemetryPacketV2(
    const TelemetrySnapshot& snapshot,
    uint32_t sequence) {
  const EspNowTelemetryPacketV1 v1 =
      encodeEspNowTelemetryPacketV1(snapshot, sequence);
  EspNowTelemetryPacketV2 packet{};
  std::memcpy(&packet, &v1, offsetof(EspNowTelemetryPacketV1, crc32));
  packet.packet_size = static_cast<uint16_t>(sizeof(packet));
  packet.version = kEspNowTelemetryVersionV2;
  packet.tilt_servo_state = static_cast<uint8_t>(snapshot.tilt_servo.state);
  packet.tilt_servo_fault = static_cast<uint8_t>(snapshot.tilt_servo.fault);
  const auto saturateU16 = [](uint32_t value) {
    return static_cast<uint16_t>(std::min<uint32_t>(value, UINT16_MAX));
  };
  const auto saturateRaw = [](int32_t value) {
    return static_cast<uint16_t>(
        std::max<int32_t>(0, std::min<int32_t>(value, UINT16_MAX)));
  };
  packet.tilt_communication_errors =
      saturateU16(snapshot.tilt_servo.communication_errors);
  packet.tilt_command_age_ms =
      saturateU16(snapshot.tilt_servo.command_age_ms);
  packet.tilt_status_age_ms =
      saturateU16(snapshot.tilt_servo.status_age_ms);
  for (std::size_t index = 0; index < 2U; ++index) {
    const auto& device = snapshot.tilt_servo.devices[index];
    if (device.status_valid) {
      packet.tilt_device_flags |= static_cast<uint8_t>(1U << index);
    }
    if (device.torque_enabled) {
      packet.tilt_device_flags |= static_cast<uint8_t>(1U << (index + 2U));
    }
    packet.tilt_device_id[index] = device.id;
    packet.tilt_present_position_raw[index] =
        saturateRaw(device.present_position_raw);
    packet.tilt_goal_position_raw[index] =
        saturateRaw(device.goal_position_raw);
    packet.tilt_home_position_raw[index] =
        saturateRaw(device.home_position_raw);
    packet.tilt_present_current_ma[index] = device.present_current_ma;
    packet.tilt_input_voltage_decivolt[index] = static_cast<uint8_t>(
        std::min<uint16_t>(device.input_voltage_decivolt, UINT8_MAX));
    packet.tilt_temperature_c[index] = device.temperature_c;
    packet.tilt_hardware_error[index] = device.hardware_error;
    packet.tilt_operating_mode[index] = device.operating_mode;
  }
  packet.crc32 = espNowTelemetryCrc32(
      &packet, offsetof(EspNowTelemetryPacketV2, crc32));
  return packet;
}

bool validateEspNowTelemetryPacketV2(const void* data, std::size_t length) {
  if (data == nullptr || length != sizeof(EspNowTelemetryPacketV2)) {
    return false;
  }
  EspNowTelemetryPacketV2 packet{};
  std::memcpy(&packet, data, sizeof(packet));
  if (packet.magic != kEspNowTelemetryMagic ||
      packet.packet_size != sizeof(EspNowTelemetryPacketV2) ||
      packet.version != kEspNowTelemetryVersionV2 || packet.flags != 0U ||
      packet.tilt_reserved != 0U || (packet.tilt_device_flags & 0xF0U) != 0U ||
      packet.tilt_servo_state >
          static_cast<uint8_t>(TiltServoState::FaultLatched) ||
      packet.tilt_servo_fault >
          static_cast<uint8_t>(TiltServoFault::ImuSafety) ||
      packet.tilt_device_id[0] > 252U || packet.tilt_device_id[1] > 252U ||
      packet.crc32 != espNowTelemetryCrc32(
                          &packet, offsetof(EspNowTelemetryPacketV2, crc32))) {
    return false;
  }

  // Reuse the complete v1 semantic validation for the shared 160-byte prefix.
  EspNowTelemetryPacketV1 common{};
  std::memcpy(&common, &packet, offsetof(EspNowTelemetryPacketV1, crc32));
  common.packet_size = static_cast<uint16_t>(sizeof(common));
  common.version = kEspNowTelemetryVersionV1;
  common.crc32 = espNowTelemetryCrc32(
      &common, offsetof(EspNowTelemetryPacketV1, crc32));
  return validateEspNowTelemetryPacketV1(&common, sizeof(common));
}

EspNowResolvedState makeEspNowResolvedState(const SystemParams& params) {
  EspNowResolvedState resolved{};
  resolved.family = static_cast<uint8_t>(params.container.family);
  if (params.features.enable_coherent_container_demo) {
    resolved.model_flags |= kEspNowResolvedCoherentContainer;
  }
  if (params.features.enable_device_frame_transform) {
    resolved.model_flags |= kEspNowResolvedDeviceFrameTransform;
  }
  resolved.span_x_m = params.container.span_x_m;
  resolved.span_y_m = params.container.span_y_m;
  resolved.span_z_m = params.container.span_z_m;
  resolved.headspace = params.container.headspace;
  resolved.viscosity = params.container.viscosity;
  resolved.particle_count = params.container.particle_count;
  resolved.particle_hardness = params.container.particle_hardness;
  return resolved;
}

EspNowTelemetryPacketV3 encodeEspNowTelemetryPacketV3(
    const TelemetrySnapshot& snapshot,
    uint32_t sequence,
    const EspNowResolvedState& resolved) {
  const EspNowTelemetryPacketV2 v2 =
      encodeEspNowTelemetryPacketV2(snapshot, sequence);
  EspNowTelemetryPacketV3 packet{};
  std::memcpy(&packet, &v2, offsetof(EspNowTelemetryPacketV2, crc32));
  packet.packet_size = static_cast<uint16_t>(sizeof(packet));
  packet.version = kEspNowTelemetryVersionV3;
  packet.resolved = resolved;
  packet.crc32 = espNowTelemetryCrc32(
      &packet, offsetof(EspNowTelemetryPacketV3, crc32));
  return packet;
}

bool validateEspNowTelemetryPacketV3(const void* data, std::size_t length) {
  if (data == nullptr || length != sizeof(EspNowTelemetryPacketV3)) {
    return false;
  }
  EspNowTelemetryPacketV3 packet{};
  std::memcpy(&packet, data, sizeof(packet));
  if (packet.packet_size != sizeof(packet) ||
      packet.version != kEspNowTelemetryVersionV3 ||
      packet.crc32 != espNowTelemetryCrc32(
                          &packet, offsetof(EspNowTelemetryPacketV3, crc32)) ||
      packet.resolved.family > static_cast<uint8_t>(MaterialFamily::Custom) ||
      (packet.resolved.model_flags & 0xFCU) != 0U) {
    return false;
  }
  const float spans[]{packet.resolved.span_x_m, packet.resolved.span_y_m,
                      packet.resolved.span_z_m};
  for (float value : spans) {
    if (!std::isfinite(value) || value <= 0.0f) {
      return false;
    }
  }
  const float unit_values[]{packet.mass_fill, packet.resolved.headspace,
                            packet.resolved.viscosity,
                            packet.resolved.particle_count,
                            packet.resolved.particle_hardness};
  for (float value : unit_values) {
    if (!std::isfinite(value) || value < 0.0f || value > 1.0f) {
      return false;
    }
  }

  EspNowTelemetryPacketV2 common{};
  std::memcpy(&common, &packet, offsetof(EspNowTelemetryPacketV2, crc32));
  common.packet_size = static_cast<uint16_t>(sizeof(common));
  common.version = kEspNowTelemetryVersionV2;
  common.crc32 = espNowTelemetryCrc32(
      &common, offsetof(EspNowTelemetryPacketV2, crc32));
  return validateEspNowTelemetryPacketV2(&common, sizeof(common));
}

}  // namespace haptics
