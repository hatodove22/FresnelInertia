#include "haptics/RemoteInterface.hpp"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <cstdio>

#ifndef HAPTICS_ENABLE_REMOTE_BACKEND
#define HAPTICS_ENABLE_REMOTE_BACKEND 0
#endif

#if HAPTICS_ENABLE_REMOTE_BACKEND
#include <WiFi.h>
#include <WebServer.h>
#include <mbedtls/base64.h>
#include <mbedtls/sha1.h>
#endif

#include <cstring>

namespace haptics {
namespace {

const char* wallToString(WallId wall) {
  switch (wall) {
    case WallId::Front:
      return "Front";
    case WallId::Back:
      return "Back";
    case WallId::Top:
      return "Top";
    case WallId::Bottom:
      return "Bottom";
    case WallId::None:
    default:
      return "None";
  }
}

const char* eventTypeToString(EventType type) {
  switch (type) {
    case EventType::WallHit:
      return "WallHit";
    case EventType::RollTrain:
      return "RollTrain";
    case EventType::ImpactCluster:
      return "ImpactCluster";
    case EventType::DropletCluster:
      return "DropletCluster";
    case EventType::RoofSlap:
      return "RoofSlap";
    case EventType::Scrape:
      return "Scrape";
    case EventType::None:
    default:
      return "None";
  }
}

const char* calibrationBandToString(CalibrationBand band) {
  switch (band) {
    case CalibrationBand::Low:
      return "Low";
    case CalibrationBand::High:
      return "High";
    case CalibrationBand::None:
    default:
      return "None";
  }
}

const char* calibrationStageToString(CalibrationStage stage) {
  switch (stage) {
    case CalibrationStage::Settling:
      return "Settling";
    case CalibrationStage::Measuring:
      return "Measuring";
    case CalibrationStage::Complete:
      return "Complete";
    case CalibrationStage::Aborted:
      return "Aborted";
    case CalibrationStage::Idle:
    default:
      return "Idle";
  }
}

const char* audioLayoutToString(AudioOutputLayout layout) {
  switch (layout) {
    case AudioOutputLayout::FrontBack2Ch:
      return "front_back_2ch";
    case AudioOutputLayout::QuadWall4Ch:
    default:
      return "quad_wall_4ch";
  }
}

const char* audioTransportToString(AudioTransport transport) {
  return transport == AudioTransport::Tdm8Slot ? "tdm8_slot" : "dual_i2s";
}

const char* runModeToString(RunMode mode) {
  switch (mode) {
    case RunMode::Live:
      return "live";
    case RunMode::Calibration:
      return "calibration";
    case RunMode::Record:
      return "record";
    case RunMode::Replay:
      return "replay";
    case RunMode::Idle:
    default:
      return "idle";
  }
}

RunMode parseRunMode(const char* text) {
  if (text == nullptr) {
    return RunMode::Live;
  }
  if (std::strcmp(text, "idle") == 0) {
    return RunMode::Idle;
  }
  if (std::strcmp(text, "calibration") == 0) {
    return RunMode::Calibration;
  }
  if (std::strcmp(text, "record") == 0) {
    return RunMode::Record;
  }
  if (std::strcmp(text, "replay") == 0) {
    return RunMode::Replay;
  }
  return RunMode::Live;
}

bool sameText(const char* lhs, const char* rhs) {
  return std::strncmp(lhs != nullptr ? lhs : "", rhs != nullptr ? rhs : "", 32) == 0;
}

bool requiresRemoteRestart(const SystemParams& current, const SystemParams& next) {
  const bool current_enabled = current.features.enable_remote_interface;
  const bool next_enabled = next.features.enable_remote_interface;
  if (current_enabled != next_enabled) {
    return true;
  }
  if (!current_enabled && !next_enabled) {
    return false;
  }
  if (current.iface.wifi_mode_ap != next.iface.wifi_mode_ap) {
    return true;
  }
  if (current.iface.http_port != next.iface.http_port || current.iface.websocket_port != next.iface.websocket_port) {
    return true;
  }
  if (!sameText(current.iface.wifi_ssid, next.iface.wifi_ssid)) {
    return true;
  }
  if (!sameText(current.iface.wifi_password, next.iface.wifi_password)) {
    return true;
  }
  return false;
}

ControlMessageType parseMessageType(const char* text) {
  if (text == nullptr) {
    return ControlMessageType::None;
  }
  if (std::strcmp(text, "set_param") == 0) {
    return ControlMessageType::SetParam;
  }
  if (std::strcmp(text, "load_preset") == 0) {
    return ControlMessageType::LoadPreset;
  }
  if (std::strcmp(text, "set_run_mode") == 0) {
    return ControlMessageType::SetRunMode;
  }
  if (std::strcmp(text, "start_calibration") == 0) {
    return ControlMessageType::StartCalibration;
  }
  if (std::strcmp(text, "stop_calibration") == 0) {
    return ControlMessageType::StopCalibration;
  }
  if (std::strcmp(text, "request_telemetry") == 0) {
    return ControlMessageType::RequestTelemetry;
  }
  if (std::strcmp(text, "set_tilt_mode") == 0) {
    return ControlMessageType::SetTiltMode;
  }
  if (std::strcmp(text, "record_start") == 0) {
    return ControlMessageType::RecordStart;
  }
  if (std::strcmp(text, "record_stop") == 0) {
    return ControlMessageType::RecordStop;
  }
  if (std::strcmp(text, "replay_start") == 0) {
    return ControlMessageType::ReplayStart;
  }
  if (std::strcmp(text, "replay_stop") == 0) {
    return ControlMessageType::ReplayStop;
  }
  return ControlMessageType::None;
}

#if HAPTICS_ENABLE_REMOTE_BACKEND
constexpr size_t kMaxWsClients = 4;
constexpr size_t kMaxClientBufferBytes = 4096;
RemoteInterface* g_remote_owner = nullptr;
WiFiServer* g_server = nullptr;
WebServer* g_http_server = nullptr;
std::array<WiFiClient, kMaxWsClients> g_clients{};
std::array<bool, kMaxWsClients> g_client_handshaked{};
std::array<String, kMaxWsClients> g_client_buffers{};

enum class FrameExtractResult : uint8_t {
  NeedMoreData = 0,
  Consumed = 1,
  Disconnect = 2,
};

uint8_t byteAt(const String& buffer, size_t index) {
  return static_cast<uint8_t>(static_cast<unsigned char>(buffer[static_cast<unsigned int>(index)]));
}

void readAvailableBytes(WiFiClient& client, String& buffer) {
  while (client.available() > 0) {
    buffer += static_cast<char>(client.read());
  }
}

String websocketAcceptKey(const String& key) {
  const String input = key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  unsigned char sha1[20]{};
  unsigned char encoded[64]{};
  size_t encoded_len = 0;
  mbedtls_sha1(reinterpret_cast<const unsigned char*>(input.c_str()), input.length(), sha1);
  mbedtls_base64_encode(encoded, sizeof(encoded), &encoded_len, sha1, sizeof(sha1));
  encoded[encoded_len] = '\0';
  return String(reinterpret_cast<char*>(encoded));
}

bool sendFrame(WiFiClient& client, const char* payload, size_t length) {
  if (!client.connected()) {
    return false;
  }

  uint8_t header[4]{0x81, 0x00, 0x00, 0x00};
  size_t header_len = 2;
  if (length < 126) {
    header[1] = static_cast<uint8_t>(length);
  } else {
    header[1] = 126;
    header[2] = static_cast<uint8_t>((length >> 8) & 0xFF);
    header[3] = static_cast<uint8_t>(length & 0xFF);
    header_len = 4;
  }

  client.write(header, header_len);
  client.write(reinterpret_cast<const uint8_t*>(payload), length);
  return true;
}

ControlMessage parseControlPayload(const char* payload) {
  ControlMessage message{};
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, payload) != DeserializationError::Ok) {
    return message;
  }

  message.type = parseMessageType(doc["type"] | nullptr);
  message.timestamp_ms = doc["timestamp_ms"] | 0u;
  message.run_mode = parseRunMode(doc["run_mode"] | nullptr);
  if (doc["preset"].is<const char*>()) {
    std::strncpy(message.preset, doc["preset"], sizeof(message.preset) - 1);
  }
  if (doc["path"].is<const char*>()) {
    std::strncpy(message.path, doc["path"], sizeof(message.path) - 1);
  }
  if (doc["payload"]["file"].is<const char*>()) {
    std::strncpy(message.argument, doc["payload"]["file"], sizeof(message.argument) - 1);
  } else if (doc["payload"]["path"].is<const char*>()) {
    std::strncpy(message.argument, doc["payload"]["path"], sizeof(message.argument) - 1);
  }
  if (doc["value"].is<float>() || doc["value"].is<int>()) {
    message.value.has_number = true;
    message.value.number = doc["value"].as<float>();
  }
  if (doc["value"].is<bool>()) {
    message.value.has_bool = true;
    message.value.boolean = doc["value"].as<bool>();
  }
  if (doc["value"].is<const char*>()) {
    message.value.has_text = true;
    std::strncpy(message.value.text, doc["value"], sizeof(message.value.text) - 1);
  }
  if (doc["payload"]["enabled"].is<bool>()) {
    message.tilt_enable = doc["payload"]["enabled"].as<bool>();
  }
  message.valid = message.type != ControlMessageType::None;
  return message;
}

template <typename TDoc>
void populateTelemetryDocument(TDoc& doc, const TelemetrySnapshot& telemetry, bool include_pipeline_debug) {
  doc["timestamp_ms"] = telemetry.timestamp_ms;
  doc["frame_counter"] = telemetry.frame_counter;
  doc["new_evt"] = telemetry.new_evt;
  doc["evt_total"] = telemetry.evt_total;
  doc["preset"] = telemetry.active_preset;
  doc["run_mode"] = runModeToString(telemetry.run_mode);

  JsonObject imu = doc.createNestedObject("imu");
  imu["valid"] = telemetry.imu.valid;
  JsonArray accel = imu.createNestedArray("accel_g");
  accel.add(telemetry.imu.accel_g.x);
  accel.add(telemetry.imu.accel_g.y);
  accel.add(telemetry.imu.accel_g.z);
  JsonArray gyro = imu.createNestedArray("gyro_dps");
  gyro.add(telemetry.imu.gyro_dps.x);
  gyro.add(telemetry.imu.gyro_dps.y);
  gyro.add(telemetry.imu.gyro_dps.z);

  JsonObject mass = doc.createNestedObject("mass");
  JsonArray pos = mass.createNestedArray("pos_norm");
  pos.add(telemetry.mass.pos_norm.x);
  pos.add(telemetry.mass.pos_norm.y);
  JsonArray vel = mass.createNestedArray("vel_norm_s");
  vel.add(telemetry.mass.vel_norm_s.x);
  vel.add(telemetry.mass.vel_norm_s.y);
  mass["energy"] = telemetry.mass.energy;
  mass["fill"] = telemetry.mass.fill;

  JsonObject last_event = doc.createNestedObject("last_event");
  last_event["type"] = eventTypeToString(telemetry.last_event.type);
  last_event["primary_wall"] = wallToString(telemetry.last_event.primary_wall);
  last_event["amplitude"] = telemetry.last_event.amplitude;

  JsonArray actuators = doc.createNestedArray("actuators");
  for (float ch : telemetry.actuators.ch) {
    actuators.add(ch);
  }

  JsonObject tilt = doc.createNestedObject("tilt");
  tilt["thumb_angle_deg"] = telemetry.tilt.thumb_angle_deg;
  tilt["index_angle_deg"] = telemetry.tilt.index_angle_deg;
  tilt["thumb_current_limit_ma"] = telemetry.tilt.thumb_current_limit_ma;
  tilt["index_current_limit_ma"] = telemetry.tilt.index_current_limit_ma;
  tilt["thumb_base_deg"] = telemetry.tilt.thumb_base_deg;
  tilt["index_base_deg"] = telemetry.tilt.index_base_deg;
  tilt["thumb_delta_deg"] = telemetry.tilt.thumb_delta_deg;
  tilt["index_delta_deg"] = telemetry.tilt.index_delta_deg;
  tilt["common_force_n"] = telemetry.tilt.common_force_n;
  tilt["differential_torque_nm"] = telemetry.tilt.differential_torque_nm;
  tilt["cg_x_m"] = telemetry.tilt.cg_x_m;
  tilt["cg_y_m"] = telemetry.tilt.cg_y_m;
  tilt["apparent_mass_kg"] = telemetry.tilt.apparent_mass_kg;
  tilt["pseudoforce_enabled"] = telemetry.tilt.pseudoforce_enabled;

  JsonObject audio = doc.createNestedObject("audio");
  audio["compile_enabled"] = telemetry.audio.compile_enabled;
  audio["driver_installed"] = telemetry.audio.driver_installed;
  audio["runtime_enabled"] = telemetry.audio.runtime_enabled;
  audio["output_silenced"] = telemetry.audio.output_silenced;
  audio["test_mode"] = telemetry.audio.test_mode;
  audio["demo_compat_mode"] = telemetry.audio.demo_compat_mode;
  audio["transport"] = audioTransportToString(telemetry.audio.transport);
  audio["output_layout"] = audioLayoutToString(telemetry.audio.output_layout);
  audio["active_output_channels"] = telemetry.audio.active_output_channels;
  audio["test_wall"] = wallToString(telemetry.audio.test_wall);
  audio["output_peak_limit"] = telemetry.audio.output_peak_limit;
  audio["underrun_count"] = telemetry.audio.underrun_count;

  JsonObject safety = doc.createNestedObject("safety");
  safety["imu_stale_safe_stop"] = telemetry.safety.imu_stale_safe_stop;
  safety["audio_zero_asserted"] = telemetry.safety.audio_zero_asserted;
  safety["tilt_disarmed"] = telemetry.safety.tilt_disarmed;

  JsonObject recorder = doc.createNestedObject("recorder");
  recorder["recording"] = telemetry.recorder.recording;
  recorder["replaying"] = telemetry.recorder.replaying;
  recorder["recorded_frames"] = telemetry.recorder.recorded_frames;
  recorder["replay_index"] = telemetry.recorder.replay_index;

  JsonObject calibration = doc.createNestedObject("calibration");
  calibration["active"] = telemetry.calibration.active;
  calibration["finished"] = telemetry.calibration.finished;
  calibration["aborted"] = telemetry.calibration.aborted;
  calibration["wall"] = wallToString(telemetry.calibration.wall);
  calibration["band"] = calibrationBandToString(telemetry.calibration.band);
  calibration["stage"] = calibrationStageToString(telemetry.calibration.stage);
  calibration["candidate_hz"] = telemetry.calibration.candidate_hz;
  calibration["best_hz"] = telemetry.calibration.best_hz;
  calibration["candidate_score"] = telemetry.calibration.candidate_score;
  calibration["best_score"] = telemetry.calibration.best_score;
  calibration["progress"] = telemetry.calibration.progress;
  calibration["loaded_from_storage"] = telemetry.calibration.loaded_from_storage;

  JsonObject remote = doc.createNestedObject("remote");
  remote["compile_enabled"] = telemetry.remote.compile_enabled;
  remote["runtime_enabled"] = telemetry.remote.runtime_enabled;
  remote["connected_clients"] = telemetry.remote.connected_clients;
  remote["received_messages"] = telemetry.remote.received_messages;
  remote["transmitted_messages"] = telemetry.remote.transmitted_messages;

  if (include_pipeline_debug) {
    JsonObject pipeline_debug = doc.createNestedObject("pipeline_debug");
    pipeline_debug["event_count"] = telemetry.pipeline_debug.event_count;
    pipeline_debug["texture_count"] = telemetry.pipeline_debug.texture_count;
    pipeline_debug["resonance_count"] = telemetry.pipeline_debug.resonance_count;
    pipeline_debug["mass_enabled"] = telemetry.pipeline_debug.mass_enabled;
    pipeline_debug["event_enabled"] = telemetry.pipeline_debug.event_enabled;
    pipeline_debug["texture_enabled"] = telemetry.pipeline_debug.texture_enabled;
    pipeline_debug["resonance_enabled"] = telemetry.pipeline_debug.resonance_enabled;
    pipeline_debug["spatial_enabled"] = telemetry.pipeline_debug.spatial_enabled;
    pipeline_debug["imu_stale_safe_stop"] = telemetry.pipeline_debug.imu_stale_safe_stop;
  }
}

String serializeTelemetryPayload(const TelemetrySnapshot& telemetry, bool include_pipeline_debug) {
  StaticJsonDocument<2560> doc;
  populateTelemetryDocument(doc, telemetry, include_pipeline_debug);
  String payload;
  serializeJson(doc, payload);
  return payload;
}

bool handleHandshake(RemoteInterface& owner, size_t index) {
  WiFiClient& client = g_clients[index];
  readAvailableBytes(client, g_client_buffers[index]);
  if (g_client_buffers[index].length() > kMaxClientBufferBytes) {
    client.stop();
    g_client_buffers[index] = "";
    return false;
  }

  const int header_end = g_client_buffers[index].indexOf("\r\n\r\n");
  if (header_end < 0) {
    return false;
  }

  const int key_start = g_client_buffers[index].indexOf("Sec-WebSocket-Key:");
  if (key_start < 0) {
    client.stop();
    return false;
  }
  const int key_line_start = key_start + static_cast<int>(std::strlen("Sec-WebSocket-Key:"));
  const int key_line_end = g_client_buffers[index].indexOf("\r\n", key_line_start);
  String key = g_client_buffers[index].substring(key_line_start, key_line_end);
  key.trim();

  const String accept_key = websocketAcceptKey(key);
  client.printf(
      "HTTP/1.1 101 Switching Protocols\r\n"
      "Upgrade: websocket\r\n"
      "Connection: Upgrade\r\n"
      "Sec-WebSocket-Accept: %s\r\n\r\n",
      accept_key.c_str());
  g_client_handshaked[index] = true;
  g_client_buffers[index].remove(0, header_end + 4);
  owner.adjustClientCount(1);
  return true;
}

FrameExtractResult extractBufferedTextFrame(String& buffer, String& payload_out) {
  payload_out = "";
  if (buffer.length() < 2) {
    return FrameExtractResult::NeedMoreData;
  }

  const uint8_t b0 = byteAt(buffer, 0);
  const uint8_t b1 = byteAt(buffer, 1);
  const uint8_t opcode = b0 & 0x0F;

  size_t offset = 2;
  size_t payload_len = b1 & 0x7F;
  if (payload_len == 126) {
    if (buffer.length() < 4) {
      return FrameExtractResult::NeedMoreData;
    }
    payload_len = static_cast<size_t>(byteAt(buffer, 2)) << 8;
    payload_len |= static_cast<size_t>(byteAt(buffer, 3));
    offset = 4;
  } else if (payload_len == 127) {
    return FrameExtractResult::Disconnect;
  }

  const bool masked = (b1 & 0x80) != 0;
  if (masked && buffer.length() < static_cast<unsigned int>(offset + 4)) {
    return FrameExtractResult::NeedMoreData;
  }

  const size_t mask_offset = offset;
  offset += masked ? 4 : 0;
  const size_t frame_len = offset + payload_len;
  if (buffer.length() < static_cast<unsigned int>(frame_len)) {
    return FrameExtractResult::NeedMoreData;
  }

  if (opcode == 0x08) {
    buffer.remove(0, static_cast<unsigned int>(frame_len));
    return FrameExtractResult::Disconnect;
  }

  if (opcode != 0x01) {
    buffer.remove(0, static_cast<unsigned int>(frame_len));
    return FrameExtractResult::Consumed;
  }

  payload_out.reserve(payload_len);
  for (size_t i = 0; i < payload_len; ++i) {
    uint8_t byte = byteAt(buffer, offset + i);
    if (masked) {
      byte ^= byteAt(buffer, mask_offset + (i % 4));
    }
    payload_out += static_cast<char>(byte);
  }

  buffer.remove(0, static_cast<unsigned int>(frame_len));
  return FrameExtractResult::Consumed;
}
#endif

}  // namespace

bool RemoteInterface::begin(const SystemParams& params) {
  params_ = params;
  status_ = {};
  status_.compile_enabled = HAPTICS_ENABLE_REMOTE_BACKEND != 0;
  has_telemetry_ = false;
  last_telemetry_ = {};
  configure(params);
  return true;
}

void RemoteInterface::configure(const SystemParams& params) {
  const SystemParams previous_params = params_;
  const bool had_runtime_enabled = status_.runtime_enabled;
  params_ = params;
  status_.runtime_enabled = status_.compile_enabled && params.features.enable_remote_interface;

#if HAPTICS_ENABLE_REMOTE_BACKEND
  if (had_runtime_enabled && status_.runtime_enabled && !requiresRemoteRestart(previous_params, params_)) {
    return;
  }

  if (g_server != nullptr) {
    delete g_server;
    g_server = nullptr;
  }
  if (g_http_server != nullptr) {
    g_http_server->stop();
    delete g_http_server;
    g_http_server = nullptr;
  }
  for (auto& client : g_clients) {
    if (client.connected()) {
      client.stop();
    }
  }
  g_client_handshaked.fill(false);
  g_client_buffers.fill("");
  status_.connected_clients = 0;
  status_.received_messages = 0;
  status_.transmitted_messages = 0;
  WiFi.mode(WIFI_OFF);

  if (!status_.runtime_enabled) {
    return;
  }

  g_remote_owner = this;
  if (params_.iface.wifi_mode_ap) {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(params_.iface.wifi_ssid, params_.iface.wifi_password);
    Serial.printf(
        "remote: http://%s:%u/ ws://%s:%u ssid=%s\n",
        WiFi.softAPIP().toString().c_str(),
        static_cast<unsigned>(params_.iface.http_port),
        WiFi.softAPIP().toString().c_str(),
        static_cast<unsigned>(params_.iface.websocket_port),
        params_.iface.wifi_ssid);
  } else {
    WiFi.mode(WIFI_STA);
    WiFi.begin(params_.iface.wifi_ssid, params_.iface.wifi_password);
    Serial.printf(
        "remote: station ssid=%s http_port=%u ws_port=%u\n",
        params_.iface.wifi_ssid,
        static_cast<unsigned>(params_.iface.http_port),
        static_cast<unsigned>(params_.iface.websocket_port));
  }
  g_http_server = new WebServer(params_.iface.http_port);
  g_http_server->on("/", HTTP_GET, [this]() {
    const IPAddress ip = params_.iface.wifi_mode_ap ? WiFi.softAPIP() : WiFi.localIP();
    String page;
    page.reserve(2800);
    page += F("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>");
    page += F("<title>Haptics Status</title><style>body{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#101418;color:#e8eef2;margin:0;padding:16px;}h1{font-size:18px;margin:0 0 8px;}p{margin:4px 0 12px;color:#a9bac6;}pre{white-space:pre-wrap;word-break:break-word;background:#171e24;border:1px solid #2d3a44;border-radius:8px;padding:12px;}</style></head><body>");
    page += F("<h1>Container Haptics Status</h1><p>");
    page += (params_.iface.wifi_mode_ap ? "SoftAP " : "Station ");
    page += params_.iface.wifi_ssid;
    page += F(" | HTTP ");
    page += String(static_cast<unsigned>(params_.iface.http_port));
    page += F(" | WS ");
    page += String(static_cast<unsigned>(params_.iface.websocket_port));
    page += F(" | IP ");
    page += ip.toString();
    page += F("</p><pre id='status'>loading...</pre><script>async function pull(){try{const r=await fetch('/api/status');const s=await r.json();document.getElementById('status').textContent=JSON.stringify(s,null,2);}catch(err){document.getElementById('status').textContent='status fetch failed: '+err;}} setInterval(pull,500); pull();</script></body></html>");
    g_http_server->send(200, "text/html; charset=utf-8", page);
  });
  g_http_server->on("/api/status", HTTP_GET, [this]() {
    const TelemetrySnapshot& telemetry = has_telemetry_ ? last_telemetry_ : TelemetrySnapshot{};
    g_http_server->send(
        200,
        "application/json",
        serializeTelemetryPayload(telemetry, params_.features.enable_pipeline_debug_telemetry));
  });
  g_http_server->begin();
  g_server = new WiFiServer(params_.iface.websocket_port);
  g_server->begin();
#endif
}

void RemoteInterface::describeStatus(char* out, std::size_t size) const {
  if (out == nullptr || size == 0) {
    return;
  }
  out[0] = '\0';
#if HAPTICS_ENABLE_REMOTE_BACKEND
  const IPAddress ip = params_.iface.wifi_mode_ap ? WiFi.softAPIP() : WiFi.localIP();
  std::snprintf(out,
                size,
                "remote: enabled=%u mode=%s ssid=%s ip=%u.%u.%u.%u http=%u ws=%u clients=%u rx=%lu tx=%lu",
                static_cast<unsigned>(status_.runtime_enabled),
                params_.iface.wifi_mode_ap ? "ap" : "sta",
                params_.iface.wifi_ssid,
                static_cast<unsigned>(ip[0]),
                static_cast<unsigned>(ip[1]),
                static_cast<unsigned>(ip[2]),
                static_cast<unsigned>(ip[3]),
                static_cast<unsigned>(params_.iface.http_port),
                static_cast<unsigned>(params_.iface.websocket_port),
                static_cast<unsigned>(status_.connected_clients),
                static_cast<unsigned long>(status_.received_messages),
                static_cast<unsigned long>(status_.transmitted_messages));
#else
  std::snprintf(out, size, "remote: compile_enabled=0 runtime_enabled=0");
#endif
}

void RemoteInterface::pushMessage(const ControlMessage& message) {
  if (queue_count_ >= queue_.size()) {
    return;
  }
  queue_[queue_tail_] = message;
  queue_tail_ = (queue_tail_ + 1) % queue_.size();
  ++queue_count_;
}

void RemoteInterface::adjustClientCount(int delta) {
  if (delta < 0) {
    const uint16_t magnitude = static_cast<uint16_t>(-delta);
    status_.connected_clients = status_.connected_clients > magnitude ? status_.connected_clients - magnitude : 0;
  } else {
    status_.connected_clients = static_cast<uint16_t>(status_.connected_clients + delta);
  }
}

void RemoteInterface::noteReceivedMessage() {
  ++status_.received_messages;
}

bool RemoteInterface::popMessage(ControlMessage& message) {
  if (queue_count_ == 0) {
    return false;
  }
  message = queue_[queue_head_];
  queue_head_ = (queue_head_ + 1) % queue_.size();
  --queue_count_;
  return true;
}

void RemoteInterface::update() {
#if HAPTICS_ENABLE_REMOTE_BACKEND
  if (!status_.runtime_enabled || g_server == nullptr) {
    return;
  }

  if (g_http_server != nullptr) {
    g_http_server->handleClient();
  }

  WiFiClient candidate = g_server->available();
  if (candidate) {
    for (size_t i = 0; i < g_clients.size(); ++i) {
      if (!g_clients[i] || !g_clients[i].connected()) {
        g_clients[i] = candidate;
        g_client_handshaked[i] = false;
        g_client_buffers[i] = "";
        break;
      }
    }
  }

  for (size_t i = 0; i < g_clients.size(); ++i) {
    WiFiClient& client = g_clients[i];
    if (!client || !client.connected()) {
      if (g_client_handshaked[i]) {
        adjustClientCount(-1);
      }
      g_client_handshaked[i] = false;
      g_client_buffers[i] = "";
      continue;
    }

    if (!g_client_handshaked[i]) {
      handleHandshake(*this, i);
      continue;
    }

    readAvailableBytes(client, g_client_buffers[i]);
    if (g_client_buffers[i].length() > kMaxClientBufferBytes) {
      client.stop();
      continue;
    }

    while (true) {
      String payload;
      const FrameExtractResult result = extractBufferedTextFrame(g_client_buffers[i], payload);
      if (result == FrameExtractResult::NeedMoreData) {
        break;
      }
      if (result == FrameExtractResult::Disconnect) {
        client.stop();
        if (g_client_handshaked[i]) {
          adjustClientCount(-1);
        }
        g_client_handshaked[i] = false;
        g_client_buffers[i] = "";
        break;
      }
      if (payload.length() > 0) {
        ControlMessage message = parseControlPayload(payload.c_str());
        if (message.valid) {
          pushMessage(message);
        }
        noteReceivedMessage();
      }
    }
  }
#endif
}

void RemoteInterface::publishTelemetry(const TelemetrySnapshot& telemetry) {
  last_telemetry_ = telemetry;
  has_telemetry_ = true;
#if HAPTICS_ENABLE_REMOTE_BACKEND
  if (!status_.runtime_enabled || g_server == nullptr) {
    return;
  }
  if (millis() - last_telemetry_ms_ < params_.iface.telemetry_period_ms) {
    return;
  }
  last_telemetry_ms_ = millis();

  const String payload = serializeTelemetryPayload(telemetry, params_.features.enable_pipeline_debug_telemetry);

  for (size_t i = 0; i < g_clients.size(); ++i) {
    if (g_client_handshaked[i] && g_clients[i] && g_clients[i].connected()) {
      if (sendFrame(g_clients[i], payload.c_str(), payload.length())) {
        ++status_.transmitted_messages;
      }
    }
  }
#else
  (void)telemetry;
#endif
}

}  // namespace haptics
