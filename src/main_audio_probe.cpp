#include <Arduino.h>
#include <M5Unified.h>

#include "haptics/DebugFlags.hpp"
#include "haptics/DebugProbeSupport.hpp"
#include "haptics/HapticPipeline.hpp"

using haptics::HapticPipeline;
using haptics::debug::SyntheticStimulusMode;
using haptics::debug::applySyntheticPreset;
using haptics::debug::beginStickS3Display;
using haptics::debug::drawStage;
using haptics::debug::drawTelemetryPage;
using haptics::debug::makeProbeParams;
using haptics::debug::makeSyntheticStimulus;
using haptics::debug::stimulusModeToString;

namespace {

constexpr uint32_t kStageHoldMs = 1500;
constexpr uint32_t kRefreshMs = 120;

HapticPipeline g_pipeline;
SyntheticStimulusMode g_mode = SyntheticStimulusMode::Liquid;
uint32_t g_last_draw_ms = 0;
uint32_t g_heartbeat = 0;
uint32_t g_last_sample_us = 0;
bool g_serial_ready = false;
bool g_audio_running = false;
bool g_audio_enabled = false;

void holdStage(const char* title, const char* detail = nullptr) {
  if (g_serial_ready) {
    Serial.printf("audio-probe: %s%s%s\n", title, detail != nullptr ? " / " : "",
                  detail != nullptr ? detail : "");
    Serial.flush();
  }
  drawStage("AUDIO PROBE", title, detail);
  delay(kStageHoldMs);
}

void loadModePreset(SyntheticStimulusMode mode) {
  switch (mode) {
    case SyntheticStimulusMode::Granular:
      g_pipeline.handleConsoleCommand("preset load granular_coin_box");
      break;
    case SyntheticStimulusMode::Hybrid:
      g_pipeline.handleConsoleCommand("preset load hybrid_ice_water");
      break;
    case SyntheticStimulusMode::Liquid:
    default:
      g_pipeline.handleConsoleCommand("preset load liquid_small_box");
      break;
  }
}

SyntheticStimulusMode nextMode(SyntheticStimulusMode mode) {
  switch (mode) {
    case SyntheticStimulusMode::Liquid:
      return SyntheticStimulusMode::Granular;
    case SyntheticStimulusMode::Granular:
      return SyntheticStimulusMode::Hybrid;
    case SyntheticStimulusMode::Hybrid:
    default:
      return SyntheticStimulusMode::Liquid;
  }
}

}  // namespace

void setup() {
  static_assert(HAPTICS_DEBUG_DISABLE_STORAGE != 0, "main-audio-probe expects storage disabled");
  static_assert(HAPTICS_DEBUG_DIRECT_TEXT_DISPLAY != 0, "main-audio-probe expects direct text display");
  static_assert(HAPTICS_DEBUG_FORCE_AUDIO_ON != 0, "main-audio-probe expects forced audio");
  static_assert(HAPTICS_DEBUG_SYNTHETIC_STIMULUS != 0, "main-audio-probe expects synthetic stimulus");

  beginStickS3Display();
  holdStage("M5.begin ok");
  Serial.begin(115200);
  delay(100);
  g_serial_ready = true;
  const bool imu_ready = M5.Imu.begin(&M5.In_I2C, M5.getBoard());
  holdStage("IMU begin", imu_ready ? "ok" : "failed");
  M5.Power.setExtOutput(true);
  holdStage("EXT_5V on");

  auto params = makeProbeParams(false);
  applySyntheticPreset(params, g_mode);
  params.audio.output_gain = 2.10f;
  params.features.enable_audio_output = false;
  params.audio.runtime_enable = false;
  g_pipeline.begin(params);
  holdStage("pipeline begin", "audio off");
  g_last_sample_us = micros();
  drawStage("AUDIO PROBE", "phase:idle", stimulusModeToString(g_mode));
}

void loop() {
  M5.update();

  if (M5.BtnA.wasClicked()) {
    g_mode = nextMode(g_mode);
    loadModePreset(g_mode);
    drawStage("AUDIO PROBE", "mode", stimulusModeToString(g_mode));
    delay(700);
  }
  if (M5.BtnB.wasClicked()) {
    g_pipeline.toggleAudioRuntimeEnable();
    g_audio_enabled = !g_audio_enabled;
    g_audio_running = g_audio_enabled;
    g_last_sample_us = micros();
    drawStage("AUDIO PROBE", g_audio_enabled ? "audio:on" : "audio:off", stimulusModeToString(g_mode));
    delay(700);
  }

  const uint32_t now_us = micros();
  const uint32_t now_ms = millis();
  if (g_audio_running) {
    float dt_s = (now_us - g_last_sample_us) * 1.0e-6f;
    if (dt_s <= 0.0f || dt_s > 0.030f) {
      dt_s = 0.004f;
    }
    g_last_sample_us = now_us;
    const auto sample = makeSyntheticStimulus(g_mode, now_us);
    g_pipeline.processSample(sample, dt_s);
  }

  if (now_ms - g_last_draw_ms >= kRefreshMs) {
    g_last_draw_ms = now_ms;
    ++g_heartbeat;
    drawTelemetryPage("AUDIO PROBE", g_pipeline.telemetry(), g_pipeline.params(), g_heartbeat,
                      g_audio_running ? stimulusModeToString(g_mode) : "idle");
  }

  delay(1);
}
