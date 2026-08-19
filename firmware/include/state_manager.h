#pragma once

#include "device_state.h"

// Nơi duy nhất giữ snapshot trạng thái logic hiện tại của thiết bị.
// Các controller điều khiển phần cứng; StateManager chỉ ghi nhận kết quả đã xác nhận.
class StateManager {
 public:
  StateManager();

  const DeviceState& current() const;
  // Cold boot không tự suy đoán vị trí cửa/chốt và không tự chạy servo.
  void resetForColdBoot();
  void setWifiConnected(bool connected);
  void setMqttConnected(bool connected);
  void setDoor(DoorState state);
  void setLock(LockState state);
  void setAlarm(AlarmState state);
  void setLed(LedState state);

 private:
  DeviceState state_;
};
