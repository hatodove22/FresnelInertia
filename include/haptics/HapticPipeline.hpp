#pragma once

#include <array>

#include "haptics/AudioOutput4Ch.hpp"
#include "haptics/EventLayer.hpp"
#include "haptics/ImuSampler.hpp"
#include "haptics/MassMotionLayer.hpp"
#include "haptics/Parameters.hpp"
#include "haptics/PresetStore.hpp"
#include "haptics/Recorder.hpp"
#include "haptics/RemoteInterface.hpp"
#include "haptics/ResonanceLayer.hpp"
#include "haptics/RuntimeCalibrator.hpp"
#include "haptics/SpatialRenderer4.hpp"
#include "haptics/TextureLayer.hpp"
#include "haptics/TiltPseudoForceModel.hpp"
#include "haptics/TiltPlaneServoInterface.hpp"

namespace haptics {

class HapticPipeline {
 public:
  bool begin(const SystemParams& params);
  void tick();
  void processSample(const ImuSample& sample, float dt_s);
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
    std::array<float, 4> low_carrier_hz{};
    std::array<float, 4> high_carrier_hz{};
  };

  void applyPreset(MaterialFamily family);
  bool loadPresetByName(const char* preset_name);
  RuntimeConfigSnapshot captureRuntimeConfig() const;
  void restoreRuntimeConfig(SystemParams& params, const RuntimeConfigSnapshot& snapshot) const;
  void commitPresetParams(SystemParams next_params, const RuntimeConfigSnapshot& snapshot);
  TiltPlaneCommand updateTiltCommand(const ImuSample& sample, const MassState& state, float dt_s);
  MassState makeDefaultMassState() const;
  void reconfigurePipeline();
  void refreshOutputConfig();
  ActuatorFrame4 summarizeDriveFrame(const DriveFrame4& frame) const;
  RunMode currentRunMode() const;
  bool applyControlMessage(const ControlMessage& message);
  bool applyParamPath(const char* path, const ControlValue& value);

  SystemParams params_{};
  ImuSampler imu_{};
  MassMotionLayer mass_layer_{};
  EventLayer event_layer_{};
  TextureLayer texture_layer_{};
  ResonanceLayer resonance_layer_{};
  RuntimeCalibrator calibrator_{};
  SpatialRenderer4 spatial_renderer_{};
  AudioOutput4Ch audio_{};
  TiltPseudoForceModel tilt_model_{};
  TiltPlaneServoInterface tilt_{};
  RemoteInterface remote_{};
  Recorder recorder_{};
  PresetStore preset_store_{};

  TelemetrySnapshot telemetry_{};
  uint32_t last_tick_us_ = 0;
  uint32_t last_print_ms_ = 0;
  MaterialFamily current_family_ = MaterialFamily::Liquid;
  RunMode requested_run_mode_ = RunMode::Live;
};

}  // namespace haptics
