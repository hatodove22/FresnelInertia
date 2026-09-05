#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

#include <cinttypes>
#include <atomic>
#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <type_traits>

#include "haptics/EspNowControlProtocol.hpp"
#include "haptics/EspNowTelemetryProtocol.hpp"

namespace {

constexpr uint8_t kEspNowChannel = 6U;
constexpr UBaseType_t kReceiveQueueDepth = 16U;
constexpr std::size_t kJsonBufferBytes = 3072U;
constexpr uint32_t kCommandTimeoutMs = 1500U;
constexpr uint32_t kPairRetryMs = 1000U;

struct ReceivedFrame {
  uint8_t source[6]{};
  uint16_t length = 0U;
  uint8_t data[haptics::kEspNowTelemetryMaximumPacketBytes]{};
};

QueueHandle_t g_receive_queue = nullptr;
std::atomic<uint32_t> g_callback_length_errors{0U};
std::atomic<uint32_t> g_callback_queue_drops{0U};
uint32_t g_valid_packets = 0U;
uint32_t g_invalid_packets = 0U;
uint32_t g_sequence_gaps = 0U;
uint32_t g_sequence_resets = 0U;
uint32_t g_serialization_errors = 0U;
uint32_t g_usb_output_drops = 0U;
uint32_t g_valid_responses = 0U;
uint32_t g_invalid_responses = 0U;
uint32_t g_rejected_responses = 0U;
uint32_t g_commands_sent = 0U;
uint32_t g_command_send_errors = 0U;
uint32_t g_command_timeouts = 0U;
uint32_t g_last_sequence = 0U;
bool g_have_sequence = false;
uint8_t g_last_source[6]{};
bool g_have_source = false;
uint32_t g_session_id = 0U;
uint32_t g_next_request_id = 1U;
uint32_t g_pending_request_id = 0U;
uint32_t g_pending_since_ms = 0U;
uint32_t g_last_pair_attempt_ms = 0U;
char g_json_buffer[kJsonBufferBytes]{};
// Only loop() serializes telemetry; radio callbacks only queue packets.
// Share one document across wire versions instead of placing 3 KB documents
// in nested/inlined serializer frames on the 8 KB Arduino loopTask stack.
StaticJsonDocument<3072> g_json_document;

const char* runModeToString(uint8_t value) {
  switch (static_cast<haptics::RunMode>(value)) {
    case haptics::RunMode::Live:
      return "live";
    case haptics::RunMode::Calibration:
      return "calibration";
    case haptics::RunMode::Record:
      return "record";
    case haptics::RunMode::Replay:
      return "replay";
    case haptics::RunMode::Idle:
    default:
      return "idle";
  }
}

const char* wallToString(uint8_t value) {
  switch (static_cast<haptics::WallId>(value)) {
    case haptics::WallId::Front:
      return "Front";
    case haptics::WallId::Back:
      return "Back";
    case haptics::WallId::Top:
      return "Top";
    case haptics::WallId::Bottom:
      return "Bottom";
    case haptics::WallId::None:
    default:
      return "None";
  }
}

const char* familyToString(uint8_t value) {
  switch (static_cast<haptics::MaterialFamily>(value)) {
    case haptics::MaterialFamily::Liquid: return "Liquid";
    case haptics::MaterialFamily::Granular: return "Granular";
    case haptics::MaterialFamily::Hybrid: return "Hybrid";
    case haptics::MaterialFamily::Detented: return "Detented";
    case haptics::MaterialFamily::Custom: return "Custom";
    default: return "Custom";  // Wire validation rejects unknown values.
  }
}

const char* eventTypeToString(uint8_t value) {
  switch (static_cast<haptics::EventType>(value)) {
    case haptics::EventType::WallHit:
      return "WallHit";
    case haptics::EventType::RollTrain:
      return "RollTrain";
    case haptics::EventType::ImpactCluster:
      return "ImpactCluster";
    case haptics::EventType::DropletCluster:
      return "DropletCluster";
    case haptics::EventType::RoofSlap:
      return "RoofSlap";
    case haptics::EventType::Scrape:
      return "Scrape";
    case haptics::EventType::None:
    default:
      return "None";
  }
}

const char* audioTransportToString(uint8_t value) {
  return value == static_cast<uint8_t>(haptics::AudioTransport::Tdm8Slot)
             ? "tdm8_slot"
             : "dual_i2s";
}

const char* audioLayoutToString(uint8_t value) {
  return value == static_cast<uint8_t>(haptics::AudioOutputLayout::FrontBack2Ch)
             ? "front_back_2ch"
             : "quad_wall_4ch";
}

void receiveCallback(const esp_now_recv_info_t* info,
                     const uint8_t* data,
                     int length) {
  if (g_receive_queue == nullptr || info == nullptr || data == nullptr ||
      (length != static_cast<int>(sizeof(haptics::EspNowTelemetryPacketV1)) &&
       length != static_cast<int>(sizeof(haptics::EspNowTelemetryPacketV2)) &&
       length != static_cast<int>(sizeof(haptics::EspNowTelemetryPacketV3)) &&
       length != static_cast<int>(sizeof(haptics::EspNowControlResponseV1)))) {
    g_callback_length_errors.fetch_add(1U, std::memory_order_relaxed);
    return;
  }
  ReceivedFrame received{};
  std::memcpy(received.source, info->src_addr, sizeof(received.source));
  received.length = static_cast<uint16_t>(length);
  std::memcpy(received.data, data, received.length);
  if (xQueueSend(g_receive_queue, &received, 0U) != pdTRUE) {
    g_callback_queue_drops.fetch_add(1U, std::memory_order_relaxed);
  }
}

const char* controlResultToString(uint8_t value) {
  switch (static_cast<haptics::EspNowControlResult>(value)) {
    case haptics::EspNowControlResult::Applied:
      return "applied";
    case haptics::EspNowControlResult::Rejected:
      return "rejected";
    case haptics::EspNowControlResult::Unsupported:
      return "unsupported";
    case haptics::EspNowControlResult::NotPaired:
      return "not_paired";
    case haptics::EspNowControlResult::BadSession:
      return "bad_session";
    case haptics::EspNowControlResult::StaleRequest:
      return "stale_request";
    case haptics::EspNowControlResult::InvalidRequest:
      return "invalid_request";
    case haptics::EspNowControlResult::Busy:
      return "busy";
    default:
      return "invalid";
  }
}

bool ensurePeer(const uint8_t address[6]) {
  if (address == nullptr) {
    return false;
  }
  if (esp_now_is_peer_exist(address)) {
    return true;
  }
  esp_now_peer_info_t peer{};
  std::memcpy(peer.peer_addr, address, sizeof(peer.peer_addr));
  peer.channel = kEspNowChannel;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  return esp_now_add_peer(&peer) == ESP_OK;
}

bool sendControl(haptics::EspNowControlOperation operation,
                 haptics::EspNowControlValueType value_type =
                     haptics::EspNowControlValueType::None,
                 haptics::RunMode run_mode = haptics::RunMode::Idle,
                 bool enabled = false,
                 float number = 0.0f,
                 const char* path = nullptr,
                 const char* text = nullptr) {
  if (!g_have_source) {
    Serial.println("haptic_link: command rejected; AtomS3 source not discovered");
    return false;
  }
  if (g_pending_request_id != 0U) {
    Serial.println("haptic_link: command rejected; prior request pending");
    return false;
  }
  if (operation != haptics::EspNowControlOperation::Hello &&
      g_session_id == 0U) {
    Serial.println("haptic_link: command rejected; link not paired");
    return false;
  }
  if (!ensurePeer(g_last_source)) {
    ++g_command_send_errors;
    Serial.println("haptic_link: command rejected; peer setup failed");
    return false;
  }
  const uint32_t request_id = g_next_request_id++;
  if (g_next_request_id == 0U) {
    g_next_request_id = 1U;
  }
  const auto packet = haptics::encodeEspNowControlPacketV1(
      operation, request_id,
      operation == haptics::EspNowControlOperation::Hello ? 0U : g_session_id,
      value_type, run_mode, enabled, number, path, text);
  if (esp_now_send(g_last_source,
                   reinterpret_cast<const uint8_t*>(&packet),
                   sizeof(packet)) != ESP_OK) {
    ++g_command_send_errors;
    Serial.println("haptic_link: command send failed");
    return false;
  }
  ++g_commands_sent;
  g_pending_request_id = request_id;
  g_pending_since_ms = millis();
  if (operation == haptics::EspNowControlOperation::Hello) {
    g_last_pair_attempt_ms = g_pending_since_ms;
  }
  Serial.printf("haptic_link_tx: request=%lu operation=%u\n",
                static_cast<unsigned long>(request_id),
                static_cast<unsigned>(operation));
  return true;
}

enum class JsonEmitResult : uint8_t {
  Ok = 0,
  SerializationError,
  UsbOutputDrop,
};

template <typename TPacket>
JsonEmitResult emitCanonicalJson(const TPacket& packet) {
  auto& doc = g_json_document;
  doc.clear();  // Also removes v3-only fields before a following v1/v2 frame.
  doc["timestamp_ms"] = packet.timestamp_ms;
  doc["frame_counter"] = packet.frame_counter;
  doc["new_evt"] = packet.new_evt;
  doc["evt_total"] = packet.evt_total;
  doc["preset"] = packet.active_preset;
  doc["run_mode"] = runModeToString(packet.run_mode);

  JsonObject imu = doc.createNestedObject("imu");
  imu["valid"] = packet.imu_valid != 0U;
  JsonArray accel = imu.createNestedArray("accel_g");
  JsonArray gyro = imu.createNestedArray("gyro_dps");
  for (std::size_t i = 0; i < 3U; ++i) {
    accel.add(packet.imu_accel_g[i]);
    gyro.add(packet.imu_gyro_dps[i]);
  }

  JsonObject mass = doc.createNestedObject("mass");
  JsonArray pos = mass.createNestedArray("pos_norm");
  JsonArray vel = mass.createNestedArray("vel_norm_s");
  for (std::size_t i = 0; i < 2U; ++i) {
    pos.add(packet.mass_pos_norm[i]);
    vel.add(packet.mass_vel_norm_s[i]);
  }
  mass["energy"] = packet.mass_energy;
  mass["fill"] = packet.mass_fill;

  JsonObject last_event = doc.createNestedObject("last_event");
  last_event["type"] = eventTypeToString(packet.last_event_type);
  last_event["primary_wall"] = wallToString(packet.last_event_primary_wall);
  last_event["amplitude"] = packet.last_event_amplitude;

  JsonArray actuators = doc.createNestedArray("actuators");
  for (float channel : packet.actuators) {
    actuators.add(channel);
  }

  JsonObject audio = doc.createNestedObject("audio");
  audio["compile_enabled"] = packet.audio_compile_enabled != 0U;
  audio["driver_installed"] = packet.audio_driver_installed != 0U;
  audio["runtime_enabled"] = packet.audio_runtime_enabled != 0U;
  audio["output_silenced"] = packet.audio_output_silenced != 0U;
  audio["test_mode"] = packet.audio_test_mode != 0U;
  audio["demo_compat_mode"] = packet.audio_demo_compat_mode != 0U;
  audio["transport"] = audioTransportToString(packet.audio_transport);
  audio["output_layout"] = audioLayoutToString(packet.audio_output_layout);
  audio["active_output_channels"] = packet.audio_active_output_channels;
  audio["test_wall"] = wallToString(packet.audio_test_wall);
  audio["output_peak_limit"] = packet.audio_output_peak_limit;
  audio["underrun_count"] = packet.audio_underrun_count;

  JsonObject safety = doc.createNestedObject("safety");
  safety["imu_stale_safe_stop"] = packet.safety_imu_stale_safe_stop != 0U;
  safety["imu_fault_injection_active"] =
      packet.safety_imu_fault_injection_active != 0U;
  safety["audio_zero_asserted"] = packet.safety_audio_zero_asserted != 0U;
  safety["tilt_disarmed"] = packet.safety_tilt_disarmed != 0U;

  if constexpr (std::is_same_v<TPacket, haptics::EspNowTelemetryPacketV2> ||
                std::is_same_v<TPacket, haptics::EspNowTelemetryPacketV3>) {
    JsonObject tilt_servo = doc.createNestedObject("tilt_servo");
    tilt_servo["state"] = packet.tilt_servo_state;
    tilt_servo["fault"] = packet.tilt_servo_fault;
    tilt_servo["communication_errors"] = packet.tilt_communication_errors;
    tilt_servo["command_age_ms"] = packet.tilt_command_age_ms;
    tilt_servo["status_age_ms"] = packet.tilt_status_age_ms;
    JsonArray devices = tilt_servo.createNestedArray("devices");
    for (std::size_t index = 0U; index < 2U; ++index) {
      JsonObject device = devices.createNestedObject();
      device["id"] = packet.tilt_device_id[index];
      device["status_valid"] =
          (packet.tilt_device_flags & (1U << index)) != 0U;
      device["torque_enabled"] =
          (packet.tilt_device_flags & (1U << (index + 2U))) != 0U;
      device["operating_mode"] = packet.tilt_operating_mode[index];
      device["hardware_error"] = packet.tilt_hardware_error[index];
      device["home_position_raw"] = packet.tilt_home_position_raw[index];
      device["present_position_raw"] = packet.tilt_present_position_raw[index];
      device["goal_position_raw"] = packet.tilt_goal_position_raw[index];
      device["present_current_ma"] = packet.tilt_present_current_ma[index];
      device["input_voltage_v"] =
          packet.tilt_input_voltage_decivolt[index] * 0.1f;
      device["temperature_c"] = packet.tilt_temperature_c[index];
    }
  }

  if constexpr (std::is_same_v<TPacket, haptics::EspNowTelemetryPacketV3>) {
    JsonObject resolved = doc.createNestedObject("resolved");
    resolved["family"] = familyToString(packet.resolved.family);
    JsonObject container = resolved.createNestedObject("container");
    container["span_x_m"] = packet.resolved.span_x_m;
    container["span_y_m"] = packet.resolved.span_y_m;
    container["span_z_m"] = packet.resolved.span_z_m;
    container["fill"] = packet.mass_fill;
    container["headspace"] = packet.resolved.headspace;
    container["viscosity"] = packet.resolved.viscosity;
    container["particle_count"] = packet.resolved.particle_count;
    container["particle_hardness"] = packet.resolved.particle_hardness;
    JsonObject model = resolved.createNestedObject("model");
    model["coherent_container_demo"] =
        (packet.resolved.model_flags & haptics::kEspNowResolvedCoherentContainer) != 0U;
    model["device_frame_transform"] =
        (packet.resolved.model_flags & haptics::kEspNowResolvedDeviceFrameTransform) != 0U;
  }

  if (doc.overflowed()) {
    return JsonEmitResult::SerializationError;
  }
  const std::size_t serialized =
      serializeJson(doc, g_json_buffer, sizeof(g_json_buffer) - 1U);
  if (serialized == 0U || serialized + 1U >= sizeof(g_json_buffer)) {
    return JsonEmitResult::SerializationError;
  }
  g_json_buffer[serialized] = '\n';
  if (!Serial ||
      Serial.write(reinterpret_cast<const uint8_t*>(g_json_buffer),
                   serialized + 1U) != serialized + 1U) {
    return JsonEmitResult::UsbOutputDrop;
  }
  return JsonEmitResult::Ok;
}

template <typename TPacket>
void processTelemetryPacket(const TPacket& packet, const uint8_t source[6]) {
  if (g_have_sequence) {
    if (packet.sequence > g_last_sequence + 1U) {
      g_sequence_gaps += packet.sequence - g_last_sequence - 1U;
    } else if (packet.sequence <= g_last_sequence) {
      ++g_sequence_resets;
      g_session_id = 0U;
      g_pending_request_id = 0U;
    }
  }
  g_have_sequence = true;
  g_last_sequence = packet.sequence;
  if (!g_have_source ||
      std::memcmp(g_last_source, source, sizeof(g_last_source)) != 0) {
    g_session_id = 0U;
    g_pending_request_id = 0U;
  }
  std::memcpy(g_last_source, source, sizeof(g_last_source));
  g_have_source = true;
  ++g_valid_packets;
  const JsonEmitResult emit_result = emitCanonicalJson(packet);
  if (emit_result == JsonEmitResult::SerializationError) {
    ++g_serialization_errors;
  } else if (emit_result == JsonEmitResult::UsbOutputDrop) {
    ++g_usb_output_drops;
  }
}

void printStatus() {
  Serial.printf(
      "espnow_bridge: ready=1 channel=%u telemetry_bytes=%u command_bytes=%u response_bytes=%u valid=%lu invalid=%lu gaps=%lu sequence_resets=%lu queue_drops=%lu length_errors=%lu serialization_errors=%lu usb_output_drops=%lu responses=%lu response_invalid=%lu response_rejected=%lu commands=%lu command_errors=%lu timeouts=%lu paired=%u session=%08lX pending=%lu last_sequence=%lu source=%02X:%02X:%02X:%02X:%02X:%02X\n",
      static_cast<unsigned>(kEspNowChannel),
      static_cast<unsigned>(sizeof(haptics::EspNowTelemetryPacketV3)),
      static_cast<unsigned>(sizeof(haptics::EspNowControlPacketV1)),
      static_cast<unsigned>(sizeof(haptics::EspNowControlResponseV1)),
      static_cast<unsigned long>(g_valid_packets),
      static_cast<unsigned long>(g_invalid_packets),
      static_cast<unsigned long>(g_sequence_gaps),
      static_cast<unsigned long>(g_sequence_resets),
      static_cast<unsigned long>(
          g_callback_queue_drops.load(std::memory_order_relaxed)),
      static_cast<unsigned long>(
          g_callback_length_errors.load(std::memory_order_relaxed)),
      static_cast<unsigned long>(g_serialization_errors),
      static_cast<unsigned long>(g_usb_output_drops),
      static_cast<unsigned long>(g_valid_responses),
      static_cast<unsigned long>(g_invalid_responses),
      static_cast<unsigned long>(g_rejected_responses),
      static_cast<unsigned long>(g_commands_sent),
      static_cast<unsigned long>(g_command_send_errors),
      static_cast<unsigned long>(g_command_timeouts),
      static_cast<unsigned>(g_session_id != 0U),
      static_cast<unsigned long>(g_session_id),
      static_cast<unsigned long>(g_pending_request_id),
      static_cast<unsigned long>(g_last_sequence),
      g_last_source[0], g_last_source[1], g_last_source[2],
      g_last_source[3], g_last_source[4], g_last_source[5]);
}

}  // namespace

void setup() {
  const size_t tx_buffer_bytes = Serial.setTxBufferSize(4096U);
  Serial.begin(115200);
  delay(100);
  Serial.printf("espnow_bridge: tx_buffer=%u requested=4096\n",
                static_cast<unsigned>(tx_buffer_bytes));

  g_receive_queue = xQueueCreate(kReceiveQueueDepth, sizeof(ReceivedFrame));
  if (g_receive_queue == nullptr) {
    Serial.println("espnow_bridge: fatal receive queue allocation failed");
    return;
  }
  if (!WiFi.mode(WIFI_STA)) {
    Serial.println("espnow_bridge: fatal WIFI_STA start failed");
    return;
  }
  delay(10);
  if (esp_wifi_set_ps(WIFI_PS_NONE) != ESP_OK ||
      esp_wifi_set_channel(kEspNowChannel, WIFI_SECOND_CHAN_NONE) != ESP_OK ||
      esp_now_init() != ESP_OK ||
      esp_now_register_recv_cb(receiveCallback) != ESP_OK) {
    Serial.println("espnow_bridge: fatal ESP-NOW initialization failed");
    return;
  }
  Serial.printf("espnow_bridge: ready channel=%u mac=%s packet_bytes=%u\n",
                static_cast<unsigned>(kEspNowChannel),
                WiFi.macAddress().c_str(),
                static_cast<unsigned>(sizeof(haptics::EspNowTelemetryPacketV3)));
}

void loop() {
  ReceivedFrame received{};
  while (g_receive_queue != nullptr &&
         xQueueReceive(g_receive_queue, &received, 0U) == pdTRUE) {
    if (received.length == sizeof(haptics::EspNowTelemetryPacketV3)) {
      haptics::EspNowTelemetryPacketV3 packet{};
      std::memcpy(&packet, received.data, sizeof(packet));
      if (!haptics::validateEspNowTelemetryPacketV3(&packet, sizeof(packet))) {
        ++g_invalid_packets;
        continue;
      }
      processTelemetryPacket(packet, received.source);
      continue;
    }
    if (received.length == sizeof(haptics::EspNowTelemetryPacketV2)) {
      haptics::EspNowTelemetryPacketV2 packet{};
      std::memcpy(&packet, received.data, sizeof(packet));
      if (!haptics::validateEspNowTelemetryPacketV2(&packet, sizeof(packet))) {
        ++g_invalid_packets;
        continue;
      }
      processTelemetryPacket(packet, received.source);
      continue;
    }
    if (received.length == sizeof(haptics::EspNowTelemetryPacketV1)) {
      haptics::EspNowTelemetryPacketV1 packet{};
      std::memcpy(&packet, received.data, sizeof(packet));
      if (!haptics::validateEspNowTelemetryPacketV1(&packet, sizeof(packet))) {
        ++g_invalid_packets;
        continue;
      }
      processTelemetryPacket(packet, received.source);
      continue;
    }

    haptics::EspNowControlResponseV1 response{};
    std::memcpy(&response, received.data, sizeof(response));
    if (!g_have_source ||
        std::memcmp(g_last_source, received.source,
                    sizeof(g_last_source)) != 0 ||
        !haptics::validateEspNowControlResponseV1(
            &response, sizeof(response))) {
      ++g_invalid_responses;
      continue;
    }
    ++g_valid_responses;
    const auto result =
        static_cast<haptics::EspNowControlResult>(response.result);
    if (result != haptics::EspNowControlResult::Applied) {
      ++g_rejected_responses;
    }
    if (response.request_id == g_pending_request_id) {
      g_pending_request_id = 0U;
      if (result == haptics::EspNowControlResult::Applied &&
          response.session_id != 0U) {
        g_session_id = response.session_id;
      } else if (result == haptics::EspNowControlResult::NotPaired ||
                 result == haptics::EspNowControlResult::BadSession) {
        g_session_id = 0U;
      }
    }
    Serial.printf(
        "haptic_link_ack: request=%lu result=%s session=%08lX frame=%llu detail=%s\n",
        static_cast<unsigned long>(response.request_id),
        controlResultToString(response.result),
        static_cast<unsigned long>(response.session_id),
        static_cast<unsigned long long>(response.applied_frame_counter),
        response.detail);
  }

  const uint32_t now_ms = millis();
  if (g_pending_request_id != 0U &&
      now_ms - g_pending_since_ms > kCommandTimeoutMs) {
    Serial.printf("haptic_link: timeout request=%lu\n",
                  static_cast<unsigned long>(g_pending_request_id));
    g_pending_request_id = 0U;
    ++g_command_timeouts;
  }
  if (g_have_source && g_session_id == 0U &&
      g_pending_request_id == 0U &&
      now_ms - g_last_pair_attempt_ms >= kPairRetryMs) {
    sendControl(haptics::EspNowControlOperation::Hello);
  }

  static char command[128]{};
  static std::size_t command_length = 0U;
  while (Serial.available() > 0) {
    const int raw = Serial.read();
    if (raw < 0) {
      break;
    }
    const char ch = static_cast<char>(raw);
    if (ch == '\r' || ch == '\n') {
      if (command_length != 0U) {
        command[command_length] = '\0';
        if (std::strcmp(command, "status") == 0) {
          printStatus();
        } else if (std::strcmp(command, "pair") == 0) {
          g_session_id = 0U;
          g_pending_request_id = 0U;
          sendControl(haptics::EspNowControlOperation::Hello);
        } else if (std::strcmp(command, "get state") == 0) {
          sendControl(haptics::EspNowControlOperation::GetState);
        } else if (std::strcmp(command, "stop") == 0 ||
                   std::strcmp(command, "idle") == 0) {
          sendControl(haptics::EspNowControlOperation::SafeIdle);
        } else if (std::strcmp(command, "live") == 0) {
          sendControl(haptics::EspNowControlOperation::SetRunMode,
                      haptics::EspNowControlValueType::None,
                      haptics::RunMode::Live);
        } else if (std::strcmp(command, "audio on") == 0 ||
                   std::strcmp(command, "audio off") == 0) {
          sendControl(haptics::EspNowControlOperation::SetAudioEnabled,
                      haptics::EspNowControlValueType::Boolean,
                      haptics::RunMode::Idle,
                      std::strcmp(command, "audio on") == 0);
        } else if (std::strcmp(command, "tilt on") == 0 ||
                   std::strcmp(command, "tilt off") == 0) {
          sendControl(haptics::EspNowControlOperation::SetTiltEnabled,
                      haptics::EspNowControlValueType::Boolean,
                      haptics::RunMode::Idle,
                      std::strcmp(command, "tilt on") == 0);
        } else if (std::strcmp(command, "tilt clear") == 0) {
          sendControl(haptics::EspNowControlOperation::ClearTiltFault);
        } else if (std::strncmp(command, "preset load ", 12U) == 0) {
          sendControl(haptics::EspNowControlOperation::LoadPreset,
                      haptics::EspNowControlValueType::Text,
                      haptics::RunMode::Idle, false, 0.0f, nullptr,
                      command + 12U);
        } else if (std::strncmp(command, "set ", 4U) == 0) {
          char* value_text = std::strrchr(command + 4U, ' ');
          if (value_text == nullptr || value_text == command + 4U) {
            Serial.println("haptic_link: set syntax is set <path> <number>");
          } else {
            *value_text++ = '\0';
            errno = 0;
            char* end = nullptr;
            const float value = std::strtof(value_text, &end);
            while (end != nullptr && *end == ' ') {
              ++end;
            }
            if (errno != 0 || end == value_text ||
                (end != nullptr && *end != '\0')) {
              Serial.println("haptic_link: invalid numeric value");
            } else {
              sendControl(haptics::EspNowControlOperation::SetParam,
                          haptics::EspNowControlValueType::Number,
                          haptics::RunMode::Idle, false, value,
                          command + 4U);
            }
          }
        } else if (std::strcmp(command, "stats reset") == 0) {
          g_valid_packets = 0U;
          g_invalid_packets = 0U;
          g_sequence_gaps = 0U;
          g_sequence_resets = 0U;
          g_serialization_errors = 0U;
          g_usb_output_drops = 0U;
          g_valid_responses = 0U;
          g_invalid_responses = 0U;
          g_rejected_responses = 0U;
          g_commands_sent = 0U;
          g_command_send_errors = 0U;
          g_command_timeouts = 0U;
          g_callback_length_errors.store(0U, std::memory_order_relaxed);
          g_callback_queue_drops.store(0U, std::memory_order_relaxed);
          g_have_sequence = false;
          g_last_sequence = 0U;
          Serial.println("espnow_bridge: stats reset");
        } else {
          Serial.println(
              "espnow_bridge: commands=status|stats reset|pair|get state|idle|stop|live|audio on|off|tilt on|off|clear|preset load <name>|set <path> <number>");
        }
        command_length = 0U;
      }
      continue;
    }
    if (command_length + 1U < sizeof(command)) {
      command[command_length++] = ch;
    }
  }
  delay(1);
}
