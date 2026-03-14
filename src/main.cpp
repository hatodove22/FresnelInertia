#include <Arduino.h>
#include <M5Unified.h>

#include "haptics/HapticPipeline.hpp"
#include "haptics/Parameters.hpp"

#ifndef HAPTICS_SINGLE_AMP_BENCH_DEFAULTS
#define HAPTICS_SINGLE_AMP_BENCH_DEFAULTS 0
#endif

#ifndef HAPTICS_MAIN_MONITORING_DEFAULTS
#define HAPTICS_MAIN_MONITORING_DEFAULTS 0
#endif

using haptics::HapticPipeline;
using haptics::makeDefaultLiquidPreset;

namespace {

HapticPipeline g_pipeline;
char g_console_buffer[64]{};
size_t g_console_len = 0;

void pollConsole() {
  while (Serial.available() > 0) {
    const int raw = Serial.read();
    if (raw < 0) {
      return;
    }

    const char ch = static_cast<char>(raw);
    if (ch == '\r' || ch == '\n') {
      if (g_console_len > 0) {
        g_console_buffer[g_console_len] = '\0';
        g_pipeline.handleConsoleCommand(g_console_buffer);
        g_console_len = 0;
      }
      continue;
    }

    if (g_console_len + 1 < sizeof(g_console_buffer)) {
      g_console_buffer[g_console_len++] = ch;
    }
  }
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

  Serial.begin(115200);
  delay(100);

  const bool imu_ready = M5.Imu.begin(&M5.In_I2C, M5.getBoard());
  Serial.printf("imu: init=%u\n", static_cast<unsigned>(imu_ready));

  auto params = makeDefaultLiquidPreset();
  params.features.enable_debug_display = false;

#if HAPTICS_SINGLE_AMP_BENCH_DEFAULTS
  // Keep the main audio firmware aligned with the known-good single MAX98357A bench.
  params.audio.output_layout = haptics::AudioOutputLayout::FrontBack2Ch;
  params.audio.demo_compat_mode = true;
  params.audio.output_gain = 2.10f;
#endif

#if HAPTICS_MAIN_MONITORING_DEFAULTS
  params.features.enable_remote_interface = true;
  params.iface.wifi_mode_ap = true;
  params.iface.http_port = 80;
  params.iface.telemetry_period_ms = 125;
#endif

  if (params.pins.use_ext_5v_output) {
    M5.Power.setExtOutput(true);
    Serial.println("power: EXT_5V on");
  }

  g_pipeline.begin(params);

  Serial.println();
  Serial.println("Parametric Container Haptics scaffold started.");
  Serial.println("BtnA click: cycle presets | BtnA hold: cycle audio test wall");
  Serial.println("BtnB click: toggle verbose serial | BtnB hold: toggle audio runtime");
  Serial.println("Console: status, cal/preset/record/replay/tilt/audio/remote commands available");
#if HAPTICS_MAIN_MONITORING_DEFAULTS
  Serial.println("Monitoring: USB serial + SoftAP HTTP status page");
#endif
}

void loop() {
  M5.update();
  pollConsole();

  if (M5.BtnA.wasHold()) {
    g_pipeline.cycleAudioTestMode();
  } else if (M5.BtnA.wasClicked()) {
    g_pipeline.cyclePreset();
  }
  if (M5.BtnB.wasHold()) {
    g_pipeline.toggleAudioRuntimeEnable();
  } else if (M5.BtnB.wasClicked()) {
    g_pipeline.toggleVerbose();
  }

  g_pipeline.tick();
  delay(1);
}
