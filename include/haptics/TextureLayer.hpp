#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class TextureLayer {
 public:
  void configure(const SystemParams& params);
  TextureFrame<kMaxTexturesPerFrame> update(const EventFrame<kMaxEventsPerFrame>& events, float dt_s);

 private:
  struct Voice {
    bool active = false;
    TextureAtomKind atom = TextureAtomKind::None;
    EventType source = EventType::None;
    WallId primary_wall = WallId::None;
    Vec2f direction{};
    float amplitude = 0.0f;
    float duration_s = 0.0f;
    float density_hz = 0.0f;
    float age_s = 0.0f;
    float apparent_motion_s = 0.0f;
    bool distribute_to_neighbors = false;
  };

  Voice* acquireVoice();
  void activateVoice(Voice& voice,
                     const HapticEvent& event,
                     TextureAtomKind atom,
                     float duration_s,
                     float density_hz,
                     float apparent_motion_s,
                     bool distribute_to_neighbors,
                     float amplitude_scale = 1.0f);
  void pushTexture(TextureFrame<kMaxTexturesPerFrame>& frame, const TextureCommand& cmd);
  void spawnVoice(const HapticEvent& event);
  TextureCommand renderVoice(const Voice& voice) const;
  SystemParams params_{};
  std::array<Voice, kMaxTexturesPerFrame> voices_{};
};

}  // namespace haptics
