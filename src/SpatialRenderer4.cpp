#include "haptics/SpatialRenderer4.hpp"

#include <algorithm>

namespace haptics {
namespace {

float clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
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

  const int left = (src + 3) % 4;
  const int right = (src + 1) % 4;
  const int opposite = (src + 2) % 4;
  const float local_weight = 1.0f + std::max(0.0f, params_.spatial.wall_softmax_delta);
  const float neighbor_weight = voice.distribute_to_neighbors ? params_.spatial.neighbor_bleed : 0.0f;
  const float opposite_weight = voice.distribute_to_neighbors ? params_.spatial.opposite_bleed : 0.0f;
  const float total = std::max(1.0e-4f, local_weight + 2.0f * neighbor_weight + opposite_weight);

  std::array<float, 4> weights{};
  weights[src] = local_weight / total;

  if (voice.atom == TextureAtomKind::FlowRipple && voice.apparent_motion_soa_ms > 0.0f) {
    const float delayed_neighbor = 0.42f * neighbor_weight / total;
    const float delayed_opposite = 0.85f * opposite_weight / total;
    const float immediate_neighbor = 0.58f * neighbor_weight / total;
    weights[left] = immediate_neighbor;
    weights[right] = immediate_neighbor;
    addDrive(drive, scaledDrive(voice, weights));

    std::array<float, 4> neighbor_drive_weights{};
    neighbor_drive_weights[left] = delayed_neighbor;
    neighbor_drive_weights[right] = delayed_neighbor;
    enqueueDelayed(scaledDrive(voice, neighbor_drive_weights), voice.apparent_motion_soa_ms * 1.0e-3f);

    if (opposite_weight > 0.0f) {
      std::array<float, 4> opposite_drive_weights{};
      opposite_drive_weights[opposite] = delayed_opposite;
      enqueueDelayed(scaledDrive(voice, opposite_drive_weights), 2.0f * voice.apparent_motion_soa_ms * 1.0e-3f);
    }
    return;
  }

  weights[left] = neighbor_weight / total;
  weights[right] = neighbor_weight / total;
  weights[opposite] = opposite_weight / total;
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
