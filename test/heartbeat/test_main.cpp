#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>

#include "haptics/HardwareProfiles.hpp"
#include "haptics/EspNowTelemetryProtocol.hpp"
#include "haptics/HeartbeatModel.hpp"
#include "haptics/HapticSynthesisCore.hpp"

using namespace haptics;
namespace {
unsigned assertions = 0;
#define CHECK(condition) do { ++assertions; if (!(condition)) { \
  std::fprintf(stderr, "%d: %s\n", __LINE__, #condition); std::exit(1); } } while (false)
constexpr float dt = 0.004f;
ImuSample upright() { ImuSample sample{}; sample.valid = true; sample.accel_g.y = 1.0f; return sample; }

SystemParams preset() {
  auto params = makeDefaultHeartbeatPreset();
  applyAsBuiltAtomS3Profile(params);
  params.features.enable_tilt_plane = true;
  params.tilt.k_cm = params.tilt.k_tau = 0.0f;  // isolate the authored contraction
  return params;
}

void quiet(const SynthesisFrame& frame) {
  CHECK(frame.events.count == 0);
  for (unsigned ch = 0; ch < 4; ++ch) {
    CHECK(frame.spatial.drive.low[ch] == 0.0f);
    CHECK(frame.spatial.drive.high[ch] == 0.0f);
    CHECK(frame.spatial.drive.noise[ch] == 0.0f);
  }
}

void model_contract_and_bounds() {
  CHECK(!makeDefaultLiquidPreset().features.enable_heartbeat_demo);
  CHECK(!makeDefaultSodaPreset().features.enable_heartbeat_demo);
  CHECK(!makeDefaultGranularPilePreset().features.enable_heartbeat_demo);
  auto params = preset();
  HeartbeatModel model;
  model.configure(params);
  CHECK(model.state().enabled);
  CHECK(model.state().phase == 0.0f && model.state().beat_sequence == 0);
  float primary = 0, secondary = 0, contraction = 0;
  unsigned previous_sequence = 0, onsets = 0;
  for (unsigned i = 0; i < 2500; ++i) {
    const auto state = model.update(dt);
    CHECK(state.phase >= 0.0f && state.phase < 1.0f);
    CHECK(state.primary >= 0.0f && state.primary <= 1.0f);
    CHECK(state.secondary >= 0.0f && state.secondary <= 0.580001f);
    CHECK(state.contraction >= 0.0f && state.contraction <= 1.0f);
    if (state.beat_sequence != previous_sequence) {
      CHECK(state.beat_sequence == previous_sequence + 1);
      CHECK(std::fabs(state.phase - kHeartbeatPrimaryPhase) <= dt * state.bpm / 60.0f + 0.00001f);
      ++onsets;
    }
    if (state.phase >= 0.50f) CHECK(state.primary == 0 && state.secondary == 0 && state.contraction == 0);
    primary = std::max(primary, state.primary);
    secondary = std::max(secondary, state.secondary);
    contraction = std::max(contraction, state.contraction);
    previous_sequence = state.beat_sequence;
  }
  CHECK(onsets == 12);  // ten source seconds at72 authored bpm
  CHECK(primary > 0.99f && secondary > 0.57f && contraction > 0.99f);
  const auto before = model.state();
  model.update(0); model.update(-1); model.update(std::numeric_limits<float>::quiet_NaN());
  CHECK(model.state().phase == before.phase && model.state().beat_sequence == before.beat_sequence);
  model.update(30.0f);
  CHECK(model.state().phase == 0 && model.state().primary == 0 && model.state().contraction == 0);
  CHECK(model.state().beat_sequence == before.beat_sequence);
  for (const float bpm : {-100.0f, 40.0f, 140.0f, 999.0f, std::numeric_limits<float>::quiet_NaN()}) {
    params.heartbeat.bpm = bpm;
    model.configure(params);
    CHECK(model.state().bpm >= 40 && model.state().bpm <= 140);
  }
}

void integrated_doublet_spatial_and_contraction() {
  const auto params = preset();
  HapticSynthesisCore core;
  core.reset(params);
  SynthesisContext context{}; context.tilt_allowed = true;
  unsigned primary_events = 0, secondary_events = 0;
  float low_peak[4]{}, tilt_peak = 0;
  float prior_thumb = 0;
  for (unsigned i = 0; i < 1500; ++i) {
    const auto frame = core.step(params, upright(), dt, context);
    CHECK(frame.accepted && frame.mass.heartbeat.enabled);
    CHECK(frame.mass.pos_norm.x == 0 && frame.mass.pos_norm.y == 0);
    CHECK(frame.mass.vel_norm_s.x == 0 && frame.mass.vel_norm_s.y == 0);
    for (float contact : frame.mass.wall_contact) CHECK(contact == 0);
    for (float contact : frame.mass.wall_impact_speed_norm_s) CHECK(contact == 0);
    CHECK(frame.events.count <= 1);
    for (std::size_t j = 0; j < frame.events.count; ++j) {
      const auto& event = frame.events.items[j];
      CHECK(event.type == EventType::HeartbeatPulse && event.primary_wall == WallId::None);
      CHECK(frame.last_event.type == EventType::HeartbeatPulse);
      if (event.amplitude > 0.8f) {
        ++primary_events;
        CHECK(std::fabs(frame.mass.heartbeat.phase - kHeartbeatPrimaryPhase) < 0.005f);
      } else {
        ++secondary_events;
        CHECK(std::fabs(frame.mass.heartbeat.phase - kHeartbeatSecondaryPhase) < 0.005f);
      }
    }
    for (unsigned ch = 0; ch < 4; ++ch) {
      CHECK(frame.spatial.drive.low[ch] >= 0 && frame.spatial.drive.low[ch] <= 1);
      CHECK(frame.spatial.drive.low[ch] == frame.spatial.drive.low[0]);
      low_peak[ch] = std::max(low_peak[ch], frame.spatial.drive.low[ch]);
    }
    CHECK(std::fabs(frame.tilt.thumb_angle_deg + frame.tilt.index_angle_deg) < 0.00001f);
    CHECK(std::fabs(frame.tilt.thumb_angle_deg) <= params.tilt.max_total_cmd_deg);
    CHECK(std::fabs(frame.tilt.thumb_angle_deg - prior_thumb) <= params.tilt.max_velocity_deg_s * dt + 0.00001f);
    CHECK(frame.tilt.thumb_angle_deg <= 0.0f && frame.tilt.index_angle_deg >= 0.0f);
    CHECK(frame.tilt.common_force_n == 0.0f && frame.tilt.differential_torque_nm == 0.0f);
    prior_thumb = frame.tilt.thumb_angle_deg;
    tilt_peak = std::max(tilt_peak, std::fabs(frame.tilt.thumb_angle_deg));
  }
  CHECK(primary_events == 8 && secondary_events == 7);  // partial eighth cycle
  for (float peak : low_peak) CHECK(peak > 0.4f);
  CHECK(tilt_peak > 3.0f && tilt_peak <= 4.001f);
}

void stops_gaps_and_disabled_branches() {
  const auto params = preset();
  HapticSynthesisCore core; core.reset(params);
  SynthesisContext context{}; context.tilt_allowed = true;
  for (unsigned i = 0; i < 45; ++i) core.step(params, upright(), dt, context);
  auto stopped = context; stopped.outputs_allowed = false;
  const auto off = core.step(params, upright(), dt, stopped);
  quiet(off);
  CHECK(off.tilt_action == SynthesisTiltAction::Disabled);
  core.reset(params);  // the physical Stop owner resets the core
  quiet(core.step(params, upright(), dt, context));
  for (unsigned i = 0; i < 30; ++i) core.step(params, upright(), dt, context);
  const auto gap = core.step(params, upright(), 0.2f, context);
  CHECK(gap.accepted && gap.mass.heartbeat.phase == 0 && gap.mass.heartbeat.beat_sequence == 0);
  CHECK(gap.tilt_action == SynthesisTiltAction::Hold);
  quiet(gap);
  quiet(core.step(params, upright(), dt, context));
  auto vibration_only = params;
  vibration_only.features.enable_tilt_plane = false;
  core.reset(vibration_only);
  for (unsigned i = 0; i < 100; ++i) {
    CHECK(core.step(vibration_only, upright(), dt, context).tilt_action == SynthesisTiltAction::Disabled);
  }
  auto no_pseudoforce = params;
  no_pseudoforce.tilt.enable_pseudoforce = false;
  core.reset(no_pseudoforce);
  for (unsigned i = 0; i < 200; ++i) {
    const auto frame = core.step(no_pseudoforce, upright(), dt, context);
    CHECK(frame.tilt.thumb_angle_deg == 0 && frame.tilt.index_angle_deg == 0);
  }
}

void routing_gates_and_per_channel_calibration() {
  auto params = preset();
  ResonanceVoice voice{};
  voice.atom = TextureAtomKind::SoftPulse; voice.source = EventType::HeartbeatPulse;
  voice.primary_wall = WallId::None; voice.low_env = 0.6f; voice.high_env = 0.1f;
  ResonanceFrame<kMaxResonanceVoicesPerFrame> voices{};
  voices.items[voices.count++] = voice;
  params.resonance.low_gain = {0.5f, 1.0f, 1.5f, 2.0f};
  SpatialRenderer4 spatial; spatial.configure(params);
  const auto output = spatial.update(voices, dt);
  for (unsigned ch = 0; ch < 4; ++ch) {
    CHECK(std::fabs(output.drive.low[ch] - 0.3f * params.resonance.low_gain[ch]) < 0.00001f);
  }
  params.features.enable_heartbeat_demo = false;
  spatial.configure(params);
  for (float low : spatial.update(voices, dt).drive.low) CHECK(low == 0);
  TextureLayer texture; texture.configure(params);
  EventFrame<kMaxEventsPerFrame> events{};
  events.items[0].type = EventType::HeartbeatPulse;
  events.items[0].amplitude = 1; events.items[0].duration_ms = 125; events.count = 1;
  CHECK(texture.update(events, dt).count == 0);
}

void no_event_backlog() {
  auto params = preset();
  HeartbeatModel model; model.configure(params);
  EventLayer events; events.configure(params);
  MassState state{};
  for (unsigned i = 0; i < 20; ++i) {
    state.heartbeat = model.update(dt);
    CHECK(events.update(state, dt, 0).count == 0);
  }
  CHECK(state.heartbeat.beat_sequence == 1);
  CHECK(events.update(state, dt).count == 0);
  // A resumed state in the second pulse is consumed, never queued for later.
  state.heartbeat.phase = 0.3f;
  CHECK(events.update(state, 0.2f).count == 0);
  CHECK(events.update(state, dt).count == 0);
}

TelemetrySnapshot wireSnapshot(const SystemParams& params, const SynthesisFrame& frame, RunMode mode) {
  TelemetrySnapshot value{};
  std::strncpy(value.active_preset, params.preset_name, sizeof(value.active_preset) - 1);
  value.run_mode = mode; value.mass = frame.mass; value.last_event = frame.last_event;
  value.actuators = frame.spatial.summary; value.new_evt = frame.events.count;
  return value;
}

void core_wire_stop_and_ordinary_roundtrip() {
  auto params = preset();
  ImuSample input = upright();
  SynthesisContext live{}; live.tilt_allowed = true;
  HapticSynthesisCore core; core.reset(params);
  unsigned beat_events = 0;
  for (unsigned i = 0; i < 800; ++i) {
    const auto frame = core.step(params, input, dt, live);
    const auto source = wireSnapshot(params, frame, RunMode::Live);
    const auto packet = encodeEspNowTelemetryPacketV5(source, i + 1, makeEspNowResolvedState(params));
    CHECK(validateEspNowTelemetryPacketV5(&packet, sizeof(packet)));
    CHECK(packet.run_mode == static_cast<unsigned>(RunMode::Live));
    CHECK(packet.resolved.family == static_cast<unsigned>(MaterialFamily::Custom));
    CHECK(packet.resolved.model_flags & kEspNowResolvedCoherentContainer);
    CHECK(!validateEspNowTelemetryPacketV4(&packet, sizeof(packet)));
    const auto decoded = decodeEspNowHeartbeatState(packet.heartbeat);
    CHECK(decoded.enabled && decoded.phase == source.mass.heartbeat.phase);
    CHECK(decoded.beat_sequence == source.mass.heartbeat.beat_sequence);
    CHECK(std::fabs(decoded.contraction - source.mass.heartbeat.contraction) <= 0.5f / 65535.0f + 0.0000001f);
    beat_events += frame.events.count;
  }
  CHECK(beat_events == 8);
  // Missing IMU frames do not create another pulse, and still carry a valid v5.
  const auto before_missing = core.step(params, input, dt, live);
  input.valid = false;
  for (unsigned i = 0; i < 4; ++i) {
    const auto held = core.step(params, input, dt, live);
    CHECK(held.events.count == 0 && held.tilt_action == SynthesisTiltAction::Hold);
    CHECK(held.mass.heartbeat.phase == before_missing.mass.heartbeat.phase);
    const auto packet = encodeEspNowTelemetryPacketV5(wireSnapshot(params, held, RunMode::Live), 900 + i, makeEspNowResolvedState(params));
    CHECK(validateEspNowTelemetryPacketV5(&packet, sizeof(packet)));
  }
  auto idle = live; idle.outputs_allowed = false;
  const auto stopped = core.step(params, input, dt, idle);
  const auto stop_packet = encodeEspNowTelemetryPacketV5(wireSnapshot(params, stopped, RunMode::Idle), 999, makeEspNowResolvedState(params));
  CHECK(validateEspNowTelemetryPacketV5(&stop_packet, sizeof(stop_packet)));
  CHECK(stop_packet.run_mode == static_cast<unsigned>(RunMode::Idle));
  CHECK(stop_packet.heartbeat.enabled && stop_packet.heartbeat.phase == 0 && stop_packet.heartbeat.contraction == 0);
  CHECK(stop_packet.last_event_type == 0 && stop_packet.new_evt == 0);
  for (float channel : stop_packet.actuators) CHECK(channel == 0);
  input.valid = true;
  for (const auto& ordinary : {makeDefaultLiquidPreset(), makeDefaultSodaPreset(), makeDefaultGranularPilePreset()}) {
    params = ordinary; applyAsBuiltAtomS3Profile(params); core.reset(params);
    const auto frame = core.step(params, input, dt, live);
    const auto source = wireSnapshot(params, frame, RunMode::Live);
    CHECK(!source.mass.heartbeat.enabled && source.last_event.type == EventType::None);
    const auto v3 = encodeEspNowTelemetryPacketV3(source, 1000, makeEspNowResolvedState(params));
    CHECK(validateEspNowTelemetryPacketV3(&v3, sizeof(v3)));
    const auto v4 = encodeEspNowTelemetryPacketV4(source, 1000, makeEspNowResolvedState(params));
    CHECK(validateEspNowTelemetryPacketV4(&v4, sizeof(v4)));
    CHECK(!decodeEspNowDemoState(v4.demo).heartbeat.enabled);
  }
}
}  // namespace

int main() {
  model_contract_and_bounds();
  integrated_doublet_spatial_and_contraction();
  stops_gaps_and_disabled_branches();
  routing_gates_and_per_channel_calibration();
  no_event_backlog();
  core_wire_stop_and_ordinary_roundtrip();
  std::printf("Heartbeat production C++: %u assertions PASS (software only).\n", assertions);
}
