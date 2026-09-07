#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>

#include "haptics/EspNowControlProtocol.hpp"
#include "haptics/HapticLinkTuning.hpp"
#include "haptics/HardwareProfiles.hpp"

using namespace haptics;
static unsigned checks = 0;
#define CHECK(condition) do { ++checks; if (!(condition)) { \
  std::fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #condition); std::exit(1); \
} } while (false)

void allowlistAndBounds() {
  constexpr const char* legacy[]{
      "container.fill", "container.headspace", "container.viscosity", "container.particle_count",
      "container.particle_hardness", "container.span_x_m", "container.span_y_m", "container.span_z_m",
      "mass.damping_ratio_x", "mass.damping_ratio_y", "mass.energy_decay_s", "resonance.master_gain"
  };
  for (const char* path : legacy) {
    CHECK(isHapticLinkTunablePath(path));
    CHECK(isHapticLinkTunableNumber(path, 0.5f));
    CHECK(isHapticLinkTunableNumber(path, 20.0f)); // Preserve existing backend clamping.
    CHECK(!isHapticLinkTunableNumber(path, std::numeric_limits<float>::quiet_NaN()));
  }
  constexpr const char* gains[]{"tilt.max_tilt_deg", "tilt.k_phi", "tilt.k_cm", "tilt.k_tau",
                                "mass.granular_static_friction", "mass.granular_dynamic_friction"};
  constexpr float maxima[]{10.0f, 8.0f, 1.0f, 1.0f, 2.0f, 2.0f};
  for (unsigned i = 0; i < 6; ++i) {
    const float maximum = maxima[i];
    CHECK(isHapticLinkTunablePath(gains[i]));
    CHECK(isHapticLinkTunableNumber(gains[i], 0.0f));
    CHECK(isHapticLinkTunableNumber(gains[i], maximum));
    CHECK(isHapticLinkTunableNumber(gains[i], maximum * 0.5f));
    CHECK(!isHapticLinkTunableNumber(gains[i], -0.001f));
    CHECK(!isHapticLinkTunableNumber(gains[i], std::nextafter(maximum, INFINITY)));
    CHECK(!isHapticLinkTunableNumber(gains[i], std::numeric_limits<float>::infinity()));
    CHECK(!isHapticLinkTunableNumber(gains[i], -std::numeric_limits<float>::infinity()));
    CHECK(!isHapticLinkTunableNumber(gains[i], std::numeric_limits<float>::quiet_NaN()));
  }
  for (const char* path : {"", "tilt.k_phi ", "tilt.k_phi\nlive", "tilt.max_total_cmd_deg", "tilt.k_psi", "audio.runtime_enable", "audio.output_gain"}) {
    CHECK(!isHapticLinkTunablePath(path));
    CHECK(!isHapticLinkTunableNumber(path, 0.5f));
  }
  CHECK(!isHapticLinkTunablePath(nullptr));
  CHECK(!isHapticLinkTunableNumber(nullptr, 1.0f));
}

bool closeEnough(float actual, float expected) {
  return std::isfinite(actual) &&
         std::fabs(static_cast<double>(actual) - expected) <=
             std::fmax(1e-6, std::fabs(static_cast<double>(expected)) * 1e-5);
}

void roundTrip(const TiltPlaneParams& tilt) {
  char detail[sizeof(EspNowControlResponseV1{}.detail)]{};
  CHECK(formatHapticLinkTiltState(tilt, detail, sizeof(detail)));
  CHECK(std::strlen(detail) < sizeof(detail));
  float maximum = 0.0f, cm = 0.0f, tau = 0.0f, phi = 0.0f;
  CHECK(std::sscanf(detail, "tilt_v1=%f,%f,%f,%f", &maximum, &cm, &tau, &phi) == 4);
  CHECK(closeEnough(maximum, tilt.max_tilt_deg) && closeEnough(cm, tilt.k_cm) &&
        closeEnough(tau, tilt.k_tau) && closeEnough(phi, tilt.k_phi));
  const auto response = encodeEspNowControlResponseV1(EspNowControlResult::Applied, 17, 123, 456, detail);
  CHECK(sizeof(response) == 88U);
  CHECK(validateEspNowControlResponseV1(&response, sizeof(response)));
  CHECK(std::strcmp(response.detail, detail) == 0);
  CHECK(response.request_id == 17U && response.session_id == 123U && response.applied_frame_counter == 456U);
}

void actualReadbackAndInvalidBuffers() {
  SystemParams params{};
  applyAsBuiltAtomS3Profile(params);
  roundTrip(params.tilt);
  CHECK(params.tilt.max_tilt_deg == 10.0f && params.tilt.k_phi == 4.0f &&
        params.tilt.k_cm == 0.35f && params.tilt.k_tau == 0.25f);
  params.tilt.max_tilt_deg = 10.0f; params.tilt.k_phi = 8.0f;
  params.tilt.k_cm = 1.0f; params.tilt.k_tau = 0.0f;
  roundTrip(params.tilt);
  params.tilt.k_phi = 4.0f; params.tilt.k_cm = 0.25f; params.tilt.k_tau = 0.5f;
  char detail[60]{};
  CHECK(formatHapticLinkTiltState(params.tilt, detail, sizeof(detail)));
  CHECK(std::strcmp(detail, "tilt_v1=10,0.25,0.5,4") == 0);
  // Local/backend values outside the remote edit bounds must be reported as-is.
  params.tilt.max_tilt_deg = 12.5f; params.tilt.k_phi = 9.25f;
  params.tilt.k_cm = -0.125f; params.tilt.k_tau = 2.0f;
  roundTrip(params.tilt);
  params.tilt.k_phi = std::numeric_limits<float>::max();
  params.tilt.k_cm = -std::numeric_limits<float>::max();
  params.tilt.k_tau = std::numeric_limits<float>::denorm_min();
  roundTrip(params.tilt);
  params.tilt.max_tilt_deg = params.tilt.k_phi = params.tilt.k_cm = params.tilt.k_tau =
      -std::numeric_limits<float>::max();
  roundTrip(params.tilt);
  CHECK(formatHapticLinkTiltState(params.tilt, detail, sizeof(detail)));
  CHECK(std::strlen(detail) == 59U); // Longest finite four-value reply still leaves its NUL.
  CHECK(!formatHapticLinkTiltState(params.tilt, nullptr, 60));
  char tiny[8] = "old";
  CHECK(!formatHapticLinkTiltState(params.tilt, tiny, sizeof(tiny)));
  CHECK(tiny[0] == '\0');
  tiny[0] = 'x';
  CHECK(!formatHapticLinkTiltState(params.tilt, tiny, 0));
  CHECK(tiny[0] == 'x');
  for (unsigned i = 0; i < 4; ++i) {
    TiltPlaneParams invalid{};
    float* values[]{&invalid.max_tilt_deg, &invalid.k_phi, &invalid.k_cm, &invalid.k_tau};
    for (const float value : {std::numeric_limits<float>::quiet_NaN(), std::numeric_limits<float>::infinity(), -std::numeric_limits<float>::infinity()}) {
      *values[i] = value; std::strcpy(detail, "old");
      CHECK(!formatHapticLinkTiltState(invalid, detail, sizeof(detail)));
      CHECK(detail[0] == '\0');
    }
  }
}

int main() {
  allowlistAndBounds();
  actualReadbackAndInvalidBuffers();
  std::printf("PASS Haptic Link tilt tuning: %u checks; finite/range policy, actual readback, unchanged 88-byte response.\n", checks);
}
