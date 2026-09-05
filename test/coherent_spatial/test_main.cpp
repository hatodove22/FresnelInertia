#include <unity.h>

#include <array>
#include <cmath>
#include <limits>

#include "haptics/ResonanceLayer.hpp"
#include "haptics/SpatialRenderer4.hpp"
#include "haptics/TextureLayer.hpp"

namespace {

constexpr float kDt = 0.004f;
constexpr float kTolerance = 0.00001f;
using Frame = haptics::ResonanceFrame<haptics::kMaxResonanceVoicesPerFrame>;

haptics::SystemParams demoParams() {
  auto params = haptics::makeDefaultLiquidPreset();
  params.features.enable_coherent_container_demo = true;
  params.features.enable_attack_preserving_texture = true;
  params.features.enable_single_shot_spatial_delay = false;
  params.spatial.wall_softmax_delta = 0.0f;
  params.spatial.neighbor_bleed = 0.4f;
  params.spatial.opposite_bleed = 0.2f;
  params.texture.flow_ripple_soa_ms = 8.0f;
  return params;
}

Frame flowAttack() {
  Frame frame{};
  frame.count = 1;
  auto& voice = frame.items[0];
  voice.atom = haptics::TextureAtomKind::FlowRipple;
  voice.primary_wall = haptics::WallId::Front;
  voice.direction = {0.0f, 1.0f};
  voice.low_env = 0.2f;
  voice.high_env = 0.1f;
  voice.noise_env = 0.05f;
  voice.apparent_motion_soa_ms = 8.0f;
  voice.duration_ms = 40.0f;
  voice.density_hz = 7.0f;
  voice.distribute_to_neighbors = true;
  voice.attack_frame = true;
  return frame;
}

void assertSilent(const haptics::SpatialFrame4& frame) {
  for (int channel = 0; channel < 4; ++channel) {
    TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, frame.drive.low[channel]);
    TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, frame.drive.high[channel]);
    TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, frame.drive.noise[channel]);
  }
}

void test_single_attack_produces_delayed_multiframe_tails_then_silence() {
  haptics::SpatialRenderer4 renderer;
  renderer.configure(demoParams());
  const auto initial = renderer.update(flowAttack(), kDt);
  TEST_ASSERT_TRUE(initial.drive.low[0] > 0.0f);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, initial.drive.low[1]);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, initial.drive.low[2]);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, initial.drive.low[3]);
  std::array<int, 4> first_frame{};
  std::array<int, 4> nonzero_count{};
  for (int tick = 1; tick <= 40; ++tick) {
    const auto frame = renderer.update({}, kDt);
    for (int channel = 1; channel < 4; ++channel) {
      if (frame.drive.low[channel] > 0.0f) {
        if (first_frame[channel] == 0) first_frame[channel] = tick;
        ++nonzero_count[channel];
      }
    }
    // Last onset is 2.4 * 8 ms = 19.2 ms; all tails last 40 ms.
    if (tick >= 16) assertSilent(frame);
  }
  TEST_ASSERT_EQUAL_INT(2, first_frame[2]);
  TEST_ASSERT_EQUAL_INT(4, first_frame[3]);
  TEST_ASSERT_EQUAL_INT(5, first_frame[1]);
  for (int channel = 1; channel < 4; ++channel) {
    TEST_ASSERT_TRUE(nonzero_count[channel] >= 9);
    TEST_ASSERT_TRUE(nonzero_count[channel] <= 11);
  }
}

void test_sustained_nonattack_frames_do_not_enqueue_new_tails() {
  haptics::SpatialRenderer4 isolated;
  haptics::SpatialRenderer4 sustained;
  isolated.configure(demoParams());
  sustained.configure(demoParams());
  isolated.update(flowAttack(), kDt);
  sustained.update(flowAttack(), kDt);
  auto nonattack = flowAttack();
  nonattack.items[0].attack_frame = false;
  for (int tick = 1; tick <= 40; ++tick) {
    const auto reference = isolated.update({}, kDt);
    const auto actual = sustained.update(nonattack, kDt);
    for (int channel = 1; channel < 4; ++channel) {
      TEST_ASSERT_FLOAT_WITHIN(kTolerance, reference.drive.low[channel], actual.drive.low[channel]);
      TEST_ASSERT_FLOAT_WITHIN(kTolerance, reference.drive.high[channel], actual.drive.high[channel]);
      TEST_ASSERT_FLOAT_WITHIN(kTolerance, reference.drive.noise[channel], actual.drive.noise[channel]);
    }
  }
}

void test_immediate_routing_weights_sum_to_one() {
  haptics::SpatialRenderer4 renderer;
  renderer.configure(demoParams());
  auto input = flowAttack();
  input.items[0].apparent_motion_soa_ms = 0.0f;
  const auto frame = renderer.update(input, kDt);
  float low = 0.0f, high = 0.0f, noise = 0.0f;
  for (int channel = 0; channel < 4; ++channel) {
    low += frame.drive.low[channel];
    high += frame.drive.high[channel];
    noise += frame.drive.noise[channel];
  }
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.2f, low);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.1f, high);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.05f, noise);
  TEST_ASSERT_TRUE(frame.drive.low[2] > frame.drive.low[3]);
  input.items[0].distribute_to_neighbors = false;
  const auto local = renderer.update(input, kDt);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.2f, local.drive.low[0]);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, local.drive.low[1]);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, local.drive.low[2]);
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.0f, local.drive.low[3]);
}

void test_full_texture_resonance_tail_matches_shifted_source_envelope() {
  const auto params = demoParams();
  haptics::TextureLayer texture;
  haptics::ResonanceLayer resonance;
  haptics::SpatialRenderer4 spatial;
  texture.configure(params);
  resonance.configure(params);
  spatial.configure(params);
  haptics::EventFrame<haptics::kMaxEventsPerFrame> event{};
  event.count = 1;
  event.items[0].type = haptics::EventType::RollTrain;
  event.items[0].primary_wall = haptics::WallId::Front;
  event.items[0].direction = {0.0f, 1.0f};
  event.items[0].amplitude = 0.6f;
  event.items[0].duration_ms = 64.0f;
  event.items[0].density_hz = 8.0f;
  std::array<float, 40> local_low{};
  for (int tick = 0; tick < 40; ++tick) {
    const auto textures = texture.update(event, kDt);
    event.count = 0;
    const auto resonances = resonance.update(textures);
    if (tick == 0) {
      TEST_ASSERT_EQUAL_UINT32(1, resonances.count);
      TEST_ASSERT_FLOAT_WITHIN(kTolerance, 64.0f, resonances.items[0].duration_ms);
      TEST_ASSERT_FLOAT_WITHIN(kTolerance, 8.0f, resonances.items[0].density_hz);
      TEST_ASSERT_TRUE(resonances.items[0].attack_frame);
    }
    const auto frame = spatial.update(resonances, kDt);
    local_low[tick] = frame.drive.low[0];
    if (tick >= 2 && tick < 17) {
      // Front local=1 and leading Top=0.4*0.85; onset is two 4-ms ticks.
      TEST_ASSERT_FLOAT_WITHIN(kTolerance, local_low[tick - 2] * 0.34f, frame.drive.low[2]);
    }
    if (tick >= 23) assertSilent(frame);
  }
}

void test_configure_clears_pending_tails_and_long_gap_does_not_replay_them() {
  haptics::SpatialRenderer4 renderer;
  const auto params = demoParams();
  renderer.configure(params);
  renderer.update(flowAttack(), kDt);
  renderer.configure(params);
  for (int tick = 0; tick < 40; ++tick) assertSilent(renderer.update({}, kDt));
  renderer.update(flowAttack(), kDt);
  assertSilent(renderer.update({}, 0.5f));
  for (int tick = 0; tick < 40; ++tick) assertSilent(renderer.update({}, kDt));
}

void test_legacy_flag_off_keeps_original_weights_and_one_tick_tail() {
  auto params = demoParams();
  params.features.enable_coherent_container_demo = false;
  params.features.enable_single_shot_spatial_delay = true;
  haptics::SpatialRenderer4 renderer;
  renderer.configure(params);
  auto input = flowAttack();
  input.items[0].apparent_motion_soa_ms = 0.0f;
  const auto immediate = renderer.update(input, kDt);
  float sum = 0.0f;
  for (float value : immediate.drive.low) sum += value;
  // Retained legacy denominator counts two neighbor budgets: 1+.8+.2=2.
  TEST_ASSERT_FLOAT_WITHIN(kTolerance, 0.16f, sum);
  renderer.configure(params);
  renderer.update(flowAttack(), kDt);
  std::array<int, 4> counts{};
  for (int tick = 1; tick <= 40; ++tick) {
    const auto frame = renderer.update({}, kDt);
    for (int channel = 1; channel < 4; ++channel) {
      if (frame.drive.low[channel] > 0.0f) ++counts[channel];
    }
  }
  for (int channel = 1; channel < 4; ++channel) TEST_ASSERT_EQUAL_INT(1, counts[channel]);
}

void test_nonfinite_elapsed_time_cannot_poison_pending_tails() {
  const std::array<float, 4> invalid_dt = {
      std::numeric_limits<float>::quiet_NaN(),
      std::numeric_limits<float>::infinity(),
      -std::numeric_limits<float>::infinity(), -0.02f};
  for (float dt_s : invalid_dt) {
    haptics::SpatialRenderer4 renderer;
    haptics::SpatialRenderer4 reference;
    renderer.configure(demoParams());
    reference.configure(demoParams());
    renderer.update(flowAttack(), kDt);
    reference.update(flowAttack(), kDt);
    // Invalid calls neither emit the incoming attack nor alter the existing tail.
    assertSilent(renderer.update(flowAttack(), dt_s));
    for (int tick = 0; tick < 40; ++tick) {
      const auto actual = renderer.update({}, kDt);
      const auto expected = reference.update({}, kDt);
      for (int channel = 0; channel < 4; ++channel) {
        TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.drive.low[channel], actual.drive.low[channel]);
        TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.drive.high[channel], actual.drive.high[channel]);
        TEST_ASSERT_FLOAT_WITHIN(kTolerance, expected.drive.noise[channel], actual.drive.noise[channel]);
      }
    }
    assertSilent(renderer.update({}, 0.5f));
  }
}

}  // namespace

void setUp() {}
void tearDown() {}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_single_attack_produces_delayed_multiframe_tails_then_silence);
  RUN_TEST(test_sustained_nonattack_frames_do_not_enqueue_new_tails);
  RUN_TEST(test_immediate_routing_weights_sum_to_one);
  RUN_TEST(test_full_texture_resonance_tail_matches_shifted_source_envelope);
  RUN_TEST(test_configure_clears_pending_tails_and_long_gap_does_not_replay_them);
  RUN_TEST(test_legacy_flag_off_keeps_original_weights_and_one_tick_tail);
  RUN_TEST(test_nonfinite_elapsed_time_cannot_poison_pending_tails);
  return UNITY_END();
}
