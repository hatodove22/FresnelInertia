#include <Arduino.h>
#include <M5Unified.h>
#include <driver/i2s.h>

#include <cstdio>
#include <cstring>
#include <cmath>

namespace {

constexpr uint32_t kSampleRateHz = 48000;
constexpr uint32_t kBlockSamples = 240;
constexpr uint8_t kNumBuffers = 3;
constexpr uint8_t kAudioChannel = 0;
constexpr uint8_t kStartupVolume = 255;

constexpr int kPinBck = 7;
constexpr int kPinWs = 5;
constexpr int kPinDataOut = 43;

struct SmokeState {
  bool enabled = true;
  bool sweep = false;
  bool burst_mode = true;
  float tone_hz = 180.0f;
  float amp = 0.45f;
  uint16_t burst_ms = 60;
  uint16_t period_ms = 220;
  uint16_t ramp_ms = 8;
  float sweep_min_hz = 80.0f;
  float sweep_max_hz = 400.0f;
  float sweep_step_hz = 5.0f;
  uint16_t blocks_per_step = 24;
  uint16_t block_counter = 0;
  float phase = 0.0f;
  uint64_t sample_cursor = 0;
  uint32_t underruns = 0;
} g_state;

int16_t g_audio_buffers[kNumBuffers][kBlockSamples]{};
uint8_t g_buffer_index = 0;
char g_console_buffer[64]{};
size_t g_console_len = 0;
uint32_t g_last_ui_ms = 0;
bool g_audio_queue_primed = false;

float clampf(float value, float lo, float hi) {
  if (value < lo) {
    return lo;
  }
  if (value > hi) {
    return hi;
  }
  return value;
}

uint32_t msToSamples(uint16_t ms);

void printStatus() {
  Serial.printf(
      "smoke: enabled=%u sweep=%u mode=%s tone=%.1fHz amp=%.2f burst=%ums period=%ums underruns=%lu pins=(%d,%d,%d)\n",
      static_cast<unsigned>(g_state.enabled),
      static_cast<unsigned>(g_state.sweep),
      g_state.burst_mode ? "burst" : "tone",
      static_cast<double>(g_state.tone_hz),
      static_cast<double>(g_state.amp),
      static_cast<unsigned>(g_state.burst_ms),
      static_cast<unsigned>(g_state.period_ms),
      static_cast<unsigned long>(g_state.underruns),
      kPinBck,
      kPinWs,
      kPinDataOut);
}

void drawStatus() {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 10);
  M5.Display.println("AUDIO SMOKE");
  M5.Display.setTextSize(1);
  M5.Display.printf("mode: %s\n", g_state.burst_mode ? "burst" : "tone");
  M5.Display.printf("tone: %.0f Hz\n", static_cast<double>(g_state.tone_hz));
  M5.Display.printf("amp:  %.2f\n", static_cast<double>(g_state.amp));
  M5.Display.printf("burst:%u ms\n", static_cast<unsigned>(g_state.burst_ms));
  M5.Display.printf("period:%u ms\n", static_cast<unsigned>(g_state.period_ms));
  M5.Display.printf("sweep: %s\n", g_state.sweep ? "on" : "off");
  M5.Display.printf("audio: %s\n", g_state.enabled ? "on" : "off");
  M5.Display.printf("underruns: %lu\n", static_cast<unsigned long>(g_state.underruns));

  const uint32_t period_samples = std::max<uint32_t>(1u, msToSamples(g_state.period_ms));
  const uint32_t cycle_sample = static_cast<uint32_t>(g_state.sample_cursor % period_samples);
  const int bar_width = static_cast<int>((cycle_sample * 120u) / period_samples);
  M5.Display.drawRect(8, 112, 120, 8, TFT_DARKGREY);
  M5.Display.fillRect(8, 112, bar_width, 8, g_state.enabled ? TFT_GREEN : TFT_RED);
  M5.Display.endWrite();
}

void drawBootStage(const char* line1, const char* line2 = nullptr) {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(8, 10);
  M5.Display.println("BOOT");
  M5.Display.setTextSize(1);
  M5.Display.setCursor(8, 40);
  M5.Display.println(line1);
  if (line2 != nullptr) {
    M5.Display.setCursor(8, 56);
    M5.Display.println(line2);
  }
  M5.Display.endWrite();
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

void configureSpeaker() {
  auto speaker_cfg = M5.Speaker.config();
  speaker_cfg.pin_bck = kPinBck;
  speaker_cfg.pin_ws = kPinWs;
  speaker_cfg.pin_data_out = kPinDataOut;
  speaker_cfg.pin_mck = I2S_PIN_NO_CHANGE;
  speaker_cfg.i2s_port = I2S_NUM_0;
  speaker_cfg.sample_rate = kSampleRateHz;
  speaker_cfg.stereo = false;
  speaker_cfg.buzzer = false;
  speaker_cfg.use_dac = false;
  speaker_cfg.dma_buf_len = kBlockSamples;
  speaker_cfg.dma_buf_count = kNumBuffers;
  M5.Speaker.config(speaker_cfg);
  M5.Speaker.begin();
  M5.Speaker.setVolume(kStartupVolume);
}

void fillBlock(int16_t* buffer) {
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
    buffer[i] = static_cast<int16_t>(clampf(sample, -1.0f, 1.0f) * 32767.0f);
  }

  if (g_state.sweep) {
    g_state.block_counter++;
    if (g_state.block_counter >= g_state.blocks_per_step) {
      g_state.block_counter = 0;
      g_state.tone_hz += g_state.sweep_step_hz;
      if (g_state.tone_hz > g_state.sweep_max_hz) {
        g_state.tone_hz = g_state.sweep_min_hz;
      }
    }
  }
}

bool queueOneBlock(bool stop_current) {
  int16_t* buffer = g_audio_buffers[g_buffer_index];
  fillBlock(buffer);
  const bool ok = M5.Speaker.playRaw(buffer, kBlockSamples, kSampleRateHz, false, 1, kAudioChannel, stop_current);
  g_buffer_index = static_cast<uint8_t>((g_buffer_index + 1u) % kNumBuffers);
  return ok;
}

void handleButtons() {
  if (M5.BtnA.wasHold()) {
    g_state.sweep = !g_state.sweep;
    g_state.block_counter = 0;
    Serial.printf("smoke: sweep=%u\n", static_cast<unsigned>(g_state.sweep));
    return;
  }
  if (M5.BtnA.wasClicked()) {
    g_state.tone_hz += 20.0f;
    if (g_state.tone_hz > 400.0f) {
      g_state.tone_hz = 80.0f;
    }
    Serial.printf("smoke: tone=%.1fHz\n", static_cast<double>(g_state.tone_hz));
  }
  if (M5.BtnB.wasHold()) {
    printStatus();
    return;
  }
  if (M5.BtnB.wasClicked()) {
    g_state.enabled = !g_state.enabled;
    Serial.printf("smoke: enabled=%u\n", static_cast<unsigned>(g_state.enabled));
  }
}

void handleCommand(const char* command) {
  if (std::strcmp(command, "status") == 0) {
    printStatus();
    return;
  }
  if (std::strcmp(command, "start") == 0) {
    g_state.enabled = true;
    Serial.println("smoke: enabled=1");
    return;
  }
  if (std::strcmp(command, "stop") == 0) {
    g_state.enabled = false;
    Serial.println("smoke: enabled=0");
    return;
  }
  if (std::strcmp(command, "sweep on") == 0) {
    g_state.sweep = true;
    g_state.block_counter = 0;
    Serial.println("smoke: sweep=1");
    return;
  }
  if (std::strcmp(command, "sweep off") == 0) {
    g_state.sweep = false;
    Serial.println("smoke: sweep=0");
    return;
  }
  if (std::strcmp(command, "mode burst") == 0) {
    g_state.burst_mode = true;
    Serial.println("smoke: mode=burst");
    return;
  }
  if (std::strcmp(command, "mode tone") == 0) {
    g_state.burst_mode = false;
    Serial.println("smoke: mode=tone");
    return;
  }

  float value = 0.0f;
  if (std::sscanf(command, "tone %f", &value) == 1) {
    g_state.tone_hz = clampf(value, 40.0f, 1000.0f);
    Serial.printf("smoke: tone=%.1fHz\n", static_cast<double>(g_state.tone_hz));
    return;
  }
  if (std::sscanf(command, "amp %f", &value) == 1) {
    g_state.amp = clampf(value, 0.0f, 1.0f);
    Serial.printf("smoke: amp=%.2f\n", static_cast<double>(g_state.amp));
    return;
  }
  if (std::sscanf(command, "burst %f", &value) == 1) {
    g_state.burst_ms = static_cast<uint16_t>(clampf(value, 5.0f, 500.0f));
    if (g_state.burst_ms > g_state.period_ms) {
      g_state.period_ms = g_state.burst_ms;
    }
    Serial.printf("smoke: burst=%ums\n", static_cast<unsigned>(g_state.burst_ms));
    return;
  }
  if (std::sscanf(command, "period %f", &value) == 1) {
    g_state.period_ms = static_cast<uint16_t>(clampf(value, 20.0f, 1000.0f));
    if (g_state.burst_ms > g_state.period_ms) {
      g_state.burst_ms = g_state.period_ms;
    }
    Serial.printf("smoke: period=%ums\n", static_cast<unsigned>(g_state.period_ms));
    return;
  }
  if (std::sscanf(command, "volume %f", &value) == 1) {
    const auto volume = static_cast<uint8_t>(clampf(value, 0.0f, 255.0f));
    M5.Speaker.setVolume(volume);
    Serial.printf("smoke: volume=%u\n", static_cast<unsigned>(volume));
    return;
  }

  Serial.println(
      "smoke: commands=status|start|stop|mode tone|mode burst|tone <hz>|amp <0..1>|burst <ms>|period <ms>|volume <0..255>|sweep on|sweep off");
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
  drawBootStage("M5.begin complete");
  Serial.begin(115200);
  delay(100);
  Serial.println();
  Serial.println("smoke: serial ready");
  Serial.flush();

  drawBootStage("Enabling EXT_5V");
  M5.Power.setExtOutput(true);
  Serial.println("smoke: ext power enabled");
  Serial.flush();

  drawBootStage("Configuring speaker", "GPIO 7/5/43 mono 48k");
  configureSpeaker();
  Serial.println("smoke: speaker configured");
  Serial.flush();

  Serial.println();
  Serial.println("Audio smoke test started.");
  Serial.println("BtnA click: tone step | BtnA hold: toggle sweep");
  Serial.println("BtnB click: toggle output | BtnB hold: print status");
  Serial.println(
      "Console: status|start|stop|mode tone|mode burst|tone <hz>|amp <0..1>|burst <ms>|period <ms>|volume <0..255>|sweep on|sweep off");
  drawStatus();
  printStatus();
}

void loop() {
  M5.update();
  handleButtons();
  pollConsole();

  if (!g_audio_queue_primed) {
    queueOneBlock(true);
    queueOneBlock(false);
    g_audio_queue_primed = true;
    Serial.println("smoke: queue primed");
    Serial.flush();
  }

  const size_t playing = M5.Speaker.isPlaying(kAudioChannel);
  if (playing == 0) {
    g_state.underruns++;
    queueOneBlock(true);
    queueOneBlock(false);
  } else if (playing == 1) {
    queueOneBlock(false);
  }

  const uint32_t now = millis();
  if (now - g_last_ui_ms >= 120u) {
    g_last_ui_ms = now;
    drawStatus();
  }

  delay(1);
}
