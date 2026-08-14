#pragma once

#include <DHT.h>

struct EnvironmentReading {
  float temperatureC = 0.0F;
  float humidityPercent = 0.0F;
  bool valid = false;
};

class EnvironmentMonitor {
 public:
  EnvironmentMonitor();
  void begin();
  bool tick(unsigned long now);
  const EnvironmentReading& latest() const;

 private:
  DHT dht_;
  EnvironmentReading reading_;
  unsigned long lastReadAt_ = 0;
};
