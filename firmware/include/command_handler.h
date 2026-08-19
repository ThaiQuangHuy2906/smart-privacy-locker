#pragma once

#include <stddef.h>
#include <stdint.h>

// Các action hợp lệ trong MQTT contract v1.
enum class CommandAction {
  LOCK,
  UNLOCK,
  ALARM_ON,
  ALARM_OFF,
  LED_ON,
  LED_OFF,
  GET_STATE,
  UNKNOWN,
};

// Mã lỗi máy đọc được; backend dùng để kết thúc trạng thái pending đúng nguyên nhân.
enum class CommandError {
  NONE,
  INVALID_JSON,
  MISSING_FIELD,
  INVALID_COMMAND_ID,
  INVALID_SCHEMA,
  INVALID_ACTION,
  INVALID_REQUESTED_BY,
  INVALID_ISSUED_AT,
  LOCKER_MISMATCH,
  STALE_COMMAND,
  DOOR_NOT_CLOSED,
  DOOR_NOT_CLOSED_FOR_ACCESS,
  ACTUATION_FAILED,
};

// Command sau khi đã tách từ JSON. Mảng char có kích thước cố định để tránh
// cấp phát String động trên ESP32 trong đường xử lý lệnh.
struct Command {
  char commandId[37] = {};
  char lockerId[33] = {};
  char issuedAt[32] = {};
  char requestedBy[80] = {};
  CommandAction action = CommandAction::UNKNOWN;
};

// Dữ liệu ngoài payload cần cho validation: topic, đúng thiết bị và đồng hồ hiện tại.
struct CommandValidationContext {
  const char* topicLockerId;
  const char* configuredLockerId;
  bool timeSynced;
  int64_t nowEpochSeconds;
  uint32_t maxAgeSeconds;
  uint32_t maxFutureSkewSeconds;
};

struct CommandParseResult {
  Command command;
  CommandError error = CommandError::NONE;
  bool hasCorrelatableId = false;

  // Cho biết command đã vượt qua toàn bộ bước parse và validation hay chưa.
  bool ok() const { return error == CommandError::NONE; }
};

// Parse và kiểm tra toàn bộ command trước khi main.cpp được phép chạy actuator.
CommandParseResult parseAndValidateCommand(const char* payload,
                                           size_t payloadLength,
                                           const CommandValidationContext& context);

// Đổi CommandAction thành chuỗi chuẩn của MQTT contract.
const char* toString(CommandAction action);
// Đổi CommandError thành mã lỗi chuỗi ổn định cho ACK/backend.
const char* toString(CommandError error);
