// Browser-only C ABI over the production layers. No hardware backends are linked.
// Ordinary firmware sees an empty translation unit, even with broad source filters.
#if defined(HAPTICS_PREVIEW_ENGINE) && defined(__EMSCRIPTEN__)

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <emscripten/emscripten.h>

#include "haptics/HardwareProfiles.hpp"
#include "haptics/HapticSynthesisCore.hpp"

namespace {
using namespace haptics;

SystemParams params{};
HapticSynthesisCore synthesis;
MassState mass{};
EventFrame<kMaxEventsPerFrame> events{};
SpatialFrame4 spatial{};
TiltPlaneCommand tilt{};
double time_s = 0.0;
unsigned frame_counter = 0;
unsigned event_total = 0;
bool loaded = false;
char json[16384]{};

// Bounded output: all names are built-in constants, events are fixed-capacity.
struct JsonWriter {
  std::size_t used = 0;
  bool valid = true;
  template <typename... Args> void add(const char* format, Args... args) {
    if (!valid) return;
    const int written = std::snprintf(json + used, sizeof(json) - used, format, args...);
    if (written < 0 || static_cast<std::size_t>(written) >= sizeof(json) - used) {
      valid = false;
      return;
    }
    used += static_cast<std::size_t>(written);
  }
};

const char* familyName(MaterialFamily family) {
  switch (family) {
    case MaterialFamily::Granular: return "Granular";
    case MaterialFamily::Hybrid: return "Hybrid";
    case MaterialFamily::Detented: return "Detented";
    case MaterialFamily::Custom: return "Custom";
    default: return "Liquid";
  }
}

const char* eventName(EventType type) {
  switch (type) {
    case EventType::WallHit: return "wall_hit";
    case EventType::RollTrain: return "roll_train";
    case EventType::ImpactCluster: return "impact_cluster";
    case EventType::DropletCluster: return "droplet_cluster";
    case EventType::RoofSlap: return "roof_slap";
    case EventType::Scrape: return "scrape";
    case EventType::PressurePop: return "pressure_pop";
    default: return "none";
  }
}

void resetLayers() {
  synthesis.reset(params);
  mass = HapticSynthesisCore::defaultMassState(params);
  events = {};
  spatial = {};
  tilt = {};
}

void resetPreview() {
  resetLayers();
  time_s = 0.0;
  frame_counter = 0;
  event_total = 0;
}

}  // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE int preview_abi_version() { return 1; }

EMSCRIPTEN_KEEPALIVE int preview_load_preset(const char* name) {
  if (name == nullptr) return 0;
  SystemParams next{};
  if (std::strcmp(name, "granular_single_marble_box") == 0) {
    next = makeDefaultGranularSingleMarblePreset();
  } else if (std::strcmp(name, "granular_sand_box") == 0) {
    next = makeDefaultGranularSandPreset();
  } else if (std::strcmp(name, "liquid_small_box") == 0) {
    next = makeDefaultLiquidPreset();
  } else if (std::strcmp(name, "liquid_soda_bottle") == 0) {
    next = makeDefaultSodaPreset();
  } else {
    return 0;
  }
  applyAsBuiltAtomS3Profile(next);
  // Explicit preview conditions, not changes to generic or physical defaults.
  // This enables model calculation only: the browser links no actuator backend.
  next.features.enable_tilt_plane = true;
  next.features.enable_granular_pile_demo = std::strcmp(name, "granular_sand_box") == 0;
  next.features.enable_pressurized_demo = std::strcmp(name, "liquid_soda_bottle") == 0;
  params = next;
  loaded = true;
  resetPreview();
  return 1;
}

EMSCRIPTEN_KEEPALIVE int preview_reset() {
  if (!loaded) return 0;
  resetPreview();
  return 1;
}

// Deliberately a small preview whitelist. These are not remote device commands.
EMSCRIPTEN_KEEPALIVE int preview_set_param(const char* path, float value) {
  if (!loaded || path == nullptr || !std::isfinite(value)) return 0;
  bool matched = false;
#define PREVIEW_FLOAT(group, field, minimum, maximum) \
  if (std::strcmp(path, #group "." #field) == 0) { \
    if (value < minimum || value > maximum) return 0; \
    params.group.field = value; matched = true; \
  }
  PREVIEW_FLOAT(container, fill, 0.0f, 1.0f)
  PREVIEW_FLOAT(container, headspace, 0.0f, 1.0f)
  PREVIEW_FLOAT(container, viscosity, 0.0f, 1.0f)
  PREVIEW_FLOAT(container, particle_count, 0.0f, 1.0f)
  PREVIEW_FLOAT(container, particle_hardness, 0.0f, 1.0f)
  PREVIEW_FLOAT(container, span_x_m, 0.02f, 0.30f)
  PREVIEW_FLOAT(container, span_y_m, 0.02f, 0.30f)
  PREVIEW_FLOAT(container, span_z_m, 0.02f, 0.30f)
  PREVIEW_FLOAT(mass, damping_ratio_x, 0.0f, 2.0f)
  PREVIEW_FLOAT(mass, damping_ratio_y, 0.0f, 2.0f)
  PREVIEW_FLOAT(mass, energy_decay_s, 0.04f, 3.0f)
  PREVIEW_FLOAT(mass, natural_freq_x_hz, 0.1f, 8.0f)
  PREVIEW_FLOAT(mass, natural_freq_y_hz, 0.1f, 8.0f)
  PREVIEW_FLOAT(mass, rebound, 0.0f, 1.0f)
  PREVIEW_FLOAT(mass, granular_static_friction, 0.0f, 2.0f)
  PREVIEW_FLOAT(mass, granular_dynamic_friction, 0.0f, 2.0f)
  PREVIEW_FLOAT(resonance, master_gain, 0.0f, 1.0f)
  PREVIEW_FLOAT(tilt, k_phi, 0.0f, 8.0f)
#undef PREVIEW_FLOAT
  if (std::strcmp(path, "features.enable_granular_pile_demo") == 0) {
    if (value != 0.0f && value != 1.0f) return 0;
    params.features.enable_granular_pile_demo = value != 0.0f;
    matched = true;
  }
  if (!matched) return 0;
  resetPreview();
  return 1;
}

// The input is ALREADY in the body frame. Do not apply the mounting transform
// again. A stationary upright synthetic sample is acceleration (0,+1,0) g.
EMSCRIPTEN_KEEPALIVE int preview_step(float dt_s, float ax, float ay, float az,
                                      float gx, float gy, float gz) {
  if (!loaded || !std::isfinite(dt_s) || dt_s <= 0.0f || dt_s > 1.0f ||
      !std::isfinite(ax) || !std::isfinite(ay) || !std::isfinite(az) ||
      !std::isfinite(gx) || !std::isfinite(gy) || !std::isfinite(gz)) return 0;
  ImuSample sample{};
  sample.valid = true;
  sample.timestamp_us = static_cast<uint32_t>(std::fmod((time_s + dt_s) * 1.0e6, 4294967296.0));
  sample.accel_g = {ax, ay, az};
  sample.gyro_dps = {gx, gy, gz};
  SynthesisContext context{};
  context.tilt_allowed = true;
  const auto frame = synthesis.step(params, sample, dt_s, context);
  if (!frame.accepted) return 0;
  mass = frame.mass;
  events = frame.events;
  spatial = frame.spatial;
  // Valid preview input has no missing-sample hold; Hold marks a long-gap
  // reset and the preview clears its displayed command, as before extraction.
  tilt = frame.tilt;
  time_s += dt_s;
  ++frame_counter;
  event_total += static_cast<unsigned>(events.count);
  return 1;
}

EMSCRIPTEN_KEEPALIVE const char* preview_snapshot() {
  if (!loaded) return "null";
  JsonWriter out;
  out.add("{\"source\":\"production-cpp-preview\",\"abiVersion\":1,\"preset\":\"%s\","
          "\"family\":\"%s\",\"timeS\":%.9g,\"frameCounter\":%u,\"eventsTotal\":%u,",
          params.preset_name, familyName(params.container.family), time_s, frame_counter, event_total);
  out.add("\"container\":{\"span_x_m\":%.9g,\"span_y_m\":%.9g,\"span_z_m\":%.9g,"
          "\"fill\":%.9g,\"headspace\":%.9g,\"viscosity\":%.9g,\"particle_count\":%.9g,\"particle_hardness\":%.9g},",
          params.container.span_x_m, params.container.span_y_m, params.container.span_z_m,
          params.container.fill, params.container.headspace, params.container.viscosity,
          params.container.particle_count, params.container.particle_hardness);
  out.add("\"parameters\":{\"granularPile\":%s,\"staticFriction\":%.9g,\"dynamicFriction\":%.9g,"
          "\"dampingX\":%.9g,\"dampingY\":%.9g,\"rebound\":%.9g,\"masterGain\":%.9g,\"tiltGain\":%.9g},",
          params.features.enable_granular_pile_demo ? "true" : "false", params.mass.granular_static_friction,
          params.mass.granular_dynamic_friction, params.mass.damping_ratio_x, params.mass.damping_ratio_y,
          params.mass.rebound, params.resonance.master_gain, params.tilt.k_phi);
  out.add("\"mass\":{\"posNorm\":[%.9g,%.9g],\"velNormS\":[%.9g,%.9g],\"energy\":%.9g,\"fill\":%.9g,"
          "\"wallContact\":[%.9g,%.9g,%.9g,%.9g],\"wallImpactSpeedNormS\":[%.9g,%.9g,%.9g,%.9g],"
          "\"pileSlope\":%.9g,\"granularFlow\":%.9g,\"granularPileActive\":%s,",
          mass.pos_norm.x, mass.pos_norm.y, mass.vel_norm_s.x, mass.vel_norm_s.y, mass.energy, mass.fill,
          mass.wall_contact[0], mass.wall_contact[1], mass.wall_contact[2], mass.wall_contact[3],
          mass.wall_impact_speed_norm_s[0], mass.wall_impact_speed_norm_s[1],
          mass.wall_impact_speed_norm_s[2], mass.wall_impact_speed_norm_s[3],
          mass.pile_slope, mass.granular_flow, mass.granular_pile_active ? "true" : "false");
  const char* phase = static_cast<unsigned>(mass.pressure.phase) == 1 ? "burst"
                      : (static_cast<unsigned>(mass.pressure.phase) == 2 ? "spent" : "sealed");
  out.add("\"pressure\":{\"enabled\":%s,\"phase\":\"%s\",\"charge\":%.9g,\"phaseS\":%.9g,"
          "\"remaining\":%.9g,\"burstSequence\":%u}},",
          mass.pressure.enabled ? "true" : "false", phase, mass.pressure.charge, mass.pressure.phase_s,
          mass.pressure.remaining, static_cast<unsigned>(mass.pressure.burst_sequence));
  out.add("\"tilt\":{\"thumbDeg\":%.9g,\"indexDeg\":%.9g,\"cgX\":%.9g,\"cgY\":%.9g,"
          "\"commonForceN\":%.9g,\"differentialTorqueNm\":%.9g,\"apparentMassKg\":%.9g},",
          tilt.thumb_angle_deg, tilt.index_angle_deg, tilt.cg_x_m, tilt.cg_y_m,
          tilt.common_force_n, tilt.differential_torque_nm, tilt.apparent_mass_kg);
  out.add("\"drive\":{\"low\":[%.9g,%.9g,%.9g,%.9g],\"high\":[%.9g,%.9g,%.9g,%.9g],"
          "\"noise\":[%.9g,%.9g,%.9g,%.9g]},\"channels\":[%.9g,%.9g,%.9g,%.9g],\"events\":[",
          spatial.drive.low[0], spatial.drive.low[1], spatial.drive.low[2], spatial.drive.low[3],
          spatial.drive.high[0], spatial.drive.high[1], spatial.drive.high[2], spatial.drive.high[3],
          spatial.drive.noise[0], spatial.drive.noise[1], spatial.drive.noise[2], spatial.drive.noise[3],
          spatial.summary.ch[0], spatial.summary.ch[1], spatial.summary.ch[2], spatial.summary.ch[3]);
  for (std::size_t i = 0; i < events.count; ++i) {
    const auto& event = events.items[i];
    out.add("%s{\"type\":%u,\"name\":\"%s\",\"wall\":%u,\"amplitude\":%.9g,\"durationMs\":%.9g,\"densityHz\":%.9g}",
            i == 0 ? "" : ",", static_cast<unsigned>(event.type), eventName(event.type), static_cast<unsigned>(event.primary_wall),
            event.amplitude, event.duration_ms, event.density_hz);
  }
  out.add("%s", "]}");
  return out.valid ? json : "null";
}

}  // extern "C"
#endif
