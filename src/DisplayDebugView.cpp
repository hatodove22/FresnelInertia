#include "haptics/DisplayDebugView.hpp"

#include <Arduino.h>
#include <M5Unified.h>

#include <cstdio>
#include <cstring>

namespace haptics {
namespace {

constexpr uint32_t kRefreshPeriodMs = 120;

const char* runModeToString(RunMode mode) {
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
      return "replay";
    default:
      return "?";
  }
}

const char* eventTypeToString(EventType type) {
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

const char* wallToString(WallId wall) {
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

const char* audioLayoutToString(AudioOutputLayout layout) {
  switch (layout) {
    case AudioOutputLayout::FrontBack2Ch:
      return "2ch";
    case AudioOutputLayout::QuadWall4Ch:
    default:
      return "4ch";
  }
}

void trimPresetName(const char* source, char* dest, std::size_t size) {
  if (size == 0) {
    return;
  }
  std::snprintf(dest, size, "%s", source != nullptr ? source : "-");
  const std::size_t len = std::strlen(dest);
  if (len <= 16 || size < 4) {
    return;
  }
  dest[13] = '.';
  dest[14] = '.';
  dest[15] = '.';
  dest[16] = '\0';
}

}  // namespace

void DisplayDebugView::begin() {
  if (initialized_) {
    return;
  }
  M5.Display.wakeup();
  M5.Display.setBrightness(255);
  M5.Display.setRotation(0);
  M5.Display.fillScreen(TFT_BLACK);
  initialized_ = true;
}

void DisplayDebugView::showBootBanner() {
  begin();
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_YELLOW, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(6, 10);
  M5.Display.println("DISPLAY");
  M5.Display.println("READY");
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setCursor(6, 58);
  M5.Display.println("boot ok");
  M5.Display.endWrite();
  visible_ = true;
  last_draw_ms_ = millis();
}

void DisplayDebugView::clear() {
  if (!initialized_ || !visible_) {
    return;
  }
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.endWrite();
  visible_ = false;
}

void DisplayDebugView::render(const TelemetrySnapshot& telemetry, const SystemParams& params) {
  if (!params.features.enable_debug_display) {
    clear();
    return;
  }

  if (!initialized_) {
    begin();
  }

  const uint32_t now_ms = millis();
  if (visible_ && now_ms - last_draw_ms_ < kRefreshPeriodMs) {
    return;
  }
  last_draw_ms_ = now_ms;
  visible_ = true;

  char preset_name[20]{};
  trimPresetName(telemetry.active_preset, preset_name, sizeof(preset_name));

  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextSize(1);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setCursor(4, 6);
  M5.Display.printf("preset: %s\n", preset_name);
  M5.Display.printf("mode:   %s\n", runModeToString(telemetry.run_mode));
  M5.Display.printf("evt:    %s%s\n", eventTypeToString(telemetry.last_event.type),
                    wallToString(telemetry.last_event.primary_wall));
  M5.Display.printf("audio:  %s %s\n", telemetry.audio.runtime_enabled ? "on" : "off",
                    audioLayoutToString(telemetry.audio.output_layout));
  M5.Display.printf("diag:   %s\n", telemetry.audio.demo_compat_mode ? "on" : "off");
  M5.Display.printf("gain:   %.2f\n", params.audio.output_gain);
  M5.Display.printf("test:   %s\n", telemetry.audio.test_mode ? wallToString(telemetry.audio.test_wall) : "-");
  M5.Display.printf("cal:    %s\n", telemetry.calibration.active ? wallToString(telemetry.calibration.wall) : "-");
  M5.Display.printf("E:      %.3f\n", telemetry.mass.energy);
  M5.Display.printf("pos:    %+.2f %+.2f\n", telemetry.mass.pos_norm.x, telemetry.mass.pos_norm.y);
  M5.Display.printf("ch:     %.2f %.2f\n", telemetry.actuators.ch[0], telemetry.actuators.ch[1]);
  M5.Display.printf("        %.2f %.2f\n", telemetry.actuators.ch[2], telemetry.actuators.ch[3]);
  M5.Display.printf("tilt:   %+.1f %+.1f\n", telemetry.tilt.thumb_delta_deg, telemetry.tilt.index_delta_deg);
  M5.Display.printf("und:    %lu\n", static_cast<unsigned long>(telemetry.audio.underrun_count));

  M5.Display.endWrite();
}

}  // namespace haptics
