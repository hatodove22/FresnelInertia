#include "haptics/AtomS3TdmProbeConfig.h"

#if HAPTICS_ATOMS3_TDM_PROBE_ENABLE

#include <Arduino.h>
#include <M5Unified.h>
#include <driver/i2s.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>

namespace {

using haptics::atoms3_tdm_probe::kBclkFrequencyHz;
using haptics::atoms3_tdm_probe::kBclkPin;
using haptics::atoms3_tdm_probe::kBitsPerSlot;
using haptics::atoms3_tdm_probe::kBurstOnMs;
using haptics::atoms3_tdm_probe::kBurstPeriodMs;
using haptics::atoms3_tdm_probe::kDataOutPin;
using haptics::atoms3_tdm_probe::kDefaultDigitalLevel;
using haptics::atoms3_tdm_probe::kDefaultToneHz;
using haptics::atoms3_tdm_probe::kFramesPerBlock;
using haptics::atoms3_tdm_probe::kInterChannelMuteMs;
using haptics::atoms3_tdm_probe::kLrclkPin;
using haptics::atoms3_tdm_probe::kHardDigitalLevelLimit;
using haptics::atoms3_tdm_probe::kMinimumAdjustableDigitalLevel;
using haptics::atoms3_tdm_probe::kRampMs;
using haptics::atoms3_tdm_probe::kRunWatchdogMs;
using haptics::atoms3_tdm_probe::kSampleRateHz;
using haptics::atoms3_tdm_probe::kSingleChannelDurationMs;
using haptics::atoms3_tdm_probe::kSlotsPerFrame;
using haptics::atoms3_tdm_probe::kSweepRunWatchdogMs;
using haptics::atoms3_tdm_probe::kSweepDigitalLevel;
using haptics::atoms3_tdm_probe::kSweepStartHz;
using haptics::atoms3_tdm_probe::kSweepStepDurationMs;
using haptics::atoms3_tdm_probe::kSweepStepHz;
using haptics::atoms3_tdm_probe::kSweepStopHz;
using haptics::atoms3_tdm_probe::kUsedSlots;

constexpr i2s_port_t kI2sPort = I2S_NUM_0;
constexpr float kTau = 6.28318530717958647692f;

enum class ProbeMode : uint8_t {
  IdleSilent,
  SingleActive,
  SequenceActive,
  SequenceGap,
  SweepActive,
  Fault,
};

struct ProbeState {
  ProbeMode mode = ProbeMode::Fault;
  bool i2s_ready = false;
  uint8_t selected_slot = 0;
  uint8_t active_slot = 0;
  uint32_t state_deadline_ms = 0;
  uint32_t run_started_ms = 0;
  uint32_t blocks_written = 0;
  uint32_t write_errors = 0;
  uint64_t tone_sample_cursor = 0;
  float phase = 0.0f;
  float current_tone_hz = kDefaultToneHz;
  float test_digital_level = kDefaultDigitalLevel;
} g_state;

std::array<int16_t, kFramesPerBlock * kSlotsPerFrame> g_tdm_block{};
char g_console_buffer[64]{};
size_t g_console_length = 0;

const char* modeName(ProbeMode mode) {
  switch (mode) {
    case ProbeMode::IdleSilent:
      return "IDLE/SILENT";
    case ProbeMode::SingleActive:
      return "SINGLE";
    case ProbeMode::SequenceActive:
      return "SEQUENCE";
    case ProbeMode::SequenceGap:
      return "GAP/SILENT";
    case ProbeMode::SweepActive:
      return "SWEEP";
    case ProbeMode::Fault:
      return "FAULT/SILENT";
  }
  return "UNKNOWN";
}

float currentDigitalLevel() {
  return g_state.mode == ProbeMode::SweepActive ? kSweepDigitalLevel
                                                : g_state.test_digital_level;
}

void fillTdmBlock(bool active) {
  const uint32_t period_samples =
      std::max<uint32_t>(1, (static_cast<uint64_t>(kBurstPeriodMs) * kSampleRateHz) / 1000u);
  const uint32_t burst_samples =
      std::min<uint32_t>(period_samples,
                         (static_cast<uint64_t>(kBurstOnMs) * kSampleRateHz) / 1000u);
  const uint32_t ramp_samples = std::min<uint32_t>(
      burst_samples / 2u, (static_cast<uint64_t>(kRampMs) * kSampleRateHz) / 1000u);
  const float phase_step =
      kTau * g_state.current_tone_hz / static_cast<float>(kSampleRateHz);

  for (size_t frame = 0; frame < kFramesPerBlock; ++frame) {
    int16_t value = 0;
    if (active) {
      const uint32_t cycle_sample =
          static_cast<uint32_t>(g_state.tone_sample_cursor % period_samples);
      float envelope = 0.0f;
      if (cycle_sample < burst_samples) {
        envelope = 1.0f;
        if (ramp_samples > 0 && cycle_sample < ramp_samples) {
          envelope = static_cast<float>(cycle_sample) / static_cast<float>(ramp_samples);
        } else if (ramp_samples > 0 && cycle_sample >= burst_samples - ramp_samples) {
          envelope = static_cast<float>(burst_samples - cycle_sample) /
                     static_cast<float>(ramp_samples);
        }
      }
      const float sample = std::sin(g_state.phase) * envelope * currentDigitalLevel();
      value = static_cast<int16_t>(sample * 32767.0f);
      g_state.phase += phase_step;
      if (g_state.phase >= kTau) {
        g_state.phase -= kTau;
      }
      ++g_state.tone_sample_cursor;
    }

    const size_t base = frame * kSlotsPerFrame;
    for (uint8_t slot = 0; slot < kSlotsPerFrame; ++slot) {
      g_tdm_block[base + slot] = active && slot == g_state.active_slot ? value : 0;
    }
  }
}

bool writeTdmBlock(bool active) {
  fillTdmBlock(active);
  size_t bytes_written = 0;
  const esp_err_t result = i2s_write(
      kI2sPort,
      g_tdm_block.data(),
      sizeof(g_tdm_block),
      &bytes_written,
      pdMS_TO_TICKS(30));
  if (result != ESP_OK || bytes_written != sizeof(g_tdm_block)) {
    ++g_state.write_errors;
    return false;
  }
  ++g_state.blocks_written;
  return true;
}

bool writeSilenceBlocks(uint8_t count) {
  for (uint8_t i = 0; i < count; ++i) {
    if (!writeTdmBlock(false)) {
      return false;
    }
  }
  return true;
}

bool installTdm() {
  const i2s_channel_t all_eight_slots = static_cast<i2s_channel_t>(
      I2S_TDM_ACTIVE_CH0 | I2S_TDM_ACTIVE_CH1 | I2S_TDM_ACTIVE_CH2 |
      I2S_TDM_ACTIVE_CH3 | I2S_TDM_ACTIVE_CH4 | I2S_TDM_ACTIVE_CH5 |
      I2S_TDM_ACTIVE_CH6 | I2S_TDM_ACTIVE_CH7);
  const i2s_config_t config = {
      .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = kSampleRateHz,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_MULTIPLE,
      .communication_format = I2S_COMM_FORMAT_STAND_PCM_SHORT,
      .intr_alloc_flags = 0,
      .dma_buf_count = 4,
      .dma_buf_len = static_cast<int>(kFramesPerBlock),
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0,
      .mclk_multiple = I2S_MCLK_MULTIPLE_256,
      .bits_per_chan = I2S_BITS_PER_CHAN_16BIT,
      .chan_mask = all_eight_slots,
      .total_chan = kSlotsPerFrame,
      .left_align = false,
      .big_edin = false,
      // ESP-IDF 4.4 passes this field to the peripheral's LSB-first bit;
      // false therefore keeps the wire order MSB first for MAX98357A.
      .bit_order_msb = false,
      .skip_msk = false,
  };
  const i2s_pin_config_t pins = {
      .mck_io_num = I2S_PIN_NO_CHANGE,
      .bck_io_num = kBclkPin,
      .ws_io_num = kLrclkPin,
      .data_out_num = kDataOutPin,
      .data_in_num = I2S_PIN_NO_CHANGE,
  };

  i2s_driver_uninstall(kI2sPort);
  if (i2s_driver_install(kI2sPort, &config, 0, nullptr) != ESP_OK) {
    return false;
  }
  if (i2s_set_pin(kI2sPort, &pins) != ESP_OK) {
    i2s_driver_uninstall(kI2sPort);
    return false;
  }
  if (i2s_zero_dma_buffer(kI2sPort) != ESP_OK) {
    i2s_driver_uninstall(kI2sPort);
    return false;
  }
  g_state.i2s_ready = true;
  return writeSilenceBlocks(2);
}

void drawStatus(const char* message = nullptr) {
  M5.Display.startWrite();
  M5.Display.fillScreen(TFT_BLACK);
  M5.Display.setTextColor(g_state.mode == ProbeMode::Fault ? TFT_RED : TFT_WHITE, TFT_BLACK);
  M5.Display.setTextSize(2);
  M5.Display.setCursor(5, 5);
  M5.Display.println("4CH TDM");
  M5.Display.setTextSize(1);
  M5.Display.printf("%s\n", modeName(g_state.mode));
  M5.Display.printf("selected: CH%u\n", static_cast<unsigned>(g_state.selected_slot + 1));
  if (g_state.mode == ProbeMode::SingleActive ||
      g_state.mode == ProbeMode::SequenceActive ||
      g_state.mode == ProbeMode::SweepActive) {
    M5.Display.printf("active:   CH%u\n", static_cast<unsigned>(g_state.active_slot + 1));
  } else {
    M5.Display.println("active:   none");
  }
  M5.Display.printf("tone: %.0f Hz\n", static_cast<double>(g_state.current_tone_hz));
  M5.Display.println("amp SW: MANUAL");
  M5.Display.printf("48k/16b/8slot\n");
  M5.Display.printf("B/W/D %d/%d/%d\n", kBclkPin, kLrclkPin, kDataOutPin);
  M5.Display.printf("level %.1f%%\n", static_cast<double>(currentDigitalLevel() * 100.0f));
  if (message != nullptr) {
    M5.Display.printf("%s\n", message);
  } else {
    M5.Display.println("S1 OFF = HW MUTE");
    M5.Display.println("click=start");
  }
  M5.Display.endWrite();
}

void printStatus() {
  const bool active = g_state.mode == ProbeMode::SingleActive ||
                      g_state.mode == ProbeMode::SequenceActive ||
                      g_state.mode == ProbeMode::SweepActive;
  Serial.printf(
      "tdm: mode=%s selected=CH%u active=%s i2s=%u digital_silence=%u "
      "physical_amp_switch=manual writes=%lu errors=%lu\n",
      modeName(g_state.mode),
      static_cast<unsigned>(g_state.selected_slot + 1),
      active
          ? (g_state.active_slot == 0 ? "CH1" :
             g_state.active_slot == 1 ? "CH2" :
             g_state.active_slot == 2 ? "CH3" : "CH4")
          : "none",
      static_cast<unsigned>(g_state.i2s_ready),
      static_cast<unsigned>(!active),
      static_cast<unsigned long>(g_state.blocks_written),
      static_cast<unsigned long>(g_state.write_errors));
  Serial.printf(
      "format: fs=%lu bits=%u slots=%u bclk=%lu pins=(%d,%d,%d) tone=%.1fHz "
      "level=%.3f burst=%u/%ums\n",
      static_cast<unsigned long>(kSampleRateHz),
      static_cast<unsigned>(kBitsPerSlot),
      static_cast<unsigned>(kSlotsPerFrame),
      static_cast<unsigned long>(kBclkFrequencyHz),
      kBclkPin,
      kLrclkPin,
      kDataOutPin,
      static_cast<double>(g_state.current_tone_hz),
      static_cast<double>(currentDigitalLevel()),
      static_cast<unsigned>(kBurstOnMs),
      static_cast<unsigned>(kBurstPeriodMs));
  Serial.println("amp: S1 is manual and cannot be read or controlled by firmware; OFF=hardware mute.");
}

void enterFault(const char* reason) {
  if (g_state.i2s_ready) {
    i2s_zero_dma_buffer(kI2sPort);
  }
  g_state.mode = ProbeMode::Fault;
  Serial.printf("FAULT: %s; digital output forced to silence. TURN S1 OFF / REMOVE 12V.\n",
                reason);
  drawStatus("S1 OFF / 12V OFF");
}

void stopProbe(const char* reason) {
  if (g_state.i2s_ready) {
    i2s_zero_dma_buffer(kI2sPort);
  }
  g_state.phase = 0.0f;
  g_state.tone_sample_cursor = 0;
  g_state.current_tone_hz = kDefaultToneHz;
  g_state.state_deadline_ms = 0;
  g_state.run_started_ms = 0;
  g_state.mode = ProbeMode::IdleSilent;
  Serial.printf("DIGITAL SILENCE: %s. Use S1 OFF for hardware mute.\n", reason);
  drawStatus();
}

bool beginActiveSlot(uint8_t slot, ProbeMode mode) {
  if (slot >= kUsedSlots || !g_state.i2s_ready) {
    enterFault("probe is not ready to start the requested slot");
    return false;
  }
  if (!writeSilenceBlocks(3)) {
    enterFault("could not establish silent TDM pre-roll");
    return false;
  }
  g_state.active_slot = slot;
  g_state.phase = 0.0f;
  g_state.tone_sample_cursor = 0;
  g_state.current_tone_hz = kDefaultToneHz;
  g_state.mode = mode;
  g_state.state_deadline_ms = millis() + kSingleChannelDurationMs;
  Serial.printf("ACTIVE: CH%u / slot%u for %lums (low-level burst)\n",
                static_cast<unsigned>(slot + 1),
                static_cast<unsigned>(slot),
                static_cast<unsigned long>(kSingleChannelDurationMs));
  drawStatus();
  return true;
}

void startSelectedChannel() {
  if (g_state.mode != ProbeMode::IdleSilent) {
    Serial.println("Start rejected: stop the current run first.");
    return;
  }
  g_state.run_started_ms = millis();
  beginActiveSlot(g_state.selected_slot, ProbeMode::SingleActive);
}

void startSequence() {
  if (g_state.mode != ProbeMode::IdleSilent) {
    Serial.println("GO rejected: stop the current run first.");
    return;
  }
  g_state.run_started_ms = millis();
  Serial.println("GO: starting CH1 -> CH4; every gap contains digital silence.");
  beginActiveSlot(0, ProbeMode::SequenceActive);
}

void startSelectedSweep() {
  if (g_state.mode != ProbeMode::IdleSilent) {
    Serial.println("SWEEP rejected: stop the current run first.");
    return;
  }
  if (!g_state.i2s_ready || g_state.selected_slot >= kUsedSlots) {
    enterFault("probe is not ready to start the requested sweep");
    return;
  }
  if (!writeSilenceBlocks(3)) {
    enterFault("could not establish silent TDM pre-roll for sweep");
    return;
  }

  g_state.active_slot = g_state.selected_slot;
  g_state.current_tone_hz = kSweepStartHz;
  g_state.phase = 0.0f;
  g_state.tone_sample_cursor = 0;
  g_state.mode = ProbeMode::SweepActive;
  g_state.run_started_ms = millis();
  g_state.state_deadline_ms = g_state.run_started_ms + kSweepStepDurationMs;
  Serial.printf(
      "SWEEP: CH%u / slot%u %.0f..%.0fHz step=%.0fHz dwell=%lums level=%.1f%%\n",
      static_cast<unsigned>(g_state.active_slot + 1),
      static_cast<unsigned>(g_state.active_slot),
      static_cast<double>(kSweepStartHz),
      static_cast<double>(kSweepStopHz),
      static_cast<double>(kSweepStepHz),
      static_cast<unsigned long>(kSweepStepDurationMs),
      static_cast<double>(kSweepDigitalLevel * 100.0f));
  Serial.printf("SWEEP STEP: CH%u %.0fHz\n",
                static_cast<unsigned>(g_state.active_slot + 1),
                static_cast<double>(g_state.current_tone_hz));
  drawStatus();
}

void serviceStateMachine() {
  const uint32_t now = millis();
  const bool active = g_state.mode == ProbeMode::SingleActive ||
                      g_state.mode == ProbeMode::SequenceActive ||
                      g_state.mode == ProbeMode::SweepActive;

  const uint32_t watchdog_ms =
      g_state.mode == ProbeMode::SweepActive ? kSweepRunWatchdogMs : kRunWatchdogMs;
  if (g_state.run_started_ms != 0 && now - g_state.run_started_ms >= watchdog_ms) {
    stopProbe("run watchdog expired");
    return;
  }

  if (active && static_cast<int32_t>(now - g_state.state_deadline_ms) >= 0) {
    if (g_state.mode == ProbeMode::SingleActive) {
      stopProbe("single-channel test complete");
      return;
    }

    if (g_state.mode == ProbeMode::SweepActive) {
      const float next_hz = g_state.current_tone_hz + kSweepStepHz;
      if (next_hz > kSweepStopHz + 0.001f) {
        stopProbe("selected-channel frequency sweep complete");
        return;
      }
      i2s_zero_dma_buffer(kI2sPort);
      g_state.current_tone_hz = next_hz;
      g_state.phase = 0.0f;
      g_state.tone_sample_cursor = 0;
      g_state.state_deadline_ms = now + kSweepStepDurationMs;
      Serial.printf("SWEEP STEP: CH%u %.0fHz\n",
                    static_cast<unsigned>(g_state.active_slot + 1),
                    static_cast<double>(g_state.current_tone_hz));
      drawStatus();
      return;
    }

    i2s_zero_dma_buffer(kI2sPort);
    if (g_state.active_slot + 1 >= kUsedSlots) {
      stopProbe("CH1 -> CH4 sequence complete");
      return;
    }
    ++g_state.active_slot;
    g_state.mode = ProbeMode::SequenceGap;
    g_state.state_deadline_ms = now + kInterChannelMuteMs;
    Serial.printf("GAP: digital silence before CH%u\n",
                  static_cast<unsigned>(g_state.active_slot + 1));
    drawStatus("INTER-CH SILENCE");
    return;
  }

  if (g_state.mode == ProbeMode::SequenceGap &&
      static_cast<int32_t>(now - g_state.state_deadline_ms) >= 0) {
    beginActiveSlot(g_state.active_slot, ProbeMode::SequenceActive);
    return;
  }

  if (g_state.i2s_ready && !writeTdmBlock(active)) {
    enterFault("I2S DMA write failed or timed out");
  }
}

void printHelp() {
  Serial.println("Commands:");
  Serial.println("  status     - show I2S format and digital-output state");
  Serial.println("  ch 1..4    - select one channel while digitally silent");
  Serial.println("  start      - run the selected channel for 1.2 s");
  Serial.println("  go         - run CH1 -> CH4 with digitally silent gaps");
  Serial.println("  sweep      - compare 120..320 Hz on the selected channel");
  Serial.println("  level PCT  - set start/go level from 0.5 to 20.0% while idle");
  Serial.println("  stop|mute  - immediately request digital silence and zero DMA");
  Serial.println("  help       - print this list");
  Serial.println("S1 is manual: OFF=hardware mute, ON=run. Firmware cannot verify S1.");
  Serial.println("Boot sends only zeros. Button click=start selected; hold=STOP.");
}

void handleConsoleCommand(const char* command) {
  if (std::strcmp(command, "status") == 0) {
    printStatus();
  } else if (std::strcmp(command, "start") == 0) {
    startSelectedChannel();
  } else if (std::strcmp(command, "go") == 0) {
    startSequence();
  } else if (std::strcmp(command, "sweep") == 0) {
    startSelectedSweep();
  } else if (std::strncmp(command, "level ", 6) == 0) {
    if (g_state.mode != ProbeMode::IdleSilent) {
      Serial.println("Level change rejected: stop the current run first.");
      return;
    }
    float percent = 0.0f;
    if (std::sscanf(command + 6, "%f", &percent) != 1) {
      Serial.println("Invalid level. Use: level 0.5..20.0");
      return;
    }
    const float requested_level = percent / 100.0f;
    if (requested_level < kMinimumAdjustableDigitalLevel ||
        requested_level > kHardDigitalLevelLimit) {
      Serial.println("Level rejected: allowed range is 0.5..20.0%.");
      return;
    }
    g_state.test_digital_level = requested_level;
    Serial.printf("Probe level set to %.1f%% (hard limit %.1f%%).\n",
                  static_cast<double>(g_state.test_digital_level * 100.0f),
                  static_cast<double>(kHardDigitalLevelLimit * 100.0f));
    drawStatus();
  } else if (std::strcmp(command, "stop") == 0 || std::strcmp(command, "mute") == 0) {
    stopProbe("operator stop");
  } else if (std::strncmp(command, "ch ", 3) == 0 &&
             command[3] >= '1' && command[3] <= '4' && command[4] == '\0') {
    if (g_state.mode != ProbeMode::IdleSilent) {
      Serial.println("Channel selection rejected: stop the current run first.");
      return;
    }
    g_state.selected_slot = static_cast<uint8_t>(command[3] - '1');
    Serial.printf("Selected CH%u / slot%u. Type 'start' to run it.\n",
                  static_cast<unsigned>(g_state.selected_slot + 1),
                  static_cast<unsigned>(g_state.selected_slot));
    drawStatus();
  } else if (std::strcmp(command, "help") == 0 || std::strcmp(command, "?") == 0) {
    printHelp();
  } else if (command[0] != '\0') {
    Serial.printf("Unknown command: %s\n", command);
    printHelp();
  }
}

void pollConsole() {
  while (Serial.available() > 0) {
    const int raw = Serial.read();
    if (raw < 0) {
      return;
    }
    const char ch = static_cast<char>(raw);
    if (ch == '\r' || ch == '\n') {
      if (g_console_length > 0) {
        g_console_buffer[g_console_length] = '\0';
        handleConsoleCommand(g_console_buffer);
        g_console_length = 0;
      }
      continue;
    }
    if (g_console_length + 1 < sizeof(g_console_buffer)) {
      g_console_buffer[g_console_length++] = ch;
    }
  }
}

}  // namespace

void setup() {
  auto config = M5.config();
  config.fallback_board = m5::board_t::board_M5AtomS3;
  config.internal_imu = false;
  config.internal_rtc = false;
  config.internal_mic = false;
  config.output_power = false;
  M5.begin(config);

  Serial.begin(115200);
  const uint32_t serial_wait_start = millis();
  while (!Serial && millis() - serial_wait_start < 1200) {
    delay(10);
  }

  M5.Display.setRotation(0);
  g_state.mode = ProbeMode::Fault;
  drawStatus("BOOT/SILENCE");

  Serial.println();
  Serial.println("AtomS3 MAX98357A 4-channel TDM safe probe started.");
  Serial.println("Safety: boot sends only zero samples; explicit START/GO is required for a signal.");
  Serial.println("Final PCB uses manual S1: OFF=hardware mute, ON=run; firmware cannot read it.");
  Serial.println("Keep S1 OFF before applying 12V or changing transducer wiring.");

  if (!installTdm()) {
    enterFault("ESP32-S3 I2S TDM initialization failed");
    return;
  }

  g_state.mode = ProbeMode::IdleSilent;
  Serial.printf("Ready: PCM-short %lu Hz / %u-bit / %u slots, BCLK=%lu Hz.\n",
                static_cast<unsigned long>(kSampleRateHz),
                static_cast<unsigned>(kBitsPerSlot),
                static_cast<unsigned>(kSlotsPerFrame),
                static_cast<unsigned long>(kBclkFrequencyHz));
  Serial.println("Slot map: CH1=slot0, CH2=slot1, CH3=slot2, CH4=slot3; slots4..7 are zero.");
  printHelp();
  printStatus();
  drawStatus();
}

void loop() {
  M5.update();
  pollConsole();

  if (M5.BtnA.wasHold()) {
    stopProbe("button hold");
  } else if (M5.BtnA.wasClicked()) {
    if (g_state.mode == ProbeMode::IdleSilent) {
      startSelectedChannel();
    } else {
      stopProbe("button click during run");
    }
  }

  serviceStateMachine();
  delay(1);
}

#endif  // HAPTICS_ATOMS3_TDM_PROBE_ENABLE
