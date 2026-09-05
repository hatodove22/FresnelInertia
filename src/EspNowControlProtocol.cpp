#include "haptics/EspNowControlProtocol.hpp"

#include <cmath>
#include <cstddef>
#include <cstring>

#include "haptics/EspNowTelemetryProtocol.hpp"

namespace haptics {
namespace {

template <std::size_t N>
void copyText(char (&destination)[N], const char* source) {
  if (source == nullptr) {
    return;
  }
  std::strncpy(destination, source, N - 1U);
}

bool isTerminated(const char* value, std::size_t capacity) {
  return value != nullptr && capacity != 0U && value[capacity - 1U] == '\0';
}

}  // namespace

EspNowControlPacketV1 encodeEspNowControlPacketV1(
    EspNowControlOperation operation,
    uint32_t request_id,
    uint32_t session_id,
    EspNowControlValueType value_type,
    RunMode run_mode,
    bool enabled,
    float number,
    const char* path,
    const char* text) {
  EspNowControlPacketV1 packet{};
  packet.packet_size = static_cast<uint16_t>(sizeof(packet));
  packet.operation = static_cast<uint8_t>(operation);
  packet.request_id = request_id;
  packet.session_id = session_id;
  packet.value_type = static_cast<uint8_t>(value_type);
  packet.run_mode = static_cast<uint8_t>(run_mode);
  packet.enabled = enabled ? 1U : 0U;
  packet.number = number;
  copyText(packet.path, path);
  copyText(packet.text, text);
  packet.crc32 =
      espNowTelemetryCrc32(&packet, offsetof(EspNowControlPacketV1, crc32));
  return packet;
}

bool validateEspNowControlPacketV1(const void* data, std::size_t length) {
  if (data == nullptr || length != sizeof(EspNowControlPacketV1)) {
    return false;
  }
  EspNowControlPacketV1 packet{};
  std::memcpy(&packet, data, sizeof(packet));
  return packet.magic == kEspNowControlMagic &&
         packet.packet_size == sizeof(EspNowControlPacketV1) &&
         packet.version == kEspNowControlVersion &&
         packet.operation >=
             static_cast<uint8_t>(EspNowControlOperation::Hello) &&
         packet.operation <=
             static_cast<uint8_t>(EspNowControlOperation::ClearTiltFault) &&
         packet.value_type <=
             static_cast<uint8_t>(EspNowControlValueType::Text) &&
         packet.run_mode <= static_cast<uint8_t>(RunMode::Replay) &&
         packet.enabled <= 1U && packet.reserved == 0U &&
         std::isfinite(packet.number) &&
         isTerminated(packet.path, sizeof(packet.path)) &&
         isTerminated(packet.text, sizeof(packet.text)) &&
         packet.crc32 == espNowTelemetryCrc32(
                             &packet,
                             offsetof(EspNowControlPacketV1, crc32));
}

EspNowControlResponseV1 encodeEspNowControlResponseV1(
    EspNowControlResult result,
    uint32_t request_id,
    uint32_t session_id,
    uint64_t applied_frame_counter,
    const char* detail) {
  EspNowControlResponseV1 response{};
  response.packet_size = static_cast<uint16_t>(sizeof(response));
  response.result = static_cast<uint8_t>(result);
  response.request_id = request_id;
  response.session_id = session_id;
  response.applied_frame_counter = applied_frame_counter;
  copyText(response.detail, detail);
  response.crc32 = espNowTelemetryCrc32(
      &response, offsetof(EspNowControlResponseV1, crc32));
  return response;
}

bool validateEspNowControlResponseV1(const void* data, std::size_t length) {
  if (data == nullptr || length != sizeof(EspNowControlResponseV1)) {
    return false;
  }
  EspNowControlResponseV1 response{};
  std::memcpy(&response, data, sizeof(response));
  return response.magic == kEspNowResponseMagic &&
         response.packet_size == sizeof(EspNowControlResponseV1) &&
         response.version == kEspNowControlVersion &&
         response.result <= static_cast<uint8_t>(EspNowControlResult::Busy) &&
         isTerminated(response.detail, sizeof(response.detail)) &&
         response.crc32 == espNowTelemetryCrc32(
                               &response,
                               offsetof(EspNowControlResponseV1, crc32));
}

}  // namespace haptics
