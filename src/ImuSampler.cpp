#include "haptics/ImuSampler.hpp"

#include <Arduino.h>
#include <M5Unified.h>

namespace haptics {

bool ImuSampler::begin() {
  return M5.Imu.isEnabled();
}

ImuSample ImuSampler::poll() {
  ImuSample sample{};
  sample.timestamp_us = micros();

  if (!M5.Imu.update()) {
    return sample;
  }

  auto data = M5.Imu.getImuData();
  sample.accel_g.x = data.accel.x;
  sample.accel_g.y = data.accel.y;
  sample.accel_g.z = data.accel.z;
  sample.gyro_dps.x = data.gyro.x;
  sample.gyro_dps.y = data.gyro.y;
  sample.gyro_dps.z = data.gyro.z;
  sample.valid = true;
  return sample;
}

}  // namespace haptics
