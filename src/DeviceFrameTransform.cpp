#include "haptics/DeviceFrameTransform.hpp"

namespace haptics {
namespace {

constexpr float kInvSqrt2 = 0.70710678118654752440f;

}  // namespace

Vec3f rotateAsBuiltAtomS3ImuVector(const Vec3f& raw) {
  // This is a proper rotation (determinant +1), so it is valid for both
  // polar acceleration vectors and axial angular-velocity vectors.
  Vec3f transformed{};
  transformed.x = -raw.y;
  transformed.y = kInvSqrt2 * (raw.x + raw.z);
  transformed.z = kInvSqrt2 * (raw.z - raw.x);
  return transformed;
}

ImuSample transformAsBuiltAtomS3ImuSample(const ImuSample& raw_sample) {
  ImuSample transformed = raw_sample;
  transformed.accel_g = rotateAsBuiltAtomS3ImuVector(raw_sample.accel_g);
  transformed.gyro_dps = rotateAsBuiltAtomS3ImuVector(raw_sample.gyro_dps);
  return transformed;
}

}  // namespace haptics
