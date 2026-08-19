#include "alarm_controller.h"

// Lưu cực tính phần cứng và callback chịu trách nhiệm ghi GPIO.
AlarmController::AlarmController(bool activeHigh, OutputWriter outputWriter)
    : activeHigh_(activeHigh), outputWriter_(outputWriter) {}

// Khởi tạo controller và chủ động đưa buzzer về trạng thái tắt an toàn.
void AlarmController::begin() {
  // outputLevelHigh(false) tự xử lý module active-high hay active-low.
  active_ = false;
  initialized_ = true;
  if (outputWriter_ != nullptr) {
    outputWriter_(outputLevelHigh(false));
  }
}

// Bật hoặc tắt buzzer theo trạng thái logic, có kiểm tra khởi tạo và idempotency.
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

// Trả về trạng thái bật/tắt logic hiện tại của buzzer.
bool AlarmController::isActive() const { return active_; }

// Quy đổi trạng thái logic thành mức điện theo module active-high/active-low.
bool AlarmController::outputLevelHigh(bool active) const {
  // Active-low: bật -> LOW và tắt -> HIGH; active-high thì ngược lại.
  return active ? activeHigh_ : !activeHigh_;
}
