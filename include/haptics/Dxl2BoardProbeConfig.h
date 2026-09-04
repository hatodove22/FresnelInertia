#pragma once

#include <cstdint>

#ifndef DXL2_PROVISION_ID_ENABLE
#define DXL2_PROVISION_ID_ENABLE 0
#endif

#ifndef DXL2_PROVISION_SOURCE_ID
#define DXL2_PROVISION_SOURCE_ID 1
#endif

#ifndef DXL2_PROVISION_TARGET_ID
#define DXL2_PROVISION_TARGET_ID 2
#endif

#ifndef DXL2_MOTION_TEST_ENABLE
#define DXL2_MOTION_TEST_ENABLE 0
#endif

namespace haptics {
namespace dxl2_probe {

constexpr int kDxlTxPin = 1;
constexpr int kDxlRxPin = 2;
constexpr uint32_t kDefaultBaud = 57600;
constexpr uint32_t kDesignBaud = 1000000;
constexpr uint8_t kQuickScanLastId = 10;
constexpr uint8_t kTorqueOffValue = 0;
constexpr uint16_t kExpectedXl330M077Model = 1190;
constexpr int32_t kMotionTravelPulses = 40;
constexpr int32_t kMotionPositionTolerancePulses = 12;
constexpr uint32_t kMotionProfileVelocity = 5;
constexpr uint32_t kMotionProfileAcceleration = 1;
constexpr int16_t kMotionGoalPwmLimit = 150;
constexpr int16_t kMotionAbortCurrentMa = 350;
constexpr uint8_t kMotionAbortTemperatureC = 45;
constexpr uint16_t kMotionMinVoltageDecivolt = 45;
constexpr uint16_t kMotionMaxVoltageDecivolt = 56;
constexpr uint8_t kMotionBusWatchdog20Ms = 50;

static_assert(!(DXL2_PROVISION_ID_ENABLE && DXL2_MOTION_TEST_ENABLE),
              "ID provisioning and motion test must not be enabled together");

#if DXL2_PROVISION_ID_ENABLE
static_assert(DXL2_PROVISION_SOURCE_ID <= 252, "DYNAMIXEL source ID must be 0..252");
static_assert(DXL2_PROVISION_TARGET_ID <= 252, "DYNAMIXEL target ID must be 0..252");
static_assert(DXL2_PROVISION_SOURCE_ID != DXL2_PROVISION_TARGET_ID,
              "DYNAMIXEL source and target IDs must differ");
#endif

}  // namespace dxl2_probe
}  // namespace haptics
