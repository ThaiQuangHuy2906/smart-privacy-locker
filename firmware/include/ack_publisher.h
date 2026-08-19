#pragma once

#include <stddef.h>

#include "command_handler.h"
#include "device_state.h"

// ACK (acknowledgement) là gói phản hồi cho biết một command đã thành công hay lỗi.
enum class AckResult { SUCCESS, ERROR };

// Lưu đủ dữ liệu để phát lại đúng ACK khi backend gửi trùng command_id.
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
  // Bộ nhớ vòng trong RAM; capacity luôn bị chặn trong khoảng 1..16.
  explicit RecentCommandCache(size_t capacity);

  // Trả về ACK đã xử lý nếu command_id từng xuất hiện, ngược lại trả nullptr.
  const AckRecord* find(const char* commandId) const;
  void remember(const AckRecord& record);

 private:
  static constexpr size_t kMaximumEntries = 16;
  AckRecord entries_[kMaximumEntries] = {};
  size_t capacity_;
  size_t nextIndex_ = 0;
  size_t count_ = 0;
};

// Ghi toàn bộ ACK thành JSON. timestamp là chuỗi UTC ISO-8601 khi ESP32 đã
// đồng bộ thời gian; truyền nullptr để JSON phát timestamp = null.
bool serializeAck(const AckRecord& record, bool duplicate, const char* timestamp,
                  char* destination, size_t destinationCapacity);
