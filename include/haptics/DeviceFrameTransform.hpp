#pragma once

#include "haptics/Types.hpp"

namespace haptics {

// Rotate the as-built AtomS3 IMU axes into the right-handed computation frame:
//   +x thumb -> index, +y upward, +z fingertips -> wrist.
// The user's forward semantic axis is therefore -z at presentation boundaries.
Vec3f rotateAsBuiltAtomS3ImuVector(const Vec3f& raw);
ImuSample transformAsBuiltAtomS3ImuSample(const ImuSample& raw_sample);

}  // namespace haptics
