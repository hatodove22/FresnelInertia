#pragma once

#include <cmath>
#include <cstddef>
#include <cstdio>
#include <cstring>

#include "haptics/Parameters.hpp"

namespace haptics {

// Remote-only policy. Local/backend setters retain their existing semantics.
inline bool isHapticLinkTunablePath(const char* path) {
  if (path == nullptr) return false;
  constexpr const char* allowed[]{
      "container.fill", "container.headspace", "container.viscosity",
      "container.particle_count", "container.particle_hardness",
      "container.span_x_m", "container.span_y_m", "container.span_z_m",
      "mass.damping_ratio_x", "mass.damping_ratio_y", "mass.energy_decay_s",
      "mass.granular_static_friction", "mass.granular_dynamic_friction",
      "resonance.master_gain", "tilt.max_tilt_deg", "tilt.k_phi", "tilt.k_cm", "tilt.k_tau",
  };
  for (const char* candidate : allowed) {
    if (std::strcmp(path, candidate) == 0) return true;
  }
  return false;
}

inline bool isHapticLinkTunableNumber(const char* path, float value) {
  if (!isHapticLinkTunablePath(path) || !std::isfinite(value)) return false;
  if (std::strcmp(path, "mass.granular_static_friction") == 0 ||
      std::strcmp(path, "mass.granular_dynamic_friction") == 0) {
    return value >= 0.0f && value <= 2.0f;
  }
  if (std::strcmp(path, "tilt.max_tilt_deg") == 0) return value >= 0.0f && value <= 10.0f;
  if (std::strcmp(path, "tilt.k_phi") == 0) return value >= 0.0f && value <= 8.0f;
  if (std::strcmp(path, "tilt.k_cm") == 0 || std::strcmp(path, "tilt.k_tau") == 0) {
    return value >= 0.0f && value <= 1.0f;
  }
  // The pre-existing properties still use their backend clamp behavior.
  return true;
}

// Six significant digits fit all four actual settings into the existing ACK.
// Clients compare with a 1e-5 relative / 1e-6 absolute tolerance. Do not clamp a
// local setting merely to make it look like a valid remote tuning candidate.
// An incomplete/nonfinite reply must never advertise the valid version prefix.
inline bool formatHapticLinkTiltState(const TiltPlaneParams& tilt,
                                     char* destination, std::size_t capacity) {
  if (destination == nullptr || capacity == 0U) return false;
  destination[0] = '\0';
  if (!std::isfinite(tilt.max_tilt_deg) || !std::isfinite(tilt.k_cm) ||
      !std::isfinite(tilt.k_tau) || !std::isfinite(tilt.k_phi)) return false;
  const int length = std::snprintf(destination, capacity, "tilt_v1=%.6g,%.6g,%.6g,%.6g",
                                 static_cast<double>(tilt.max_tilt_deg),
                                 static_cast<double>(tilt.k_cm),
                                 static_cast<double>(tilt.k_tau),
                                 static_cast<double>(tilt.k_phi));
  if (length < 0 || static_cast<std::size_t>(length) >= capacity) {
    destination[0] = '\0';
    return false;
  }
  return true;
}

}  // namespace haptics
