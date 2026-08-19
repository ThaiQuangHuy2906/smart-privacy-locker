#include "lock_controller.h"

#include <Arduino.h>

#include "pin_map.h"
#include "runtime_config.h"

void LockController::begin() {
  // Cố ý không attach/write lúc boot. SG90 không phản hồi vị trí, nên tự ghi góc
  // tại đây vừa làm chốt chuyển động bất ngờ vừa khẳng định sai trạng thái thật.
}

bool LockController::start(LockState desiredState, unsigned long now) {
  // Chỉ nhận hai endpoint hợp lệ và không cho hai chuyển động chồng nhau.
  if (busy_ || (desiredState != LockState::LOCKED && desiredState != LockState::UNLOCKED)) {
    return false;
  }
  // Servo RC chuẩn nhận frame 50 Hz; pulse 500..2400 us ánh xạ sang góc write().
  servo_.setPeriodHertz(50);
  // attach() trả số kênh PWM; kênh 0 vẫn hợp lệ nên phải hỏi attached(), không
  // được coi giá trị trả về 0 là thất bại.
  servo_.attach(static_cast<int>(PinMap::SERVO_SIGNAL), 500, 2400);
  if (!servo_.attached()) {
    return false;
  }
  const uint8_t angle = desiredState == LockState::LOCKED ? AppConfig::LOCK_ANGLE
                                                           : AppConfig::UNLOCK_ANGLE;
  // write() chỉ bắt đầu phát pulse; chưa được xem command là hoàn tất tại đây.
  servo_.write(angle);
  desiredState_ = desiredState;
  startedAt_ = now;
  busy_ = true;
  return true;
}

bool LockController::tick(unsigned long now, LockState* completedState) {
  // Phép trừ unsigned vẫn đúng khi millis() tràn số sau khoảng 49,7 ngày.
  if (!busy_ || now - startedAt_ < AppConfig::SERVO_SETTLE_MS) {
    return false;
  }
  // Detach sau khi cơ cấu có thời gian tới endpoint, tránh giữ dòng/stall liên tục.
  servo_.detach();
  busy_ = false;
  if (completedState != nullptr) {
    *completedState = desiredState_;
  }
  desiredState_ = LockState::UNKNOWN;
  return true;
}

void LockController::cancel() {
  // Hủy giữa chừng không chứng minh được góc cuối; main.cpp sẽ đặt lock=UNKNOWN.
  if (servo_.attached()) {
    servo_.detach();
  }
  busy_ = false;
  desiredState_ = LockState::UNKNOWN;
}

bool LockController::isBusy() const { return busy_; }
