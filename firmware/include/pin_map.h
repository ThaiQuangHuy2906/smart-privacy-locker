#pragma once

#include <Arduino.h>

// Candidate map from PLAN.md Section 4. It is deliberately documented as
// unverified until the Phase 1 physical HARD-GATE checks are recorded.
namespace PinMap {
constexpr gpio_num_t SERVO_SIGNAL = GPIO_NUM_18;
constexpr gpio_num_t DHT22_DATA = GPIO_NUM_4;
constexpr gpio_num_t WS2812B_DATA = GPIO_NUM_25;
constexpr gpio_num_t OLED_SDA = GPIO_NUM_21;
constexpr gpio_num_t OLED_SCL = GPIO_NUM_22;

constexpr gpio_num_t MC38_DOOR_SENSOR = GPIO_NUM_27;
// Reserved for Phase 3; this firmware does not configure or drive it.
constexpr gpio_num_t BUZZER_RESERVED = GPIO_NUM_26;
}  // namespace PinMap
