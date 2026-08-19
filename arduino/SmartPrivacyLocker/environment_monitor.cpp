#include "environment_monitor.h"

#include <math.h>

#include "pin_map.h"
#include "runtime_config.h"

EnvironmentMonitor::EnvironmentMonitor() : dht_(static_cast<uint8_t>(PinMap::DHT22_DATA), DHT22) {}

void EnvironmentMonitor::begin() { dht_.begin(); }

bool EnvironmentMonitor::tick(unsigned long now) {
  // DHT22 phản hồi chậm; giới hạn mỗi 2,5 giây và tuyệt đối không dùng delay().
  if (lastReadAt_ != 0 && now - lastReadAt_ < AppConfig::DHT_READ_INTERVAL_MS) {
    return false;
  }
  lastReadAt_ = now;
  const float humidity = dht_.readHumidity();
  const float temperature = dht_.readTemperature();
  // Thư viện DHT dùng NaN để báo không đọc được checksum/timing.
  reading_.valid = !isnan(humidity) && !isnan(temperature);
  if (reading_.valid) {
    // Khi lần đọc lỗi, giữ số đo tốt trước đó nhưng valid=false để OLED không dùng nó.
    reading_.humidityPercent = humidity;
    reading_.temperatureC = temperature;
  }
  return true;
}

const EnvironmentReading& EnvironmentMonitor::latest() const { return reading_; }
