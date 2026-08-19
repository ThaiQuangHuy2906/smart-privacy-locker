#include "wifi_provisioning.h"

#include <Arduino.h>
#include <WiFi.h>

#include "runtime_config.h"
#include "time_utils.h"

// Khởi tạo WiFiManager ở chế độ non-blocking và thử credential đã lưu trong NVS.
void WifiProvisioning::begin() {
  // STA là chế độ hoạt động bình thường sau khi đã có SSID/password hợp lệ.
  WiFi.mode(WIFI_STA);
  manager_.setDebugOutput(false);
  manager_.setConfigPortalBlocking(false);
  manager_.setConfigPortalTimeout(AppConfig::WIFI_PORTAL_TIMEOUT_SECONDS);
  manager_.setBreakAfterConfig(true);

  // Nếu NVS có credential hợp lệ, WiFiManager kết nối như STA. Nếu thiếu/sai,
  // nó mở AP và captive portal cục bộ. Timeout tránh portal chạy vô hạn; có thể
  // reboot hoặc gửi R qua USB để bắt đầu lại.
  manager_.autoConnect(AppConfig::WIFI_PORTAL_AP_NAME);
  started_ = true;
}

// Xử lý portal/kết nối Wi-Fi và phát hiện các cạnh kết nối hoặc mất kết nối.
void WifiProvisioning::tick() {
  if (!started_) {
    return;
  }
  manager_.process();
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected_) {
    // Chỉ bắt đầu NTP ở cạnh chuyển từ mất mạng sang có mạng.
    startTimeSync();
    Serial.println("Wi-Fi connected");
  } else if (!connected && wasConnected_) {
    Serial.println("Wi-Fi disconnected");
  }
  wasConnected_ = connected;
}

// Kiểm tra ESP32 hiện đang có kết nối Wi-Fi hợp lệ hay không.
bool WifiProvisioning::isConnected() const { return WiFi.status() == WL_CONNECTED; }

// Xóa credential Wi-Fi trong NVS rồi khởi động lại ESP32.
void WifiProvisioning::resetConfigurationAndRestart() {
  // Chỉ đường USB vật lý mới gọi hàm này; tuyệt đối không đọc hoặc in SSID/password.
  manager_.resetSettings();
  Serial.println("Wi-Fi configuration erased; restarting");
  ESP.restart();
}
