#include <unity.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

#include "haptics/EventLayer.hpp"
#include "haptics/MassMotionLayer.hpp"
#include "haptics/Parameters.hpp"
#include "haptics/ResonanceLayer.hpp"
#include "haptics/SpatialRenderer4.hpp"
#include "haptics/TextureLayer.hpp"
#include "haptics/TiltPseudoForceModel.hpp"
#include "legacy_fingerprint.hpp"

namespace {

using native_layers_test::LegacyFingerprint;

constexpr float kDtS = 1.0f / 250.0f;  // The retained control-loop cadence.
constexpr std::uint32_t kFnv1aOffset = 2166136261U;
constexpr std::uint32_t kFnv1aPrime = 16777619U;

std::uint32_t hashUint32(std::uint32_t hash, const std::uint32_t value) {
  for (std::uint32_t shift = 0; shift < 32U; shift += 8U) {
    hash ^= (value >> shift) & 0xffU;
    hash *= kFnv1aPrime;
  }
  return hash;
}

haptics::ImuSample legacySample(std::uint32_t frame) {
  haptics::ImuSample sample{};
  sample.timestamp_us = frame * 4000U;
  sample.valid = true;

  if (frame < 80U) {
    sample.accel_g = {0.0f, 0.0f, 1.0f};
    sample.gyro_dps = {};
  } else if (frame < 160U) {
    sample.accel_g = {0.55f, -0.15f, 1.05f};
    sample.gyro_dps = {8.0f, -6.0f, 30.0f};
  } else if (frame < 240U) {
    sample.accel_g = {-0.50f, 0.45f, 0.92f};
    sample.gyro_dps = {-10.0f, 7.0f, -45.0f};
  } else if (frame < 320U) {
    sample.accel_g = {0.20f, 0.10f, 1.20f};
    sample.gyro_dps = {2.0f, 3.0f, 15.0f};
  } else {
    sample.accel_g = {0.0f, 0.0f, 1.0f};
    sample.gyro_dps = {};
  }
  return sample;
}

LegacyFingerprint runLegacyTrace() {
  auto params = haptics::makeDefaultLiquidPreset();
  haptics::MassMotionLayer mass_layer;
  haptics::EventLayer event_layer;
  haptics::TextureLayer texture_layer;
  haptics::ResonanceLayer resonance_layer;
  haptics::SpatialRenderer4 spatial_renderer;
  mass_layer.configure(params);
  event_layer.configure(params);
  texture_layer.configure(params);
  resonance_layer.configure(params);
  spatial_renderer.configure(params);

  LegacyFingerprint fingerprint{};
  fingerprint.frames = 400U;
  fingerprint.discrete_timeline_hash = kFnv1aOffset;
  haptics::MassState mass{};

  for (std::uint32_t frame_index = 0; frame_index < fingerprint.frames; ++frame_index) {
    mass = mass_layer.update(legacySample(frame_index), kDtS);
    const auto events = event_layer.update(mass, kDtS);
    const auto textures = texture_layer.update(events, kDtS);
    const auto resonances = resonance_layer.update(textures);
    const auto spatial = spatial_renderer.update(resonances, kDtS);

    fingerprint.discrete_timeline_hash =
        hashUint32(fingerprint.discrete_timeline_hash, static_cast<std::uint32_t>(events.count));

    for (std::size_t i = 0; i < events.count; ++i) {
      const auto index = static_cast<std::size_t>(events.items[i].type);
      if (index < fingerprint.event_type_counts.size()) {
        ++fingerprint.event_type_counts[index];
      }
      fingerprint.discrete_timeline_hash =
          hashUint32(fingerprint.discrete_timeline_hash, static_cast<std::uint32_t>(events.items[i].type));
      fingerprint.discrete_timeline_hash = hashUint32(
          fingerprint.discrete_timeline_hash, static_cast<std::uint32_t>(events.items[i].primary_wall));
    }
    fingerprint.discrete_timeline_hash =
        hashUint32(fingerprint.discrete_timeline_hash, static_cast<std::uint32_t>(textures.count));
    for (std::size_t i = 0; i < textures.count; ++i) {
      const auto index = static_cast<std::size_t>(textures.items[i].atom);
      if (index < fingerprint.texture_atom_counts.size()) {
        ++fingerprint.texture_atom_counts[index];
      }
      fingerprint.discrete_timeline_hash =
          hashUint32(fingerprint.discrete_timeline_hash, static_cast<std::uint32_t>(textures.items[i].atom));
      fingerprint.discrete_timeline_hash = hashUint32(
          fingerprint.discrete_timeline_hash, static_cast<std::uint32_t>(textures.items[i].primary_wall));
    }
    fingerprint.resonance_voice_count += static_cast<std::uint32_t>(resonances.count);
    fingerprint.discrete_timeline_hash =
        hashUint32(fingerprint.discrete_timeline_hash, static_cast<std::uint32_t>(resonances.count));
    const float time_weight =
        static_cast<float>(frame_index + 1U) / static_cast<float>(fingerprint.frames);
    for (std::size_t channel = 0; channel < 4; ++channel) {
      fingerprint.drive_sum[channel] += spatial.summary.ch[channel];
      fingerprint.drive_peak[channel] =
          std::max(fingerprint.drive_peak[channel], spatial.summary.ch[channel]);
      fingerprint.drive_time_weighted_sum[channel] += spatial.summary.ch[channel] * time_weight;
      fingerprint.drive_squared_sum[channel] += spatial.summary.ch[channel] * spatial.summary.ch[channel];
    }

    if (frame_index == 79U) {
      fingerprint.energy_checkpoints[0] = mass.energy;
    } else if (frame_index == 159U) {
      fingerprint.energy_checkpoints[1] = mass.energy;
    } else if (frame_index == 239U) {
      fingerprint.energy_checkpoints[2] = mass.energy;
    } else if (frame_index == 399U) {
      fingerprint.energy_checkpoints[3] = mass.energy;
    }
  }

  fingerprint.final_mass = {
      mass.pos_norm.x,
      mass.pos_norm.y,
      mass.vel_norm_s.x,
      mass.vel_norm_s.y,
      mass.energy,
  };
  return fingerprint;
}

void assertFloatArrayWithin(const float tolerance,
                            const float* expected,
                            const float* actual,
                            const std::size_t count) {
  for (std::size_t i = 0; i < count; ++i) {
    TEST_ASSERT_FLOAT_WITHIN(tolerance, expected[i], actual[i]);
  }
}

template <std::size_t N>
void assertUintArrayEqual(const std::array<std::uint32_t, N>& expected,
                          const std::array<std::uint32_t, N>& actual) {
  for (std::size_t i = 0; i < N; ++i) {
    TEST_ASSERT_EQUAL_UINT32(expected[i], actual[i]);
  }
}

void assertMassStateEqual(const haptics::MassState& expected, const haptics::MassState& actual) {
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.pos_norm.x, actual.pos_norm.x);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.pos_norm.y, actual.pos_norm.y);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.vel_norm_s.x, actual.vel_norm_s.x);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.vel_norm_s.y, actual.vel_norm_s.y);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.energy, actual.energy);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.fill, actual.fill);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.headspace, actual.headspace);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.container_x_m, actual.container_x_m);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.container_y_m, actual.container_y_m);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.container_z_m, actual.container_z_m);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.family), static_cast<std::uint8_t>(actual.family));
}

void assertEventEqual(const haptics::HapticEvent& expected, const haptics::HapticEvent& actual) {
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.type), static_cast<std::uint8_t>(actual.type));
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.primary_wall),
                          static_cast<std::uint8_t>(actual.primary_wall));
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.direction.x, actual.direction.x);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.direction.y, actual.direction.y);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.amplitude, actual.amplitude);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.duration_ms, actual.duration_ms);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.density_hz, actual.density_hz);
  TEST_ASSERT_EQUAL(expected.clustered, actual.clustered);
}

void assertTextureEqual(const haptics::TextureCommand& expected, const haptics::TextureCommand& actual) {
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.atom), static_cast<std::uint8_t>(actual.atom));
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.source), static_cast<std::uint8_t>(actual.source));
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.primary_wall),
                          static_cast<std::uint8_t>(actual.primary_wall));
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.direction.x, actual.direction.x);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.direction.y, actual.direction.y);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.low_env, actual.low_env);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.high_env, actual.high_env);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.noise_env, actual.noise_env);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.amplitude, actual.amplitude);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.duration_ms, actual.duration_ms);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.density_hz, actual.density_hz);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.apparent_motion_soa_ms, actual.apparent_motion_soa_ms);
  TEST_ASSERT_EQUAL(expected.distribute_to_neighbors, actual.distribute_to_neighbors);
  TEST_ASSERT_EQUAL(expected.attack_frame, actual.attack_frame);
}

void assertResonanceEqual(const haptics::ResonanceVoice& expected, const haptics::ResonanceVoice& actual) {
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.atom), static_cast<std::uint8_t>(actual.atom));
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.source), static_cast<std::uint8_t>(actual.source));
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(expected.primary_wall),
                          static_cast<std::uint8_t>(actual.primary_wall));
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.direction.x, actual.direction.x);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.direction.y, actual.direction.y);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.low_env, actual.low_env);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.high_env, actual.high_env);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.noise_env, actual.noise_env);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.apparent_motion_soa_ms, actual.apparent_motion_soa_ms);
  TEST_ASSERT_EQUAL(expected.distribute_to_neighbors, actual.distribute_to_neighbors);
  TEST_ASSERT_EQUAL(expected.attack_frame, actual.attack_frame);
}

void assertSpatialEqual(const haptics::SpatialFrame4& expected, const haptics::SpatialFrame4& actual) {
  assertFloatArrayWithin(1.0e-7f, expected.drive.low.data(), actual.drive.low.data(), 4);
  assertFloatArrayWithin(1.0e-7f, expected.drive.high.data(), actual.drive.high.data(), 4);
  assertFloatArrayWithin(1.0e-7f, expected.drive.noise.data(), actual.drive.noise.data(), 4);
  assertFloatArrayWithin(1.0e-7f, expected.summary.ch.data(), actual.summary.ch.data(), 4);
}

void assertTiltEqual(const haptics::TiltPlaneCommand& expected, const haptics::TiltPlaneCommand& actual) {
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.thumb_angle_deg, actual.thumb_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.index_angle_deg, actual.index_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.thumb_current_limit_ma, actual.thumb_current_limit_ma);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.index_current_limit_ma, actual.index_current_limit_ma);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.thumb_base_deg, actual.thumb_base_deg);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.index_base_deg, actual.index_base_deg);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.thumb_delta_deg, actual.thumb_delta_deg);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.index_delta_deg, actual.index_delta_deg);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.common_force_n, actual.common_force_n);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.differential_torque_nm, actual.differential_torque_nm);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.cg_x_m, actual.cg_x_m);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.cg_y_m, actual.cg_y_m);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, expected.apparent_mass_kg, actual.apparent_mass_kg);
  TEST_ASSERT_EQUAL(expected.pseudoforce_enabled, actual.pseudoforce_enabled);
}

void test_default_feature_flags_preserve_safe_legacy_defaults() {
#if defined(__clang__)
  TEST_MESSAGE("native compiler: Clang " __clang_version__);
#elif defined(__GNUC__)
  TEST_MESSAGE("native compiler: GCC " __VERSION__);
#else
  TEST_MESSAGE("native compiler: unknown");
#endif
  const auto params = haptics::makeDefaultLiquidPreset();
  TEST_ASSERT_TRUE(params.features.enable_mass_layer);
  TEST_ASSERT_TRUE(params.features.enable_event_layer);
  TEST_ASSERT_TRUE(params.features.enable_texture_layer);
  TEST_ASSERT_TRUE(params.features.enable_resonance_layer);
  TEST_ASSERT_TRUE(params.features.enable_spatial_renderer);
  TEST_ASSERT_FALSE(params.features.enable_audio_output);
  TEST_ASSERT_FALSE(params.features.enable_tilt_plane);
  TEST_ASSERT_FALSE(params.features.enable_remote_interface);
  TEST_ASSERT_FALSE(params.features.enable_recorder);
  TEST_ASSERT_FALSE(params.features.enable_runtime_calibration);
  TEST_ASSERT_FALSE(params.features.enable_physical_master_gain);
  TEST_ASSERT_FALSE(params.features.enable_attack_preserving_texture);
  TEST_ASSERT_FALSE(params.features.enable_single_shot_spatial_delay);
  TEST_ASSERT_FALSE(params.features.enable_imu_stale_safe_stop);
  TEST_ASSERT_FALSE(params.features.allow_remote_tilt_arm);
}

void test_legacy_trace_is_deterministic() {
  const auto first = runLegacyTrace();
  const auto second = runLegacyTrace();
  TEST_ASSERT_EQUAL_UINT32(first.frames, second.frames);
  assertUintArrayEqual(first.event_type_counts, second.event_type_counts);
  assertUintArrayEqual(first.texture_atom_counts, second.texture_atom_counts);
  TEST_ASSERT_EQUAL_UINT32(first.resonance_voice_count, second.resonance_voice_count);
  TEST_ASSERT_EQUAL_HEX32(first.discrete_timeline_hash, second.discrete_timeline_hash);
  assertFloatArrayWithin(1.0e-7f, first.energy_checkpoints.data(), second.energy_checkpoints.data(), 4);
  assertFloatArrayWithin(1.0e-7f, first.final_mass.data(), second.final_mass.data(), 5);
  assertFloatArrayWithin(1.0e-7f, first.drive_sum.data(), second.drive_sum.data(), 4);
  assertFloatArrayWithin(1.0e-7f, first.drive_peak.data(), second.drive_peak.data(), 4);
  assertFloatArrayWithin(
      1.0e-7f, first.drive_time_weighted_sum.data(), second.drive_time_weighted_sum.data(), 4);
  assertFloatArrayWithin(1.0e-7f, first.drive_squared_sum.data(), second.drive_squared_sum.data(), 4);
}

void test_legacy_trace_matches_reviewed_fingerprint() {
  const auto actual = runLegacyTrace();
  const auto& expected = native_layers_test::kLegacyFingerprint;

  TEST_ASSERT_EQUAL_UINT32(expected.frames, actual.frames);
  assertUintArrayEqual(expected.event_type_counts, actual.event_type_counts);
  assertUintArrayEqual(expected.texture_atom_counts, actual.texture_atom_counts);
  TEST_ASSERT_EQUAL_UINT32(expected.resonance_voice_count, actual.resonance_voice_count);
  TEST_ASSERT_EQUAL_HEX32(expected.discrete_timeline_hash, actual.discrete_timeline_hash);
  assertFloatArrayWithin(native_layers_test::kFingerprintTolerance,
                         expected.energy_checkpoints.data(),
                         actual.energy_checkpoints.data(),
                         expected.energy_checkpoints.size());
  assertFloatArrayWithin(native_layers_test::kFingerprintTolerance,
                         expected.final_mass.data(),
                         actual.final_mass.data(),
                         expected.final_mass.size());
  assertFloatArrayWithin(native_layers_test::kFingerprintTolerance,
                         expected.drive_sum.data(),
                         actual.drive_sum.data(),
                         expected.drive_sum.size());
  assertFloatArrayWithin(native_layers_test::kFingerprintTolerance,
                         expected.drive_peak.data(),
                         actual.drive_peak.data(),
                         expected.drive_peak.size());
  assertFloatArrayWithin(native_layers_test::kFingerprintTolerance,
                         expected.drive_time_weighted_sum.data(),
                         actual.drive_time_weighted_sum.data(),
                         expected.drive_time_weighted_sum.size());
  assertFloatArrayWithin(native_layers_test::kFingerprintTolerance,
                         expected.drive_squared_sum.data(),
                         actual.drive_squared_sum.data(),
                         expected.drive_squared_sum.size());
}

void test_mass_configure_restores_fresh_state() {
  const auto params = haptics::makeDefaultGranularPreset();
  haptics::MassMotionLayer reused;
  haptics::MassMotionLayer fresh;
  reused.configure(params);
  fresh.configure(params);

  for (std::uint32_t frame = 0; frame < 96U; ++frame) {
    reused.update(legacySample(80U + (frame % 80U)), kDtS);
  }
  reused.configure(params);

  haptics::MassState reused_state{};
  haptics::MassState fresh_state{};
  for (std::uint32_t frame = 0; frame < 64U; ++frame) {
    const auto sample = legacySample(160U + frame);
    reused_state = reused.update(sample, kDtS);
    fresh_state = fresh.update(sample, kDtS);
  }
  assertMassStateEqual(fresh_state, reused_state);
}

void test_event_configure_restores_arming_and_cooldowns() {
  auto params = haptics::makeDefaultGranularPreset();
  params.container.family = haptics::MaterialFamily::Custom;
  haptics::EventLayer layer;
  layer.configure(params);

  haptics::MassState state{};
  state.family = haptics::MaterialFamily::Custom;
  state.container_x_m = params.container.span_x_m;
  state.container_y_m = params.container.span_y_m;
  state.fill = params.container.fill;
  state.headspace = params.container.headspace;
  state.pos_norm = {0.98f, 0.10f};
  state.vel_norm_s = {0.70f, 0.05f};
  state.energy = 0.75f;

  const auto first = layer.update(state, kDtS);
  const auto suppressed = layer.update(state, kDtS);
  layer.configure(params);
  const auto after_reconfigure = layer.update(state, kDtS);

  TEST_ASSERT_EQUAL_UINT32(1U, first.count);
  TEST_ASSERT_EQUAL_UINT32(0U, suppressed.count);
  TEST_ASSERT_EQUAL_UINT32(first.count, after_reconfigure.count);
  assertEventEqual(first.items[0], after_reconfigure.items[0]);
}

void test_texture_and_spatial_configure_restore_state() {
  auto params = haptics::makeDefaultLiquidPreset();
  haptics::EventFrame<haptics::kMaxEventsPerFrame> event_frame{};
  event_frame.count = 1;
  event_frame.items[0].type = haptics::EventType::RollTrain;
  event_frame.items[0].primary_wall = haptics::WallId::Front;
  event_frame.items[0].direction = {0.25f, 0.80f};
  event_frame.items[0].amplitude = 0.70f;
  event_frame.items[0].duration_ms = 48.0f;
  event_frame.items[0].density_hz = 12.0f;

  haptics::TextureLayer texture;
  haptics::ResonanceLayer resonance;
  haptics::SpatialRenderer4 spatial;
  texture.configure(params);
  resonance.configure(params);
  spatial.configure(params);

  const auto first_texture = texture.update(event_frame, kDtS);
  const auto first_resonance = resonance.update(first_texture);
  const auto first_spatial = spatial.update(first_resonance, kDtS);
  haptics::EventFrame<haptics::kMaxEventsPerFrame> empty_events{};
  texture.update(empty_events, 0.020f);
  haptics::ResonanceFrame<haptics::kMaxResonanceVoicesPerFrame> empty_resonance{};
  spatial.update(empty_resonance, 0.020f);

  texture.configure(params);
  spatial.configure(params);
  const auto reset_texture = texture.update(event_frame, kDtS);
  const auto reset_resonance = resonance.update(reset_texture);
  const auto reset_spatial = spatial.update(reset_resonance, kDtS);

  TEST_ASSERT_EQUAL_UINT32(first_texture.count, reset_texture.count);
  for (std::size_t i = 0; i < first_texture.count; ++i) {
    assertTextureEqual(first_texture.items[i], reset_texture.items[i]);
  }
  TEST_ASSERT_EQUAL_UINT32(first_resonance.count, reset_resonance.count);
  for (std::size_t i = 0; i < first_resonance.count; ++i) {
    assertResonanceEqual(first_resonance.items[i], reset_resonance.items[i]);
  }
  assertSpatialEqual(first_spatial, reset_spatial);
}

void test_tilt_reset_restores_fresh_state() {
  auto params = haptics::makeDefaultLiquidPreset();
  params.tilt.enable_pseudoforce = true;
  haptics::TiltPseudoForceModel reused;
  haptics::TiltPseudoForceModel fresh;
  reused.configure(params);
  fresh.configure(params);
  reused.reset();
  fresh.reset();

  haptics::MassState mass{};
  mass.family = haptics::MaterialFamily::Liquid;
  mass.fill = params.container.fill;
  mass.pos_norm = {0.35f, -0.20f};
  mass.energy = 0.40f;
  for (std::uint32_t frame = 0; frame < 80U; ++frame) {
    reused.update(legacySample(80U + frame), mass, kDtS);
  }
  reused.reset();

  haptics::TiltPlaneCommand reused_command{};
  haptics::TiltPlaneCommand fresh_command{};
  for (std::uint32_t frame = 0; frame < 48U; ++frame) {
    const auto sample = legacySample(160U + frame);
    reused_command = reused.update(sample, mass, kDtS);
    fresh_command = fresh.update(sample, mass, kDtS);
  }
  assertTiltEqual(fresh_command, reused_command);
}

}  // namespace

void setUp() {}
void tearDown() {}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_default_feature_flags_preserve_safe_legacy_defaults);
  RUN_TEST(test_legacy_trace_is_deterministic);
  RUN_TEST(test_legacy_trace_matches_reviewed_fingerprint);
  RUN_TEST(test_mass_configure_restores_fresh_state);
  RUN_TEST(test_event_configure_restores_arming_and_cooldowns);
  RUN_TEST(test_texture_and_spatial_configure_restore_state);
  RUN_TEST(test_tilt_reset_restores_fresh_state);
  return UNITY_END();
}
