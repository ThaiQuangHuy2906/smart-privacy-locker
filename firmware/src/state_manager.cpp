#include "state_manager.h"

// Các hàm toString giữ cách viết trạng thái nhất quán giữa OLED, ACK và MQTT.
// Đổi enum trạng thái cửa thành chuỗi dùng chung cho OLED/MQTT/ACK.
const char* toString(DoorState state) {
  switch (state) {
    case DoorState::OPEN:
      return "OPEN";
    case DoorState::CLOSED:
      return "CLOSED";
    case DoorState::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

// Đổi enum trạng thái chốt thành chuỗi dùng chung cho OLED/MQTT/ACK.
const char* toString(LockState state) {
  switch (state) {
    case LockState::LOCKED:
      return "LOCKED";
    case LockState::UNLOCKED:
      return "UNLOCKED";
    case LockState::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

// Đổi enum trạng thái còi thành chuỗi dùng chung cho OLED/MQTT/ACK.
const char* toString(AlarmState state) {
  switch (state) {
    case AlarmState::ACTIVE:
      return "ACTIVE";
    case AlarmState::INACTIVE:
      return "INACTIVE";
    case AlarmState::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

// Đổi enum trạng thái LED thành chuỗi dùng chung cho MQTT/ACK.
const char* toString(LedState state) {
  switch (state) {
    case LedState::ON:
      return "ON";
    case LedState::OFF:
      return "OFF";
    case LedState::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

// Tạo manager và khởi tạo snapshot cold boot an toàn.
StateManager::StateManager() { resetForColdBoot(); }

// Trả tham chiếu chỉ đọc đến snapshot trạng thái hiện tại.
const DeviceState& StateManager::current() const { return state_; }

// Đưa snapshot về các giá trị an toàn, không suy đoán cửa hoặc vị trí chốt.
void StateManager::resetForColdBoot() {
  // Cửa/chốt cần quan sát hoặc command mới để xác nhận. Còi và LED được chủ động
  // đưa về trạng thái an toàn trong setup(), nên có thể khai báo INACTIVE/OFF.
  state_.door = DoorState::UNKNOWN;
  state_.lock = LockState::UNKNOWN;
  state_.alarm = AlarmState::INACTIVE;
  state_.led = LedState::OFF;
  state_.wifiConnected = false;
  state_.mqttConnected = false;
}

// Cập nhật cờ kết nối Wi-Fi.
void StateManager::setWifiConnected(bool connected) { state_.wifiConnected = connected; }

// Cập nhật cờ kết nối MQTT.
void StateManager::setMqttConnected(bool connected) { state_.mqttConnected = connected; }

// Cập nhật trạng thái cửa đã được debounce xác nhận.
void StateManager::setDoor(DoorState state) { state_.door = state; }

// Cập nhật trạng thái logic của chốt.
void StateManager::setLock(LockState state) { state_.lock = state; }

// Cập nhật trạng thái logic của buzzer.
void StateManager::setAlarm(AlarmState state) { state_.alarm = state; }

// Cập nhật trạng thái logic của dải LED.
void StateManager::setLed(LedState state) { state_.led = state; }
