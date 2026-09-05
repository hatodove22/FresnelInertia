#pragma once

#include <cstddef>
#include <cstdint>

#include "haptics/Types.hpp"

namespace haptics {

constexpr uint32_t kEspNowControlMagic = 0x31434846U;   // "FHC1" little-endian.
constexpr uint32_t kEspNowResponseMagic = 0x31414846U;  // "FHA1" little-endian.
constexpr uint8_t kEspNowControlVersion = 1U;

enum class EspNowControlOperation : uint8_t {
  Hello = 1,
  GetState = 2,
  SafeIdle = 3,
  SetRunMode = 4,
  SetAudioEnabled = 5,
  LoadPreset = 6,
  SetParam = 7,
  TriggerEvent = 8,
  SetTiltEnabled = 9,
  ClearTiltFault = 10,
};

enum class EspNowControlValueType : uint8_t {
  None = 0,
  Boolean = 1,
  Number = 2,
  Text = 3,
};

enum class EspNowControlResult : uint8_t {
  Applied = 0,
  Rejected = 1,
  Unsupported = 2,
  NotPaired = 3,
  BadSession = 4,
  StaleRequest = 5,
  InvalidRequest = 6,
  Busy = 7,
};

#pragma pack(push, 1)
struct EspNowControlPacketV1 {
  uint32_t magic = kEspNowControlMagic;
  uint16_t packet_size = 0U;
  uint8_t version = kEspNowControlVersion;
  uint8_t operation = 0U;
  uint32_t request_id = 0U;
  uint32_t session_id = 0U;
  uint8_t value_type = 0U;
  uint8_t run_mode = 0U;
  uint8_t enabled = 0U;
  uint8_t reserved = 0U;
  float number = 0.0f;
  char path[48]{};
  char text[64]{};
  uint32_t crc32 = 0U;
};

struct EspNowControlResponseV1 {
  uint32_t magic = kEspNowResponseMagic;
  uint16_t packet_size = 0U;
  uint8_t version = kEspNowControlVersion;
  uint8_t result = 0U;
  uint32_t request_id = 0U;
  uint32_t session_id = 0U;
  uint64_t applied_frame_counter = 0U;
  char detail[60]{};
  uint32_t crc32 = 0U;
};
#pragma pack(pop)

static_assert(sizeof(EspNowControlPacketV1) == 140U,
              "ESP-NOW control wire-v1 packet layout changed");
static_assert(offsetof(EspNowControlPacketV1, path) == 24U,
              "ESP-NOW control wire-v1 path offset changed");
static_assert(offsetof(EspNowControlPacketV1, text) == 72U,
              "ESP-NOW control wire-v1 text offset changed");
static_assert(offsetof(EspNowControlPacketV1, crc32) == 136U,
              "ESP-NOW control wire-v1 CRC offset changed");
static_assert(sizeof(EspNowControlResponseV1) == 88U,
              "ESP-NOW response wire-v1 packet layout changed");
static_assert(offsetof(EspNowControlResponseV1, crc32) == 84U,
              "ESP-NOW response wire-v1 CRC offset changed");

EspNowControlPacketV1 encodeEspNowControlPacketV1(
    EspNowControlOperation operation,
    uint32_t request_id,
    uint32_t session_id,
    EspNowControlValueType value_type = EspNowControlValueType::None,
    RunMode run_mode = RunMode::Idle,
    bool enabled = false,
    float number = 0.0f,
    const char* path = nullptr,
    const char* text = nullptr);
bool validateEspNowControlPacketV1(const void* data, std::size_t length);

EspNowControlResponseV1 encodeEspNowControlResponseV1(
    EspNowControlResult result,
    uint32_t request_id,
    uint32_t session_id,
    uint64_t applied_frame_counter,
    const char* detail);
bool validateEspNowControlResponseV1(const void* data, std::size_t length);

}  // namespace haptics
