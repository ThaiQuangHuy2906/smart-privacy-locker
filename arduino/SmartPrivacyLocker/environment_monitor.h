#pragma once

#include <DHT.h>

// Một mẫu đo DHT22; valid=false khi thư viện trả NaN do lỗi/timeout cảm biến.
struct EnvironmentReading {
  float temperatureC = 0.0F;
  float humidityPercent = 0.0F;
  bool valid = false;
};

// YC1 của Huy, phần input: đọc DHT22 định kỳ mà không delay vòng lặp chính.
class EnvironmentMonitor {
 public:
  // Tạo đối tượng DHT22 gắn với chân data trong PinMap.
  EnvironmentMonitor();
  // Khởi động thư viện DHT trước lần đọc đầu tiên.
  void begin();
  // true nghĩa là vừa thực hiện một lần đọc (kể cả lần đọc lỗi), không phải giá trị hợp lệ.
  bool tick(unsigned long now);
  // Trả tham chiếu chỉ đọc đến mẫu nhiệt độ/độ ẩm gần nhất.
  const EnvironmentReading& latest() const;

 private:
  DHT dht_;
  EnvironmentReading reading_;
  unsigned long lastReadAt_ = 0;
};
