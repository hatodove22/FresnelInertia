#pragma once

#include <ArduinoJson.h>
#include "haptics/Types.hpp"

namespace haptics {

// Optional state from the production model, not a second particle simulation.
// The pressure values describe the demo effect, not measured physical pressure.
inline void appendDemoTelemetryJson(JsonObject mass, const MassState& state) {
  if (!state.granular_pile_active && !state.pressure.enabled) return;
  JsonObject demo = mass.createNestedObject("demo");
  demo["pile_slope"] = state.pile_slope;
  demo["granular_flow"] = state.granular_flow;
  demo["granular_pile_active"] = state.granular_pile_active;
  JsonObject pressure = demo.createNestedObject("pressure");
  pressure["enabled"] = state.pressure.enabled;
  pressure["phase"] = state.pressure.phase == PressurePhase::Burst ? "burst" :
                      state.pressure.phase == PressurePhase::Spent ? "spent" : "sealed";
  pressure["charge"] = state.pressure.charge;
  pressure["phase_s"] = state.pressure.phase_s;
  pressure["remaining"] = state.pressure.remaining;
  pressure["burst_sequence"] = state.pressure.burst_sequence;
}

}  // namespace haptics
