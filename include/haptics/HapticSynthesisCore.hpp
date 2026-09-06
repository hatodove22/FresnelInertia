#pragma once

#include "haptics/EventLayer.hpp"
#include "haptics/MassMotionLayer.hpp"
#include "haptics/MotionActivityFilter.hpp"
#include "haptics/ResonanceLayer.hpp"
#include "haptics/SpatialRenderer4.hpp"
#include "haptics/TextureLayer.hpp"
#include "haptics/TiltPseudoForceModel.hpp"

namespace haptics {

// This is synthesis intent, never actuator authority. The runtime still owns
// arming, stale-sensor deadlines, faults, transport submission and Stop.
enum class SynthesisTiltAction : uint8_t {
  Disabled = 0,
  Submit,
  Hold,
  FaultNeutral,
};

struct SynthesisContext {
  bool outputs_allowed = true;
  bool tilt_allowed = false;
  // Local diagnostics may supply their own bounded tilt command after a Submit
  // result. Leave the normal model unadvanced during that existing override.
  bool use_tilt_model = true;
};

struct SynthesisFrame {
  bool accepted = false;
  MassState mass{};
  HapticEvent last_event{};
  SpatialFrame4 spatial{};
  TiltPlaneCommand tilt{};  // meaningful for Submit with use_tilt_model=true
  SynthesisTiltAction tilt_action = SynthesisTiltAction::Disabled;
  PipelineDebugStatus debug{};
};

// Hardware-free composition of Mass -> Event -> Texture -> Resonance ->
// Spatial4, with tilt computed from the same MassState. No clocks, allocation,
// sensor acquisition, telemetry transport, storage or actuator access.
class HapticSynthesisCore {
 public:
  // Reconfigure the existing layers. As before, this clears motion/events/
  // texture/spatial state but preserves the tilt filter's history.
  void configure(const SystemParams& params);
  void reset(const SystemParams& params);  // also clear tilt history
  void resetTilt();
  // Calibration refreshes only the output stages, preserving content motion.
  void configureOutput(const SystemParams& params);

  // params is the caller's applied configuration, also used on discontinuity
  // resets. Call configure/reset after changing layer settings. Runtime feature
  // gates are read on every frame, including changes that do not reconfigure.
  // sample is finite/validated and already in the desired model/body frame;
  // valid=false means a missing sample. Nonpositive/nonfinite dt rejects the
  // entire frame without advancing state. dt is elapsed time, not preclamped.
  SynthesisFrame step(const SystemParams& params, const ImuSample& sample,
                      float dt_s, const SynthesisContext& context = {});

  float maxStableStepS() const { return mass_layer_.maxStableStepS(); }
  static MassState defaultMassState(const SystemParams& params);

 private:
  MotionActivityFilter motion_activity_filter_{};
  MassMotionLayer mass_layer_{};
  EventLayer event_layer_{};
  TextureLayer texture_layer_{};
  ResonanceLayer resonance_layer_{};
  SpatialRenderer4 spatial_renderer_{};
  TiltPseudoForceModel tilt_model_{};
};

}  // namespace haptics
