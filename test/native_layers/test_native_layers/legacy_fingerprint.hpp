#pragma once

#include <array>
#include <cstdint>

namespace native_layers_test {

// Fixed review artifact for pre-gravity-separation layer behavior.
//
// Input contract:
//   - makeDefaultLiquidPreset()
//   - 400 samples at exactly 250 Hz
//   - piecewise-constant IMU samples defined in test_main.cpp
//   - direct Mass -> Event -> Texture -> Resonance -> Spatial composition
//
// These values are intentionally hand-reviewed constants. The exact discrete
// timeline hash catches shifted event/texture/resonance frames, while the
// tolerance-bounded weighted and squared sums retain output-shape information.
// The test executable has no update mode and never writes this file. When an
// intentional algorithm change requires new values, update this initializer in
// a dedicated review.
struct LegacyFingerprint {
  std::uint32_t frames = 0;
  std::array<std::uint32_t, 7> event_type_counts{};
  std::array<std::uint32_t, 8> texture_atom_counts{};
  std::uint32_t resonance_voice_count = 0;
  std::uint32_t discrete_timeline_hash = 0;
  std::array<float, 4> energy_checkpoints{};
  std::array<float, 5> final_mass{};
  std::array<float, 4> drive_sum{};
  std::array<float, 4> drive_peak{};
  std::array<float, 4> drive_time_weighted_sum{};
  std::array<float, 4> drive_squared_sum{};
};

inline constexpr float kFingerprintTolerance = 2.0e-4f;

inline constexpr LegacyFingerprint kLegacyFingerprint{
    400,
    {0, 0, 0, 0, 7, 0, 0},
    {0, 35, 0, 0, 42, 0, 0, 92},
    169,
    3669242273U,
    {0.0f, 0.0894609913f, 0.151366696f, 0.0530228615f},
    {5.79341067e-05f, 5.02009098e-05f, 0.000857723295f, 0.000877732236f, 0.0530228615f},
    {0.506849110f, 0.791595042f, 0.110867657f, 0.581257761f},
    {0.0520574003f, 0.0521924533f, 0.00234911172f, 0.0522818118f},
    {0.387368530f, 0.653002322f, 0.0864854082f, 0.371595353f},
    {0.0121497205f, 0.0191366021f, 0.000147648359f, 0.0128393620f},
};

}  // namespace native_layers_test
