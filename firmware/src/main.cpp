#include <Arduino.h>

#include <string.h>
#include <time.h>

#include "ack_publisher.h"
#include "alarm_controller.h"
#include "command_handler.h"
#include "display_controller.h"
#include "door_sensor.h"
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

void writeBuzzerOutput(bool high) {
  digitalWrite(static_cast<int>(PinMap::BUZZER_CONTROL), high ? HIGH : LOW);
}

AlarmController alarmController(AppConfig::BUZZER_ACTIVE_HIGH, writeBuzzerOutput);

AckRecord inFlightLockAck;
bool lockCommandInFlight = false;

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
      return "issued_at must be an ISO 8601 UTC timestamp";
    case CommandError::LOCKER_MISMATCH:
      return "locker_id does not match the command topic/device";
    case CommandError::STALE_COMMAND:
      return "Command is outside the accepted age window";
    case CommandError::ACTUATION_FAILED:
      return "Requested actuator is unavailable or busy";
    default:
      return "Command validation failed";
  }
}

void publishAckAndState(const AckRecord& record, bool duplicate) {
  char timestamp[25] = {};
  const char* timestampValue = formatUtcTimestamp(timestamp, sizeof(timestamp)) ? timestamp : nullptr;
  mqttClient.publishAck(record, duplicate, timestampValue);
  if (!duplicate) {
    mqttClient.publishState(stateManager.current(), true);
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
  if (!expectedCommandTopic(topic) || payloadLength >= MQTT_MAX_PACKET_SIZE) {
    Serial.println("Rejected MQTT message with an unexpected topic or size");
    return;
  }

  char json[MQTT_MAX_PACKET_SIZE] = {};
  memcpy(json, payload, payloadLength);
  json[payloadLength] = '\0';
  const CommandValidationContext context = {
      AppConfig::LOCKER_ID,
      AppConfig::LOCKER_ID,
      isTimeSynced(),
      static_cast<int64_t>(time(nullptr)),
      AppConfig::COMMAND_MAX_AGE_SECONDS,
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
    if (!lockController.start(parsed.command.action == CommandAction::LOCK ? LockState::LOCKED
                                                                            : LockState::UNLOCKED,
                              millis())) {
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
  // active-low driver pulse during boot. GPIO26 only drives the external
  // MOSFET/driver input; it never powers the 5 V buzzer load directly.
  digitalWrite(static_cast<int>(PinMap::BUZZER_CONTROL),
               AppConfig::BUZZER_ACTIVE_HIGH ? LOW : HIGH);
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
  mqttClient.tick(now, stateManager);

  LockState completedLockState = LockState::UNKNOWN;
  if (lockController.tick(now, &completedLockState) && lockCommandInFlight) {
    stateManager.setLock(completedLockState);
    inFlightLockAck.state = stateManager.current();
    rememberAndPublish(inFlightLockAck);
    lockCommandInFlight = false;
  }

  environmentMonitor.tick(now);
  displayController.tick(now, environmentMonitor.latest(), stateManager.current());

  DoorTransition doorTransition;
  if (doorSensor.sample(digitalRead(static_cast<int>(PinMap::MC38_DOOR_SENSOR)) == HIGH,
                        now, &doorTransition)) {
    stateManager.setDoor(doorTransition.current);
    if (!doorTransition.initialStableSample) {
      char timestamp[25] = {};
      const bool timeSynced = formatUtcTimestamp(timestamp, sizeof(timestamp));
      mqttClient.publishDoorTransition(doorTransition.previous, doorTransition.current,
                                       timeSynced ? timestamp : nullptr, timeSynced);
    }
    mqttClient.publishState(stateManager.current(), true);
  }
}
