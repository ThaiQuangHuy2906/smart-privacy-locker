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
// ===== Các module sống suốt vòng đời chương trình =====
// StateManager giữ trạng thái logic; các controller còn lại giao tiếp phần cứng/mạng.
StateManager stateManager;
WifiProvisioning wifiProvisioning;
MqttClient mqttClient;
LockController lockController;
LedController ledController;
EnvironmentMonitor environmentMonitor;
DisplayController displayController;

// MC-38 được debounce theo cấu hình; cache chống chạy trùng command;
// outbox giữ event cửa trong RAM khi MQTT tạm thời chưa gửi được.
DoorSensor doorSensor(AppConfig::DOOR_DEBOUNCE_MS, AppConfig::MC38_CLOSED_LEVEL_HIGH);
RecentCommandCache recentCommands(AppConfig::RECENT_COMMAND_CACHE_SIZE);
DoorTransitionOutbox doorTransitionOutbox(AppConfig::DOOR_EVENT_OUTBOX_SIZE);

// Hai policy ghép CB2 với an toàn cửa: quyền mở một lần và tự khóa sau khi đóng lại.
DoorAccessController doorAccessController;
DoorAutoLockPolicy autoLockPolicy;

// Ghi mức điện HIGH/LOW ra chân điều khiển buzzer.
void writeBuzzerOutput(bool high) {
  // Adapter nhỏ để AlarmController test được mà không phụ thuộc trực tiếp digitalWrite().
  digitalWrite(static_cast<int>(PinMap::BUZZER_CONTROL), high ? HIGH : LOW);
}

AlarmController alarmController(RuntimeConfig::BUZZER_ACTIVE_HIGH, writeBuzzerOutput);

AckRecord inFlightLockAck;
// Command servo chỉ phát ACK sau khi tick() xác nhận đủ thời gian settle.
bool lockCommandInFlight = false;
// Auto-lock không có command_id/ACK riêng, chỉ cập nhật retained state.
bool autoLockInFlight = false;
bool autoLockPending = false;
// Gộp nhiều yêu cầu publish state; chỉ cần gửi snapshot mới nhất một lần.
bool statePublishPending = false;

// Đọc trực tiếp MC-38 để làm interlock nhanh, không chờ debounce.
bool rawDoorIsClosed();

// Sinh UUID v4 ngẫu nhiên cho mỗi event chuyển trạng thái cửa.
void makeEventId(char* destination, size_t capacity) {
  if (destination == nullptr || capacity < 37) {
    return;
  }
  uint8_t bytes[16] = {};
  esp_fill_random(bytes, sizeof(bytes));
  // Đặt đúng bit version 4 và variant RFC 4122 cho UUID event cửa.
  bytes[6] = static_cast<uint8_t>((bytes[6] & 0x0F) | 0x40);
  bytes[8] = static_cast<uint8_t>((bytes[8] & 0x3F) | 0x80);
  snprintf(destination, capacity,
           "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
           bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]);
}

// Publish event đầu FIFO khi MQTT sẵn sàng và chỉ pop sau khi gửi thành công.
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
    // Chỉ bỏ event đầu FIFO sau khi PubSubClient ghi publish thành công.
    doorTransitionOutbox.pop();
  }
}

// Đánh dấu cần publish snapshot state mới ở thời điểm an toàn kế tiếp.
void requestStatePublish() { statePublishPending = true; }

// Publish retained state sau khi outbox cửa đã hết và MQTT đang kết nối.
void flushPendingStatePublish() {
  // Event cửa có thứ tự ưu tiên; state mới không được vượt qua event còn xếp hàng.
  if (!statePublishPending || !doorTransitionOutbox.empty() || !mqttClient.isConnected()) {
    return;
  }
  if (mqttClient.publishState(stateManager.current(), true)) {
    statePublishPending = false;
  } else {
    Serial.println("MQTT pending state publish failed");
  }
}

// Kiểm tra message có đến đúng topic command của locker hiện tại hay không.
bool expectedCommandTopic(const char* topic) {
  // Không tin riêng callback subscription; tự đối chiếu chính xác topic của locker này.
  char expected[96] = {};
  snprintf(expected, sizeof(expected), "locker/%s/command", AppConfig::LOCKER_ID);
  return topic != nullptr && strcmp(topic, expected) == 0;
}

// Sao chép chuỗi vào buffer cố định và luôn thêm ký tự kết thúc null.
void copyText(char* destination, size_t destinationCapacity, const char* source) {
  // Luôn bảo đảm chuỗi đích kết thúc bằng '\0'.
  if (destinationCapacity == 0) {
    return;
  }
  strncpy(destination, source == nullptr ? "" : source, destinationCapacity - 1);
  destination[destinationCapacity - 1] = '\0';
}

// Tạo AckRecord từ command, kết quả, lỗi và snapshot DeviceState hiện tại.
AckRecord makeAck(const Command& command, AckResult result, CommandError error, const char* message) {
  // ACK chụp snapshot DeviceState tại thời điểm hàm được gọi.
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

// Chuyển mã lỗi command thành thông báo dễ hiểu cho ACK/log.
const char* errorMessage(CommandError error) {
  // Message dành cho log/giao diện; mã ổn định thật sự nằm ở CommandError.
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

// Publish ACK trước rồi yêu cầu publish retained state nếu đây là kết quả mới.
void publishAckAndState(const AckRecord& record, bool duplicate) {
  char timestamp[25] = {};
  const char* timestampValue = formatUtcTimestamp(timestamp, sizeof(timestamp)) ? timestamp : nullptr;
  if (!mqttClient.publishAck(record, duplicate, timestampValue)) {
    Serial.println("MQTT ACK publish failed; command will require timeout reconciliation");
  }
  if (!duplicate) {
    // Ưu tiên ACK để giảm độ trễ command, nhưng không cho retained state mới
    // vượt event cửa đang chờ. loop() sẽ phát state ngay khi FIFO hết.
    requestStatePublish();
  }
}

// Lưu ACK vào cache chống trùng trước khi publish ACK/state.
void rememberAndPublish(const AckRecord& record) {
  // Ghi cache trước khi publish để command retry ngay lập tức vẫn không chạy lại actuator.
  recentCommands.remember(record);
  publishAckAndState(record, false);
}

// Thực hiện các command hoàn tất ngay: buzzer, LED và GET_STATE.
void handleImmediateCommand(const Command& command) {
  // Còi và LED hoàn tất đồng bộ ngay trong callback; khác servo cần chờ tick().
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
    // Không đụng phần cứng; ACK mang snapshot state hiện tại để backend đối soát.
    rememberAndPublish(makeAck(command, AckResult::SUCCESS, CommandError::NONE, ""));
    return;
  }

  rememberAndPublish(makeAck(command, AckResult::ERROR, CommandError::INVALID_ACTION,
                             errorMessage(CommandError::INVALID_ACTION)));
}

// Nhận, validate, chống trùng và phân phối command MQTT đến controller phù hợp.
void onMqttMessage(const char* topic, const uint8_t* payload, unsigned int payloadLength) {
  // Chặn topic lạ và payload không còn chỗ cho ký tự '\0' trước khi copy vào stack.
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
    // Command đã hoàn tất: phát lại ACK cached với duplicate=true, không chạy lại.
    const AckRecord* cached = recentCommands.find(parsed.command.commandId);
    if (cached != nullptr) {
      publishAckAndState(*cached, true);
      return;
    }
    if (lockCommandInFlight && strcmp(inFlightLockAck.commandId, parsed.command.commandId) == 0) {
      // Servo của command gốc vẫn đang chạy. Không chạy lần hai; khi hoàn tất sẽ
      // phát ACK thường, những lần retry sau có thể nhận ACK cached.
      return;
    }
  }

  if (!parsed.ok()) {
    if (!parsed.hasCorrelatableId) {
      // Payload không nhận diện được chỉ tạo log cục bộ; không bịa ACK có
      // command_id=null vì backend không thể tương quan ACK đó với yêu cầu nào.
      Serial.println("Rejected uncorrelatable MQTT command");
      return;
    }
    rememberAndPublish(makeAck(parsed.command, AckResult::ERROR, parsed.error,
                               errorMessage(parsed.error)));
    return;
  }

  if (parsed.command.action == CommandAction::LOCK || parsed.command.action == CommandAction::UNLOCK) {
    // LOCK/UNLOCK đi qua state machine riêng vì SG90 cần thời gian cơ khí.
    const LockState desiredState = parsed.command.action == CommandAction::LOCK
        ? LockState::LOCKED : LockState::UNLOCKED;
    if (desiredState == LockState::LOCKED) {
      // Nhận LOCK là thu hồi quyền mở một lần ngay lập tức, kể cả sau đó servo
      // không chạy được do interlock cửa.
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
      // Kiểm cả stable state lẫn raw GPIO để không khóa khi cửa đang/hơi bắt đầu mở.
      rememberAndPublish(makeAck(parsed.command, AckResult::ERROR, CommandError::DOOR_NOT_CLOSED,
                                 errorMessage(CommandError::DOOR_NOT_CLOSED)));
      return;
    }
    if (desiredState == LockState::UNLOCKED
        && (stateManager.current().door != DoorState::CLOSED || !rawDoorIsClosed())) {
      // ACK UNLOCK thành công phải tạo được một quyền mở dùng được. Từ chối khi
      // cửa không đóng cũng bảo đảm grant cũ không sống sót qua yêu cầu này.
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
        // UNLOCK lặp không quay servo, nhưng sau kiểm tra cửa đóng ở trên vẫn
        // cố ý cấp một lượt mở mới.
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
    // Chưa publish ACK tại đây: chỉ lưu để loop() hoàn tất sau SERVO_SETTLE_MS.
    inFlightLockAck = makeAck(parsed.command, AckResult::SUCCESS, CommandError::NONE, "");
    lockCommandInFlight = true;
    return;
  }

  handleImmediateCommand(parsed.command);
}

// Cho biết đang có command servo hoặc auto-lock nào chưa hoàn tất hay không.
bool isLatchActuationInFlight() {
  // Gộp cả command người dùng và auto-lock để interlock xử lý thống nhất.
  return lockCommandInFlight || autoLockInFlight || lockController.isBusy();
}

// Hủy chuyển động chốt, đặt state UNKNOWN và trả ACK lỗi khi cần.
void cancelInFlightLatch() {
  const bool commandOperation = lockCommandInFlight;
  lockController.cancel();
  // Servo đã đi một phần rồi bị detach thì vị trí logic cũ không còn đáng tin.
  // Đặt UNKNOWN để command sau bắt buộc đưa chốt tới endpoint mới, không no-op.
  stateManager.setLock(LockState::UNKNOWN);
  doorAccessController.revoke();
  if (commandOperation) {
    // Command người dùng cần ACK lỗi tương quan; auto-lock chỉ cần publish state UNKNOWN.
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

// Đọc mức điện MC-38 và quy đổi trực tiếp thành cửa đóng/mở theo polarity.
bool rawDoorIsClosed() {
  // Đường raw bỏ qua debounce, chỉ dùng làm interlock tức thời cho chuyển động servo.
  const bool electricalHigh = digitalRead(static_cast<int>(PinMap::MC38_DOOR_SENSOR)) == HIGH;
  return electricalHigh == AppConfig::MC38_CLOSED_LEVEL_HIGH;
}

// Thử chạy auto-lock đang chờ khi cửa đóng an toàn và servo đang rảnh.
void tryStartPendingAutoLock(unsigned long now) {
  if (!autoLockPending) {
    return;
  }
  if (stateManager.current().door != DoorState::CLOSED) {
    // Stable state đã mở thì pending cũ không còn hợp lệ.
    autoLockPending = false;
    return;
  }
  // Giữ pending qua một nhiễu raw ngắn hơn debounce. Nếu thật sự OPEN ổn định,
  // nhánh trên xóa pending; lần CLOSE ổn định sau sẽ tạo yêu cầu mới. Nhờ đó
  // không cố ý quay chốt khi cửa đang mở.
  if (!rawDoorIsClosed()) {
    return;
  }
  if (lockCommandInFlight || autoLockInFlight || lockController.isBusy()) {
    return;
  }
  if (stateManager.current().lock == LockState::LOCKED) {
    // Đã khóa rồi thì không cần tạo chuyển động/ACK giả.
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

// Tạo yêu cầu tự khóa, thu hồi quyền mở và thử khởi động servo ngay.
void startAutoLock(unsigned long now) {
  // Auto-lock kết thúc chu kỳ quyền mở và không tạo grant mới.
  autoLockPolicy.disarm();
  doorAccessController.revoke();
  if (stateManager.current().door != DoorState::CLOSED) {
    return;
  }
  autoLockPending = true;
  tryStartPendingAutoLock(now);
}

// Debounce MC-38, cập nhật state, phát hiện mở trái phép và điều phối auto-lock.
void processDoorSensor(unsigned long now) {
  DoorTransition doorTransition;
  // sample() chỉ trả true sau khi mức GPIO giữ ổn định đủ thời gian debounce.
  if (!doorSensor.sample(digitalRead(static_cast<int>(PinMap::MC38_DOOR_SENSOR)) == HIGH,
                         now, &doorTransition)) {
    return;
  }

  stateManager.setDoor(doorTransition.current);
  if (!doorTransition.initialStableSample) {
    // Mẫu ổn định đầu tiên sau boot chỉ xác lập state, không được bịa event chuyển cửa.
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
      // Báo động cục bộ chạy ngay cả khi MQTT/cloud đang mất kết nối.
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
    // Nếu FIFO đầy vẫn giữ alarm và local state; chỉ telemetry mới không xếp thêm được.
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

// Đọc lệnh R/r từ USB serial để xóa cấu hình Wi-Fi cục bộ.
void processUsbMaintenanceCommand() {
  // Kênh bảo trì vật lý tối giản: R/r xóa cấu hình Wi-Fi và reboot.
  while (Serial.available() > 0) {
    const int input = Serial.read();
    if (input == 'r' || input == 'R') {
      wifiProvisioning.resetConfigurationAndRestart();
    }
  }
}

}  // namespace

// Khởi tạo serial, trạng thái an toàn, phần cứng, Wi-Fi và MQTT khi ESP32 boot.
void setup() {
  Serial.begin(115200);
  stateManager.resetForColdBoot();
  // Nạp sẵn mức tắt trước khi chuyển GPIO thành OUTPUT để tránh xung LOW làm
  // buzzer kêu lúc boot. GPIO26 đến IN qua 4,7 kOhm; module dùng nguồn 3V3.
  digitalWrite(static_cast<int>(PinMap::BUZZER_CONTROL),
               RuntimeConfig::BUZZER_ACTIVE_HIGH ? LOW : HIGH);
  pinMode(static_cast<int>(PinMap::BUZZER_CONTROL), OUTPUT);
  alarmController.begin();
  stateManager.setAlarm(AlarmState::INACTIVE);
  pinMode(static_cast<int>(PinMap::MC38_DOOR_SENSOR), INPUT_PULLUP);
  doorSensor.reset();
  // Controller servo không di chuyển ở begin(); các output khác về trạng thái an toàn.
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

// Điều phối mọi state machine non-blocking trong suốt thời gian ESP32 hoạt động.
void loop() {
  // Mọi module đều chạy kiểu tick/state machine; không có delay() chặn hệ thống.
  const unsigned long now = millis();
  processUsbMaintenanceCommand();
  wifiProvisioning.tick();
  stateManager.setWifiConnected(wifiProvisioning.isConnected());
  mqttClient.tick(now, stateManager, doorTransitionOutbox.empty());
  // Lấy mẫu cửa đã debounce trước khi công nhận servo hoàn tất. Nếu cửa mở trong
  // lúc servo chạy thì hủy chuyển động và báo lỗi interlock.
  processDoorSensor(millis());
  flushDoorTransitionOutbox();

  const bool rawDoorClosed = rawDoorIsClosed();
  if (isLatchActuationInFlight() && !rawDoorClosed) {
    // Cạnh raw chỉ dùng làm fail-safe tức thời. State/event cửa cho người dùng
    // vẫn phải đi qua debounce ổn định ở processDoorSensor().
    cancelInFlightLatch();
  }

  // mqttClient.tick() có thể bắt đầu servo ngay trong callback MQTT. Đọc lại
  // millis() để elapsed không tính từ mốc lấy trước LockController::start().
  const unsigned long actuatorNow = millis();
  if (doorAccessController.expireIfDue(actuatorNow)
      && stateManager.current().door == DoorState::CLOSED) {
    // Hết 30 giây mà chưa mở cửa: thu hồi grant và tự khóa lại nếu cửa còn đóng.
    startAutoLock(actuatorNow);
  }
  tryStartPendingAutoLock(actuatorNow);
  LockState completedLockState = LockState::UNKNOWN;
  if (lockController.tick(actuatorNow, &completedLockState)
      && (lockCommandInFlight || autoLockInFlight)) {
    // Đây mới là điểm firmware công nhận endpoint chốt và cập nhật logical state.
    stateManager.setLock(completedLockState);
    if (completedLockState == LockState::UNLOCKED) {
      doorAccessController.grantNextOpen(stateManager.current().door, actuatorNow);
    } else {
      doorAccessController.revoke();
    }
    if (lockCommandInFlight) {
      // ACK của command SG90 chứa state sau khi chuyển động hoàn tất.
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

  // YC1 chạy cuối vòng lặp: đọc DHT theo chu kỳ rồi render OLED nếu cần.
  environmentMonitor.tick(now);
  displayController.tick(now, environmentMonitor.latest(), stateManager.current());
}
