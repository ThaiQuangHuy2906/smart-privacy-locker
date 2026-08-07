#include "display_controller.h"

#include <Wire.h>

#include "pin_map.h"
#include "runtime_config.h"

namespace {
constexpr uint8_t kDisplayWidth = 128;
constexpr uint8_t kDisplayHeight = 64;
constexpr uint8_t kDefaultI2cAddress = 0x3C;
}  // namespace

DisplayController::DisplayController()
    : display_(kDisplayWidth, kDisplayHeight, &Wire, -1) {}

bool DisplayController::begin() {
  Wire.begin(static_cast<int>(PinMap::OLED_SDA), static_cast<int>(PinMap::OLED_SCL));
  available_ = display_.begin(SSD1306_SWITCHCAPVCC, kDefaultI2cAddress);
  if (available_) {
    display_.clearDisplay();
    display_.setTextColor(SSD1306_WHITE);
    display_.setTextSize(1);
    display_.setCursor(0, 0);
    display_.println("Smart Locker");
    display_.println("Starting...");
    display_.display();
  }
  return available_;
}

void DisplayController::tick(unsigned long now, const EnvironmentReading& environment,
                             const DeviceState& state) {
  if (!available_ || (lastRenderAt_ != 0 && now - lastRenderAt_ < AppConfig::DISPLAY_REFRESH_INTERVAL_MS)) {
    return;
  }
  lastRenderAt_ = now;
  display_.clearDisplay();
  display_.setTextSize(1);
  display_.setCursor(0, 0);
  display_.println("Smart Locker");
  if (environment.valid) {
    display_.print("T: ");
    display_.print(environment.temperatureC, 1);
    display_.println(" C");
    display_.print("H: ");
    display_.print(environment.humidityPercent, 1);
    display_.println(" %");
  } else {
    display_.println("DHT22 ERROR");
    display_.println("Check sensor/wire");
  }
  display_.print("WiFi: ");
  display_.println(state.wifiConnected ? "OK" : "WAIT");
  display_.print("MQTT: ");
  display_.println(state.mqttConnected ? "OK" : "WAIT");
  display_.display();
}

bool DisplayController::isAvailable() const { return available_; }
