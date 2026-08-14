#include "alarm_controller.h"

AlarmController::AlarmController(bool activeHigh, OutputWriter outputWriter)
    : activeHigh_(activeHigh), outputWriter_(outputWriter) {}

void AlarmController::begin() {
  active_ = false;
  initialized_ = true;
  if (outputWriter_ != nullptr) {
    outputWriter_(outputLevelHigh(false));
  }
}

bool AlarmController::setActive(bool active) {
  if (!initialized_) {
    return false;
  }
  if (active_ == active) {
    return true;
  }
  if (outputWriter_ == nullptr) {
    return false;
  }
  outputWriter_(outputLevelHigh(active));
  active_ = active;
  return true;
}

bool AlarmController::isActive() const { return active_; }

bool AlarmController::outputLevelHigh(bool active) const {
  return active ? activeHigh_ : !activeHigh_;
}
