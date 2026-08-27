#include <unity.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <limits>

#include "haptics/EventLayer.hpp"
#include "haptics/HardwareProfiles.hpp"
#include "haptics/MassMotionLayer.hpp"
#include "haptics/MotionActivityFilter.hpp"
#include "haptics/Parameters.hpp"
#include "haptics/ResonanceLayer.hpp"
#include "haptics/RuntimeSafetyPolicy.hpp"
#include "haptics/SpatialRenderer4.hpp"
#include "haptics/TextureLayer.hpp"
#include "haptics/TiltPseudoForceModel.hpp"
#include "legacy_fingerprint.hpp"
#include "motion_activity_fixtures.hpp"

namespace {

using native_layers_test::LegacyFingerprint;

constexpr float kDtS = 1.0f / 250.0f;  // The retained control-loop cadence.
constexpr float kPi = 3.14159265358979323846f;
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

float vec3Length(const haptics::Vec3f& value) {
  return std::sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
}

bool finiteMassState(const haptics::MassState& state) {
  return std::isfinite(state.pos_norm.x) && std::isfinite(state.pos_norm.y) &&
         std::isfinite(state.vel_norm_s.x) && std::isfinite(state.vel_norm_s.y) &&
         std::isfinite(state.energy);
}

haptics::ImuSample validSample(haptics::Vec3f accel_g,
                               haptics::Vec3f gyro_dps = {},
                               std::uint32_t timestamp_us = 0U) {
  haptics::ImuSample sample{};
  sample.timestamp_us = timestamp_us;
  sample.accel_g = accel_g;
  sample.gyro_dps = gyro_dps;
  sample.valid = true;
  return sample;
}

struct EnabledMassHarness {
  haptics::SystemParams params = haptics::makeDefaultLiquidPreset();
  haptics::MotionActivityFilter filter{};
  haptics::MassMotionLayer mass{};

  EnabledMassHarness() {
    params.features.enable_gravity_separated_mass_activity = true;
    filter.configure(params);
    mass.configure(params);
  }

  haptics::MotionInputResult step(const haptics::ImuSample& sample, float raw_dt_s = kDtS) {
    const auto input = filter.process(sample, raw_dt_s);
    if (input.action == haptics::MotionInputAction::Integrate) {
      const auto substep_count = haptics::motionIntegrationSubstepCount(
          input.effective_dt_s, mass.maxStableStepS());
      TEST_ASSERT_GREATER_THAN_UINT8(0U, substep_count);
      const float substep_dt_s = input.effective_dt_s / substep_count;
      for (std::uint8_t substep = 0; substep < substep_count; ++substep) {
        mass.updateWithActivity(sample, input.activity, substep_dt_s);
      }
    } else if (input.action == haptics::MotionInputAction::ResetNeutral) {
      mass.configure(params);
    }
    return input;
  }
};

struct EnabledEventHarness {
  haptics::SystemParams params{};
  haptics::MotionActivityFilter filter{};
  haptics::MassMotionLayer mass{};
  haptics::EventLayer event{};

  explicit EnabledEventHarness(
      haptics::SystemParams selected_params = haptics::makeDefaultLiquidPreset())
      : params(selected_params) {
    params.features.enable_gravity_separated_mass_activity = true;
    filter.configure(params);
    mass.configure(params);
    event.configure(params);
  }

  haptics::EventFrame<haptics::kMaxEventsPerFrame> step(
      const haptics::ImuSample& sample,
      float raw_dt_s = kDtS) {
    const bool was_initialized = filter.initialized();
    const auto input = filter.process(sample, raw_dt_s);
    if (input.action == haptics::MotionInputAction::ResetNeutral) {
      filter.configure(params);
      mass.configure(params);
      event.configure(params);
      return {};
    }
    if (input.action != haptics::MotionInputAction::Integrate) {
      return {};
    }
    haptics::EventFrame<haptics::kMaxEventsPerFrame> events{};
    const auto substep_count = haptics::motionIntegrationSubstepCount(
        input.effective_dt_s, mass.maxStableStepS());
    TEST_ASSERT_GREATER_THAN_UINT8(0U, substep_count);
    const float substep_dt_s = input.effective_dt_s / substep_count;
    for (std::uint8_t substep = 0; substep < substep_count; ++substep) {
      const auto state = mass.updateWithActivity(sample, input.activity, substep_dt_s);
      if (!was_initialized) {
        continue;
      }
      const auto substep_events = event.update(
          state, substep_dt_s, events.items.size() - events.count);
      for (std::size_t i = 0;
           i < substep_events.count && events.count < events.items.size();
           ++i) {
        events.items[events.count++] = substep_events.items[i];
      }
    }
    return events;
  }
};

struct FrequencyResponseMetrics {
  float activity_rms_g = 0.0f;
  float mass_energy_rms = 0.0f;
};

FrequencyResponseMetrics responseAtFrequency(float frequency_hz, float amplitude_g) {
  haptics::MotionActivityFilter filter;
  haptics::MassMotionLayer mass;
  auto params = haptics::makeDefaultLiquidPreset();
  filter.configure(params);
  mass.configure(params);

  std::uint32_t timestamp_us = 0U;
  for (std::uint32_t frame = 0; frame < 500U; ++frame) {
    const auto raw = validSample({0.0f, 0.0f, 1.0f}, {}, timestamp_us);
    const auto input = filter.process(raw, kDtS);
    if (input.action != haptics::MotionInputAction::Integrate) {
      const float nan = std::numeric_limits<float>::quiet_NaN();
      return {nan, nan};
    }
    mass.updateWithActivity(raw, input.activity, kDtS);
    timestamp_us += 4000U;
  }

  constexpr std::uint32_t kMeasureFrames = 1000U;
  double activity_squared_sum = 0.0;
  double energy_squared_sum = 0.0;
  for (std::uint32_t frame = 0; frame < kMeasureFrames; ++frame) {
    const float time_s = static_cast<float>(frame) * kDtS;
    const float x = amplitude_g * std::sin(2.0f * kPi * frequency_hz * time_s);
    const auto raw = validSample({x, 0.0f, 1.0f}, {}, timestamp_us);
    const auto input = filter.process(raw, kDtS);
    if (input.action != haptics::MotionInputAction::Integrate) {
      const float nan = std::numeric_limits<float>::quiet_NaN();
      return {nan, nan};
    }
    const auto state = mass.updateWithActivity(raw, input.activity, kDtS);
    activity_squared_sum +=
        static_cast<double>(input.activity.accel_g.x) * input.activity.accel_g.x;
    energy_squared_sum += static_cast<double>(state.energy) * state.energy;
    timestamp_us += 4000U;
  }
  return {
      static_cast<float>(
          std::sqrt(activity_squared_sum / static_cast<double>(kMeasureFrames))),
      static_cast<float>(
          std::sqrt(energy_squared_sum / static_cast<double>(kMeasureFrames))),
  };
}

void test_default_feature_flags_and_runtime_safety_policy() {
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
  TEST_ASSERT_FALSE(params.features.enable_usb_telemetry);
  TEST_ASSERT_FALSE(params.features.allow_remote_tilt_arm);
  TEST_ASSERT_FALSE(
      haptics::imuStaleSafeStopNextState(false, false, false));
  TEST_ASSERT_FALSE(
      haptics::imuStaleSafeStopNextState(false, false, true));
  TEST_ASSERT_FALSE(
      haptics::imuStaleSafeStopNextState(false, true, false));
  bool stale_stop =
      haptics::imuStaleSafeStopNextState(false, true, true);
  TEST_ASSERT_TRUE(stale_stop);
  // A valid-sample recovery refreshes the deadline but cannot release the
  // asserted stop. Even an unexpected feature disable must fail closed.
  stale_stop =
      haptics::imuStaleSafeStopNextState(stale_stop, true, false);
  TEST_ASSERT_TRUE(stale_stop);
  stale_stop =
      haptics::imuStaleSafeStopNextState(stale_stop, false, false);
  TEST_ASSERT_TRUE(stale_stop);
  // enterSafeIdle() is the runtime owner of the explicit true -> false clear.
  TEST_ASSERT_FALSE(
      haptics::imuStaleSafeStopNextState(false, true, false));
  TEST_ASSERT_FALSE(haptics::imuFaultClearRequiresSafeIdle(false));
  TEST_ASSERT_TRUE(haptics::imuFaultClearRequiresSafeIdle(true));
  TEST_ASSERT_FALSE(
      haptics::imuStaleSafetyDisableRequiresSafeIdle(false, false));
  TEST_ASSERT_TRUE(
      haptics::imuStaleSafetyDisableRequiresSafeIdle(true, false));
  TEST_ASSERT_TRUE(
      haptics::imuStaleSafetyDisableRequiresSafeIdle(false, true));
  TEST_ASSERT_TRUE(haptics::imuSafetyInterlockAllowsRunMode(
      false, false, haptics::RunMode::Replay));
  TEST_ASSERT_TRUE(haptics::imuSafetyInterlockAllowsRunMode(
      false, true, haptics::RunMode::Live));
  TEST_ASSERT_TRUE(haptics::imuSafetyInterlockAllowsRunMode(
      true, false, haptics::RunMode::Idle));
  TEST_ASSERT_FALSE(haptics::imuSafetyInterlockAllowsRunMode(
      false, true, haptics::RunMode::Record));
  TEST_ASSERT_FALSE(haptics::imuSafetyInterlockAllowsRunMode(
      true, false, haptics::RunMode::Calibration));
  TEST_ASSERT_FALSE(haptics::imuSafetyInterlockAllowsRunMode(
      true, true, haptics::RunMode::Replay));
  TEST_ASSERT_TRUE(
      haptics::imuSafetyInterlockAllowsPhysicalArm(false, false));
  TEST_ASSERT_FALSE(
      haptics::imuSafetyInterlockAllowsPhysicalArm(true, false));
  TEST_ASSERT_FALSE(
      haptics::imuSafetyInterlockAllowsPhysicalArm(false, true));
  TEST_ASSERT_FALSE(haptics::imuSafetyInterlockRequiresTickSafeIdle(
      false, true, haptics::RunMode::Live));
  TEST_ASSERT_TRUE(haptics::imuSafetyInterlockRequiresTickSafeIdle(
      false, true, haptics::RunMode::Idle));
  TEST_ASSERT_TRUE(haptics::imuSafetyInterlockRequiresTickSafeIdle(
      true, false, haptics::RunMode::Replay));
  TEST_ASSERT_FALSE(haptics::imuSafetyInterlockRequiresTickSafeIdle(
      false, false, haptics::RunMode::Replay));
  TEST_ASSERT_TRUE(haptics::replayCompletionRequiresSafeIdle(true, false));
  TEST_ASSERT_FALSE(haptics::replayCompletionRequiresSafeIdle(true, true));
  TEST_ASSERT_FALSE(haptics::replayCompletionRequiresSafeIdle(false, false));
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

  layer.configure(params);
  const auto budgeted_out = layer.update(state, kDtS, 0U);
  TEST_ASSERT_EQUAL_UINT32(0U, budgeted_out.count);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::EventType::None),
                          static_cast<std::uint8_t>(layer.lastEvent().type));
  const auto no_delayed_burst = layer.update(state, kDtS);
  TEST_ASSERT_EQUAL_UINT32(0U, no_delayed_burst.count);

  auto extreme_rate_params = haptics::makeDefaultGranularPreset();
  extreme_rate_params.event.roll_rate_hz = std::numeric_limits<float>::max();
  extreme_rate_params.event.impact_rate_hz = std::numeric_limits<float>::max();
  layer.configure(extreme_rate_params);
  state.family = haptics::MaterialFamily::Granular;
  state.container_x_m = extreme_rate_params.container.span_x_m;
  state.container_y_m = extreme_rate_params.container.span_y_m;
  state.fill = extreme_rate_params.container.fill;
  state.headspace = extreme_rate_params.container.headspace;
  const auto extreme_rate_budgeted_out = layer.update(state, 0.10f, 0U);
  TEST_ASSERT_EQUAL_UINT32(0U, extreme_rate_budgeted_out.count);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::EventType::None),
                          static_cast<std::uint8_t>(layer.lastEvent().type));
  const auto extreme_rate_bounded = layer.update(state, 0.10f);
  TEST_ASSERT_LESS_OR_EQUAL_UINT32(haptics::kMaxEventsPerFrame,
                                  extreme_rate_bounded.count);
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

void test_motion_filter_defaults_and_atom_profile_opt_in() {
  const auto generic = haptics::makeDefaultLiquidPreset();
  TEST_ASSERT_FALSE(generic.features.enable_gravity_separated_mass_activity);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, 1.0f, generic.motion_activity.gravity_cutoff_hz);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, 10.0f, generic.motion_activity.motion_cutoff_hz);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, 0.025f, generic.motion_activity.accel_deadband_g);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, 1.5f, generic.motion_activity.gyro_deadband_dps);

  auto atom = generic;
  haptics::applyAsBuiltAtomS3Profile(atom);
  TEST_ASSERT_TRUE(atom.features.enable_gravity_separated_mass_activity);
  TEST_ASSERT_FALSE(haptics::motionInputBoundaryEnabled(false, true, true));
  TEST_ASSERT_TRUE(haptics::motionInputBoundaryEnabled(true, true, false));
  TEST_ASSERT_TRUE(haptics::motionInputBoundaryEnabled(true, false, true));
  TEST_ASSERT_FALSE(haptics::motionInputBoundaryEnabled(true, false, false));
}

void test_motion_filter_raw_time_and_missing_sample_contract() {
  auto params = haptics::makeDefaultLiquidPreset();
  haptics::MotionActivityFilter filter;
  filter.configure(params);
  const auto stationary = validSample({0.0f, 0.0f, 1.0f});

  const std::array<float, 4> rejected_dt{{
      0.0f,
      -kDtS,
      std::numeric_limits<float>::quiet_NaN(),
      std::numeric_limits<float>::infinity(),
  }};
  for (const float raw_dt_s : rejected_dt) {
    const auto rejected = filter.process(stationary, raw_dt_s);
    TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::RejectFrame),
                            static_cast<std::uint8_t>(rejected.action));
    TEST_ASSERT_FALSE(filter.initialized());
    TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, filter.pendingDtS());
  }

  haptics::ImuSample missing{};
  for (std::uint32_t frame = 0; frame < 3U; ++frame) {
    const auto held = filter.process(missing, kDtS);
    TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::HoldNoSample),
                            static_cast<std::uint8_t>(held.action));
  }
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, 3.0f * kDtS, filter.pendingDtS());

  const auto first_valid = filter.process(stationary, kDtS);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::Integrate),
                          static_cast<std::uint8_t>(first_valid.action));
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, 4.0f * kDtS, first_valid.effective_dt_s);
  TEST_ASSERT_TRUE(first_valid.activity.valid);
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, vec3Length(first_valid.activity.accel_g));
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, vec3Length(first_valid.activity.gyro_dps));
  TEST_ASSERT_TRUE(filter.initialized());
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, filter.pendingDtS());

  const auto gravity_before_bad_dt = filter.gravity();
  const auto bad_after_init = filter.process(validSample({0.4f, 0.0f, 1.0f}),
                                             std::numeric_limits<float>::quiet_NaN());
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::RejectFrame),
                          static_cast<std::uint8_t>(bad_after_init.action));
  TEST_ASSERT_FLOAT_WITHIN(0.0f, gravity_before_bad_dt.x, filter.gravity().x);
  TEST_ASSERT_FLOAT_WITHIN(0.0f, gravity_before_bad_dt.y, filter.gravity().y);
  TEST_ASSERT_FLOAT_WITHIN(0.0f, gravity_before_bad_dt.z, filter.gravity().z);

  haptics::ImuSample nonfinite = stationary;
  nonfinite.accel_g.x = std::numeric_limits<float>::infinity();
  const auto held_nonfinite = filter.process(nonfinite, kDtS);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::HoldNoSample),
                          static_cast<std::uint8_t>(held_nonfinite.action));
  const auto recovered = filter.process(stationary, kDtS);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::Integrate),
                          static_cast<std::uint8_t>(recovered.action));
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, 2.0f * kDtS, recovered.effective_dt_s);
}

void test_motion_filter_long_gap_boundary_and_reset() {
  auto params = haptics::makeDefaultLiquidPreset();
  haptics::MotionActivityFilter filter;
  const auto stationary = validSample({1.0f, 0.0f, 0.0f});

  filter.configure(params);
  const auto exact_boundary = filter.process(stationary, haptics::kMotionInputResetGapS);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::Integrate),
                          static_cast<std::uint8_t>(exact_boundary.action));
  TEST_ASSERT_TRUE(filter.initialized());
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, vec3Length(exact_boundary.activity.accel_g));

  filter.configure(params);
  const float above_boundary = std::nextafter(haptics::kMotionInputResetGapS,
                                              std::numeric_limits<float>::infinity());
  const auto reset = filter.process(stationary, above_boundary);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::ResetNeutral),
                          static_cast<std::uint8_t>(reset.action));
  TEST_ASSERT_FALSE(filter.initialized());
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, filter.pendingDtS());
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, vec3Length(reset.activity.accel_g));
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, vec3Length(reset.gravity_g));

  const auto recovered = filter.process(stationary, kDtS);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::Integrate),
                          static_cast<std::uint8_t>(recovered.action));
  TEST_ASSERT_TRUE(filter.initialized());
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, vec3Length(recovered.activity.accel_g));

  filter.reset();
  haptics::ImuSample missing{};
  filter.process(missing, 0.048f);
  const auto accumulated_gap = filter.process(stationary, kDtS);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::ResetNeutral),
                          static_cast<std::uint8_t>(accumulated_gap.action));
  TEST_ASSERT_FALSE(filter.initialized());
}

void test_motion_integration_substep_policy_bounds_recovery_steps() {
  const auto nominal_count = haptics::motionIntegrationSubstepCount(kDtS);
  TEST_ASSERT_EQUAL_UINT8(1U, nominal_count);
  TEST_ASSERT_EQUAL_UINT8(
      static_cast<std::uint8_t>(
          haptics::MotionIntegrationSafetyAction::Continue),
      static_cast<std::uint8_t>(
          haptics::motionIntegrationSafetyAction(nominal_count)));
  TEST_ASSERT_EQUAL_UINT8(4U, haptics::motionIntegrationSubstepCount(0.016f));
  TEST_ASSERT_EQUAL_UINT8(13U,
                          haptics::motionIntegrationSubstepCount(
                              haptics::kMotionInputResetGapS));
  TEST_ASSERT_EQUAL_UINT8(0U, haptics::motionIntegrationSubstepCount(0.0f));
  TEST_ASSERT_EQUAL_UINT8(
      0U,
      haptics::motionIntegrationSubstepCount(
          std::numeric_limits<float>::quiet_NaN()));

  auto params = haptics::makeDefaultDetentedPreset();
  params.mass.natural_freq_x_hz = 20.0f;
  params.mass.natural_freq_y_hz = 20.0f;
  params.mass.damping_ratio_x = 2.0f;
  params.mass.damping_ratio_y = 2.0f;
  params.container.viscosity = 1.0f;
  params.container.span_x_m = 0.020f;
  params.container.span_y_m = 0.020f;
  haptics::MassMotionLayer mass;
  mass.configure(params);
  const auto raw = validSample({1.0f, -1.0f, 0.0f});
  const auto activity = validSample({0.4f, -0.4f, 0.2f}, {20.0f, -20.0f, 10.0f});
  const float stable_step_s = mass.maxStableStepS();
  TEST_ASSERT_GREATER_THAN_FLOAT(0.0f, stable_step_s);
  TEST_ASSERT_TRUE(haptics::motionDynamicsAllowTiltArm(stable_step_s));
  TEST_ASSERT_LESS_THAN_FLOAT(haptics::kMotionIntegrationMaxStepS, stable_step_s);
  const auto count = haptics::motionIntegrationSubstepCount(
      haptics::kMotionInputResetGapS, stable_step_s);
  TEST_ASSERT_GREATER_THAN_UINT8(0U, count);
  const float step_dt_s = haptics::kMotionInputResetGapS / count;
  TEST_ASSERT_LESS_OR_EQUAL_FLOAT(stable_step_s, step_dt_s);
  for (std::uint8_t step = 0; step < count; ++step) {
    mass.updateWithActivity(raw, activity, step_dt_s);
  }
  TEST_ASSERT_TRUE(finiteMassState(mass.state()));
  TEST_ASSERT_LESS_OR_EQUAL_FLOAT(1.0f, std::fabs(mass.state().pos_norm.x));
  TEST_ASSERT_LESS_OR_EQUAL_FLOAT(1.0f, std::fabs(mass.state().pos_norm.y));

  params.mass.natural_freq_x_hz = -1.0f;
  mass.configure(params);
  TEST_ASSERT_FLOAT_WITHIN(0.0f, 0.0f, mass.maxStableStepS());
  TEST_ASSERT_FALSE(
      haptics::motionDynamicsAllowTiltArm(mass.maxStableStepS()));
  TEST_ASSERT_FALSE(haptics::motionDynamicsAllowTiltArm(
      std::numeric_limits<float>::quiet_NaN()));
  TEST_ASSERT_FALSE(haptics::motionDynamicsAllowTiltArm(1.0e-12f));
  const auto unsupported_count =
      haptics::motionIntegrationSubstepCount(kDtS, mass.maxStableStepS());
  TEST_ASSERT_EQUAL_UINT8(0U, unsupported_count);
  TEST_ASSERT_EQUAL_UINT8(
      static_cast<std::uint8_t>(
          haptics::MotionIntegrationSafetyAction::ResetNeutralAndDisarmTilt),
      static_cast<std::uint8_t>(
          haptics::motionIntegrationSafetyAction(unsupported_count)));
}

void test_motion_filter_explicit_reset_restores_fresh_state() {
  auto params = haptics::makeDefaultLiquidPreset();
  haptics::MotionActivityFilter reused;
  haptics::MotionActivityFilter fresh;
  reused.configure(params);
  fresh.configure(params);

  for (std::uint32_t frame = 0; frame < 200U; ++frame) {
    const float phase = 2.0f * kPi * 4.0f * static_cast<float>(frame) * kDtS;
    reused.process(validSample({0.25f * std::sin(phase), 0.0f, 1.0f},
                               {3.0f, -2.0f, 12.0f},
                               frame * 4000U),
                   kDtS);
  }
  reused.reset();

  for (std::uint32_t frame = 0; frame < 80U; ++frame) {
    const float phase = 2.0f * kPi * 2.0f * static_cast<float>(frame) * kDtS;
    const auto sample = validSample({0.10f * std::sin(phase), 0.04f * std::cos(phase), 1.0f},
                                    {0.8f, -0.6f, 2.0f},
                                    frame * 4000U);
    const auto reused_result = reused.process(sample, kDtS);
    const auto fresh_result = fresh.process(sample, kDtS);
    TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(fresh_result.action),
                            static_cast<std::uint8_t>(reused_result.action));
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.effective_dt_s, reused_result.effective_dt_s);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.activity.accel_g.x, reused_result.activity.accel_g.x);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.activity.accel_g.y, reused_result.activity.accel_g.y);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.activity.accel_g.z, reused_result.activity.accel_g.z);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.activity.gyro_dps.x, reused_result.activity.gyro_dps.x);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.activity.gyro_dps.y, reused_result.activity.gyro_dps.y);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.activity.gyro_dps.z, reused_result.activity.gyro_dps.z);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.gravity_g.x, reused_result.gravity_g.x);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.gravity_g.y, reused_result.gravity_g.y);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, fresh_result.gravity_g.z, reused_result.gravity_g.z);
  }
}

void test_motion_filter_all_static_orientations_settle_without_energy() {
  constexpr float kInvSqrt3 = 0.57735026919f;
  const std::array<haptics::Vec3f, 7> poses{{
      {1.0f, 0.0f, 0.0f},
      {-1.0f, 0.0f, 0.0f},
      {0.0f, 1.0f, 0.0f},
      {0.0f, -1.0f, 0.0f},
      {0.0f, 0.0f, 1.0f},
      {0.0f, 0.0f, -1.0f},
      {kInvSqrt3, kInvSqrt3, kInvSqrt3},
  }};

  for (const auto& pose : poses) {
    EnabledMassHarness harness;
    for (std::uint32_t frame = 0; frame < 1000U; ++frame) {
      const auto input = harness.step(validSample(pose, {}, frame * 4000U));
      TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::MotionInputAction::Integrate),
                              static_cast<std::uint8_t>(input.action));
    }
    TEST_ASSERT_TRUE(finiteMassState(harness.mass.state()));
    TEST_ASSERT_LESS_THAN_FLOAT(0.02f, harness.mass.state().energy);
    if (std::fabs(pose.x) > 0.5f) {
      TEST_ASSERT_TRUE(harness.mass.state().pos_norm.x * pose.x < 0.0f);
    }
    if (std::fabs(pose.y) > 0.5f) {
      TEST_ASSERT_TRUE(harness.mass.state().pos_norm.y * pose.y < 0.0f);
    }
  }
}

void test_motion_filter_fixed_bias_and_noise_remain_below_activity_floor() {
  constexpr float kInvSqrt3 = 0.57735026919f;
  EnabledMassHarness harness;
  float settled_peak_activity_g = 0.0f;

  for (std::uint32_t frame = 0; frame < 2500U; ++frame) {
    const auto& noise = native_layers_test::kStationaryNoiseTrace[
        frame % native_layers_test::kStationaryNoiseTrace.size()];
    const haptics::Vec3f accel{
        kInvSqrt3 + native_layers_test::kStationaryAccelBiasG.x + noise.accel_delta_g.x,
        kInvSqrt3 + native_layers_test::kStationaryAccelBiasG.y + noise.accel_delta_g.y,
        kInvSqrt3 + native_layers_test::kStationaryAccelBiasG.z + noise.accel_delta_g.z,
    };
    const haptics::Vec3f gyro{
        native_layers_test::kStationaryGyroBiasDps.x + noise.gyro_delta_dps.x,
        native_layers_test::kStationaryGyroBiasDps.y + noise.gyro_delta_dps.y,
        native_layers_test::kStationaryGyroBiasDps.z + noise.gyro_delta_dps.z,
    };
    const auto input = harness.step(validSample(accel, gyro, frame * 4000U));
    if (frame >= 500U) {
      settled_peak_activity_g = std::max(settled_peak_activity_g, vec3Length(input.activity.accel_g));
    }
  }

  TEST_ASSERT_TRUE(finiteMassState(harness.mass.state()));
  TEST_ASSERT_LESS_THAN_FLOAT(0.02f, harness.mass.state().energy);
  TEST_ASSERT_LESS_THAN_FLOAT(0.010f, settled_peak_activity_g);
}

void test_motion_filter_pulse_rises_then_settles() {
  EnabledMassHarness harness;
  std::uint32_t timestamp_us = 0U;
  for (std::uint32_t frame = 0; frame < 500U; ++frame) {
    harness.step(validSample({0.0f, 0.0f, 1.0f}, {}, timestamp_us));
    timestamp_us += 4000U;
  }

  float peak_activity_g = 0.0f;
  float peak_energy = 0.0f;
  for (std::uint32_t frame = 0; frame < 20U; ++frame) {
    const auto input = harness.step(validSample({0.35f, 0.0f, 1.0f}, {}, timestamp_us));
    peak_activity_g = std::max(peak_activity_g, vec3Length(input.activity.accel_g));
    peak_energy = std::max(peak_energy, harness.mass.state().energy);
    timestamp_us += 4000U;
  }
  for (std::uint32_t frame = 0; frame < 500U; ++frame) {
    harness.step(validSample({0.0f, 0.0f, 1.0f}, {}, timestamp_us));
    timestamp_us += 4000U;
  }

  TEST_ASSERT_GREATER_THAN_FLOAT(0.10f, peak_activity_g);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.001f, peak_energy);
  TEST_ASSERT_LESS_THAN_FLOAT(0.02f, harness.mass.state().energy);
}

void test_motion_filter_preserves_hand_band_and_rejects_alias_band() {
  constexpr float kAmplitudeG = 0.15f;
  const auto response_1_hz = responseAtFrequency(1.0f, kAmplitudeG);
  const auto response_4_hz = responseAtFrequency(4.0f, kAmplitudeG);
  const auto response_8_hz = responseAtFrequency(8.0f, kAmplitudeG);
  const auto response_70_hz = responseAtFrequency(70.0f, kAmplitudeG);
  const auto response_90_hz = responseAtFrequency(90.0f, kAmplitudeG);

  TEST_ASSERT_TRUE(std::isfinite(response_1_hz.activity_rms_g));
  TEST_ASSERT_TRUE(std::isfinite(response_4_hz.activity_rms_g));
  TEST_ASSERT_TRUE(std::isfinite(response_8_hz.activity_rms_g));
  TEST_ASSERT_TRUE(std::isfinite(response_70_hz.mass_energy_rms));
  TEST_ASSERT_TRUE(std::isfinite(response_90_hz.mass_energy_rms));
  TEST_ASSERT_GREATER_THAN_FLOAT(0.025f, response_1_hz.activity_rms_g);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.050f, response_4_hz.activity_rms_g);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.040f, response_8_hz.activity_rms_g);
  TEST_ASSERT_LESS_THAN_FLOAT(
      0.25f * response_4_hz.activity_rms_g, response_70_hz.activity_rms_g);
  TEST_ASSERT_LESS_THAN_FLOAT(
      0.25f * response_4_hz.activity_rms_g, response_90_hz.activity_rms_g);

  // The production consumer must inherit the same rejection. This prevents a
  // filter-only test from passing while MassState::energy still aliases the
  // transducer band into event activity.
  TEST_ASSERT_GREATER_THAN_FLOAT(0.005f, response_4_hz.mass_energy_rms);
  TEST_ASSERT_LESS_THAN_FLOAT(
      0.25f * response_4_hz.mass_energy_rms, response_70_hz.mass_energy_rms);
  TEST_ASSERT_LESS_THAN_FLOAT(
      0.25f * response_4_hz.mass_energy_rms, response_90_hz.mass_energy_rms);
}

void test_finite_orientation_change_settles_without_recurring_events() {
  EnabledEventHarness harness;
  std::uint32_t timestamp_us = 0U;

  for (std::uint32_t frame = 0; frame < 500U; ++frame) {
    harness.step(validSample({0.0f, 0.0f, 1.0f}, {}, timestamp_us));
    timestamp_us += 4000U;
  }

  // A finite raised-cosine pose transition is observable with an
  // accelerometer. Continuous rotation and translation are not generally
  // distinguishable from acceleration alone, so this is the native contract.
  for (std::uint32_t frame = 0; frame < 250U; ++frame) {
    const float progress = static_cast<float>(frame + 1U) / 250.0f;
    const float angle_rad = 0.25f * kPi * (1.0f - std::cos(kPi * progress));
    harness.step(validSample({std::sin(angle_rad), 0.0f, std::cos(angle_rad)},
                             {0.0f, 90.0f * std::sin(kPi * progress), 0.0f},
                             timestamp_us));
    timestamp_us += 4000U;
  }

  std::uint32_t events_after_settle_window = 0U;
  for (std::uint32_t frame = 0; frame < 8000U; ++frame) {
    const auto events = harness.step(validSample({1.0f, 0.0f, 0.0f}, {}, timestamp_us));
    if (frame >= 500U) {
      events_after_settle_window += static_cast<std::uint32_t>(events.count);
    }
    timestamp_us += 4000U;
  }

  TEST_ASSERT_LESS_THAN_FLOAT(0.02f, harness.mass.state().energy);
  TEST_ASSERT_EQUAL_UINT32(0U, events_after_settle_window);
}

void test_all_material_families_remain_event_silent_at_rest() {
  constexpr float kInvSqrt3 = 0.57735026919f;
  const std::array<haptics::SystemParams, 9> presets{{
      haptics::makeDefaultLiquidPreset(),
      haptics::makeDefaultLiquidDenseJarPreset(),
      haptics::makeDefaultLiquidHalfTubePreset(),
      haptics::makeDefaultGranularPreset(),
      haptics::makeDefaultGranularSandPreset(),
      haptics::makeDefaultGranularBeadPreset(),
      haptics::makeDefaultGranularSingleMarblePreset(),
      haptics::makeDefaultHybridPreset(),
      haptics::makeDefaultDetentedPreset(),
  }};
  const std::array<haptics::Vec3f, 7> poses{{
      {1.0f, 0.0f, 0.0f},
      {-1.0f, 0.0f, 0.0f},
      {0.0f, 1.0f, 0.0f},
      {0.0f, -1.0f, 0.0f},
      {0.0f, 0.0f, 1.0f},
      {0.0f, 0.0f, -1.0f},
      {kInvSqrt3, kInvSqrt3, kInvSqrt3},
  }};

  for (auto params : presets) {
    params.features.enable_gravity_separated_mass_activity = true;
    for (const auto& pose : poses) {
      EnabledEventHarness harness(params);
      std::uint32_t timestamp_us = 0U;
      for (std::uint32_t frame = 0; frame < 500U; ++frame) {
        harness.step(validSample(pose, {}, timestamp_us));
        timestamp_us += 4000U;
      }

      std::uint32_t event_count = 0U;
      for (std::uint32_t frame = 0; frame < 7500U; ++frame) {
        const auto events = harness.step(validSample(pose, {}, timestamp_us));
        event_count += static_cast<std::uint32_t>(events.count);
        timestamp_us += 4000U;
      }

      TEST_ASSERT_LESS_THAN_FLOAT(0.02f, harness.mass.state().energy);
      TEST_ASSERT_EQUAL_UINT32(0U, event_count);
    }
  }
}

void test_enhanced_event_quiet_gate_reopens_for_deliberate_activity() {
  const std::array<haptics::SystemParams, 9> presets{{
      haptics::makeDefaultLiquidPreset(),
      haptics::makeDefaultLiquidDenseJarPreset(),
      haptics::makeDefaultLiquidHalfTubePreset(),
      haptics::makeDefaultGranularPreset(),
      haptics::makeDefaultGranularSandPreset(),
      haptics::makeDefaultGranularBeadPreset(),
      haptics::makeDefaultGranularSingleMarblePreset(),
      haptics::makeDefaultHybridPreset(),
      haptics::makeDefaultDetentedPreset(),
  }};

  for (auto params : presets) {
    params.features.enable_gravity_separated_mass_activity = true;
    haptics::EventLayer event;
    event.configure(params);
    haptics::MassState state{};
    state.fill = params.container.fill;
    state.headspace = params.container.headspace;
    state.container_x_m = params.container.span_x_m;
    state.container_y_m = params.container.span_y_m;
    state.container_z_m = params.container.span_z_m;
    state.family = params.container.family;

    std::uint32_t quiet_event_count = 0U;
    for (std::uint32_t frame = 0; frame < 500U; ++frame) {
      quiet_event_count += static_cast<std::uint32_t>(event.update(state, kDtS).count);
    }
    TEST_ASSERT_EQUAL_UINT32(0U, quiet_event_count);

    state.energy = 0.50f;
    state.pos_norm = {0.85f, 0.20f};
    state.vel_norm_s = {0.0f, 0.50f};
    std::uint32_t active_event_count = 0U;
    for (std::uint32_t frame = 0; frame < 500U; ++frame) {
      active_event_count += static_cast<std::uint32_t>(event.update(state, kDtS).count);
    }
    TEST_ASSERT_GREATER_THAN_UINT32(0U, active_event_count);

    state.energy = 0.0f;
    state.vel_norm_s = {0.0f, 0.03f};
    std::uint32_t returned_quiet_event_count = 0U;
    for (std::uint32_t frame = 0; frame < 500U; ++frame) {
      returned_quiet_event_count +=
          static_cast<std::uint32_t>(event.update(state, kDtS).count);
    }
    TEST_ASSERT_EQUAL_UINT32(0U, returned_quiet_event_count);

    state.energy = 0.50f;
    state.vel_norm_s = {0.0f, 0.50f};
    std::uint32_t reopened_event_count = 0U;
    for (std::uint32_t frame = 0; frame < 500U; ++frame) {
      reopened_event_count += static_cast<std::uint32_t>(event.update(state, kDtS).count);
    }
    TEST_ASSERT_GREATER_THAN_UINT32(0U, reopened_event_count);
  }
}

void test_mass_activity_path_uses_raw_for_position_and_filtered_for_energy() {
  auto params = haptics::makeDefaultLiquidPreset();
  haptics::MassMotionLayer enhanced;
  haptics::MassMotionLayer legacy;
  enhanced.configure(params);
  legacy.configure(params);
  const auto raw = validSample({1.0f, 0.0f, 0.0f});
  const auto neutral_activity = validSample({}, {});

  for (std::uint32_t frame = 0; frame < 250U; ++frame) {
    enhanced.updateWithActivity(raw, neutral_activity, kDtS);
    legacy.update(raw, kDtS);
  }

  TEST_ASSERT_TRUE(enhanced.state().pos_norm.x < 0.0f);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-7f, enhanced.state().pos_norm.x, legacy.state().pos_norm.x);
  TEST_ASSERT_LESS_THAN_FLOAT(0.02f, enhanced.state().energy);
  TEST_ASSERT_GREATER_THAN_FLOAT(enhanced.state().energy + 0.05f, legacy.state().energy);
}

}  // namespace

void setUp() {}
void tearDown() {}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_default_feature_flags_and_runtime_safety_policy);
  RUN_TEST(test_legacy_trace_is_deterministic);
  RUN_TEST(test_legacy_trace_matches_reviewed_fingerprint);
  RUN_TEST(test_mass_configure_restores_fresh_state);
  RUN_TEST(test_event_configure_restores_arming_and_cooldowns);
  RUN_TEST(test_texture_and_spatial_configure_restore_state);
  RUN_TEST(test_tilt_reset_restores_fresh_state);
  RUN_TEST(test_motion_filter_defaults_and_atom_profile_opt_in);
  RUN_TEST(test_motion_filter_raw_time_and_missing_sample_contract);
  RUN_TEST(test_motion_filter_long_gap_boundary_and_reset);
  RUN_TEST(test_motion_integration_substep_policy_bounds_recovery_steps);
  RUN_TEST(test_motion_filter_explicit_reset_restores_fresh_state);
  RUN_TEST(test_motion_filter_all_static_orientations_settle_without_energy);
  RUN_TEST(test_motion_filter_fixed_bias_and_noise_remain_below_activity_floor);
  RUN_TEST(test_motion_filter_pulse_rises_then_settles);
  RUN_TEST(test_motion_filter_preserves_hand_band_and_rejects_alias_band);
  RUN_TEST(test_finite_orientation_change_settles_without_recurring_events);
  RUN_TEST(test_all_material_families_remain_event_silent_at_rest);
  RUN_TEST(test_enhanced_event_quiet_gate_reopens_for_deliberate_activity);
  RUN_TEST(test_mass_activity_path_uses_raw_for_position_and_filtered_for_energy);
  return UNITY_END();
}
