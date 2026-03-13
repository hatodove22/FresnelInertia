#include "haptics/TextureLayer.hpp"

#include <algorithm>
#include <cmath>

namespace haptics {
namespace {

constexpr float kPi = 3.14159265358979323846f;

float clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

float expDecay(float normalized_t, float rate) {
  return std::exp(-rate * clamp01(normalized_t));
}

float pulse(float phase) {
  return 0.5f + 0.5f * std::sin(phase);
}

}  // namespace

void TextureLayer::configure(const SystemParams& params) {
  params_ = params;
  voices_.fill({});
}

void TextureLayer::pushTexture(TextureFrame<kMaxTexturesPerFrame>& frame, const TextureCommand& cmd) {
  if (frame.count >= frame.items.size()) {
    return;
  }
  frame.items[frame.count++] = cmd;
}

void TextureLayer::spawnVoice(const HapticEvent& event) {
  Voice* slot = nullptr;
  for (auto& voice : voices_) {
    if (!voice.active) {
      slot = &voice;
      break;
    }
  }
  if (slot == nullptr) {
    slot = &voices_.front();
  }

  *slot = {};
  slot->active = true;
  slot->source = event.type;
  slot->primary_wall = event.primary_wall;
  slot->amplitude = clamp01(event.amplitude);
  slot->density_hz = event.density_hz;
  slot->age_s = 0.0f;

  switch (event.type) {
    case EventType::WallHit:
      slot->atom = TextureAtomKind::HardPing;
      slot->duration_s = std::max(event.duration_ms, params_.texture.hard_ping_low_ms) * 1.0e-3f;
      break;
    case EventType::RollTrain:
      slot->atom = TextureAtomKind::FlowRipple;
      slot->duration_s = std::max(event.duration_ms, params_.texture.flow_ripple_soa_ms * 3.0f) * 1.0e-3f;
      slot->density_hz = std::max(4.0f, event.density_hz);
      slot->apparent_motion_s = params_.texture.flow_ripple_soa_ms * 1.0e-3f;
      slot->distribute_to_neighbors = true;
      break;
    case EventType::ImpactCluster:
      slot->atom = TextureAtomKind::DryRattle;
      slot->duration_s = std::max(event.duration_ms, params_.texture.dry_rattle_ms) * 1.0e-3f;
      slot->density_hz = std::max(8.0f, event.density_hz);
      slot->distribute_to_neighbors = true;
      break;
    case EventType::DropletCluster:
      slot->atom = TextureAtomKind::WetBurst;
      slot->duration_s = std::max(event.duration_ms, params_.texture.wet_burst_ms) * 1.0e-3f;
      slot->density_hz = std::max(10.0f, event.density_hz);
      slot->distribute_to_neighbors = true;
      slot->apparent_motion_s = 0.5f * params_.texture.flow_ripple_soa_ms * 1.0e-3f;
      break;
    case EventType::RoofSlap:
      slot->atom = TextureAtomKind::HardPing;
      slot->duration_s = std::max(event.duration_ms, params_.texture.hard_ping_low_ms * 0.8f) * 1.0e-3f;
      break;
    case EventType::Scrape:
      slot->atom = TextureAtomKind::ScrapeNoise;
      slot->duration_s = std::max(event.duration_ms, params_.texture.scrape_noise_ms) * 1.0e-3f;
      slot->density_hz = std::max(2.0f, event.density_hz);
      slot->distribute_to_neighbors = true;
      slot->apparent_motion_s = params_.texture.flow_ripple_soa_ms * 1.0e-3f;
      break;
    case EventType::None:
    default:
      slot->active = false;
      break;
  }
}

TextureCommand TextureLayer::renderVoice(const Voice& voice) const {
  TextureCommand cmd{};
  cmd.atom = voice.atom;
  cmd.source = voice.source;
  cmd.primary_wall = voice.primary_wall;
  cmd.amplitude = voice.amplitude;
  cmd.duration_ms = voice.duration_s * 1.0e3f;
  cmd.density_hz = voice.density_hz;
  cmd.apparent_motion_soa_ms = voice.apparent_motion_s * 1.0e3f;
  cmd.distribute_to_neighbors = voice.distribute_to_neighbors;

  const float t = voice.duration_s > 0.0f ? clamp01(voice.age_s / voice.duration_s) : 1.0f;
  const float phase = 2.0f * kPi * std::max(0.0f, voice.density_hz) * voice.age_s;

  switch (voice.atom) {
    case TextureAtomKind::HardPing: {
      const float low = expDecay(t, 5.0f);
      const float high = expDecay(t, 9.0f);
      cmd.low_env = clamp01(voice.amplitude * 0.40f * low);
      cmd.high_env = clamp01(voice.amplitude * (0.55f + 0.30f * params_.texture.default_high_bias) * high);
      cmd.noise_env = clamp01(voice.amplitude * 0.08f * high);
      break;
    }
    case TextureAtomKind::WetBurst: {
      const float burst = expDecay(t, 6.0f);
      const float shimmer = 0.45f + 0.55f * pulse(phase);
      cmd.low_env = clamp01(voice.amplitude * 0.08f * burst);
      cmd.high_env = clamp01(voice.amplitude * (0.65f + 0.20f * params_.texture.default_high_bias) * burst);
      cmd.noise_env = clamp01(voice.amplitude * 0.38f * burst * shimmer);
      break;
    }
    case TextureAtomKind::DryRattle: {
      const float rattle = std::pow(pulse(phase), 2.0f);
      const float decay = expDecay(t, 2.5f);
      cmd.low_env = clamp01(voice.amplitude * 0.16f * rattle * decay);
      cmd.high_env = clamp01(voice.amplitude * 0.58f * rattle * decay);
      cmd.noise_env = clamp01(voice.amplitude * 0.22f * rattle * decay);
      break;
    }
    case TextureAtomKind::ScrapeNoise: {
      const float grain = 0.40f + 0.60f * pulse(phase);
      const float decay = expDecay(t, 1.8f);
      cmd.low_env = clamp01(voice.amplitude * 0.06f * decay);
      cmd.high_env = clamp01(voice.amplitude * 0.22f * grain * decay);
      cmd.noise_env = clamp01(voice.amplitude * 0.72f * grain * decay);
      break;
    }
    case TextureAtomKind::FlowRipple: {
      const float ripple = 0.30f + 0.70f * pulse(phase);
      const float decay = expDecay(t, 2.0f);
      cmd.low_env = clamp01(voice.amplitude * 0.24f * ripple * decay);
      cmd.high_env = clamp01(voice.amplitude * 0.45f * ripple * decay);
      cmd.noise_env = clamp01(voice.amplitude * 0.05f * ripple * decay);
      break;
    }
    case TextureAtomKind::None:
    default:
      break;
  }

  return cmd;
}

TextureFrame<kMaxTexturesPerFrame> TextureLayer::update(const EventFrame<kMaxEventsPerFrame>& events, float dt_s) {
  for (std::size_t i = 0; i < events.count; ++i) {
    spawnVoice(events.items[i]);
  }

  TextureFrame<kMaxTexturesPerFrame> frame{};
  for (auto& voice : voices_) {
    if (!voice.active) {
      continue;
    }

    voice.age_s += dt_s;
    if (voice.age_s > voice.duration_s) {
      voice.active = false;
      continue;
    }

    const TextureCommand cmd = renderVoice(voice);
    if (cmd.low_env <= 0.0f && cmd.high_env <= 0.0f && cmd.noise_env <= 0.0f) {
      continue;
    }
    pushTexture(frame, cmd);
  }

  return frame;
}

}  // namespace haptics
