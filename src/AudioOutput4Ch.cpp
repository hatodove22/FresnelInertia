#include "haptics/AudioOutput4Ch.hpp"

#include <Arduino.h>

#include <algorithm>
#include <array>
#include <cmath>

#if HAPTICS_ENABLE_AUDIO_BACKEND
#include <driver/i2s.h>
#include <freertos/FreeRTOS.h>
#endif

namespace haptics {
namespace {

constexpr float kTwoPi = 6.28318530717958647692f;
constexpr float kEnvelopeSlew = 0.20f;
constexpr float kLowScale = 0.55f;
constexpr float kHighScale = 0.35f;
constexpr float kNoiseScale = 0.20f;
constexpr float kOutputScale = 0.60f;
constexpr size_t kMaxRenderFrames = 128;

float clampf(float value, float lo, float hi) {
  return std::max(lo, std::min(value, hi));
}

#if HAPTICS_ENABLE_AUDIO_BACKEND
uint32_t xorshift32(uint32_t& state) {
  state ^= state << 13;
  state ^= state >> 17;
  state ^= state << 5;
  return state;
}
#endif

}  // namespace

bool AudioOutput4Ch::begin(const SystemParams& params) {
  params_ = params;
  underrun_count_ = 0;
  installed_ = false;
#if HAPTICS_ENABLE_AUDIO_BACKEND
  smoothed_frame_ = {};
  low_phase_.fill(0.0f);
  high_phase_.fill(0.0f);
  noise_state_ = 0x12345678u;
#endif
  return configure(params);
}

bool AudioOutput4Ch::configure(const SystemParams& params) {
  params_ = params;
  enabled_ = params.features.enable_audio_output && params.audio.runtime_enable;

#if HAPTICS_ENABLE_AUDIO_BACKEND
  if (params_.features.enable_audio_output) {
    if (!installed_ && !installDriver()) {
      enabled_ = false;
      return false;
    }
  } else if (installed_) {
    uninstallDriver();
  }
#endif

  return true;
}

AudioBackendStatus AudioOutput4Ch::status() const {
  AudioBackendStatus status{};
  status.compile_enabled = HAPTICS_ENABLE_AUDIO_BACKEND != 0;
  status.runtime_enabled =
#if HAPTICS_ENABLE_AUDIO_BACKEND
      enabled_ && installed_;
#else
      false;
#endif
  status.test_mode =
      status.runtime_enabled && params_.audio.channel_test_enable && params_.audio.channel_test_wall != WallId::None;
  status.test_wall = params_.audio.channel_test_wall;
  status.underrun_count = underrun_count_;
  return status;
}

#if HAPTICS_ENABLE_AUDIO_BACKEND
bool AudioOutput4Ch::installDriver() {
  uninstallDriver();

  const i2s_config_t config = {
      .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = params_.audio.sample_rate_hz,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_MSB,
      .intr_alloc_flags = 0,
      .dma_buf_count = std::max<int>(2, params_.audio.dma_buf_count),
      .dma_buf_len = std::max<int>(16, std::min<int>(params_.audio.dma_buf_len, kMaxRenderFrames)),
      .use_apll = false,
      .tx_desc_auto_clear = true,
      .fixed_mclk = 0,
      .mclk_multiple = I2S_MCLK_MULTIPLE_256,
      .bits_per_chan = I2S_BITS_PER_CHAN_DEFAULT,
  };

  const i2s_pin_config_t pins0 = {
      .mck_io_num = I2S_PIN_NO_CHANGE,
      .bck_io_num = params_.pins.i2s0_bck,
      .ws_io_num = params_.pins.i2s0_ws,
      .data_out_num = params_.pins.i2s0_dout,
      .data_in_num = I2S_PIN_NO_CHANGE,
  };
  const i2s_pin_config_t pins1 = {
      .mck_io_num = I2S_PIN_NO_CHANGE,
      .bck_io_num = params_.pins.i2s1_bck,
      .ws_io_num = params_.pins.i2s1_ws,
      .data_out_num = params_.pins.i2s1_dout,
      .data_in_num = I2S_PIN_NO_CHANGE,
  };

  if (i2s_driver_install(I2S_NUM_0, &config, 0, nullptr) != ESP_OK) {
    underrun_count_++;
    return false;
  }
  if (i2s_set_pin(I2S_NUM_0, &pins0) != ESP_OK) {
    underrun_count_++;
    uninstallDriver();
    return false;
  }
  if (i2s_zero_dma_buffer(I2S_NUM_0) != ESP_OK) {
    underrun_count_++;
  }

  if (i2s_driver_install(I2S_NUM_1, &config, 0, nullptr) != ESP_OK) {
    underrun_count_++;
    uninstallDriver();
    return false;
  }
  if (i2s_set_pin(I2S_NUM_1, &pins1) != ESP_OK) {
    underrun_count_++;
    uninstallDriver();
    return false;
  }
  if (i2s_zero_dma_buffer(I2S_NUM_1) != ESP_OK) {
    underrun_count_++;
  }

  installed_ = true;
  return true;
}

void AudioOutput4Ch::uninstallDriver() {
  if (!installed_) {
    return;
  }
  i2s_zero_dma_buffer(I2S_NUM_0);
  i2s_zero_dma_buffer(I2S_NUM_1);
  i2s_driver_uninstall(I2S_NUM_0);
  i2s_driver_uninstall(I2S_NUM_1);
  installed_ = false;
}

DriveFrame4 AudioOutput4Ch::effectiveFrame(const DriveFrame4& frame) const {
  if (!enabled_) {
    return {};
  }

  if (params_.audio.channel_test_enable && params_.audio.channel_test_wall != WallId::None) {
    DriveFrame4 test_frame{};
    const auto channel = static_cast<size_t>(params_.audio.channel_test_wall);
    if (channel < test_frame.low.size()) {
      test_frame.low[channel] = clampf(params_.audio.channel_test_level, 0.0f, 1.0f);
    }
    return test_frame;
  }

  return frame;
}

float AudioOutput4Ch::nextSample(float env_low, float env_high, float env_noise, int channel_index) {
  const float sample_rate = std::max<float>(1.0f, params_.audio.sample_rate_hz);
  const float low_step = kTwoPi * params_.resonance.low_carrier_hz[channel_index] / sample_rate;
  const float high_step = kTwoPi * params_.resonance.high_carrier_hz[channel_index] / sample_rate;

  low_phase_[channel_index] += low_step;
  if (low_phase_[channel_index] >= kTwoPi) {
    low_phase_[channel_index] -= kTwoPi;
  }

  high_phase_[channel_index] += high_step;
  if (high_phase_[channel_index] >= kTwoPi) {
    high_phase_[channel_index] -= kTwoPi;
  }

  const float low = env_low * std::sin(low_phase_[channel_index]);
  const float high = env_high * std::sin(high_phase_[channel_index]);
  const float noise = env_noise * ((static_cast<int32_t>(xorshift32(noise_state_)) & 0xFFFF) / 32768.0f - 1.0f);
  return clampf(kOutputScale * (kLowScale * low + kHighScale * high + kNoiseScale * noise), -1.0f, 1.0f);
}

void AudioOutput4Ch::renderBusBlock(int port_index, int left_channel, int right_channel, const DriveFrame4& frame) {
  const size_t render_frames = std::max<size_t>(16, std::min<size_t>(params_.audio.dma_buf_len, kMaxRenderFrames));
  std::array<int16_t, kMaxRenderFrames * 2> samples{};

  for (size_t i = 0; i < render_frames; ++i) {
    smoothed_frame_.low[left_channel] += (frame.low[left_channel] - smoothed_frame_.low[left_channel]) * kEnvelopeSlew;
    smoothed_frame_.high[left_channel] +=
        (frame.high[left_channel] - smoothed_frame_.high[left_channel]) * kEnvelopeSlew;
    smoothed_frame_.noise[left_channel] +=
        (frame.noise[left_channel] - smoothed_frame_.noise[left_channel]) * kEnvelopeSlew;

    smoothed_frame_.low[right_channel] +=
        (frame.low[right_channel] - smoothed_frame_.low[right_channel]) * kEnvelopeSlew;
    smoothed_frame_.high[right_channel] +=
        (frame.high[right_channel] - smoothed_frame_.high[right_channel]) * kEnvelopeSlew;
    smoothed_frame_.noise[right_channel] +=
        (frame.noise[right_channel] - smoothed_frame_.noise[right_channel]) * kEnvelopeSlew;

    const float left = nextSample(
        smoothed_frame_.low[left_channel], smoothed_frame_.high[left_channel], smoothed_frame_.noise[left_channel],
        left_channel);
    const float right = nextSample(
        smoothed_frame_.low[right_channel], smoothed_frame_.high[right_channel], smoothed_frame_.noise[right_channel],
        right_channel);
    samples[i * 2] = static_cast<int16_t>(left * 32767.0f);
    samples[i * 2 + 1] = static_cast<int16_t>(right * 32767.0f);
  }

  const i2s_port_t port = port_index == 0 ? I2S_NUM_0 : I2S_NUM_1;
  const size_t bytes_to_write = render_frames * 2 * sizeof(int16_t);
  size_t bytes_written = 0;
  const esp_err_t result =
      i2s_write(port, samples.data(), bytes_to_write, &bytes_written, pdMS_TO_TICKS(10));
  if (result != ESP_OK || bytes_written != bytes_to_write) {
    underrun_count_++;
  }
}
#endif

void AudioOutput4Ch::submit(const DriveFrame4& frame) {
#if !HAPTICS_ENABLE_AUDIO_BACKEND
  (void)frame;
  return;
#else
  if (!installed_) {
    return;
  }

  const DriveFrame4 active_frame = effectiveFrame(frame);
  renderBusBlock(0, static_cast<int>(WallId::Front), static_cast<int>(WallId::Back), active_frame);
  renderBusBlock(1, static_cast<int>(WallId::Top), static_cast<int>(WallId::Bottom), active_frame);
#endif
}

}  // namespace haptics
