#include "environment_monitor.h"

#include <math.h>

#include "pin_map.h"
#include "runtime_config.h"

EnvironmentMonitor::EnvironmentMonitor() : dht_(static_cast<uint8_t>(PinMap::DHT22_DATA), DHT22) {}

void EnvironmentMonitor::begin() { dht_.begin(); }

bool EnvironmentMonitor::tick(unsigned long now) {
  if (lastReadAt_ != 0 && now - lastReadAt_ < AppConfig::DHT_READ_INTERVAL_MS) {
    return false;
  }
  lastReadAt_ = now;
  const float humidity = dht_.readHumidity();
  const float temperature = dht_.readTemperature();
  reading_.valid = !isnan(humidity) && !isnan(temperature);
  if (reading_.valid) {
    reading_.humidityPercent = humidity;
    reading_.temperatureC = temperature;
  }
  return true;
}

const EnvironmentReading& EnvironmentMonitor::latest() const { return reading_; }
