#include <Arduino.h>
#include <M5Unified.h>

#include "haptics/DebugFlags.hpp"
#include "haptics/DebugProbeSupport.hpp"
#include "haptics/HapticPipeline.hpp"

using haptics::HapticPipeline;
using haptics::debug::beginStickS3Display;
using haptics::debug::drawStage;
using haptics::debug::drawTelemetryPage;
using haptics::debug::makeProbeParams;

namespace {

constexpr uint32_t kStageHoldMs = 1200;
constexpr uint32_t kRefreshMs = 120;
constexpr uint32_t kPhaseDurationMs = 5000;

HapticPipeline g_pipeline;
char g_console_buffer[64]{};
size_t g_console_len = 0;
uint32_t g_last_draw_ms = 0;
uint32_t g_heartbeat = 0;
uint32_t g_phase_start_ms = 0;
bool g_serial_ready = false;
bool g_verbose_enabled = false;

enum class DeltaProbePhase : uint8_t {
  StableTick = 0,
  MainButtons,
  PollConsole,
  VerboseSerial,
};

DeltaProbePhase g_phase = DeltaProbePhase::StableTick;

const char* phaseName(DeltaProbePhase phase) {
  switch (phase) {
    case DeltaProbePhase::StableTick:
      return "tick-only";
    case DeltaProbePhase::MainButtons:
      return "main-buttons";
    case DeltaProbePhase::PollConsole:
      return "poll-console";
    case DeltaProbePhase::VerboseSerial:
      return "verbose-serial";
    default:
      return "?";
  }
}

void holdStage(const char* title, const char* detail = nullptr) {
  if (g_serial_ready) {
    Serial.printf("delta-probe: %s%s%s\n", title, detail != nullptr ? " / " : "",
                  detail != nullptr ? detail : "");
    Serial.flush();
  }
  drawStage("DELTA PROBE", title, detail);
  delay(kStageHoldMs);
}

void drawPhasePage(const char* detail = nullptr) {
  drawTelemetryPage("DELTA PROBE", g_pipeline.telemetry(), g_pipeline.params(), g_heartbeat,
                    detail != nullptr ? detail : phaseName(g_phase));
}

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

void advancePhase(uint32_t now_ms) {
  if (now_ms - g_phase_start_ms < kPhaseDurationMs) {
    return;
  }

  switch (g_phase) {
    case DeltaProbePhase::StableTick:
      g_phase = DeltaProbePhase::MainButtons;
      break;
    case DeltaProbePhase::MainButtons:
      g_phase = DeltaProbePhase::PollConsole;
      break;
    case DeltaProbePhase::PollConsole:
      g_phase = DeltaProbePhase::VerboseSerial;
      if (!g_verbose_enabled) {
        g_pipeline.toggleVerbose();
        g_verbose_enabled = true;
      }
      break;
    case DeltaProbePhase::VerboseSerial:
      return;
  }
  g_phase_start_ms = now_ms;
  drawStage("DELTA PROBE", "phase", phaseName(g_phase));
  delay(600);
}

void handleMainButtons() {
  if (M5.BtnA.wasHold()) {
    g_pipeline.cycleAudioTestMode();
  } else if (M5.BtnA.wasClicked()) {
    g_pipeline.cyclePreset();
  }
  if (M5.BtnB.wasHold()) {
    g_pipeline.toggleAudioRuntimeEnable();
  } else if (M5.BtnB.wasClicked()) {
    g_pipeline.toggleVerbose();
    g_verbose_enabled = !g_verbose_enabled;
  }
}

}  // namespace

void setup() {
  static_assert(HAPTICS_DEBUG_DISABLE_STORAGE != 0, "main-delta-probe expects storage disabled");
  static_assert(HAPTICS_DEBUG_DIRECT_TEXT_DISPLAY != 0, "main-delta-probe expects direct text display");

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
  g_pipeline.begin(params);
  holdStage("pipeline begin", "done");
  g_phase_start_ms = millis();
  drawStage("DELTA PROBE", "phase", phaseName(g_phase));
}

void loop() {
  M5.update();

  const uint32_t now_ms = millis();
  advancePhase(now_ms);

  if (g_phase == DeltaProbePhase::MainButtons || g_phase == DeltaProbePhase::PollConsole ||
      g_phase == DeltaProbePhase::VerboseSerial) {
    handleMainButtons();
  }
  if (g_phase == DeltaProbePhase::PollConsole || g_phase == DeltaProbePhase::VerboseSerial) {
    pollConsole();
  }

  g_pipeline.tick();

  if (now_ms - g_last_draw_ms >= kRefreshMs) {
    g_last_draw_ms = now_ms;
    ++g_heartbeat;
    drawPhasePage(phaseName(g_phase));
  }

  delay(1);
}
