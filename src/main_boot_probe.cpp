#include <Arduino.h>
#include <M5Unified.h>

#include "haptics/DebugFlags.hpp"
#include "haptics/DebugProbeSupport.hpp"

using haptics::debug::beginStickS3Display;
using haptics::debug::drawBootStatusPage;
using haptics::debug::drawStage;

namespace {

constexpr uint32_t kStageHoldMs = 900;
constexpr uint32_t kRefreshMs = 150;

bool g_imu_ready = false;
bool g_ext_5v_enabled = false;
uint32_t g_heartbeat = 0;
uint32_t g_last_draw_ms = 0;

void holdStage(const char* title, const char* detail = nullptr) {
  drawStage("BOOT PROBE", title, detail);
  delay(kStageHoldMs);
}

}  // namespace

void setup() {
  static_assert(HAPTICS_DEBUG_DISABLE_STORAGE != 0, "main-boot-probe expects storage disabled");
  static_assert(HAPTICS_DEBUG_DIRECT_TEXT_DISPLAY != 0, "main-boot-probe expects direct text display");

  beginStickS3Display();
  holdStage("M5.begin ok");
  Serial.begin(115200);
  delay(100);
  g_imu_ready = M5.Imu.begin(&M5.In_I2C, M5.getBoard());
  holdStage("IMU begin", g_imu_ready ? "ok" : "failed");
  M5.Power.setExtOutput(true);
  g_ext_5v_enabled = true;
  holdStage("EXT_5V on");
  drawBootStatusPage("BOOT PROBE", g_imu_ready, g_ext_5v_enabled, false, g_heartbeat, "screen-only");
}

void loop() {
  M5.update();
  const uint32_t now = millis();
  if (now - g_last_draw_ms >= kRefreshMs) {
    g_last_draw_ms = now;
    ++g_heartbeat;
    drawBootStatusPage("BOOT PROBE", g_imu_ready, g_ext_5v_enabled, false, g_heartbeat, "screen-only");
  }
  delay(1);
}
