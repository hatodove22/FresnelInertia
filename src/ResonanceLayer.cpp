#include "haptics/ResonanceLayer.hpp"

#include <algorithm>

namespace haptics {
namespace {

float clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

}  // namespace

void ResonanceLayer::configure(const SystemParams& params) {
  params_ = params;
}

void ResonanceLayer::pushVoice(ResonanceFrame<kMaxResonanceVoicesPerFrame>& frame, const ResonanceVoice& voice) {
  if (frame.count >= frame.items.size()) {
    return;
  }
  frame.items[frame.count++] = voice;
}

ResonanceFrame<kMaxResonanceVoicesPerFrame> ResonanceLayer::update(
    const TextureFrame<kMaxTexturesPerFrame>& textures) {
  ResonanceFrame<kMaxResonanceVoicesPerFrame> frame{};

  for (std::size_t i = 0; i < textures.count; ++i) {
    const auto& cmd = textures.items[i];
    const auto wall_index = static_cast<uint8_t>(cmd.primary_wall);
    if (wall_index >= 4) {
      continue;
    }

    float low_weight = params_.resonance.low_gain[wall_index];
    float high_weight = params_.resonance.high_gain[wall_index];
    float noise_weight = 1.0f;
    switch (cmd.atom) {
      case TextureAtomKind::WetBurst:
        high_weight *= 1.10f;
        noise_weight *= 1.15f;
        break;
      case TextureAtomKind::DryRattle:
        high_weight *= 1.05f;
        noise_weight *= 1.05f;
        break;
      case TextureAtomKind::ScrapeNoise:
        low_weight *= 0.80f;
        noise_weight *= 1.20f;
        break;
      case TextureAtomKind::FlowRipple:
        low_weight *= 1.05f;
        high_weight *= 0.95f;
        break;
      case TextureAtomKind::HardPing:
      case TextureAtomKind::None:
      default:
        break;
    }

    ResonanceVoice voice{};
    voice.atom = cmd.atom;
    voice.source = cmd.source;
    voice.primary_wall = cmd.primary_wall;
    voice.low_env = clamp01(cmd.low_env * low_weight);
    voice.high_env = clamp01(cmd.high_env * high_weight);
    voice.noise_env = clamp01(cmd.noise_env * noise_weight);
    voice.apparent_motion_soa_ms = cmd.apparent_motion_soa_ms;
    voice.distribute_to_neighbors = cmd.distribute_to_neighbors;
    pushVoice(frame, voice);
  }

  return frame;
}

}  // namespace haptics
