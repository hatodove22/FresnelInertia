#pragma once

#include <array>
#include <cstdint>
#include <cstring>

#include "haptics/Types.hpp"

namespace haptics {

struct FeatureFlags {
  bool enable_mass_layer = true;
  bool enable_event_layer = true;
  bool enable_texture_layer = true;
  bool enable_resonance_layer = true;
  bool enable_spatial_renderer = true;
  bool enable_audio_output = false;
  bool enable_tilt_plane = false;
  bool enable_remote_interface = false;
  bool enable_recorder = false;
  bool enable_runtime_calibration = false;
  bool enable_verbose_serial = true;
};

struct PlatformPins {
  // Experimental dual-stereo I2S mapping for StickS3 + MAX98360A x4.
  int i2s0_bck = 5;
  int i2s0_ws = 7;
  int i2s0_dout = 43;

  int i2s1_bck = 4;
  int i2s1_ws = 44;
  int i2s1_dout = 2;

  int dynamixel_halfduplex_data = 1;
  int dynamixel_direction = 8;
  bool use_ext_5v_output = true;
};

struct ContainerParams {
  float span_x_m = 0.060f;
  float span_y_m = 0.060f;
  float span_z_m = 0.060f;
  float fill = 0.55f;
  float headspace = 0.45f;
  float viscosity = 0.30f;
  float particle_count = 0.0f;
  float particle_hardness = 0.0f;
  bool enable_roof_contact = false;
  MaterialFamily family = MaterialFamily::Liquid;
};

struct MassLayerParams {
  float control_rate_hz = 250.0f;
  float natural_freq_x_hz = 2.2f;
  float natural_freq_y_hz = 2.2f;
  float damping_ratio_x = 0.35f;
  float damping_ratio_y = 0.35f;
  float energy_decay_s = 0.45f;
  float accel_to_energy_gain = 0.40f;
  float gyro_to_energy_gain = 0.02f;
  float rebound = 0.25f;
};

struct EventLayerParams {
  float wall_threshold = 0.78f;
  float wall_decay_span_m = 0.012f;
  float roll_rate_hz = 8.0f;
  float impact_rate_hz = 20.0f;
  float droplet_rate_hz = 35.0f;
  float splash_threshold = 0.80f;
  float roof_slap_threshold = 0.85f;
  float scrape_threshold = 0.50f;
};

struct TextureLayerParams {
  float hard_ping_low_ms = 24.0f;
  float hard_ping_high_ms = 8.0f;
  float wet_burst_ms = 7.0f;
  float dry_rattle_ms = 10.0f;
  float scrape_noise_ms = 20.0f;
  float flow_ripple_soa_ms = 10.0f;
  float default_high_bias = 0.75f;
};

struct ResonanceLayerParams {
  std::array<float, 4> low_carrier_hz{160.0f, 160.0f, 160.0f, 160.0f};
  std::array<float, 4> high_carrier_hz{320.0f, 320.0f, 320.0f, 320.0f};
  std::array<float, 4> low_gain{1.0f, 1.0f, 1.0f, 1.0f};
  std::array<float, 4> high_gain{1.0f, 1.0f, 1.0f, 1.0f};
  float master_gain = 0.40f;
};

struct SpatialRendererParams {
  float wall_softmax_delta = 0.22f;
  float neighbor_bleed = 0.20f;
  float opposite_bleed = 0.05f;
};

struct AudioBackendParams {
  uint32_t sample_rate_hz = 24000;
  uint16_t dma_buf_len = 64;
  uint8_t dma_buf_count = 4;
  bool runtime_enable = false;
  bool channel_test_enable = false;
  WallId channel_test_wall = WallId::None;
  float channel_test_level = 0.20f;
};

struct CalibrationParams {
  float low_start_hz = 120.0f;
  float low_stop_hz = 240.0f;
  float low_step_hz = 10.0f;
  float high_start_hz = 240.0f;
  float high_stop_hz = 420.0f;
  float high_step_hz = 20.0f;
  uint16_t settle_ms = 120;
  uint16_t measure_ms = 180;
  float drive_level = 0.22f;
  float accel_response_weight = 1.0f;
  float gyro_response_weight = 0.0025f;
};

struct RecorderParams {
  char record_dir[32] = "/records";
  uint16_t flush_interval_frames = 16;
};

struct TiltPlaneParams {
  uint8_t thumb_servo_id = 1;
  uint8_t index_servo_id = 2;
  uint32_t bus_baud = 1000000;
  float thumb_home_deg = 0.0f;
  float index_home_deg = 0.0f;
  float min_angle_deg = -10.0f;
  float max_angle_deg = 10.0f;
  float max_tilt_deg = 10.0f;
  float max_velocity_deg_s = 120.0f;
  float max_current_ma = 500.0f;
  bool current_based_position_mode = true;
};

struct InterfaceParams {
  bool wifi_mode_ap = true;
  char wifi_ssid[32] = "HapticsStickS3";
  char wifi_password[32] = "haptics123";
  bool reserve_websocket_json = true;
  bool reserve_ble_gatt = true;
  bool reserve_udp_osc = true;
  uint16_t websocket_port = 8765;
  uint16_t udp_osc_port = 9000;
  uint16_t telemetry_period_ms = 100;
};

struct SystemParams {
  char preset_name[32] = "liquid_small_box";
  char preset_source[16] = "builtin";
  char preset_path[64]{};
  FeatureFlags features{};
  PlatformPins pins{};
  ContainerParams container{};
  MassLayerParams mass{};
  EventLayerParams event{};
  TextureLayerParams texture{};
  ResonanceLayerParams resonance{};
  SpatialRendererParams spatial{};
  AudioBackendParams audio{};
  CalibrationParams calibration{};
  RecorderParams recorder{};
  TiltPlaneParams tilt{};
  InterfaceParams iface{};
};

inline SystemParams makeDefaultLiquidPreset() {
  SystemParams params{};
  std::strncpy(params.preset_name, "liquid_small_box", sizeof(params.preset_name) - 1);
  std::strncpy(params.preset_source, "builtin", sizeof(params.preset_source) - 1);
  params.container.family = MaterialFamily::Liquid;
  params.container.fill = 0.55f;
  params.container.headspace = 0.45f;
  params.container.viscosity = 0.30f;
  params.event.droplet_rate_hz = 40.0f;
  params.event.wall_threshold = 0.72f;
  params.features.enable_verbose_serial = true;
  return params;
}

inline SystemParams makeDefaultLiquidDenseJarPreset() {
  SystemParams params = makeDefaultLiquidPreset();
  std::strncpy(params.preset_name, "liquid_dense_jar", sizeof(params.preset_name) - 1);
  params.container.span_x_m = 0.055f;
  params.container.span_y_m = 0.055f;
  params.container.span_z_m = 0.090f;
  params.container.fill = 0.72f;
  params.container.headspace = 0.28f;
  params.container.viscosity = 0.62f;
  params.container.enable_roof_contact = true;
  params.event.droplet_rate_hz = 22.0f;
  params.event.roof_slap_threshold = 0.86f;
  return params;
}

inline SystemParams makeDefaultLiquidHalfTubePreset() {
  SystemParams params = makeDefaultLiquidPreset();
  std::strncpy(params.preset_name, "liquid_half_tube", sizeof(params.preset_name) - 1);
  params.container.span_x_m = 0.090f;
  params.container.span_y_m = 0.045f;
  params.container.span_z_m = 0.045f;
  params.container.fill = 0.40f;
  params.container.headspace = 0.60f;
  params.container.viscosity = 0.18f;
  params.event.droplet_rate_hz = 48.0f;
  params.event.wall_threshold = 0.68f;
  return params;
}

inline SystemParams makeDefaultGranularPreset() {
  SystemParams params = makeDefaultLiquidPreset();
  std::strncpy(params.preset_name, "granular_coin_box", sizeof(params.preset_name) - 1);
  params.container.family = MaterialFamily::Granular;
  params.container.span_x_m = 0.05f;
  params.container.span_y_m = 0.05f;
  params.container.span_z_m = 0.03f;
  params.container.fill = 0.20f;
  params.container.headspace = 0.80f;
  params.container.particle_count = 0.25f;
  params.container.particle_hardness = 0.90f;
  params.container.viscosity = 0.05f;
  params.event.impact_rate_hz = 22.0f;
  params.event.roll_rate_hz = 8.0f;
  params.event.scrape_threshold = 0.40f;
  params.event.droplet_rate_hz = 0.0f;
  return params;
}

inline SystemParams makeDefaultGranularSandPreset() {
  SystemParams params = makeDefaultGranularPreset();
  std::strncpy(params.preset_name, "granular_sand_box", sizeof(params.preset_name) - 1);
  params.container.span_x_m = 0.060f;
  params.container.span_y_m = 0.060f;
  params.container.span_z_m = 0.040f;
  params.container.fill = 0.35f;
  params.container.headspace = 0.65f;
  params.container.viscosity = 0.08f;
  params.container.particle_count = 0.90f;
  params.container.particle_hardness = 0.35f;
  params.event.impact_rate_hz = 28.0f;
  params.event.roll_rate_hz = 10.0f;
  params.event.scrape_threshold = 0.55f;
  return params;
}

inline SystemParams makeDefaultGranularBeadPreset() {
  SystemParams params = makeDefaultGranularPreset();
  std::strncpy(params.preset_name, "granular_bead_box", sizeof(params.preset_name) - 1);
  params.container.span_x_m = 0.055f;
  params.container.span_y_m = 0.055f;
  params.container.span_z_m = 0.035f;
  params.container.fill = 0.28f;
  params.container.headspace = 0.72f;
  params.container.viscosity = 0.03f;
  params.container.particle_count = 0.55f;
  params.container.particle_hardness = 0.70f;
  params.event.impact_rate_hz = 24.0f;
  params.event.roll_rate_hz = 12.0f;
  params.event.scrape_threshold = 0.42f;
  return params;
}

inline SystemParams makeDefaultHybridPreset() {
  SystemParams params = makeDefaultLiquidPreset();
  std::strncpy(params.preset_name, "hybrid_ice_water", sizeof(params.preset_name) - 1);
  params.container.family = MaterialFamily::Hybrid;
  params.container.span_x_m = 0.07f;
  params.container.span_y_m = 0.07f;
  params.container.span_z_m = 0.09f;
  params.container.fill = 0.65f;
  params.container.headspace = 0.35f;
  params.container.viscosity = 0.20f;
  params.container.particle_count = 0.18f;
  params.container.particle_hardness = 0.90f;
  params.event.impact_rate_hz = 18.0f;
  params.event.droplet_rate_hz = 26.0f;
  params.event.roof_slap_threshold = 0.82f;
  return params;
}

inline SystemParams makeDefaultDetentedPreset() {
  SystemParams params = makeDefaultLiquidPreset();
  std::strncpy(params.preset_name, "detented_custom", sizeof(params.preset_name) - 1);
  params.container.family = MaterialFamily::Detented;
  params.event.scrape_threshold = 0.35f;
  return params;
}

}  // namespace haptics
