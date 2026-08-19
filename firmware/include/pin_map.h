#pragma once

#include <Arduino.h>

// Bản đồ chân tập trung: muốn đổi dây chỉ sửa tại đây, không hard-code GPIO rải rác.
// Các chân này vẫn phải được đối chiếu trên đúng board thật trước khi chốt phần cứng.
namespace PinMap {
// Phần Huy: SG90, DHT22, WS2812B và OLED.
constexpr gpio_num_t SERVO_SIGNAL = GPIO_NUM_18;
constexpr gpio_num_t DHT22_DATA = GPIO_NUM_4;
constexpr gpio_num_t WS2812B_DATA = GPIO_NUM_25;
constexpr gpio_num_t OLED_SDA = GPIO_NUM_21;
constexpr gpio_num_t OLED_SCL = GPIO_NUM_22;

// Phần dùng chung/tích hợp với chức năng của Minh và Thùy.
constexpr gpio_num_t MC38_DOOR_SENSOR = GPIO_NUM_27;
// Module TMB12A05 kích mức LOW: GPIO26 chỉ nối đến IN qua điện trở 4,7 kOhm.
// VCC của module dùng 3V3 ESP32 và tất cả thiết bị phải nối chung GND.
constexpr gpio_num_t BUZZER_CONTROL = GPIO_NUM_26;
}  // namespace PinMap
