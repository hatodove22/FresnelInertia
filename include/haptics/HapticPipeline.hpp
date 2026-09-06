#pragma once

#include <array>

#include "haptics/AudioOutput4Ch.hpp"
#include "haptics/DeviceFrameTransform.hpp"
#include "haptics/EspNowTelemetryProducer.hpp"
#include "haptics/HapticSynthesisCore.hpp"
#include "haptics/ImuSampler.hpp"
#include "haptics/Parameters.hpp"
#include "haptics/PresetStore.hpp"
#include "haptics/Recorder.hpp"
#include "haptics/RemoteInterface.hpp"
#include "haptics/RuntimeSafetyPolicy.hpp"
#include "haptics/RuntimeCalibrator.hpp"
#include "haptics/TiltPlaneServoInterface.hpp"
#include "haptics/UsbTelemetryProducer.hpp"

#ifndef HAPTICS_ENABLE_IMU_FAULT_INJECTION
#define HAPTICS_ENABLE_IMU_FAULT_INJECTION 0
#endif

namespace haptics {

class HapticPipeline {
 public:
  bool begin(const SystemParams& params);
  void tick();
  void processSample(const ImuSample& sample, float dt_s);
  void enterSafeIdle();
  void cyclePreset();
  void toggleVerbose();
  void cycleAudioTestMode();
  void toggleAudioRuntimeEnable();
  bool startRuntimeCalibration();
  void stopRuntimeCalibration(bool keep_results = false);
  void handleConsoleCommand(const char* command);
  const TelemetrySnapshot& telemetry() const { return telemetry_; }
  const SystemParams& params() const { return params_; }

 private:
  struct RuntimeConfigSnapshot {
    FeatureFlags features{};
    PlatformPins pins{};
    AudioBackendParams audio{};
    TiltPlaneParams tilt{};
    InterfaceParams iface{};
    RecorderParams recorder{};
    MotionActivityFilterParams motion_activity{};
    std::array<float, 4> low_carrier_hz{};
    std::array<float, 4> high_carrier_hz{};
  };

  void applyPreset(MaterialFamily family);
  bool loadPresetByName(const char* preset_name);
  RuntimeConfigSnapshot captureRuntimeConfig() const;
  void restoreRuntimeConfig(SystemParams& params, const RuntimeConfigSnapshot& snapshot) const;
  void commitPresetParams(SystemParams next_params, const RuntimeConfigSnapshot& snapshot);
  TiltPlaneCommand manualTiltCommand() const;
  bool reconfigurePipeline();
  void refreshOutputConfig();
  void resetDynamicPipelineState();
  bool applyAudioConfigOrRollback(const SystemParams& previous_params);
  ActuatorFrame4 summarizeDriveFrame(const DriveFrame4& frame) const;
  RunMode currentRunMode() const;
  bool applyControlMessage(const ControlMessage& message);
  bool applyParamPath(const char* path, const ControlValue& value);
  bool setAudioRuntimeEnabled(bool enabled);
  void processEspNowControlRequests();

  SystemParams params_{};
  ImuSampler imu_{};
  HapticSynthesisCore synthesis_{};
  RuntimeCalibrator calibrator_{};
  AudioOutput4Ch audio_{};
  TiltPlaneServoInterface tilt_{};
  RemoteInterface remote_{};
  UsbTelemetryProducer usb_telemetry_{};
  EspNowTelemetryProducer espnow_telemetry_{};
  Recorder recorder_{};
  PresetStore preset_store_{};

  TelemetrySnapshot telemetry_{};
  uint32_t last_tick_us_ = 0;
  uint32_t last_valid_imu_ms_ = 0;
  uint32_t last_print_ms_ = 0;
  bool imu_stale_safe_stop_ = false;
  bool imu_fault_injection_active_ = false;
  // Runtime-only hardware diagnostic. It is reachable only through the local
  // console while the compile-gated servo backend is explicitly armed.
  bool tilt_manual_test_active_ = false;
  bool tilt_manual_test_common_mode_ = false;
  float tilt_manual_test_angle_deg_ = 0.0f;
  MaterialFamily current_family_ = MaterialFamily::Liquid;
  RunMode requested_run_mode_ = RunMode::Live;
};

}  // namespace haptics
