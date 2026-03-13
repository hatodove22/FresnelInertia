#pragma once

#include "haptics/Parameters.hpp"
#include "haptics/Types.hpp"

namespace haptics {

class ResonanceLayer {
 public:
  void configure(const SystemParams& params);
  ResonanceFrame<kMaxResonanceVoicesPerFrame> update(const TextureFrame<kMaxTexturesPerFrame>& textures);

 private:
  void pushVoice(ResonanceFrame<kMaxResonanceVoicesPerFrame>& frame, const ResonanceVoice& voice);
  SystemParams params_{};
};

}  // namespace haptics
