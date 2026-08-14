#pragma once

#include <stddef.h>

#include "command_handler.h"
#include "device_state.h"

enum class AckResult { SUCCESS, ERROR };

struct AckRecord {
  char commandId[37] = {};
  char lockerId[33] = {};
  CommandAction action = CommandAction::UNKNOWN;
  AckResult result = AckResult::ERROR;
  DeviceState state;
  CommandError error = CommandError::NONE;
  char errorMessage[96] = {};
};

class RecentCommandCache {
 public:
  explicit RecentCommandCache(size_t capacity);

  const AckRecord* find(const char* commandId) const;
  void remember(const AckRecord& record);

 private:
  static constexpr size_t kMaximumEntries = 16;
  AckRecord entries_[kMaximumEntries] = {};
  size_t capacity_;
  size_t nextIndex_ = 0;
  size_t count_ = 0;
};

// Writes a complete ACK JSON payload. timestamp is an ISO-8601 UTC string
// when the device clock is synchronized; otherwise pass nullptr to emit null.
bool serializeAck(const AckRecord& record, bool duplicate, const char* timestamp,
                  char* destination, size_t destinationCapacity);
