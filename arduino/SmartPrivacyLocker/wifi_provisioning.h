#pragma once

#include <WiFiManager.h>

// YC12 của Huy: cấu hình Wi-Fi qua captive portal mà không phải nạp lại firmware.
class WifiProvisioning {
 public:
  // Thử credential đã lưu; nếu không dùng được thì mở AP "Locker-Setup".
  void begin();
  // WiFiManager chạy non-blocking nên loop() phải gọi tick() liên tục.
  void tick();
  // Cho biết ESP32 hiện đã kết nối Wi-Fi ở chế độ station hay chưa.
  bool isConnected() const;
  // Chỉ dùng qua USB serial vật lý để xóa credential NVS rồi khởi động lại.
  void resetConfigurationAndRestart();

 private:
  WiFiManager manager_;
  bool started_ = false;
  bool wasConnected_ = false;
};
