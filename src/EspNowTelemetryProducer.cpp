#include "haptics/EspNowTelemetryProducer.hpp"

#include <Arduino.h>

#include <algorithm>
#include <cstdio>
#include <cstring>

#include "haptics/EspNowControlProtocol.hpp"
#include "haptics/EspNowTelemetryProtocol.hpp"

#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
#include <WiFi.h>
#include <esp_idf_version.h>
#include <esp_now.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#endif

namespace haptics {
namespace {

constexpr uint8_t kEspNowChannel = 6U;
constexpr uint8_t kBroadcastAddress[6]{0xffU, 0xffU, 0xffU,
                                        0xffU, 0xffU, 0xffU};
constexpr uint32_t kControlQueueDepth = 8U;

#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
EspNowTelemetryProducer* g_active_producer = nullptr;

#if ESP_IDF_VERSION_MAJOR >= 5
void receiveCallback(const esp_now_recv_info_t* info,
                     const uint8_t* data,
                     int length) {
  if (g_active_producer != nullptr && info != nullptr) {
    g_active_producer->enqueueControlFromRadio(
        info->src_addr, data, static_cast<std::size_t>(length));
  }
}
#else
void receiveCallback(const uint8_t* source,
                     const uint8_t* data,
                     int length) {
  if (g_active_producer != nullptr) {
    g_active_producer->enqueueControlFromRadio(
        source, data, static_cast<std::size_t>(length));
  }
}
#endif
#endif

}  // namespace

bool EspNowTelemetryProducer::begin(const SystemParams& params) {
  status_ = {};
  status_.compile_enabled = HAPTICS_ENABLE_ESPNOW_TELEMETRY != 0;
  status_.channel = kEspNowChannel;
  status_.packet_bytes = static_cast<uint16_t>(sizeof(EspNowTelemetryPacketV3));
  configure(params);
  status_.runtime_enabled = false;
  status_.initialized = false;
  last_emit_ms_ = millis();
  last_control_request_id_ = 0U;
  std::memset(paired_source_, 0, sizeof(paired_source_));
  return true;
}

void EspNowTelemetryProducer::configure(const SystemParams& params) {
  resolved_ = makeEspNowResolvedState(params);
  status_.period_ms = static_cast<uint16_t>(std::max<uint32_t>(
      kMinPeriodMs,
      std::min<uint32_t>(params.iface.telemetry_period_ms, kMaxPeriodMs)));
  if (!params.features.enable_espnow_telemetry) {
    setRuntimeEnabled(false);
  }
}

bool EspNowTelemetryProducer::startRadio() {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
  if (status_.initialized) {
    return true;
  }
  if (control_queue_ == nullptr) {
    control_queue_ = xQueueCreate(kControlQueueDepth,
                                  sizeof(EspNowControlEnvelope));
    if (control_queue_ == nullptr) {
      return false;
    }
  }
  xQueueReset(static_cast<QueueHandle_t>(control_queue_));
  if (!WiFi.mode(WIFI_STA)) {
    return false;
  }
  delay(10);
  if (esp_wifi_set_ps(WIFI_PS_NONE) != ESP_OK ||
      esp_wifi_set_channel(kEspNowChannel, WIFI_SECOND_CHAN_NONE) != ESP_OK ||
      esp_now_init() != ESP_OK ||
      esp_now_register_recv_cb(receiveCallback) != ESP_OK) {
    esp_now_deinit();
    WiFi.mode(WIFI_OFF);
    return false;
  }

  esp_now_peer_info_t peer{};
  std::memcpy(peer.peer_addr, kBroadcastAddress, sizeof(kBroadcastAddress));
  peer.channel = kEspNowChannel;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  if (esp_now_add_peer(&peer) != ESP_OK) {
    esp_now_deinit();
    WiFi.mode(WIFI_OFF);
    return false;
  }
  g_active_producer = this;
  status_.control_session_id = esp_random();
  if (status_.control_session_id == 0U) {
    status_.control_session_id = 1U;
  }
  status_.control_paired = false;
  last_control_request_id_ = 0U;
  std::memset(paired_source_, 0, sizeof(paired_source_));
  status_.initialized = true;
  return true;
#else
  return false;
#endif
}

void EspNowTelemetryProducer::stopRadio() {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
  if (g_active_producer == this) {
    g_active_producer = nullptr;
  }
  if (status_.initialized) {
    esp_now_unregister_recv_cb();
    esp_now_del_peer(kBroadcastAddress);
    esp_now_deinit();
  }
  if (control_queue_ != nullptr) {
    xQueueReset(static_cast<QueueHandle_t>(control_queue_));
  }
  WiFi.mode(WIFI_OFF);
#endif
  status_.initialized = false;
  status_.control_paired = false;
  status_.control_session_id = 0U;
  last_control_request_id_ = 0U;
  std::memset(paired_source_, 0, sizeof(paired_source_));
}

bool EspNowTelemetryProducer::setRuntimeEnabled(bool enabled) {
  if (enabled && !status_.compile_enabled) {
    return false;
  }
  if (!enabled) {
    status_.runtime_enabled = false;
    stopRadio();
    return true;
  }
  if (!startRadio()) {
    ++status_.send_errors;
    status_.runtime_enabled = false;
    return false;
  }
  status_.runtime_enabled = true;
  last_emit_ms_ = millis();
  return true;
}

void EspNowTelemetryProducer::publish(const TelemetrySnapshot& snapshot) {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
  if (!status_.runtime_enabled || !status_.initialized) {
    return;
  }
  const uint32_t now_ms = millis();
  if (now_ms - last_emit_ms_ < status_.period_ms) {
    return;
  }
  last_emit_ms_ = now_ms;
  sendSnapshot(snapshot);
#else
  (void)snapshot;
#endif
}

void EspNowTelemetryProducer::publishNow(const TelemetrySnapshot& snapshot) {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
  if (status_.runtime_enabled && status_.initialized) {
    last_emit_ms_ = millis();
    sendSnapshot(snapshot);
  }
#else
  (void)snapshot;
#endif
}

bool EspNowTelemetryProducer::sendSnapshot(
    const TelemetrySnapshot& snapshot) {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
  const uint32_t sequence = status_.sequence + 1U;
  const EspNowTelemetryPacketV3 packet =
      encodeEspNowTelemetryPacketV3(snapshot, sequence, resolved_);
  const esp_err_t result = esp_now_send(
      kBroadcastAddress,
      reinterpret_cast<const uint8_t*>(&packet),
      sizeof(packet));
  status_.sequence = sequence;
  if (result == ESP_OK) {
    ++status_.transmitted_packets;
    return true;
  }
  ++status_.dropped_packets;
  ++status_.send_errors;
#else
  (void)snapshot;
#endif
  return false;
}

bool EspNowTelemetryProducer::enqueueControlFromRadio(
    const uint8_t source[6],
    const uint8_t* data,
    std::size_t length) {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
  if (source == nullptr || data == nullptr || control_queue_ == nullptr ||
      !validateEspNowControlPacketV1(data, length)) {
    callback_control_invalid_.fetch_add(1U, std::memory_order_relaxed);
    return false;
  }
  EspNowControlEnvelope request{};
  std::memcpy(request.source, source, sizeof(request.source));
  std::memcpy(&request.packet, data, sizeof(request.packet));
  if (xQueueSend(static_cast<QueueHandle_t>(control_queue_), &request, 0U) !=
      pdTRUE) {
    callback_control_queue_drops_.fetch_add(1U, std::memory_order_relaxed);
    return false;
  }
  callback_control_received_.fetch_add(1U, std::memory_order_relaxed);
  return true;
#else
  (void)source;
  (void)data;
  (void)length;
  return false;
#endif
}

bool EspNowTelemetryProducer::popControlRequest(
    EspNowControlEnvelope& request) {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
  return control_queue_ != nullptr &&
         xQueueReceive(static_cast<QueueHandle_t>(control_queue_), &request,
                       0U) == pdTRUE;
#else
  (void)request;
  return false;
#endif
}

bool EspNowTelemetryProducer::sourceMatchesPaired(
    const uint8_t source[6]) const {
  return source != nullptr &&
         std::memcmp(source, paired_source_, sizeof(paired_source_)) == 0;
}

EspNowControlResult EspNowTelemetryProducer::authorizeControl(
    const EspNowControlEnvelope& request,
    bool safe_idle) {
  const auto operation =
      static_cast<EspNowControlOperation>(request.packet.operation);
  if (request.packet.request_id == 0U) {
    return EspNowControlResult::InvalidRequest;
  }
  if (operation == EspNowControlOperation::Hello) {
    if (!safe_idle || request.packet.session_id != 0U) {
      return EspNowControlResult::Rejected;
    }
    if (status_.control_paired && !sourceMatchesPaired(request.source)) {
      return EspNowControlResult::Busy;
    }
    std::memcpy(paired_source_, request.source, sizeof(paired_source_));
    status_.control_paired = true;
    last_control_request_id_ = request.packet.request_id;
    return EspNowControlResult::Applied;
  }
  if (!status_.control_paired || !sourceMatchesPaired(request.source)) {
    return EspNowControlResult::NotPaired;
  }
  if (request.packet.session_id != status_.control_session_id) {
    return EspNowControlResult::BadSession;
  }
  if (request.packet.request_id <= last_control_request_id_) {
    return EspNowControlResult::StaleRequest;
  }
  last_control_request_id_ = request.packet.request_id;
  return EspNowControlResult::Applied;
}

bool EspNowTelemetryProducer::ensurePeer(const uint8_t address[6]) {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
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
#else
  (void)address;
  return false;
#endif
}

bool EspNowTelemetryProducer::sendControlResponse(
    const EspNowControlEnvelope& request,
    EspNowControlResult result,
    uint64_t applied_frame_counter,
    const char* detail) {
#if HAPTICS_ENABLE_ESPNOW_TELEMETRY
  if (!status_.runtime_enabled || !status_.initialized ||
      !ensurePeer(request.source)) {
    ++status_.send_errors;
    return false;
  }
  const EspNowControlResponseV1 response = encodeEspNowControlResponseV1(
      result, request.packet.request_id, status_.control_session_id,
      applied_frame_counter, detail);
  if (esp_now_send(request.source,
                   reinterpret_cast<const uint8_t*>(&response),
                   sizeof(response)) != ESP_OK) {
    ++status_.send_errors;
    return false;
  }
  ++status_.control_responses;
  return true;
#else
  (void)request;
  (void)result;
  (void)applied_frame_counter;
  (void)detail;
  return false;
#endif
}

void EspNowTelemetryProducer::noteControlResult(EspNowControlResult result) {
  if (result == EspNowControlResult::Applied) {
    ++status_.control_applied;
  } else {
    ++status_.control_rejected;
  }
}

void EspNowTelemetryProducer::describeStatus(char* out, std::size_t size) const {
  if (out == nullptr || size == 0U) {
    return;
  }
  std::snprintf(
      out,
      size,
      "espnow_link: compile=%u initialized=%u runtime=%u channel=%u period_ms=%u packet_bytes=%u sequence=%lu tx=%lu dropped=%lu errors=%lu paired=%u session=%08lX control_rx=%lu control_invalid=%lu control_queue_drops=%lu responses=%lu applied=%lu rejected=%lu",
      static_cast<unsigned>(status_.compile_enabled),
      static_cast<unsigned>(status_.initialized),
      static_cast<unsigned>(status_.runtime_enabled),
      static_cast<unsigned>(status_.channel),
      static_cast<unsigned>(status_.period_ms),
      static_cast<unsigned>(status_.packet_bytes),
      static_cast<unsigned long>(status_.sequence),
      static_cast<unsigned long>(status_.transmitted_packets),
      static_cast<unsigned long>(status_.dropped_packets),
      static_cast<unsigned long>(status_.send_errors),
      static_cast<unsigned>(status_.control_paired),
      static_cast<unsigned long>(status_.control_session_id),
      static_cast<unsigned long>(
          callback_control_received_.load(std::memory_order_relaxed)),
      static_cast<unsigned long>(
          callback_control_invalid_.load(std::memory_order_relaxed)),
      static_cast<unsigned long>(
          callback_control_queue_drops_.load(std::memory_order_relaxed)),
      static_cast<unsigned long>(status_.control_responses),
      static_cast<unsigned long>(status_.control_applied),
      static_cast<unsigned long>(status_.control_rejected));
}

}  // namespace haptics
