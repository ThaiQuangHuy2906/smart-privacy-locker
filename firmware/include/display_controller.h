#pragma once

#include <Adafruit_SSD1306.h>

#include "device_state.h"
#include "environment_monitor.h"

// YC1 của Huy, phần output: hiển thị DHT22 và trạng thái hệ thống trên OLED SSD1306.
class DisplayController {
 public:
  DisplayController();
  // false nếu OLED không phản hồi; firmware vẫn tiếp tục chạy các chức năng khác.
  bool begin();
  // Render có giới hạn tần suất và chỉ khi dữ liệu thay đổi đáng kể.
  void tick(unsigned long now, const EnvironmentReading& environment, const DeviceState& state);
  bool isAvailable() const;

 private:
  Adafruit_SSD1306 display_;
  bool available_ = false;
  bool rendered_ = false;
  unsigned long lastRenderAt_ = 0;
  // Snapshot dùng để tránh ghi lại toàn màn hình khi nội dung không đổi.
  DeviceState lastState_;
  EnvironmentReading lastEnvironment_;
};
