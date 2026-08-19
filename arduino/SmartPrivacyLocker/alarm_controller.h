#pragma once

// CB3 của Thùy, nhưng main.cpp dùng chung controller này khi phát hiện mở cửa trái phép.
// activeHigh tách "bật/tắt logic" khỏi mức điện HIGH/LOW của từng module buzzer.
class AlarmController {
 public:
  using OutputWriter = void (*)(bool high);

  // Khởi tạo controller với cực tính kích hoạt và hàm ghi mức điện ra GPIO.
  AlarmController(bool activeHigh, OutputWriter outputWriter);

  // Đưa buzzer về inactive trước khi nhận command.
  void begin();
  // Trả false nếu chưa begin hoặc không có hàm ghi GPIO.
  bool setActive(bool active);
  // Trả về trạng thái bật/tắt logic hiện được controller ghi nhận.
  bool isActive() const;
  // Đổi trạng thái logic thành mức điện HIGH/LOW theo cực tính module.
  bool outputLevelHigh(bool active) const;

 private:
  bool activeHigh_;
  OutputWriter outputWriter_;
  bool active_ = false;
  bool initialized_ = false;
};
