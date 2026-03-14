#pragma once

#include <Arduino.h>
#include <M5Unified.h>

#include <cmath>
#include <cstring>

#include "haptics/DebugFlags.hpp"
#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics::debug {

enum class SyntheticStimulusMode : uint8_t {
  Liquid = 0,
  Granular = 1,
  Hybrid = 2,
};

inline const char* runModeToString(RunMode mode) {
  switch (mode) {
    case RunMode::Idle:
      return "idle";
    case RunMode::Live:
      return "live";
    case RunMode::Calibration:
      return "cal";
    case RunMode::Record:
      return "rec";
    case RunMode::Replay:
      return "rpl";
    default:
      return "?";
  }
}

inline const char* eventTypeToString(EventType type) {
  switch (type) {
    case EventType::WallHit:
      return "wall";
    case EventType::RollTrain:
      return "roll";
    case EventType::ImpactCluster:
      return "impact";
    case EventType::DropletCluster:
      return "drop";
    case EventType::RoofSlap:
      return "roof";
    case EventType::Scrape:
      return "scrape";
    case EventType::None:
    default:
      return "-";
  }
}

inline const char* wallToString(WallId wall) {
  switch (wall) {
    case WallId::Front:
      return "F";
    case WallId::Back:
      return "B";
    case WallId::Top:
      return "T";
    case WallId::Bottom:
      return "D";
    case WallId::None:
    default:
      return "-";
  }
}

inline const char* layoutToString(AudioOutputLayout layout) {
  return layout == AudioOutputLayout::FrontBack2Ch ? "2ch" : "4ch";
}

inline const char* stimulusModeToString(SyntheticStimulusMode mode) {
  switch (mode) {
    case SyntheticStimulusMode::Liquid:
      return "liquid";
    case SyntheticStimulusMode::Granular:
      return "granular";
    case SyntheticStimulusMode::Hybrid:
      return "hybrid";
    default:
      return "?";
  }
}

inline void beginStickS3Display() {
  auto cfg = M5.config();
  cfg.fallback_board = m5::board_t::board_M5StickS3;
  cfg.internal_imu = false;
  cfg.internal_rtc = false;
  cfg.internal_mic = false;
  cfg.output_power = false;
  M5.begin(cfg);
  M5.Display.wakeup();
  M5.Display.setBrightness(255);
  M5.Display.setRotation(0);
}

inline void drawStage(const char* header, const char* title, const char* detail = nullptr) {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 8);
  M5.Display.println(header);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(8, 48);
  M5.Display.println(title);
  if (detail != nullptr) {
    M5.Display.setCursor(8, 64);
    M5.Display.println(detail);
  }
  M5.Display.endWrite();
}

inline void drawTelemetryPage(const char* header,
                              const TelemetrySnapshot& telemetry,
                              const SystemParams& params,
                              uint32_t heartbeat,
                              const char* extra = nullptr) {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(4, 4);
  M5.Display.println(header);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(4, 34);
  M5.Display.printf("hb:%lu mode:%s\n", static_cast<unsigned long>(heartbeat), runModeToString(telemetry.run_mode));
  M5.Display.printf("preset:%s\n", telemetry.active_preset[0] ? telemetry.active_preset : params.preset_name);
  M5.Display.printf("evt:%s%s E:%.3f\n", eventTypeToString(telemetry.last_event.type),
                    wallToString(telemetry.last_event.primary_wall), telemetry.mass.energy);
  M5.Display.printf("audio:%s %s diag:%s\n", telemetry.audio.runtime_enabled ? "on" : "off",
                    layoutToString(params.audio.output_layout), params.audio.demo_compat_mode ? "on" : "off");
  M5.Display.printf("gain:%.2f und:%lu\n", params.audio.output_gain,
                    static_cast<unsigned long>(telemetry.audio.underrun_count));
  M5.Display.printf("ch:%.2f %.2f %.2f %.2f\n", telemetry.actuators.ch[0], telemetry.actuators.ch[1],
                    telemetry.actuators.ch[2], telemetry.actuators.ch[3]);
  M5.Display.printf("pos:%+.2f %+.2f\n", telemetry.mass.pos_norm.x, telemetry.mass.pos_norm.y);
  if (extra != nullptr) {
    M5.Display.println(extra);
  }
  M5.Display.endWrite();
}

inline void drawBootStatusPage(const char* header,
                               bool imu_ready,
                               bool ext_5v_enabled,
                               bool pipeline_ready,
                               uint32_t heartbeat,
                               const char* extra = nullptr) {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(4, 4);
  M5.Display.println(header);
  M5.Display.setTextSize(1);
  M5.Display.setCursor(4, 34);
  M5.Display.printf("hb:%lu\n", static_cast<unsigned long>(heartbeat));
  M5.Display.printf("imu:%s\n", imu_ready ? "ok" : "fail");
  M5.Display.printf("ext_5v:%s\n", ext_5v_enabled ? "on" : "off");
  M5.Display.printf("pipeline:%s\n", pipeline_ready ? "ready" : "off");
  if (extra != nullptr) {
    M5.Display.println(extra);
  }
  M5.Display.endWrite();
}

inline SystemParams makeProbeParams(bool enable_audio) {
  SystemParams params = makeDefaultLiquidPreset();
  params.features.enable_verbose_serial = false;
  params.features.enable_debug_display = false;
  params.features.enable_remote_interface = false;
  params.features.enable_recorder = false;
  params.features.enable_runtime_calibration = false;
  params.features.enable_tilt_plane = false;
  params.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
  params.audio.demo_compat_mode = true;
  params.audio.output_gain = enable_audio ? 2.10f : 1.0f;
  params.features.enable_audio_output = enable_audio || (HAPTICS_DEBUG_FORCE_AUDIO_ON != 0);
  params.audio.runtime_enable = enable_audio || (HAPTICS_DEBUG_FORCE_AUDIO_ON != 0);
  params.audio.channel_test_enable = false;
  params.audio.channel_test_wall = WallId::None;
  return params;
}

inline void applySyntheticPreset(SystemParams& params, SyntheticStimulusMode mode) {
  switch (mode) {
    case SyntheticStimulusMode::Granular:
      params = makeDefaultGranularPreset();
      break;
    case SyntheticStimulusMode::Hybrid:
      params = makeDefaultHybridPreset();
      break;
    case SyntheticStimulusMode::Liquid:
    default:
      params = makeDefaultLiquidPreset();
      break;
  }
  params.features.enable_verbose_serial = false;
  params.features.enable_debug_display = false;
  params.features.enable_remote_interface = false;
  params.features.enable_recorder = false;
  params.features.enable_runtime_calibration = false;
  params.features.enable_tilt_plane = false;
  params.features.enable_audio_output = true;
  params.audio.runtime_enable = true;
  params.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
  params.audio.demo_compat_mode = true;
  params.audio.output_gain = 2.10f;
}

inline ImuSample makeSyntheticStimulus(SyntheticStimulusMode mode, uint32_t now_us) {
  ImuSample sample{};
  sample.timestamp_us = now_us;
  sample.valid = HAPTICS_DEBUG_SYNTHETIC_STIMULUS != 0;
  if (!sample.valid) {
    return sample;
  }

  constexpr float kTwoPi = 6.28318530717958647692f;
  const float t = now_us * 1.0e-6f;
  const float liquid_phase = std::fmod(t, 1.35f) / 1.35f;
  const float granular_phase = std::fmod(t, 0.46f) / 0.46f;
  const float hybrid_phase = std::fmod(t, 0.74f) / 0.74f;

  switch (mode) {
    case SyntheticStimulusMode::Granular: {
      const float tap = granular_phase < 0.16f ? 1.0f - granular_phase / 0.16f : 0.0f;
      const float dir = (static_cast<int>(t / 0.46f) % 2 == 0) ? 1.0f : -1.0f;
      sample.accel_g.x = dir * (1.55f * tap + 0.28f * std::sin(kTwoPi * 3.4f * t));
      sample.accel_g.y = 0.52f * std::sin(kTwoPi * 4.8f * t) + 0.24f * tap;
      sample.gyro_dps.x = 42.0f * std::sin(kTwoPi * 3.2f * t);
      sample.gyro_dps.y = dir * (78.0f * tap + 18.0f * std::sin(kTwoPi * 5.1f * t));
      break;
    }
    case SyntheticStimulusMode::Hybrid: {
      const float surge = hybrid_phase < 0.22f ? 1.0f - hybrid_phase / 0.22f : 0.0f;
      sample.accel_g.x = 0.92f * std::sin(kTwoPi * 0.95f * t) + 0.82f * surge;
      sample.accel_g.y = 0.64f * std::sin(kTwoPi * 1.55f * t + 0.7f) + 0.18f * surge;
      sample.gyro_dps.x = 28.0f * std::sin(kTwoPi * 1.20f * t);
      sample.gyro_dps.y = 44.0f * std::sin(kTwoPi * 2.10f * t) + 22.0f * surge;
      break;
    }
    case SyntheticStimulusMode::Liquid:
    default: {
      const float surge = liquid_phase < 0.34f ? 1.0f - liquid_phase / 0.34f : 0.0f;
      sample.accel_g.x = 1.42f * std::sin(kTwoPi * 0.92f * t) + 0.95f * surge;
      sample.accel_g.y = 0.68f * std::sin(kTwoPi * 1.85f * t + 0.5f) + 0.42f * surge;
      sample.gyro_dps.x = 30.0f * std::sin(kTwoPi * 0.96f * t + 0.3f);
      sample.gyro_dps.y = 48.0f * std::sin(kTwoPi * 1.58f * t) + 18.0f * surge;
      break;
    }
  }

  return sample;
}

}  // namespace haptics::debug
