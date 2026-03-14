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

void SpatialRenderer4::enqueueDelayed(const DriveFrame4& drive, float delay_s) {
  for (auto& pending : pending_) {
    if (!pending.active) {
      pending.active = true;
      pending.delay_s = delay_s;
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
  const float total = std::max(1.0e-4f, local_weight + 2.0f * neighbor_weight + opposite_weight);
  const float lead_share = 0.50f + 0.35f * directionalMotionBias(routing);
  const float trail_share = 1.0f - lead_share;

  std::array<float, 4> weights{};
  weights[src] = local_weight / total;

  if (voice.atom == TextureAtomKind::FlowRipple && voice.apparent_motion_soa_ms > 0.0f) {
    addDrive(drive, scaledDrive(voice, weights));

    if (neighbor_weight > 0.0f) {
      const float lead_weight = neighbor_weight * lead_share / total;
      const float trail_weight = neighbor_weight * trail_share / total;
      if (routing.lead >= 0 && lead_weight > 0.0f) {
        std::array<float, 4> lead_drive_weights{};
        lead_drive_weights[routing.lead] = lead_weight;
        enqueueDelayed(scaledDrive(voice, lead_drive_weights), voice.apparent_motion_soa_ms * 1.0e-3f);
      }
      if (routing.trail >= 0 && trail_weight > 0.0f) {
        std::array<float, 4> trail_drive_weights{};
        trail_drive_weights[routing.trail] = trail_weight;
        enqueueDelayed(scaledDrive(voice, trail_drive_weights), voice.apparent_motion_soa_ms * 1.7e-3f);
      }
    }

    if (opposite_weight > 0.0f && routing.opposite >= 0) {
      std::array<float, 4> opposite_drive_weights{};
      opposite_drive_weights[routing.opposite] = opposite_weight / total;
      enqueueDelayed(scaledDrive(voice, opposite_drive_weights), 2.4f * voice.apparent_motion_soa_ms * 1.0e-3f);
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

  for (auto& pending : pending_) {
    if (!pending.active) {
      continue;
    }
    pending.delay_s -= dt_s;
    if (pending.delay_s > 0.0f) {
      continue;
    }
    addDrive(frame.drive, pending.drive);
    pending = {};
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
