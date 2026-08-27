#pragma once

#include <cstddef>
#include <cstdint>

#ifndef HAPTICS_ATOMS3_COMBINED_PROBE_ENABLE
#define HAPTICS_ATOMS3_COMBINED_PROBE_ENABLE 0
#endif

namespace haptics {
namespace atoms3_combined_probe {

constexpr int kDxlTxPin = 1;
constexpr int kDxlRxPin = 2;
constexpr uint32_t kDxlBaud = 57600;
constexpr uint8_t kServoId1 = 1;
constexpr uint8_t kServoId2 = 2;
constexpr uint16_t kExpectedServoModel = 1190;

constexpr int kBclkPin = 5;
constexpr int kLrclkPin = 6;
constexpr int kDataOutPin = 7;
constexpr uint32_t kSampleRateHz = 48000;
constexpr uint8_t kBitsPerSlot = 16;
constexpr uint8_t kSlotsPerFrame = 8;
constexpr uint8_t kDrivenSlots = 4;
constexpr size_t kFramesPerBlock = 240;
constexpr uint8_t kDmaBufferCount = 12;

constexpr float kToneHz = 180.0f;
constexpr float kDefaultHapticLevel = 0.08f;
constexpr float kMinimumHapticLevel = 0.025f;
constexpr float kMaximumHapticLevel = 0.15f;
constexpr uint16_t kBurstOnMs = 50;
constexpr uint16_t kBurstPeriodMs = 300;
constexpr uint16_t kRampMs = 8;

constexpr int32_t kMotionTravelPulses = 40;
constexpr int32_t kMotionPositionTolerancePulses = 12;
constexpr uint32_t kMotionProfileVelocity = 5;
constexpr uint32_t kMotionProfileAcceleration = 1;
constexpr int16_t kMotionGoalPwmLimit = 150;
constexpr int16_t kMotionAbortCurrentMa = 350;
constexpr uint8_t kMotionAbortTemperatureC = 45;
constexpr uint16_t kMotionMinVoltageDecivolt = 45;
constexpr uint16_t kMotionMaxVoltageDecivolt = 56;
constexpr uint8_t kMotionBusWatchdog20Ms = 50;
constexpr uint32_t kMotionPhaseTimeoutMs = 4000;
constexpr uint32_t kCombinedRunWatchdogMs = 9000;
constexpr uint32_t kServoStatusPeriodMs = 100;
constexpr uint32_t kImuStaleAbortMs = 300;
constexpr uint32_t kMaximumI2sServiceGapUs = 75000;

static_assert(kSlotsPerFrame == 8,
              "MAX98357A 16-bit TDM requires 128 BCLKs per frame");
static_assert(kDrivenSlots <= kSlotsPerFrame, "Driven slots must fit the frame");
static_assert(kFramesPerBlock * kSlotsPerFrame * sizeof(int16_t) <= 4092,
              "I2S DMA block exceeds the ESP-IDF descriptor limit");
static_assert(kMinimumHapticLevel > 0.0f &&
                  kDefaultHapticLevel >= kMinimumHapticLevel &&
                  kDefaultHapticLevel <= kMaximumHapticLevel,
              "Combined-probe haptic levels must be ordered");

}  // namespace atoms3_combined_probe
}  // namespace haptics
