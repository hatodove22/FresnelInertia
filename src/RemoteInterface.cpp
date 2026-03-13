#include "haptics/RemoteInterface.hpp"

#include <Arduino.h>
#include <ArduinoJson.h>

#ifndef HAPTICS_ENABLE_REMOTE_BACKEND
#define HAPTICS_ENABLE_REMOTE_BACKEND 0
#endif

#if HAPTICS_ENABLE_REMOTE_BACKEND
#include <WiFi.h>
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
RemoteInterface* g_remote_owner = nullptr;
WiFiServer* g_server = nullptr;
std::array<WiFiClient, kMaxWsClients> g_clients{};
std::array<bool, kMaxWsClients> g_client_handshaked{};
std::array<String, kMaxWsClients> g_client_buffers{};

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

bool handleHandshake(RemoteInterface& owner, size_t index) {
  WiFiClient& client = g_clients[index];
  while (client.available() > 0) {
    g_client_buffers[index] += static_cast<char>(client.read());
  }

  if (g_client_buffers[index].indexOf("\r\n\r\n") < 0) {
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
  g_client_buffers[index] = "";
  owner.adjustClientCount(1);
  return true;
}

bool readTextFrame(WiFiClient& client, String& payload_out) {
  if (client.available() < 2) {
    return false;
  }

  const uint8_t b0 = client.read();
  const uint8_t b1 = client.read();
  const uint8_t opcode = b0 & 0x0F;
  if (opcode == 0x08) {
    client.stop();
    return false;
  }
  if (opcode != 0x01) {
    return false;
  }

  size_t payload_len = b1 & 0x7F;
  if (payload_len == 126) {
    if (client.available() < 2) {
      return false;
    }
    payload_len = static_cast<size_t>(client.read()) << 8;
    payload_len |= static_cast<size_t>(client.read());
  } else if (payload_len == 127) {
    return false;
  }

  uint8_t mask[4]{};
  if (b1 & 0x80) {
    if (client.available() < 4) {
      return false;
    }
    for (int i = 0; i < 4; ++i) {
      mask[i] = client.read();
    }
  }

  payload_out.reserve(payload_len);
  for (size_t i = 0; i < payload_len; ++i) {
    while (client.available() == 0) {
      delay(1);
    }
    uint8_t byte = client.read();
    if (b1 & 0x80) {
      byte ^= mask[i % 4];
    }
    payload_out += static_cast<char>(byte);
  }
  return true;
}
#endif

}  // namespace

bool RemoteInterface::begin(const SystemParams& params) {
  params_ = params;
  status_ = {};
  status_.compile_enabled = HAPTICS_ENABLE_REMOTE_BACKEND != 0;
  configure(params);
  return true;
}

void RemoteInterface::configure(const SystemParams& params) {
  params_ = params;
  status_.runtime_enabled = status_.compile_enabled && params.features.enable_remote_interface;

#if HAPTICS_ENABLE_REMOTE_BACKEND
  if (!status_.runtime_enabled) {
    if (g_server != nullptr) {
      delete g_server;
      g_server = nullptr;
    }
    for (auto& client : g_clients) {
      if (client.connected()) {
        client.stop();
      }
    }
    g_client_handshaked.fill(false);
    g_client_buffers.fill("");
    status_.connected_clients = 0;
    WiFi.mode(WIFI_OFF);
    return;
  }

  g_remote_owner = this;
  WiFi.mode(WIFI_AP);
  WiFi.softAP(params_.iface.wifi_ssid, params_.iface.wifi_password);
  if (g_server == nullptr) {
    g_server = new WiFiServer(params_.iface.websocket_port);
    g_server->begin();
    Serial.printf(
        "remote: ws://%s:%u ssid=%s\n",
        WiFi.softAPIP().toString().c_str(),
        static_cast<unsigned>(params_.iface.websocket_port),
        params_.iface.wifi_ssid);
  }
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

    String payload;
    if (readTextFrame(client, payload)) {
      ControlMessage message = parseControlPayload(payload.c_str());
      if (message.valid) {
        pushMessage(message);
      }
      noteReceivedMessage();
    }
  }
#endif
}

void RemoteInterface::publishTelemetry(const TelemetrySnapshot& telemetry) {
#if HAPTICS_ENABLE_REMOTE_BACKEND
  if (!status_.runtime_enabled || g_server == nullptr) {
    return;
  }
  if (millis() - last_telemetry_ms_ < params_.iface.telemetry_period_ms) {
    return;
  }
  last_telemetry_ms_ = millis();

  StaticJsonDocument<1536> doc;
  doc["timestamp_ms"] = telemetry.timestamp_ms;
  doc["preset"] = telemetry.active_preset;
  doc["run_mode"] = runModeToString(telemetry.run_mode);

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

  JsonObject audio = doc.createNestedObject("audio");
  audio["compile_enabled"] = telemetry.audio.compile_enabled;
  audio["runtime_enabled"] = telemetry.audio.runtime_enabled;
  audio["test_mode"] = telemetry.audio.test_mode;
  audio["test_wall"] = wallToString(telemetry.audio.test_wall);
  audio["underrun_count"] = telemetry.audio.underrun_count;

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

  String payload;
  serializeJson(doc, payload);

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
