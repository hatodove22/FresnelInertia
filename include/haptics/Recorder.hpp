#pragma once

#include <FS.h>

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class Recorder {
 public:
  bool begin(const SystemParams& params);
  void configure(const SystemParams& params);
  void append(const TelemetrySnapshot& snapshot);
  bool startRecording(uint32_t now_ms, const char* requested_file = nullptr);
  void stopRecording();
  bool startReplay(const char* requested_file, uint32_t now_ms);
  void stopReplay();
  bool pollReplay(uint32_t now_ms, ImuSample& sample, float& dt_s);
  const RecorderStatus& status() const { return status_; }
  bool isEnabled() const { return status_.enabled; }

 private:
  bool mountFilesystem();
  bool loadNextReplaySample();
  bool openRecordFile();
  void flushRecordFile();
  void closeRecordFile();
  void updateStatusPath(const char* path);

  SystemParams params_{};
  RecorderStatus status_{};
  uint32_t replay_start_ms_ = 0;
  uint32_t first_replay_timestamp_ms_ = 0;
  uint32_t next_replay_timestamp_ms_ = 0;
  uint32_t last_replay_timestamp_ms_ = 0;
  ImuSample next_replay_sample_{};
  File record_file_{};
  uint16_t pending_flush_frames_ = 0;
  bool replay_sample_ready_ = false;
  bool mounted_ = false;
};

}  // namespace haptics
