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

constexpr uint32_t kStageHoldMs = 1500;
constexpr uint32_t kRefreshMs = 150;
constexpr uint32_t kStaticPhaseMs = 3000;
constexpr uint32_t kRedrawPhaseMs = 5000;
constexpr uint32_t kUpdatePhaseMs = 5000;

HapticPipeline g_pipeline;
bool g_pipeline_ready = false;
bool g_serial_ready = false;
uint32_t g_heartbeat = 0;
uint32_t g_last_draw_ms = 0;
uint32_t g_phase_start_ms = 0;

enum class LoopProbePhase : uint8_t {
  StaticHold = 0,
  RedrawOnly,
  UpdateOnly,
  TickEnabled,
};

LoopProbePhase g_phase = LoopProbePhase::StaticHold;

const char* phaseName(LoopProbePhase phase) {
  switch (phase) {
    case LoopProbePhase::StaticHold:
      return "phase:static";
    case LoopProbePhase::RedrawOnly:
      return "phase:redraw";
    case LoopProbePhase::UpdateOnly:
      return "phase:update";
    case LoopProbePhase::TickEnabled:
      return "phase:tick";
  }
  return "phase:unknown";
}

void drawPhaseStatus(const char* detail = nullptr) {
  drawStage("LOOP PROBE", phaseName(g_phase), detail);
}

void holdStage(const char* title, const char* detail = nullptr) {
  if (g_serial_ready) {
    Serial.printf("loop-probe: %s%s%s\n", title, detail != nullptr ? " / " : "",
                  detail != nullptr ? detail : "");
    Serial.flush();
  }
  drawStage("LOOP PROBE", title, detail);
  delay(kStageHoldMs);
}

void advancePhase(uint32_t now_ms) {
  const uint32_t elapsed_ms = now_ms - g_phase_start_ms;
  switch (g_phase) {
    case LoopProbePhase::StaticHold:
      if (elapsed_ms >= kStaticPhaseMs) {
        g_phase = LoopProbePhase::RedrawOnly;
        g_phase_start_ms = now_ms;
        drawPhaseStatus("redraw only");
      }
      break;
    case LoopProbePhase::RedrawOnly:
      if (elapsed_ms >= kRedrawPhaseMs) {
        g_phase = LoopProbePhase::UpdateOnly;
        g_phase_start_ms = now_ms;
        drawPhaseStatus("M5.update enabled");
      }
      break;
    case LoopProbePhase::UpdateOnly:
      if (elapsed_ms >= kUpdatePhaseMs) {
        g_phase = LoopProbePhase::TickEnabled;
        g_phase_start_ms = now_ms;
        drawPhaseStatus("tick enabled");
      }
      break;
    case LoopProbePhase::TickEnabled:
      break;
  }
}

}  // namespace

void setup() {
  static_assert(HAPTICS_DEBUG_DISABLE_STORAGE != 0, "main-loop-probe expects storage disabled");
  static_assert(HAPTICS_DEBUG_DIRECT_TEXT_DISPLAY != 0, "main-loop-probe expects direct text display");

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
  g_pipeline_ready = g_pipeline.begin(params);
  holdStage("pipeline begin", g_pipeline_ready ? "done" : "failed");
  g_phase_start_ms = millis();
  holdStage("loop static", "about to enter loop");
  drawPhaseStatus("static hold");
}

void loop() {
  const uint32_t now = millis();
  advancePhase(now);

  if (g_phase == LoopProbePhase::UpdateOnly || g_phase == LoopProbePhase::TickEnabled) {
    M5.update();
    if (M5.BtnA.wasClicked()) {
      g_pipeline.cyclePreset();
    }
  }

  if (g_phase == LoopProbePhase::TickEnabled && g_pipeline_ready) {
    g_pipeline.tick();
  }

  if (g_phase != LoopProbePhase::StaticHold && (now - g_last_draw_ms >= kRefreshMs)) {
    g_last_draw_ms = now;
    ++g_heartbeat;
    if (g_phase == LoopProbePhase::TickEnabled) {
      drawTelemetryPage("LOOP PROBE", g_pipeline.telemetry(), g_pipeline.params(), g_heartbeat,
                        g_pipeline_ready ? "audio:forced off" : "pipeline failed");
    } else if (g_phase == LoopProbePhase::UpdateOnly) {
      drawPhaseStatus("M5.update enabled");
    } else {
      drawPhaseStatus("redraw only");
    }
  }
  delay(1);
}
