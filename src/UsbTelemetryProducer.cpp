#include "haptics/UsbTelemetryProducer.hpp"

#include <Arduino.h>

#include <algorithm>
#include <cstdio>

#if HAPTICS_ENABLE_USB_TELEMETRY
#include <ArduinoJson.h>
#endif

namespace haptics {
namespace {

#if HAPTICS_ENABLE_USB_TELEMETRY
const char* runModeToString(RunMode mode) {
  switch (mode) {
    case RunMode::Idle:
      return "idle";
    case RunMode::Live:
      return "live";
    case RunMode::Calibration:
      return "calibration";
    case RunMode::Record:
      return "record";
    case RunMode::Replay:
      return "replay";
    default:
      return "idle";
  }
}

const char* wallToString(WallId wall) {
  switch (wall) {
    case WallId::Front:
      return "Front";
    case WallId::Back:
      return "Back";
    case WallId::Top:
      return "Top";
    case WallId::Bottom:
      return "Bottom";
    case WallId::None:
    default:
      return "None";
  }
}

const char* eventTypeToString(EventType type) {
  switch (type) {
    case EventType::WallHit:
      return "WallHit";
    case EventType::RollTrain:
      return "RollTrain";
    case EventType::ImpactCluster:
      return "ImpactCluster";
    case EventType::DropletCluster:
      return "DropletCluster";
    case EventType::RoofSlap:
      return "RoofSlap";
    case EventType::Scrape:
      return "Scrape";
    case EventType::None:
    default:
      return "None";
  }
}

const char* audioTransportToString(AudioTransport transport) {
  return transport == AudioTransport::Tdm8Slot ? "tdm8_slot" : "dual_i2s";
}

const char* audioLayoutToString(AudioOutputLayout layout) {
  return layout == AudioOutputLayout::FrontBack2Ch ? "front_back_2ch"
                                                   : "quad_wall_4ch";
}
#endif

}  // namespace

bool UsbTelemetryProducer::begin(const SystemParams& params) {
  status_ = {};
  status_.compile_enabled = HAPTICS_ENABLE_USB_TELEMETRY != 0;
  clearPending();
  configure(params);

  // Runtime telemetry is deliberately never inherited from boot params. Only
  // the explicit local console command may transition this state to true.
  status_.runtime_enabled = false;
  last_emit_ms_ = millis();
  return true;
}

void UsbTelemetryProducer::configure(const SystemParams& params) {
  status_.period_ms = static_cast<uint16_t>(std::max<uint32_t>(
      kMinPeriodMs,
      std::min<uint32_t>(params.iface.telemetry_period_ms, kMaxPeriodMs)));

  // Reconfiguration may preserve a locally armed stream, or disarm it. It may
  // not arm one based only on a loaded preset/control parameter.
  if (!params.features.enable_usb_telemetry) {
    setRuntimeEnabled(false);
  }
}

bool UsbTelemetryProducer::setRuntimeEnabled(bool enabled) {
  if (enabled && !status_.compile_enabled) {
    return false;
  }
  if (status_.runtime_enabled == enabled) {
    return true;
  }

  status_.runtime_enabled = enabled;
  last_emit_ms_ = millis();
  if (!enabled) {
    clearPending();
  }
  return true;
}

void UsbTelemetryProducer::clearPending() {
  pending_length_ = 0;
  pending_offset_ = 0;
  refreshPendingStatus();
}

void UsbTelemetryProducer::refreshPendingStatus() {
  const std::size_t remaining = pending_length_ > pending_offset_
                                    ? pending_length_ - pending_offset_
                                    : 0;
  status_.pending_bytes = static_cast<uint16_t>(
      std::min<std::size_t>(remaining, UINT16_MAX));
}

bool UsbTelemetryProducer::queueSnapshot(const TelemetrySnapshot& snapshot) {
#if HAPTICS_ENABLE_USB_TELEMETRY
  StaticJsonDocument<2048> doc;
  doc["timestamp_ms"] = snapshot.timestamp_ms;
  doc["frame_counter"] = snapshot.frame_counter;
  doc["new_evt"] = snapshot.new_evt;
  doc["evt_total"] = snapshot.evt_total;
  doc["preset"] = snapshot.active_preset;
  doc["run_mode"] = runModeToString(snapshot.run_mode);

  JsonObject imu = doc.createNestedObject("imu");
  imu["valid"] = snapshot.imu.valid;
  JsonArray accel = imu.createNestedArray("accel_g");
  accel.add(snapshot.imu.accel_g.x);
  accel.add(snapshot.imu.accel_g.y);
  accel.add(snapshot.imu.accel_g.z);
  JsonArray gyro = imu.createNestedArray("gyro_dps");
  gyro.add(snapshot.imu.gyro_dps.x);
  gyro.add(snapshot.imu.gyro_dps.y);
  gyro.add(snapshot.imu.gyro_dps.z);

  JsonObject mass = doc.createNestedObject("mass");
  JsonArray pos = mass.createNestedArray("pos_norm");
  pos.add(snapshot.mass.pos_norm.x);
  pos.add(snapshot.mass.pos_norm.y);
  JsonArray vel = mass.createNestedArray("vel_norm_s");
  vel.add(snapshot.mass.vel_norm_s.x);
  vel.add(snapshot.mass.vel_norm_s.y);
  mass["energy"] = snapshot.mass.energy;
  mass["fill"] = snapshot.mass.fill;

  JsonObject last_event = doc.createNestedObject("last_event");
  last_event["type"] = eventTypeToString(snapshot.last_event.type);
  last_event["primary_wall"] = wallToString(snapshot.last_event.primary_wall);
  last_event["amplitude"] = snapshot.last_event.amplitude;

  JsonArray actuators = doc.createNestedArray("actuators");
  for (float channel : snapshot.actuators.ch) {
    actuators.add(channel);
  }

  JsonObject audio = doc.createNestedObject("audio");
  audio["compile_enabled"] = snapshot.audio.compile_enabled;
  audio["driver_installed"] = snapshot.audio.driver_installed;
  audio["runtime_enabled"] = snapshot.audio.runtime_enabled;
  audio["output_silenced"] = snapshot.audio.output_silenced;
  audio["test_mode"] = snapshot.audio.test_mode;
  audio["demo_compat_mode"] = snapshot.audio.demo_compat_mode;
  audio["transport"] = audioTransportToString(snapshot.audio.transport);
  audio["output_layout"] = audioLayoutToString(snapshot.audio.output_layout);
  audio["active_output_channels"] = snapshot.audio.active_output_channels;
  audio["test_wall"] = wallToString(snapshot.audio.test_wall);
  audio["output_peak_limit"] = snapshot.audio.output_peak_limit;
  audio["underrun_count"] = snapshot.audio.underrun_count;

  JsonObject safety = doc.createNestedObject("safety");
  safety["imu_stale_safe_stop"] = snapshot.safety.imu_stale_safe_stop;
  safety["imu_fault_injection_active"] =
      snapshot.safety.imu_fault_injection_active;
  safety["audio_zero_asserted"] = snapshot.safety.audio_zero_asserted;
  safety["tilt_disarmed"] = snapshot.safety.tilt_disarmed;

  if (doc.overflowed()) {
    ++status_.serialization_errors;
    return false;
  }

  const std::size_t serialized =
      serializeJson(doc, pending_, kPayloadCapacity - 1);
  if (serialized == 0 || serialized + 1 >= kPayloadCapacity) {
    ++status_.serialization_errors;
    clearPending();
    return false;
  }

  pending_[serialized] = '\n';
  pending_length_ = serialized + 1;
  pending_offset_ = 0;
  refreshPendingStatus();
  return true;
#else
  (void)snapshot;
  return false;
#endif
}

void UsbTelemetryProducer::publish(const TelemetrySnapshot& snapshot) {
#if HAPTICS_ENABLE_USB_TELEMETRY
  if (!status_.runtime_enabled) {
    return;
  }

  const uint32_t now_ms = millis();
  if (now_ms - last_emit_ms_ < status_.period_ms) {
    return;
  }
  last_emit_ms_ = now_ms;

  if (pending_length_ != 0) {
    ++status_.dropped_frames;
    ++status_.backpressure_dropped_frames;
    return;
  }
  queueSnapshot(snapshot);
#else
  (void)snapshot;
#endif
}

void UsbTelemetryProducer::update() {
#if HAPTICS_ENABLE_USB_TELEMETRY
  if (pending_length_ == 0) {
    return;
  }

  const int available = Serial.availableForWrite();
  if (available <= 0) {
    return;
  }

  constexpr std::size_t kMaxBytesPerUpdate = 256;
  const std::size_t remaining = pending_length_ - pending_offset_;
  const std::size_t requested = std::min<std::size_t>(
      remaining,
      std::min<std::size_t>(static_cast<std::size_t>(available),
                            kMaxBytesPerUpdate));
  const std::size_t written = Serial.write(
      reinterpret_cast<const uint8_t*>(pending_ + pending_offset_), requested);
  pending_offset_ += std::min(written, remaining);

  if (pending_offset_ >= pending_length_) {
    ++status_.transmitted_frames;
    clearPending();
  } else {
    refreshPendingStatus();
  }
#endif
}

void UsbTelemetryProducer::prepareForConsoleOutput() {
#if HAPTICS_ENABLE_USB_TELEMETRY
  if (pending_length_ == 0) {
    return;
  }
  if (pending_offset_ > 0) {
    const bool terminated =
        Serial.availableForWrite() > 0 &&
        Serial.write(static_cast<uint8_t>('\n')) == 1U;
    if (!terminated) {
      ++status_.unterminated_partial_frames;
    }
  }
  ++status_.dropped_frames;
  ++status_.console_interrupted_frames;
  clearPending();
#endif
}

void UsbTelemetryProducer::describeStatus(char* out, std::size_t size) const {
  if (out == nullptr || size == 0) {
    return;
  }
  std::snprintf(
      out,
      size,
      "usb_telemetry: compile=%u runtime=%u period_ms=%u pending=%u tx=%lu dropped=%lu backpressure=%lu console_interrupt=%lu unterminated=%lu errors=%lu",
      static_cast<unsigned>(status_.compile_enabled),
      static_cast<unsigned>(status_.runtime_enabled),
      static_cast<unsigned>(status_.period_ms),
      static_cast<unsigned>(status_.pending_bytes),
      static_cast<unsigned long>(status_.transmitted_frames),
      static_cast<unsigned long>(status_.dropped_frames),
      static_cast<unsigned long>(status_.backpressure_dropped_frames),
      static_cast<unsigned long>(status_.console_interrupted_frames),
      static_cast<unsigned long>(status_.unterminated_partial_frames),
      static_cast<unsigned long>(status_.serialization_errors));
}

}  // namespace haptics
