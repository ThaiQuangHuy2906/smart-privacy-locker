#pragma once

#include <stddef.h>
#include <stdint.h>

// The selected three-pin TMB12A05 LOW-level-trigger module is active-low:
// HIGH is inactive and LOW sounds the alarm. The module VCC is connected to
// ESP32 3V3, while GPIO26 reaches the IN pin through a 4.7 kOhm resistor.
// Deployment-specific hardware with the opposite polarity may override this
// macro in the ignored local app_config.h.
#ifndef SPL_BUZZER_ACTIVE_HIGH
#define SPL_BUZZER_ACTIVE_HIGH 0
#endif

// Copy this file to app_config.h only when a deployment-specific override is
// necessary. app_config.h is intentionally ignored by Git.
namespace AppConfig {
constexpr char LOCKER_ID[] = "LOCKER-001";
constexpr uint16_t MQTT_PORT = 1883;
constexpr bool MQTT_USE_TLS = false;
constexpr uint32_t MQTT_RECONNECT_INITIAL_MS = 1000;
constexpr uint32_t MQTT_RECONNECT_MAX_MS = 30000;
constexpr uint32_t COMMAND_MAX_AGE_SECONDS = 120;
constexpr size_t RECENT_COMMAND_CACHE_SIZE = 16;
constexpr uint8_t LOCK_ANGLE = 15;
constexpr uint8_t UNLOCK_ANGLE = 95;
constexpr uint32_t SERVO_SETTLE_MS = 550;
constexpr uint32_t DHT_READ_INTERVAL_MS = 2500;
constexpr uint32_t DISPLAY_REFRESH_INTERVAL_MS = 1000;
constexpr uint8_t OLED_I2C_ADDRESS = 0x3C;
constexpr uint8_t WS2812_PIXEL_COUNT = 1;
constexpr uint8_t WS2812_BRIGHTNESS = 32;
constexpr uint16_t WIFI_PORTAL_TIMEOUT_SECONDS = 180;
constexpr char WIFI_PORTAL_AP_NAME[] = "Locker-Setup";
constexpr uint32_t DOOR_DEBOUNCE_MS = 50;
// MC-38 is wired from GPIO27 to ground with INPUT_PULLUP. A closed reed
// therefore is expected to read LOW when the magnet closes the candidate
// circuit. P2-M01 must verify this polarity on the actual MC-38/board.
constexpr bool MC38_CLOSED_LEVEL_HIGH = false;
}  // namespace AppConfig
