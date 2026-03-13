#pragma once

#include "haptics/Parameters.hpp"

namespace haptics {

struct PresetEntry {
  char name[32]{};
  MaterialFamily family = MaterialFamily::Custom;
  bool from_filesystem = false;
};

template <std::size_t N>
struct PresetList {
  std::array<PresetEntry, N> items{};
  std::size_t count = 0;
};

class PresetStore {
 public:
  bool begin();
  PresetList<16> listPresets() const;
  bool loadPreset(const char* name, SystemParams& params) const;

 private:
  bool loadBuiltin(const char* name, SystemParams& params) const;
  bool applyFilesystemOverride(const char* name, SystemParams& params) const;
  bool mountFilesystem() const;

  mutable bool mounted_ = false;
};

}  // namespace haptics
