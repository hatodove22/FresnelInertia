#pragma once

#include "haptics/Parameters.hpp"

namespace haptics {

// Runtime settings for the assembled M5AtomS3_MAX98357A_4CH_TDM_DXL2 PCB.
// The profile deliberately keeps haptic output muted and the legacy servo
// backend disabled at boot. S1 remains a manual hardware mute.
inline void applyAsBuiltAtomS3Profile(SystemParams& params) {
  params.pins.i2s0_bck = 5;
  params.pins.i2s0_ws = 6;
  params.pins.i2s0_dout = 7;
  params.pins.use_ext_5v_output = false;

  params.audio.transport = AudioTransport::Tdm8Slot;
  params.audio.output_layout = AudioOutputLayout::QuadWall4Ch;
  params.audio.sample_rate_hz = 48000;
  params.audio.dma_buf_len = 240;
  params.audio.dma_buf_count = 12;
  params.audio.demo_compat_mode = false;
  params.audio.runtime_enable = false;
  params.audio.keep_driver_installed_when_muted = true;
  params.audio.output_gain = 1.0f;
  params.audio.output_peak_limit = 0.08f;

  // Install the TDM transport in a zero-data state, while leaving the actual
  // haptic signal gate off until an explicit `audio on` command.
  params.features.enable_audio_output = false;
  params.features.enable_tilt_plane = false;
  params.features.enable_physical_master_gain = true;
  params.features.enable_attack_preserving_texture = true;
  params.features.enable_single_shot_spatial_delay = true;
  params.features.enable_imu_stale_safe_stop = true;
}

}  // namespace haptics
