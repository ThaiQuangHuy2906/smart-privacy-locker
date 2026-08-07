#pragma once

#include "device_state.h"

class StateManager {
 public:
  StateManager();

  const DeviceState& current() const;
  void resetForColdBoot();
  void setWifiConnected(bool connected);
  void setMqttConnected(bool connected);
  void setLock(LockState state);
  void setLed(LedState state);

 private:
  DeviceState state_;
};
