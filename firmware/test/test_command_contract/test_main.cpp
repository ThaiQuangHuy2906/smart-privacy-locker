#include <ArduinoJson.h>
#include <unity.h>

#include <string.h>

#include "ack_publisher.h"
#include "command_handler.h"
#include "state_manager.h"

namespace {

constexpr char kCommandId[] = "550e8400-e29b-41d4-a716-446655440000";
constexpr char kRequesterId[] = "550e8400-e29b-41d4-a716-446655440001";

const CommandValidationContext kUnsyncedContext = {
    "LOCKER-001", "LOCKER-001", false, 0, 120, 30,
};

const char kValidUnlock[] = R"json({
  "schema_version": 1,
  "command_id": "550e8400-e29b-41d4-a716-446655440000",
  "locker_id": "LOCKER-001",
  "action": "UNLOCK",
  "issued_at": "2026-08-07T08:00:00.000Z",
  "requested_by": "550e8400-e29b-41d4-a716-446655440001"
})json";

CommandValidationContext syncedContext(int64_t nowEpochSeconds) {
  return {"LOCKER-001", "LOCKER-001", true, nowEpochSeconds, 120, 30};
}

AckRecord sampleAck() {
  AckRecord record;
  strcpy(record.commandId, kCommandId);
  strcpy(record.lockerId, "LOCKER-001");
  record.action = CommandAction::UNLOCK;
  record.result = AckResult::SUCCESS;
  record.state.door = DoorState::CLOSED;
  record.state.lock = LockState::UNLOCKED;
  record.state.alarm = AlarmState::INACTIVE;
  record.state.led = LedState::OFF;
  return record;
}

void test_valid_command_has_expected_consumer_fields() {
  const CommandParseResult result =
      parseAndValidateCommand(kValidUnlock, strlen(kValidUnlock), kUnsyncedContext);

  TEST_ASSERT_TRUE(result.ok());
  TEST_ASSERT_TRUE(result.hasCorrelatableId);
  TEST_ASSERT_EQUAL_STRING(kCommandId, result.command.commandId);
  TEST_ASSERT_EQUAL_STRING("LOCKER-001", result.command.lockerId);
  TEST_ASSERT_EQUAL(CommandAction::UNLOCK, result.command.action);
  TEST_ASSERT_EQUAL_STRING(kRequesterId, result.command.requestedBy);
}

void test_malformed_json_has_no_correlatable_ack_id() {
  constexpr char kMalformed[] = "{\"command_id\":\"550e8400-e29b-41d4-a716-446655440000\"";
  const CommandParseResult result =
      parseAndValidateCommand(kMalformed, strlen(kMalformed), kUnsyncedContext);

  TEST_ASSERT_EQUAL(CommandError::INVALID_JSON, result.error);
  TEST_ASSERT_FALSE(result.hasCorrelatableId);
}

void test_missing_action_with_valid_id_can_be_correlated_as_error() {
  constexpr char kMissingAction[] = R"json({
    "schema_version": 1,
    "command_id": "550e8400-e29b-41d4-a716-446655440000",
    "locker_id": "LOCKER-001",
    "issued_at": "2026-08-07T08:00:00.000Z",
    "requested_by": "550e8400-e29b-41d4-a716-446655440001"
  })json";
  const CommandParseResult result =
      parseAndValidateCommand(kMissingAction, strlen(kMissingAction), kUnsyncedContext);

  TEST_ASSERT_EQUAL(CommandError::MISSING_FIELD, result.error);
  TEST_ASSERT_TRUE(result.hasCorrelatableId);
}

void test_invalid_action_and_locker_are_rejected_without_actuation() {
  constexpr char kInvalidAction[] = R"json({
    "schema_version": 1,
    "command_id": "550e8400-e29b-41d4-a716-446655440000",
    "locker_id": "LOCKER-001",
    "action": "ERASE_ALL",
    "issued_at": "2026-08-07T08:00:00.000Z",
    "requested_by": "550e8400-e29b-41d4-a716-446655440001"
  })json";
  constexpr char kWrongLocker[] = R"json({
    "schema_version": 1,
    "command_id": "550e8400-e29b-41d4-a716-446655440000",
    "locker_id": "LOCKER-OTHER",
    "action": "LOCK",
    "issued_at": "2026-08-07T08:00:00.000Z",
    "requested_by": "550e8400-e29b-41d4-a716-446655440001"
  })json";

  const CommandParseResult invalidAction =
      parseAndValidateCommand(kInvalidAction, strlen(kInvalidAction), kUnsyncedContext);
  const CommandParseResult wrongLocker =
      parseAndValidateCommand(kWrongLocker, strlen(kWrongLocker), kUnsyncedContext);

  TEST_ASSERT_EQUAL(CommandError::INVALID_ACTION, invalidAction.error);
  TEST_ASSERT_TRUE(invalidAction.hasCorrelatableId);
  TEST_ASSERT_EQUAL(CommandError::LOCKER_MISMATCH, wrongLocker.error);
  TEST_ASSERT_TRUE(wrongLocker.hasCorrelatableId);
}

void test_stale_command_is_rejected_only_when_clock_is_synced() {
  const CommandParseResult stale = parseAndValidateCommand(
      // 2026-08-07T08:00:00Z is Unix epoch 1786089600. This literal is 121
      // seconds later, independently exceeding the 120-second contract limit.
      kValidUnlock, strlen(kValidUnlock), syncedContext(1786089721));
  const CommandParseResult unsynced =
      parseAndValidateCommand(kValidUnlock, strlen(kValidUnlock), kUnsyncedContext);

  TEST_ASSERT_EQUAL(CommandError::STALE_COMMAND, stale.error);
  TEST_ASSERT_TRUE(stale.hasCorrelatableId);
  TEST_ASSERT_TRUE(unsynced.ok());
}

void test_future_command_respects_configured_clock_skew_when_synced() {
  // issued_at is epoch 1786089600. A device clock 30 seconds behind remains
  // within the accepted skew, while 31 seconds behind must fail closed.
  const CommandParseResult boundary = parseAndValidateCommand(
      kValidUnlock, strlen(kValidUnlock), syncedContext(1786089570));
  const CommandParseResult tooFarAhead = parseAndValidateCommand(
      kValidUnlock, strlen(kValidUnlock), syncedContext(1786089569));
  const CommandParseResult unsynced =
      parseAndValidateCommand(kValidUnlock, strlen(kValidUnlock), kUnsyncedContext);

  TEST_ASSERT_TRUE(boundary.ok());
  TEST_ASSERT_EQUAL(CommandError::INVALID_ISSUED_AT, tooFarAhead.error);
  TEST_ASSERT_TRUE(tooFarAhead.hasCorrelatableId);
  TEST_ASSERT_TRUE(unsynced.ok());
}

void test_cached_ack_replays_original_state_with_duplicate_true() {
  RecentCommandCache cache(2);
  const AckRecord original = sampleAck();
  cache.remember(original);
  const AckRecord* cached = cache.find(kCommandId);
  char payload[512] = {};

  TEST_ASSERT_NOT_NULL(cached);
  TEST_ASSERT_TRUE(serializeAck(*cached, true, "2026-08-07T08:00:01Z", payload,
                                sizeof(payload)));

  JsonDocument decoded;
  TEST_ASSERT_FALSE(deserializeJson(decoded, payload));
  TEST_ASSERT_EQUAL_STRING(kCommandId, decoded["command_id"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING("success", decoded["result"].as<const char*>());
  TEST_ASSERT_TRUE(decoded["duplicate"].as<bool>());
  TEST_ASSERT_EQUAL_STRING("UNLOCKED", decoded["device_state"]["lock"].as<const char*>());
  TEST_ASSERT_TRUE(decoded["error"].isNull());
}

void test_cold_boot_state_does_not_claim_lock_position() {
  StateManager state;
  const DeviceState& coldBoot = state.current();

  TEST_ASSERT_EQUAL(LockState::UNKNOWN, coldBoot.lock);
  TEST_ASSERT_EQUAL(DoorState::UNKNOWN, coldBoot.door);
  TEST_ASSERT_EQUAL(AlarmState::INACTIVE, coldBoot.alarm);
  TEST_ASSERT_EQUAL(LedState::OFF, coldBoot.led);

  state.setLock(LockState::LOCKED);
  state.resetForColdBoot();
  TEST_ASSERT_EQUAL(LockState::UNKNOWN, state.current().lock);
}

void test_rearm_open_door_error_has_a_stable_contract_code() {
  TEST_ASSERT_EQUAL_STRING("DOOR_NOT_CLOSED_FOR_ACCESS",
                           toString(CommandError::DOOR_NOT_CLOSED_FOR_ACCESS));
}

}  // namespace

void setUp() {}
void tearDown() {}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_valid_command_has_expected_consumer_fields);
  RUN_TEST(test_malformed_json_has_no_correlatable_ack_id);
  RUN_TEST(test_missing_action_with_valid_id_can_be_correlated_as_error);
  RUN_TEST(test_invalid_action_and_locker_are_rejected_without_actuation);
  RUN_TEST(test_stale_command_is_rejected_only_when_clock_is_synced);
  RUN_TEST(test_future_command_respects_configured_clock_skew_when_synced);
  RUN_TEST(test_cached_ack_replays_original_state_with_duplicate_true);
  RUN_TEST(test_cold_boot_state_does_not_claim_lock_position);
  RUN_TEST(test_rearm_open_door_error_has_a_stable_contract_code);
  return UNITY_END();
}
