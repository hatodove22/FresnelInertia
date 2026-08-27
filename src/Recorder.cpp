#include "haptics/Recorder.hpp"

#include "haptics/DebugFlags.hpp"

#include <ArduinoJson.h>
#include <LittleFS.h>

#include <algorithm>
#include <cstdio>

namespace haptics {
namespace {

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

const char* bandToString(CalibrationBand band) {
  switch (band) {
    case CalibrationBand::Low:
      return "Low";
    case CalibrationBand::High:
      return "High";
    case CalibrationBand::None:
    default:
      return "None";
  }
}

const char* stageToString(CalibrationStage stage) {
  switch (stage) {
    case CalibrationStage::Settling:
      return "Settling";
    case CalibrationStage::Measuring:
      return "Measuring";
    case CalibrationStage::Complete:
      return "Complete";
    case CalibrationStage::Aborted:
      return "Aborted";
    case CalibrationStage::Idle:
    default:
      return "Idle";
  }
}

const char* audioLayoutToString(AudioOutputLayout layout) {
  switch (layout) {
    case AudioOutputLayout::FrontBack2Ch:
      return "front_back_2ch";
    case AudioOutputLayout::QuadWall4Ch:
    default:
      return "quad_wall_4ch";
  }
}

const char* audioTransportToString(AudioTransport transport) {
  return transport == AudioTransport::Tdm8Slot ? "tdm8_slot" : "dual_i2s";
}

const char* runModeToString(RunMode mode) {
  switch (mode) {
    case RunMode::Live:
      return "live";
    case RunMode::Calibration:
      return "calibration";
    case RunMode::Record:
      return "record";
    case RunMode::Replay:
      return "replay";
    case RunMode::Idle:
    default:
      return "idle";
  }
}

}  // namespace

bool Recorder::begin(const SystemParams& params) {
  params_ = params;
  status_ = {};
  status_.enabled = params.features.enable_recorder;
#if HAPTICS_DEBUG_DISABLE_STORAGE
  mounted_ = false;
  return true;
#else
  mounted_ = mountFilesystem();
  return true;
#endif
}

void Recorder::configure(const SystemParams& params) {
  params_ = params;
  status_.enabled = params.features.enable_recorder;
}

void Recorder::updateStatusPath(const char* path) {
  status_.active_file[0] = '\0';
  if (path != nullptr) {
    std::snprintf(status_.active_file, sizeof(status_.active_file), "%s", path);
  }
}

bool Recorder::mountFilesystem() {
#if HAPTICS_DEBUG_DISABLE_STORAGE
  return false;
#else
  if (!mounted_) {
    mounted_ = LittleFS.begin(false);
  }
  return mounted_;
#endif
}

bool Recorder::openRecordFile() {
  if (record_file_) {
    return true;
  }
  if (status_.active_file[0] == '\0') {
    return false;
  }
  record_file_ = LittleFS.open(status_.active_file, FILE_APPEND);
  return static_cast<bool>(record_file_);
}

void Recorder::flushRecordFile() {
  if (!record_file_) {
    pending_flush_frames_ = 0;
    return;
  }
  record_file_.flush();
  pending_flush_frames_ = 0;
}

void Recorder::closeRecordFile() {
  if (record_file_) {
    flushRecordFile();
    record_file_.close();
  }
  pending_flush_frames_ = 0;
}

void Recorder::append(const TelemetrySnapshot& snapshot) {
  if (!status_.recording || !mountFilesystem()) {
    return;
  }

  if (!openRecordFile()) {
    return;
  }

  StaticJsonDocument<2560> doc;
  doc["timestamp_ms"] = snapshot.timestamp_ms;
  doc["frame_counter"] = snapshot.frame_counter;
  doc["new_evt"] = snapshot.new_evt;
  doc["evt_total"] = snapshot.evt_total;
  doc["preset"] = snapshot.active_preset;
  doc["run_mode"] = runModeToString(snapshot.run_mode);

  JsonObject imu = doc.createNestedObject("imu");
  JsonArray accel = imu.createNestedArray("accel_g");
  accel.add(snapshot.imu.accel_g.x);
  accel.add(snapshot.imu.accel_g.y);
  accel.add(snapshot.imu.accel_g.z);
  JsonArray gyro = imu.createNestedArray("gyro_dps");
  gyro.add(snapshot.imu.gyro_dps.x);
  gyro.add(snapshot.imu.gyro_dps.y);
  gyro.add(snapshot.imu.gyro_dps.z);
  imu["valid"] = snapshot.imu.valid;

  JsonObject mass = doc.createNestedObject("mass");
  JsonArray pos = mass.createNestedArray("pos_norm");
  pos.add(snapshot.mass.pos_norm.x);
  pos.add(snapshot.mass.pos_norm.y);
  JsonArray vel = mass.createNestedArray("vel_norm_s");
  vel.add(snapshot.mass.vel_norm_s.x);
  vel.add(snapshot.mass.vel_norm_s.y);
  mass["energy"] = snapshot.mass.energy;
  mass["fill"] = snapshot.mass.fill;
  mass["headspace"] = snapshot.mass.headspace;

  JsonObject last_event = doc.createNestedObject("last_event");
  last_event["type"] = eventTypeToString(snapshot.last_event.type);
  last_event["primary_wall"] = wallToString(snapshot.last_event.primary_wall);
  last_event["amplitude"] = snapshot.last_event.amplitude;

  JsonArray actuators = doc.createNestedArray("actuators");
  for (float ch : snapshot.actuators.ch) {
    actuators.add(ch);
  }

  JsonObject tilt = doc.createNestedObject("tilt");
  tilt["thumb_angle_deg"] = snapshot.tilt.thumb_angle_deg;
  tilt["index_angle_deg"] = snapshot.tilt.index_angle_deg;
  tilt["thumb_current_limit_ma"] = snapshot.tilt.thumb_current_limit_ma;
  tilt["index_current_limit_ma"] = snapshot.tilt.index_current_limit_ma;
  tilt["thumb_base_deg"] = snapshot.tilt.thumb_base_deg;
  tilt["index_base_deg"] = snapshot.tilt.index_base_deg;
  tilt["thumb_delta_deg"] = snapshot.tilt.thumb_delta_deg;
  tilt["index_delta_deg"] = snapshot.tilt.index_delta_deg;
  tilt["common_force_n"] = snapshot.tilt.common_force_n;
  tilt["differential_torque_nm"] = snapshot.tilt.differential_torque_nm;
  tilt["cg_x_m"] = snapshot.tilt.cg_x_m;
  tilt["cg_y_m"] = snapshot.tilt.cg_y_m;
  tilt["apparent_mass_kg"] = snapshot.tilt.apparent_mass_kg;
  tilt["pseudoforce_enabled"] = snapshot.tilt.pseudoforce_enabled;

  JsonObject audio = doc.createNestedObject("audio");
  audio["compile_enabled"] = snapshot.audio.compile_enabled;
  audio["driver_installed"] = snapshot.audio.driver_installed;
  audio["runtime_enabled"] = snapshot.audio.runtime_enabled;
  audio["output_silenced"] = snapshot.audio.output_silenced;
  audio["test_mode"] = snapshot.audio.test_mode;
  audio["demo_compat_mode"] = snapshot.audio.demo_compat_mode;
  audio["transport"] = audioTransportToString(snapshot.audio.transport);
  audio["output_layout"] = audioLayoutToString(snapshot.audio.output_layout);
  audio["active_output_channels"] = snapshot.audio.active_output_channels;
  audio["test_wall"] = wallToString(snapshot.audio.test_wall);
  audio["output_peak_limit"] = snapshot.audio.output_peak_limit;
  audio["underrun_count"] = snapshot.audio.underrun_count;

  JsonObject safety = doc.createNestedObject("safety");
  safety["imu_stale_safe_stop"] = snapshot.safety.imu_stale_safe_stop;
  safety["imu_fault_injection_active"] =
      snapshot.safety.imu_fault_injection_active;
  safety["audio_zero_asserted"] = snapshot.safety.audio_zero_asserted;
  safety["tilt_disarmed"] = snapshot.safety.tilt_disarmed;

  JsonObject calibration = doc.createNestedObject("calibration");
  calibration["active"] = snapshot.calibration.active;
  calibration["finished"] = snapshot.calibration.finished;
  calibration["aborted"] = snapshot.calibration.aborted;
  calibration["wall"] = wallToString(snapshot.calibration.wall);
  calibration["band"] = bandToString(snapshot.calibration.band);
  calibration["stage"] = stageToString(snapshot.calibration.stage);
  calibration["candidate_hz"] = snapshot.calibration.candidate_hz;
  calibration["best_hz"] = snapshot.calibration.best_hz;
  calibration["candidate_score"] = snapshot.calibration.candidate_score;
  calibration["best_score"] = snapshot.calibration.best_score;
  calibration["progress"] = snapshot.calibration.progress;

  if (params_.features.enable_pipeline_debug_telemetry) {
    JsonObject pipeline_debug = doc.createNestedObject("pipeline_debug");
    pipeline_debug["event_count"] = snapshot.pipeline_debug.event_count;
    pipeline_debug["texture_count"] = snapshot.pipeline_debug.texture_count;
    pipeline_debug["resonance_count"] = snapshot.pipeline_debug.resonance_count;
    pipeline_debug["mass_enabled"] = snapshot.pipeline_debug.mass_enabled;
    pipeline_debug["event_enabled"] = snapshot.pipeline_debug.event_enabled;
    pipeline_debug["texture_enabled"] = snapshot.pipeline_debug.texture_enabled;
    pipeline_debug["resonance_enabled"] = snapshot.pipeline_debug.resonance_enabled;
    pipeline_debug["spatial_enabled"] = snapshot.pipeline_debug.spatial_enabled;
    pipeline_debug["imu_stale_safe_stop"] = snapshot.pipeline_debug.imu_stale_safe_stop;
  }

  serializeJson(doc, record_file_);
  record_file_.println();

  ++status_.recorded_frames;
  ++pending_flush_frames_;
  const uint16_t flush_interval_frames = std::max<uint16_t>(1, params_.recorder.flush_interval_frames);
  if (pending_flush_frames_ >= flush_interval_frames) {
    flushRecordFile();
  }
}

bool Recorder::startRecording(uint32_t now_ms, const char* requested_file) {
#if HAPTICS_DEBUG_DISABLE_STORAGE
  (void)now_ms;
  (void)requested_file;
  return false;
#else
  if (!mountFilesystem()) {
    return false;
  }

  closeRecordFile();
  LittleFS.mkdir(params_.recorder.record_dir);

  char path[96]{};
  if (requested_file != nullptr && requested_file[0] != '\0') {
    if (requested_file[0] == '/') {
      std::snprintf(path, sizeof(path), "%s", requested_file);
    } else {
      std::snprintf(path, sizeof(path), "%s/%s", params_.recorder.record_dir, requested_file);
    }
  } else {
    std::snprintf(path, sizeof(path), "%s/rec_%lu.ndjson", params_.recorder.record_dir, static_cast<unsigned long>(now_ms));
  }

  File file = LittleFS.open(path, "w");
  if (!file) {
    return false;
  }
  file.close();

  status_.recording = true;
  status_.replaying = false;
  status_.recorded_frames = 0;
  pending_flush_frames_ = 0;
  updateStatusPath(path);
  if (!openRecordFile()) {
    status_.recording = false;
    updateStatusPath(nullptr);
    return false;
  }
  return true;
#endif
}

void Recorder::stopRecording() {
  closeRecordFile();
  status_.recording = false;
}

bool Recorder::loadNextReplaySample() {
#if HAPTICS_DEBUG_DISABLE_STORAGE
  return false;
#else
  if (!status_.replaying || status_.active_file[0] == '\0') {
    return false;
  }

  File file = LittleFS.open(status_.active_file, "r");
  if (!file) {
    return false;
  }

  uint32_t lines_to_skip = status_.replay_index + (replay_sample_ready_ ? 1u : 0u);
  while (lines_to_skip > 0 && file.available()) {
    file.readStringUntil('\n');
    --lines_to_skip;
  }

  while (file.available()) {
    const String line = file.readStringUntil('\n');
    StaticJsonDocument<1024> doc;
    if (deserializeJson(doc, line) != DeserializationError::Ok) {
      continue;
    }

    next_replay_timestamp_ms_ = doc["timestamp_ms"] | 0u;
    next_replay_sample_ = {};
    next_replay_sample_.timestamp_us = next_replay_timestamp_ms_ * 1000u;
    next_replay_sample_.valid = doc["imu"]["valid"] | true;
    if (doc["imu"]["accel_g"].is<JsonArrayConst>()) {
      JsonArrayConst accel = doc["imu"]["accel_g"].as<JsonArrayConst>();
      if (accel.size() >= 3) {
        next_replay_sample_.accel_g.x = accel[0].as<float>();
        next_replay_sample_.accel_g.y = accel[1].as<float>();
        next_replay_sample_.accel_g.z = accel[2].as<float>();
      }
    }
    if (doc["imu"]["gyro_dps"].is<JsonArrayConst>()) {
      JsonArrayConst gyro = doc["imu"]["gyro_dps"].as<JsonArrayConst>();
      if (gyro.size() >= 3) {
        next_replay_sample_.gyro_dps.x = gyro[0].as<float>();
        next_replay_sample_.gyro_dps.y = gyro[1].as<float>();
        next_replay_sample_.gyro_dps.z = gyro[2].as<float>();
      }
    }
    file.close();
    replay_sample_ready_ = true;
    return true;
  }

  file.close();
  replay_sample_ready_ = false;
  return false;
#endif
}

bool Recorder::startReplay(const char* requested_file, uint32_t now_ms) {
#if HAPTICS_DEBUG_DISABLE_STORAGE
  (void)requested_file;
  (void)now_ms;
  return false;
#else
  if (!mountFilesystem() || requested_file == nullptr || requested_file[0] == '\0') {
    return false;
  }

  closeRecordFile();
  char path[96]{};
  if (requested_file[0] == '/') {
    std::snprintf(path, sizeof(path), "%s", requested_file);
  } else {
    std::snprintf(path, sizeof(path), "%s/%s", params_.recorder.record_dir, requested_file);
  }
  if (!LittleFS.exists(path)) {
    return false;
  }

  status_.replaying = true;
  status_.recording = false;
  status_.replay_index = 0;
  replay_start_ms_ = now_ms;
  first_replay_timestamp_ms_ = 0;
  last_replay_timestamp_ms_ = 0;
  replay_sample_ready_ = false;
  updateStatusPath(path);
  return loadNextReplaySample();
#endif
}

void Recorder::stopReplay() {
  status_.replaying = false;
  status_.replay_index = 0;
  replay_sample_ready_ = false;
}

bool Recorder::pollReplay(uint32_t now_ms, ImuSample& sample, float& dt_s) {
  if (!status_.replaying) {
    return false;
  }

  if (!replay_sample_ready_ && !loadNextReplaySample()) {
    stopReplay();
    return false;
  }

  if (first_replay_timestamp_ms_ == 0) {
    first_replay_timestamp_ms_ = next_replay_timestamp_ms_;
  }

  const uint32_t elapsed_target_ms = next_replay_timestamp_ms_ - first_replay_timestamp_ms_;
  if (now_ms - replay_start_ms_ < elapsed_target_ms) {
    return false;
  }

  sample = next_replay_sample_;
  if (last_replay_timestamp_ms_ == 0) {
    dt_s = 0.004f;
  } else {
    dt_s = std::max(0.001f, (next_replay_timestamp_ms_ - last_replay_timestamp_ms_) * 1.0e-3f);
  }
  last_replay_timestamp_ms_ = next_replay_timestamp_ms_;
  ++status_.replay_index;
  replay_sample_ready_ = false;

  if (!loadNextReplaySample()) {
    stopReplay();
  }

  return true;
}

}  // namespace haptics
