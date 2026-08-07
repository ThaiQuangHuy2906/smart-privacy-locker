#pragma once

#include <Adafruit_SSD1306.h>

#include "device_state.h"
#include "environment_monitor.h"

class DisplayController {
 public:
  DisplayController();
  bool begin();
  void tick(unsigned long now, const EnvironmentReading& environment, const DeviceState& state);
  bool isAvailable() const;

 private:
  Adafruit_SSD1306 display_;
  bool available_ = false;
  unsigned long lastRenderAt_ = 0;
};
