#include <unity.h>

#include <array>
#include <cmath>
#include <cstdint>

#include "haptics/EventLayer.hpp"
#include "haptics/MassMotionLayer.hpp"
#include "haptics/Parameters.hpp"
#include "haptics/TextureLayer.hpp"

namespace {

haptics::ImuSample coherentSample(float x_g, float y_g) {
  haptics::ImuSample sample{};
  sample.valid = true;
  sample.accel_g = {x_g, y_g, 0.0f};
  return sample;
}

haptics::SystemParams coherentMarble() {
  auto params = haptics::makeDefaultGranularSingleMarblePreset();
  params.features.enable_coherent_container_demo = true;
  params.features.enable_attack_preserving_texture = true;
  return params;
}

struct CoherentRun {
  float first_back_contact_s = -1.0f;
  float first_front_contact_s = -1.0f;
  float final_x = 0.0f;
  float final_speed = 0.0f;
  unsigned quiet_events = 0U;
};

CoherentRun runCoherentGesture(float dt_s) {
  const auto params = coherentMarble();
  haptics::MassMotionLayer mass;
  haptics::EventLayer event;
  mass.configure(params);
  event.configure(params);
  CoherentRun result{};
  const unsigned steps = static_cast<unsigned>(std::lround(4.0f / dt_s));
  for (unsigned step = 0; step <= steps; ++step) {
    const float time_s = step * dt_s;
    const float x_g = time_s < 0.20f ? 0.0f : (time_s < 0.80f ? 0.50f : (time_s < 1.50f ? -0.50f : 0.0f));
    const auto state = mass.update(coherentSample(x_g, std::sqrt(1.0f - x_g * x_g)), dt_s);
    const auto events = event.update(state, dt_s);
    for (std::size_t index = 0; index < events.count; ++index) {
      if (events.items[index].type == haptics::EventType::WallHit) {
        if (events.items[index].primary_wall == haptics::WallId::Back && result.first_back_contact_s < 0.0f) {
          result.first_back_contact_s = time_s;
        }
        if (events.items[index].primary_wall == haptics::WallId::Front && result.first_front_contact_s < 0.0f) {
          result.first_front_contact_s = time_s;
        }
      }
      if (time_s > 2.50f) {
        ++result.quiet_events;
      }
    }
    result.final_x = state.pos_norm.x;
    result.final_speed = std::fabs(state.vel_norm_s.x) + std::fabs(state.vel_norm_s.y);
  }
  return result;
}

void test_coherent_gravity_initialization_and_rest_have_no_impacts() {
  std::array<haptics::SystemParams, 3> presets{{
      coherentMarble(), haptics::makeDefaultGranularBeadPreset(), haptics::makeDefaultLiquidPreset()}};
  for (auto params : presets) {
    params.features.enable_coherent_container_demo = true;
    haptics::MassMotionLayer mass;
    haptics::EventLayer event;
    mass.configure(params);
    event.configure(params);
    for (unsigned step = 0; step < 1000U; ++step) {
      const auto state = mass.update(coherentSample(0.0f, 1.0f), 0.002f);
      TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, -1.0f, state.pos_norm.y);
      TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.energy);
      for (float impact : state.wall_impact_speed_norm_s) {
        TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, impact);
      }
      TEST_ASSERT_EQUAL_UINT32(0U, event.update(state, 0.002f).count);
    }
  }
}

void test_coherent_handling_reaches_correct_walls_and_settles() {
  const auto result = runCoherentGesture(0.004f);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.20f, result.first_back_contact_s);
  TEST_ASSERT_LESS_THAN_FLOAT(0.65f, result.first_back_contact_s);
  TEST_ASSERT_GREATER_THAN_FLOAT(0.80f, result.first_front_contact_s);
  TEST_ASSERT_LESS_THAN_FLOAT(1.35f, result.first_front_contact_s);
  TEST_ASSERT_FLOAT_WITHIN(0.005f, 1.0f, result.final_x);
  TEST_ASSERT_LESS_THAN_FLOAT(0.01f, result.final_speed);
  TEST_ASSERT_EQUAL_UINT32(0U, result.quiet_events);
}

void test_coherent_contact_timing_is_consistent_across_update_steps() {
  const auto fine = runCoherentGesture(0.001f);
  for (float dt_s : {0.004f, 0.008f}) {
    const auto result = runCoherentGesture(dt_s);
    TEST_ASSERT_FLOAT_WITHIN(0.016f, fine.first_back_contact_s, result.first_back_contact_s);
    TEST_ASSERT_FLOAT_WITHIN(0.016f, fine.first_front_contact_s, result.first_front_contact_s);
    TEST_ASSERT_FLOAT_WITHIN(0.01f, fine.final_x, result.final_x);
    TEST_ASSERT_EQUAL_UINT32(0U, result.quiet_events);
  }
}

void test_coherent_prebounce_contact_survives_reversed_velocity() {
  auto params = coherentMarble();
  haptics::EventLayer event;
  event.configure(params);
  haptics::MassState state{};
  state.family = haptics::MaterialFamily::Granular;
  state.container_x_m = 0.05f;
  state.pos_norm.x = 1.0f;
  state.vel_norm_s.x = -3.0f;  // The mass has already rebounded.
  state.wall_impact_speed_norm_s[0] = 12.0f;
  const auto frame = event.update(state, 0.004f);
  TEST_ASSERT_EQUAL_UINT32(1U, frame.count);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::WallId::Front),
                          static_cast<std::uint8_t>(frame.items[0].primary_wall));
  TEST_ASSERT_GREATER_THAN_FLOAT(0.0f, frame.items[0].direction.x);
  state.wall_impact_speed_norm_s.fill(0.0f);
  state.vel_norm_s = {};
  state.energy = 1.0f;
  for (unsigned step = 0; step < 300U; ++step) {
    TEST_ASSERT_EQUAL_UINT32(0U, event.update(state, 0.004f).count);
  }
}

void test_coherent_flow_requires_moving_contact_and_counts_distance() {
  auto params = haptics::makeDefaultGranularBeadPreset();
  params.features.enable_coherent_container_demo = true;
  haptics::EventLayer event;
  event.configure(params);
  haptics::MassState state{};
  state.family = haptics::MaterialFamily::Granular;
  state.container_x_m = params.container.span_x_m;
  state.container_y_m = params.container.span_y_m;
  state.vel_norm_s.x = 4.0f;
  state.energy = 1.0f;
  for (unsigned step = 0; step < 100U; ++step) {
    TEST_ASSERT_EQUAL_UINT32(0U, event.update(state, 0.004f).count);
  }
  state.wall_contact[3] = 1.0f;
  unsigned contacts = 0U;
  for (unsigned step = 0; step < 100U; ++step) {
    const auto events = event.update(state, 0.004f);
    contacts += static_cast<unsigned>(events.count);
    for (std::size_t index = 0; index < events.count; ++index) {
      TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::WallId::Bottom),
                              static_cast<std::uint8_t>(events.items[index].primary_wall));
      TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::EventType::RollTrain),
                              static_cast<std::uint8_t>(events.items[index].type));
    }
  }
  TEST_ASSERT_GREATER_THAN_UINT32(4U, contacts);
  state.vel_norm_s = {};
  TEST_ASSERT_EQUAL_UINT32(0U, event.update(state, 0.004f).count);
}

void test_coherent_liquid_contact_has_wet_body_without_hard_ping() {
  auto params = haptics::makeDefaultLiquidPreset();
  params.features.enable_coherent_container_demo = true;
  params.features.enable_attack_preserving_texture = true;
  haptics::EventLayer event;
  haptics::TextureLayer texture;
  event.configure(params);
  texture.configure(params);
  haptics::MassState state{};
  state.family = haptics::MaterialFamily::Liquid;
  state.wall_impact_speed_norm_s[1] = 10.0f;
  const auto events = event.update(state, 0.004f);
  TEST_ASSERT_EQUAL_UINT32(1U, events.count);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::EventType::DropletCluster),
                          static_cast<std::uint8_t>(events.items[0].type));
  const auto textures = texture.update(events, 0.004f);
  TEST_ASSERT_EQUAL_UINT32(2U, textures.count);
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::TextureAtomKind::WetBurst),
                          static_cast<std::uint8_t>(textures.items[0].atom));
  TEST_ASSERT_EQUAL_UINT8(static_cast<std::uint8_t>(haptics::TextureAtomKind::FlowRipple),
                          static_cast<std::uint8_t>(textures.items[1].atom));
}

void test_coherent_empty_content_has_no_motion_or_material_events() {
  for (bool zero_fill : {true, false}) {
    auto params = coherentMarble();
    if (zero_fill) {
      params.container.fill = 0.0f;
    } else {
      params.container.content_mass_full_kg = 0.0f;
    }
    haptics::MassMotionLayer mass;
    haptics::EventLayer event;
    mass.configure(params);
    event.configure(params);
    for (unsigned step = 0; step < 200U; ++step) {
      auto state = mass.update(coherentSample(step % 2U ? 0.5f : -0.5f, 0.866f), 0.004f);
      TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.pos_norm.x);
      TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.pos_norm.y);
      TEST_ASSERT_FLOAT_WITHIN(1.0e-6f, 0.0f, state.energy);
      state.wall_impact_speed_norm_s[0] = 20.0f;
      TEST_ASSERT_EQUAL_UINT32(0U, event.update(state, 0.004f).count);
    }
  }
}

void test_coherent_damping_and_fill_controls_change_real_motion() {
  auto low_damping = coherentMarble();
  auto high_damping = low_damping;
  low_damping.mass.damping_ratio_x = 0.10f;
  high_damping.mass.damping_ratio_x = 1.40f;
  haptics::MassMotionLayer low;
  haptics::MassMotionLayer high;
  low.configure(low_damping);
  high.configure(high_damping);
  low.update(coherentSample(0.0f, 1.0f), 0.002f);
  high.update(coherentSample(0.0f, 1.0f), 0.002f);
  for (unsigned step = 0; step < 40U; ++step) {
    low.update(coherentSample(0.18f, 0.984f), 0.002f);
    high.update(coherentSample(0.18f, 0.984f), 0.002f);
  }
  TEST_ASSERT_GREATER_THAN_FLOAT(std::fabs(high.state().vel_norm_s.x),
                                 std::fabs(low.state().vel_norm_s.x));
  TEST_ASSERT_GREATER_THAN_FLOAT(std::fabs(high.state().pos_norm.x) + 0.015f,
                                 std::fabs(low.state().pos_norm.x));

  auto low_fill = haptics::makeDefaultLiquidPreset();
  low_fill.features.enable_coherent_container_demo = true;
  low_fill.container.fill = 0.20f;
  low_fill.container.headspace = 0.80f;
  auto high_fill = low_fill;
  high_fill.container.fill = 0.85f;
  high_fill.container.headspace = 0.15f;
  low.configure(low_fill);
  high.configure(high_fill);
  const auto lo = low.update(coherentSample(0.15f, 0.0f), 0.002f);
  const auto hi = high.update(coherentSample(0.15f, 0.0f), 0.002f);
  TEST_ASSERT_GREATER_THAN_FLOAT(std::fabs(hi.pos_norm.x) + 0.15f,
                                 std::fabs(lo.pos_norm.x));
}

}  // namespace

void setUp() {}
void tearDown() {}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_coherent_gravity_initialization_and_rest_have_no_impacts);
  RUN_TEST(test_coherent_handling_reaches_correct_walls_and_settles);
  RUN_TEST(test_coherent_contact_timing_is_consistent_across_update_steps);
  RUN_TEST(test_coherent_prebounce_contact_survives_reversed_velocity);
  RUN_TEST(test_coherent_flow_requires_moving_contact_and_counts_distance);
  RUN_TEST(test_coherent_liquid_contact_has_wet_body_without_hard_ping);
  RUN_TEST(test_coherent_empty_content_has_no_motion_or_material_events);
  RUN_TEST(test_coherent_damping_and_fill_controls_change_real_motion);
  return UNITY_END();
}
