#include <unity.h>

#include <algorithm>
#include <cmath>
#include <limits>

#include "haptics/EventLayer.hpp"
#include "haptics/MassMotionLayer.hpp"

namespace {
constexpr float kPi = 3.14159265358979323846f;

haptics::SystemParams sandParams() {
  auto params = haptics::makeDefaultGranularSandPreset();
  params.features.enable_coherent_container_demo = true;
  params.features.enable_granular_pile_demo = true;
  return params;
}

haptics::ImuSample sample(float x, float y) {
  haptics::ImuSample value{};
  value.valid = true;
  value.accel_g = {x, y, 0.0f};
  return value;
}

haptics::ImuSample tilt(float degrees) {
  const float radians = degrees * kPi / 180.0f;
  return sample(std::sin(radians), std::cos(radians));
}

haptics::MassState hold(haptics::MassMotionLayer& layer, float degrees,
                        float seconds, float dt = 0.004f) {
  const unsigned count = static_cast<unsigned>(std::lround(seconds / dt));
  for (unsigned step = 0U; step < count; ++step) layer.update(tilt(degrees), dt);
  return layer.state();
}

void assertFinite(const haptics::MassState& state) {
  for (float value : {state.pos_norm.x, state.pos_norm.y, state.vel_norm_s.x,
                      state.vel_norm_s.y, state.pile_slope, state.granular_flow,
                      state.energy}) {
    TEST_ASSERT_TRUE(std::isfinite(value));
  }
  TEST_ASSERT_TRUE(std::fabs(state.pos_norm.x) <= 1.00001f);
  TEST_ASSERT_TRUE(std::fabs(state.pos_norm.y) <= 1.00001f);
  TEST_ASSERT_TRUE(std::fabs(state.pile_slope) <= 4.00001f);
  TEST_ASSERT_TRUE(state.granular_flow >= 0.0f && state.granular_flow <= 1.0f);
  for (float value : state.wall_contact) TEST_ASSERT_TRUE(value >= 0.0f && value <= 1.0f);
}

void test_rest_and_subthreshold_tilt_keep_a_silent_flat_pile() {
  const auto params = sandParams();
  haptics::MassMotionLayer layer;
  haptics::EventLayer events;
  layer.configure(params);
  events.configure(params);
  for (unsigned step = 0U; step < 800U; ++step) {
    const auto state = layer.update(tilt(step < 200U ? 0.0f : 20.0f), 0.004f);
    TEST_ASSERT_TRUE(state.granular_pile_active);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.pile_slope);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.pos_norm.x);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, -1.0f + params.container.fill, state.pos_norm.y);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.energy);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.granular_flow);
    TEST_ASSERT_EQUAL_UINT32(0U, events.update(state, 0.004f).count);
  }
}

void test_avalanche_retains_deposit_at_level_and_reverse_tilt_reflows() {
  haptics::MassMotionLayer layer;
  haptics::EventLayer events;
  const auto params = sandParams();
  layer.configure(params);
  events.configure(params);
  hold(layer, 0.0f, 0.20f);
  float peak_flow = 0.0f;
  unsigned flow_events = 0U;
  for (unsigned step = 0U; step < 750U; ++step) {
    const auto state = layer.update(tilt(45.0f), 0.004f);
    peak_flow = std::max(peak_flow, state.granular_flow);
    flow_events += static_cast<unsigned>(events.update(state, 0.004f).count);
  }
  const auto deposited = layer.state();
  TEST_ASSERT_LESS_THAN_FLOAT(-0.10f, deposited.pos_norm.x);
  TEST_ASSERT_LESS_THAN_FLOAT(-0.20f, deposited.pile_slope);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.10f, peak_flow);
  TEST_ASSERT_GREATER_THAN_UINT32(0U, flow_events);
  const auto level = hold(layer, 0.0f, 2.0f);
  TEST_ASSERT_FLOAT_WITHIN(0.015f, deposited.pos_norm.x, level.pos_norm.x);
  TEST_ASSERT_FLOAT_WITHIN(0.025f, deposited.pile_slope, level.pile_slope);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-5f, 0.0f, level.granular_flow);
  for (unsigned step = 0U; step < 100U; ++step) {
    TEST_ASSERT_EQUAL_UINT32(0U, events.update(layer.update(tilt(0.0f), 0.004f), 0.004f).count);
  }
  const auto reversed = hold(layer, -40.0f, 3.0f);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.07f, reversed.pos_norm.x);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.15f, reversed.pile_slope);
}

void test_strong_shaking_releases_a_previously_stuck_deposit() {
  haptics::MassMotionLayer layer;
  layer.configure(sandParams());
  hold(layer, 0.0f, 0.10f);
  hold(layer, 45.0f, 3.0f);
  const auto stuck = hold(layer, 0.0f, 1.0f);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-5f, 0.0f, stuck.granular_flow);
  float peak_flow = 0.0f;
  float distance = 0.0f;
  float previous_x = stuck.pos_norm.x;
  for (unsigned step = 0U; step < 200U; ++step) {
    const auto state = layer.update(sample((step / 35U) % 2U ? 1.4f : -1.4f, 1.0f), 0.004f);
    peak_flow = std::max(peak_flow, state.granular_flow);
    distance += std::fabs(state.pos_norm.x - previous_x);
    previous_x = state.pos_norm.x;
    assertFinite(state);
  }
  TEST_ASSERT_GREATER_THAN_FLOAT(0.15f, peak_flow);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.10f, distance);
}

void test_tilted_initialization_and_configure_do_not_invent_motion() {
  auto params = sandParams();
  haptics::MassMotionLayer layer;
  haptics::EventLayer events;
  layer.configure(params);
  events.configure(params);
  const auto initial = layer.update(tilt(45.0f), 0.004f);
  TEST_ASSERT_LESS_THAN_FLOAT(-0.10f, initial.pos_norm.x);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, initial.granular_flow);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, initial.energy);
  TEST_ASSERT_EQUAL_UINT32(0U, events.update(initial, 0.004f).count);
  layer.configure(params);
  const auto reset = layer.update(tilt(0.0f), 0.004f);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, reset.pos_norm.x);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, reset.pile_slope);
}

void test_shape_centroid_matches_volume_and_mirror_geometry() {
  for (float fill : {0.04f, 0.35f, 0.75f, 0.98f}) {
    auto params = sandParams();
    params.container.fill = fill;
    params.container.span_x_m = 0.09f;
    params.container.span_y_m = 0.05f;
    haptics::MassMotionLayer left, right;
    left.configure(params);
    right.configure(params);
    const auto a = left.update(tilt(45.0f), 0.004f);
    const auto b = right.update(tilt(-45.0f), 0.004f);
    assertFinite(a);
    TEST_ASSERT_FLOAT_WITHIN(2.0e-5f, a.pos_norm.x, -b.pos_norm.x);
    TEST_ASSERT_FLOAT_WITHIN(2.0e-5f, a.pos_norm.y, b.pos_norm.y);
    // Independent midpoint integration of the clipped filled height.
    const double slope = a.pile_slope * params.container.span_x_m / params.container.span_y_m;
    double lo = -1.0 - std::fabs(slope), hi = 1.0 + std::fabs(slope);
    double area = 0.0, x_moment = 0.0, y_moment = 0.0;
    for (unsigned solve = 0U; solve < 28U; ++solve) {
      const double intercept = (lo + hi) * 0.5;
      area = x_moment = y_moment = 0.0;
      for (unsigned column = 0U; column < 2000U; ++column) {
        const double x = -1.0 + (column + 0.5) * 0.001;
        const double height = std::max(0.0, std::min(2.0, intercept + slope * x + 1.0));
        area += height * 0.001;
        x_moment += x * height * 0.001;
        y_moment += (-height + 0.5 * height * height) * 0.001;
      }
      if (area < 4.0 * fill) lo = intercept; else hi = intercept;
    }
    TEST_ASSERT_FLOAT_WITHIN(3.0e-5f, fill, static_cast<float>(area * 0.25));
    TEST_ASSERT_FLOAT_WITHIN(3.0e-5f, a.pos_norm.x, static_cast<float>(x_moment / area));
    TEST_ASSERT_FLOAT_WITHIN(3.0e-5f, a.pos_norm.y, static_cast<float>(y_moment / area));
  }
}

void test_empty_full_and_invalid_time_are_bounded_without_false_activity() {
  for (float fill : {0.0f, 1.0f}) {
    auto params = sandParams();
    params.container.fill = fill;
    haptics::MassMotionLayer layer;
    layer.configure(params);
    for (unsigned step = 0U; step < 80U; ++step) {
      const auto state = layer.update(sample(step % 2U ? 2.0f : -2.0f, 0.5f), 0.01f);
      assertFinite(state);
      TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.granular_flow);
      TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.energy);
      TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.pos_norm.x);
    }
  }
  auto params = sandParams();
  params.container.content_mass_full_kg = 0.0f;
  haptics::MassMotionLayer layer;
  layer.configure(params);
  TEST_ASSERT_FALSE(layer.update(tilt(45.0f), 0.004f).granular_pile_active);
  layer.configure(sandParams());
  hold(layer, 0.0f, 0.1f);
  const auto before = hold(layer, 45.0f, 3.0f);
  for (float dt : {0.0f, -1.0f, std::numeric_limits<float>::quiet_NaN(),
                    std::numeric_limits<float>::infinity(), 60.0f}) {
    const auto state = layer.update(tilt(-60.0f), dt);
    assertFinite(state);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, before.pile_slope, state.pile_slope);
  }
  const auto after = layer.update(tilt(-45.0f), 0.004f);
  assertFinite(after);
}

void test_friction_parameters_change_onset_and_dt_preserves_history() {
  auto low_params = sandParams();
  auto high_params = low_params;
  low_params.mass.granular_static_friction = 0.15f;
  low_params.mass.granular_dynamic_friction = 0.10f;
  haptics::MassMotionLayer low, high;
  low.configure(low_params);
  high.configure(high_params);
  hold(low, 0.0f, 0.1f);
  hold(high, 0.0f, 0.1f);
  TEST_ASSERT_LESS_THAN_FLOAT(-0.05f, hold(low, 20.0f, 2.0f).pos_norm.x);
  TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, hold(high, 20.0f, 2.0f).pos_norm.x);
  float reference = 0.0f;
  for (float dt : {0.001f, 0.004f, 0.016f, 0.05f}) {
    high.configure(high_params);
    hold(high, 0.0f, 0.20f, dt);
    hold(high, 45.0f, 2.0f, dt);
    const auto state = hold(high, 0.0f, 1.0f, dt);
    if (dt == 0.001f) reference = state.pos_norm.x;
    TEST_ASSERT_FLOAT_WITHIN(0.015f, reference, state.pos_norm.x);
    TEST_ASSERT_FLOAT_WITHIN(1.0e-5f, 0.0f, state.granular_flow);
  }
}

void test_marble_and_generic_paths_ignore_the_pile_gate() {
  for (bool coherent : {false, true}) {
    auto a = coherent ? haptics::makeDefaultGranularSingleMarblePreset()
                       : haptics::makeDefaultGranularSandPreset();
    a.features.enable_coherent_container_demo = coherent;
    auto b = a;
    b.features.enable_granular_pile_demo = true;
    haptics::MassMotionLayer off, on;
    off.configure(a);
    on.configure(b);
    for (unsigned step = 0U; step < 500U; ++step) {
      const auto imu = tilt(step < 30U ? 0.0f : (step < 200U ? 40.0f : -35.0f));
      const auto expected = off.update(imu, 0.004f);
      const auto actual = on.update(imu, 0.004f);
      TEST_ASSERT_EQUAL_FLOAT(expected.pos_norm.x, actual.pos_norm.x);
      TEST_ASSERT_EQUAL_FLOAT(expected.pos_norm.y, actual.pos_norm.y);
      TEST_ASSERT_EQUAL_FLOAT(expected.vel_norm_s.x, actual.vel_norm_s.x);
      TEST_ASSERT_EQUAL_FLOAT(expected.energy, actual.energy);
      TEST_ASSERT_FALSE(actual.granular_pile_active);
      for (unsigned wall = 0U; wall < 4U; ++wall) {
        TEST_ASSERT_EQUAL_FLOAT(expected.wall_impact_speed_norm_s[wall], actual.wall_impact_speed_norm_s[wall]);
      }
    }
  }
}
}  // namespace

void setUp() {}
void tearDown() {}
int main() {
  UNITY_BEGIN();
  RUN_TEST(test_rest_and_subthreshold_tilt_keep_a_silent_flat_pile);
  RUN_TEST(test_avalanche_retains_deposit_at_level_and_reverse_tilt_reflows);
  RUN_TEST(test_strong_shaking_releases_a_previously_stuck_deposit);
  RUN_TEST(test_tilted_initialization_and_configure_do_not_invent_motion);
  RUN_TEST(test_shape_centroid_matches_volume_and_mirror_geometry);
  RUN_TEST(test_empty_full_and_invalid_time_are_bounded_without_false_activity);
  RUN_TEST(test_friction_parameters_change_onset_and_dt_preserves_history);
  RUN_TEST(test_marble_and_generic_paths_ignore_the_pile_gate);
  return UNITY_END();
}
