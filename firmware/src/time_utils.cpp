#include "time_utils.h"

#include <Arduino.h>
#include <time.h>

void startTimeSync() {
  // NTP là best-effort. Chỉ sau khi epoch hợp lý thì parser mới dùng đồng hồ
  // ESP32 để chặn command quá cũ/tương lai; trước đó backend vẫn chịu trách nhiệm timeout.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
}

bool isTimeSynced() { return time(nullptr) >= 1700000000; }

bool formatUtcTimestamp(char* destination, size_t destinationCapacity) {
  // Cần ít nhất 21 byte: 20 ký tự timestamp cộng ký tự kết thúc '\0'.
  if (destination == nullptr || destinationCapacity < 21 || !isTimeSynced()) {
    return false;
  }
  const time_t now = time(nullptr);
  struct tm utcTime {};
  if (gmtime_r(&now, &utcTime) == nullptr) {
    return false;
  }
  return strftime(destination, destinationCapacity, "%Y-%m-%dT%H:%M:%SZ", &utcTime) > 0;
}
