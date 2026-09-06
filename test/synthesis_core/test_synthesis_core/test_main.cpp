#include <unity.h>

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>

#include "haptics/HapticSynthesisCore.hpp"
#include "pre_extraction_reference.hpp"

namespace {
using namespace haptics;

constexpr float kDt = 0.004f;
uint32_t compared_frames = 0;

uint32_t floatBits(float value) {
  uint32_t bits = 0;
  std::memcpy(&bits, &value, sizeof(bits));
  return bits;
}

// Compare fields, never padding. Bit equality is intentional: no layer math or
// evaluation ordering changed in this extraction on the same toolchain.
#define SAME_FLOAT(field) \
  TEST_ASSERT_EQUAL_HEX32_MESSAGE(floatBits(expected.field), \
                                floatBits(actual.field), #field)
#define SAME_VALUE(field) \
  TEST_ASSERT_EQUAL_INT_MESSAGE(expected.field, actual.field, #field)

void assertSameMass(const MassState& expected, const MassState& actual) {
  SAME_FLOAT(pos_norm.x); SAME_FLOAT(pos_norm.y);
  SAME_FLOAT(vel_norm_s.x); SAME_FLOAT(vel_norm_s.y);
  SAME_FLOAT(energy); SAME_FLOAT(fill); SAME_FLOAT(headspace);
  SAME_FLOAT(container_x_m); SAME_FLOAT(container_y_m); SAME_FLOAT(container_z_m);
  SAME_VALUE(family);
  for (int i = 0; i < 4; ++i) {
    SAME_FLOAT(wall_impact_speed_norm_s[i]); SAME_FLOAT(wall_contact[i]);
  }
}

void assertSameTilt(const TiltPlaneCommand& expected, const TiltPlaneCommand& actual) {
  SAME_FLOAT(thumb_angle_deg); SAME_FLOAT(index_angle_deg);
  SAME_FLOAT(thumb_current_limit_ma); SAME_FLOAT(index_current_limit_ma);
  SAME_FLOAT(thumb_base_deg); SAME_FLOAT(index_base_deg);
  SAME_FLOAT(thumb_delta_deg); SAME_FLOAT(index_delta_deg);
  SAME_FLOAT(common_force_n); SAME_FLOAT(differential_torque_nm);
  SAME_FLOAT(cg_x_m); SAME_FLOAT(cg_y_m); SAME_FLOAT(apparent_mass_kg);
  SAME_VALUE(pseudoforce_enabled);
}

void assertSameFrame(const SynthesisFrame& expected, const SynthesisFrame& actual) {
  ++compared_frames;
  SAME_VALUE(accepted);
  if (!expected.accepted) return;
  SAME_VALUE(tilt_action);
  assertSameMass(expected.mass, actual.mass);
  assertSameTilt(expected.tilt, actual.tilt);
  SAME_VALUE(last_event.type); SAME_VALUE(last_event.primary_wall);
  SAME_VALUE(last_event.clustered);
  SAME_FLOAT(last_event.direction.x); SAME_FLOAT(last_event.direction.y);
  SAME_FLOAT(last_event.amplitude); SAME_FLOAT(last_event.duration_ms);
  SAME_FLOAT(last_event.density_hz);
  for (int i = 0; i < 4; ++i) {
    SAME_FLOAT(spatial.drive.low[i]); SAME_FLOAT(spatial.drive.high[i]);
    SAME_FLOAT(spatial.drive.noise[i]); SAME_FLOAT(spatial.summary.ch[i]);
  }
  SAME_VALUE(debug.event_count); SAME_VALUE(debug.texture_count);
  SAME_VALUE(debug.resonance_count);
  SAME_VALUE(debug.mass_enabled); SAME_VALUE(debug.event_enabled);
  SAME_VALUE(debug.texture_enabled); SAME_VALUE(debug.resonance_enabled);
  SAME_VALUE(debug.spatial_enabled);
}

#undef SAME_FLOAT
#undef SAME_VALUE

SynthesisContext contextFor(const SystemParams& params, RunMode mode,
                            bool stale = false, bool model_tilt = true) {
  SynthesisContext context{};
  context.outputs_allowed = mode != RunMode::Idle && !stale;
  context.tilt_allowed = (mode == RunMode::Live || mode == RunMode::Record) &&
      !stale && params.features.enable_tilt_plane;
  context.use_tilt_model = model_tilt;
  return context;
}

ImuSample motion(int frame) {
  ImuSample sample{};
  sample.timestamp_us = static_cast<uint32_t>(frame) * 4000U;
  sample.valid = true;
  const int phase = (frame / 70) % 6;
  sample.accel_g = phase == 0 ? Vec3f{0.0f, 1.0f, 0.0f}
      : phase == 1 ? Vec3f{0.8f, 0.6f, 0.1f}
      : phase == 2 ? Vec3f{-0.8f, 0.6f, -0.1f}
      : phase == 3 ? Vec3f{0.0f, -1.0f, 0.0f}
      : phase == 4 ? Vec3f{2.0f, 1.8f, 0.2f}
      : Vec3f{-1.5f, -1.3f, -0.2f};
  if (frame % 11 == 0) sample.accel_g.x += 0.7f;
  sample.gyro_dps = {frame % 17 == 0 ? 90.0f : 0.0f,
                     phase == 4 ? 140.0f : 0.0f, 5.0f};
  return sample;
}

SystemParams preset(int index, bool coherent) {
  const SystemParams presets[] = {
      makeDefaultLiquidPreset(), makeDefaultLiquidDenseJarPreset(),
      makeDefaultLiquidHalfTubePreset(), makeDefaultGranularPreset(),
      makeDefaultGranularSandPreset(), makeDefaultGranularBeadPreset(),
      makeDefaultGranularSingleMarblePreset(), makeDefaultHybridPreset(),
      makeDefaultDetentedPreset(),
  };
  auto params = presets[index];
  params.features.enable_tilt_plane = true;
  params.features.enable_coherent_container_demo = coherent;
  params.features.enable_gravity_separated_mass_activity = coherent;
  params.features.enable_physical_master_gain = coherent;
  params.features.enable_attack_preserving_texture = coherent;
  params.features.enable_single_shot_spatial_delay = coherent;
  return params;
}

struct Comparison {
  HapticSynthesisCore core{};
  synthesis_reference::PreExtractionPipeline reference{};
  TiltPlaneCommand previous_tilt{};
  uint32_t events = 0;
  uint32_t driven_frames = 0;
  uint32_t held_frames = 0;

  void reset(const SystemParams& params) {
    core.reset(params);
    reference.configure(params);
    reference.resetDynamicPipelineState();
  }

  void compare(const SystemParams& params, const ImuSample& sample, float dt_s,
               RunMode mode = RunMode::Live, bool stale = false,
               bool model_tilt = true) {
    reference.params_ = params;
    auto expected = reference.step(sample, dt_s, mode, stale, model_tilt);
    auto actual = core.step(params, sample, dt_s,
                            contextFor(params, mode, stale, model_tilt));
    // Reproduce only the runtime's already-issued-command hold/diagnostic
    // selection; no hardware is touched and no model is duplicated here.
    if (actual.accepted && actual.tilt_action == SynthesisTiltAction::Hold) {
      actual.tilt = previous_tilt;
      ++held_frames;
    }
    if (actual.accepted && !model_tilt &&
        actual.tilt_action == SynthesisTiltAction::Submit) {
      TiltPlaneCommand manual{};
      manual.thumb_angle_deg = 4.0f;
      manual.index_angle_deg = -4.0f;
      actual.tilt = manual;
      expected.tilt = manual;
      reference.previous_tilt = manual;
    }
    assertSameFrame(expected, actual);
    if (!actual.accepted) return;
    previous_tilt = actual.tilt;
    events += actual.debug.event_count;
    for (float level : actual.spatial.summary.ch) {
      if (level > 0.0f) { ++driven_frames; break; }
    }
  }
};

void compareAllPresets(bool coherent) {
  uint32_t events = 0;
  uint32_t driven = 0;
  for (int family = 0; family < 9; ++family) {
    auto params = preset(family, coherent);
    Comparison pair;
    pair.reset(params);
    for (int frame = 0; frame < 1400; ++frame) {
      auto sample = motion(frame);
      const int cycle = frame % 200;
      if (cycle >= 51 && cycle <= 53) sample.valid = false;
      if (cycle == 100) sample.valid = false;
      const float dt = cycle == 100 ? 0.060f
          : cycle == 151 ? 0.024f : cycle == 155 ? 0.049f : kDt;
      const RunMode mode = frame < 900 ? RunMode::Live
          : frame < 1000 ? RunMode::Record
          : frame < 1100 ? RunMode::Replay
          : frame < 1200 ? RunMode::Calibration
          : frame < 1300 ? RunMode::Idle : RunMode::Live;
      pair.compare(params, sample, dt, mode, frame >= 1350 && frame < 1375,
                   !(frame >= 700 && frame < 800));
    }
    events += pair.events;
    driven += pair.driven_frames;
    if (coherent) TEST_ASSERT_GREATER_THAN_UINT32(0, pair.held_frames);
  }
  TEST_ASSERT_GREATER_THAN_UINT32(100, events);
  TEST_ASSERT_GREATER_THAN_UINT32(100, driven);
}

void test_legacy_composition_matches_pre_extraction_for_all_nine_presets() {
  compareAllPresets(false);
}

void test_coherent_composition_matches_pre_extraction_for_all_nine_presets() {
  compareAllPresets(true);
}

void test_all_layer_gate_combinations_and_tilt_only_boundary_match() {
  for (bool coherent : {false, true}) {
    for (unsigned mask = 0; mask < 64; ++mask) {
      auto params = preset(4, coherent);
      params.features.enable_mass_layer = (mask & 1U) != 0;
      params.features.enable_event_layer = (mask & 2U) != 0;
      params.features.enable_texture_layer = (mask & 4U) != 0;
      params.features.enable_resonance_layer = (mask & 8U) != 0;
      params.features.enable_spatial_renderer = (mask & 16U) != 0;
      params.features.enable_tilt_plane = (mask & 32U) != 0;
      Comparison pair;
      pair.reset(params);
      for (int frame = 0; frame < 240; ++frame) {
        auto sample = motion(frame);
        if (frame % 40 == 12) sample.valid = false;
        pair.compare(params, sample, frame % 80 == 51 ? 0.060f : kDt);
      }
    }
  }
}

void test_reconfigure_reset_and_calibration_output_refresh_match() {
  auto params = preset(6, true);
  Comparison pair;
  pair.reset(params);
  for (int frame = 0; frame < 1000; ++frame) {
    if (frame == 220) {
      params = preset(7, true);
      pair.core.configure(params);  // preserve tilt history, as set_param does
      pair.reference.configure(params);
    }
    if (frame == 370) {
      params.resonance.master_gain = 1.2f;
      params.resonance.low_carrier_hz[2] = 180.0f;
      pair.core.configureOutput(params);
      pair.reference.refreshOutputConfig(params);
    }
    if (frame == 520) {
      pair.core.reset(params);
      pair.reference.resetDynamicPipelineState();
    }
    if (frame == 700) {
      pair.core.resetTilt();
      pair.reference.resetTilt();
    }
    // Runtime tilt gating changes without resetting other layer settings.
    params.features.enable_tilt_plane = !(frame >= 850 && frame < 910);
    pair.compare(params, motion(frame), kDt);
  }
}

void test_rejected_time_does_not_change_the_next_accepted_frame() {
  for (bool coherent : {false, true}) {
    auto params = preset(6, coherent);
    HapticSynthesisCore core;
    HapticSynthesisCore uninterrupted;
    core.reset(params);
    uninterrupted.reset(params);
    const auto context = contextFor(params, RunMode::Live);
    for (int frame = 0; frame < 300; ++frame) {
      for (float invalid : {0.0f, -kDt, std::numeric_limits<float>::infinity(),
                            std::numeric_limits<float>::quiet_NaN()}) {
        TEST_ASSERT_FALSE(core.step(params, motion(frame), invalid, context).accepted);
      }
      assertSameFrame(uninterrupted.step(params, motion(frame), kDt, context),
                      core.step(params, motion(frame), kDt, context));
    }
  }
}

void test_missing_sample_holds_then_long_gap_resets_without_inventing_events() {
  const auto params = preset(6, true);
  HapticSynthesisCore core;
  core.reset(params);
  const auto context = contextFor(params, RunMode::Live);
  auto frame = core.step(params, motion(80), kDt, context);
  TEST_ASSERT_EQUAL_UINT16(0, frame.debug.event_count);
  for (int i = 81; i < 120; ++i) frame = core.step(params, motion(i), kDt, context);
  auto missing = motion(120);
  missing.valid = false;
  const auto held = core.step(params, missing, kDt, context);
  TEST_ASSERT_EQUAL(SynthesisTiltAction::Hold, held.tilt_action);
  assertSameMass(frame.mass, held.mass);
  TEST_ASSERT_EQUAL_UINT16(0, held.debug.event_count);
  core.step(params, missing, 0.060f, context);
  const auto reset = core.step(params, motion(121), kDt, context);
  TEST_ASSERT_EQUAL(SynthesisTiltAction::Hold, reset.tilt_action);
  TEST_ASSERT_FLOAT_WITHIN(0.000001f, 0.0f, reset.mass.pos_norm.x);
  TEST_ASSERT_FLOAT_WITHIN(0.000001f, 0.0f, reset.mass.energy);
  TEST_ASSERT_EQUAL_UINT16(0, reset.debug.event_count);
  const auto resumed = core.step(params, motion(122), kDt, context);
  TEST_ASSERT_EQUAL(SynthesisTiltAction::Submit, resumed.tilt_action);
  TEST_ASSERT_EQUAL_UINT16(0, resumed.debug.event_count);
}

void test_unsupported_dynamics_request_neutral_fault_instead_of_hold() {
  auto params = preset(6, false);
  params.features.enable_gravity_separated_mass_activity = true;
  params.mass.natural_freq_x_hz = std::numeric_limits<float>::quiet_NaN();
  HapticSynthesisCore core;
  core.reset(params);
  const auto frame = core.step(params, motion(80), kDt,
                                contextFor(params, RunMode::Live));
  TEST_ASSERT_EQUAL(SynthesisTiltAction::FaultNeutral, frame.tilt_action);
  TEST_ASSERT_EQUAL_UINT16(0, frame.debug.event_count);
  assertSameTilt(TiltPlaneCommand{}, frame.tilt);
  for (float level : frame.spatial.summary.ch) TEST_ASSERT_EQUAL_FLOAT(0.0f, level);
  Comparison pair;
  pair.reset(params);
  pair.compare(params, motion(80), kDt);
}

void test_stopped_and_feature_disabled_contexts_produce_no_output() {
  auto params = preset(6, true);
  HapticSynthesisCore core;
  core.reset(params);
  for (int i = 0; i < 250; ++i) {
    core.step(params, motion(i), kDt, contextFor(params, RunMode::Live));
  }
  SynthesisContext stopped{};
  stopped.outputs_allowed = false;
  stopped.tilt_allowed = true;  // suppression dominates a stale caller request
  const auto frame = core.step(params, motion(250), kDt, stopped);
  TEST_ASSERT_EQUAL(SynthesisTiltAction::Disabled, frame.tilt_action);
  TEST_ASSERT_EQUAL_UINT16(0, frame.debug.event_count);
  TEST_ASSERT_EQUAL_UINT16(0, frame.debug.texture_count);
  TEST_ASSERT_EQUAL_UINT16(0, frame.debug.resonance_count);
  for (int i = 0; i < 4; ++i) {
    TEST_ASSERT_EQUAL_FLOAT(0.0f, frame.spatial.drive.low[i]);
    TEST_ASSERT_EQUAL_FLOAT(0.0f, frame.spatial.drive.high[i]);
    TEST_ASSERT_EQUAL_FLOAT(0.0f, frame.spatial.drive.noise[i]);
  }
  assertSameMass(HapticSynthesisCore::defaultMassState(params), frame.mass);
  params.features.enable_tilt_plane = false;
  stopped.outputs_allowed = true;
  TEST_ASSERT_EQUAL(SynthesisTiltAction::Disabled,
                    core.step(params, motion(251), kDt, stopped).tilt_action);
}

void test_manual_override_leaves_normal_tilt_model_unadvanced() {
  auto params = preset(6, true);
  HapticSynthesisCore core;
  TiltPseudoForceModel independent_tilt;
  core.reset(params);
  independent_tilt.configure(params);
  independent_tilt.reset();
  for (int i = 0; i < 500; ++i) {
    const bool use_model = i < 100 || i >= 350;
    const auto frame = core.step(params, motion(i), kDt,
        contextFor(params, RunMode::Live, false, use_model));
    TEST_ASSERT_EQUAL(SynthesisTiltAction::Submit, frame.tilt_action);
    if (use_model) {
      assertSameTilt(independent_tilt.update(motion(i), frame.mass, kDt), frame.tilt);
    } else {
      assertSameTilt(TiltPlaneCommand{}, frame.tilt);
    }
  }
}
}  // namespace

void setUp() {}
void tearDown() {}
int main() {
  UNITY_BEGIN();
  RUN_TEST(test_legacy_composition_matches_pre_extraction_for_all_nine_presets);
  RUN_TEST(test_coherent_composition_matches_pre_extraction_for_all_nine_presets);
  RUN_TEST(test_all_layer_gate_combinations_and_tilt_only_boundary_match);
  RUN_TEST(test_reconfigure_reset_and_calibration_output_refresh_match);
  RUN_TEST(test_rejected_time_does_not_change_the_next_accepted_frame);
  RUN_TEST(test_missing_sample_holds_then_long_gap_resets_without_inventing_events);
  RUN_TEST(test_unsupported_dynamics_request_neutral_fault_instead_of_hold);
  RUN_TEST(test_stopped_and_feature_disabled_contexts_produce_no_output);
  RUN_TEST(test_manual_override_leaves_normal_tilt_model_unadvanced);
  std::printf("Compared %u complete frames, field-by-field, including float bits.\n",
              static_cast<unsigned>(compared_frames));
  return UNITY_END();
}
