#pragma once

#include <algorithm>
#include <cmath>

#include "haptics/Parameters.hpp"

namespace haptics {

// Shared phase landmarks used by model state and discrete pulse-onset events.
// The browser presents this state; it never supplies or advances a beat clock.
constexpr float kHeartbeatPrimaryPhase = 0.06f;
constexpr float kHeartbeatPrimaryWidth = 0.15f;
constexpr float kHeartbeatSecondaryPhase = 0.28f;
constexpr float kHeartbeatSecondaryWidth = 0.12f;

inline float heartbeatPulseEnvelope(float phase, float start, float width) {
  const float t = (phase - start) / width;
  if (t <= 0.0f || t >= 1.0f) return 0.0f;
  const float sine = std::sin(3.14159265358979323846f * t);
  return sine * sine;
}

class HeartbeatModel {
 public:
  void configure(const SystemParams& params) {
    state_ = {};
    state_.enabled = params.features.enable_heartbeat_demo;
    state_.bpm = std::isfinite(params.heartbeat.bpm)
        ? std::max(40.0f, std::min(140.0f, params.heartbeat.bpm)) : 72.0f;
    secondary_gain_ = std::isfinite(params.heartbeat.secondary_gain)
        ? std::max(0.0f, std::min(1.0f, params.heartbeat.secondary_gain)) : 0.58f;
  }

  const HeartbeatState& state() const { return state_; }

  const HeartbeatState& update(float dt_s) {
    if (!state_.enabled || !std::isfinite(dt_s) || dt_s <= 0.0f) return state_;
    // A discontinuity is not an instruction to replay missed beats. The core
    // resets all layers for the same >50ms input gap; standalone use is quiet too.
    if (dt_s > 0.050f) {
      state_.phase = state_.primary = state_.secondary = state_.contraction = 0.0f;
      return state_;
    }
    const float previous = state_.phase;
    const float next = previous + dt_s * state_.bpm / 60.0f;
    state_.phase = next >= 1.0f ? next - 1.0f : next;
    if ((previous < kHeartbeatPrimaryPhase && next >= kHeartbeatPrimaryPhase) ||
        (next >= 1.0f && state_.phase >= kHeartbeatPrimaryPhase)) {
      ++state_.beat_sequence;  // well-defined unsigned wrap, never a backlog
    }
    state_.primary = heartbeatPulseEnvelope(state_.phase, kHeartbeatPrimaryPhase, kHeartbeatPrimaryWidth);
    state_.secondary = secondary_gain_ *
        heartbeatPulseEnvelope(state_.phase, kHeartbeatSecondaryPhase, kHeartbeatSecondaryWidth);
    state_.contraction = heartbeatPulseEnvelope(state_.phase, kHeartbeatPrimaryPhase, 0.43f);
    return state_;
  }

 private:
  HeartbeatState state_{};
  float secondary_gain_ = 0.58f;
};

}  // namespace haptics
