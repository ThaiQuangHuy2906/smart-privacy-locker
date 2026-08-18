#pragma once

#include <stddef.h>
#include <stdint.h>

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

struct Command {
  char commandId[37] = {};
  char lockerId[33] = {};
  char issuedAt[32] = {};
  char requestedBy[80] = {};
  CommandAction action = CommandAction::UNKNOWN;
};

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

  bool ok() const { return error == CommandError::NONE; }
};

CommandParseResult parseAndValidateCommand(const char* payload,
                                           size_t payloadLength,
                                           const CommandValidationContext& context);

const char* toString(CommandAction action);
const char* toString(CommandError error);
