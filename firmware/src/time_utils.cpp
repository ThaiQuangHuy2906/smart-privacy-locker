#include "time_utils.h"

#include <Arduino.h>
#include <time.h>

void startTimeSync() {
  // NTP is best-effort. Command validation uses the device clock only after
  // this guard confirms a plausible epoch; otherwise Node-RED timeout and the
  // non-retained clean-session command path remain the safety boundary.
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
}

bool isTimeSynced() { return time(nullptr) >= 1700000000; }

bool formatUtcTimestamp(char* destination, size_t destinationCapacity) {
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
