#pragma once

#include <array>

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class RuntimeCalibrator {
 public:
  void configure(const SystemParams& params);
  bool loadStoredCarriers(SystemParams& params);
  bool start(SystemParams& params, uint32_t now_ms);
  bool stop(SystemParams& params, bool keep_results);
  bool update(const ImuSample& sample, uint32_t now_ms, SystemParams& params);
  bool isActive() const { return status_.active; }
  const RuntimeCalibrationStatus& status() const { return status_; }
  DriveFrame4 driveFrame() const;

 private:
  uint32_t totalCandidateSteps() const;
  float currentRangeStartHz() const;
  float currentRangeStopHz() const;
  float currentRangeStepHz() const;
  void beginCandidate(SystemParams& params, uint32_t now_ms);
  bool advanceCandidate(SystemParams& params, uint32_t now_ms);
  void restoreRunState(SystemParams& params);
  void updateProgress();
  float observeSample(const ImuSample& sample);
  bool persistCarriers(const SystemParams& params) const;

  SystemParams params_{};
  RuntimeCalibrationStatus status_{};
  std::array<float, 4> saved_low_carrier_hz_{};
  std::array<float, 4> saved_high_carrier_hz_{};
  bool saved_audio_feature_enable_ = false;
  bool saved_audio_runtime_enable_ = false;
  bool saved_test_enable_ = false;
  WallId saved_test_wall_ = WallId::None;
  float saved_test_level_ = 0.0f;
  ImuSample previous_sample_{};
  bool previous_sample_valid_ = false;
  uint32_t phase_start_ms_ = 0;
  float score_accumulator_ = 0.0f;
  uint32_t score_samples_ = 0;
  float settle_score_accumulator_ = 0.0f;
  uint32_t settle_score_samples_ = 0;
};

}  // namespace haptics
