#include <Arduino.h>
#include <M5Unified.h>

#include "haptics/HapticPipeline.hpp"
#include "haptics/Parameters.hpp"

using haptics::AudioOutputLayout;
using haptics::HapticPipeline;
using haptics::makeDefaultLiquidPreset;

namespace {

constexpr uint32_t kStageHoldMs = 1800;

HapticPipeline g_pipeline;
uint32_t g_last_ui_ms = 0;

void drawStage(const char* title, const char* detail = nullptr) {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 10);
  M5.Display.println("DISPLAY");
  M5.Display.println("PROBE");
  M5.Display.setTextSize(1);
  M5.Display.setCursor(8, 58);
  M5.Display.println(title);
  if (detail != nullptr) {
    M5.Display.setCursor(8, 74);
    M5.Display.println(detail);
  }
  M5.Display.endWrite();
}

void drawRuntimeStatus() {
  const auto& telemetry = g_pipeline.telemetry();
  const auto& params = g_pipeline.params();

  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 10);
  M5.Display.println("DISPLAY");
  M5.Display.println("PROBE");
  M5.Display.setTextSize(1);
  M5.Display.printf("preset: %s\n", telemetry.active_preset[0] ? telemetry.active_preset : "-");
  M5.Display.printf("audio: %s %s\n", telemetry.audio.runtime_enabled ? "on" : "off",
                    telemetry.audio.output_layout == AudioOutputLayout::FrontBack2Ch ? "2ch" : "4ch");
  M5.Display.printf("diag:  %s\n", telemetry.audio.demo_compat_mode ? "on" : "off");
  M5.Display.printf("evt:   %u\n", static_cast<unsigned>(telemetry.last_event.type));
  M5.Display.printf("E:     %.3f\n", telemetry.mass.energy);
  M5.Display.printf("ch:    %.2f %.2f\n", telemetry.actuators.ch[0], telemetry.actuators.ch[1]);
  M5.Display.printf("       %.2f %.2f\n", telemetry.actuators.ch[2], telemetry.actuators.ch[3]);
  M5.Display.printf("disp:  %u\n", static_cast<unsigned>(params.features.enable_debug_display));
  M5.Display.endWrite();
}

void holdStage(const char* title, const char* detail = nullptr) {
  drawStage(title, detail);
  delay(kStageHoldMs);
}

}  // namespace

void setup() {
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
  holdStage("M5.begin ok");

  Serial.begin(115200);
  delay(100);
  Serial.println();
  Serial.println("display probe: serial ready");

  const bool imu_ready = M5.Imu.begin(&M5.In_I2C, M5.getBoard());
  Serial.printf("display probe: imu=%u\n", static_cast<unsigned>(imu_ready));
  holdStage("IMU begin", imu_ready ? "ok" : "failed");

  M5.Power.setExtOutput(true);
  Serial.println("display probe: ext_5v enabled");
  holdStage("EXT_5V on");

  auto params = makeDefaultLiquidPreset();
  params.audio.output_layout = AudioOutputLayout::FrontBack2Ch;
  params.audio.demo_compat_mode = true;
  params.features.enable_debug_display = true;
  g_pipeline.begin(params);
  Serial.println("display probe: pipeline begin");
  holdStage("pipeline begin", "done");

  drawRuntimeStatus();
}

void loop() {
  M5.update();
  g_pipeline.tick();
  const uint32_t now = millis();
  if (now - g_last_ui_ms >= 150u) {
    g_last_ui_ms = now;
    drawRuntimeStatus();
  }
  delay(1);
}
