#include "haptics/EventLayer.hpp"

#include <algorithm>
#include <cmath>

namespace haptics {
namespace {

constexpr float kMinWallSpeedNorm = 0.06f;
constexpr WallId kWalls[4] = {WallId::Front, WallId::Back, WallId::Top, WallId::Bottom};

float clampf(float value, float lo, float hi) {
  return std::max(lo, std::min(value, hi));
}

size_t wallIndex(WallId wall) {
  switch (wall) {
    case WallId::Front:
      return 0;
    case WallId::Back:
      return 1;
    case WallId::Top:
      return 2;
    case WallId::Bottom:
      return 3;
    case WallId::None:
    default:
      return 4;
  }
}

float spanForWall(const MassState& state, WallId wall) {
  switch (wall) {
    case WallId::Front:
    case WallId::Back:
      return std::max(0.020f, state.container_x_m);
    case WallId::Top:
    case WallId::Bottom:
      return std::max(0.020f, state.container_y_m);
    case WallId::None:
    default:
      return 0.060f;
  }
}

float distanceToWallNorm(const MassState& state, WallId wall) {
  switch (wall) {
    case WallId::Front:
      return std::max(0.0f, 1.0f - state.pos_norm.x);
    case WallId::Back:
      return std::max(0.0f, state.pos_norm.x + 1.0f);
    case WallId::Top:
      return std::max(0.0f, 1.0f - state.pos_norm.y);
    case WallId::Bottom:
      return std::max(0.0f, state.pos_norm.y + 1.0f);
    case WallId::None:
    default:
      return 2.0f;
  }
}

float approachSpeedNorm(const MassState& state, WallId wall) {
  switch (wall) {
    case WallId::Front:
      return std::max(0.0f, state.vel_norm_s.x);
    case WallId::Back:
      return std::max(0.0f, -state.vel_norm_s.x);
    case WallId::Top:
      return std::max(0.0f, state.vel_norm_s.y);
    case WallId::Bottom:
      return std::max(0.0f, -state.vel_norm_s.y);
    case WallId::None:
    default:
      return 0.0f;
  }
}

WallId dominantWall(const MassState& state) {
  if (std::fabs(state.pos_norm.x) >= std::fabs(state.pos_norm.y)) {
    return state.pos_norm.x >= 0.0f ? WallId::Front : WallId::Back;
  }
  return state.pos_norm.y >= 0.0f ? WallId::Top : WallId::Bottom;
}

float wallZoneNorm(const MassState& state, const SystemParams& params, WallId wall) {
  const float span_m = spanForWall(state, wall);
  return clampf(2.0f * params.event.wall_decay_span_m / span_m, 0.08f, 0.45f);
}

float meanSpanM(const MassState& state) {
  return 0.5f * (std::max(0.020f, state.container_x_m) + std::max(0.020f, state.container_y_m));
}

float wallContactNorm(const MassState& state, const SystemParams& params, WallId wall) {
  const float zone_norm = wallZoneNorm(state, params, wall);
  const float distance_norm = distanceToWallNorm(state, wall);
  return clampf(1.0f - distance_norm / std::max(zone_norm, 1.0e-3f), 0.0f, 1.0f);
}

float tangentialSpeedNorm(const MassState& state, WallId wall) {
  switch (wall) {
    case WallId::Front:
    case WallId::Back:
      return std::fabs(state.vel_norm_s.y);
    case WallId::Top:
    case WallId::Bottom:
      return std::fabs(state.vel_norm_s.x);
    case WallId::None:
    default:
      return 0.0f;
  }
}

float particleCountGain(const SystemParams& params) {
  return clampf(0.35f + 2.0f * params.container.particle_count, 0.35f, 1.20f);
}

float particleHardnessGain(const SystemParams& params) {
  return clampf(0.25f + 0.95f * params.container.particle_hardness, 0.25f, 1.20f);
}

float mobilityGain(const MassState& state, const SystemParams& params) {
  return clampf(0.40f + 1.05f * state.headspace - 0.35f * params.container.viscosity, 0.35f, 1.25f);
}

bool sparseHardParticleMode(const SystemParams& params) {
  return params.container.family == MaterialFamily::Granular && params.container.particle_count <= 0.10f &&
         params.container.particle_hardness >= 0.80f;
}

WallId topBottomWallFromPos(const MassState& state) {
  return state.pos_norm.y >= 0.0f ? WallId::Top : WallId::Bottom;
}

float liquidBurstDrive(const MassState& state, const SystemParams& params, float speed) {
  const float span_mean_m = meanSpanM(state);
  const float geometry_gain = clampf(0.082f / span_mean_m, 0.70f, 1.60f);
  const float splash_gain = clampf(0.42f + 1.45f * state.headspace, 0.42f, 1.28f);
  const float viscosity_gain = clampf(1.10f - 0.65f * params.container.viscosity, 0.25f, 1.10f);
  const float energy_gain = clampf(0.36f + 1.18f * state.energy, 0.36f, 1.45f);
  const float agitation_floor = clampf(0.12f + 0.55f * state.energy, 0.12f, 0.80f);
  const float motion_gain = clampf(
      agitation_floor + speed * 0.85f + std::fabs(state.pos_norm.y) * 0.42f + std::fabs(state.pos_norm.x) * 0.12f,
      0.0f,
      1.65f);
  return geometry_gain * splash_gain * viscosity_gain * energy_gain * motion_gain;
}

float wallContactThreshold(const SystemParams& params) {
  // Older presets were tuned before this parameter was connected, so keep its runtime meaning permissive.
  return clampf(0.15f + 0.50f * params.event.wall_threshold, 0.10f, 0.75f);
}

float splashThreshold(const SystemParams& params) {
  return clampf(params.event.splash_threshold, 0.10f, 2.00f);
}

float softThresholdGain(float value, float threshold, float floor_gain) {
  if (value <= 0.0f) {
    return 0.0f;
  }
  const float normalized = value / std::max(0.05f, threshold);
  const float floor = clampf(floor_gain, 0.0f, 0.95f);
  if (normalized >= 1.0f) {
    return 1.0f;
  }
  return clampf(floor + (1.0f - floor) * normalized, 0.0f, 1.0f);
}

WallId preferredFlowWall(const MassState& state, const SystemParams& params) {
  WallId best_wall = dominantWall(state);
  float best_score = -1.0f;
  for (const WallId candidate : kWalls) {
    const float contact = wallContactNorm(state, params, candidate);
    const float tangential = tangentialSpeedNorm(state, candidate);
    const float approach = approachSpeedNorm(state, candidate);
    const float score = contact * (0.25f + tangential) + 0.35f * approach;
    if (score > best_score) {
      best_score = score;
      best_wall = candidate;
    }
  }
  return best_score > 0.10f ? best_wall : dominantWall(state);
}

}  // namespace

void EventLayer::configure(const SystemParams& params) {
  params_ = params;
  last_event_ = {};
  wall_cooldown_s_.fill(0.0f);
  wall_armed_.fill(true);
  roll_phase_ = 0.0f;
  impact_phase_ = 0.0f;
  rolling_activity_ = 0.0f;
  impact_activity_ = 0.0f;
  scrape_cooldown_s_ = 0.0f;
  droplet_phase_ = 0.0f;
  liquid_activity_ = 0.0f;
  roof_cooldown_s_ = 0.0f;
  hybrid_impact_phase_ = 0.0f;
  liquid_burst_ready_ = true;
  hybrid_burst_ready_ = true;
  detent_phase_ = 0.0f;
  detent_activity_ = 0.0f;
  detent_scrape_cooldown_s_ = 0.0f;
  detent_tick_ready_ = true;
  roll_wall_ = WallId::None;
}

void EventLayer::pushEvent(EventFrame<kMaxEventsPerFrame>& frame, const HapticEvent& event) {
  if (frame.count >= frame.items.size()) {
    return;
  }
  frame.items[frame.count++] = event;
  last_event_ = event;
}

EventFrame<kMaxEventsPerFrame> EventLayer::update(const MassState& state, float dt_s) {
  EventFrame<kMaxEventsPerFrame> frame{};

  for (auto& cooldown_s : wall_cooldown_s_) {
    cooldown_s = std::max(0.0f, cooldown_s - dt_s);
  }

  const float speed = std::sqrt(state.vel_norm_s.x * state.vel_norm_s.x + state.vel_norm_s.y * state.vel_norm_s.y);
  const float position_mag = std::max(std::fabs(state.pos_norm.x), std::fabs(state.pos_norm.y));
  const WallId wall = dominantWall(state);
  const float wall_contact_threshold = wallContactThreshold(params_);

  WallId hit_wall = WallId::None;
  float hit_priority = 0.0f;
  for (const WallId candidate : kWalls) {
    const size_t index = wallIndex(candidate);
    const float span_m = spanForWall(state, candidate);
    const float zone_norm = wallZoneNorm(state, params_, candidate);
    const float distance_norm = distanceToWallNorm(state, candidate);
    const float contact = wallContactNorm(state, params_, candidate);
    const float approach_norm = approachSpeedNorm(state, candidate);
    const float impact_speed_m_s = 0.5f * span_m * approach_norm;

    if (distance_norm > zone_norm * 1.4f || contact < wall_contact_threshold * 0.55f || approach_norm <= 0.0f) {
      wall_armed_[index] = true;
    }
    if (!wall_armed_[index] || wall_cooldown_s_[index] > 0.0f) {
      continue;
    }
    if (distance_norm > zone_norm || contact < wall_contact_threshold || approach_norm < kMinWallSpeedNorm) {
      continue;
    }

    const float density_gain = clampf(0.060f / span_m, 0.70f, 1.60f);
    const float priority = approach_norm * density_gain * (0.35f + 0.65f * contact);
    if (priority > hit_priority) {
      hit_priority = priority;
      hit_wall = candidate;
    }
  }

  if (hit_wall != WallId::None) {
    const size_t index = wallIndex(hit_wall);
    const float span_m = spanForWall(state, hit_wall);
    const float approach_norm = approachSpeedNorm(state, hit_wall);
    const float contact = wallContactNorm(state, params_, hit_wall);
    const float impact_speed_m_s = 0.5f * span_m * approach_norm;
    const float density_gain = clampf(0.060f / span_m, 0.70f, 1.60f);
    const float impact_norm = clampf(approach_norm / 0.70f, 0.0f, 1.0f);
    const float cooldown_s =
        clampf((0.45f * span_m) / std::max(impact_speed_m_s, 0.03f), 0.025f, 0.120f);
    HapticEvent hit{};
    hit.type = EventType::WallHit;
    hit.primary_wall = hit_wall;
    hit.amplitude =
        clampf((0.18f + 0.82f * state.energy) * (0.30f + 0.70f * impact_norm) * (0.30f + 0.70f * contact) *
                   density_gain,
               0.0f,
               1.0f);
    hit.duration_ms = clampf(12.0f + span_m * 110.0f - impact_norm * 6.0f - contact * 2.0f, 8.0f, 24.0f);
    if (sparseHardParticleMode(params_)) {
      hit.amplitude = clampf(hit.amplitude * 1.12f + 0.06f * impact_norm, 0.0f, 1.0f);
      hit.duration_ms = clampf(hit.duration_ms * 0.68f, 7.0f, 16.0f);
    }
    hit.density_hz = 1.0f / std::max(0.010f, cooldown_s);
    hit.direction = state.vel_norm_s;
    pushEvent(frame, hit);
    wall_armed_[index] = false;
    wall_cooldown_s_[index] = cooldown_s;
  }

  switch (state.family) {
    case MaterialFamily::Granular: {
      scrape_cooldown_s_ = std::max(0.0f, scrape_cooldown_s_ - dt_s);

      const float span_mean_m = meanSpanM(state);
      const float geometry_density = clampf(0.060f / span_mean_m, 0.70f, 1.80f);
      const float particle_gain = particleCountGain(params_);
      const float hardness_gain = particleHardnessGain(params_);
      const float mobility_gain = mobilityGain(state, params_);
      const bool sparse_hard_particle = sparseHardParticleMode(params_);

      WallId best_roll_wall = WallId::None;
      float best_roll_drive = 0.0f;
      float best_roll_contact = 0.0f;

      WallId best_impact_wall = wall;
      float best_impact_drive = 0.0f;
      float best_impact_approach = 0.0f;

      for (const WallId candidate : kWalls) {
        const float contact = wallContactNorm(state, params_, candidate);
        const float tangential = tangentialSpeedNorm(state, candidate);
        const float approach = approachSpeedNorm(state, candidate);
        const float settle = clampf(1.0f - approach / 0.45f, 0.0f, 1.0f);
        const float roll_drive = tangential * (0.20f + 0.80f * contact) * settle;
        if (roll_drive > best_roll_drive) {
          best_roll_drive = roll_drive;
          best_roll_wall = candidate;
          best_roll_contact = contact;
        }

        const float impact_drive = 0.55f * contact + 0.45f * approach + 0.15f * tangential;
        if (impact_drive > best_impact_drive) {
          best_impact_drive = impact_drive;
          best_impact_wall = candidate;
          best_impact_approach = approach;
        }
      }

      const float roll_target =
          best_roll_drive * geometry_density * particle_gain * mobility_gain *
          clampf(0.58f + 1.08f * state.energy, 0.0f, 1.55f);
      const float roll_blend = clampf(dt_s * 8.0f, 0.0f, 1.0f);
      rolling_activity_ += (roll_target - rolling_activity_) * roll_blend;
      rolling_activity_ = clampf(rolling_activity_, 0.0f, 2.0f);

      if (best_roll_wall != WallId::None && rolling_activity_ > 0.10f) {
        if (roll_wall_ != WallId::None && roll_wall_ != best_roll_wall) {
          roll_phase_ = std::min(roll_phase_, 0.35f);
        }
        const float roll_rate_hz =
            params_.event.roll_rate_hz * clampf(0.45f + rolling_activity_, 0.45f, 2.20f);
        roll_phase_ += dt_s * roll_rate_hz;
        while (roll_phase_ >= 1.0f && frame.count < frame.items.size()) {
          HapticEvent roll{};
          roll.type = EventType::RollTrain;
          roll.primary_wall = best_roll_wall;
          roll.amplitude = clampf(
              0.22f + 0.42f * rolling_activity_ + 0.14f * hardness_gain + 0.14f * best_roll_contact,
              0.0f,
              1.0f);
          roll.duration_ms =
              clampf(8.0f + 5.0f / geometry_density + 4.0f * (1.0f - best_roll_contact), 8.0f, 18.0f);
          roll.density_hz = roll_rate_hz;
          roll.direction = state.vel_norm_s;
          pushEvent(frame, roll);
          roll_phase_ -= 1.0f;
        }
        roll_wall_ = best_roll_wall;
      } else {
        roll_phase_ = std::min(roll_phase_, 0.40f);
        roll_wall_ = WallId::None;
      }

      const float wall_hit_bonus = (hit_wall != WallId::None) ? (0.35f + 0.65f * hit_priority) : 0.0f;
      const float impact_target =
          geometry_density * particle_gain * hardness_gain *
          ((0.30f + 1.00f * state.energy) * (0.30f + best_impact_drive + 0.55f * rolling_activity_) +
           wall_hit_bonus);
      const float impact_blend = clampf(dt_s * 6.0f, 0.0f, 1.0f);
      impact_activity_ += (impact_target - impact_activity_) * impact_blend;
      impact_activity_ = clampf(impact_activity_, 0.0f, 3.0f);

      if (impact_activity_ > 0.12f) {
        const float impact_rate_hz =
            params_.event.impact_rate_hz * (sparse_hard_particle ? 0.62f : 1.0f) *
            clampf(0.30f + impact_activity_, 0.30f, 2.80f);
        impact_phase_ += dt_s * impact_rate_hz;
        while (impact_phase_ >= 1.0f && frame.count < frame.items.size()) {
          HapticEvent cluster{};
          cluster.type = EventType::ImpactCluster;
          cluster.primary_wall = best_impact_wall;
          cluster.amplitude = clampf(
              0.20f + 0.34f * impact_activity_ + 0.20f * best_impact_approach +
                  0.10f * rolling_activity_,
              0.0f,
              1.0f);
          cluster.duration_ms = clampf(
              12.0f + span_mean_m * 120.0f + 6.0f * (1.0f - std::min(1.0f, hardness_gain / 1.20f)),
              10.0f,
              26.0f);
          if (sparse_hard_particle) {
            cluster.amplitude =
                clampf(cluster.amplitude * 0.92f + 0.10f * best_impact_approach + 0.06f * hardness_gain, 0.0f, 1.0f);
            cluster.duration_ms = clampf(cluster.duration_ms * 0.52f, 7.0f, 13.0f);
          }
          cluster.density_hz = impact_rate_hz;
          cluster.clustered = true;
          cluster.direction = state.vel_norm_s;
          pushEvent(frame, cluster);
          impact_phase_ -= 1.0f;
        }
      } else {
        impact_phase_ = std::min(impact_phase_, 0.45f);
      }

      const WallId scrape_wall = (best_roll_wall != WallId::None) ? best_roll_wall : wall;
      const float scrape_contact = wallContactNorm(state, params_, scrape_wall);
      const float scrape_drive =
          tangentialSpeedNorm(state, scrape_wall) * (0.35f + 0.65f * scrape_contact) * hardness_gain;
      if (scrape_cooldown_s_ <= 0.0f && scrape_drive > params_.event.scrape_threshold * 0.92f) {
        HapticEvent scrape{};
        scrape.type = EventType::Scrape;
        scrape.primary_wall = scrape_wall;
        scrape.amplitude = clampf(
            0.16f + 0.20f * scrape_drive + 0.18f * rolling_activity_ + 0.12f * scrape_contact,
            0.0f,
            1.0f);
        scrape.duration_ms = clampf(16.0f + 8.0f * scrape_contact, 16.0f, 28.0f);
        scrape.density_hz = 1.0f / clampf(0.085f / std::max(scrape_drive, 0.25f), 0.025f, 0.085f);
        scrape.direction = state.vel_norm_s;
        pushEvent(frame, scrape);
        scrape_cooldown_s_ = clampf(0.085f / std::max(scrape_drive, 0.25f), 0.025f, 0.085f);
      }
      break;
    }
    case MaterialFamily::Liquid: {
      roof_cooldown_s_ = std::max(0.0f, roof_cooldown_s_ - dt_s);
      const float burst_drive = liquidBurstDrive(state, params_, speed);
      const float burst_gate = softThresholdGain(burst_drive, splashThreshold(params_), 0.35f);
      const float burst_target = burst_drive * burst_gate;
      const float blend = clampf(dt_s * 5.0f, 0.0f, 1.0f);
      liquid_activity_ += (burst_target - liquid_activity_) * blend;
      liquid_activity_ = clampf(liquid_activity_, 0.0f, 2.2f);

      if (liquid_activity_ > 0.04f) {
        const float burst_rate_hz =
            params_.event.droplet_rate_hz * clampf(0.28f + liquid_activity_, 0.28f, 2.10f);
        if (liquid_burst_ready_ &&
            (speed > 0.06f || position_mag > 0.10f || state.energy > 0.16f || hit_wall != WallId::None)) {
          droplet_phase_ = std::max(droplet_phase_, 1.02f);
          liquid_burst_ready_ = false;
        }
        droplet_phase_ += dt_s * burst_rate_hz;
        const WallId burst_wall = preferredFlowWall(state, params_);
        const float burst_contact = wallContactNorm(state, params_, burst_wall);
        while (droplet_phase_ >= 1.0f && frame.count < frame.items.size()) {
          HapticEvent droplets{};
          droplets.type = EventType::DropletCluster;
          droplets.primary_wall = burst_wall;
          droplets.amplitude = clampf(
              0.24f + 0.36f * liquid_activity_ + 0.24f * std::fabs(state.pos_norm.y) +
                  0.12f * std::fabs(state.pos_norm.x) + 0.12f * burst_contact,
              0.0f,
              1.0f);
          droplets.duration_ms =
              clampf(14.0f + 16.0f * state.headspace + 10.0f * (1.0f - state.fill) + 4.0f * burst_contact, 14.0f, 36.0f);
          droplets.density_hz = burst_rate_hz;
          droplets.clustered = true;
          droplets.direction = state.vel_norm_s;
          pushEvent(frame, droplets);
          droplet_phase_ -= 1.0f;
        }
      } else {
        droplet_phase_ = std::min(droplet_phase_, 0.35f);
      }
      if (liquid_activity_ < 0.02f && speed < 0.05f) {
        liquid_burst_ready_ = true;
      }

      const WallId roof_wall = topBottomWallFromPos(state);
      const float roof_contact = wallContactNorm(state, params_, roof_wall);
      const float roof_drive = (state.energy * 0.75f + speed * 0.45f) * roof_contact;
      if (params_.container.enable_roof_contact && roof_cooldown_s_ <= 0.0f && state.fill > 0.72f &&
          roof_contact > params_.event.roof_slap_threshold) {
        HapticEvent roof{};
        roof.type = EventType::RoofSlap;
        roof.primary_wall = roof_wall;
        roof.amplitude = clampf(0.18f + 0.72f * roof_drive, 0.0f, 1.0f);
        roof.duration_ms = clampf(16.0f + 12.0f * state.fill, 16.0f, 28.0f);
        roof.density_hz = 1.0f / clampf(0.14f - 0.06f * roof_contact, 0.050f, 0.14f);
        roof.direction = state.vel_norm_s;
        pushEvent(frame, roof);
        roof_cooldown_s_ = clampf(0.14f - 0.06f * roof_contact, 0.050f, 0.14f);
      }
      break;
    }
    case MaterialFamily::Hybrid: {
      roof_cooldown_s_ = std::max(0.0f, roof_cooldown_s_ - dt_s);
      const float burst_drive = liquidBurstDrive(state, params_, speed) * 0.85f;
      const float burst_gate = softThresholdGain(burst_drive, splashThreshold(params_), 0.35f);
      const float burst_target = burst_drive * burst_gate;
      const float blend = clampf(dt_s * 5.0f, 0.0f, 1.0f);
      liquid_activity_ += (burst_target - liquid_activity_) * blend;
      liquid_activity_ = clampf(liquid_activity_, 0.0f, 2.0f);

      if (liquid_activity_ > 0.08f) {
        const float burst_rate_hz =
            params_.event.droplet_rate_hz * clampf(0.30f + liquid_activity_, 0.30f, 1.95f);
        if (hybrid_burst_ready_ &&
            (speed > 0.08f || position_mag > 0.10f || state.energy > 0.18f || hit_wall != WallId::None)) {
          droplet_phase_ = std::max(droplet_phase_, 0.95f);
          hybrid_burst_ready_ = false;
        }
        droplet_phase_ += dt_s * burst_rate_hz;
        const WallId burst_wall = preferredFlowWall(state, params_);
        const float burst_contact = wallContactNorm(state, params_, burst_wall);
        while (droplet_phase_ >= 1.0f && frame.count < frame.items.size()) {
          HapticEvent droplets{};
          droplets.type = EventType::DropletCluster;
          droplets.primary_wall = burst_wall;
          droplets.amplitude =
              clampf(0.15f + 0.26f * liquid_activity_ + 0.14f * state.headspace + 0.10f * burst_contact, 0.0f, 1.0f);
          droplets.duration_ms = clampf(10.0f + 8.0f * state.headspace + 4.0f * burst_contact, 10.0f, 22.0f);
          droplets.density_hz = burst_rate_hz;
          droplets.clustered = true;
          droplets.direction = state.vel_norm_s;
          pushEvent(frame, droplets);
          droplet_phase_ -= 1.0f;
        }
      } else {
        droplet_phase_ = std::min(droplet_phase_, 0.30f);
      }
      if (liquid_activity_ < 0.03f && speed < 0.05f) {
        hybrid_burst_ready_ = true;
      }

      const float rigid_gain =
          clampf(0.20f + 1.40f * params_.container.particle_count + 0.90f * params_.container.particle_hardness, 0.20f, 1.80f);
      const float rigid_rate_hz =
          params_.event.impact_rate_hz * 0.45f * clampf(0.20f + rigid_gain * (0.25f + state.energy), 0.20f, 1.80f);
      hybrid_impact_phase_ += dt_s * rigid_rate_hz;
      while (hybrid_impact_phase_ >= 1.0f && frame.count < frame.items.size()) {
        HapticEvent impact{};
        impact.type = EventType::ImpactCluster;
        impact.primary_wall = wall;
        impact.amplitude =
            clampf(0.14f + 0.16f * liquid_activity_ + 0.20f * rigid_gain + 0.30f * state.energy, 0.0f, 1.0f);
        impact.duration_ms = clampf(14.0f + 10.0f * params_.container.particle_hardness, 12.0f, 26.0f);
        impact.density_hz = rigid_rate_hz;
        impact.clustered = true;
        impact.direction = state.vel_norm_s;
        pushEvent(frame, impact);
        hybrid_impact_phase_ -= 1.0f;
      }

      const WallId roof_wall = topBottomWallFromPos(state);
      const float roof_contact = wallContactNorm(state, params_, roof_wall);
      if (params_.container.enable_roof_contact && roof_cooldown_s_ <= 0.0f && state.fill > 0.74f &&
          roof_contact > params_.event.roof_slap_threshold) {
        HapticEvent roof{};
        roof.type = EventType::RoofSlap;
        roof.primary_wall = roof_wall;
        roof.amplitude = clampf(0.16f + 0.50f * roof_contact + 0.25f * state.energy, 0.0f, 1.0f);
        roof.duration_ms = 18.0f;
        roof.direction = state.vel_norm_s;
        pushEvent(frame, roof);
        roof_cooldown_s_ = 0.10f;
      }
      break;
    }
    case MaterialFamily::Detented: {
      detent_scrape_cooldown_s_ = std::max(0.0f, detent_scrape_cooldown_s_ - dt_s);
      const WallId detent_wall = preferredFlowWall(state, params_);
      const float contact = wallContactNorm(state, params_, detent_wall);
      const float tangential = tangentialSpeedNorm(state, detent_wall);
      const float normal = approachSpeedNorm(state, detent_wall);
      const float span_mean_m = meanSpanM(state);
      const float geometry_density = clampf(0.060f / span_mean_m, 0.75f, 1.60f);
      const float detent_engagement = std::max(contact, position_mag);
      const float speed_drive = speed * clampf(0.30f + 1.10f * state.energy, 0.0f, 1.60f);
      const float detent_drive =
          (0.32f * state.energy + speed_drive * (0.45f + 0.55f * detent_engagement) + 0.25f * normal) *
          geometry_density;
      const float detent_blend = clampf(dt_s * 8.0f, 0.0f, 1.0f);
      detent_activity_ += (detent_drive - detent_activity_) * detent_blend;
      detent_activity_ = clampf(detent_activity_, 0.0f, 2.0f);

      if (detent_activity_ > 0.05f) {
        const float detent_rate_hz =
            params_.event.impact_rate_hz * 0.48f *
            clampf(0.60f + detent_activity_ + 0.25f * state.energy, 0.60f, 2.20f);
        if (detent_tick_ready_ && (speed > 0.05f || detent_engagement > 0.10f || state.energy > 0.14f)) {
          detent_phase_ = std::max(detent_phase_, 1.05f);
          detent_tick_ready_ = false;
        }
        detent_phase_ += dt_s * detent_rate_hz;
        while (detent_phase_ >= 1.0f && frame.count < frame.items.size()) {
          HapticEvent tick{};
          tick.type = EventType::WallHit;
          tick.primary_wall = detent_wall;
          tick.amplitude = clampf(
              0.26f + 0.42f * detent_activity_ + 0.14f * detent_engagement + 0.12f * normal + 0.10f * tangential,
              0.0f,
              1.0f);
          tick.duration_ms = clampf(10.0f + 6.0f * (1.0f - detent_engagement), 10.0f, 16.0f);
          tick.density_hz = detent_rate_hz;
          tick.direction = state.vel_norm_s;
          pushEvent(frame, tick);
          detent_phase_ -= 1.0f;
        }
      } else {
        detent_phase_ = std::min(detent_phase_, 0.30f);
      }
      if (detent_activity_ < 0.02f && speed < 0.04f) {
        detent_tick_ready_ = true;
      }

      const float scrape_drive = tangential * (0.20f + 0.55f * contact + 0.25f * detent_engagement);
      if (detent_scrape_cooldown_s_ <= 0.0f && scrape_drive > params_.event.scrape_threshold * 0.75f) {
        HapticEvent scrape{};
        scrape.type = EventType::Scrape;
        scrape.primary_wall = detent_wall;
        scrape.amplitude = clampf(0.22f + 0.34f * scrape_drive + 0.20f * detent_activity_ + 0.12f * state.energy,
                                  0.0f,
                                  1.0f);
        scrape.duration_ms = clampf(18.0f + 14.0f * contact, 18.0f, 32.0f);
        scrape.density_hz = 1.0f / clampf(0.085f / std::max(scrape_drive, 0.20f), 0.030f, 0.085f);
        scrape.direction = state.vel_norm_s;
        pushEvent(frame, scrape);
        detent_scrape_cooldown_s_ = clampf(0.085f / std::max(scrape_drive, 0.20f), 0.030f, 0.085f);
      }
      break;
    }
    case MaterialFamily::Custom:
    default:
      break;
  }

  return frame;
}

}  // namespace haptics
