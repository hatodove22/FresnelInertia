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

constexpr uint32_t kStageHoldMs = 900;
constexpr uint32_t kRefreshMs = 150;

HapticPipeline g_pipeline;
bool g_imu_ready = false;
bool g_ext_5v_enabled = false;
bool g_pipeline_ready = false;
bool g_serial_ready = false;
uint32_t g_heartbeat = 0;
uint32_t g_last_draw_ms = 0;

void holdStage(const char* title, const char* detail = nullptr) {
  if (g_serial_ready) {
    Serial.printf("pipeline-probe: %s%s%s\n", title, detail != nullptr ? " / " : "", detail != nullptr ? detail : "");
    Serial.flush();
  }
  drawStage("PIPE PROBE", title, detail);
  delay(kStageHoldMs);
}

}  // namespace

void setup() {
  static_assert(HAPTICS_DEBUG_DISABLE_STORAGE != 0, "main-pipeline-probe expects storage disabled");
  static_assert(HAPTICS_DEBUG_DIRECT_TEXT_DISPLAY != 0, "main-pipeline-probe expects direct text display");

  beginStickS3Display();
  holdStage("M5.begin ok");
  Serial.begin(115200);
  delay(100);
  g_serial_ready = true;
  g_imu_ready = M5.Imu.begin(&M5.In_I2C, M5.getBoard());
  holdStage("IMU begin", g_imu_ready ? "ok" : "failed");
  M5.Power.setExtOutput(true);
  g_ext_5v_enabled = true;
  holdStage("EXT_5V on");

  auto params = makeProbeParams(false);
  g_pipeline_ready = g_pipeline.begin(params);
  holdStage("pipeline begin", g_pipeline_ready ? "done" : "failed");
  Serial.println("pipeline-probe: status page");
  Serial.flush();
  drawTelemetryPage("PIPE PROBE", g_pipeline.telemetry(), g_pipeline.params(), g_heartbeat,
                    g_pipeline_ready ? "tick:off" : "pipeline failed");
}

void loop() {
  M5.update();
  const uint32_t now = millis();
  if (now - g_last_draw_ms >= kRefreshMs) {
    g_last_draw_ms = now;
    ++g_heartbeat;
    drawTelemetryPage("PIPE PROBE", g_pipeline.telemetry(), g_pipeline.params(), g_heartbeat,
                      g_pipeline_ready ? "tick:off" : "pipeline failed");
  }
  delay(1);
}
