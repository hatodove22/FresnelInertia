#include <Arduino.h>
#include <M5Unified.h>
#include <driver/i2s.h>

#include <array>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace {

constexpr uint32_t kSampleRateHz = 48000;
constexpr uint32_t kBlockSamples = 240;
constexpr uint8_t kNumBuffers = 3;
constexpr uint8_t kAudioChannel = 0;
constexpr uint8_t kStartupVolume = 255;

constexpr int kPinBck = 7;
constexpr int kPinWs = 5;
constexpr int kPinDataOut = 43;

constexpr std::array<float, 5> kCarrierPresetsHz{120.0f, 160.0f, 200.0f, 240.0f, 320.0f};

struct ProbeState {
  bool enabled = true;
  bool sweep = false;
  float carrier_hz = 180.0f;
  float level = 0.45f;
  uint16_t burst_ms = 60;
  uint16_t period_ms = 220;
  uint16_t ramp_ms = 8;
  float sweep_min_hz = 120.0f;
  float sweep_max_hz = 320.0f;
  float sweep_step_hz = 20.0f;
  uint16_t blocks_per_sweep_step = 24;
  uint16_t sweep_block_counter = 0;
  uint64_t sample_cursor = 0;
  uint32_t underruns = 0;
} g_state;

std::array<std::array<int16_t, kBlockSamples>, kNumBuffers> g_audio_buffers{};
uint8_t g_buffer_index = 0;
char g_console_buffer[64]{};
size_t g_console_len = 0;
size_t g_carrier_preset_index = 0;

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

void printStatus() {
  Serial.printf(
      "probe: enabled=%u sweep=%u carrier=%.1fHz level=%.2f burst=%ums period=%ums ramp=%ums underruns=%lu pins=(%d,%d,%d)\n",
      static_cast<unsigned>(g_state.enabled),
      static_cast<unsigned>(g_state.sweep),
      static_cast<double>(g_state.carrier_hz),
      static_cast<double>(g_state.level),
      static_cast<unsigned>(g_state.burst_ms),
      static_cast<unsigned>(g_state.period_ms),
      static_cast<unsigned>(g_state.ramp_ms),
      static_cast<unsigned long>(g_state.underruns),
      kPinBck,
      kPinWs,
      kPinDataOut);
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

void advanceSweep() {
  if (!g_state.sweep) {
    return;
  }
  g_state.sweep_block_counter++;
  if (g_state.sweep_block_counter < g_state.blocks_per_sweep_step) {
    return;
  }
  g_state.sweep_block_counter = 0;
  g_state.carrier_hz += g_state.sweep_step_hz;
  if (g_state.carrier_hz > g_state.sweep_max_hz) {
    g_state.carrier_hz = g_state.sweep_min_hz;
  }
}

void fillBlock(int16_t* buffer) {
  const float phase_step = 2.0f * static_cast<float>(M_PI) * g_state.carrier_hz / static_cast<float>(kSampleRateHz);
  const uint32_t period_samples = std::max<uint32_t>(1u, msToSamples(g_state.period_ms));
  const uint32_t burst_samples = std::min<uint32_t>(period_samples, std::max<uint32_t>(1u, msToSamples(g_state.burst_ms)));
  const uint32_t ramp_samples = std::min<uint32_t>(burst_samples / 2u, msToSamples(g_state.ramp_ms));

  for (size_t i = 0; i < kBlockSamples; ++i) {
    float sample = 0.0f;
    if (g_state.enabled) {
      const uint32_t cycle_sample = static_cast<uint32_t>(g_state.sample_cursor % period_samples);
      const float env = burstEnvelope(cycle_sample, burst_samples, ramp_samples);
      sample = g_state.level * env * std::sin(phase_step * static_cast<float>(g_state.sample_cursor));
      g_state.sample_cursor++;
    }
    buffer[i] = static_cast<int16_t>(clampf(sample, -1.0f, 1.0f) * 32767.0f);
  }

  advanceSweep();
}

bool queueOneBlock(bool stop_current) {
  auto& buffer = g_audio_buffers[g_buffer_index];
  fillBlock(buffer.data());
  const bool ok = M5.Speaker.playRaw(
      buffer.data(), buffer.size(), kSampleRateHz, false, 1, kAudioChannel, stop_current);
  g_buffer_index = static_cast<uint8_t>((g_buffer_index + 1u) % g_audio_buffers.size());
  return ok;
}

void cycleCarrierPreset() {
  g_carrier_preset_index = (g_carrier_preset_index + 1u) % kCarrierPresetsHz.size();
  g_state.carrier_hz = kCarrierPresetsHz[g_carrier_preset_index];
  g_state.sweep = false;
  g_state.sweep_block_counter = 0;
  Serial.printf("probe: carrier=%.1fHz\n", static_cast<double>(g_state.carrier_hz));
}

void handleButtons() {
  if (M5.BtnA.wasHold()) {
    g_state.sweep = !g_state.sweep;
    g_state.sweep_block_counter = 0;
    if (g_state.sweep && g_state.carrier_hz < g_state.sweep_min_hz) {
      g_state.carrier_hz = g_state.sweep_min_hz;
    }
    Serial.printf("probe: sweep=%u\n", static_cast<unsigned>(g_state.sweep));
    return;
  }
  if (M5.BtnA.wasClicked()) {
    cycleCarrierPreset();
  }
  if (M5.BtnB.wasHold()) {
    printStatus();
    return;
  }
  if (M5.BtnB.wasClicked()) {
    g_state.enabled = !g_state.enabled;
    Serial.printf("probe: enabled=%u\n", static_cast<unsigned>(g_state.enabled));
  }
}

void handleCommand(const char* command) {
  if (std::strcmp(command, "status") == 0) {
    printStatus();
    return;
  }
  if (std::strcmp(command, "start") == 0) {
    g_state.enabled = true;
    Serial.println("probe: enabled=1");
    return;
  }
  if (std::strcmp(command, "stop") == 0) {
    g_state.enabled = false;
    Serial.println("probe: enabled=0");
    return;
  }
  if (std::strcmp(command, "sweep on") == 0) {
    g_state.sweep = true;
    g_state.sweep_block_counter = 0;
    if (g_state.carrier_hz < g_state.sweep_min_hz) {
      g_state.carrier_hz = g_state.sweep_min_hz;
    }
    Serial.println("probe: sweep=1");
    return;
  }
  if (std::strcmp(command, "sweep off") == 0) {
    g_state.sweep = false;
    Serial.println("probe: sweep=0");
    return;
  }

  float value = 0.0f;
  if (std::sscanf(command, "freq %f", &value) == 1) {
    g_state.carrier_hz = clampf(value, 40.0f, 1000.0f);
    g_state.sweep = false;
    g_state.sweep_block_counter = 0;
    Serial.printf("probe: carrier=%.1fHz\n", static_cast<double>(g_state.carrier_hz));
    return;
  }
  if (std::sscanf(command, "level %f", &value) == 1) {
    g_state.level = clampf(value, 0.0f, 1.0f);
    Serial.printf("probe: level=%.2f\n", static_cast<double>(g_state.level));
    return;
  }
  if (std::sscanf(command, "burst %f", &value) == 1) {
    g_state.burst_ms = static_cast<uint16_t>(clampf(value, 5.0f, 500.0f));
    if (g_state.burst_ms > g_state.period_ms) {
      g_state.period_ms = g_state.burst_ms;
    }
    Serial.printf("probe: burst=%ums\n", static_cast<unsigned>(g_state.burst_ms));
    return;
  }
  if (std::sscanf(command, "period %f", &value) == 1) {
    g_state.period_ms = static_cast<uint16_t>(clampf(value, 20.0f, 1000.0f));
    if (g_state.burst_ms > g_state.period_ms) {
      g_state.burst_ms = g_state.period_ms;
    }
    Serial.printf("probe: period=%ums\n", static_cast<unsigned>(g_state.period_ms));
    return;
  }
  if (std::sscanf(command, "volume %f", &value) == 1) {
    const auto volume = static_cast<uint8_t>(clampf(value, 0.0f, 255.0f));
    M5.Speaker.setVolume(volume);
    Serial.printf("probe: volume=%u\n", static_cast<unsigned>(volume));
    return;
  }

  Serial.println(
      "probe: commands=status|start|stop|freq <hz>|level <0..1>|burst <ms>|period <ms>|volume <0..255>|sweep on|sweep off");
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
  M5.begin(cfg);
  Serial.begin(115200);
  delay(100);

  Serial.println();
  Serial.println("probe: serial ready");
  Serial.flush();

  M5.Power.setExtOutput(true);
  Serial.println("probe: ext power enabled");
  Serial.flush();

  configureSpeaker();
  Serial.println("probe: speaker configured");
  Serial.flush();

  Serial.println("Transducer probe started.");
  Serial.println("BtnA click: cycle carrier preset | BtnA hold: toggle sweep");
  Serial.println("BtnB click: toggle output | BtnB hold: print status");
  Serial.println(
      "Console: status|start|stop|freq <hz>|level <0..1>|burst <ms>|period <ms>|volume <0..255>|sweep on|sweep off");
  Serial.flush();

  queueOneBlock(true);
  queueOneBlock(false);
  Serial.println("probe: queue primed");
  printStatus();
}

void loop() {
  M5.update();
  handleButtons();
  pollConsole();

  const size_t playing = M5.Speaker.isPlaying(kAudioChannel);
  if (playing == 0) {
    g_state.underruns++;
    queueOneBlock(true);
    queueOneBlock(false);
  } else if (playing == 1) {
    queueOneBlock(false);
  }

  delay(1);
}
