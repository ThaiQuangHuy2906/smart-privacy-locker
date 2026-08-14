#include "ack_publisher.h"

#include <ArduinoJson.h>

#include <string.h>

RecentCommandCache::RecentCommandCache(size_t capacity)
    : capacity_(capacity == 0 ? 1 : (capacity > kMaximumEntries ? kMaximumEntries : capacity)) {}

const AckRecord* RecentCommandCache::find(const char* commandId) const {
  if (commandId == nullptr) {
    return nullptr;
  }
  for (size_t index = 0; index < count_; ++index) {
    if (strcmp(entries_[index].commandId, commandId) == 0) {
      return &entries_[index];
    }
  }
  return nullptr;
}

void RecentCommandCache::remember(const AckRecord& record) {
  entries_[nextIndex_] = record;
  nextIndex_ = (nextIndex_ + 1) % capacity_;
  if (count_ < capacity_) {
    ++count_;
  }
}

bool serializeAck(const AckRecord& record, bool duplicate, const char* timestamp,
                  char* destination, size_t destinationCapacity) {
  if (destination == nullptr || destinationCapacity == 0) {
    return false;
  }

  JsonDocument document;
  document["schema_version"] = 1;
  document["command_id"] = record.commandId;
  document["locker_id"] = record.lockerId;
  document["action"] = toString(record.action);
  document["result"] = record.result == AckResult::SUCCESS ? "success" : "error";
  JsonObject deviceState = document["device_state"].to<JsonObject>();
  deviceState["door"] = toString(record.state.door);
  deviceState["lock"] = toString(record.state.lock);
  deviceState["alarm"] = toString(record.state.alarm);
  deviceState["led"] = toString(record.state.led);

  if (record.result == AckResult::SUCCESS) {
    document["error"] = nullptr;
  } else {
    JsonObject error = document["error"].to<JsonObject>();
    error["code"] = toString(record.error);
    error["message"] = record.errorMessage;
  }
  document["duplicate"] = duplicate;
  if (timestamp == nullptr) {
    document["timestamp"] = nullptr;
  } else {
    document["timestamp"] = timestamp;
  }
  return serializeJson(document, destination, destinationCapacity) < destinationCapacity;
}
