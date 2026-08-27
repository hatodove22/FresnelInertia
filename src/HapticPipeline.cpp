#include "haptics/HapticPipeline.hpp"

#include <Arduino.h>

#include <algorithm>
#include <cinttypes>
#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <cstring>

namespace haptics {
namespace {

constexpr uint32_t kImuStaleSafeStopMs = 300;

void clearCurrentEventTelemetry(TelemetrySnapshot& telemetry) {
  telemetry.new_evt = 0;
  telemetry.pipeline_debug.event_count = 0;
}

uint64_t addTelemetryCountSaturating(uint64_t total, uint64_t increment) {
  if (total >= kTelemetryJsonSafeIntegerMax ||
      increment >= kTelemetryJsonSafeIntegerMax - total) {
    return kTelemetryJsonSafeIntegerMax;
  }
  return total + increment;
}

bool isCommand(const char* command, const char* expected) {
  return std::strcmp(command, expected) == 0;
}

bool startsWith(const char* command, const char* prefix) {
  return std::strncmp(command, prefix, std::strlen(prefix)) == 0;
}

bool pathMatches(const char* path, const char* expected, const char* alias) {
  return std::strcmp(path, expected) == 0 || std::strcmp(path, alias) == 0;
}

float clampf(float value, float lo, float hi) {
  return std::max(lo, std::min(value, hi));
}

bool isFiniteImuSample(const ImuSample& sample) {
  return sample.valid && std::isfinite(sample.accel_g.x) &&
         std::isfinite(sample.accel_g.y) && std::isfinite(sample.accel_g.z) &&
         std::isfinite(sample.gyro_dps.x) &&
         std::isfinite(sample.gyro_dps.y) && std::isfinite(sample.gyro_dps.z);
}

uint16_t clampU16(float value, uint16_t lo, uint16_t hi) {
  return static_cast<uint16_t>(clampf(value, static_cast<float>(lo), static_cast<float>(hi)));
}

bool isTwoChannelLayout(AudioOutputLayout layout) {
  return layout == AudioOutputLayout::FrontBack2Ch;
}

bool layoutAllowsWall(AudioOutputLayout layout, WallId wall) {
  if (!isTwoChannelLayout(layout)) {
    return wall == WallId::Front || wall == WallId::Back || wall == WallId::Top || wall == WallId::Bottom;
  }
  return wall == WallId::Front || wall == WallId::Back;
}

bool parseAudioOutputLayout(const char* text, AudioOutputLayout& layout) {
  if (text == nullptr) {
    return false;
  }
  if (std::strcmp(text, "front_back_2ch") == 0 || std::strcmp(text, "2ch") == 0 ||
      std::strcmp(text, "front_back") == 0) {
    layout = AudioOutputLayout::FrontBack2Ch;
    return true;
  }
  if (std::strcmp(text, "quad_wall_4ch") == 0 ||
      std::strcmp(text, "4ch") == 0 || std::strcmp(text, "quad_wall") == 0) {
    layout = AudioOutputLayout::QuadWall4Ch;
    return true;
  }
  return false;
}

const char* audioOutputLayoutToString(AudioOutputLayout layout) {
  switch (layout) {
    case AudioOutputLayout::FrontBack2Ch:
      return "front_back_2ch";
    case AudioOutputLayout::QuadWall4Ch:
    default:
      return "quad_wall_4ch";
  }
}

bool parseAudioTransport(const char* text, AudioTransport& transport) {
  if (text == nullptr) {
    return false;
  }
  if (std::strcmp(text, "tdm8") == 0 ||
      std::strcmp(text, "tdm8_slot") == 0 ||
      std::strcmp(text, "tdm") == 0) {
    transport = AudioTransport::Tdm8Slot;
    return true;
  }
  if (std::strcmp(text, "dual_i2s") == 0 ||
      std::strcmp(text, "dual-i2s") == 0) {
    transport = AudioTransport::DualI2s;
    return true;
  }
  return false;
}

const char* audioTransportToString(AudioTransport transport) {
  return transport == AudioTransport::Tdm8Slot ? "tdm8_slot" : "dual_i2s";
}

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

constexpr const char* kButtonPresetCycle[] = {
    "liquid_small_box",
    "granular_coin_box",
    "granular_single_marble_box",
    "hybrid_ice_water",
    "detented_custom",
};
constexpr std::size_t kButtonPresetCycleCount = sizeof(kButtonPresetCycle) / sizeof(kButtonPresetCycle[0]);

const char* runModeToString(RunMode mode) {
  switch (mode) {
    case RunMode::Idle:
      return "idle";
    case RunMode::Live:
      return "live";
    case RunMode::Calibration:
      return "calibration";
    case RunMode::Record:
      return "record";
    case RunMode::Replay:
      return "replay";
    default:
      return "?";
  }
}

WallId parseWallId(const char* text) {
  if (text == nullptr) {
    return WallId::None;
  }
  if (std::strcmp(text, "front") == 0) {
    return WallId::Front;
  }
  if (std::strcmp(text, "back") == 0) {
    return WallId::Back;
  }
  if (std::strcmp(text, "top") == 0) {
    return WallId::Top;
  }
  if (std::strcmp(text, "bottom") == 0) {
    return WallId::Bottom;
  }
  return WallId::None;
}

}  // namespace

bool HapticPipeline::begin(const SystemParams& params) {
  telemetry_ = {};
  params_ = params;
  current_family_ = params.container.family;
  requested_run_mode_ = RunMode::Live;

  preset_store_.begin();
  calibrator_.loadStoredCarriers(params_);
  const bool imu_ready = imu_.begin();
  mass_layer_.configure(params_);
  event_layer_.configure(params_);
  texture_layer_.configure(params_);
  resonance_layer_.configure(params_);
  calibrator_.configure(params_);
  spatial_renderer_.configure(params_);
  const bool audio_ready = audio_.begin(params_);
  tilt_model_.configure(params_);
  tilt_model_.reset();
  const bool tilt_ready = tilt_.begin(params_);
  const bool remote_ready = remote_.begin(params_);
  const bool recorder_ready = recorder_.begin(params_);

  if (!imu_ready || !audio_ready || !tilt_ready) {
    requested_run_mode_ = RunMode::Idle;
    audio_.submitSilence();
    tilt_.setRuntimeEnabled(false);
  }

  last_tick_us_ = micros();
  last_valid_imu_ms_ = millis();
  last_print_ms_ = last_valid_imu_ms_;
  imu_stale_safe_stop_ = false;
  std::strncpy(telemetry_.active_preset, params_.preset_name, sizeof(telemetry_.active_preset) - 1);
  telemetry_.run_mode = currentRunMode();
  telemetry_.audio = audio_.status();
  telemetry_.safety.imu_stale_safe_stop = false;
  telemetry_.safety.audio_zero_asserted = telemetry_.audio.output_silenced;
  telemetry_.safety.tilt_disarmed = !tilt_.isEnabled();
  return imu_ready && audio_ready && tilt_ready && remote_ready && recorder_ready;
}

bool HapticPipeline::reconfigurePipeline() {
  clearCurrentEventTelemetry(telemetry_);
  mass_layer_.configure(params_);
  event_layer_.configure(params_);
  texture_layer_.configure(params_);
  resonance_layer_.configure(params_);
  calibrator_.configure(params_);
  spatial_renderer_.configure(params_);
  const bool audio_ready = audio_.configure(params_);
  tilt_model_.configure(params_);
  tilt_.configure(params_);
  remote_.configure(params_);
  recorder_.configure(params_);
  return audio_ready;
}

void HapticPipeline::refreshOutputConfig() {
  resonance_layer_.configure(params_);
  calibrator_.configure(params_);
  spatial_renderer_.configure(params_);
  audio_.configure(params_);
}

void HapticPipeline::resetDynamicPipelineState() {
  clearCurrentEventTelemetry(telemetry_);
  mass_layer_.configure(params_);
  event_layer_.configure(params_);
  texture_layer_.configure(params_);
  resonance_layer_.configure(params_);
  spatial_renderer_.configure(params_);
  tilt_model_.configure(params_);
  tilt_model_.reset();
}

bool HapticPipeline::applyAudioConfigOrRollback(
    const SystemParams& previous_params) {
  if (audio_.configure(params_)) {
    return true;
  }
  params_ = previous_params;
  if (!audio_.configure(params_)) {
    params_.features.enable_audio_output = false;
    params_.audio.runtime_enable = false;
    params_.audio.channel_test_enable = false;
    params_.audio.channel_test_wall = WallId::None;
    audio_.configure(params_);
    audio_.submitSilence();
  }
  return false;
}

void HapticPipeline::enterSafeIdle() {
  audio_.submitSilence();
  tilt_.setRuntimeEnabled(false);

  if (calibrator_.isActive()) {
    calibrator_.stop(params_, false);
  }
  recorder_.stopRecording();
  recorder_.stopReplay();

  params_.features.enable_runtime_calibration = false;
  params_.features.enable_audio_output = false;
  params_.features.enable_tilt_plane = false;
  params_.audio.runtime_enable = false;
  params_.audio.channel_test_enable = false;
  params_.audio.channel_test_wall = WallId::None;
  requested_run_mode_ = RunMode::Idle;

  resetDynamicPipelineState();
  audio_.configure(params_);
  tilt_.configure(params_);

  telemetry_.run_mode = RunMode::Idle;
  clearCurrentEventTelemetry(telemetry_);
  telemetry_.mass = makeDefaultMassState();
  telemetry_.last_event = {};
  telemetry_.actuators = {};
  telemetry_.tilt = {};
  telemetry_.audio = audio_.status();
  telemetry_.safety.imu_stale_safe_stop = imu_stale_safe_stop_;
  telemetry_.safety.audio_zero_asserted = telemetry_.audio.output_silenced;
  telemetry_.safety.tilt_disarmed = !tilt_.isEnabled();
  telemetry_.calibration = calibrator_.status();
  telemetry_.recorder = recorder_.status();
  telemetry_.pipeline_debug = {};
}

HapticPipeline::RuntimeConfigSnapshot HapticPipeline::captureRuntimeConfig() const {
  RuntimeConfigSnapshot snapshot{};
  snapshot.features = params_.features;
  snapshot.pins = params_.pins;
  snapshot.audio = params_.audio;
  snapshot.tilt = params_.tilt;
  snapshot.iface = params_.iface;
  snapshot.recorder = params_.recorder;
  snapshot.low_carrier_hz = params_.resonance.low_carrier_hz;
  snapshot.high_carrier_hz = params_.resonance.high_carrier_hz;
  return snapshot;
}

void HapticPipeline::restoreRuntimeConfig(SystemParams& params, const RuntimeConfigSnapshot& snapshot) const {
  params.features = snapshot.features;
  params.pins = snapshot.pins;
  params.audio = snapshot.audio;
  params.tilt = snapshot.tilt;
  params.iface = snapshot.iface;
  params.recorder = snapshot.recorder;
  params.resonance.low_carrier_hz = snapshot.low_carrier_hz;
  params.resonance.high_carrier_hz = snapshot.high_carrier_hz;
}

void HapticPipeline::commitPresetParams(SystemParams next_params, const RuntimeConfigSnapshot& snapshot) {
  restoreRuntimeConfig(next_params, snapshot);
  params_ = next_params;
  current_family_ = params_.container.family;
  reconfigurePipeline();
  tilt_model_.reset();
}

bool HapticPipeline::loadPresetByName(const char* preset_name) {
  if (preset_name == nullptr || preset_name[0] == '\0') {
    return false;
  }

  const auto runtime_config = captureRuntimeConfig();

  SystemParams next_params{};
  if (!preset_store_.loadPreset(preset_name, next_params)) {
    return false;
  }

  commitPresetParams(next_params, runtime_config);
  return true;
}

void HapticPipeline::applyPreset(MaterialFamily family) {
  const auto runtime_config = captureRuntimeConfig();
  SystemParams next_params{};

  switch (family) {
    case MaterialFamily::Liquid:
      next_params = makeDefaultLiquidPreset();
      break;
    case MaterialFamily::Granular:
      next_params = makeDefaultGranularPreset();
      break;
    case MaterialFamily::Hybrid:
      next_params = makeDefaultHybridPreset();
      break;
    case MaterialFamily::Detented:
      next_params = makeDefaultDetentedPreset();
      break;
    case MaterialFamily::Custom:
    default:
      return;
  }

  commitPresetParams(next_params, runtime_config);
}

void HapticPipeline::cyclePreset() {
  if (calibrator_.isActive()) {
    return;
  }

  std::size_t next_index = 0;
  for (std::size_t i = 0; i < kButtonPresetCycleCount; ++i) {
    if (std::strcmp(params_.preset_name, kButtonPresetCycle[i]) == 0) {
      next_index = (i + 1) % kButtonPresetCycleCount;
      break;
    }
  }

  if (loadPresetByName(kButtonPresetCycle[next_index])) {
    return;
  }

  applyPreset(MaterialFamily::Liquid);
}

void HapticPipeline::toggleVerbose() {
  params_.features.enable_verbose_serial = !params_.features.enable_verbose_serial;
}

void HapticPipeline::cycleAudioTestMode() {
  if (calibrator_.isActive()) {
    return;
  }
  const SystemParams previous_params = params_;

  if (isTwoChannelLayout(params_.audio.output_layout)) {
    switch (params_.audio.channel_test_wall) {
      case WallId::None:
        params_.audio.channel_test_wall = WallId::Front;
        params_.audio.channel_test_enable = true;
        break;
      case WallId::Front:
        params_.audio.channel_test_wall = WallId::Back;
        params_.audio.channel_test_enable = true;
        break;
      case WallId::Back:
      default:
        params_.audio.channel_test_wall = WallId::None;
        params_.audio.channel_test_enable = false;
        break;
    }
  } else {
    switch (params_.audio.channel_test_wall) {
      case WallId::None:
        params_.audio.channel_test_wall = WallId::Front;
        params_.audio.channel_test_enable = true;
        break;
      case WallId::Front:
        params_.audio.channel_test_wall = WallId::Back;
        params_.audio.channel_test_enable = true;
        break;
      case WallId::Back:
        params_.audio.channel_test_wall = WallId::Top;
        params_.audio.channel_test_enable = true;
        break;
      case WallId::Top:
        params_.audio.channel_test_wall = WallId::Bottom;
        params_.audio.channel_test_enable = true;
        break;
      case WallId::Bottom:
      default:
        params_.audio.channel_test_wall = WallId::None;
        params_.audio.channel_test_enable = false;
        break;
    }
  }
  applyAudioConfigOrRollback(previous_params);
}

void HapticPipeline::toggleAudioRuntimeEnable() {
  if (calibrator_.isActive()) {
    return;
  }
  const SystemParams previous_params = params_;
  const bool next_state = !(params_.features.enable_audio_output && params_.audio.runtime_enable);
  if (next_state && !audio_.isCompileEnabled()) {
    return;
  }
  params_.features.enable_audio_output = next_state;
  params_.audio.runtime_enable = next_state;
  if (!next_state) {
    params_.audio.channel_test_enable = false;
    params_.audio.channel_test_wall = WallId::None;
  }
  applyAudioConfigOrRollback(previous_params);
}

bool HapticPipeline::startRuntimeCalibration() {
  if (calibrator_.isActive() || !audio_.isCompileEnabled()) {
    return false;
  }

  params_.features.enable_runtime_calibration = true;
  const bool started = calibrator_.start(params_, millis());
  if (started) {
    requested_run_mode_ = RunMode::Calibration;
    refreshOutputConfig();
    Serial.println("calibration: started");
  }
  return started;
}

void HapticPipeline::stopRuntimeCalibration(bool keep_results) {
  if (!calibrator_.status().active && !calibrator_.status().finished && !calibrator_.status().aborted) {
    return;
  }

  calibrator_.stop(params_, keep_results);
  params_.features.enable_runtime_calibration = false;
  requested_run_mode_ = RunMode::Live;
  refreshOutputConfig();
  Serial.println(keep_results ? "calibration: complete" : "calibration: stopped");
}

MassState HapticPipeline::makeDefaultMassState() const {
  MassState state{};
  state.fill = params_.container.fill;
  state.headspace = params_.container.headspace;
  state.container_x_m = params_.container.span_x_m;
  state.container_y_m = params_.container.span_y_m;
  state.container_z_m = params_.container.span_z_m;
  state.family = params_.container.family;
  return state;
}

ActuatorFrame4 HapticPipeline::summarizeDriveFrame(const DriveFrame4& frame) const {
  ActuatorFrame4 summary{};
  for (int i = 0; i < 4; ++i) {
    summary.ch[i] = std::min(
        1.0f,
        params_.resonance.master_gain *
            (0.45f * frame.low[i] + 0.75f * frame.high[i] + 0.20f * frame.noise[i]));
  }
  return summary;
}

TiltPlaneCommand HapticPipeline::updateTiltCommand(const ImuSample& sample, const MassState& state, float dt_s) {
  return tilt_model_.update(sample, state, dt_s);
}

RunMode HapticPipeline::currentRunMode() const {
  if (calibrator_.isActive()) {
    return RunMode::Calibration;
  }
  if (recorder_.status().replaying) {
    return RunMode::Replay;
  }
  if (recorder_.status().recording) {
    return RunMode::Record;
  }
  return requested_run_mode_;
}

bool HapticPipeline::applyParamPath(const char* path, const ControlValue& value) {
  if (path == nullptr || path[0] == '\0') {
    return false;
  }

  const SystemParams previous_params = params_;

  if (std::strcmp(path, "container.fill") == 0 && value.has_number) {
    params_.container.fill = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "container.headspace") == 0 && value.has_number) {
    params_.container.headspace = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "container.viscosity") == 0 && value.has_number) {
    params_.container.viscosity = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "container.particle_count") == 0 && value.has_number) {
    params_.container.particle_count = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "container.particle_hardness") == 0 && value.has_number) {
    params_.container.particle_hardness = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "container.span_x_m") == 0 && value.has_number) {
    params_.container.span_x_m = clampf(value.number, 0.020f, 0.300f);
  } else if (std::strcmp(path, "container.span_y_m") == 0 && value.has_number) {
    params_.container.span_y_m = clampf(value.number, 0.020f, 0.300f);
  } else if (std::strcmp(path, "container.span_z_m") == 0 && value.has_number) {
    params_.container.span_z_m = clampf(value.number, 0.020f, 0.300f);
  } else if (std::strcmp(path, "container.shell_mass_kg") == 0 && value.has_number) {
    params_.container.shell_mass_kg = std::max(0.0f, value.number);
  } else if (std::strcmp(path, "container.content_mass_full_kg") == 0 && value.has_number) {
    params_.container.content_mass_full_kg = std::max(0.0f, value.number);
  } else if (std::strcmp(path, "container.shell_cg_x_m") == 0 && value.has_number) {
    params_.container.shell_cg_x_m = value.number;
  } else if (std::strcmp(path, "container.shell_cg_y_m") == 0 && value.has_number) {
    params_.container.shell_cg_y_m = value.number;
  } else if (std::strcmp(path, "container.enable_roof_contact") == 0 && value.has_bool) {
    params_.container.enable_roof_contact = value.boolean;
  } else if (pathMatches(path, "mass.natural_freq_x_hz", "mass.natural_freq_x") && value.has_number) {
    params_.mass.natural_freq_x_hz = clampf(value.number, 0.10f, 20.0f);
  } else if (pathMatches(path, "mass.natural_freq_y_hz", "mass.natural_freq_y") && value.has_number) {
    params_.mass.natural_freq_y_hz = clampf(value.number, 0.10f, 20.0f);
  } else if (std::strcmp(path, "mass.damping_ratio_x") == 0 && value.has_number) {
    params_.mass.damping_ratio_x = clampf(value.number, 0.0f, 2.0f);
  } else if (std::strcmp(path, "mass.damping_ratio_y") == 0 && value.has_number) {
    params_.mass.damping_ratio_y = clampf(value.number, 0.0f, 2.0f);
  } else if (std::strcmp(path, "mass.energy_decay_s") == 0 && value.has_number) {
    params_.mass.energy_decay_s = clampf(value.number, 0.001f, 10.0f);
  } else if (std::strcmp(path, "mass.accel_to_energy_gain") == 0 && value.has_number) {
    params_.mass.accel_to_energy_gain = clampf(value.number, 0.0f, 10.0f);
  } else if (std::strcmp(path, "mass.gyro_to_energy_gain") == 0 && value.has_number) {
    params_.mass.gyro_to_energy_gain = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "mass.rebound") == 0 && value.has_number) {
    params_.mass.rebound = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "event.roll_rate_hz") == 0 && value.has_number) {
    params_.event.roll_rate_hz = clampf(value.number, 0.0f, 200.0f);
  } else if (std::strcmp(path, "event.impact_rate_hz") == 0 && value.has_number) {
    params_.event.impact_rate_hz = clampf(value.number, 0.0f, 300.0f);
  } else if (std::strcmp(path, "event.droplet_rate_hz") == 0 && value.has_number) {
    params_.event.droplet_rate_hz = clampf(value.number, 0.0f, 300.0f);
  } else if (std::strcmp(path, "event.scrape_threshold") == 0 && value.has_number) {
    params_.event.scrape_threshold = clampf(value.number, 0.0f, 2.0f);
  } else if (std::strcmp(path, "event.roof_slap_threshold") == 0 && value.has_number) {
    params_.event.roof_slap_threshold = clampf(value.number, 0.0f, 2.0f);
  } else if (pathMatches(path, "texture.hard_ping_low_ms", "texture.hard_ping_low") && value.has_number) {
    params_.texture.hard_ping_low_ms = clampf(value.number, 1.0f, 250.0f);
  } else if (pathMatches(path, "texture.hard_ping_high_ms", "texture.hard_ping_high") && value.has_number) {
    params_.texture.hard_ping_high_ms = clampf(value.number, 1.0f, 250.0f);
  } else if (pathMatches(path, "texture.wet_burst_ms", "texture.wet_burst") && value.has_number) {
    params_.texture.wet_burst_ms = clampf(value.number, 1.0f, 250.0f);
  } else if (pathMatches(path, "texture.dry_rattle_ms", "texture.dry_rattle") && value.has_number) {
    params_.texture.dry_rattle_ms = clampf(value.number, 1.0f, 250.0f);
  } else if (pathMatches(path, "texture.scrape_noise_ms", "texture.scrape_noise") && value.has_number) {
    params_.texture.scrape_noise_ms = clampf(value.number, 1.0f, 250.0f);
  } else if (pathMatches(path, "texture.flow_ripple_soa_ms", "texture.flow_ripple_soa") && value.has_number) {
    params_.texture.flow_ripple_soa_ms = clampf(value.number, 0.0f, 250.0f);
  } else if (std::strcmp(path, "texture.default_high_bias") == 0 && value.has_number) {
    params_.texture.default_high_bias = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "spatial.neighbor_bleed") == 0 && value.has_number) {
    params_.spatial.neighbor_bleed = value.number;
  } else if (std::strcmp(path, "spatial.opposite_bleed") == 0 && value.has_number) {
    params_.spatial.opposite_bleed = value.number;
  } else if (std::strcmp(path, "resonance.master_gain") == 0 && value.has_number) {
    params_.resonance.master_gain = clampf(value.number, 0.0f, 4.0f);
  } else if (std::strcmp(path, "audio.runtime_enable") == 0 && value.has_bool) {
    if (value.boolean && !audio_.isCompileEnabled()) {
      return false;
    }
    params_.audio.runtime_enable = value.boolean;
    params_.features.enable_audio_output = value.boolean;
  } else if (std::strcmp(path, "audio.output_gain") == 0 && value.has_number) {
    params_.audio.output_gain = clampf(value.number, 0.0f, 4.0f);
  } else if (std::strcmp(path, "audio.output_peak_limit") == 0 && value.has_number) {
    params_.audio.output_peak_limit = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "audio.transport") == 0 && value.has_text) {
    if (params_.audio.runtime_enable) {
      return false;
    }
    AudioTransport transport = params_.audio.transport;
    if (!parseAudioTransport(value.text, transport) ||
        !audio_.supportsTransport(transport)) {
      return false;
    }
    params_.audio.transport = transport;
  } else if (std::strcmp(path, "audio.demo_compat_mode") == 0 && value.has_bool) {
    if (params_.audio.runtime_enable ||
        (value.boolean && params_.audio.transport == AudioTransport::Tdm8Slot)) {
      return false;
    }
    params_.audio.demo_compat_mode = value.boolean;
    if (params_.audio.demo_compat_mode) {
      params_.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
    }
    if (!layoutAllowsWall(params_.audio.output_layout, params_.audio.channel_test_wall)) {
      params_.audio.channel_test_wall = WallId::None;
      params_.audio.channel_test_enable = false;
    }
  } else if (std::strcmp(path, "audio.output_layout") == 0 && (value.has_text || value.has_number)) {
    if (params_.audio.runtime_enable) {
      return false;
    }
    if (value.has_text) {
      AudioOutputLayout layout = params_.audio.output_layout;
      if (!parseAudioOutputLayout(value.text, layout)) {
        return false;
      }
      params_.audio.output_layout = layout;
    } else {
      params_.audio.output_layout =
          value.number <= 2.5f ? AudioOutputLayout::FrontBack2Ch
                               : AudioOutputLayout::QuadWall4Ch;
    }
    if (!layoutAllowsWall(params_.audio.output_layout, params_.audio.channel_test_wall)) {
      params_.audio.channel_test_wall = WallId::None;
      params_.audio.channel_test_enable = false;
    }
  } else if (std::strcmp(path, "features.enable_verbose_serial") == 0 && value.has_bool) {
    params_.features.enable_verbose_serial = value.boolean;
  } else if (std::strcmp(path, "features.enable_debug_display") == 0 && value.has_bool) {
    params_.features.enable_debug_display = value.boolean;
  } else if (std::strcmp(path, "features.enable_remote_interface") == 0 && value.has_bool) {
    params_.features.enable_remote_interface = value.boolean;
  } else if (std::strcmp(path, "features.enable_recorder") == 0 && value.has_bool) {
    params_.features.enable_recorder = value.boolean;
  } else if (std::strcmp(path, "features.enable_tilt_plane") == 0 && value.has_bool) {
    // Generic set_param traffic may always disarm, but must never arm a
    // physical actuator. Arming requires the explicit local tilt command or
    // the separately gated SetTiltMode control message.
    if (value.boolean) {
      return false;
    }
    params_.features.enable_tilt_plane = false;
    tilt_.setRuntimeEnabled(false);
  } else if (std::strcmp(path, "features.enable_pipeline_debug_telemetry") == 0 && value.has_bool) {
    params_.features.enable_pipeline_debug_telemetry = value.boolean;
  } else if (std::strcmp(path, "features.enable_physical_master_gain") == 0 && value.has_bool) {
    params_.features.enable_physical_master_gain = value.boolean;
  } else if (std::strcmp(path, "features.enable_attack_preserving_texture") == 0 && value.has_bool) {
    params_.features.enable_attack_preserving_texture = value.boolean;
  } else if (std::strcmp(path, "features.enable_single_shot_spatial_delay") == 0 && value.has_bool) {
    params_.features.enable_single_shot_spatial_delay = value.boolean;
  } else if (std::strcmp(path, "features.enable_imu_stale_safe_stop") == 0 && value.has_bool) {
    params_.features.enable_imu_stale_safe_stop = value.boolean;
    if (!value.boolean) {
      imu_stale_safe_stop_ = false;
    }
  } else if (pathMatches(path, "calibration.low_start_hz", "calibration.low_start") && value.has_number) {
    params_.calibration.low_start_hz = clampf(value.number, 20.0f, 1000.0f);
  } else if (pathMatches(path, "calibration.low_stop_hz", "calibration.low_stop") && value.has_number) {
    params_.calibration.low_stop_hz = clampf(value.number, 20.0f, 1000.0f);
  } else if (pathMatches(path, "calibration.low_step_hz", "calibration.low_step") && value.has_number) {
    params_.calibration.low_step_hz = clampf(value.number, 1.0f, 500.0f);
  } else if (pathMatches(path, "calibration.high_start_hz", "calibration.high_start") && value.has_number) {
    params_.calibration.high_start_hz = clampf(value.number, 20.0f, 1000.0f);
  } else if (pathMatches(path, "calibration.high_stop_hz", "calibration.high_stop") && value.has_number) {
    params_.calibration.high_stop_hz = clampf(value.number, 20.0f, 1000.0f);
  } else if (pathMatches(path, "calibration.high_step_hz", "calibration.high_step") && value.has_number) {
    params_.calibration.high_step_hz = clampf(value.number, 1.0f, 500.0f);
  } else if (std::strcmp(path, "calibration.settle_ms") == 0 && value.has_number) {
    params_.calibration.settle_ms = clampU16(value.number, 10, 5000);
  } else if (std::strcmp(path, "calibration.measure_ms") == 0 && value.has_number) {
    params_.calibration.measure_ms = clampU16(value.number, 10, 5000);
  } else if (std::strcmp(path, "calibration.drive_level") == 0 && value.has_number) {
    params_.calibration.drive_level = clampf(value.number, 0.0f, 1.0f);
  } else if (std::strcmp(path, "iface.telemetry_period_ms") == 0 && value.has_number) {
    params_.iface.telemetry_period_ms = clampU16(value.number, 10, 5000);
  } else if (std::strcmp(path, "recorder.flush_interval_frames") == 0 && value.has_number) {
    params_.recorder.flush_interval_frames = clampU16(value.number, 1, 1024);
  } else if (std::strcmp(path, "tilt.max_tilt_deg") == 0 && value.has_number) {
    params_.tilt.max_tilt_deg = value.number;
  } else if (std::strcmp(path, "tilt.enable_pseudoforce") == 0 && value.has_bool) {
    params_.tilt.enable_pseudoforce = value.boolean;
  } else if (std::strcmp(path, "tilt.w_eff_m") == 0 && value.has_number) {
    params_.tilt.w_eff_m = value.number;
  } else if (std::strcmp(path, "tilt.Ft_nom_thumb_N") == 0 && value.has_number) {
    params_.tilt.Ft_nom_thumb_N = value.number;
  } else if (std::strcmp(path, "tilt.Ft_nom_index_N") == 0 && value.has_number) {
    params_.tilt.Ft_nom_index_N = value.number;
  } else if (std::strcmp(path, "tilt.k_cm") == 0 && value.has_number) {
    params_.tilt.k_cm = value.number;
  } else if (std::strcmp(path, "tilt.k_tau") == 0 && value.has_number) {
    params_.tilt.k_tau = value.number;
  } else if (std::strcmp(path, "tilt.k_phi") == 0 && value.has_number) {
    params_.tilt.k_phi = value.number;
  } else if (std::strcmp(path, "tilt.sign_thumb") == 0 && value.has_number) {
    params_.tilt.sign_thumb = value.number;
  } else if (std::strcmp(path, "tilt.sign_index") == 0 && value.has_number) {
    params_.tilt.sign_index = value.number;
  } else if (std::strcmp(path, "tilt.max_delta_cm_deg") == 0 && value.has_number) {
    params_.tilt.max_delta_cm_deg = value.number;
  } else if (std::strcmp(path, "tilt.max_delta_df_deg") == 0 && value.has_number) {
    params_.tilt.max_delta_df_deg = value.number;
  } else if (std::strcmp(path, "tilt.max_delta_total_deg") == 0 && value.has_number) {
    params_.tilt.max_delta_total_deg = value.number;
  } else if (std::strcmp(path, "tilt.max_total_cmd_deg") == 0 && value.has_number) {
    params_.tilt.max_total_cmd_deg = value.number;
  } else if (std::strcmp(path, "tilt.content_cg_span_fraction") == 0 && value.has_number) {
    params_.tilt.content_cg_span_fraction = value.number;
  } else if (std::strcmp(path, "tilt.g_qs_cutoff_hz") == 0 && value.has_number) {
    params_.tilt.g_qs_cutoff_hz = value.number;
  } else if (std::strcmp(path, "tilt.a_dyn_cutoff_hz") == 0 && value.has_number) {
    params_.tilt.a_dyn_cutoff_hz = value.number;
  } else if (std::strcmp(path, "tilt.content_cg_cutoff_hz") == 0 && value.has_number) {
    params_.tilt.content_cg_cutoff_hz = value.number;
  } else if (std::strcmp(path, "tilt.command_cutoff_hz") == 0 && value.has_number) {
    params_.tilt.command_cutoff_hz = value.number;
  } else if (std::strcmp(path, "tilt.command_deadband_deg") == 0 && value.has_number) {
    params_.tilt.command_deadband_deg = value.number;
  } else if (std::strcmp(path, "tilt.pseudoforce_slew_deg_s") == 0 && value.has_number) {
    params_.tilt.pseudoforce_slew_deg_s = value.number;
  } else if (std::strcmp(path, "tilt.max_current_ma") == 0 && value.has_number) {
    params_.tilt.max_current_ma = value.number;
  } else if (std::strcmp(path, "tilt.min_angle_deg") == 0 && value.has_number) {
    params_.tilt.min_angle_deg = value.number;
  } else if (std::strcmp(path, "tilt.max_angle_deg") == 0 && value.has_number) {
    params_.tilt.max_angle_deg = value.number;
  } else if (std::strcmp(path, "tilt.max_velocity_deg_s") == 0 && value.has_number) {
    params_.tilt.max_velocity_deg_s = value.number;
  } else {
    return false;
  }

  if (!reconfigurePipeline()) {
    params_ = previous_params;
    if (!reconfigurePipeline()) {
      params_.features.enable_audio_output = false;
      params_.audio.runtime_enable = false;
      params_.audio.channel_test_enable = false;
      params_.audio.channel_test_wall = WallId::None;
      reconfigurePipeline();
      audio_.submitSilence();
    }
    return false;
  }
  return true;
}

bool HapticPipeline::applyControlMessage(const ControlMessage& message) {
  if (!message.valid) {
    return false;
  }

  switch (message.type) {
    case ControlMessageType::SetParam:
      return applyParamPath(message.path, message.value);
    case ControlMessageType::LoadPreset:
      return loadPresetByName(message.preset);
    case ControlMessageType::SetRunMode:
      switch (message.run_mode) {
        case RunMode::Idle:
          enterSafeIdle();
          return true;
        case RunMode::Live:
          requested_run_mode_ = RunMode::Live;
          recorder_.stopReplay();
          clearCurrentEventTelemetry(telemetry_);
          return true;
        case RunMode::Calibration:
          return startRuntimeCalibration();
        case RunMode::Record:
          params_.features.enable_recorder = true;
          recorder_.configure(params_);
          if (recorder_.startRecording(millis(), message.argument[0] != '\0' ? message.argument : nullptr)) {
            requested_run_mode_ = RunMode::Record;
            clearCurrentEventTelemetry(telemetry_);
            return true;
          }
          return false;
        case RunMode::Replay:
          params_.features.enable_recorder = true;
          recorder_.configure(params_);
          if (recorder_.startReplay(message.argument, millis())) {
            requested_run_mode_ = RunMode::Replay;
            clearCurrentEventTelemetry(telemetry_);
            return true;
          }
          return false;
      }
      return false;
    case ControlMessageType::StartCalibration:
      return startRuntimeCalibration();
    case ControlMessageType::StopCalibration:
      stopRuntimeCalibration(false);
      return true;
    case ControlMessageType::RequestTelemetry:
      remote_.publishTelemetry(telemetry_);
      return true;
    case ControlMessageType::SetTiltMode:
      if (message.tilt_enable &&
          (!tilt_.isCompileEnabled() ||
           !params_.features.allow_remote_tilt_arm ||
           (currentRunMode() != RunMode::Live &&
            currentRunMode() != RunMode::Record))) {
        return false;
      }
      params_.features.enable_tilt_plane = message.tilt_enable;
      tilt_.configure(params_);
      tilt_.setRuntimeEnabled(message.tilt_enable);
      if (message.tilt_enable) {
        tilt_.home();
      }
      return true;
    case ControlMessageType::RecordStart:
      params_.features.enable_recorder = true;
      recorder_.configure(params_);
      if (recorder_.startRecording(millis(), message.argument[0] != '\0' ? message.argument : nullptr)) {
        requested_run_mode_ = RunMode::Record;
        clearCurrentEventTelemetry(telemetry_);
        return true;
      }
      return false;
    case ControlMessageType::RecordStop:
      recorder_.stopRecording();
      requested_run_mode_ = RunMode::Live;
      clearCurrentEventTelemetry(telemetry_);
      return true;
    case ControlMessageType::ReplayStart:
      params_.features.enable_recorder = true;
      recorder_.configure(params_);
      if (recorder_.startReplay(message.argument, millis())) {
        requested_run_mode_ = RunMode::Replay;
        clearCurrentEventTelemetry(telemetry_);
        return true;
      }
      return false;
    case ControlMessageType::ReplayStop:
      recorder_.stopReplay();
      requested_run_mode_ = RunMode::Live;
      clearCurrentEventTelemetry(telemetry_);
      return true;
    case ControlMessageType::None:
    default:
      return false;
  }
}

void HapticPipeline::processSample(const ImuSample& sample, float dt_s) {
  if (dt_s <= 0.0f) {
    return;
  }
  const float nominal_dt_s = 1.0f / std::max(1.0f, params_.mass.control_rate_hz);
  if (dt_s > 0.050f) {
    dt_s = nominal_dt_s;
  }

  ImuSample checked_sample = sample;
  if (!isFiniteImuSample(sample)) {
    checked_sample = {};
    checked_sample.timestamp_us = sample.timestamp_us;
  }
  const uint32_t now_ms = millis();
  if (checked_sample.valid) {
    last_valid_imu_ms_ = now_ms;
  }
  const bool next_imu_stale_safe_stop =
      params_.features.enable_imu_stale_safe_stop &&
      now_ms - last_valid_imu_ms_ > kImuStaleSafeStopMs;
  bool calibration_params_changed = false;
  if (next_imu_stale_safe_stop && !imu_stale_safe_stop_) {
    if (calibrator_.isActive()) {
      calibration_params_changed = calibrator_.stop(params_, false);
      params_.features.enable_runtime_calibration = false;
      requested_run_mode_ = RunMode::Live;
    }
    resetDynamicPipelineState();
  }
  imu_stale_safe_stop_ = next_imu_stale_safe_stop;

  if (!imu_stale_safe_stop_) {
    calibration_params_changed =
        calibrator_.update(checked_sample, now_ms, params_) ||
        calibration_params_changed;
  }
  if (calibration_params_changed) {
    if (!calibrator_.isActive()) {
      params_.features.enable_runtime_calibration = false;
      requested_run_mode_ = RunMode::Live;
    }
    refreshOutputConfig();
  }

  const RunMode run_mode = currentRunMode();
  const bool idle_mode = run_mode == RunMode::Idle;
  const bool safe_output_stop = idle_mode || imu_stale_safe_stop_;
  const bool tilt_mode_allowed =
      (run_mode == RunMode::Live || run_mode == RunMode::Record) &&
      !imu_stale_safe_stop_ &&
      params_.features.enable_tilt_plane;
  const bool mass_enabled = !safe_output_stop && params_.features.enable_mass_layer;
  const bool event_enabled = !safe_output_stop && params_.features.enable_event_layer;
  const bool texture_enabled = !safe_output_stop && params_.features.enable_texture_layer;
  const bool resonance_enabled = !safe_output_stop && params_.features.enable_resonance_layer;
  const bool spatial_enabled = !safe_output_stop && params_.features.enable_spatial_renderer;
  const MassState mass = mass_enabled ? mass_layer_.update(checked_sample, dt_s) : makeDefaultMassState();
  const auto events =
      event_enabled ? event_layer_.update(mass, dt_s) : EventFrame<kMaxEventsPerFrame>{};
  const auto textures =
      texture_enabled ? texture_layer_.update(events, dt_s) : TextureFrame<kMaxTexturesPerFrame>{};
  const auto resonances =
      resonance_enabled ? resonance_layer_.update(textures) : ResonanceFrame<kMaxResonanceVoicesPerFrame>{};
  const auto spatial = spatial_enabled ? spatial_renderer_.update(resonances, dt_s) : SpatialFrame4{};
  const auto tilt_cmd =
      tilt_mode_allowed ? updateTiltCommand(checked_sample, mass, dt_s) : TiltPlaneCommand{};
  const HapticEvent last_event = event_enabled ? event_layer_.lastEvent() : HapticEvent{};

  DriveFrame4 audio_drive = spatial.drive;
  ActuatorFrame4 actuator_summary = spatial.summary;
  if (calibrator_.isActive()) {
    audio_drive = calibrator_.driveFrame();
    actuator_summary = summarizeDriveFrame(audio_drive);
  }

  if (safe_output_stop) {
    audio_.submitSilence();
  } else {
    audio_.submit(audio_drive);
  }
  if (tilt_mode_allowed && tilt_.isEnabled()) {
    tilt_.submit(tilt_cmd);
  } else if (tilt_.isEnabled()) {
    tilt_.setRuntimeEnabled(false);
  }

  telemetry_.timestamp_ms = millis();
  telemetry_.frame_counter = addTelemetryCountSaturating(telemetry_.frame_counter, 1);
  telemetry_.new_evt = static_cast<uint16_t>(events.count);
  telemetry_.evt_total = addTelemetryCountSaturating(telemetry_.evt_total, telemetry_.new_evt);
  std::strncpy(telemetry_.active_preset, params_.preset_name, sizeof(telemetry_.active_preset) - 1);
  telemetry_.run_mode = run_mode;
  telemetry_.imu = checked_sample;
  telemetry_.mass = mass;
  telemetry_.last_event = last_event;
  telemetry_.actuators = actuator_summary;
  telemetry_.tilt = tilt_cmd;
  telemetry_.audio = audio_.status();
  telemetry_.safety.imu_stale_safe_stop = imu_stale_safe_stop_;
  telemetry_.safety.audio_zero_asserted = telemetry_.audio.output_silenced;
  telemetry_.safety.tilt_disarmed = !tilt_.isEnabled();
  telemetry_.calibration = calibrator_.status();
  telemetry_.recorder = recorder_.status();
  telemetry_.remote = remote_.status();
  telemetry_.pipeline_debug.event_count = telemetry_.new_evt;
  telemetry_.pipeline_debug.texture_count = static_cast<uint16_t>(textures.count);
  telemetry_.pipeline_debug.resonance_count = static_cast<uint16_t>(resonances.count);
  telemetry_.pipeline_debug.mass_enabled = mass_enabled;
  telemetry_.pipeline_debug.event_enabled = event_enabled;
  telemetry_.pipeline_debug.texture_enabled = texture_enabled;
  telemetry_.pipeline_debug.resonance_enabled = resonance_enabled;
  telemetry_.pipeline_debug.spatial_enabled = spatial_enabled;
  telemetry_.pipeline_debug.imu_stale_safe_stop = imu_stale_safe_stop_;

  recorder_.append(telemetry_);
  remote_.publishTelemetry(telemetry_);

  if (telemetry_.calibration.active && calibration_params_changed) {
    Serial.printf(
        "calibration: wall=%u band=%u candidate=%.1fHz best=%.1fHz score=%.5f progress=%.2f\n",
        static_cast<unsigned>(telemetry_.calibration.wall),
        static_cast<unsigned>(telemetry_.calibration.band),
        telemetry_.calibration.candidate_hz,
        telemetry_.calibration.best_hz,
        telemetry_.calibration.best_score,
        telemetry_.calibration.progress);
  }
  if (!telemetry_.calibration.active && telemetry_.calibration.finished && calibration_params_changed) {
    Serial.println("calibration: carriers stored");
  }

  if (params_.features.enable_verbose_serial && millis() - last_print_ms_ > 250) {
    last_print_ms_ = millis();
    Serial.printf(
        "preset=%s mode=%u frame=%" PRIu64 " new_evt=%u evt_total=%" PRIu64 " energy=%.3f pos=(%.2f,%.2f) vel=(%.2f,%.2f) evt=%u ch=[%.2f %.2f %.2f %.2f] rec=%u replay=%u remote=%u\n",
        params_.preset_name,
        static_cast<unsigned>(telemetry_.run_mode),
        telemetry_.frame_counter,
        static_cast<unsigned>(telemetry_.new_evt),
        telemetry_.evt_total,
        mass.energy,
        mass.pos_norm.x,
        mass.pos_norm.y,
        mass.vel_norm_s.x,
        mass.vel_norm_s.y,
        static_cast<unsigned>(telemetry_.last_event.type),
        actuator_summary.ch[0], actuator_summary.ch[1], actuator_summary.ch[2], actuator_summary.ch[3],
        static_cast<unsigned>(telemetry_.recorder.recording),
        static_cast<unsigned>(telemetry_.recorder.replaying),
        static_cast<unsigned>(telemetry_.remote.runtime_enabled));
  }
}

void HapticPipeline::tick() {
  ControlMessage message{};
  remote_.update();
  while (remote_.popMessage(message)) {
    applyControlMessage(message);
  }

  const uint32_t now_us = micros();
  const float dt_s = (now_us - last_tick_us_) * 1.0e-6f;
  last_tick_us_ = now_us;

  if (recorder_.status().replaying) {
    ImuSample replay_sample{};
    float replay_dt_s = dt_s;
    if (recorder_.pollReplay(millis(), replay_sample, replay_dt_s)) {
      processSample(replay_sample, replay_dt_s);
    }
    return;
  }

  const ImuSample imu = imu_.poll();
  processSample(imu, dt_s);
}

void HapticPipeline::handleConsoleCommand(const char* command) {
  if (command == nullptr || command[0] == '\0') {
    return;
  }

  const auto setAudioRuntimeEnabled = [this](bool enabled) {
    if (calibrator_.isActive()) {
      return false;
    }
    if (enabled && !audio_.isCompileEnabled()) {
      return false;
    }
    const SystemParams previous_params = params_;
    params_.features.enable_audio_output = enabled;
    params_.audio.runtime_enable = enabled;
    if (!enabled) {
      params_.audio.channel_test_enable = false;
      params_.audio.channel_test_wall = WallId::None;
    }
    return applyAudioConfigOrRollback(previous_params);
  };
  const auto setAudioTestWall = [this](WallId wall) {
    if (calibrator_.isActive()) {
      return false;
    }
    if (wall == WallId::None) {
      const SystemParams previous_params = params_;
      params_.audio.channel_test_enable = false;
      params_.audio.channel_test_wall = WallId::None;
      return applyAudioConfigOrRollback(previous_params);
    }
    if (!layoutAllowsWall(params_.audio.output_layout, wall)) {
      return false;
    }
    const SystemParams previous_params = params_;
    params_.audio.channel_test_enable = true;
    params_.audio.channel_test_wall = wall;
    return applyAudioConfigOrRollback(previous_params);
  };

  if (isCommand(command, "status")) {
    char remote_status[192]{};
    remote_.describeStatus(remote_status, sizeof(remote_status));
    Serial.printf(
        "status: preset=%s mode=%s frame=%" PRIu64 " new_evt=%u evt_total=%" PRIu64 " evt=%s/%s energy=%.3f pos=(%.2f,%.2f) imu_stop=%u audio=%u zero=%u driver=%u transport=%s diag=%u layout=%s gain=%.2f limit=%.3f rec=%u replay=%u tilt=%u\n",
        telemetry_.active_preset,
        runModeToString(telemetry_.run_mode),
        telemetry_.frame_counter,
        static_cast<unsigned>(telemetry_.new_evt),
        telemetry_.evt_total,
        eventTypeToString(telemetry_.last_event.type),
        wallToString(telemetry_.last_event.primary_wall),
        telemetry_.mass.energy,
        telemetry_.mass.pos_norm.x,
        telemetry_.mass.pos_norm.y,
        static_cast<unsigned>(telemetry_.safety.imu_stale_safe_stop),
        static_cast<unsigned>(telemetry_.audio.runtime_enabled),
        static_cast<unsigned>(telemetry_.audio.output_silenced),
        static_cast<unsigned>(telemetry_.audio.driver_installed),
        audioTransportToString(telemetry_.audio.transport),
        static_cast<unsigned>(telemetry_.audio.demo_compat_mode),
        audioOutputLayoutToString(telemetry_.audio.output_layout),
        params_.audio.output_gain,
        telemetry_.audio.output_peak_limit,
        static_cast<unsigned>(telemetry_.recorder.recording),
        static_cast<unsigned>(telemetry_.recorder.replaying),
        static_cast<unsigned>(tilt_.isEnabled()));
    Serial.println(remote_status);
    return;
  }

  if (isCommand(command, "idle") || isCommand(command, "stop")) {
    enterSafeIdle();
    Serial.println("pipeline: safe idle; audio muted and tilt disarmed");
    return;
  }
  if (isCommand(command, "live")) {
    requested_run_mode_ = RunMode::Live;
    clearCurrentEventTelemetry(telemetry_);
    Serial.println("pipeline: live; physical outputs remain explicitly gated");
    return;
  }

  if (isCommand(command, "cal start") || isCommand(command, "start_calibration")) {
    if (!startRuntimeCalibration()) {
      Serial.println("calibration: start rejected");
    }
    return;
  }
  if (isCommand(command, "cal stop") || isCommand(command, "stop_calibration")) {
    stopRuntimeCalibration(false);
    return;
  }
  if (isCommand(command, "cal status")) {
    const auto& status = calibrator_.status();
    Serial.printf(
        "calibration: active=%u finished=%u aborted=%u wall=%u band=%u stage=%u hz=%.1f best=%.1f score=%.5f progress=%.2f loaded=%u\n",
        static_cast<unsigned>(status.active),
        static_cast<unsigned>(status.finished),
        static_cast<unsigned>(status.aborted),
        static_cast<unsigned>(status.wall),
        static_cast<unsigned>(status.band),
        static_cast<unsigned>(status.stage),
        status.candidate_hz,
        status.best_hz,
        status.best_score,
        status.progress,
        static_cast<unsigned>(status.loaded_from_storage));
    return;
  }
  if (isCommand(command, "preset list")) {
    const auto list = preset_store_.listPresets();
    Serial.println("presets:");
    for (std::size_t i = 0; i < list.count; ++i) {
      Serial.printf("  %s%s\n", list.items[i].name, list.items[i].from_filesystem ? " [fs]" : "");
    }
    return;
  }
  if (startsWith(command, "preset load ")) {
    if (!loadPresetByName(command + 12)) {
      Serial.println("preset: load failed");
    }
    return;
  }
  if (isCommand(command, "record start")) {
    params_.features.enable_recorder = true;
    recorder_.configure(params_);
    if (recorder_.startRecording(millis())) {
      requested_run_mode_ = RunMode::Record;
      clearCurrentEventTelemetry(telemetry_);
      Serial.println("record: started");
    }
    return;
  }
  if (isCommand(command, "record stop")) {
    recorder_.stopRecording();
    requested_run_mode_ = RunMode::Live;
    clearCurrentEventTelemetry(telemetry_);
    Serial.println("record: stopped");
    return;
  }
  if (isCommand(command, "record status")) {
    const auto& status = recorder_.status();
    Serial.printf(
        "record: enabled=%u recording=%u replaying=%u frames=%lu file=%s\n",
        static_cast<unsigned>(status.enabled),
        static_cast<unsigned>(status.recording),
        static_cast<unsigned>(status.replaying),
        static_cast<unsigned long>(status.recorded_frames),
        status.active_file);
    return;
  }
  if (startsWith(command, "replay start ")) {
    params_.features.enable_recorder = true;
    recorder_.configure(params_);
    if (recorder_.startReplay(command + 13, millis())) {
      requested_run_mode_ = RunMode::Replay;
      clearCurrentEventTelemetry(telemetry_);
      Serial.println("replay: started");
    } else {
      Serial.println("replay: start failed");
    }
    return;
  }
  if (isCommand(command, "replay stop")) {
    recorder_.stopReplay();
    requested_run_mode_ = RunMode::Live;
    clearCurrentEventTelemetry(telemetry_);
    Serial.println("replay: stopped");
    return;
  }
  if (isCommand(command, "replay status")) {
    const auto& status = recorder_.status();
    Serial.printf(
        "replay: replaying=%u index=%lu file=%s\n",
        static_cast<unsigned>(status.replaying),
        static_cast<unsigned long>(status.replay_index),
        status.active_file);
    return;
  }
  if (isCommand(command, "tilt on")) {
    if (!tilt_.isCompileEnabled()) {
      Serial.println("tilt: arm rejected; physical backend is not compiled");
      return;
    }
    if (currentRunMode() != RunMode::Live &&
        currentRunMode() != RunMode::Record) {
      Serial.println("tilt: arm rejected outside live/record mode");
      return;
    }
    params_.features.enable_tilt_plane = true;
    tilt_.configure(params_);
    tilt_.setRuntimeEnabled(true);
    tilt_.home();
    Serial.println("tilt: enabled");
    return;
  }
  if (isCommand(command, "tilt off")) {
    params_.features.enable_tilt_plane = false;
    tilt_.configure(params_);
    tilt_.setRuntimeEnabled(false);
    Serial.println("tilt: disabled");
    return;
  }
  if (isCommand(command, "tilt status")) {
    Serial.printf(
        "tilt: enabled=%u pseudoforce=%u delta=(%.2f,%.2f) base=(%.2f,%.2f)\n",
        static_cast<unsigned>(tilt_.isEnabled()),
        static_cast<unsigned>(params_.tilt.enable_pseudoforce),
        telemetry_.tilt.thumb_delta_deg,
        telemetry_.tilt.index_delta_deg,
        telemetry_.tilt.thumb_base_deg,
        telemetry_.tilt.index_base_deg);
    return;
  }
  if (isCommand(command, "remote status")) {
    char remote_status[192]{};
    remote_.describeStatus(remote_status, sizeof(remote_status));
    Serial.println(remote_status);
    return;
  }
  if (isCommand(command, "audio status")) {
    const auto audio_status = audio_.status();
    Serial.printf(
        "audio: enabled=%u zero=%u driver=%u transport=%s diag=%u layout=%s gain=%.2f limit=%.3f active_channels=%u test=%u wall=%s level=%.2f errors=%lu\n",
        static_cast<unsigned>(audio_status.runtime_enabled),
        static_cast<unsigned>(audio_status.output_silenced),
        static_cast<unsigned>(audio_status.driver_installed),
        audioTransportToString(audio_status.transport),
        static_cast<unsigned>(audio_status.demo_compat_mode),
        audioOutputLayoutToString(audio_status.output_layout),
        params_.audio.output_gain,
        audio_status.output_peak_limit,
        static_cast<unsigned>(audio_status.active_output_channels),
        static_cast<unsigned>(audio_status.test_mode),
        wallToString(audio_status.test_wall),
        params_.audio.channel_test_level,
        static_cast<unsigned long>(audio_status.underrun_count));
    return;
  }
  if (isCommand(command, "audio diag on")) {
    if (params_.audio.runtime_enable ||
        params_.audio.transport == AudioTransport::Tdm8Slot) {
      Serial.println("audio: diagnostic mode rejected; mute first and use dual_i2s transport");
      return;
    }
    const SystemParams previous_params = params_;
    params_.audio.demo_compat_mode = true;
    params_.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
    if (!layoutAllowsWall(params_.audio.output_layout, params_.audio.channel_test_wall)) {
      params_.audio.channel_test_wall = WallId::None;
      params_.audio.channel_test_enable = false;
    }
    Serial.println(applyAudioConfigOrRollback(previous_params)
                       ? "audio: diagnostic demo-compat mode enabled"
                       : "audio: diagnostic mode failed; inspect audio status");
    return;
  }
  if (isCommand(command, "audio diag off")) {
    if (params_.audio.runtime_enable) {
      Serial.println("audio: diagnostic mode change rejected; mute first");
      return;
    }
    const SystemParams previous_params = params_;
    params_.audio.demo_compat_mode = false;
    Serial.println(applyAudioConfigOrRollback(previous_params)
                       ? "audio: diagnostic demo-compat mode disabled"
                       : "audio: diagnostic mode failed; inspect audio status");
    return;
  }
  if (isCommand(command, "audio on")) {
    Serial.println(setAudioRuntimeEnabled(true) ? "audio: enabled" : "audio: enable rejected");
    return;
  }
  if (isCommand(command, "audio off")) {
    Serial.println(setAudioRuntimeEnabled(false)
                       ? "audio: disabled"
                       : "audio: disable incomplete; inspect audio status");
    return;
  }
  if (startsWith(command, "audio gain ")) {
    const SystemParams previous_params = params_;
    const float gain = std::strtof(command + 11, nullptr);
    params_.audio.output_gain = std::max(0.0f, std::min(gain, 4.0f));
    if (!applyAudioConfigOrRollback(previous_params)) {
      Serial.println("audio: gain update failed");
      return;
    }
    Serial.printf("audio: gain=%.2f\n", params_.audio.output_gain);
    return;
  }
  if (startsWith(command, "audio limit ")) {
    const SystemParams previous_params = params_;
    const float limit = std::strtof(command + 12, nullptr);
    params_.audio.output_peak_limit = clampf(limit, 0.0f, 1.0f);
    if (!applyAudioConfigOrRollback(previous_params)) {
      Serial.println("audio: limit update failed");
      return;
    }
    Serial.printf("audio: requested limit=%.3f effective=%.3f\n",
                  params_.audio.output_peak_limit,
                  audio_.status().output_peak_limit);
    return;
  }
  if (startsWith(command, "audio test ")) {
    const char* wall_text = command + 11;
    if (startsWith(wall_text, "level ")) {
      const SystemParams previous_params = params_;
      const float level = std::strtof(wall_text + 6, nullptr);
      params_.audio.channel_test_level = std::max(0.0f, std::min(level, 1.0f));
      if (!applyAudioConfigOrRollback(previous_params)) {
        Serial.println("audio: test level update failed");
        return;
      }
      Serial.printf("audio: test level=%.2f\n", params_.audio.channel_test_level);
      return;
    }
    if (std::strcmp(wall_text, "off") == 0 || std::strcmp(wall_text, "none") == 0) {
      Serial.println(setAudioTestWall(WallId::None)
                         ? "audio: test=None"
                         : "audio: test change failed; inspect audio status");
      return;
    }

    const WallId wall = parseWallId(wall_text);
    if (wall == WallId::None) {
      Serial.println("audio: test usage = front|back|top|bottom|off");
      return;
    }
    if (!setAudioTestWall(wall)) {
      Serial.printf("audio: test wall %s unavailable in layout=%s\n", wallToString(wall),
                    audioOutputLayoutToString(params_.audio.output_layout));
      return;
    }
    Serial.printf("audio: test=%s\n", wallToString(wall));
    return;
  }
  if (isCommand(command, "audio layout 2ch")) {
    if (params_.audio.runtime_enable) {
      Serial.println("audio: layout change rejected; mute first");
      return;
    }
    const SystemParams previous_params = params_;
    params_.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
    if (!layoutAllowsWall(params_.audio.output_layout, params_.audio.channel_test_wall)) {
      params_.audio.channel_test_wall = WallId::None;
      params_.audio.channel_test_enable = false;
    }
    Serial.println(applyAudioConfigOrRollback(previous_params)
                       ? "audio: layout=front_back_2ch"
                       : "audio: layout change failed; inspect audio status");
    return;
  }
  if (isCommand(command, "audio layout 4ch")) {
    if (params_.audio.runtime_enable) {
      Serial.println("audio: layout change rejected; mute first");
      return;
    }
    const SystemParams previous_params = params_;
    params_.audio.output_layout = AudioOutputLayout::QuadWall4Ch;
    Serial.println(applyAudioConfigOrRollback(previous_params)
                       ? "audio: layout=quad_wall_4ch"
                       : "audio: layout change failed; inspect audio status");
    return;
  }

  Serial.println(
      "commands: status, idle|stop, live, cal start|stop|status, preset list|load <name>, record start|stop|status, replay start <file>|stop|status, tilt on|off|status, audio diag on|off, audio on|off|status|gain <0..4>|limit <0..1>|test <wall>|test level <0..1>|layout 2ch|layout 4ch, remote status");
}

}  // namespace haptics
