#pragma once

#include <ESP32Servo.h>

#include "device_state.h"

// CB2 của Huy: điều khiển SG90 theo kiểu state machine không chặn.
// start() phát lệnh góc; loop() gọi tick() đến khi đủ thời gian rồi mới detach.
class LockController {
 public:
  // Không attach servo lúc boot để chốt không tự chuyển động ngoài ý muốn.
  void begin();
  // Bắt đầu đi đến LOCKED/UNLOCKED; false nếu đang bận hoặc trạng thái không hợp lệ.
  bool start(LockState desiredState, unsigned long now);
  // Trả true đúng một lần khi hết thời gian settle và ghi endpoint đã hoàn tất.
  bool tick(unsigned long now, LockState* completedState);
  // Dừng ngay và detach khi interlock phát hiện cửa mở trong lúc servo chạy.
  void cancel();
  // Cho biết servo đang trong thời gian thực hiện một chuyển động hay không.
  bool isBusy() const;

 private:
  Servo servo_;
  bool busy_ = false;
  unsigned long startedAt_ = 0;
  LockState desiredState_ = LockState::UNKNOWN;
};
