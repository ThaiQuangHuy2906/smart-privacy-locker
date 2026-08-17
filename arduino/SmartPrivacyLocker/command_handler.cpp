#include "command_handler.h"

#include <ArduinoJson.h>

#include <ctype.h>
#include <string.h>

namespace {

bool equals(const char* left, const char* right) {
  return left != nullptr && right != nullptr && strcmp(left, right) == 0;
}

bool copyString(JsonVariantConst value, char* destination, size_t destinationSize) {
  if (!value.is<const char*>()) {
    return false;
  }
  const char* source = value.as<const char*>();
  if (source == nullptr || source[0] == '\0' || strlen(source) >= destinationSize) {
    return false;
  }
  strncpy(destination, source, destinationSize - 1);
  destination[destinationSize - 1] = '\0';
  return true;
}

bool isHex(char value) {
  return (value >= '0' && value <= '9') || (value >= 'a' && value <= 'f') ||
         (value >= 'A' && value <= 'F');
}

bool isUuid(const char* value) {
  if (value == nullptr || strlen(value) != 36) {
    return false;
  }
  for (size_t index = 0; index < 36; ++index) {
    const bool dash = index == 8 || index == 13 || index == 18 || index == 23;
    if (dash ? value[index] != '-' : !isHex(value[index])) {
      return false;
    }
  }
  return true;
}

bool isLeapYear(int year) {
  return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
}

int daysInMonth(int year, int month) {
  static constexpr int kDays[] = {31, 28, 31, 30, 31, 30,
                                  31, 31, 30, 31, 30, 31};
  if (month == 2 && isLeapYear(year)) {
    return 29;
  }
  return kDays[month - 1];
}

bool parseNumber(const char* value, size_t offset, size_t width, int* result) {
  int parsed = 0;
  for (size_t index = 0; index < width; ++index) {
    const char character = value[offset + index];
    if (character < '0' || character > '9') {
      return false;
    }
    parsed = (parsed * 10) + (character - '0');
  }
  *result = parsed;
  return true;
}

// Days since 1970-01-01. This is a small, timezone-free civil date conversion
// so stale-command validation remains deterministic on ESP32 and native tests.
int64_t daysFromCivil(int year, unsigned month, unsigned day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yearOfEra = static_cast<unsigned>(year - era * 400);
  const unsigned marchBasedMonth =
      static_cast<unsigned>(static_cast<int>(month) + (month > 2 ? -3 : 9));
  const unsigned dayOfYear = (153 * marchBasedMonth + 2) / 5 + day - 1;
  const unsigned dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  return static_cast<int64_t>(era) * 146097 + static_cast<int64_t>(dayOfEra) - 719468;
}

bool parseIso8601Utc(const char* value, int64_t* epochSeconds) {
  if (value == nullptr) {
    return false;
  }
  const size_t length = strlen(value);
  if (length != 20 && length != 24) {
    return false;
  }
  if (value[4] != '-' || value[7] != '-' || value[10] != 'T' || value[13] != ':' ||
      value[16] != ':' || value[length - 1] != 'Z' || (length == 24 && value[19] != '.')) {
    return false;
  }

  int year = 0;
  int month = 0;
  int day = 0;
  int hour = 0;
  int minute = 0;
  int second = 0;
  if (!parseNumber(value, 0, 4, &year) || !parseNumber(value, 5, 2, &month) ||
      !parseNumber(value, 8, 2, &day) || !parseNumber(value, 11, 2, &hour) ||
      !parseNumber(value, 14, 2, &minute) || !parseNumber(value, 17, 2, &second)) {
    return false;
  }
  if (length == 24) {
    int milliseconds = 0;
    if (!parseNumber(value, 20, 3, &milliseconds)) {
      return false;
    }
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 ||
      minute > 59 || second > 59) {
    return false;
  }

  *epochSeconds = daysFromCivil(year, static_cast<unsigned>(month), static_cast<unsigned>(day)) *
                      86400 +
                  hour * 3600 + minute * 60 + second;
  return true;
}

CommandAction parseAction(const char* value) {
  if (equals(value, "LOCK")) return CommandAction::LOCK;
  if (equals(value, "UNLOCK")) return CommandAction::UNLOCK;
  if (equals(value, "ALARM_ON")) return CommandAction::ALARM_ON;
  if (equals(value, "ALARM_OFF")) return CommandAction::ALARM_OFF;
  if (equals(value, "LED_ON")) return CommandAction::LED_ON;
  if (equals(value, "LED_OFF")) return CommandAction::LED_OFF;
  if (equals(value, "GET_STATE")) return CommandAction::GET_STATE;
  return CommandAction::UNKNOWN;
}

bool isValidRequestedBy(const char* value) {
  return isUuid(value) || equals(value, "system:unauthorized-detector");
}

}  // namespace

CommandParseResult parseAndValidateCommand(const char* payload, size_t payloadLength,
                                           const CommandValidationContext& context) {
  CommandParseResult result;
  JsonDocument document;
  if (deserializeJson(document, payload, payloadLength)) {
    result.error = CommandError::INVALID_JSON;
    return result;
  }
  if (!document.is<JsonObject>()) {
    result.error = CommandError::INVALID_JSON;
    return result;
  }

  const JsonObjectConst object = document.as<JsonObjectConst>();
  if (copyString(object["command_id"], result.command.commandId,
                 sizeof(result.command.commandId))) {
    result.hasCorrelatableId = isUuid(result.command.commandId);
    if (!result.hasCorrelatableId) {
      result.error = CommandError::INVALID_COMMAND_ID;
      return result;
    }
  } else {
    result.error = CommandError::MISSING_FIELD;
    return result;
  }

  if (!object["schema_version"].is<int>() || object["schema_version"].as<int>() != 1) {
    result.error = CommandError::INVALID_SCHEMA;
    return result;
  }
  if (!copyString(object["locker_id"], result.command.lockerId, sizeof(result.command.lockerId)) ||
      !copyString(object["issued_at"], result.command.issuedAt, sizeof(result.command.issuedAt)) ||
      !copyString(object["requested_by"], result.command.requestedBy,
                  sizeof(result.command.requestedBy))) {
    result.error = CommandError::MISSING_FIELD;
    return result;
  }

  char rawAction[16] = {};
  if (!copyString(object["action"], rawAction, sizeof(rawAction))) {
    result.error = CommandError::MISSING_FIELD;
    return result;
  }
  result.command.action = parseAction(rawAction);
  if (result.command.action == CommandAction::UNKNOWN) {
    result.error = CommandError::INVALID_ACTION;
    return result;
  }
  if (!isValidRequestedBy(result.command.requestedBy)) {
    result.error = CommandError::INVALID_REQUESTED_BY;
    return result;
  }
  if (!equals(result.command.lockerId, context.topicLockerId) ||
      !equals(result.command.lockerId, context.configuredLockerId)) {
    result.error = CommandError::LOCKER_MISMATCH;
    return result;
  }

  int64_t issuedEpochSeconds = 0;
  if (!parseIso8601Utc(result.command.issuedAt, &issuedEpochSeconds)) {
    result.error = CommandError::INVALID_ISSUED_AT;
    return result;
  }
  if (context.timeSynced && issuedEpochSeconds > context.nowEpochSeconds &&
      issuedEpochSeconds - context.nowEpochSeconds > context.maxFutureSkewSeconds) {
    result.error = CommandError::INVALID_ISSUED_AT;
    return result;
  }
  if (context.timeSynced && context.nowEpochSeconds > issuedEpochSeconds &&
      context.nowEpochSeconds - issuedEpochSeconds > context.maxAgeSeconds) {
    result.error = CommandError::STALE_COMMAND;
    return result;
  }
  return result;
}

const char* toString(CommandAction action) {
  switch (action) {
    case CommandAction::LOCK:
      return "LOCK";
    case CommandAction::UNLOCK:
      return "UNLOCK";
    case CommandAction::ALARM_ON:
      return "ALARM_ON";
    case CommandAction::ALARM_OFF:
      return "ALARM_OFF";
    case CommandAction::LED_ON:
      return "LED_ON";
    case CommandAction::LED_OFF:
      return "LED_OFF";
    case CommandAction::GET_STATE:
      return "GET_STATE";
    case CommandAction::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

const char* toString(CommandError error) {
  switch (error) {
    case CommandError::NONE:
      return "NONE";
    case CommandError::INVALID_JSON:
      return "INVALID_JSON";
    case CommandError::MISSING_FIELD:
      return "MISSING_FIELD";
    case CommandError::INVALID_COMMAND_ID:
      return "INVALID_COMMAND_ID";
    case CommandError::INVALID_SCHEMA:
      return "INVALID_SCHEMA";
    case CommandError::INVALID_ACTION:
      return "INVALID_ACTION";
    case CommandError::INVALID_REQUESTED_BY:
      return "INVALID_REQUESTED_BY";
    case CommandError::INVALID_ISSUED_AT:
      return "INVALID_ISSUED_AT";
    case CommandError::LOCKER_MISMATCH:
      return "LOCKER_MISMATCH";
    case CommandError::STALE_COMMAND:
      return "STALE_COMMAND";
    case CommandError::ACTUATION_FAILED:
      return "ACTUATION_FAILED";
    default:
      return "ACTUATION_FAILED";
  }
}
