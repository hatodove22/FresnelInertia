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

float windowedDecay(float age_s, float duration_s, float rate) {
  if (duration_s <= 0.0f || age_s >= duration_s) {
    return 0.0f;
  }
  return expDecay(age_s / duration_s, rate);
}

float pulse(float phase) {
  return 0.5f + 0.5f * std::sin(phase);
}

bool sparseHardParticleMode(const SystemParams& params) {
  return params.container.family == MaterialFamily::Granular && params.container.particle_count <= 0.10f &&
         params.container.particle_hardness >= 0.80f;
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

TextureLayer::Voice* TextureLayer::acquireVoice() {
  for (auto& voice : voices_) {
    if (!voice.active) {
      return &voice;
    }
  }
  return &voices_.front();
}

void TextureLayer::activateVoice(Voice& voice,
                                 const HapticEvent& event,
                                 TextureAtomKind atom,
                                 float duration_s,
                                 float density_hz,
                                 float apparent_motion_s,
                                 bool distribute_to_neighbors,
                                 float amplitude_scale) {
  voice = {};
  voice.active = true;
  voice.atom = atom;
  voice.source = event.type;
  voice.primary_wall = event.primary_wall;
  voice.direction = event.direction;
  voice.amplitude = clamp01(event.amplitude * amplitude_scale);
  voice.duration_s = std::max(1.0e-3f, duration_s);
  voice.density_hz = std::max(0.0f, density_hz);
  voice.age_s = 0.0f;
  voice.apparent_motion_s = std::max(0.0f, apparent_motion_s);
  voice.distribute_to_neighbors = distribute_to_neighbors;
  voice.first_frame = true;
}

void TextureLayer::spawnVoice(const HapticEvent& event) {
  const bool sparse_hard_particle = sparseHardParticleMode(params_);
  switch (event.type) {
    case EventType::WallHit:
      if (params_.container.family == MaterialFamily::Detented) {
        activateVoice(*acquireVoice(),
                      event,
                      TextureAtomKind::DetentClick,
                      std::max(event.duration_ms * 1.15f, params_.texture.hard_ping_low_ms * 0.85f) * 1.0e-3f,
                      std::max(6.0f, event.density_hz),
                      0.0f,
                      false,
                      1.18f);
        break;
      }
      if (sparse_hard_particle) {
        activateVoice(*acquireVoice(),
                      event,
                      TextureAtomKind::KnockPing,
                      std::max(event.duration_ms * 0.78f, params_.texture.hard_ping_low_ms * 0.62f) * 1.0e-3f,
                      std::max(3.0f, event.density_hz),
                      0.0f,
                      false,
                      1.10f);
        break;
      }
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::HardPing,
                    std::max(event.duration_ms, params_.texture.hard_ping_low_ms) * 1.0e-3f,
                    event.density_hz,
                    0.0f,
                    false);
      break;
    case EventType::RollTrain:
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::FlowRipple,
                    std::max(event.duration_ms, params_.texture.flow_ripple_soa_ms * 3.0f) * 1.0e-3f,
                    std::max(4.0f, event.density_hz),
                    params_.texture.flow_ripple_soa_ms * 1.0e-3f,
                    true);
      break;
    case EventType::ImpactCluster:
      if (sparse_hard_particle) {
        activateVoice(*acquireVoice(),
                      event,
                      TextureAtomKind::KnockPing,
                      std::max(event.duration_ms * 0.70f, params_.texture.hard_ping_low_ms * 0.58f) * 1.0e-3f,
                      std::max(2.0f, event.density_hz * 0.55f),
                      0.0f,
                      false,
                      1.18f);
        activateVoice(*acquireVoice(),
                      event,
                      TextureAtomKind::FlowRipple,
                      std::max(event.duration_ms * 0.90f, params_.texture.flow_ripple_soa_ms * 2.5f) * 1.0e-3f,
                      std::max(1.5f, event.density_hz * 0.22f),
                      0.0f,
                      true,
                      0.18f);
        break;
      }
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::DryRattle,
                    std::max(event.duration_ms, params_.texture.dry_rattle_ms) * 1.0e-3f,
                    std::max(8.0f, event.density_hz),
                    0.0f,
                    true);
      // Clustered impacts need some low-band body on a single transducer bench.
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::FlowRipple,
                    std::max(event.duration_ms * 1.45f, params_.texture.flow_ripple_soa_ms * 4.5f) * 1.0e-3f,
                    std::max(3.0f, event.density_hz * 0.50f),
                    0.55f * params_.texture.flow_ripple_soa_ms * 1.0e-3f,
                    true,
                    0.48f);
      break;
    case EventType::DropletCluster:
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::WetBurst,
                    std::max(event.duration_ms, params_.texture.wet_burst_ms) * 1.0e-3f,
                    std::max(10.0f, event.density_hz),
                    0.5f * params_.texture.flow_ripple_soa_ms * 1.0e-3f,
                    true);
      // Wet bursts read as "visible but weak" unless they carry a short low ripple body.
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::FlowRipple,
                    std::max(event.duration_ms * 1.80f, params_.texture.flow_ripple_soa_ms * 5.0f) * 1.0e-3f,
                    std::max(2.5f, event.density_hz * 0.35f),
                    0.75f * params_.texture.flow_ripple_soa_ms * 1.0e-3f,
                    true,
                    0.88f);
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::HardPing,
                    std::max(event.duration_ms * 0.70f, params_.texture.hard_ping_low_ms * 0.85f) * 1.0e-3f,
                    std::max(1.0f, event.density_hz * 0.50f),
                    0.0f,
                    false,
                    0.26f);
      break;
    case EventType::RoofSlap:
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::HardPing,
                    std::max(event.duration_ms, params_.texture.hard_ping_low_ms * 0.8f) * 1.0e-3f,
                    event.density_hz,
                    0.0f,
                    false);
      break;
    case EventType::Scrape:
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::ScrapeNoise,
                    std::max(event.duration_ms, params_.texture.scrape_noise_ms) * 1.0e-3f,
                    std::max(3.0f, event.density_hz),
                    params_.texture.flow_ripple_soa_ms * 1.0e-3f,
                    true);
      // Scrapes need a little tonal body on the mono bench or they vanish into weak noise.
      activateVoice(*acquireVoice(),
                    event,
                    TextureAtomKind::FlowRipple,
                    std::max(event.duration_ms * 1.35f, params_.texture.flow_ripple_soa_ms * 4.0f) * 1.0e-3f,
                    std::max(2.5f, event.density_hz * 0.60f),
                    0.70f * params_.texture.flow_ripple_soa_ms * 1.0e-3f,
                    true,
                    0.60f);
      break;
    case EventType::None:
    default:
      break;
  }
}

TextureCommand TextureLayer::renderVoice(const Voice& voice) const {
  TextureCommand cmd{};
  cmd.atom = voice.atom;
  cmd.source = voice.source;
  cmd.primary_wall = voice.primary_wall;
  cmd.direction = voice.direction;
  cmd.amplitude = voice.amplitude;
  cmd.duration_ms = voice.duration_s * 1.0e3f;
  cmd.density_hz = voice.density_hz;
  cmd.apparent_motion_soa_ms = voice.apparent_motion_s * 1.0e3f;
  cmd.distribute_to_neighbors = voice.distribute_to_neighbors;
  cmd.attack_frame = voice.first_frame;

  const float t = voice.duration_s > 0.0f ? clamp01(voice.age_s / voice.duration_s) : 1.0f;
  const float phase = 2.0f * kPi * std::max(0.0f, voice.density_hz) * voice.age_s;

  switch (voice.atom) {
    case TextureAtomKind::HardPing: {
      const float low_window_s =
          std::max(voice.duration_s, std::max(1.0e-3f, params_.texture.hard_ping_low_ms * 1.0e-3f));
      const float high_window_s =
          std::max(1.0e-3f, std::min(low_window_s, params_.texture.hard_ping_high_ms * 1.0e-3f));
      const float low = windowedDecay(voice.age_s, low_window_s, 5.0f);
      const float high = windowedDecay(voice.age_s, high_window_s, 6.0f);
      cmd.low_env = clamp01(voice.amplitude * 0.40f * low);
      cmd.high_env = clamp01(voice.amplitude * (0.55f + 0.30f * params_.texture.default_high_bias) * high);
      cmd.noise_env = clamp01(voice.amplitude * 0.08f * high);
      break;
    }
    case TextureAtomKind::KnockPing: {
      const float low_window_s =
          std::max(voice.duration_s, std::max(1.0e-3f, params_.texture.hard_ping_low_ms * 0.58f * 1.0e-3f));
      const float high_window_s =
          std::max(1.0e-3f, std::min(low_window_s, (params_.texture.hard_ping_high_ms * 0.65f + 1.5f) * 1.0e-3f));
      const float low = windowedDecay(voice.age_s, low_window_s, 9.5f);
      const float high = windowedDecay(voice.age_s, high_window_s, 12.0f);
      const float snap = expDecay(t, 18.0f);
      cmd.low_env = clamp01(voice.amplitude * (0.62f * low + 0.10f * snap));
      cmd.high_env = clamp01(voice.amplitude * (0.34f + 0.10f * params_.texture.default_high_bias) * high);
      cmd.noise_env = clamp01(voice.amplitude * 0.02f * high);
      break;
    }
    case TextureAtomKind::DetentClick: {
      const float low_window_s = std::max(
          voice.duration_s, std::max(1.0e-3f, params_.texture.hard_ping_low_ms * 0.75f * 1.0e-3f));
      const float high_window_s = std::max(
          1.0e-3f, std::min(low_window_s, (params_.texture.hard_ping_high_ms * 0.75f + 2.0f) * 1.0e-3f));
      const float low = windowedDecay(voice.age_s, low_window_s, 7.5f);
      const float high = windowedDecay(voice.age_s, high_window_s, 9.0f);
      const float accent = expDecay(t, 14.0f);
      cmd.low_env = clamp01(voice.amplitude * (0.74f * low + 0.12f * accent));
      cmd.high_env =
          clamp01(voice.amplitude * (0.22f + 0.12f * params_.texture.default_high_bias) * high);
      cmd.noise_env = clamp01(voice.amplitude * 0.03f * high);
      break;
    }
    case TextureAtomKind::WetBurst: {
      const float burst = expDecay(t, 6.0f);
      const float shimmer = 0.45f + 0.55f * pulse(phase);
      cmd.low_env = clamp01(voice.amplitude * 0.58f * burst);
      cmd.high_env = clamp01(voice.amplitude * (0.24f + 0.08f * params_.texture.default_high_bias) * burst);
      cmd.noise_env = clamp01(voice.amplitude * 0.10f * burst * shimmer);
      break;
    }
    case TextureAtomKind::DryRattle: {
      const float rattle = std::pow(pulse(phase), 2.0f);
      const float decay = expDecay(t, 2.5f);
      cmd.low_env = clamp01(voice.amplitude * 0.46f * rattle * decay);
      cmd.high_env = clamp01(voice.amplitude * 0.28f * rattle * decay);
      cmd.noise_env = clamp01(voice.amplitude * 0.10f * rattle * decay);
      break;
    }
    case TextureAtomKind::ScrapeNoise: {
      const float grain = 0.40f + 0.60f * pulse(phase);
      const float decay = expDecay(t, 1.55f);
      cmd.low_env = clamp01(voice.amplitude * 0.18f * decay);
      cmd.high_env = clamp01(voice.amplitude * 0.36f * grain * decay);
      cmd.noise_env = clamp01(voice.amplitude * 0.82f * grain * decay);
      break;
    }
    case TextureAtomKind::FlowRipple: {
      const float ripple = 0.30f + 0.70f * pulse(phase);
      const float decay = expDecay(t, 2.0f);
      cmd.low_env = clamp01(voice.amplitude * 0.62f * ripple * decay);
      cmd.high_env = clamp01(voice.amplitude * 0.18f * ripple * decay);
      cmd.noise_env = clamp01(voice.amplitude * 0.03f * ripple * decay);
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

    TextureCommand cmd{};
    if (params_.features.enable_attack_preserving_texture) {
      if (voice.age_s > voice.duration_s) {
        voice.active = false;
        continue;
      }
      cmd = renderVoice(voice);
      voice.first_frame = false;
      voice.age_s += dt_s;
      if (voice.age_s > voice.duration_s) {
        voice.active = false;
      }
    } else {
      voice.age_s += dt_s;
      if (voice.age_s > voice.duration_s) {
        voice.active = false;
        continue;
      }
      cmd = renderVoice(voice);
      voice.first_frame = false;
    }
    if (cmd.low_env <= 0.0f && cmd.high_env <= 0.0f && cmd.noise_env <= 0.0f) {
      continue;
    }
    pushTexture(frame, cmd);
  }

  return frame;
}

}  // namespace haptics
