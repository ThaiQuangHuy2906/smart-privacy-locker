#include "lock_controller.h"

#include <Arduino.h>

#include "pin_map.h"
#include "runtime_config.h"

void LockController::begin() {
  // Intentional: do not attach or write the servo at boot. SG90 position has
  // no feedback, so attach/write here would violate the cold-boot safe policy.
}

bool LockController::start(LockState desiredState, unsigned long now) {
  if (busy_ || (desiredState != LockState::LOCKED && desiredState != LockState::UNLOCKED)) {
    return false;
  }
  servo_.setPeriodHertz(50);
  // ESP32Servo::attach() returns the allocated PWM channel. Channel 0 is a
  // valid first allocation, so its numeric return value is not a success flag.
  servo_.attach(static_cast<int>(PinMap::SERVO_SIGNAL), 500, 2400);
  if (!servo_.attached()) {
    return false;
  }
  const uint8_t angle = desiredState == LockState::LOCKED ? AppConfig::LOCK_ANGLE
                                                           : AppConfig::UNLOCK_ANGLE;
  servo_.write(angle);
  desiredState_ = desiredState;
  startedAt_ = now;
  busy_ = true;
  return true;
}

bool LockController::tick(unsigned long now, LockState* completedState) {
  if (!busy_ || now - startedAt_ < AppConfig::SERVO_SETTLE_MS) {
    return false;
  }
  servo_.detach();
  busy_ = false;
  if (completedState != nullptr) {
    *completedState = desiredState_;
  }
  desiredState_ = LockState::UNKNOWN;
  return true;
}

bool LockController::isBusy() const { return busy_; }
