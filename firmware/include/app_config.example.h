#pragma once

#include <stddef.h>
#include <stdint.h>

// Module TMB12A05 ba chân đang dùng kích ở mức LOW: HIGH là tắt, LOW là kêu.
// VCC nối 3V3; GPIO26 đến chân IN qua điện trở 4,7 kOhm. Nếu phần cứng thực tế
// có cực tính ngược lại thì ghi đè macro trong app_config.h cục bộ (Git bỏ qua).
#ifndef SPL_BUZZER_ACTIVE_HIGH
#define SPL_BUZZER_ACTIVE_HIGH 0
#endif

// Chỉ sao chép file này thành app_config.h khi cần cấu hình riêng cho thiết bị.
// app_config.h bị Git bỏ qua để không vô tình commit cấu hình triển khai.
namespace AppConfig {
constexpr char LOCKER_ID[] = "LOCKER-001";

// Kết nối và độ tin cậy MQTT.
constexpr uint16_t MQTT_PORT = 8883;
constexpr bool MQTT_USE_TLS = true;
constexpr uint32_t MQTT_RECONNECT_INITIAL_MS = 1000;
constexpr uint32_t MQTT_RECONNECT_MAX_MS = 30000;
constexpr uint32_t MQTT_HEARTBEAT_INTERVAL_MS = 10000;
constexpr uint32_t COMMAND_MAX_AGE_SECONDS = 120;
constexpr uint32_t COMMAND_MAX_FUTURE_SKEW_SECONDS = 30;
constexpr size_t RECENT_COMMAND_CACHE_SIZE = 16;

// CB2 của Huy: người dùng vẫn tự mở/đóng cánh cửa; SG90 chỉ xoay chốt.
// LOCK giữ chốt khi cửa CLOSED, UNLOCK nhả chốt. Sau 2 giây firmware detach servo.
constexpr uint8_t LOCK_ANGLE = 80;
constexpr uint8_t UNLOCK_ANGLE = 170;
constexpr uint32_t SERVO_SETTLE_MS = 2000;
constexpr size_t DOOR_EVENT_OUTBOX_SIZE = 8;

// YC1 của Huy: chu kỳ đọc DHT22 và cập nhật OLED SSD1306.
constexpr uint32_t DHT_READ_INTERVAL_MS = 2500;
constexpr uint32_t DISPLAY_REFRESH_INTERVAL_MS = 1000;
constexpr uint8_t OLED_I2C_ADDRESS = 0x3C;

// YC3 của Huy: số pixel và độ sáng toàn dải WS2812B.
constexpr uint8_t WS2812_PIXEL_COUNT = 1;
constexpr uint8_t WS2812_BRIGHTNESS = 32;

// YC12 của Huy: captive portal WiFiManager tồn tại tối đa 180 giây.
constexpr uint16_t WIFI_PORTAL_TIMEOUT_SECONDS = 180;
constexpr char WIFI_PORTAL_AP_NAME[] = "Locker-Setup";

// MC-38 phải giữ ổn định 50 ms mới được xem là một trạng thái cửa mới.
constexpr uint32_t DOOR_DEBOUNCE_MS = 50;
// MC-38 nối GPIO27 xuống GND và dùng INPUT_PULLUP, nên khi reed đóng thì dự kiến
// đọc LOW. Vẫn phải đo lại cực tính trên đúng MC-38/board thật.
constexpr bool MC38_CLOSED_LEVEL_HIGH = false;
}  // namespace AppConfig
