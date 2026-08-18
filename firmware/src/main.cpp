#include <Arduino.h>

#include <string.h>
#include <time.h>

#include <esp_system.h>

#include "ack_publisher.h"
#include "alarm_controller.h"
#include "command_handler.h"
#include "display_controller.h"
#include "door_sensor.h"
#include "door_security.h"
#include "environment_monitor.h"
#include "led_controller.h"
#include "lock_controller.h"
#include "mqtt_client.h"
#include "pin_map.h"
#include "runtime_config.h"
#include "state_manager.h"
#include "time_utils.h"
#include "wifi_provisioning.h"

namespace {
StateManager stateManager;
WifiProvisioning wifiProvisioning;
MqttClient mqttClient;
LockController lockController;
LedController ledController;
EnvironmentMonitor environmentMonitor;
DisplayController displayController;
DoorSensor doorSensor(AppConfig::DOOR_DEBOUNCE_MS, AppConfig::MC38_CLOSED_LEVEL_HIGH);
RecentCommandCache recentCommands(AppConfig::RECENT_COMMAND_CACHE_SIZE);
DoorTransitionOutbox doorTransitionOutbox(AppConfig::DOOR_EVENT_OUTBOX_SIZE);
DoorAccessController doorAccessController;
DoorAutoLockPolicy autoLockPolicy;

void writeBuzzerOutput(bool high) {
  digitalWrite(static_cast<int>(PinMap::BUZZER_CONTROL), high ? HIGH : LOW);
}

AlarmController alarmController(RuntimeConfig::BUZZER_ACTIVE_HIGH, writeBuzzerOutput);

AckRecord inFlightLockAck;
bool lockCommandInFlight = false;
bool autoLockInFlight = false;
bool autoLockPending = false;
bool statePublishPending = false;

bool rawDoorIsClosed();

void makeEventId(char* destination, size_t capacity) {
  if (destination == nullptr || capacity < 37) {
    return;
  }
  uint8_t bytes[16] = {};
  esp_fill_random(bytes, sizeof(bytes));
  bytes[6] = static_cast<uint8_t>((bytes[6] & 0x0F) | 0x40);
  bytes[8] = static_cast<uint8_t>((bytes[8] & 0x3F) | 0x80);
  snprintf(destination, capacity,
           "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
           bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]);
}

void flushDoorTransitionOutbox() {
  if (!mqttClient.isConnected()) {
    return;
  }
  const DoorTransitionRecord* record = doorTransitionOutbox.front();
  if (record == nullptr) {
    return;
  }
  if (mqttClient.publishDoorTransition(record->previous, record->current,
                                       record->timeSynced ? record->timestamp : nullptr,
                                       record->timeSynced, record->eventId, record->access)) {
    doorTransitionOutbox.pop();
  }
}

void requestStatePublish() { statePublishPending = true; }

void flushPendingStatePublish() {
  if (!statePublishPending || !doorTransitionOutbox.empty() || !mqttClient.isConnected()) {
    return;
  }
  if (mqttClient.publishState(stateManager.current(), true)) {
    statePublishPending = false;
  } else {
    Serial.println("MQTT pending state publish failed");
  }
}

bool expectedCommandTopic(const char* topic) {
  char expected[96] = {};
  snprintf(expected, sizeof(expected), "locker/%s/command", AppConfig::LOCKER_ID);
  return topic != nullptr && strcmp(topic, expected) == 0;
}

void copyText(char* destination, size_t destinationCapacity, const char* source) {
  if (destinationCapacity == 0) {
    return;
  }
  strncpy(destination, source == nullptr ? "" : source, destinationCapacity - 1);
  destination[destinationCapacity - 1] = '\0';
}

AckRecord makeAck(const Command& command, AckResult result, CommandError error, const char* message) {
  AckRecord record;
  copyText(record.commandId, sizeof(record.commandId), command.commandId);
  copyText(record.lockerId, sizeof(record.lockerId), command.lockerId);
  record.action = command.action;
  record.result = result;
  record.state = stateManager.current();
  record.error = error;
  copyText(record.errorMessage, sizeof(record.errorMessage), message);
  return record;
}

const char* errorMessage(CommandError error) {
  switch (error) {
    case CommandError::INVALID_SCHEMA:
      return "schema_version must be 1";
    case CommandError::MISSING_FIELD:
      return "A required command field is missing or invalid";
    case CommandError::INVALID_ACTION:
      return "Action is not allowed";
    case CommandError::INVALID_REQUESTED_BY:
      return "requested_by must be a user UUID or approved service principal";
    case CommandError::INVALID_ISSUED_AT:
      return "issued_at must be valid UTC and within the accepted future clock skew";
    case CommandError::LOCKER_MISMATCH:
      return "locker_id does not match the command topic/device";
    case CommandError::STALE_COMMAND:
      return "Command is outside the accepted age window";
    case CommandError::DOOR_NOT_CLOSED:
      return "Close the door before locking the latch";
    case CommandError::DOOR_NOT_CLOSED_FOR_ACCESS:
      return "Close the door before granting another opening";
    case CommandError::ACTUATION_FAILED:
      return "Requested actuator is unavailable or busy";
    default:
      return "Command validation failed";
  }
}

void publishAckAndState(const AckRecord& record, bool duplicate) {
  char timestamp[25] = {};
  const char* timestampValue = formatUtcTimestamp(timestamp, sizeof(timestamp)) ? timestamp : nullptr;
  if (!mqttClient.publishAck(record, duplicate, timestampValue)) {
    Serial.println("MQTT ACK publish failed; command will require timeout reconciliation");
  }
  if (!duplicate) {
    // Keep ACK latency low, but do not let a newer retained state overtake a
    // queued door edge. The main loop publishes the state as soon as the FIFO
    // has drained.
    requestStatePublish();
  }
}

void rememberAndPublish(const AckRecord& record) {
  recentCommands.remember(record);
  publishAckAndState(record, false);
}

void handleImmediateCommand(const Command& command) {
  if (command.action == CommandAction::ALARM_ON || command.action == CommandAction::ALARM_OFF) {
    const bool shouldBeActive = command.action == CommandAction::ALARM_ON;
    if (!alarmController.setActive(shouldBeActive)) {
      rememberAndPublish(makeAck(command, AckResult::ERROR, CommandError::ACTUATION_FAILED,
                                 errorMessage(CommandError::ACTUATION_FAILED)));
      return;
    }
    stateManager.setAlarm(shouldBeActive ? AlarmState::ACTIVE : AlarmState::INACTIVE);
    rememberAndPublish(makeAck(command, AckResult::SUCCESS, CommandError::NONE, ""));
    return;
  }

  if (command.action == CommandAction::LED_ON || command.action == CommandAction::LED_OFF) {
    const bool shouldBeOn = command.action == CommandAction::LED_ON;
    ledController.setOn(shouldBeOn);
    stateManager.setLed(shouldBeOn ? LedState::ON : LedState::OFF);
    rememberAndPublish(makeAck(command, AckResult::SUCCESS, CommandError::NONE, ""));
    return;
  }

  if (command.action == CommandAction::GET_STATE) {
    rememberAndPublish(makeAck(command, AckResult::SUCCESS, CommandError::NONE, ""));
    return;
  }

  rememberAndPublish(makeAck(command, AckResult::ERROR, CommandError::INVALID_ACTION,
                             errorMessage(CommandError::INVALID_ACTION)));
}

void onMqttMessage(const char* topic, const uint8_t* payload, unsigned int payloadLength) {
  if (!expectedCommandTopic(topic) || payloadLength >= RuntimeConfig::MQTT_PACKET_SIZE) {
    Serial.println("Rejected MQTT message with an unexpected topic or size");
    return;
  }

  char json[RuntimeConfig::MQTT_PACKET_SIZE] = {};
  memcpy(json, payload, payloadLength);
  json[payloadLength] = '\0';
  const CommandValidationContext context = {
      AppConfig::LOCKER_ID,
      AppConfig::LOCKER_ID,
      isTimeSynced(),
      static_cast<int64_t>(time(nullptr)),
      AppConfig::COMMAND_MAX_AGE_SECONDS,
      AppConfig::COMMAND_MAX_FUTURE_SKEW_SECONDS,
  };
  const CommandParseResult parsed = parseAndValidateCommand(json, payloadLength, context);

  if (parsed.hasCorrelatableId) {
    const AckRecord* cached = recentCommands.find(parsed.command.commandId);
    if (cached != nullptr) {
      publishAckAndState(*cached, true);
      return;
    }
    if (lockCommandInFlight && strcmp(inFlightLockAck.commandId, parsed.command.commandId) == 0) {
      // The original actuation is still running. Do not act a second time;
      // completion will publish its normal ACK, which a duplicate can replay.
      return;
    }
  }

  if (!parsed.ok()) {
    if (!parsed.hasCorrelatableId) {
      // Contract: malformed/unidentifiable input produces only local diagnostic,
      // never a fabricated `command_id:null` ACK.
      Serial.println("Rejected uncorrelatable MQTT command");
      return;
    }
    rememberAndPublish(makeAck(parsed.command, AckResult::ERROR, parsed.error,
                               errorMessage(parsed.error)));
    return;
  }

  if (parsed.command.action == CommandAction::LOCK || parsed.command.action == CommandAction::UNLOCK) {
    const LockState desiredState = parsed.command.action == CommandAction::LOCK
        ? LockState::LOCKED : LockState::UNLOCKED;
    if (desiredState == LockState::LOCKED) {
      // A lock request immediately revokes any unused one-time opening grant,
      // including when the movement later fails its door interlock.
      doorAccessController.revoke();
    }
    if (lockCommandInFlight || lockController.isBusy()) {
      rememberAndPublish(makeAck(parsed.command, AckResult::ERROR,
                                 CommandError::ACTUATION_FAILED,
                                 errorMessage(CommandError::ACTUATION_FAILED)));
      return;
    }
    if (desiredState == LockState::LOCKED
        && (stateManager.current().door != DoorState::CLOSED || !rawDoorIsClosed())) {
      rememberAndPublish(makeAck(parsed.command, AckResult::ERROR, CommandError::DOOR_NOT_CLOSED,
                                 errorMessage(CommandError::DOOR_NOT_CLOSED)));
      return;
    }
    if (desiredState == LockState::UNLOCKED
        && (stateManager.current().door != DoorState::CLOSED || !rawDoorIsClosed())) {
      // An ACKed UNLOCK must always create a usable one-time opening grant.
      // Rejecting here also prevents any stale grant from surviving an open-door request.
      doorAccessController.revoke();
      rememberAndPublish(makeAck(parsed.command, AckResult::ERROR,
                                 CommandError::DOOR_NOT_CLOSED_FOR_ACCESS,
                                 errorMessage(CommandError::DOOR_NOT_CLOSED_FOR_ACCESS)));
      return;
    }
    autoLockPolicy.disarm();
    autoLockPending = false;
    if (stateManager.current().lock == desiredState) {
      if (desiredState == LockState::UNLOCKED) {
        // Repeating UNLOCK does not move the servo; it deliberately grants one
        // new opening after the universal closed-door check above.
        doorAccessController.grantNextOpen(stateManager.current().door, millis());
      }
      rememberAndPublish(makeAck(parsed.command, AckResult::SUCCESS, CommandError::NONE, ""));
      return;
    }
    if (!lockController.start(desiredState, millis())) {
      rememberAndPublish(makeAck(parsed.command, AckResult::ERROR, CommandError::ACTUATION_FAILED,
                                 errorMessage(CommandError::ACTUATION_FAILED)));
      return;
    }
    inFlightLockAck = makeAck(parsed.command, AckResult::SUCCESS, CommandError::NONE, "");
    lockCommandInFlight = true;
    return;
  }

  handleImmediateCommand(parsed.command);
}

bool isLatchActuationInFlight() {
  return lockCommandInFlight || autoLockInFlight || lockController.isBusy();
}

void cancelInFlightLatch() {
  const bool commandOperation = lockCommandInFlight;
  lockController.cancel();
  // Once a servo has started moving and is detached early, its old logical
  // position is no longer trustworthy. Force the next LOCK/UNLOCK to move the
  // latch to a newly confirmed endpoint instead of taking a same-state no-op.
  stateManager.setLock(LockState::UNKNOWN);
  doorAccessController.revoke();
  if (commandOperation) {
    const CommandError doorError = inFlightLockAck.action == CommandAction::UNLOCK
        ? CommandError::DOOR_NOT_CLOSED_FOR_ACCESS : CommandError::DOOR_NOT_CLOSED;
    inFlightLockAck.result = AckResult::ERROR;
    inFlightLockAck.error = doorError;
    inFlightLockAck.state = stateManager.current();
    copyText(inFlightLockAck.errorMessage, sizeof(inFlightLockAck.errorMessage),
             errorMessage(doorError));
    rememberAndPublish(inFlightLockAck);
  } else {
    requestStatePublish();
  }
  lockCommandInFlight = false;
  autoLockInFlight = false;
  autoLockPending = false;
  Serial.println("Latch actuation cancelled because the door opened");
}

bool rawDoorIsClosed() {
  const bool electricalHigh = digitalRead(static_cast<int>(PinMap::MC38_DOOR_SENSOR)) == HIGH;
  return electricalHigh == AppConfig::MC38_CLOSED_LEVEL_HIGH;
}

void tryStartPendingAutoLock(unsigned long now) {
  if (!autoLockPending) {
    return;
  }
  if (stateManager.current().door != DoorState::CLOSED) {
    autoLockPending = false;
    return;
  }
  // Keep the request pending across a sub-debounce raw HIGH/LOW glitch. A real
  // stable OPEN clears it above and the following stable CLOSE requests a new
  // auto-lock, so the servo is never deliberately driven against an open door.
  if (!rawDoorIsClosed()) {
    return;
  }
  if (lockCommandInFlight || autoLockInFlight || lockController.isBusy()) {
    return;
  }
  if (stateManager.current().lock == LockState::LOCKED) {
    autoLockPending = false;
    return;
  }
  if (!lockController.start(LockState::LOCKED, now)) {
    autoLockPending = false;
    Serial.println("Automatic latch lock could not start");
    requestStatePublish();
    return;
  }
  autoLockPending = false;
  autoLockInFlight = true;
  Serial.println("Automatic latch lock started after stable door close");
}

void startAutoLock(unsigned long now) {
  autoLockPolicy.disarm();
  doorAccessController.revoke();
  if (stateManager.current().door != DoorState::CLOSED) {
    return;
  }
  autoLockPending = true;
  tryStartPendingAutoLock(now);
}

void processDoorSensor(unsigned long now) {
  DoorTransition doorTransition;
  if (!doorSensor.sample(digitalRead(static_cast<int>(PinMap::MC38_DOOR_SENSOR)) == HIGH,
                         now, &doorTransition)) {
    return;
  }

  stateManager.setDoor(doorTransition.current);
  if (!doorTransition.initialStableSample) {
    if (doorTransition.current != DoorState::CLOSED) {
      autoLockPending = false;
    }
    if (shouldCancelLatchActuation(doorTransition.current, isLatchActuationInFlight())) {
      cancelInFlightLatch();
    }
    const DoorAccessResult access = doorAccessController.evaluateTransition(
        doorTransition.previous, doorTransition.current,
        stateManager.current().lock, now);
    const bool shouldAutoLock = autoLockPolicy.observeTransition(
        doorTransition.previous, doorTransition.current);
    if (access == DoorAccessResult::UNAUTHORIZED
        && stateManager.current().alarm != AlarmState::ACTIVE) {
      if (alarmController.setActive(true)) {
        stateManager.setAlarm(AlarmState::ACTIVE);
        Serial.println("Local unauthorized-open alarm activated");
      } else {
        Serial.println("Local unauthorized-open alarm actuation failed");
      }
    }
    DoorTransitionRecord record;
    record.previous = doorTransition.previous;
    record.current = doorTransition.current;
    record.access = access;
    record.timeSynced = formatUtcTimestamp(record.timestamp, sizeof(record.timestamp));
    makeEventId(record.eventId, sizeof(record.eventId));
    if (!doorTransitionOutbox.enqueue(record)) {
      Serial.println("Door event outbox full; local alarm/state remain active");
    }
    flushDoorTransitionOutbox();
    if (shouldAutoLock) {
      startAutoLock(now);
    }
  }
  requestStatePublish();
}

void processUsbMaintenanceCommand() {
  while (Serial.available() > 0) {
    const int input = Serial.read();
    if (input == 'r' || input == 'R') {
      wifiProvisioning.resetConfigurationAndRestart();
    }
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  stateManager.resetForColdBoot();
  // Load the safe inactive latch before enabling output. This avoids an
  // active-low pulse during boot. GPIO26 reaches the selected module IN pin
  // through 4.7 kOhm; the module VCC is powered from ESP32 3V3.
  digitalWrite(static_cast<int>(PinMap::BUZZER_CONTROL),
               RuntimeConfig::BUZZER_ACTIVE_HIGH ? LOW : HIGH);
  pinMode(static_cast<int>(PinMap::BUZZER_CONTROL), OUTPUT);
  alarmController.begin();
  stateManager.setAlarm(AlarmState::INACTIVE);
  pinMode(static_cast<int>(PinMap::MC38_DOOR_SENSOR), INPUT_PULLUP);
  doorSensor.reset();
  lockController.begin();
  ledController.begin();
  environmentMonitor.begin();
  if (!displayController.begin()) {
    Serial.println("OLED initialization failed; firmware continues without display");
  }
  wifiProvisioning.begin();
  mqttClient.begin(onMqttMessage);
  Serial.println("Smart Privacy Locker firmware started; send R on USB serial to erase Wi-Fi config");
}

void loop() {
  const unsigned long now = millis();
  processUsbMaintenanceCommand();
  wifiProvisioning.tick();
  stateManager.setWifiConnected(wifiProvisioning.isConnected());
  mqttClient.tick(now, stateManager, doorTransitionOutbox.empty());
  // Sample the debounced door before completing any in-flight latch move. If the
  // door opened during servo travel, cancel and report the interlock failure.
  processDoorSensor(millis());
  flushDoorTransitionOutbox();

  const bool rawDoorClosed = rawDoorIsClosed();
  if (isLatchActuationInFlight() && !rawDoorClosed) {
    // The raw edge is used only as a fail-safe interlock. User-visible door
    // state and events still require the normal stable debounce path.
    cancelInFlightLatch();
  }

  // mqttClient.tick() can synchronously start the servo from its MQTT callback.
  // Refresh the timestamp so elapsed time is never calculated from a value
  // captured before LockController::start().
  const unsigned long actuatorNow = millis();
  if (doorAccessController.expireIfDue(actuatorNow)
      && stateManager.current().door == DoorState::CLOSED) {
    startAutoLock(actuatorNow);
  }
  tryStartPendingAutoLock(actuatorNow);
  LockState completedLockState = LockState::UNKNOWN;
  if (lockController.tick(actuatorNow, &completedLockState)
      && (lockCommandInFlight || autoLockInFlight)) {
    stateManager.setLock(completedLockState);
    if (completedLockState == LockState::UNLOCKED) {
      doorAccessController.grantNextOpen(stateManager.current().door, actuatorNow);
    } else {
      doorAccessController.revoke();
    }
    if (lockCommandInFlight) {
      inFlightLockAck.state = stateManager.current();
      rememberAndPublish(inFlightLockAck);
    } else if (autoLockInFlight) {
      requestStatePublish();
      Serial.println("Automatic latch lock completed");
    }
    lockCommandInFlight = false;
    autoLockInFlight = false;
  }

  flushPendingStatePublish();

  environmentMonitor.tick(now);
  displayController.tick(now, environmentMonitor.latest(), stateManager.current());
}
