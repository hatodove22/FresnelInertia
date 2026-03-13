#pragma once

#include "haptics/Types.hpp"

namespace haptics {

class ImuSampler {
 public:
  bool begin();
  ImuSample poll();
};

}  // namespace haptics
