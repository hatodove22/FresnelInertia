#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include "haptics/PressurizedContentModel.hpp"
#include "haptics/EventLayer.hpp"
#include "haptics/TextureLayer.hpp"
#include "haptics/ResonanceLayer.hpp"
#include "haptics/SpatialRenderer4.hpp"
#include "haptics/TiltPseudoForceModel.hpp"
#include "haptics/HardwareProfiles.hpp"

using namespace haptics;
#define CHECK(x) do { if (!(x)) { std::fprintf(stderr, "%d: %s\n", __LINE__, #x); std::exit(1); } } while (false)

ImuSample gravity() { ImuSample s{}; s.valid = true; s.accel_g.y = 1.0f; return s; }

namespace {
constexpr float kDt = 0.004f;
constexpr float kTolerance = 0.00001f;

MassState centeredSoda(const SystemParams& params) {
  MassState mass{};
  mass.family = MaterialFamily::Liquid;
  mass.fill = params.container.fill;
  mass.pressure.enabled = true;
  return mass;
}

void sameCommand(const TiltPlaneCommand& a, const TiltPlaneCommand& b) {
  CHECK(std::fabs(a.thumb_angle_deg - b.thumb_angle_deg) < kTolerance);
  CHECK(std::fabs(a.index_angle_deg - b.index_angle_deg) < kTolerance);
  CHECK(std::fabs(a.thumb_delta_deg - b.thumb_delta_deg) < kTolerance);
  CHECK(std::fabs(a.index_delta_deg - b.index_delta_deg) < kTolerance);
  CHECK(std::fabs(a.common_force_n - b.common_force_n) < kTolerance);
  CHECK(std::fabs(a.differential_torque_nm - b.differential_torque_nm) < kTolerance);
  CHECK(std::fabs(a.apparent_mass_kg - b.apparent_mass_kg) < kTolerance);
  CHECK(std::fabs(a.thumb_current_limit_ma - b.thumb_current_limit_ma) < kTolerance);
  CHECK(std::fabs(a.index_current_limit_ma - b.index_current_limit_ma) < kTolerance);
}

void test_recoil_uses_shared_burst_phase_at_rest() {
  const auto params = makeDefaultSodaPreset();
  TiltPseudoForceModel tilt;
  tilt.configure(params);
  auto mass = centeredSoda(params);
  // Charge alone is not the opening event, even at the threshold.
  mass.pressure.charge = 1.0f;
  CHECK(std::fabs(tilt.update(gravity(), mass, kDt).common_force_n) < kTolerance);
  mass.pressure.phase = PressurePhase::Burst;
  mass.pressure.burst_sequence = 1;
  const auto opening = tilt.update(gravity(), mass, kDt);
  CHECK(opening.common_force_n < -0.01f);
  CHECK(opening.thumb_delta_deg < 0.0f && opening.index_delta_deg < 0.0f);
  CHECK(std::fabs(opening.thumb_delta_deg - opening.index_delta_deg) < kTolerance);
  CHECK(std::fabs(opening.differential_torque_nm) < kTolerance);

  mass.pressure.phase_s = 0.20f;
  mass.pressure.charge = std::exp(-mass.pressure.phase_s / 0.70f);
  const auto tail = tilt.update(gravity(), mass, kDt);
  CHECK(tail.common_force_n < 0.0f && tail.common_force_n > opening.common_force_n);
  mass.pressure.phase_s = 1.0f;
  mass.pressure.charge = std::exp(-mass.pressure.phase_s / 0.70f);
  const auto later = tilt.update(gravity(), mass, kDt);
  CHECK(later.common_force_n < 0.0f && later.common_force_n > tail.common_force_n);
  // Repeating a pressure sample must not invent another recoil clock.
  for (int i = 0; i < 100; ++i) {
    CHECK(std::fabs(tilt.update(gravity(), mass, kDt).common_force_n - later.common_force_n) < kTolerance);
  }
  mass.pressure.phase = PressurePhase::Spent;
  mass.pressure.phase_s = 0.0f;
  mass.pressure.charge = 0.0f;
  CHECK(std::fabs(tilt.update(gravity(), mass, kDt).common_force_n) < kTolerance);
  // Removing force does not bypass the existing full-command release filter.
  TiltPlaneCommand settled{};
  for (int i = 0; i < 300; ++i) settled = tilt.update(gravity(), mass, kDt);
  CHECK(std::fabs(settled.thumb_angle_deg - params.tilt.thumb_home_deg) < kTolerance);
  CHECK(std::fabs(settled.index_angle_deg - params.tilt.index_home_deg) < kTolerance);
}

void test_recoil_onset_matches_pop_and_owner_reset() {
  const auto params = makeDefaultSodaPreset();
  PressurizedContentModel pressure;
  EventLayer events;
  TiltPseudoForceModel tilt;
  pressure.configure(params); events.configure(params); tilt.configure(params);
  auto mass = centeredSoda(params);
  ImuSample activity{}; activity.valid = true;
  auto raw = gravity();
  unsigned pops = 0, burst_frames = 0;
  PressurePhase previous_phase = PressurePhase::Sealed;
  for (int frame = 0; frame < 2000; ++frame) {
    activity.accel_g.x = frame < 600 ? (frame % 50 < 25 ? 2.0f : -2.0f) : 0.0f;
    raw.accel_g.x = activity.accel_g.x;
    pressure.update(raw, activity, kDt, mass, true);
    const auto event_frame = events.update(mass, kDt);
    unsigned frame_pops = 0;
    for (std::size_t i = 0; i < event_frame.count; ++i) {
      frame_pops += event_frame.items[i].type == EventType::PressurePop;
    }
    pops += frame_pops;
    // Hold the tilt IMU still: reaction is shared pressure output, not a
    // side-effect of the shaking acceleration that originally charged it.
    const auto command = tilt.update(gravity(), mass, kDt);
    if (mass.pressure.phase == PressurePhase::Burst) {
      ++burst_frames;
      CHECK(command.common_force_n < 0.0f);
      if (previous_phase == PressurePhase::Sealed) {
        CHECK(frame_pops == 1 && mass.pressure.phase_s == 0.0f);
        CHECK(command.thumb_delta_deg < 0.0f && command.index_delta_deg < 0.0f);
        const auto held = mass.pressure;
        for (const float dt : {0.0f, -0.01f, std::numeric_limits<float>::quiet_NaN(),
                               std::numeric_limits<float>::infinity()}) {
          pressure.update(raw, activity, dt, mass, true);
          CHECK(mass.pressure.phase == held.phase && mass.pressure.phase_s == held.phase_s);
          CHECK(mass.pressure.burst_sequence == held.burst_sequence);
          CHECK(mass.pressure.charge == held.charge && mass.pressure.remaining == held.remaining);
        }
      } else {
        CHECK(frame_pops == 0);
      }
    } else {
      CHECK(frame_pops == 0 && std::fabs(command.common_force_n) < kTolerance);
    }
    previous_phase = mass.pressure.phase;
  }
  CHECK(pops == 1 && burst_frames > 500 && mass.pressure.phase == PressurePhase::Spent);
  pressure.configure(params); events.configure(params); tilt.reset();
  raw = gravity(); activity = {}; activity.valid = true;
  pressure.update(raw, activity, kDt, mass, true);
  CHECK(mass.pressure.phase == PressurePhase::Sealed && mass.pressure.burst_sequence == 0);
  CHECK(events.update(mass, kDt).count == 0);
  const auto reset = tilt.update(gravity(), mass, kDt);
  CHECK(reset.common_force_n == 0.0f && reset.thumb_delta_deg == 0.0f && reset.index_delta_deg == 0.0f);
}

void test_recoil_invalid_time_holds_active_command() {
  const auto params = makeDefaultSodaPreset();
  TiltPseudoForceModel tilt;
  tilt.configure(params);
  auto mass = centeredSoda(params);
  mass.pressure.phase = PressurePhase::Burst;
  mass.pressure.charge = 1.0f;
  mass.pressure.burst_sequence = 1;
  const auto before = tilt.update(gravity(), mass, kDt);
  CHECK(before.common_force_n < 0.0f);
  // Even a newly received later phase cannot bypass the established dt guard.
  mass.pressure.phase_s = 0.70f;
  mass.pressure.charge = std::exp(-1.0f);
  for (const float dt : {0.0f, -0.01f, std::numeric_limits<float>::quiet_NaN(),
                         std::numeric_limits<float>::infinity()}) {
    sameCommand(before, tilt.update(gravity(), mass, dt));
  }
  CHECK(tilt.update(gravity(), mass, kDt).common_force_n > before.common_force_n);
}

TiltPlaneCommand freshRecoil(const SystemParams& params, const MassState& mass) {
  TiltPseudoForceModel tilt;
  tilt.configure(params);
  return tilt.update(gravity(), mass, kDt);
}

void test_recoil_profile_fill_and_late_join() {
  auto params = makeDefaultSodaPreset();
  // Recoil is an additional common reaction, not synthesized IMU inertia.
  params.tilt.k_cm = 0.0f;
  auto mass = centeredSoda(params);
  mass.pressure.phase = PressurePhase::Burst;
  mass.pressure.charge = 1.0f;
  mass.pressure.burst_sequence = 1;
  CHECK(std::fabs(freshRecoil(params, mass).common_force_n + 0.042f) < kTolerance);
  mass.pressure.phase_s = 0.08f;
  CHECK(std::fabs(freshRecoil(params, mass).common_force_n + 0.042f) < kTolerance);
  mass.pressure.phase_s = 0.15f;
  CHECK(std::fabs(freshRecoil(params, mass).common_force_n + 0.0245f) < kTolerance);
  mass.pressure.phase_s = 0.22f;
  CHECK(std::fabs(freshRecoil(params, mass).common_force_n + 0.007f) < kTolerance);
  // A consumer first observing an old Burst sees its tail, not a new kick.
  mass.pressure.phase_s = 1.0f;
  mass.pressure.charge = std::exp(-1.0f / 0.70f);
  CHECK(std::fabs(freshRecoil(params, mass).common_force_n + 0.007f * mass.pressure.charge) < kTolerance);
  mass.pressure.phase_s = 0.0f;
  mass.pressure.charge = 1.0f;
  mass.fill = 0.31f;
  CHECK(std::fabs(freshRecoil(params, mass).common_force_n + 0.021f) < kTolerance);
  mass.fill = 1.0f;
  CHECK(std::fabs(freshRecoil(params, mass).common_force_n + 0.042f) < kTolerance);
}

void test_recoil_gates_preserve_baseline() {
  const auto original = makeDefaultSodaPreset();
  auto burst = centeredSoda(original);
  burst.pressure.phase = PressurePhase::Burst;
  burst.pressure.charge = 1.0f;
  burst.pressure.burst_sequence = 1;
  // Remaining stays 1 so these compare only the added reaction, not the
  // previously implemented remaining-content apparent mass behavior.
  for (int gate = 0; gate < 8; ++gate) {
    auto params = original;
    auto mass = burst;
    switch (gate) {
      case 0: params.features.enable_pressurized_demo = false; break;
      case 1: params.features.enable_coherent_container_demo = false; break;
      case 2: mass.pressure.enabled = false; break;
      case 3: mass.pressure.phase = PressurePhase::Sealed; break;
      case 4: mass.pressure.phase = PressurePhase::Spent; break;
      case 5: mass.fill = 0.0f; break;
      case 6: mass.family = MaterialFamily::Granular; break;
      case 7: mass.pressure.phase_s = std::numeric_limits<float>::quiet_NaN(); break;
    }
    auto baseline = mass;
    baseline.pressure.phase = PressurePhase::Sealed;
    sameCommand(freshRecoil(params, baseline), freshRecoil(params, mass));
    CHECK(std::fabs(freshRecoil(params, mass).common_force_n) < kTolerance);
  }
  auto invalid_charge = burst;
  invalid_charge.pressure.charge = std::numeric_limits<float>::infinity();
  CHECK(std::fabs(freshRecoil(original, invalid_charge).common_force_n) < kTolerance);
  auto disabled = original;
  disabled.tilt.enable_pseudoforce = false;
  const auto off = freshRecoil(disabled, burst);
  CHECK(off.thumb_delta_deg == 0.0f && off.index_delta_deg == 0.0f);
  CHECK(off.thumb_angle_deg == disabled.tilt.thumb_home_deg);
  CHECK(off.index_angle_deg == disabled.tilt.index_home_deg);
}

void test_recoil_retains_as_built_common_direction_slew_and_travel() {
  auto params = makeDefaultSodaPreset();
  applyAsBuiltAtomS3Profile(params);
  TiltPseudoForceModel tilt;
  tilt.configure(params);
  auto mass = centeredSoda(params);
  auto previous = tilt.update(gravity(), mass, kDt);
  mass.pressure.phase = PressurePhase::Burst;
  mass.pressure.burst_sequence = 1;
  float peak = 0.0f;
  const float max_step = std::fmin(params.tilt.max_velocity_deg_s,
                                  params.tilt.pseudoforce_slew_deg_s) * kDt;
  for (int frame = 0; frame < 400; ++frame) {
    mass.pressure.phase_s = frame * kDt;
    mass.pressure.charge = std::exp(-mass.pressure.phase_s / 0.70f);
    const auto cmd = tilt.update(gravity(), mass, kDt);
    CHECK(std::fabs(cmd.thumb_angle_deg - previous.thumb_angle_deg) <= max_step + kTolerance);
    CHECK(std::fabs(cmd.index_angle_deg - previous.index_angle_deg) <= max_step + kTolerance);
    CHECK(std::fabs(cmd.thumb_angle_deg - params.tilt.thumb_home_deg) <= params.tilt.max_total_cmd_deg + kTolerance);
    CHECK(std::fabs(cmd.index_angle_deg - params.tilt.index_home_deg) <= params.tilt.max_total_cmd_deg + kTolerance);
    CHECK(std::fabs(cmd.thumb_angle_deg - cmd.index_angle_deg) < kTolerance);
    CHECK(cmd.thumb_angle_deg >= params.tilt.thumb_home_deg);
    peak = std::fmax(peak, std::fabs(cmd.thumb_angle_deg - params.tilt.thumb_home_deg));
    previous = cmd;
  }
  // A model-level amplitude check only; physical salience is handled feedback.
  CHECK(peak > 4.0f && peak < 5.0f);
  std::printf("recoil as-built filtered peak: %.3f deg\n", peak);
}
}  // namespace

int main() {
  auto params = makeDefaultSodaPreset();
  PressurizedContentModel model;
  MassState mass{};
  mass.fill = params.container.fill;
  mass.family = MaterialFamily::Liquid;
  ImuSample raw = gravity(), activity{};
  activity.valid = true;
  model.configure(params);
  for (int i = 0; i < 2500; ++i) model.update(raw, raw, 0.004f, mass);
  CHECK(mass.pressure.enabled && mass.pressure.charge == 0.0f);
  CHECK(mass.pressure.phase == PressurePhase::Sealed);

  EventLayer events; TextureLayer textures; ResonanceLayer resonance; SpatialRenderer4 spatial;
  events.configure(params); textures.configure(params); resonance.configure(params); spatial.configure(params);
  unsigned pops = 0, vent_events = 0; float peak = 0.0f;
  for (int i = 0; i < 2000; ++i) {
    activity.accel_g.x = i < 600 ? (i % 50 < 25 ? 2.0f : -2.0f) : 0.0f;
    raw.accel_g.x = activity.accel_g.x;
    model.update(raw, activity, 0.004f, mass, true);
    const auto ef = events.update(mass, 0.004f);
    for (std::size_t j = 0; j < ef.count; ++j) {
      pops += ef.items[j].type == EventType::PressurePop;
      vent_events += ef.items[j].type == EventType::DropletCluster;
    }
    const auto out = spatial.update(resonance.update(textures.update(ef, 0.004f)), 0.004f);
    for (float value : out.summary.ch) {
      CHECK(std::isfinite(value) && value >= 0 && value <= 1.0001f);
      peak = std::fmax(peak, value);
    }
  }
  CHECK(pops == 1 && vent_events > 5 && peak > 0.05f);
  CHECK(mass.pressure.phase == PressurePhase::Spent && mass.pressure.charge == 0);
  CHECK(std::fabs(mass.pressure.remaining - 0.25f) < 0.001f);
  CHECK(events.update(mass, 0.004f).count == 0);

  const auto held = mass.pressure;
  model.update(raw, activity, std::numeric_limits<float>::quiet_NaN(), mass, true);
  CHECK(mass.pressure.burst_sequence == held.burst_sequence && mass.pressure.phase_s == held.phase_s);
  model.configure(params); model.update(raw, activity, 0.004f, mass, true);
  CHECK(mass.pressure.phase == PressurePhase::Sealed && mass.pressure.burst_sequence == 0);
  CHECK(mass.pressure.charge == 0 && mass.pressure.remaining == 1);

  params.features.enable_pressurized_demo = false;
  model.configure(params);
  for (int i = 0; i < 2000; ++i) model.update(raw, activity, 0.004f, mass, true);
  CHECK(!mass.pressure.enabled && mass.pressure.charge == 0);
  params = makeDefaultSodaPreset(); params.container.fill = 0;
  model.configure(params);
  for (int i = 0; i < 2000; ++i) model.update(raw, activity, 0.004f, mass, true);
  CHECK(mass.pressure.charge == 0 && mass.pressure.burst_sequence == 0);

  params = makeDefaultSodaPreset();
  TiltPseudoForceModel tilt; tilt.configure(params);
  mass.fill = params.container.fill; mass.pressure.enabled = true; mass.pressure.remaining = 1;
  const float full = tilt.update(gravity(), mass, 0.004f).apparent_mass_kg;
  mass.pressure.remaining = 0.25f;
  const float spent = tilt.update(gravity(), mass, 0.004f).apparent_mass_kg;
  CHECK(full > spent && std::fabs(spent - params.container.shell_mass_kg -
      params.container.content_mass_full_kg * mass.fill * 0.25f) < 0.00001f);
  test_recoil_uses_shared_burst_phase_at_rest();
  test_recoil_onset_matches_pop_and_owner_reset();
  test_recoil_invalid_time_holds_active_command();
  test_recoil_profile_fill_and_late_join();
  test_recoil_gates_preserve_baseline();
  test_recoil_retains_as_built_common_direction_slew_and_travel();
  std::puts("PASS pressure: original behavior (5), recoil phase/tail, synchronized pop/reset, invalid time, profile/fill/late join, gates/baseline, as-built command bounds (11 groups)");
}
