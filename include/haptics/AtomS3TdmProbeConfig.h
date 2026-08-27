#pragma once

#include <cstddef>
#include <cstdint>

#ifndef HAPTICS_ATOMS3_TDM_PROBE_ENABLE
#define HAPTICS_ATOMS3_TDM_PROBE_ENABLE 0
#endif

namespace haptics {
namespace atoms3_tdm_probe {

constexpr int kBclkPin = 5;
constexpr int kLrclkPin = 6;
constexpr int kDataOutPin = 7;

constexpr uint32_t kSampleRateHz = 48000;
constexpr uint8_t kBitsPerSlot = 16;
constexpr uint8_t kSlotsPerFrame = 8;
constexpr uint8_t kUsedSlots = 4;
constexpr size_t kFramesPerBlock = 240;
constexpr uint32_t kBclkFrequencyHz =
    kSampleRateHz * kBitsPerSlot * kSlotsPerFrame;

constexpr float kDefaultToneHz = 180.0f;
constexpr float kDefaultDigitalLevel = 0.025f;
constexpr float kMinimumAdjustableDigitalLevel = 0.005f;
// MAX98357A TDM gain is fixed at 12 dB. Keep the bench command below the
// approximate 25%-digital full-output point to retain headroom before clipping.
constexpr float kHardDigitalLevelLimit = 0.20f;
constexpr uint16_t kBurstOnMs = 50;
constexpr uint16_t kBurstPeriodMs = 300;
constexpr uint16_t kRampMs = 8;
constexpr uint32_t kSingleChannelDurationMs = 1200;
constexpr uint32_t kInterChannelMuteMs = 500;
constexpr uint32_t kRunWatchdogMs = 8000;
constexpr float kSweepStartHz = 120.0f;
constexpr float kSweepStopHz = 320.0f;
constexpr float kSweepStepHz = 40.0f;
constexpr float kSweepDigitalLevel = 0.04f;
constexpr uint32_t kSweepStepDurationMs = 1500;
constexpr uint32_t kSweepRunWatchdogMs = 12000;

static_assert(kSlotsPerFrame == 8,
              "MAX98357A 16-bit TDM requires 128 BCLKs per frame (8 slots)");
static_assert(kUsedSlots <= kSlotsPerFrame, "Used TDM slots must fit in the frame");
static_assert(kFramesPerBlock * kSlotsPerFrame * sizeof(int16_t) <= 4092,
              "One I2S DMA block must remain within the ESP-IDF descriptor limit");
static_assert(kDefaultDigitalLevel <= kHardDigitalLevelLimit,
              "Default probe level must not exceed its hard limit");
static_assert(kMinimumAdjustableDigitalLevel > 0.0f &&
                  kMinimumAdjustableDigitalLevel <= kDefaultDigitalLevel,
              "Minimum adjustable level must be positive and conservative");
static_assert(kSweepStartHz > 0.0f && kSweepStopHz >= kSweepStartHz &&
                  kSweepStepHz > 0.0f,
              "Sweep range must be positive and ordered");
static_assert(kSweepStepDurationMs >= kBurstPeriodMs,
              "Each sweep step must contain at least one complete burst period");
static_assert(kSweepDigitalLevel <= kHardDigitalLevelLimit,
              "Sweep probe level must not exceed its hard limit");

}  // namespace atoms3_tdm_probe
}  // namespace haptics
