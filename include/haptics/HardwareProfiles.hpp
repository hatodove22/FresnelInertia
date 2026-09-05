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
  params.pins.dynamixel_tx = 1;
  params.pins.dynamixel_rx = 2;
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
  params.features.enable_gravity_separated_mass_activity = true;
  // Measured in three static orientations on the assembled device. The model
  // uses a right-handed body frame even though the operator's semantic
  // +z-forward convention is left-handed with +x-right and +y-up.
  params.features.enable_device_frame_transform = true;
  params.features.enable_coherent_container_demo = true;

  // The as-built DXL2 path uses separate TX/RX pins and automatic
  // half-duplex direction on the PCB. Keep it disarmed at boot. The dedicated
  // tilt image uses the model's intended +/-10 degree tactile-rendering range;
  // generic profiles and the bounded point-to-point probes remain unchanged.
  params.tilt.bus_baud = 57600;
  params.tilt.current_based_position_mode = false;
  params.tilt.min_angle_deg = -10.0f;
  params.tilt.max_angle_deg = 10.0f;
  params.tilt.max_tilt_deg = 10.0f;
  params.tilt.max_total_cmd_deg = 10.0f;
  // Direct +/-10 degree travel was clearly perceptible in the mounted/gripped
  // device, while the generic pseudo-force mapping used only about 1--3
  // degrees in Live. Strengthen only this as-built evaluation profile so
  // ordinary handling can exercise the proven mechanical range. The final
  // command remains hard-clamped to +/-10 degrees.
  params.tilt.k_phi = 4.0f;
  // Mounted evaluation found the pseudo-force response strong enough but
  // reversed with respect to the handled-device tilt. These signs calibrate
  // the model-to-contact-plane direction only. A direct mounted +/-10-degree
  // check subsequently confirmed that equal-and-opposite logical angles with
  // the old +1/-1 raw pair moved both parallel-mounted contact planes in the
  // same world direction. Use matching raw directions so logical common and
  // differential modes remain physically common and differential.
  params.tilt.sign_thumb = -1.0f;
  params.tilt.sign_index = -1.0f;
  params.tilt.max_delta_cm_deg = 5.0f;
  params.tilt.max_delta_df_deg = 10.0f;
  params.tilt.max_delta_total_deg = 10.0f;
  params.tilt.max_travel_pulses = 114;
  params.tilt.thumb_raw_direction = 1;
  params.tilt.index_raw_direction = 1;
  // The production controller streams an already filtered and bounded Goal
  // Position every 10 ms. Disable the XL330 point-to-point profile so each
  // update follows that software trajectory directly instead of repeatedly
  // replanning a much slower servo-side velocity trajectory.
  params.tilt.profile_acceleration = 0;
  params.tilt.profile_velocity = 0;
  // Gain 1200 passed the unloaded 40-pulse bring-up probe. The tactile
  // evaluation image deliberately uses higher stiffness and output authority
  // so the two planes remain perceptible while the device is gripped.
  params.tilt.position_p_gain = 2000;
  params.tilt.goal_pwm_limit = 600;
  params.tilt.bus_watchdog_20ms = 50;
  params.tilt.abort_current_ma = 1200;
  params.tilt.abort_temperature_c = 60;
  params.tilt.min_voltage_decivolt = 45;
  params.tilt.max_voltage_decivolt = 56;
}

}  // namespace haptics
