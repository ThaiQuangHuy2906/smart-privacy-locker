#pragma once

#include <stdint.h>

#include "device_state.h"

struct DoorTransition {
  DoorState previous = DoorState::UNKNOWN;
  DoorState current = DoorState::UNKNOWN;
  bool initialStableSample = false;
};

// Platform-neutral stable-state debounce. The caller owns GPIO reads so this
// class can be covered by the native test environment without Arduino mocks.
class DoorSensor {
 public:
  DoorSensor(uint32_t debounceMs, bool closedLevelHigh);

  void reset();
  bool sample(bool electricalHigh, uint32_t nowMs, DoorTransition* transition);
  DoorState stableState() const;
  bool hasStableState() const;

 private:
  DoorState mapLevel(bool electricalHigh) const;

  uint32_t debounceMs_;
  bool closedLevelHigh_;
  bool candidateValid_ = false;
  DoorState candidate_ = DoorState::UNKNOWN;
  uint32_t candidateSinceMs_ = 0;
  DoorState stable_ = DoorState::UNKNOWN;
};
