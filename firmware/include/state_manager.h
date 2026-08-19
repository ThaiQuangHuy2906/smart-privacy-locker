#pragma once

#include "device_state.h"

// Nơi duy nhất giữ snapshot trạng thái logic hiện tại của thiết bị.
// Các controller điều khiển phần cứng; StateManager chỉ ghi nhận kết quả đã xác nhận.
class StateManager {
 public:
  // Tạo state manager và đưa snapshot về trạng thái cold boot an toàn.
  StateManager();

  // Trả tham chiếu chỉ đọc đến snapshot trạng thái hiện tại.
  const DeviceState& current() const;
  // Cold boot không tự suy đoán vị trí cửa/chốt và không tự chạy servo.
  void resetForColdBoot();
  // Cập nhật cờ kết nối Wi-Fi trong snapshot.
  void setWifiConnected(bool connected);
  // Cập nhật cờ kết nối MQTT trong snapshot.
  void setMqttConnected(bool connected);
  // Cập nhật trạng thái cửa đã qua debounce.
  void setDoor(DoorState state);
  // Cập nhật trạng thái logic của chốt sau khi chuyển động hoàn tất.
  void setLock(LockState state);
  // Cập nhật trạng thái logic của buzzer.
  void setAlarm(AlarmState state);
  // Cập nhật trạng thái logic của dải LED.
  void setLed(LedState state);

 private:
  DeviceState state_;
};
