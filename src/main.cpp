#include <Arduino.h>
#include <M5Unified.h>

#include "haptics/HapticPipeline.hpp"
#include "haptics/HardwareProfiles.hpp"
#include "haptics/Parameters.hpp"

#ifndef HAPTICS_SINGLE_AMP_BENCH_DEFAULTS
#define HAPTICS_SINGLE_AMP_BENCH_DEFAULTS 0
#endif

#ifndef HAPTICS_MAIN_MONITORING_DEFAULTS
#define HAPTICS_MAIN_MONITORING_DEFAULTS 0
#endif

#ifndef HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE
#define HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE 0
#endif

#ifndef HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
#define HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND 0
#endif

#ifndef HAPTICS_ALLOW_REMOTE_TILT_ARM
#define HAPTICS_ALLOW_REMOTE_TILT_ARM 0
#endif

#ifndef HAPTICS_USB_TELEMETRY_TX_BUFFER_BYTES
#define HAPTICS_USB_TELEMETRY_TX_BUFFER_BYTES 4096
#endif

using haptics::HapticPipeline;
using haptics::makeDefaultLiquidPreset;

namespace {

HapticPipeline g_pipeline;
char g_console_buffer[64]{};
size_t g_console_len = 0;
bool g_pipeline_ready = false;

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
#if HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE
  cfg.fallback_board = m5::board_t::board_M5AtomS3;
#else
  cfg.fallback_board = m5::board_t::board_M5StickS3;
#endif
  cfg.internal_imu = false;
  cfg.internal_rtc = false;
  cfg.internal_mic = false;
  cfg.output_power = false;
  M5.begin(cfg);

#if HAPTICS_ENABLE_USB_TELEMETRY
  // ESP32-S3 HWCDC otherwise defaults to a 256-byte TX ring, exactly the
  // producer's maximum chunk size. Reserve enough room for a complete bounded
  // JSON frame plus headroom before the console starts using Serial.
  const size_t usb_telemetry_tx_buffer_bytes =
      Serial.setTxBufferSize(HAPTICS_USB_TELEMETRY_TX_BUFFER_BYTES);
#endif
  Serial.begin(115200);
  delay(100);

#if HAPTICS_ENABLE_USB_TELEMETRY
  Serial.printf("usb_telemetry: tx_buffer=%u requested=%u\n",
                static_cast<unsigned>(usb_telemetry_tx_buffer_bytes),
                static_cast<unsigned>(HAPTICS_USB_TELEMETRY_TX_BUFFER_BYTES));
#endif

  const bool imu_ready = M5.Imu.begin(&M5.In_I2C, M5.getBoard());
  Serial.printf("imu: init=%u\n", static_cast<unsigned>(imu_ready));

  auto params = makeDefaultLiquidPreset();
  params.features.enable_debug_display = false;

#if HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE
  haptics::applyAsBuiltAtomS3Profile(params);
#endif

#if HAPTICS_ALLOW_REMOTE_TILT_ARM
  params.features.allow_remote_tilt_arm = true;
#endif

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

  g_pipeline_ready = g_pipeline.begin(params);

#if HAPTICS_DEMO_ESPNOW_AUTOSTART
  if (g_pipeline_ready) {
    // A dedicated demo must be discoverable after reboot without a USB console.
    // Reuse the local enable path only after both physical outputs are OFF.
    g_pipeline.enterSafeIdle();
    g_pipeline.handleConsoleCommand("espnow link on");
  }
#endif

  Serial.println();
  Serial.println("Parametric Container Haptics firmware started.");
#if HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE
#if HAPTICS_ENABLE_ATOMS3_DXL2_BACKEND
  Serial.println("profile: AtomS3 as-built 4CH TDM + guarded DXL2 tilt; both outputs gated at boot");
#else
  Serial.println("profile: AtomS3 as-built 4CH TDM; digital output muted; legacy tilt backend blocked");
#endif
#endif
  Serial.printf("pipeline: init=%u\n", static_cast<unsigned>(g_pipeline_ready));
#if HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE
  Serial.println("BtnA click: cycle presets | BtnA hold: Safe Idle");
#else
  Serial.println("BtnA click: cycle presets | BtnA hold: cycle audio test wall");
  Serial.println("BtnB click: toggle verbose serial | BtnB hold: toggle audio runtime");
#endif
  Serial.println("Console: status, cal/preset/record/replay/tilt/audio/remote commands available");
#if HAPTICS_MAIN_MONITORING_DEFAULTS
  Serial.println("Monitoring: USB serial + SoftAP HTTP status page");
#endif
}

void loop() {
  M5.update();
  pollConsole();

  if (!g_pipeline_ready) {
    delay(10);
    return;
  }

  if (M5.BtnA.wasHold()) {
#if HAPTICS_ATOMS3_CUSTOM_BOARD_PROFILE
    g_pipeline.enterSafeIdle();
    Serial.println("safety: BtnA hold -> safe idle");
#else
    g_pipeline.cycleAudioTestMode();
#endif
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
