#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace haptics {

enum class MaterialFamily : uint8_t {
  Liquid = 0,
  Granular = 1,
  Hybrid = 2,
  Detented = 3,
  Custom = 4,
};

enum class EventType : uint8_t {
  None = 0,
  WallHit,
  RollTrain,
  ImpactCluster,
  DropletCluster,
  RoofSlap,
  Scrape,
};

enum class TextureAtomKind : uint8_t {
  None = 0,
  HardPing,
  KnockPing,
  DetentClick,
  WetBurst,
  DryRattle,
  ScrapeNoise,
  FlowRipple,
};

enum class WallId : uint8_t {
  Front = 0,
  Back = 1,
  Top = 2,
  Bottom = 3,
  None = 255,
};

enum class CalibrationBand : uint8_t {
  None = 0,
  Low = 1,
  High = 2,
};

enum class CalibrationStage : uint8_t {
  Idle = 0,
  Settling = 1,
  Measuring = 2,
  Complete = 3,
  Aborted = 4,
};

enum class AudioOutputLayout : uint8_t {
  QuadWall4Ch = 0,
  FrontBack2Ch = 1,
};

enum class AudioTransport : uint8_t {
  DualI2s = 0,
  Tdm8Slot = 1,
};

enum class RunMode : uint8_t {
  Idle = 0,
  Live = 1,
  Calibration = 2,
  Record = 3,
  Replay = 4,
};

enum class ControlMessageType : uint8_t {
  None = 0,
  SetParam,
  LoadPreset,
  SetRunMode,
  StartCalibration,
  StopCalibration,
  RequestTelemetry,
  SetTiltMode,
  RecordStart,
  RecordStop,
  ReplayStart,
  ReplayStop,
};

struct Vec2f {
  float x = 0.0f;
  float y = 0.0f;
};

struct Vec3f {
  float x = 0.0f;
  float y = 0.0f;
  float z = 0.0f;
};

struct ImuSample {
  uint32_t timestamp_us = 0;
  Vec3f accel_g{};
  Vec3f gyro_dps{};
  bool valid = false;
};

struct MassState {
  Vec2f pos_norm{};      // normalized container coordinates [-1, 1]
  Vec2f vel_norm_s{};    // normalized velocity [1/s]
  // Front(+x), Back(-x), Top(+y), Bottom(-y). Impacts are positive
  // pre-bounce approach speeds and cleared at every integration substep.
  std::array<float, 4> wall_impact_speed_norm_s{};
  std::array<float, 4> wall_contact{};  // final contact/proximity in [0, 1]
  float energy = 0.0f;   // latent activity state [0, 1]
  float fill = 0.5f;
  float headspace = 0.5f;
  float container_x_m = 0.06f;
  float container_y_m = 0.06f;
  float container_z_m = 0.06f;
  MaterialFamily family = MaterialFamily::Liquid;
};

struct HapticEvent {
  EventType type = EventType::None;
  WallId primary_wall = WallId::None;
  Vec2f direction{};
  float amplitude = 0.0f;
  float duration_ms = 0.0f;
  float density_hz = 0.0f;
  bool clustered = false;
};

template <std::size_t N>
struct EventFrame {
  std::array<HapticEvent, N> items{};
  std::size_t count = 0;
};

struct TextureCommand {
  TextureAtomKind atom = TextureAtomKind::None;
  EventType source = EventType::None;
  WallId primary_wall = WallId::None;
  Vec2f direction{};
  float low_env = 0.0f;
  float high_env = 0.0f;
  float noise_env = 0.0f;
  float amplitude = 0.0f;
  float duration_ms = 0.0f;
  float density_hz = 0.0f;
  float apparent_motion_soa_ms = 0.0f;
  bool distribute_to_neighbors = false;
  bool attack_frame = false;
};

template <std::size_t N>
struct TextureFrame {
  std::array<TextureCommand, N> items{};
  std::size_t count = 0;
};

struct ResonanceVoice {
  TextureAtomKind atom = TextureAtomKind::None;
  EventType source = EventType::None;
  WallId primary_wall = WallId::None;
  Vec2f direction{};
  float low_env = 0.0f;
  float high_env = 0.0f;
  float noise_env = 0.0f;
  float apparent_motion_soa_ms = 0.0f;
  float duration_ms = 0.0f;
  float density_hz = 0.0f;
  bool distribute_to_neighbors = false;
  bool attack_frame = false;
};

template <std::size_t N>
struct ResonanceFrame {
  std::array<ResonanceVoice, N> items{};
  std::size_t count = 0;
};

struct DriveFrame4 {
  std::array<float, 4> low{};
  std::array<float, 4> high{};
  std::array<float, 4> noise{};
};

struct ActuatorFrame4 {
  std::array<float, 4> ch{};
};

struct SpatialFrame4 {
  DriveFrame4 drive{};
  ActuatorFrame4 summary{};
};

struct TiltPlaneCommand {
  float thumb_angle_deg = 0.0f;
  float index_angle_deg = 0.0f;
  float thumb_current_limit_ma = 0.0f;
  float index_current_limit_ma = 0.0f;
  float thumb_base_deg = 0.0f;
  float index_base_deg = 0.0f;
  float thumb_delta_deg = 0.0f;
  float index_delta_deg = 0.0f;
  float common_force_n = 0.0f;
  float differential_torque_nm = 0.0f;
  float cg_x_m = 0.0f;
  float cg_y_m = 0.0f;
  float apparent_mass_kg = 0.0f;
  bool pseudoforce_enabled = false;
};

enum class TiltServoState : uint8_t {
  Disabled = 0,
  Checking = 1,
  ReadyTorqueOff = 2,
  Arming = 3,
  Armed = 4,
  FaultLatched = 5,
};

enum class TiltServoFault : uint8_t {
  None = 0,
  Configuration = 1,
  Communication = 2,
  Identity = 3,
  OperatingMode = 4,
  TorqueState = 5,
  PositionRange = 6,
  OverCurrent = 7,
  OverTemperature = 8,
  SupplyVoltage = 9,
  HardwareError = 10,
  CommandTimeout = 11,
  ImuSafety = 12,
};

struct TiltServoDeviceStatus {
  uint8_t id = 0;
  bool status_valid = false;
  bool torque_enabled = false;
  uint16_t model_number = 0;
  uint8_t operating_mode = 0;
  uint8_t hardware_error = 0;
    int32_t home_position_raw = 0;
    int32_t present_position_raw = 0;
    // Goal Position read back from the servo control table. Keep the locally
    // bounded command separate so telemetry cannot mistake intent for device
    // state.
    int32_t goal_position_raw = 0;
    int32_t commanded_position_raw = 0;
    int16_t present_pwm_raw = 0;
    int16_t present_current_ma = 0;
  uint16_t input_voltage_decivolt = 0;
  uint8_t temperature_c = 0;
};

struct TiltServoStatus {
  bool compile_enabled = false;
  bool atoms3_dxl2_backend = false;
  bool runtime_requested = false;
  TiltServoState state = TiltServoState::Disabled;
  TiltServoFault fault = TiltServoFault::None;
  uint32_t communication_errors = 0;
  uint32_t command_age_ms = 0;
  uint32_t status_age_ms = 0;
  std::array<TiltServoDeviceStatus, 2> devices{};
};

struct RecorderStatus {
  bool enabled = false;
  bool recording = false;
  bool replaying = false;
  uint32_t recorded_frames = 0;
  uint32_t replay_index = 0;
  char active_file[64]{};
};

struct RemoteStatus {
  bool compile_enabled = false;
  bool runtime_enabled = false;
  uint16_t connected_clients = 0;
  uint32_t received_messages = 0;
  uint32_t transmitted_messages = 0;
};

struct ControlValue {
  bool has_number = false;
  bool has_bool = false;
  bool has_text = false;
  float number = 0.0f;
  bool boolean = false;
  char text[64]{};
};

struct ControlMessage {
  ControlMessageType type = ControlMessageType::None;
  uint32_t timestamp_ms = 0;
  RunMode run_mode = RunMode::Live;
  bool tilt_enable = false;
  char preset[32]{};
  char path[64]{};
  char argument[64]{};
  ControlValue value{};
  bool valid = false;
};

struct AudioBackendStatus {
  bool compile_enabled = false;
  bool driver_installed = false;
  bool runtime_enabled = false;
  bool output_silenced = true;
  bool test_mode = false;
  bool demo_compat_mode = false;
  AudioTransport transport = AudioTransport::DualI2s;
  AudioOutputLayout output_layout = AudioOutputLayout::QuadWall4Ch;
  uint8_t active_output_channels = 4;
  WallId test_wall = WallId::None;
  float output_peak_limit = 1.0f;
  uint32_t underrun_count = 0;
};

struct SafetyStatus {
  bool imu_stale_safe_stop = false;
  bool imu_fault_injection_active = false;
  bool audio_zero_asserted = true;
  bool tilt_disarmed = true;
};

struct RuntimeCalibrationStatus {
  bool active = false;
  bool finished = false;
  bool aborted = false;
  WallId wall = WallId::None;
  CalibrationBand band = CalibrationBand::None;
  CalibrationStage stage = CalibrationStage::Idle;
  uint32_t completed_steps = 0;
  uint32_t total_steps = 0;
  float candidate_hz = 0.0f;
  float best_hz = 0.0f;
  float candidate_score = 0.0f;
  float best_score = 0.0f;
  float progress = 0.0f;
  bool loaded_from_storage = false;
};

struct PipelineDebugStatus {
  uint16_t event_count = 0;
  uint16_t texture_count = 0;
  uint16_t resonance_count = 0;
  bool mass_enabled = false;
  bool event_enabled = false;
  bool texture_enabled = false;
  bool resonance_enabled = false;
  bool spatial_enabled = false;
  bool imu_stale_safe_stop = false;
};

struct TelemetrySnapshot {
  uint32_t timestamp_ms = 0;
  uint64_t frame_counter = 0;
  uint16_t new_evt = 0;
  uint64_t evt_total = 0;
  char active_preset[32]{};
  RunMode run_mode = RunMode::Idle;
  ImuSample imu{};
  MassState mass{};
  HapticEvent last_event{};
  ActuatorFrame4 actuators{};
  TiltPlaneCommand tilt{};
  TiltServoStatus tilt_servo{};
  AudioBackendStatus audio{};
  SafetyStatus safety{};
  RuntimeCalibrationStatus calibration{};
  RecorderStatus recorder{};
  RemoteStatus remote{};
  PipelineDebugStatus pipeline_debug{};
};

// JSON numbers are exactly integral only through Number.MAX_SAFE_INTEGER.
// Keep boot-lifetime counters portable to JavaScript telemetry tools.
constexpr uint64_t kTelemetryJsonSafeIntegerMax = 9007199254740991ULL;

constexpr std::size_t kMaxEventsPerFrame = 16;
constexpr std::size_t kMaxTexturesPerFrame = 16;
constexpr std::size_t kMaxResonanceVoicesPerFrame = 16;

}  // namespace haptics
