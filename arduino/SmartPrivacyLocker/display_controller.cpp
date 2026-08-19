#include "display_controller.h"

#include <Wire.h>

#include <math.h>

#include "pin_map.h"
#include "runtime_config.h"

namespace {
// Độ phân giải vật lý của OLED SSD1306 trong dự án.
constexpr uint8_t kDisplayWidth = 128;
constexpr uint8_t kDisplayHeight = 64;
}  // namespace

DisplayController::DisplayController()
    : display_(kDisplayWidth, kDisplayHeight, &Wire, -1) {}

bool DisplayController::begin() {
  // ESP32 cho phép chọn rõ hai chân I2C thay vì phụ thuộc pin mặc định của board.
  Wire.begin(static_cast<int>(PinMap::OLED_SDA), static_cast<int>(PinMap::OLED_SCL));
  available_ = display_.begin(SSD1306_SWITCHCAPVCC, AppConfig::OLED_I2C_ADDRESS);
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
  // OLED lỗi hoặc chưa đến chu kỳ refresh thì trả ngay để loop() không bị chặn.
  if (!available_ || (lastRenderAt_ != 0 && now - lastRenderAt_ < AppConfig::DISPLAY_REFRESH_INTERVAL_MS)) {
    return;
  }
  lastRenderAt_ = now;
  // Bỏ qua dao động rất nhỏ để màn hình không nhấp nháy và giảm lưu lượng I2C.
  const bool environmentChanged = environment.valid != lastEnvironment_.valid
      || (environment.valid && (fabsf(environment.temperatureC - lastEnvironment_.temperatureC) >= 0.1F
          || fabsf(environment.humidityPercent - lastEnvironment_.humidityPercent) >= 0.5F));
  const bool stateChanged = state.door != lastState_.door || state.lock != lastState_.lock
      || state.alarm != lastState_.alarm || state.led != lastState_.led
      || state.wifiConnected != lastState_.wifiConnected
      || state.mqttConnected != lastState_.mqttConnected;
  if (rendered_ && !environmentChanged && !stateChanged) {
    return;
  }
  // Chỉ cập nhật snapshot khi thật sự chuẩn bị dựng frame mới.
  rendered_ = true;
  lastEnvironment_ = environment;
  lastState_ = state;
  display_.clearDisplay();
  display_.setTextSize(1);
  display_.setCursor(0, 0);
  display_.println("Smart Locker");
  display_.print("Door: ");
  display_.println(toString(state.door));
  display_.print("Latch: ");
  display_.println(toString(state.lock));
  display_.print("Alarm: ");
  display_.println(toString(state.alarm));
  display_.print("WiFi:");
  display_.print(state.wifiConnected ? "OK" : "--");
  display_.print(" MQTT:");
  display_.println(state.mqttConnected ? "OK" : "--");
  if (environment.valid) {
    display_.print("T:");
    display_.print(environment.temperatureC, 1);
    display_.print("C H:");
    display_.print(environment.humidityPercent, 0);
    display_.println("%");
  } else {
    // Không hiển thị lại số cũ khi mẫu DHT hiện tại không đáng tin.
    display_.println("DHT: CHECK SENSOR");
  }
  // Các lệnh print chỉ sửa buffer RAM; display() mới gửi frame qua I2C ra OLED.
  display_.display();
}

bool DisplayController::isAvailable() const { return available_; }
