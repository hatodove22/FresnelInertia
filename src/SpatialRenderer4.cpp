#include "haptics/SpatialRenderer4.hpp"

#include <algorithm>
#include <cmath>

namespace haptics {
namespace {

float clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

struct NeighborRouting {
  int lead = -1;
  int trail = -1;
  int opposite = -1;
  float tangential = 0.0f;
  float normal = 0.0f;
};

NeighborRouting resolveRouting(WallId wall, const Vec2f& direction) {
  NeighborRouting routing{};
  switch (wall) {
    case WallId::Front:
      routing.lead = direction.y >= 0.0f ? static_cast<int>(WallId::Top) : static_cast<int>(WallId::Bottom);
      routing.trail = direction.y >= 0.0f ? static_cast<int>(WallId::Bottom) : static_cast<int>(WallId::Top);
      routing.opposite = static_cast<int>(WallId::Back);
      routing.tangential = std::fabs(direction.y);
      routing.normal = std::fabs(direction.x);
      break;
    case WallId::Back:
      routing.lead = direction.y >= 0.0f ? static_cast<int>(WallId::Top) : static_cast<int>(WallId::Bottom);
      routing.trail = direction.y >= 0.0f ? static_cast<int>(WallId::Bottom) : static_cast<int>(WallId::Top);
      routing.opposite = static_cast<int>(WallId::Front);
      routing.tangential = std::fabs(direction.y);
      routing.normal = std::fabs(direction.x);
      break;
    case WallId::Top:
      routing.lead = direction.x >= 0.0f ? static_cast<int>(WallId::Front) : static_cast<int>(WallId::Back);
      routing.trail = direction.x >= 0.0f ? static_cast<int>(WallId::Back) : static_cast<int>(WallId::Front);
      routing.opposite = static_cast<int>(WallId::Bottom);
      routing.tangential = std::fabs(direction.x);
      routing.normal = std::fabs(direction.y);
      break;
    case WallId::Bottom:
      routing.lead = direction.x >= 0.0f ? static_cast<int>(WallId::Front) : static_cast<int>(WallId::Back);
      routing.trail = direction.x >= 0.0f ? static_cast<int>(WallId::Back) : static_cast<int>(WallId::Front);
      routing.opposite = static_cast<int>(WallId::Top);
      routing.tangential = std::fabs(direction.x);
      routing.normal = std::fabs(direction.y);
      break;
    case WallId::None:
    default:
      break;
  }
  return routing;
}

float directionalMotionBias(const NeighborRouting& routing) {
  return clamp01(routing.tangential / std::max(0.10f, routing.tangential + 0.55f * routing.normal));
}

DriveFrame4 scaledDrive(const ResonanceVoice& voice, const std::array<float, 4>& weights) {
  DriveFrame4 drive{};
  for (int i = 0; i < 4; ++i) {
    drive.low[i] = voice.low_env * weights[i];
    drive.high[i] = voice.high_env * weights[i];
    drive.noise[i] = voice.noise_env * weights[i];
  }
  return drive;
}

void addDrive(DriveFrame4& dst, const DriveFrame4& src) {
  for (int i = 0; i < 4; ++i) {
    dst.low[i] += src.low[i];
    dst.high[i] += src.high[i];
    dst.noise[i] += src.noise[i];
  }
}

}  // namespace

void SpatialRenderer4::configure(const SystemParams& params) {
  params_ = params;
  pending_.fill({});
}

void SpatialRenderer4::enqueueDelayed(const DriveFrame4& drive, float delay_s,
                                     float duration_s, float density_hz) {
  for (auto& pending : pending_) {
    if (!pending.active) {
      pending.active = true;
      pending.delay_s = delay_s;
      pending.duration_s = duration_s;
      pending.density_hz = density_hz;
      pending.drive = drive;
      return;
    }
  }
}

void SpatialRenderer4::accumulateImmediate(DriveFrame4& drive, const ResonanceVoice& voice) {
  const int src = static_cast<int>(voice.primary_wall);
  if (src < 0 || src >= 4) {
    return;
  }

  const NeighborRouting routing = resolveRouting(voice.primary_wall, voice.direction);
  const float local_weight = 1.0f + std::max(0.0f, params_.spatial.wall_softmax_delta);
  const float neighbor_weight = voice.distribute_to_neighbors ? params_.spatial.neighbor_bleed : 0.0f;
  const float opposite_weight = voice.distribute_to_neighbors ? params_.spatial.opposite_bleed : 0.0f;
  // lead/trail split ONE neighbor budget, not two independent budgets.
  const float neighbor_budget = params_.features.enable_coherent_container_demo
                                    ? neighbor_weight : 2.0f * neighbor_weight;
  const float total = std::max(1.0e-4f, local_weight + neighbor_budget + opposite_weight);
  const float lead_share = 0.50f + 0.35f * directionalMotionBias(routing);
  const float trail_share = 1.0f - lead_share;

  std::array<float, 4> weights{};
  weights[src] = local_weight / total;

  if (voice.atom == TextureAtomKind::FlowRipple && voice.apparent_motion_soa_ms > 0.0f) {
    addDrive(drive, scaledDrive(voice, weights));

    const bool enqueue_delays =
        (!params_.features.enable_coherent_container_demo &&
         !params_.features.enable_single_shot_spatial_delay) || voice.attack_frame;
    const float duration_s = params_.features.enable_coherent_container_demo
                                 ? std::max(0.001f, voice.duration_ms * 1.0e-3f)
                                 : 0.0f;
    if (neighbor_weight > 0.0f && enqueue_delays) {
      const float lead_weight = neighbor_weight * lead_share / total;
      const float trail_weight = neighbor_weight * trail_share / total;
      if (routing.lead >= 0 && lead_weight > 0.0f) {
        std::array<float, 4> lead_drive_weights{};
        lead_drive_weights[routing.lead] = lead_weight;
        enqueueDelayed(scaledDrive(voice, lead_drive_weights), voice.apparent_motion_soa_ms * 1.0e-3f,
                       duration_s, voice.density_hz);
      }
      if (routing.trail >= 0 && trail_weight > 0.0f) {
        std::array<float, 4> trail_drive_weights{};
        trail_drive_weights[routing.trail] = trail_weight;
        enqueueDelayed(scaledDrive(voice, trail_drive_weights), voice.apparent_motion_soa_ms * 1.7e-3f,
                       duration_s, voice.density_hz);
      }
    }

    if (opposite_weight > 0.0f && routing.opposite >= 0 && enqueue_delays) {
      std::array<float, 4> opposite_drive_weights{};
      opposite_drive_weights[routing.opposite] = opposite_weight / total;
      enqueueDelayed(scaledDrive(voice, opposite_drive_weights), 2.4f * voice.apparent_motion_soa_ms * 1.0e-3f,
                     duration_s, voice.density_hz);
    }
    return;
  }

  if (routing.lead >= 0) {
    weights[routing.lead] = neighbor_weight * lead_share / total;
  }
  if (routing.trail >= 0) {
    weights[routing.trail] = neighbor_weight * trail_share / total;
  }
  if (routing.opposite >= 0) {
    weights[routing.opposite] = opposite_weight / total;
  }
  addDrive(drive, scaledDrive(voice, weights));
}

SpatialFrame4 SpatialRenderer4::update(const ResonanceFrame<kMaxResonanceVoicesPerFrame>& resonances, float dt_s) {
  SpatialFrame4 frame{};
  if (params_.features.enable_coherent_container_demo &&
      (!std::isfinite(dt_s) || dt_s < 0.0f)) {
    // Ignore invalid elapsed time without poisoning or rewinding queued tails.
    return frame;
  }

  for (auto& pending : pending_) {
    if (!pending.active) {
      continue;
    }
    pending.delay_s -= dt_s;
    if (pending.delay_s > 0.0f) {
      continue;
    }
    if (pending.duration_s > 0.0f) {
      const float age_s = -pending.delay_s;
      if (age_s >= pending.duration_s) {
        pending = {};
        continue;
      }
      // Reconstruct the delayed FlowRipple envelope, not a one-tick copy.
      // The stored attack contains ripple(0)=0.65 and zero-age decay already.
      const float ripple = 0.65f + 0.35f * std::sin(
          6.28318530718f * pending.density_hz * age_s);
      const float envelope = (ripple / 0.65f) * std::exp(-2.0f * age_s / pending.duration_s);
      DriveFrame4 tail = pending.drive;
      for (int i = 0; i < 4; ++i) {
        tail.low[i] *= envelope;
        tail.high[i] *= envelope;
        tail.noise[i] *= envelope;
      }
      addDrive(frame.drive, tail);
    } else {
      addDrive(frame.drive, pending.drive);
      pending = {};
    }
  }

  for (std::size_t i = 0; i < resonances.count; ++i) {
    accumulateImmediate(frame.drive, resonances.items[i]);
  }

  for (int i = 0; i < 4; ++i) {
    frame.drive.low[i] = clamp01(frame.drive.low[i]);
    frame.drive.high[i] = clamp01(frame.drive.high[i]);
    frame.drive.noise[i] = clamp01(frame.drive.noise[i]);
    frame.summary.ch[i] = clamp01(
        params_.resonance.master_gain *
        (0.45f * frame.drive.low[i] + 0.75f * frame.drive.high[i] + 0.20f * frame.drive.noise[i]));
  }

  return frame;
}

}  // namespace haptics
