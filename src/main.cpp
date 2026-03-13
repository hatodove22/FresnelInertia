#include <Arduino.h>
#include <M5Unified.h>

#include "haptics/HapticPipeline.hpp"
#include "haptics/Parameters.hpp"

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
  M5.begin(cfg);
  Serial.begin(115200);
  delay(100);

  auto params = makeDefaultLiquidPreset();
  if (params.pins.use_ext_5v_output) {
    M5.Power.setExtOutput(true);
  }

  g_pipeline.begin(params);

  Serial.println();
  Serial.println("Parametric Container Haptics scaffold started.");
  Serial.println("BtnA click: cycle presets | BtnA hold: cycle audio test wall");
  Serial.println("BtnB click: toggle verbose serial | BtnB hold: toggle audio runtime");
  Serial.println("Console: cal/preset/record/replay/tilt commands available");
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
