#include "alarm_controller.h"

AlarmController::AlarmController(bool activeHigh, OutputWriter outputWriter)
    : activeHigh_(activeHigh), outputWriter_(outputWriter) {}

void AlarmController::begin() {
  // outputLevelHigh(false) tự xử lý module active-high hay active-low.
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
    // Idempotent: yêu cầu trùng trạng thái không tạo thêm xung GPIO.
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
  // Active-low: bật -> LOW và tắt -> HIGH; active-high thì ngược lại.
  return active ? activeHigh_ : !activeHigh_;
}
