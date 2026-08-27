#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

#ifndef HAPTICS_ENABLE_AUDIO_BACKEND
#define HAPTICS_ENABLE_AUDIO_BACKEND 0
#endif

#ifndef HAPTICS_ENABLE_TDM_AUDIO_BACKEND
#define HAPTICS_ENABLE_TDM_AUDIO_BACKEND 0
#endif

#ifndef HAPTICS_AUDIO_HARD_PEAK_LIMIT_PERMILLE
#define HAPTICS_AUDIO_HARD_PEAK_LIMIT_PERMILLE 1000
#endif

class AudioOutput4Ch {
 public:
  bool begin(const SystemParams& params);
  bool configure(const SystemParams& params);
  void submit(const DriveFrame4& frame);
  void submitSilence();
  bool isEnabled() const { return enabled_; }
  bool isCompileEnabled() const { return HAPTICS_ENABLE_AUDIO_BACKEND != 0; }
  bool supportsTransport(AudioTransport transport) const {
    switch (transport) {
      case AudioTransport::DualI2s:
        return true;
      case AudioTransport::Tdm8Slot:
        return HAPTICS_ENABLE_TDM_AUDIO_BACKEND != 0;
      default:
        return false;
    }
  }
  AudioBackendStatus status() const;

 private:
  bool usesDemoCompatMode() const;
  bool usesTdmTransport() const;
  bool usesSecondBus() const;
  bool wantsDriverInstalled() const;
  float effectivePeakLimit() const;
  uint32_t effectiveSampleRateHz() const;
  uint16_t effectiveDmaBufLen() const;
  uint8_t effectiveDmaBufCount() const;
#if HAPTICS_ENABLE_AUDIO_BACKEND
  bool installDriver();
  bool installDualI2sDriver();
  bool installTdmDriver();
  bool uninstallDriver();
  bool clearHardwareOutput();
  bool installDemoCompatSpeaker();
  void uninstallDemoCompatSpeaker();
  DriveFrame4 effectiveFrame(const DriveFrame4& frame) const;
  void renderBusBlock(int port_index, int left_channel, int right_channel, const DriveFrame4& frame);
  void renderTdmBlock(const DriveFrame4& frame);
  void renderMonoBusBlock(int port_index, int left_channel, int right_channel, const DriveFrame4& frame);
  void renderDemoCompatFrame(int left_channel, int right_channel, const DriveFrame4& frame);
  float nextSample(float env_low, float env_high, float env_noise, int channel_index);
  DriveFrame4 smoothed_frame_{};
  std::array<float, 4> low_phase_{};
  std::array<float, 4> high_phase_{};
  std::array<bool, 2> port_installed_{};
  std::array<int16_t, 256 * 8> tdm_samples_{};
  std::array<std::array<int16_t, 240>, 3> demo_buffers_{};
  uint8_t demo_buffer_index_ = 0;
  bool demo_speaker_installed_ = false;
  uint32_t noise_state_ = 0x12345678u;
#endif
  SystemParams params_{};
  bool enabled_ = false;
  bool installed_ = false;
  bool silence_asserted_ = true;
  uint32_t underrun_count_ = 0;
};

}  // namespace haptics
