#pragma once

// CB3 của Thùy, nhưng main.cpp dùng chung controller này khi phát hiện mở cửa trái phép.
// activeHigh tách "bật/tắt logic" khỏi mức điện HIGH/LOW của từng module buzzer.
class AlarmController {
 public:
  using OutputWriter = void (*)(bool high);

  AlarmController(bool activeHigh, OutputWriter outputWriter);

  // Đưa buzzer về inactive trước khi nhận command.
  void begin();
  // Trả false nếu chưa begin hoặc không có hàm ghi GPIO.
  bool setActive(bool active);
  bool isActive() const;
  bool outputLevelHigh(bool active) const;

 private:
  bool activeHigh_;
  OutputWriter outputWriter_;
  bool active_ = false;
  bool initialized_ = false;
};
