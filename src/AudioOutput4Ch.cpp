#include "haptics/AudioOutput4Ch.hpp"

#include <Arduino.h>
#include <M5Unified.h>

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
constexpr float kTwoChannelVerticalMix = 0.40f;
constexpr size_t kMaxRenderFrames = 256;
constexpr uint32_t kDemoCompatSampleRateHz = 48000;
constexpr uint16_t kDemoCompatDmaBufLen = 240;
constexpr uint8_t kDemoCompatDmaBufCount = 3;
constexpr uint8_t kDemoCompatSpeakerVolume = 255;

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
  port_installed_.fill(false);
  demo_buffer_index_ = 0;
  demo_speaker_installed_ = false;
  noise_state_ = 0x12345678u;
#endif
  return configure(params);
}

bool AudioOutput4Ch::configure(const SystemParams& params) {
  const bool was_demo_compat = usesDemoCompatMode();
  const bool was_using_second_bus = usesSecondBus();
  const uint32_t previous_sample_rate = effectiveSampleRateHz();
  const uint16_t previous_dma_buf_len = effectiveDmaBufLen();
  const uint8_t previous_dma_buf_count = effectiveDmaBufCount();
  params_ = params;
  enabled_ = params.features.enable_audio_output && params.audio.runtime_enable;

#if HAPTICS_ENABLE_AUDIO_BACKEND
  smoothed_frame_ = {};
  if (params_.features.enable_audio_output) {
    const bool need_reinstall = !installed_ || port_installed_[1] != usesSecondBus() ||
                                was_using_second_bus != usesSecondBus() || was_demo_compat != usesDemoCompatMode() ||
                                previous_sample_rate != effectiveSampleRateHz() ||
                                previous_dma_buf_len != effectiveDmaBufLen() ||
                                previous_dma_buf_count != effectiveDmaBufCount();
    if (need_reinstall) {
      if (usesDemoCompatMode()) {
        uninstallDriver();
        if (!installDemoCompatSpeaker()) {
          enabled_ = false;
          return false;
        }
      } else {
        uninstallDemoCompatSpeaker();
        if (!installDriver()) {
          enabled_ = false;
          return false;
        }
      }
    }
  } else {
    uninstallDriver();
    uninstallDemoCompatSpeaker();
  }
#endif

  return true;
}

AudioBackendStatus AudioOutput4Ch::status() const {
  AudioBackendStatus status{};
  const bool valid_test_wall =
      params_.audio.output_layout == AudioOutputLayout::QuadWall4Ch || params_.audio.channel_test_wall == WallId::Front ||
      params_.audio.channel_test_wall == WallId::Back;
  status.compile_enabled = HAPTICS_ENABLE_AUDIO_BACKEND != 0;
  status.runtime_enabled =
#if HAPTICS_ENABLE_AUDIO_BACKEND
      enabled_ && installed_;
#else
      false;
#endif
  status.demo_compat_mode = usesDemoCompatMode();
  status.output_layout = params_.audio.output_layout;
  status.active_output_channels =
      params_.audio.output_layout == AudioOutputLayout::FrontBack2Ch ? static_cast<uint8_t>(2) : static_cast<uint8_t>(4);
  status.test_mode =
      status.runtime_enabled && params_.audio.channel_test_enable && params_.audio.channel_test_wall != WallId::None &&
      valid_test_wall;
  status.test_wall = status.test_mode ? params_.audio.channel_test_wall : WallId::None;
  status.underrun_count = underrun_count_;
  return status;
}

bool AudioOutput4Ch::usesDemoCompatMode() const {
  return params_.audio.demo_compat_mode;
}

bool AudioOutput4Ch::usesSecondBus() const {
  return !usesDemoCompatMode() && params_.audio.output_layout == AudioOutputLayout::QuadWall4Ch;
}

uint32_t AudioOutput4Ch::effectiveSampleRateHz() const {
  return usesDemoCompatMode() ? kDemoCompatSampleRateHz : params_.audio.sample_rate_hz;
}

uint16_t AudioOutput4Ch::effectiveDmaBufLen() const {
  return usesDemoCompatMode() ? kDemoCompatDmaBufLen : params_.audio.dma_buf_len;
}

uint8_t AudioOutput4Ch::effectiveDmaBufCount() const {
  return usesDemoCompatMode() ? kDemoCompatDmaBufCount : params_.audio.dma_buf_count;
}

#if HAPTICS_ENABLE_AUDIO_BACKEND

bool AudioOutput4Ch::installDemoCompatSpeaker() {
  uninstallDemoCompatSpeaker();

  auto spk_cfg = M5.Speaker.config();
  spk_cfg.pin_bck = params_.pins.i2s0_bck;
  spk_cfg.pin_ws = params_.pins.i2s0_ws;
  spk_cfg.pin_data_out = params_.pins.i2s0_dout;
  spk_cfg.pin_mck = I2S_PIN_NO_CHANGE;
  spk_cfg.i2s_port = I2S_NUM_0;
  spk_cfg.sample_rate = kDemoCompatSampleRateHz;
  spk_cfg.stereo = false;
  spk_cfg.buzzer = false;
  spk_cfg.use_dac = false;
  spk_cfg.dma_buf_len = kDemoCompatDmaBufLen;
  spk_cfg.dma_buf_count = kDemoCompatDmaBufCount;

  M5.Speaker.end();
  M5.Speaker.config(spk_cfg);
  M5.Speaker.setVolume(kDemoCompatSpeakerVolume);

  demo_buffer_index_ = 0;
  demo_speaker_installed_ = M5.Speaker.begin();
  installed_ = demo_speaker_installed_;
  return demo_speaker_installed_;
}

void AudioOutput4Ch::uninstallDemoCompatSpeaker() {
  if (!demo_speaker_installed_) {
    return;
  }
  M5.Speaker.stop();
  M5.Speaker.end();
  demo_speaker_installed_ = false;
  installed_ = false;
}

bool AudioOutput4Ch::installDriver() {
  uninstallDriver();

  const i2s_config_t config = {
      .mode = static_cast<i2s_mode_t>(I2S_MODE_MASTER | I2S_MODE_TX),
      .sample_rate = effectiveSampleRateHz(),
      .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
      .channel_format = usesDemoCompatMode() ? I2S_CHANNEL_FMT_ONLY_RIGHT : I2S_CHANNEL_FMT_RIGHT_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = 0,
      .dma_buf_count = std::max<int>(2, effectiveDmaBufCount()),
      .dma_buf_len = std::max<int>(16, std::min<int>(effectiveDmaBufLen(), kMaxRenderFrames)),
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
  port_installed_[0] = true;
  if (i2s_set_pin(I2S_NUM_0, &pins0) != ESP_OK) {
    underrun_count_++;
    uninstallDriver();
    return false;
  }
  if (i2s_zero_dma_buffer(I2S_NUM_0) != ESP_OK) {
    underrun_count_++;
  }

  if (usesSecondBus()) {
    if (i2s_driver_install(I2S_NUM_1, &config, 0, nullptr) != ESP_OK) {
      underrun_count_++;
      uninstallDriver();
      return false;
    }
    port_installed_[1] = true;
    if (i2s_set_pin(I2S_NUM_1, &pins1) != ESP_OK) {
      underrun_count_++;
      uninstallDriver();
      return false;
    }
    if (i2s_zero_dma_buffer(I2S_NUM_1) != ESP_OK) {
      underrun_count_++;
    }
  }

  installed_ = true;
  return true;
}

void AudioOutput4Ch::uninstallDriver() {
  if (!installed_ && !port_installed_[0] && !port_installed_[1]) {
    return;
  }
  if (port_installed_[0]) {
    i2s_zero_dma_buffer(I2S_NUM_0);
    i2s_driver_uninstall(I2S_NUM_0);
    port_installed_[0] = false;
  }
  if (port_installed_[1]) {
    i2s_zero_dma_buffer(I2S_NUM_1);
    i2s_driver_uninstall(I2S_NUM_1);
    port_installed_[1] = false;
  }
  installed_ = false;
}

DriveFrame4 AudioOutput4Ch::effectiveFrame(const DriveFrame4& frame) const {
  if (!enabled_) {
    return {};
  }

  DriveFrame4 candidate = frame;
  if (params_.audio.channel_test_enable && params_.audio.channel_test_wall != WallId::None) {
    DriveFrame4 test_frame{};
    const auto channel = static_cast<size_t>(params_.audio.channel_test_wall);
    const bool layout_allows_wall =
        params_.audio.output_layout == AudioOutputLayout::QuadWall4Ch ||
        params_.audio.channel_test_wall == WallId::Front || params_.audio.channel_test_wall == WallId::Back;
    if (layout_allows_wall && channel < test_frame.low.size()) {
      test_frame.low[channel] = clampf(params_.audio.channel_test_level, 0.0f, 1.0f);
    }
    candidate = test_frame;
  }

  if (params_.audio.output_layout == AudioOutputLayout::FrontBack2Ch) {
    DriveFrame4 collapsed{};
    const float vertical_low = kTwoChannelVerticalMix * (candidate.low[2] + candidate.low[3]);
    const float vertical_high = kTwoChannelVerticalMix * (candidate.high[2] + candidate.high[3]);
    const float vertical_noise = kTwoChannelVerticalMix * (candidate.noise[2] + candidate.noise[3]);
    for (int i = 0; i < 2; ++i) {
      collapsed.low[i] = clampf(candidate.low[i] + vertical_low, 0.0f, 1.0f);
      collapsed.high[i] = clampf(candidate.high[i] + vertical_high, 0.0f, 1.0f);
      collapsed.noise[i] = clampf(candidate.noise[i] + vertical_noise, 0.0f, 1.0f);
    }
    return collapsed;
  }

  return candidate;
}

float AudioOutput4Ch::nextSample(float env_low, float env_high, float env_noise, int channel_index) {
  const float sample_rate = std::max<float>(1.0f, effectiveSampleRateHz());
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
  const float output_gain = std::max(0.0f, params_.audio.output_gain);
  return clampf(output_gain * kOutputScale * (kLowScale * low + kHighScale * high + kNoiseScale * noise), -1.0f,
                1.0f);
}

void AudioOutput4Ch::renderBusBlock(int port_index, int left_channel, int right_channel, const DriveFrame4& frame) {
  const size_t render_frames = std::max<size_t>(16, std::min<size_t>(effectiveDmaBufLen(), kMaxRenderFrames));
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

void AudioOutput4Ch::renderMonoBusBlock(int port_index, int left_channel, int right_channel, const DriveFrame4& frame) {
  const size_t render_frames = std::max<size_t>(16, std::min<size_t>(effectiveDmaBufLen(), kMaxRenderFrames));
  std::array<int16_t, kMaxRenderFrames> samples{};

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
    const float mono = clampf(left + right, -1.0f, 1.0f);
    samples[i] = static_cast<int16_t>(mono * 32767.0f);
  }

  const i2s_port_t port = port_index == 0 ? I2S_NUM_0 : I2S_NUM_1;
  const size_t bytes_to_write = render_frames * sizeof(int16_t);
  size_t bytes_written = 0;
  const esp_err_t result =
      i2s_write(port, samples.data(), bytes_to_write, &bytes_written, pdMS_TO_TICKS(10));
  if (result != ESP_OK || bytes_written != bytes_to_write) {
    underrun_count_++;
  }
}

void AudioOutput4Ch::renderDemoCompatFrame(int left_channel, int right_channel, const DriveFrame4& frame) {
  if (!demo_speaker_installed_) {
    return;
  }

  auto& buffer = demo_buffers_[demo_buffer_index_];
  for (size_t i = 0; i < buffer.size(); ++i) {
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
    const float mono = clampf(left + right, -1.0f, 1.0f);
    buffer[i] = static_cast<int16_t>(mono * 32767.0f);
  }

  const size_t playing_state = M5.Speaker.isPlaying(0);
  const bool stop_current = playing_state == 0;
  if (!M5.Speaker.playRaw(buffer.data(), buffer.size(), kDemoCompatSampleRateHz, false, 1, 0, stop_current)) {
    underrun_count_++;
  }
  demo_buffer_index_ = static_cast<uint8_t>((demo_buffer_index_ + 1u) % demo_buffers_.size());
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
  if (usesDemoCompatMode()) {
    renderDemoCompatFrame(static_cast<int>(WallId::Front), static_cast<int>(WallId::Back), active_frame);
  } else {
    renderBusBlock(0, static_cast<int>(WallId::Front), static_cast<int>(WallId::Back), active_frame);
  }
  if (!usesDemoCompatMode() && usesSecondBus()) {
    renderBusBlock(1, static_cast<int>(WallId::Top), static_cast<int>(WallId::Bottom), active_frame);
  }
#endif
}

}  // namespace haptics
