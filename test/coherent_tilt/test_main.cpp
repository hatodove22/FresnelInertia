#include <unity.h>

#include <algorithm>
#include <cmath>
#include <limits>

#include "haptics/HardwareProfiles.hpp"
#include "haptics/TiltPseudoForceModel.hpp"

namespace {

constexpr float kDt = 0.004f;
constexpr float kTolerance = 0.0001f;

haptics::SystemParams demoParams() {
  auto params = haptics::makeDefaultLiquidPreset();
  params.features.enable_coherent_container_demo = true;
  return params;
}

haptics::ImuSample restingImu() {
  haptics::ImuSample sample{};
  sample.valid = true;
  sample.accel_g = {0.0f, 1.0f, 0.0f};
  return sample;
}

haptics::TiltPlaneCommand settle(haptics::TiltPseudoForceModel& model,
                               const haptics::ImuSample& sample,
                               const haptics::MassState& mass) {
  haptics::TiltPlaneCommand command{};
  for (int i = 0; i < 500; ++i) {
    command = model.update(sample, mass, kDt);
  }
  return command;
}

void assertSameCommand(const haptics::TiltPlaneCommand& expected,
                       const haptics::TiltPlaneCommand& actual) {
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.thumb_angle_deg, actual.thumb_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.index_angle_deg, actual.index_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.thumb_delta_deg, actual.thumb_delta_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.index_delta_deg, actual.index_delta_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.common_force_n, actual.common_force_n);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.differential_torque_nm, actual.differential_torque_nm);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.cg_x_m, actual.cg_x_m);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.cg_y_m, actual.cg_y_m);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.apparent_mass_kg, actual.apparent_mass_kg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.thumb_current_limit_ma, actual.thumb_current_limit_ma);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.index_current_limit_ma, actual.index_current_limit_ma);
}

void test_position_step_and_reversal_limit_the_complete_command() {
  auto params = demoParams();
  params.tilt.enable_pseudoforce = false;
  params.tilt.command_cutoff_hz = 1000.0f;
  params.tilt.max_velocity_deg_s = 60.0f;
  params.tilt.pseudoforce_slew_deg_s = 80.0f;
  haptics::TiltPseudoForceModel model;
  model.configure(params);
  haptics::MassState mass{};
  auto previous = model.update(restingImu(), mass, kDt);
  const float max_step = 60.0f * kDt;
  for (int frame = 0; frame < 300; ++frame) {
    mass.pos_norm.x = frame < 150 ? 1.0f : -1.0f;
    const auto command = model.update(restingImu(), mass, kDt);
    TEST_ASSERT_TRUE(std::fabs(command.thumb_angle_deg - previous.thumb_angle_deg) <= max_step + kTolerance);
    TEST_ASSERT_TRUE(std::fabs(command.index_angle_deg - previous.index_angle_deg) <= max_step + kTolerance);
    TEST_ASSERT_TRUE(std::fabs(command.thumb_angle_deg) <= params.tilt.max_total_cmd_deg + kTolerance);
    TEST_ASSERT_TRUE(std::fabs(command.index_angle_deg) <= params.tilt.max_total_cmd_deg + kTolerance);
    TEST_ASSERT_FLOAT_WITHIN(kTolerance, command.thumb_angle_deg, command.index_angle_deg);
    previous = command;
  }
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, -10.0f, previous.thumb_angle_deg);
}

void test_position_only_is_common_and_clearly_above_five_degrees() {
  auto params = demoParams();
  params.tilt.enable_pseudoforce = false;
  haptics::TiltPseudoForceModel model;
  model.configure(params);
  haptics::MassState mass{};
  mass.pos_norm.x = 0.75f;
  const auto command = settle(model, restingImu(), mass);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 7.5f, command.thumb_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 7.5f, command.index_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, command.thumb_delta_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, command.index_delta_deg);
}

void test_mounting_signs_apply_to_position_as_well_as_force() {
  auto params = demoParams();
  params.tilt.enable_pseudoforce = false;
  params.tilt.sign_thumb = -1.0f;
  params.tilt.sign_index = 1.0f;
  params.tilt.thumb_home_deg = 2.0f;
  params.tilt.index_home_deg = -3.0f;
  haptics::TiltPseudoForceModel model;
  model.configure(params);
  haptics::MassState mass{};
  mass.pos_norm.x = 0.7f;
  const auto command = settle(model, restingImu(), mass);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, -5.0f, command.thumb_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 4.0f, command.index_angle_deg);
}

void test_eccentric_load_is_differential_and_reverses_with_cg() {
  auto params = demoParams();
  params.tilt.max_tilt_deg = 0.0f;
  params.tilt.k_cm = 0.0f;
  params.tilt.k_tau = 1.0f;
  params.container.shell_cg_x_m = 0.02f;
  haptics::MassState mass{};
  haptics::TiltPseudoForceModel positive;
  positive.configure(params);
  const auto right = settle(positive, restingImu(), mass);
  TEST_ASSERT_TRUE(right.differential_torque_nm > 0.0f);
  TEST_ASSERT_TRUE(right.thumb_angle_deg > 0.0f);
  TEST_ASSERT_TRUE(right.index_angle_deg < 0.0f);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, right.thumb_angle_deg, -right.index_angle_deg);
  params.container.shell_cg_x_m = -0.02f;
  haptics::TiltPseudoForceModel negative;
  negative.configure(params);
  const auto left = settle(negative, restingImu(), mass);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, right.thumb_angle_deg, -left.thumb_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, right.index_angle_deg, -left.index_angle_deg);
}

void test_saturation_preserves_common_differential_ratio() {
  auto params = demoParams();
  params.container.shell_mass_kg = 1.0f;
  params.container.shell_cg_x_m = 0.03f;
  params.tilt.k_cm = 0.0f;
  params.tilt.k_tau = 1.0f;
  params.tilt.k_phi = 10.0f;
  params.tilt.max_delta_df_deg = 10.0f;
  params.tilt.max_delta_total_deg = 10.0f;
  haptics::TiltPseudoForceModel model;
  model.configure(params);
  haptics::MassState mass{};
  mass.pos_norm.x = 0.4f;
  const auto command = settle(model, restingImu(), mass);
  // Raw targets are common 4 plus differential +/-10 => [14,-6].
  // Scaling the pair into +/-10 must retain -6/14, not clip it to [10,-6].
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 10.0f, command.thumb_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, -60.0f / 14.0f, command.index_angle_deg);
}

void test_reset_clears_full_command_and_force_history() {
  const auto params = demoParams();
  haptics::TiltPseudoForceModel used;
  used.configure(params);
  haptics::MassState mass{};
  auto sample = restingImu();
  for (int i = 0; i < 200; ++i) {
    mass.pos_norm = {0.6f * std::sin(i * 0.05f), 0.4f};
    sample.accel_g.x = 0.3f * std::cos(i * 0.04f);
    used.update(sample, mass, kDt);
  }
  used.reset();
  haptics::TiltPseudoForceModel fresh;
  fresh.configure(params);
  for (int i = 0; i < 40; ++i) {
    assertSameCommand(fresh.update(sample, mass, kDt), used.update(sample, mass, kDt));
  }
}

void test_as_built_profile_retains_strong_parallel_position_cue() {
  auto params = demoParams();
  haptics::applyAsBuiltAtomS3Profile(params);
  params.tilt.enable_pseudoforce = false;
  haptics::TiltPseudoForceModel model;
  model.configure(params);
  haptics::MassState mass{};
  mass.pos_norm.x = 0.8f;
  const auto command = settle(model, restingImu(), mass);
  TEST_ASSERT_TRUE(std::fabs(command.thumb_angle_deg) >= 5.0f);
  TEST_ASSERT_TRUE(std::fabs(command.index_angle_deg) >= 5.0f);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, command.thumb_angle_deg, command.index_angle_deg);
  TEST_ASSERT_EQUAL_INT8(params.tilt.thumb_raw_direction, params.tilt.index_raw_direction);
}

void test_legacy_flag_off_keeps_previous_position_mapping() {
  auto params = demoParams();
  params.features.enable_coherent_container_demo = false;
  params.tilt.enable_pseudoforce = false;
  haptics::TiltPseudoForceModel model;
  model.configure(params);
  haptics::MassState mass{};
  mass.pos_norm.x = 0.7f;
  const auto command = model.update(restingImu(), mass, kDt);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 7.0f, command.thumb_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, -7.0f, command.index_angle_deg);
}

void test_empty_mass_does_not_leave_a_content_position_cue() {
  auto params = demoParams();
  params.container.shell_mass_kg = 0.0f;
  haptics::TiltPseudoForceModel model;
  model.configure(params);
  haptics::MassState mass{};
  mass.fill = 0.0f;
  mass.pos_norm = {1.0f, 0.4f};
  const auto command = settle(model, restingImu(), mass);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, command.apparent_mass_kg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, command.thumb_angle_deg);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, command.index_angle_deg);
}

void test_nonpositive_or_nonfinite_time_never_bypasses_slew() {
  for (const float dt : {0.0f, -0.01f, std::numeric_limits<float>::quiet_NaN()}) {
    auto params = demoParams();
    params.tilt.enable_pseudoforce = false;
    haptics::TiltPseudoForceModel model;
    model.configure(params);
    haptics::MassState mass{};
    const auto before = model.update(restingImu(), mass, kDt);
    mass.pos_norm.x = 1.0f;
    const auto after = model.update(restingImu(), mass, dt);
    TEST_ASSERT_FLOAT_WITHIN(kTolerance, before.thumb_angle_deg, after.thumb_angle_deg);
    TEST_ASSERT_FLOAT_WITHIN(kTolerance, before.index_angle_deg, after.index_angle_deg);
  }
}

}  // namespace

void setUp() {}
void tearDown() {}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_position_step_and_reversal_limit_the_complete_command);
  RUN_TEST(test_position_only_is_common_and_clearly_above_five_degrees);
  RUN_TEST(test_mounting_signs_apply_to_position_as_well_as_force);
  RUN_TEST(test_eccentric_load_is_differential_and_reverses_with_cg);
  RUN_TEST(test_saturation_preserves_common_differential_ratio);
  RUN_TEST(test_reset_clears_full_command_and_force_history);
  RUN_TEST(test_as_built_profile_retains_strong_parallel_position_cue);
  RUN_TEST(test_legacy_flag_off_keeps_previous_position_mapping);
  RUN_TEST(test_empty_mass_does_not_leave_a_content_position_cue);
  RUN_TEST(test_nonpositive_or_nonfinite_time_never_bypasses_slew);
  return UNITY_END();
}
