#pragma once

#include <stdint.h>

#if __has_include("app_config.h")
#include "app_config.h"
#else
#include "app_config.example.h"
#endif

// Tương thích các bản app_config.h cũ chưa có cấu hình cực tính buzzer:
// mặc định 0 tương ứng module TMB12A05 kích LOW; phần cứng khác có thể ghi đè.
#ifndef SPL_BUZZER_ACTIVE_HIGH
#define SPL_BUZZER_ACTIVE_HIGH 0
#endif

#if SPL_BUZZER_ACTIVE_HIGH != 0 && SPL_BUZZER_ACTIVE_HIGH != 1
#error "SPL_BUZZER_ACTIVE_HIGH must be 0 or 1"
#endif

namespace RuntimeConfig {
// Giữ giới hạn gói MQTT độc lập với cờ riêng của hệ build. MqttClient::begin()
// đổi buffer PubSubClient về đúng giá trị này nên Arduino IDE và PlatformIO
// cùng dùng một giới hạn 1024 byte.
constexpr uint16_t MQTT_PACKET_SIZE = 1024;
constexpr bool BUZZER_ACTIVE_HIGH = SPL_BUZZER_ACTIVE_HIGH != 0;
}  // namespace RuntimeConfig

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif
