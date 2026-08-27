#pragma once

#include "haptics/Types.hpp"

namespace haptics {

// A fresh valid sample may refresh the stale deadline, but it must never
// release a stop that was already asserted. At runtime only
// HapticPipeline::enterSafeIdle() supplies a cleared current state, after it
// has silenced and disarmed every physical output.
constexpr bool imuStaleSafeStopNextState(
    bool currently_asserted,
    bool safety_enabled,
    bool stale_deadline_elapsed) {
  return currently_asserted || (safety_enabled && stale_deadline_elapsed);
}

// Releasing diagnostic injection while Live output is still armed would
// restore valid samples without performing the required atomic output disarm.
constexpr bool imuFaultClearRequiresSafeIdle(
    bool imu_stale_safe_stop_asserted) {
  return imu_stale_safe_stop_asserted;
}

// The stale-stop feature may not be disabled after fault injection starts:
// doing so inside the 300 ms detection window would prevent the stop from ever
// asserting while audio remains armed.
constexpr bool imuStaleSafetyDisableRequiresSafeIdle(
    bool imu_stale_safe_stop_asserted,
    bool imu_fault_injection_active) {
  return imu_stale_safe_stop_asserted || imu_fault_injection_active;
}

// Injection must keep polling the physical IMU, and an asserted stale-stop
// must not be cleared by switching to replay/calibration/record. Only
// remaining Live or entering Safe Idle is permitted while either interlock is
// active.
constexpr bool imuSafetyInterlockAllowsRunMode(
    bool imu_stale_safe_stop_asserted,
    bool imu_fault_injection_active,
    RunMode requested_mode) {
  return (!imu_stale_safe_stop_asserted && !imu_fault_injection_active) ||
         requested_mode == RunMode::Live || requested_mode == RunMode::Idle;
}

constexpr bool imuSafetyInterlockAllowsPhysicalArm(
    bool imu_stale_safe_stop_asserted,
    bool imu_fault_injection_active) {
  return !imu_stale_safe_stop_asserted && !imu_fault_injection_active;
}

// Command validation may accept an Idle request because its caller invokes
// enterSafeIdle(). The tick-level defense has a different job: any observed
// non-Live state while an interlock is still asserted proves that atomic Safe
// Idle cleanup has not completed, including an Idle enum set by a future
// unguarded caller.
constexpr bool imuSafetyInterlockRequiresTickSafeIdle(
    bool imu_stale_safe_stop_asserted,
    bool imu_fault_injection_active,
    RunMode current_mode) {
  return (imu_stale_safe_stop_asserted || imu_fault_injection_active) &&
         current_mode != RunMode::Live;
}

constexpr bool replayCompletionRequiresSafeIdle(
    bool was_replaying,
    bool is_still_replaying) {
  return was_replaying && !is_still_replaying;
}

}  // namespace haptics
