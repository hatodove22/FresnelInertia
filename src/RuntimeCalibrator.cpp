#include "haptics/RuntimeCalibrator.hpp"

#include "haptics/DebugFlags.hpp"

#include <Preferences.h>

#include <algorithm>
#include <cmath>

namespace haptics {
namespace {

constexpr size_t kWallCount = 4;
constexpr char kPreferenceNamespace[] = "haptics-cal";
constexpr char kLowCarrierKey[] = "low";
constexpr char kHighCarrierKey[] = "high";

float clampf(float value, float lo, float hi) {
  return std::max(lo, std::min(value, hi));
}

float vecDeltaMagnitude(const Vec3f& a, const Vec3f& b) {
  const float dx = a.x - b.x;
  const float dy = a.y - b.y;
  const float dz = a.z - b.z;
  return std::sqrt(dx * dx + dy * dy + dz * dz);
}

WallId wallFromIndex(size_t index) {
  switch (index) {
    case 0:
      return WallId::Front;
    case 1:
      return WallId::Back;
    case 2:
      return WallId::Top;
    case 3:
      return WallId::Bottom;
    default:
      return WallId::None;
  }
}

size_t wallToIndex(WallId wall) {
  switch (wall) {
    case WallId::Front:
      return 0;
    case WallId::Back:
      return 1;
    case WallId::Top:
      return 2;
    case WallId::Bottom:
      return 3;
    case WallId::None:
    default:
      return kWallCount;
  }
}

size_t activeWallCount(AudioOutputLayout layout) {
  return layout == AudioOutputLayout::FrontBack2Ch ? 2u : kWallCount;
}

WallId activeWallAt(AudioOutputLayout layout, size_t active_index) {
  if (layout == AudioOutputLayout::FrontBack2Ch) {
    switch (active_index) {
      case 0:
        return WallId::Front;
      case 1:
        return WallId::Back;
      default:
        return WallId::None;
    }
  }
  return wallFromIndex(active_index);
}

WallId nextActiveWall(AudioOutputLayout layout, WallId current) {
  const size_t count = activeWallCount(layout);
  for (size_t i = 0; i < count; ++i) {
    if (activeWallAt(layout, i) == current) {
      return (i + 1u < count) ? activeWallAt(layout, i + 1u) : WallId::None;
    }
  }
  return WallId::None;
}

uint32_t countSteps(float start_hz, float stop_hz, float step_hz) {
  if (step_hz <= 0.0f || stop_hz < start_hz) {
    return 1;
  }
  return static_cast<uint32_t>(((stop_hz - start_hz) / step_hz) + 1.0f);
}

void putFloatArray(Preferences& prefs, const char* key, const std::array<float, 4>& values) {
  prefs.putBytes(key, values.data(), values.size() * sizeof(float));
}

bool getFloatArray(Preferences& prefs, const char* key, std::array<float, 4>& values) {
  const size_t bytes = prefs.getBytesLength(key);
  if (bytes != values.size() * sizeof(float)) {
    return false;
  }
  return prefs.getBytes(key, values.data(), bytes) == bytes;
}

}  // namespace

void RuntimeCalibrator::configure(const SystemParams& params) {
  params_ = params;
  if (!status_.active) {
    status_.total_steps = totalCandidateSteps();
    updateProgress();
  }
}

bool RuntimeCalibrator::loadStoredCarriers(SystemParams& params) {
#if HAPTICS_DEBUG_DISABLE_STORAGE
  (void)params;
  status_.loaded_from_storage = false;
  return false;
#else
  Preferences prefs;
  if (!prefs.begin(kPreferenceNamespace, true)) {
    return false;
  }

  std::array<float, 4> low{};
  std::array<float, 4> high{};
  const bool has_low = getFloatArray(prefs, kLowCarrierKey, low);
  const bool has_high = getFloatArray(prefs, kHighCarrierKey, high);
  prefs.end();

  if (!has_low || !has_high) {
    status_.loaded_from_storage = false;
    return false;
  }

  params.resonance.low_carrier_hz = low;
  params.resonance.high_carrier_hz = high;
  params_ = params;
  status_.loaded_from_storage = true;
  return true;
#endif
}

bool RuntimeCalibrator::start(SystemParams& params, uint32_t now_ms) {
  params_ = params;
  if (status_.active || !params.features.enable_runtime_calibration) {
    return false;
  }
  const bool loaded_from_storage = status_.loaded_from_storage;

  saved_low_carrier_hz_ = params.resonance.low_carrier_hz;
  saved_high_carrier_hz_ = params.resonance.high_carrier_hz;
  saved_audio_feature_enable_ = params.features.enable_audio_output;
  saved_audio_runtime_enable_ = params.audio.runtime_enable;
  saved_test_enable_ = params.audio.channel_test_enable;
  saved_test_wall_ = params.audio.channel_test_wall;
  saved_test_level_ = params.audio.channel_test_level;

  status_ = {};
  status_.active = true;
  status_.wall = activeWallAt(params_.audio.output_layout, 0);
  status_.band = CalibrationBand::Low;
  status_.stage = CalibrationStage::Settling;
  status_.candidate_hz = params_.calibration.low_start_hz;
  status_.best_hz = status_.candidate_hz;
  status_.best_score = -1.0f;
  status_.total_steps = totalCandidateSteps();
  status_.finished = false;
  status_.aborted = false;
  status_.loaded_from_storage = loaded_from_storage;

  previous_sample_ = {};
  previous_sample_valid_ = false;
  score_accumulator_ = 0.0f;
  score_samples_ = 0;
  settle_score_accumulator_ = 0.0f;
  settle_score_samples_ = 0;

  params.features.enable_audio_output = true;
  params.audio.runtime_enable = true;
  params.audio.channel_test_enable = false;
  params.audio.channel_test_wall = WallId::None;
  params_ = params;

  beginCandidate(params, now_ms);
  return true;
}

bool RuntimeCalibrator::stop(SystemParams& params, bool keep_results) {
  if (!status_.active && !status_.finished && !status_.aborted) {
    return false;
  }

  if (status_.active && !keep_results) {
    params.resonance.low_carrier_hz = saved_low_carrier_hz_;
    params.resonance.high_carrier_hz = saved_high_carrier_hz_;
  }

  if (keep_results) {
    status_.loaded_from_storage = persistCarriers(params);
  }

  restoreRunState(params);

  status_.active = false;
  status_.stage = keep_results ? CalibrationStage::Complete : CalibrationStage::Aborted;
  status_.finished = keep_results;
  status_.aborted = !keep_results;
  updateProgress();
  params_ = params;
  return true;
}

bool RuntimeCalibrator::update(const ImuSample& sample, uint32_t now_ms, SystemParams& params) {
  if (!status_.active) {
    return false;
  }

  const float sample_score = observeSample(sample);
  if (status_.stage == CalibrationStage::Settling) {
    settle_score_accumulator_ += sample_score;
    settle_score_samples_ += sample.valid ? 1u : 0u;
  }
  if (status_.stage == CalibrationStage::Measuring) {
    score_accumulator_ += sample_score;
    score_samples_ += sample.valid ? 1u : 0u;
    const float settle_avg = settle_score_samples_ > 0
                                 ? settle_score_accumulator_ / static_cast<float>(settle_score_samples_)
                                 : 0.0f;
    const float measure_avg =
        score_samples_ > 0 ? score_accumulator_ / static_cast<float>(score_samples_) : 0.0f;
    status_.candidate_score = measure_avg / std::max(0.0001f, settle_avg + 0.01f * measure_avg);
  }

  const uint32_t elapsed_ms = now_ms - phase_start_ms_;
  if (status_.stage == CalibrationStage::Settling) {
    if (elapsed_ms >= params_.calibration.settle_ms) {
      status_.stage = CalibrationStage::Measuring;
      phase_start_ms_ = now_ms;
      previous_sample_valid_ = false;
      score_accumulator_ = 0.0f;
      score_samples_ = 0;
    }
    return false;
  }

  if (status_.stage != CalibrationStage::Measuring || elapsed_ms < params_.calibration.measure_ms) {
    return false;
  }

  if (status_.candidate_score > status_.best_score) {
    status_.best_score = status_.candidate_score;
    status_.best_hz = status_.candidate_hz;
  }

  return advanceCandidate(params, now_ms);
}

DriveFrame4 RuntimeCalibrator::driveFrame() const {
  if (!status_.active) {
    return {};
  }

  DriveFrame4 frame{};
  const size_t wall_index = wallToIndex(status_.wall);
  if (wall_index >= kWallCount) {
    return frame;
  }

  if (status_.band == CalibrationBand::Low) {
    frame.low[wall_index] = clampf(params_.calibration.drive_level, 0.0f, 1.0f);
  } else if (status_.band == CalibrationBand::High) {
    frame.high[wall_index] = clampf(params_.calibration.drive_level, 0.0f, 1.0f);
  }
  return frame;
}

uint32_t RuntimeCalibrator::totalCandidateSteps() const {
  const uint32_t low_steps =
      countSteps(params_.calibration.low_start_hz, params_.calibration.low_stop_hz, params_.calibration.low_step_hz);
  const uint32_t high_steps = countSteps(
      params_.calibration.high_start_hz, params_.calibration.high_stop_hz, params_.calibration.high_step_hz);
  return static_cast<uint32_t>(activeWallCount(params_.audio.output_layout)) * (low_steps + high_steps);
}

float RuntimeCalibrator::currentRangeStartHz() const {
  return status_.band == CalibrationBand::High ? params_.calibration.high_start_hz : params_.calibration.low_start_hz;
}

float RuntimeCalibrator::currentRangeStopHz() const {
  return status_.band == CalibrationBand::High ? params_.calibration.high_stop_hz : params_.calibration.low_stop_hz;
}

float RuntimeCalibrator::currentRangeStepHz() const {
  return status_.band == CalibrationBand::High ? params_.calibration.high_step_hz : params_.calibration.low_step_hz;
}

void RuntimeCalibrator::beginCandidate(SystemParams& params, uint32_t now_ms) {
  const size_t wall_index = wallToIndex(status_.wall);
  if (wall_index < kWallCount) {
    if (status_.band == CalibrationBand::Low) {
      params.resonance.low_carrier_hz[wall_index] = status_.candidate_hz;
    } else if (status_.band == CalibrationBand::High) {
      params.resonance.high_carrier_hz[wall_index] = status_.candidate_hz;
    }
  }

  params_ = params;
  status_.stage = CalibrationStage::Settling;
  status_.candidate_score = 0.0f;
  phase_start_ms_ = now_ms;
  previous_sample_valid_ = false;
  score_accumulator_ = 0.0f;
  score_samples_ = 0;
  settle_score_accumulator_ = 0.0f;
  settle_score_samples_ = 0;
  updateProgress();
}

bool RuntimeCalibrator::advanceCandidate(SystemParams& params, uint32_t now_ms) {
  ++status_.completed_steps;

  const float next_candidate = status_.candidate_hz + currentRangeStepHz();
  if (next_candidate <= currentRangeStopHz() + 0.001f) {
    status_.candidate_hz = next_candidate;
    beginCandidate(params, now_ms);
    return true;
  }

  const size_t wall_index = wallToIndex(status_.wall);
  if (wall_index < kWallCount) {
    if (status_.band == CalibrationBand::Low) {
      params.resonance.low_carrier_hz[wall_index] = status_.best_hz;
    } else if (status_.band == CalibrationBand::High) {
      params.resonance.high_carrier_hz[wall_index] = status_.best_hz;
    }
  }

  if (status_.band == CalibrationBand::Low) {
    status_.band = CalibrationBand::High;
  } else {
    const WallId next_wall = nextActiveWall(params_.audio.output_layout, status_.wall);
    if (next_wall == WallId::None) {
      stop(params, true);
      return true;
    }
    status_.wall = next_wall;
    status_.band = CalibrationBand::Low;
  }

  status_.candidate_hz = currentRangeStartHz();
  status_.best_hz = status_.candidate_hz;
  status_.best_score = -1.0f;
  beginCandidate(params, now_ms);
  return true;
}

void RuntimeCalibrator::restoreRunState(SystemParams& params) {
  params.features.enable_audio_output = saved_audio_feature_enable_;
  params.audio.runtime_enable = saved_audio_runtime_enable_;
  params.audio.channel_test_enable = saved_test_enable_;
  params.audio.channel_test_wall = saved_test_wall_;
  params.audio.channel_test_level = saved_test_level_;
  if (params.audio.output_layout == AudioOutputLayout::FrontBack2Ch &&
      (params.audio.channel_test_wall == WallId::Top || params.audio.channel_test_wall == WallId::Bottom)) {
    params.audio.channel_test_enable = false;
    params.audio.channel_test_wall = WallId::None;
  }
}

void RuntimeCalibrator::updateProgress() {
  const float total = status_.total_steps > 0 ? static_cast<float>(status_.total_steps) : 1.0f;
  status_.progress = clampf(static_cast<float>(status_.completed_steps) / total, 0.0f, 1.0f);
}

float RuntimeCalibrator::observeSample(const ImuSample& sample) {
  if (!sample.valid) {
    return 0.0f;
  }
  if (!previous_sample_valid_) {
    previous_sample_ = sample;
    previous_sample_valid_ = true;
    return 0.0f;
  }

  const float accel_delta = vecDeltaMagnitude(sample.accel_g, previous_sample_.accel_g);
  const float gyro_delta = vecDeltaMagnitude(sample.gyro_dps, previous_sample_.gyro_dps);
  previous_sample_ = sample;
  return accel_delta * params_.calibration.accel_response_weight +
         gyro_delta * params_.calibration.gyro_response_weight;
}

bool RuntimeCalibrator::persistCarriers(const SystemParams& params) const {
#if HAPTICS_DEBUG_DISABLE_STORAGE
  (void)params;
  return false;
#else
  Preferences prefs;
  if (!prefs.begin(kPreferenceNamespace, false)) {
    return false;
  }

  putFloatArray(prefs, kLowCarrierKey, params.resonance.low_carrier_hz);
  putFloatArray(prefs, kHighCarrierKey, params.resonance.high_carrier_hz);
  prefs.end();
  return true;
#endif
}

}  // namespace haptics
