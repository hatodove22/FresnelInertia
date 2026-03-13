#include "haptics/HapticPipeline.hpp"

#include <Arduino.h>

#include <algorithm>
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
}

void HapticPipeline::cyclePreset() {
  if (calibrator_.isActive()) {
    return;
  }
  switch (current_family_) {
    case MaterialFamily::Liquid:
      applyPreset(MaterialFamily::Granular);
      break;
    case MaterialFamily::Granular:
      applyPreset(MaterialFamily::Hybrid);
      break;
    case MaterialFamily::Hybrid:
      applyPreset(MaterialFamily::Detented);
      break;
    case MaterialFamily::Detented:
    case MaterialFamily::Custom:
    default:
      applyPreset(MaterialFamily::Liquid);
      break;
  }
}

void HapticPipeline::toggleVerbose() {
  params_.features.enable_verbose_serial = !params_.features.enable_verbose_serial;
}

void HapticPipeline::cycleAudioTestMode() {
  if (calibrator_.isActive()) {
    return;
  }
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

TiltPlaneCommand HapticPipeline::makeTiltCommandFromMass(const MassState& state) const {
  TiltPlaneCommand cmd{};
  const float thumb = state.pos_norm.x * params_.tilt.max_tilt_deg;
  const float index = -state.pos_norm.x * params_.tilt.max_tilt_deg;
  cmd.thumb_angle_deg = params_.tilt.thumb_home_deg + thumb;
  cmd.index_angle_deg = params_.tilt.index_home_deg + index;
  cmd.thumb_current_limit_ma = params_.tilt.max_current_ma * state.energy;
  cmd.index_current_limit_ma = params_.tilt.max_current_ma * state.energy;
  return cmd;
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
  } else if (std::strcmp(path, "features.enable_verbose_serial") == 0 && value.has_bool) {
    params_.features.enable_verbose_serial = value.boolean;
  } else if (std::strcmp(path, "features.enable_remote_interface") == 0 && value.has_bool) {
    params_.features.enable_remote_interface = value.boolean;
  } else if (std::strcmp(path, "features.enable_recorder") == 0 && value.has_bool) {
    params_.features.enable_recorder = value.boolean;
  } else if (std::strcmp(path, "features.enable_tilt_plane") == 0 && value.has_bool) {
    params_.features.enable_tilt_plane = value.boolean;
  } else if (std::strcmp(path, "tilt.max_tilt_deg") == 0 && value.has_number) {
    params_.tilt.max_tilt_deg = value.number;
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
  const auto tilt_cmd = makeTiltCommandFromMass(mass);
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
    Serial.printf("tilt: enabled=%u\n", static_cast<unsigned>(tilt_.isEnabled()));
    return;
  }

  Serial.println(
      "commands: cal start|stop|status, preset list|load <name>, record start|stop|status, replay start <file>|stop|status, tilt on|off|status");
}

}  // namespace haptics
