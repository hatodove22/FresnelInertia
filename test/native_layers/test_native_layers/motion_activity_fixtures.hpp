#pragma once

#include <array>

#include "haptics/Types.hpp"

namespace native_layers_test {

struct ImuNoisePoint {
  haptics::Vec3f accel_delta_g{};
  haptics::Vec3f gyro_delta_dps{};
};

// Fixed, hand-reviewed numeric trace. It intentionally includes a constant
// sensor bias plus bounded deterministic noise and does not depend on a host
// standard library random-number implementation.
inline constexpr haptics::Vec3f kStationaryAccelBiasG{0.012f, -0.008f, 0.009f};
inline constexpr haptics::Vec3f kStationaryGyroBiasDps{0.70f, -0.40f, 0.95f};
inline constexpr std::array<ImuNoisePoint, 32> kStationaryNoiseTrace{{
    {{0.0010f, -0.0018f, 0.0007f}, {0.08f, -0.05f, 0.06f}},
    {{-0.0022f, 0.0006f, -0.0011f}, {-0.04f, 0.07f, -0.03f}},
    {{0.0031f, 0.0012f, -0.0004f}, {0.11f, 0.02f, -0.08f}},
    {{-0.0014f, -0.0026f, 0.0018f}, {-0.09f, -0.04f, 0.05f}},
    {{0.0003f, 0.0021f, -0.0016f}, {0.03f, 0.09f, 0.01f}},
    {{0.0026f, -0.0007f, 0.0002f}, {0.07f, -0.08f, -0.06f}},
    {{-0.0030f, 0.0018f, 0.0010f}, {-0.12f, 0.05f, 0.08f}},
    {{0.0017f, -0.0010f, -0.0020f}, {0.05f, -0.02f, -0.09f}},
    {{-0.0008f, 0.0029f, 0.0005f}, {-0.01f, 0.12f, 0.04f}},
    {{0.0020f, -0.0022f, 0.0014f}, {0.10f, -0.10f, 0.02f}},
    {{-0.0027f, -0.0003f, -0.0008f}, {-0.08f, 0.01f, -0.05f}},
    {{0.0009f, 0.0015f, 0.0022f}, {0.02f, 0.06f, 0.10f}},
    {{0.0033f, -0.0016f, -0.0013f}, {0.13f, -0.06f, -0.04f}},
    {{-0.0019f, 0.0008f, 0.0011f}, {-0.06f, 0.04f, 0.07f}},
    {{0.0005f, -0.0029f, 0.0009f}, {0.04f, -0.13f, 0.03f}},
    {{-0.0034f, 0.0024f, -0.0002f}, {-0.14f, 0.10f, -0.01f}},
    {{0.0013f, 0.0002f, -0.0019f}, {0.06f, 0.00f, -0.10f}},
    {{-0.0004f, -0.0013f, 0.0025f}, {-0.02f, -0.07f, 0.12f}},
    {{0.0029f, 0.0017f, -0.0006f}, {0.12f, 0.08f, -0.02f}},
    {{-0.0021f, -0.0020f, 0.0016f}, {-0.10f, -0.09f, 0.06f}},
    {{0.0007f, 0.0026f, -0.0010f}, {0.01f, 0.11f, -0.07f}},
    {{0.0018f, -0.0005f, 0.0020f}, {0.09f, -0.03f, 0.09f}},
    {{-0.0032f, 0.0010f, -0.0015f}, {-0.13f, 0.03f, -0.08f}},
    {{0.0023f, -0.0024f, 0.0003f}, {0.08f, -0.11f, 0.00f}},
    {{-0.0011f, 0.0020f, 0.0013f}, {-0.05f, 0.09f, 0.05f}},
    {{0.0030f, 0.0004f, -0.0021f}, {0.11f, 0.01f, -0.11f}},
    {{-0.0025f, -0.0017f, 0.0008f}, {-0.09f, -0.08f, 0.04f}},
    {{0.0002f, 0.0028f, -0.0007f}, {0.00f, 0.13f, -0.05f}},
    {{0.0015f, -0.0027f, 0.0019f}, {0.07f, -0.12f, 0.08f}},
    {{-0.0028f, 0.0014f, -0.0012f}, {-0.11f, 0.06f, -0.06f}},
    {{0.0024f, -0.0009f, 0.0006f}, {0.10f, -0.04f, 0.02f}},
    {{-0.0006f, 0.0023f, -0.0018f}, {-0.03f, 0.10f, -0.09f}},
}};

}  // namespace native_layers_test
