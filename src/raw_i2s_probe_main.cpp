#include <Arduino.h>
#include <M5Unified.h>
#include <driver/i2s.h>

#include <cmath>
#include <cstdio>
#include <cstring>

namespace {

constexpr uint32_t kSampleRateHz = 48000;
constexpr size_t kBlockSamples = 240;

struct PinRoute {
  const char* name;
  int pin_bck;
  int pin_ws;
  int pin_dout;
};

constexpr PinRoute kPinRouteExternal{"external", 7, 5, 43};
constexpr PinRoute kPinRouteLegacy{"legacy", 17, 15, 14};

struct ProbeState {
  bool enabled = true;
  bool burst_mode = true;
  float tone_hz = 180.0f;
  float amp = 0.90f;
  uint16_t burst_ms = 80;
  uint16_t period_ms = 240;
  uint16_t ramp_ms = 8;
  uint32_t blocks_written = 0;
  uint32_t write_errors = 0;
  uint64_t sample_cursor = 0;
  float phase = 0.0f;
  const PinRoute* route = &kPinRouteExternal;
} g_state;

int16_t g_stereo_block[kBlockSamples * 2]{};
char g_console_buffer[64]{};
size_t g_console_len = 0;
uint32_t g_last_ui_ms = 0;

float clampf(float value, float lo, float hi) {
  if (value < lo) {
    return lo;
  }
  if (value > hi) {
    return hi;
  }
  return value;
}

uint32_t msToSamples(uint16_t ms) {
  return static_cast<uint32_t>((static_cast<uint64_t>(ms) * kSampleRateHz) / 1000u);
}

float burstEnvelope(uint32_t cycle_sample, uint32_t burst_samples, uint32_t ramp_samples) {
  if (cycle_sample >= burst_samples || burst_samples == 0) {
    return 0.0f;
  }
  if (ramp_samples == 0) {
    return 1.0f;
  }
  const uint32_t release_start = burst_samples > ramp_samples ? (burst_samples - ramp_samples) : 0;
  if (cycle_sample < ramp_samples) {
    return static_cast<float>(cycle_sample) / static_cast<float>(ramp_samples);
  }
  if (cycle_sample >= release_start) {
    return static_cast<float>(burst_samples - cycle_sample) / static_cast<float>(ramp_samples);
  }
  return 1.0f;
}

void drawStatus() {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 10);
  M5.Display.println("RAW I2S");
  M5.Display.println("PROBE");
  M5.Display.setTextSize(1);
  M5.Display.printf("mode: %s\n", g_state.burst_mode ? "burst" : "tone");
  M5.Display.printf("tone: %.0f Hz\n", static_cast<double>(g_state.tone_hz));
  M5.Display.printf("amp:  %.2f\n", static_cast<double>(g_state.amp));
  M5.Display.printf("route: %s\n", g_state.route->name);
  M5.Display.printf("pins: %d/%d/%d\n", g_state.route->pin_bck, g_state.route->pin_ws, g_state.route->pin_dout);
  M5.Display.printf("writes:%lu\n", static_cast<unsigned long>(g_state.blocks_written));
  M5.Display.printf("errs:  %lu\n", static_cast<unsigned long>(g_state.write_errors));
  M5.Display.printf("audio: %s\n", g_state.enabled ? "on" : "off");
  M5.Display.endWrite();
}

void printStatus() {
  Serial.printf(
      "raw_i2s: enabled=%u mode=%s tone=%.1fHz amp=%.2f burst=%ums period=%ums writes=%lu errs=%lu pins=(%d,%d,%d)\n",
      static_cast<unsigned>(g_state.enabled),
      g_state.burst_mode ? "burst" : "tone",
      static_cast<double>(g_state.tone_hz),
      static_cast<double>(g_state.amp),
      static_cast<unsigned>(g_state.burst_ms),
      static_cast<unsigned>(g_state.period_ms),
      static_cast<unsigned long>(g_state.blocks_written),
      static_cast<unsigned long>(g_state.write_errors),
      g_state.route->pin_bck,
      g_state.route->pin_ws,
      g_state.route->pin_dout);
}

void installI2s() {
  const i2s_config_t cfg = {
      .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = static_cast<int>(kSampleRateHz),
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = 0,
      .dma_buf_count = 4,
      .dma_buf_len = static_cast<int>(kBlockSamples),
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0,
      .mclk_multiple = I2S_MCLK_MULTIPLE_256,
      .bits_per_chan = I2S_BITS_PER_CHAN_DEFAULT,
  };
  const i2s_pin_config_t pins = {
      .mck_io_num = I2S_PIN_NO_CHANGE,
      .bck_io_num = g_state.route->pin_bck,
      .ws_io_num = g_state.route->pin_ws,
      .data_out_num = g_state.route->pin_dout,
      .data_in_num = I2S_PIN_NO_CHANGE,
  };

  i2s_driver_uninstall(I2S_NUM_0);
  i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
  i2s_set_pin(I2S_NUM_0, &pins);
  i2s_zero_dma_buffer(I2S_NUM_0);
}

void setRoute(const PinRoute& route) {
  g_state.route = &route;
  g_state.blocks_written = 0;
  g_state.write_errors = 0;
  g_state.sample_cursor = 0;
  g_state.phase = 0.0f;
  installI2s();
  drawStatus();
  Serial.printf("raw_i2s: route=%s pins=(%d,%d,%d)\n",
                g_state.route->name,
                g_state.route->pin_bck,
                g_state.route->pin_ws,
                g_state.route->pin_dout);
}

void fillBlock() {
  const float phase_step = 2.0f * static_cast<float>(M_PI) * g_state.tone_hz / static_cast<float>(kSampleRateHz);
  const uint32_t period_samples = std::max<uint32_t>(1u, msToSamples(g_state.period_ms));
  const uint32_t burst_samples = std::min<uint32_t>(period_samples, std::max<uint32_t>(1u, msToSamples(g_state.burst_ms)));
  const uint32_t ramp_samples = std::min<uint32_t>(burst_samples / 2u, msToSamples(g_state.ramp_ms));

  for (size_t i = 0; i < kBlockSamples; ++i) {
    float sample = 0.0f;
    if (g_state.enabled) {
      float env = 1.0f;
      if (g_state.burst_mode) {
        const uint32_t cycle_sample = static_cast<uint32_t>(g_state.sample_cursor % period_samples);
        env = burstEnvelope(cycle_sample, burst_samples, ramp_samples);
      }
      sample = g_state.amp * env * std::sin(g_state.phase);
      g_state.phase += phase_step;
      if (g_state.phase > 2.0f * static_cast<float>(M_PI)) {
        g_state.phase -= 2.0f * static_cast<float>(M_PI);
      }
      g_state.sample_cursor++;
    }

    const int16_t s16 = static_cast<int16_t>(clampf(sample, -1.0f, 1.0f) * 32767.0f);
    g_stereo_block[(i * 2) + 0] = s16;
    g_stereo_block[(i * 2) + 1] = s16;
  }
}

void writeBlock() {
  fillBlock();
  size_t written = 0;
  const esp_err_t err = i2s_write(I2S_NUM_0, g_stereo_block, sizeof(g_stereo_block), &written, portMAX_DELAY);
  if (err == ESP_OK && written == sizeof(g_stereo_block)) {
    g_state.blocks_written++;
  } else {
    g_state.write_errors++;
  }
}

void handleButtons() {
  if (M5.BtnA.wasClicked()) {
    g_state.tone_hz += 20.0f;
    if (g_state.tone_hz > 400.0f) {
      g_state.tone_hz = 80.0f;
    }
    Serial.printf("raw_i2s: tone=%.1fHz\n", static_cast<double>(g_state.tone_hz));
  }
  if (M5.BtnA.wasHold()) {
    g_state.burst_mode = !g_state.burst_mode;
    Serial.printf("raw_i2s: mode=%s\n", g_state.burst_mode ? "burst" : "tone");
  }
  if (M5.BtnB.wasClicked()) {
    g_state.enabled = !g_state.enabled;
    Serial.printf("raw_i2s: enabled=%u\n", static_cast<unsigned>(g_state.enabled));
  }
  if (M5.BtnB.wasHold()) {
    if (g_state.route == &kPinRouteExternal) {
      setRoute(kPinRouteLegacy);
    } else {
      setRoute(kPinRouteExternal);
    }
  }
}

void handleCommand(const char* command) {
  if (std::strcmp(command, "status") == 0) {
    printStatus();
    return;
  }
  if (std::strcmp(command, "start") == 0) {
    g_state.enabled = true;
    Serial.println("raw_i2s: enabled=1");
    return;
  }
  if (std::strcmp(command, "stop") == 0) {
    g_state.enabled = false;
    Serial.println("raw_i2s: enabled=0");
    return;
  }
  if (std::strcmp(command, "mode tone") == 0) {
    g_state.burst_mode = false;
    Serial.println("raw_i2s: mode=tone");
    return;
  }
  if (std::strcmp(command, "mode burst") == 0) {
    g_state.burst_mode = true;
    Serial.println("raw_i2s: mode=burst");
    return;
  }
  if (std::strcmp(command, "pins ext") == 0) {
    setRoute(kPinRouteExternal);
    return;
  }
  if (std::strcmp(command, "pins legacy") == 0) {
    setRoute(kPinRouteLegacy);
    return;
  }

  float value = 0.0f;
  if (std::sscanf(command, "tone %f", &value) == 1) {
    g_state.tone_hz = clampf(value, 40.0f, 1000.0f);
    Serial.printf("raw_i2s: tone=%.1fHz\n", static_cast<double>(g_state.tone_hz));
    return;
  }
  if (std::sscanf(command, "amp %f", &value) == 1) {
    g_state.amp = clampf(value, 0.0f, 1.0f);
    Serial.printf("raw_i2s: amp=%.2f\n", static_cast<double>(g_state.amp));
    return;
  }
  if (std::sscanf(command, "burst %f", &value) == 1) {
    g_state.burst_ms = static_cast<uint16_t>(clampf(value, 5.0f, 500.0f));
    if (g_state.burst_ms > g_state.period_ms) {
      g_state.period_ms = g_state.burst_ms;
    }
    Serial.printf("raw_i2s: burst=%ums\n", static_cast<unsigned>(g_state.burst_ms));
    return;
  }
  if (std::sscanf(command, "period %f", &value) == 1) {
    g_state.period_ms = static_cast<uint16_t>(clampf(value, 20.0f, 1000.0f));
    if (g_state.burst_ms > g_state.period_ms) {
      g_state.burst_ms = g_state.period_ms;
    }
    Serial.printf("raw_i2s: period=%ums\n", static_cast<unsigned>(g_state.period_ms));
    return;
  }

  Serial.println("raw_i2s: commands=status|start|stop|mode tone|mode burst|pins ext|pins legacy|tone <hz>|amp <0..1>|burst <ms>|period <ms>");
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
        handleCommand(g_console_buffer);
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
  M5.Display.wakeup();
  M5.Display.setBrightness(255);
  M5.Display.setRotation(0);

  Serial.begin(115200);
  delay(100);

  M5.Power.setExtOutput(true);
  installI2s();
  drawStatus();

  Serial.println();
  Serial.println("Raw I2S probe started.");
  Serial.println("BtnA click: tone step | BtnA hold: toggle burst/tone");
  Serial.println("BtnB click: toggle output | BtnB hold: toggle pin route");
  Serial.println("Console: status|start|stop|mode tone|mode burst|pins ext|pins legacy|tone <hz>|amp <0..1>|burst <ms>|period <ms>");
  printStatus();
}

void loop() {
  M5.update();
  handleButtons();
  pollConsole();
  writeBlock();

  const uint32_t now = millis();
  if (now - g_last_ui_ms >= 200u) {
    g_last_ui_ms = now;
    drawStatus();
  }
}
