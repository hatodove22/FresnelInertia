#pragma once

#include <array>
#include <cstddef>

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class EventLayer {
 public:
  void configure(const SystemParams& params);
  EventFrame<kMaxEventsPerFrame> update(
      const MassState& state,
      float dt_s,
      std::size_t max_output_events = kMaxEventsPerFrame);
  const HapticEvent& lastEvent() const { return last_event_; }

 private:
  void pushEvent(EventFrame<kMaxEventsPerFrame>& frame, const HapticEvent& event);
  SystemParams params_{};
  HapticEvent last_event_{};
  std::array<float, 4> wall_cooldown_s_{};
  std::array<bool, 4> wall_armed_{};
  float roll_phase_ = 0.0f;
  float impact_phase_ = 0.0f;
  float rolling_activity_ = 0.0f;
  float impact_activity_ = 0.0f;
  float scrape_cooldown_s_ = 0.0f;
  float droplet_phase_ = 0.0f;
  float liquid_activity_ = 0.0f;
  float roof_cooldown_s_ = 0.0f;
  float hybrid_impact_phase_ = 0.0f;
  bool liquid_burst_ready_ = true;
  bool hybrid_burst_ready_ = true;
  float detent_phase_ = 0.0f;
  float detent_activity_ = 0.0f;
  float detent_scrape_cooldown_s_ = 0.0f;
  bool detent_tick_ready_ = true;
  WallId roll_wall_ = WallId::None;
  std::size_t output_limit_ = kMaxEventsPerFrame;
};

}  // namespace haptics
