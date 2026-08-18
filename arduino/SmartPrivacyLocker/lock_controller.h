#pragma once

#include <ESP32Servo.h>

#include "device_state.h"

class LockController {
 public:
  void begin();
  bool start(LockState desiredState, unsigned long now);
  bool tick(unsigned long now, LockState* completedState);
  void cancel();
  bool isBusy() const;

 private:
  Servo servo_;
  bool busy_ = false;
  unsigned long startedAt_ = 0;
  LockState desiredState_ = LockState::UNKNOWN;
};
