#include "haptics/HapticPipeline.hpp"

#include <Arduino.h>

#include <algorithm>
#include <cstdlib>
#include <cstdio>
#include <cstring>

namespace haptics {
namespace {

bool isCommand(const char* command, const char* expected) {
  return std::strcmp(command, expected) == 0;
}

bool startsWith(const char* command, const char* prefix) {
  return std::strncmp(command, prefix, std::strlen(prefix)) == 0;
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

AudioOutputLayout parseAudioOutputLayout(const char* text) {
  if (text == nullptr) {
    return AudioOutputLayout::QuadWall4Ch;
  }
  if (std::strcmp(text, "front_back_2ch") == 0 || std::strcmp(text, "2ch") == 0 ||
      std::strcmp(text, "front_back") == 0) {
    return AudioOutputLayout::FrontBack2Ch;
  }
  return AudioOutputLayout::QuadWall4Ch;
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
  params_ = params;
  current_family_ = params.container.family;
  requested_run_mode_ = RunMode::Live;

  preset_store_.begin();
  calibrator_.loadStoredCarriers(params_);
  imu_.begin();
  mass_layer_.configure(params_);
  event_layer_.configure(params_);
  texture_layer_.configure(params_);
  resonance_layer_.configure(params_);
  calibrator_.configure(params_);
  spatial_renderer_.configure(params_);
  audio_.begin(params_);
  tilt_model_.configure(params_);
  tilt_model_.reset();
  tilt_.begin(params_);
  remote_.begin(params_);
  recorder_.begin(params_);

  last_tick_us_ = micros();
  last_print_ms_ = millis();
  std::strncpy(telemetry_.active_preset, params_.preset_name, sizeof(telemetry_.active_preset) - 1);
  telemetry_.run_mode = currentRunMode();
  return true;
}

void HapticPipeline::reconfigurePipeline() {
  mass_layer_.configure(params_);
  event_layer_.configure(params_);
  texture_layer_.configure(params_);
  resonance_layer_.configure(params_);
  calibrator_.configure(params_);
  spatial_renderer_.configure(params_);
  audio_.configure(params_);
  tilt_model_.configure(params_);
  tilt_.configure(params_);
  remote_.configure(params_);
  recorder_.configure(params_);
}

void HapticPipeline::refreshOutputConfig() {
  resonance_layer_.configure(params_);
  calibrator_.configure(params_);
  spatial_renderer_.configure(params_);
  audio_.configure(params_);
}

bool HapticPipeline::loadPresetByName(const char* preset_name) {
  if (preset_name == nullptr || preset_name[0] == '\0') {
    return false;
  }

  const FeatureFlags saved_features = params_.features;
  const PlatformPins saved_pins = params_.pins;
  const AudioBackendParams saved_audio = params_.audio;
  const TiltPlaneParams saved_tilt = params_.tilt;
  const InterfaceParams saved_iface = params_.iface;
  const RecorderParams saved_recorder = params_.recorder;
  const auto saved_low_carrier_hz = params_.resonance.low_carrier_hz;
  const auto saved_high_carrier_hz = params_.resonance.high_carrier_hz;

  SystemParams next_params{};
  if (!preset_store_.loadPreset(preset_name, next_params)) {
    return false;
  }

  next_params.features = saved_features;
  next_params.pins = saved_pins;
  next_params.audio = saved_audio;
  next_params.tilt = saved_tilt;
  next_params.iface = saved_iface;
  next_params.recorder = saved_recorder;
  next_params.resonance.low_carrier_hz = saved_low_carrier_hz;
  next_params.resonance.high_carrier_hz = saved_high_carrier_hz;

  params_ = next_params;
  current_family_ = params_.container.family;
  reconfigurePipeline();
  tilt_model_.reset();
  return true;
}

void HapticPipeline::applyPreset(MaterialFamily family) {
  const FeatureFlags saved_features = params_.features;
  const PlatformPins saved_pins = params_.pins;
  const AudioBackendParams saved_audio = params_.audio;
  const TiltPlaneParams saved_tilt = params_.tilt;
  const InterfaceParams saved_iface = params_.iface;
  const RecorderParams saved_recorder = params_.recorder;
  const auto saved_low_carrier_hz = params_.resonance.low_carrier_hz;
  const auto saved_high_carrier_hz = params_.resonance.high_carrier_hz;

  switch (family) {
    case MaterialFamily::Liquid:
      params_ = makeDefaultLiquidPreset();
      break;
    case MaterialFamily::Granular:
      params_ = makeDefaultGranularPreset();
      break;
    case MaterialFamily::Hybrid:
      params_ = makeDefaultHybridPreset();
      break;
    case MaterialFamily::Detented:
      params_ = makeDefaultDetentedPreset();
      break;
    case MaterialFamily::Custom:
    default:
      return;
  }

  params_.features = saved_features;
  params_.pins = saved_pins;
  params_.audio = saved_audio;
  params_.tilt = saved_tilt;
  params_.iface = saved_iface;
  params_.recorder = saved_recorder;
  params_.resonance.low_carrier_hz = saved_low_carrier_hz;
  params_.resonance.high_carrier_hz = saved_high_carrier_hz;
  current_family_ = family;
  reconfigurePipeline();
  tilt_model_.reset();
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
  audio_.configure(params_);
}

void HapticPipeline::toggleAudioRuntimeEnable() {
  if (calibrator_.isActive()) {
    return;
  }
  const bool next_state = !(params_.features.enable_audio_output && params_.audio.runtime_enable);
  params_.features.enable_audio_output = next_state;
  params_.audio.runtime_enable = next_state;
  if (!next_state) {
    params_.audio.channel_test_enable = false;
    params_.audio.channel_test_wall = WallId::None;
  }
  audio_.configure(params_);
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

  if (std::strcmp(path, "container.fill") == 0 && value.has_number) {
    params_.container.fill = value.number;
  } else if (std::strcmp(path, "container.headspace") == 0 && value.has_number) {
    params_.container.headspace = value.number;
  } else if (std::strcmp(path, "container.viscosity") == 0 && value.has_number) {
    params_.container.viscosity = value.number;
  } else if (std::strcmp(path, "container.particle_count") == 0 && value.has_number) {
    params_.container.particle_count = value.number;
  } else if (std::strcmp(path, "container.particle_hardness") == 0 && value.has_number) {
    params_.container.particle_hardness = value.number;
  } else if (std::strcmp(path, "container.shell_mass_kg") == 0 && value.has_number) {
    params_.container.shell_mass_kg = value.number;
  } else if (std::strcmp(path, "container.content_mass_full_kg") == 0 && value.has_number) {
    params_.container.content_mass_full_kg = value.number;
  } else if (std::strcmp(path, "container.shell_cg_x_m") == 0 && value.has_number) {
    params_.container.shell_cg_x_m = value.number;
  } else if (std::strcmp(path, "container.shell_cg_y_m") == 0 && value.has_number) {
    params_.container.shell_cg_y_m = value.number;
  } else if (std::strcmp(path, "container.enable_roof_contact") == 0 && value.has_bool) {
    params_.container.enable_roof_contact = value.boolean;
  } else if (std::strcmp(path, "event.roll_rate_hz") == 0 && value.has_number) {
    params_.event.roll_rate_hz = value.number;
  } else if (std::strcmp(path, "event.impact_rate_hz") == 0 && value.has_number) {
    params_.event.impact_rate_hz = value.number;
  } else if (std::strcmp(path, "event.droplet_rate_hz") == 0 && value.has_number) {
    params_.event.droplet_rate_hz = value.number;
  } else if (std::strcmp(path, "event.scrape_threshold") == 0 && value.has_number) {
    params_.event.scrape_threshold = value.number;
  } else if (std::strcmp(path, "event.roof_slap_threshold") == 0 && value.has_number) {
    params_.event.roof_slap_threshold = value.number;
  } else if (std::strcmp(path, "texture.flow_ripple_soa_ms") == 0 && value.has_number) {
    params_.texture.flow_ripple_soa_ms = value.number;
  } else if (std::strcmp(path, "spatial.neighbor_bleed") == 0 && value.has_number) {
    params_.spatial.neighbor_bleed = value.number;
  } else if (std::strcmp(path, "spatial.opposite_bleed") == 0 && value.has_number) {
    params_.spatial.opposite_bleed = value.number;
  } else if (std::strcmp(path, "resonance.master_gain") == 0 && value.has_number) {
    params_.resonance.master_gain = value.number;
  } else if (std::strcmp(path, "audio.runtime_enable") == 0 && value.has_bool) {
    params_.audio.runtime_enable = value.boolean;
    params_.features.enable_audio_output = value.boolean;
  } else if (std::strcmp(path, "audio.output_gain") == 0 && value.has_number) {
    params_.audio.output_gain = std::max(0.0f, value.number);
  } else if (std::strcmp(path, "audio.demo_compat_mode") == 0 && value.has_bool) {
    params_.audio.demo_compat_mode = value.boolean;
    if (params_.audio.demo_compat_mode) {
      params_.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
    }
    if (!layoutAllowsWall(params_.audio.output_layout, params_.audio.channel_test_wall)) {
      params_.audio.channel_test_wall = WallId::None;
      params_.audio.channel_test_enable = false;
    }
  } else if (std::strcmp(path, "audio.output_layout") == 0 && (value.has_text || value.has_number)) {
    params_.audio.output_layout =
        value.has_text ? parseAudioOutputLayout(value.text)
                       : (value.number <= 2.5f ? AudioOutputLayout::FrontBack2Ch : AudioOutputLayout::QuadWall4Ch);
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
    params_.features.enable_tilt_plane = value.boolean;
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

  reconfigurePipeline();
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
          requested_run_mode_ = RunMode::Idle;
          return true;
        case RunMode::Live:
          requested_run_mode_ = RunMode::Live;
          recorder_.stopReplay();
          return true;
        case RunMode::Calibration:
          return startRuntimeCalibration();
        case RunMode::Record:
          params_.features.enable_recorder = true;
          recorder_.configure(params_);
          if (recorder_.startRecording(millis(), message.argument[0] != '\0' ? message.argument : nullptr)) {
            requested_run_mode_ = RunMode::Record;
            return true;
          }
          return false;
        case RunMode::Replay:
          params_.features.enable_recorder = true;
          recorder_.configure(params_);
          if (recorder_.startReplay(message.argument, millis())) {
            requested_run_mode_ = RunMode::Replay;
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
        return true;
      }
      return false;
    case ControlMessageType::RecordStop:
      recorder_.stopRecording();
      requested_run_mode_ = RunMode::Live;
      return true;
    case ControlMessageType::ReplayStart:
      params_.features.enable_recorder = true;
      recorder_.configure(params_);
      if (recorder_.startReplay(message.argument, millis())) {
        requested_run_mode_ = RunMode::Replay;
        return true;
      }
      return false;
    case ControlMessageType::ReplayStop:
      recorder_.stopReplay();
      requested_run_mode_ = RunMode::Live;
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

  const bool calibration_params_changed = calibrator_.update(sample, millis(), params_);
  if (calibration_params_changed) {
    if (!calibrator_.isActive()) {
      params_.features.enable_runtime_calibration = false;
      requested_run_mode_ = RunMode::Live;
    }
    refreshOutputConfig();
  }

  const bool idle_mode = currentRunMode() == RunMode::Idle;
  const MassState mass = (!idle_mode && params_.features.enable_mass_layer) ? mass_layer_.update(sample, dt_s)
                                                                            : makeDefaultMassState();
  const auto events =
      (!idle_mode && params_.features.enable_event_layer) ? event_layer_.update(mass, dt_s) : EventFrame<kMaxEventsPerFrame>{};
  const auto textures =
      (!idle_mode && params_.features.enable_texture_layer) ? texture_layer_.update(events, dt_s)
                                                            : TextureFrame<kMaxTexturesPerFrame>{};
  const auto resonances =
      (!idle_mode && params_.features.enable_resonance_layer)
          ? resonance_layer_.update(textures)
          : ResonanceFrame<kMaxResonanceVoicesPerFrame>{};
  const auto spatial =
      (!idle_mode && params_.features.enable_spatial_renderer) ? spatial_renderer_.update(resonances, dt_s) : SpatialFrame4{};
  const auto tilt_cmd = updateTiltCommand(sample, mass, dt_s);
  const HapticEvent last_event = params_.features.enable_event_layer ? event_layer_.lastEvent() : HapticEvent{};

  DriveFrame4 audio_drive = spatial.drive;
  ActuatorFrame4 actuator_summary = spatial.summary;
  if (calibrator_.isActive()) {
    audio_drive = calibrator_.driveFrame();
    actuator_summary = summarizeDriveFrame(audio_drive);
  }

  audio_.submit(audio_drive);
  tilt_.submit(tilt_cmd);

  telemetry_.timestamp_ms = millis();
  telemetry_.frame_counter++;
  std::strncpy(telemetry_.active_preset, params_.preset_name, sizeof(telemetry_.active_preset) - 1);
  telemetry_.run_mode = currentRunMode();
  telemetry_.imu = sample;
  telemetry_.mass = mass;
  telemetry_.last_event = last_event;
  telemetry_.actuators = actuator_summary;
  telemetry_.tilt = tilt_cmd;
  telemetry_.audio = audio_.status();
  telemetry_.calibration = calibrator_.status();
  telemetry_.recorder = recorder_.status();
  telemetry_.remote = remote_.status();

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
        "preset=%s mode=%u energy=%.3f pos=(%.2f,%.2f) vel=(%.2f,%.2f) evt=%u ch=[%.2f %.2f %.2f %.2f] rec=%u replay=%u remote=%u\n",
        params_.preset_name,
        static_cast<unsigned>(telemetry_.run_mode),
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
    params_.features.enable_audio_output = enabled;
    params_.audio.runtime_enable = enabled;
    if (!enabled) {
      params_.audio.channel_test_enable = false;
      params_.audio.channel_test_wall = WallId::None;
    }
    audio_.configure(params_);
    return true;
  };
  const auto setAudioTestWall = [this](WallId wall) {
    if (calibrator_.isActive()) {
      return false;
    }
    if (wall == WallId::None) {
      params_.audio.channel_test_enable = false;
      params_.audio.channel_test_wall = WallId::None;
      audio_.configure(params_);
      return true;
    }
    if (!layoutAllowsWall(params_.audio.output_layout, wall)) {
      return false;
    }
    params_.audio.channel_test_enable = true;
    params_.audio.channel_test_wall = wall;
    audio_.configure(params_);
    return true;
  };

  if (isCommand(command, "status")) {
    char remote_status[192]{};
    remote_.describeStatus(remote_status, sizeof(remote_status));
    Serial.printf(
        "status: preset=%s mode=%s evt=%s/%s energy=%.3f pos=(%.2f,%.2f) audio=%u diag=%u layout=%s gain=%.2f rec=%u replay=%u tilt=%u\n",
        telemetry_.active_preset,
        runModeToString(telemetry_.run_mode),
        eventTypeToString(telemetry_.last_event.type),
        wallToString(telemetry_.last_event.primary_wall),
        telemetry_.mass.energy,
        telemetry_.mass.pos_norm.x,
        telemetry_.mass.pos_norm.y,
        static_cast<unsigned>(telemetry_.audio.runtime_enabled),
        static_cast<unsigned>(telemetry_.audio.demo_compat_mode),
        audioOutputLayoutToString(telemetry_.audio.output_layout),
        params_.audio.output_gain,
        static_cast<unsigned>(telemetry_.recorder.recording),
        static_cast<unsigned>(telemetry_.recorder.replaying),
        static_cast<unsigned>(tilt_.isEnabled()));
    Serial.println(remote_status);
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
      Serial.println("record: started");
    }
    return;
  }
  if (isCommand(command, "record stop")) {
    recorder_.stopRecording();
    requested_run_mode_ = RunMode::Live;
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
      Serial.println("replay: started");
    } else {
      Serial.println("replay: start failed");
    }
    return;
  }
  if (isCommand(command, "replay stop")) {
    recorder_.stopReplay();
    requested_run_mode_ = RunMode::Live;
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
        "audio: enabled=%u diag=%u layout=%s gain=%.2f active_channels=%u test=%u wall=%s level=%.2f underruns=%lu\n",
        static_cast<unsigned>(audio_status.runtime_enabled),
        static_cast<unsigned>(audio_status.demo_compat_mode),
        audioOutputLayoutToString(audio_status.output_layout),
        params_.audio.output_gain,
        static_cast<unsigned>(audio_status.active_output_channels),
        static_cast<unsigned>(audio_status.test_mode),
        wallToString(audio_status.test_wall),
        params_.audio.channel_test_level,
        static_cast<unsigned long>(audio_status.underrun_count));
    return;
  }
  if (isCommand(command, "audio diag on")) {
    params_.audio.demo_compat_mode = true;
    params_.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
    if (!layoutAllowsWall(params_.audio.output_layout, params_.audio.channel_test_wall)) {
      params_.audio.channel_test_wall = WallId::None;
      params_.audio.channel_test_enable = false;
    }
    audio_.configure(params_);
    Serial.println("audio: diagnostic demo-compat mode enabled");
    return;
  }
  if (isCommand(command, "audio diag off")) {
    params_.audio.demo_compat_mode = false;
    audio_.configure(params_);
    Serial.println("audio: diagnostic demo-compat mode disabled");
    return;
  }
  if (isCommand(command, "audio on")) {
    Serial.println(setAudioRuntimeEnabled(true) ? "audio: enabled" : "audio: busy");
    return;
  }
  if (isCommand(command, "audio off")) {
    Serial.println(setAudioRuntimeEnabled(false) ? "audio: disabled" : "audio: busy");
    return;
  }
  if (startsWith(command, "audio gain ")) {
    const float gain = std::strtof(command + 11, nullptr);
    params_.audio.output_gain = std::max(0.0f, std::min(gain, 4.0f));
    audio_.configure(params_);
    Serial.printf("audio: gain=%.2f\n", params_.audio.output_gain);
    return;
  }
  if (startsWith(command, "audio test ")) {
    const char* wall_text = command + 11;
    if (startsWith(wall_text, "level ")) {
      const float level = std::strtof(wall_text + 6, nullptr);
      params_.audio.channel_test_level = std::max(0.0f, std::min(level, 1.0f));
      audio_.configure(params_);
      Serial.printf("audio: test level=%.2f\n", params_.audio.channel_test_level);
      return;
    }
    if (std::strcmp(wall_text, "off") == 0 || std::strcmp(wall_text, "none") == 0) {
      Serial.println(setAudioTestWall(WallId::None) ? "audio: test=None" : "audio: busy");
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
    params_.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
    if (!layoutAllowsWall(params_.audio.output_layout, params_.audio.channel_test_wall)) {
      params_.audio.channel_test_wall = WallId::None;
      params_.audio.channel_test_enable = false;
    }
    audio_.configure(params_);
    Serial.println("audio: layout=front_back_2ch");
    return;
  }
  if (isCommand(command, "audio layout 4ch")) {
    params_.audio.output_layout = AudioOutputLayout::QuadWall4Ch;
    audio_.configure(params_);
    Serial.println("audio: layout=quad_wall_4ch");
    return;
  }

  Serial.println(
      "commands: status, cal start|stop|status, preset list|load <name>, record start|stop|status, replay start <file>|stop|status, tilt on|off|status, audio diag on|off, audio on|off|status|test <wall>|test level <0..1>|layout 2ch|layout 4ch, remote status");
}

}  // namespace haptics
