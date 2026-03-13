#include "haptics/Recorder.hpp"

#include <ArduinoJson.h>
#include <LittleFS.h>

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

}  // namespace

bool Recorder::begin(const SystemParams& params) {
  params_ = params;
  status_ = {};
  status_.enabled = params.features.enable_recorder;
  mounted_ = mountFilesystem();
  return true;
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
  if (!mounted_) {
    mounted_ = LittleFS.begin(false);
  }
  return mounted_;
}

void Recorder::append(const TelemetrySnapshot& snapshot) {
  if (!status_.recording || !mountFilesystem()) {
    return;
  }

  File file = LittleFS.open(status_.active_file, FILE_APPEND);
  if (!file) {
    return;
  }

  StaticJsonDocument<1536> doc;
  doc["timestamp_ms"] = snapshot.timestamp_ms;
  doc["preset"] = snapshot.active_preset;

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

  JsonObject audio = doc.createNestedObject("audio");
  audio["compile_enabled"] = snapshot.audio.compile_enabled;
  audio["runtime_enabled"] = snapshot.audio.runtime_enabled;
  audio["test_mode"] = snapshot.audio.test_mode;
  audio["test_wall"] = wallToString(snapshot.audio.test_wall);
  audio["underrun_count"] = snapshot.audio.underrun_count;

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

  serializeJson(doc, file);
  file.println();
  file.close();

  ++status_.recorded_frames;
}

bool Recorder::startRecording(uint32_t now_ms, const char* requested_file) {
  if (!mountFilesystem()) {
    return false;
  }

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
  updateStatusPath(path);
  return true;
}

void Recorder::stopRecording() {
  status_.recording = false;
}

bool Recorder::loadNextReplaySample() {
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
}

bool Recorder::startReplay(const char* requested_file, uint32_t now_ms) {
  if (!mountFilesystem() || requested_file == nullptr || requested_file[0] == '\0') {
    return false;
  }

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
