#include "mqtt_client.h"

#include <Arduino.h>
#include <ArduinoJson.h>

#include <algorithm>
#include <string.h>

#include "runtime_config.h"
#include "time_utils.h"

MqttClient* MqttClient::activeInstance_ = nullptr;

// Tạo PubSubClient ban đầu với WiFiClient thường; begin() sẽ đổi sang TLS nếu cấu hình.
MqttClient::MqttClient() : mqtt_(plainClient_) {}

// Khởi tạo callback, buffer, transport và địa chỉ broker MQTT.
void MqttClient::begin(MqttMessageCallback messageCallback) {
  // PubSubClient yêu cầu callback tĩnh; activeInstance_ chuyển tiếp về đúng object.
  activeInstance_ = this;
  messageCallback_ = messageCallback;
  reconnectDelayMs_ = AppConfig::MQTT_RECONNECT_INITIAL_MS;
  retryTimer_.clear();
  heartbeatTimer_.clear();
  bootstrapStatePending_ = false;
  bufferReady_ = mqtt_.setBufferSize(RuntimeConfig::MQTT_PACKET_SIZE);
  if (!bufferReady_) {
    Serial.println("MQTT buffer allocation failed; connection attempts are suppressed");
  }
  mqtt_.setCallback(dispatchMessage);

  if (AppConfig::MQTT_USE_TLS) {
    // CA chỉ đến từ cấu hình cục bộ bị Git bỏ qua. Không dùng setInsecure(),
    // vì như vậy TLS sẽ mã hóa nhưng không xác thực đúng broker.
    secureClient_.setCACert(Secrets::MQTT_CA_CERT);
    mqtt_.setClient(secureClient_);
  } else {
    mqtt_.setClient(plainClient_);
  }
  mqtt_.setServer(Secrets::MQTT_HOST, AppConfig::MQTT_PORT);
}

// Duy trì kết nối, xử lý message, bootstrap state, heartbeat và retry non-blocking.
void MqttClient::tick(unsigned long now, StateManager& state, bool doorOutboxEmpty) {
  if (mqtt_.connected()) {
    // connect() đã phát retained ONLINE, nhưng retained full state phải chờ mọi
    // cạnh cửa lưu cục bộ được gửi hết. Chưa gọi mqtt_.loop() ở giai đoạn này,
    // vì GET_STATE có thể chen vào và làm state mới vượt trước event cũ.
    if (bootstrapStatePending_) {
      if (!doorOutboxEmpty) {
        return;
      }
      if (!publishState(state.current(), true)) {
        state.setMqttConnected(false);
        heartbeatTimer_.clear();
        disconnectWithOfflineFallback();
        scheduleRetry(now);
        Serial.println("MQTT bootstrap state publish failed; disconnected and retry scheduled");
        return;
      }
      bootstrapStatePending_ = false;
      heartbeatTimer_.reset(static_cast<uint32_t>(now));
      Serial.println("MQTT transition outbox drained; retained bootstrap state published");
      return;
    }
    mqtt_.loop();
    // loop() vừa xử lý socket và có thể phát hiện mất broker.
    if (!mqtt_.connected()) {
      state.setMqttConnected(false);
      heartbeatTimer_.clear();
      bootstrapStatePending_ = false;
      scheduleRetry(now);
      return;
    }
    if (heartbeatTimer_.due(static_cast<uint32_t>(now),
                            AppConfig::MQTT_HEARTBEAT_INTERVAL_MS)) {
      if (!doorOutboxEmpty) {
        // Không cho snapshot mới vượt các cạnh cửa vật lý trong FIFO; giữ timer
        // ở trạng thái due để thử lại ngay sau khi outbox hết.
        return;
      }
      // Heartbeat cố ý không retained. Ngay sau đó refresh retained state để
      // backend chứng minh được cả liveness và trạng thái hiện tại, nhưng không
      // sinh event DEVICE_ONLINE định kỳ trong lịch sử.
      const bool heartbeatPublished = publishHeartbeat();
      const bool statePublished = heartbeatPublished && publishState(state.current(), true);
      if (!heartbeatPublished || !statePublished) {
        state.setMqttConnected(false);
        heartbeatTimer_.clear();
        disconnectWithOfflineFallback();
        scheduleRetry(now);
        Serial.println("MQTT heartbeat/state publish failed; disconnected and retry scheduled");
        return;
      }
      heartbeatTimer_.reset(static_cast<uint32_t>(now));
    }
    return;
  }

  state.setMqttConnected(false);
  // Khi offline chỉ thử lại lúc timer đến hạn, nên loop() vẫn phục vụ sensor/display.
  if (!retryTimer_.due(static_cast<uint32_t>(now))) {
    return;
  }
  if (!configured()) {
    if (!configurationWarningPrinted_) {
      Serial.println("MQTT configuration incomplete; connection attempts are suppressed");
      configurationWarningPrinted_ = true;
    }
    scheduleRetry(now);
    return;
  }
  if (!connect(now, state)) {
    return;
  }
}

// Cho biết transport MQTT hiện đang kết nối với broker hay không.
bool MqttClient::isConnected() { return mqtt_.connected(); }

// Serialize và publish ACK không retained lên topic của locker.
bool MqttClient::publishAck(const AckRecord& record, bool duplicate, const char* timestamp) {
  if (!mqtt_.connected()) {
    return false;
  }
  char topic[96] = {};
  char payload[RuntimeConfig::MQTT_PACKET_SIZE] = {};
  makeTopic("ack", topic, sizeof(topic));
  if (!serializeAck(record, duplicate, timestamp, payload, sizeof(payload))) {
    Serial.println("ACK serialization failed");
    return false;
  }
  // PubSubClient phát QoS 0. Hệ thống dựa vào command_id, timeout/đối soát và
  // chống trùng; không tuyên bố sai rằng ACK có đảm bảo giao QoS 1.
  return mqtt_.publish(topic, payload, false);
}

// Serialize và publish snapshot trạng thái đầy đủ của thiết bị.
bool MqttClient::publishState(const DeviceState& state, bool retained) {
  if (!mqtt_.connected()) {
    return false;
  }
  JsonDocument document;
  document["schema_version"] = 1;
  document["locker_id"] = AppConfig::LOCKER_ID;
  document["door"] = toString(state.door);
  document["lock"] = toString(state.lock);
  document["alarm"] = toString(state.alarm);
  document["led"] = toString(state.led);
  document["wifi_connected"] = state.wifiConnected;
  document["mqtt_connected"] = state.mqttConnected;
  // Khi NTP chưa sẵn sàng vẫn phát state, nhưng timestamp phải là null trung thực.
  char timestamp[25] = {};
  if (formatUtcTimestamp(timestamp, sizeof(timestamp))) {
    document["timestamp"] = timestamp;
  } else {
    document["timestamp"] = nullptr;
  }

  char topic[96] = {};
  char payload[RuntimeConfig::MQTT_PACKET_SIZE] = {};
  makeTopic("state", topic, sizeof(topic));
  if (serializeJson(document, payload, sizeof(payload)) >= sizeof(payload)) {
    Serial.println("State serialization failed");
    return false;
  }
  return mqtt_.publish(topic, payload, retained);
}

// Publish một cạnh cửa vật lý không retained kèm quyền truy cập và event_id.
bool MqttClient::publishDoorTransition(DoorState previous, DoorState current,
                                       const char* timestamp, bool timeSynced,
                                       const char* eventId, DoorAccessResult access) {
  const bool validAccess = current == DoorState::OPEN
      ? access != DoorAccessResult::NOT_APPLICABLE
      : access == DoorAccessResult::NOT_APPLICABLE;
  // Event OPEN bắt buộc có authorized=true/false; event CLOSED phải là N/A.
  if (!mqtt_.connected() || previous == DoorState::UNKNOWN ||
      (current != DoorState::OPEN && current != DoorState::CLOSED) ||
      eventId == nullptr || strlen(eventId) != 36 || !validAccess) {
    return false;
  }
  JsonDocument document;
  document["schema_version"] = 1;
  document["locker_id"] = AppConfig::LOCKER_ID;
  document["previous_state"] = toString(previous);
  document["state"] = toString(current);
  if (timeSynced && timestamp != nullptr) {
    document["timestamp"] = timestamp;
  } else {
    document["timestamp"] = nullptr;
  }
  document["time_synced"] = timeSynced;
  document["event_id"] = eventId;
  if (current == DoorState::OPEN) {
    document["authorized"] = access == DoorAccessResult::AUTHORIZED;
  } else {
    document["authorized"] = nullptr;
  }

  char topic[112] = {};
  char payload[320] = {};
  makeTopic("telemetry/door", topic, sizeof(topic));
  if (serializeJson(document, payload, sizeof(payload)) >= sizeof(payload)) {
    Serial.println("Door telemetry serialization failed");
    return false;
  }
  // Transition cửa không retained để consumer mới không nhận lại một lần mở cũ.
  // Trạng thái cửa hiện tại được gửi riêng trong retained full state.
  return mqtt_.publish(topic, payload, false);
}

// Tắt heartbeat và ngắt MQTT sau khi cố gắng báo OFFLINE.
void MqttClient::disconnectGracefully() {
  heartbeatTimer_.clear();
  disconnectWithOfflineFallback();
}

// Chuyển callback tĩnh của PubSubClient đến instance MqttClient đang hoạt động.
void MqttClient::dispatchMessage(char* topic, uint8_t* payload, unsigned int payloadLength) {
  // Cầu nối callback C tĩnh của thư viện sang instance MqttClient đang hoạt động.
  if (activeInstance_ != nullptr) {
    activeInstance_->handleMessage(topic, payload, payloadLength);
  }
}

// Chuyển message nhận được sang callback nghiệp vụ đã đăng ký từ main.cpp.
void MqttClient::handleMessage(const char* topic, const uint8_t* payload, unsigned int payloadLength) {
  if (messageCallback_ != nullptr) {
    messageCallback_(topic, payload, payloadLength);
  }
}

// Kết nối broker, đăng ký LWT, subscribe command và bắt đầu bootstrap state.
bool MqttClient::connect(unsigned long now, StateManager& state) {
  char availabilityTopic[96] = {};
  char lwtPayload[160] = {};
  char clientId[80] = {};
  makeTopic("availability", availabilityTopic, sizeof(availabilityTopic));

  // Last Will được broker tự phát retained nếu ESP32 rớt mạng mà không DISCONNECT sạch.
  JsonDocument lwt;
  lwt["schema_version"] = 1;
  lwt["locker_id"] = AppConfig::LOCKER_ID;
  lwt["status"] = "OFFLINE";
  char timestamp[25] = {};
  if (formatUtcTimestamp(timestamp, sizeof(timestamp))) {
    lwt["sent_at"] = timestamp;
  } else {
    lwt["sent_at"] = nullptr;
  }
  if (serializeJson(lwt, lwtPayload, sizeof(lwtPayload)) >= sizeof(lwtPayload)) {
    Serial.println("LWT serialization failed");
    scheduleRetry(now);
    return false;
  }

  const uint64_t chipId = ESP.getEfuseMac();
  // Ghép 16 bit cuối chip ID để giảm khả năng trùng MQTT client ID.
  snprintf(clientId, sizeof(clientId), "locker-%s-%04X", AppConfig::LOCKER_ID,
           static_cast<unsigned int>(chipId & 0xFFFF));
  if (!mqtt_.connect(clientId, Secrets::MQTT_USERNAME, Secrets::MQTT_PASSWORD, availabilityTopic, 0,
                     true, lwtPayload, true)) {
    Serial.println("MQTT connection failed; retry scheduled");
    scheduleRetry(now);
    return false;
  }

  char commandTopic[96] = {};
  makeTopic("command", commandTopic, sizeof(commandTopic));
  if (!mqtt_.subscribe(commandTopic, 0)) {
    // Không gửi được gói SUBSCRIBE qua transport cục bộ thì không được để lại
    // trạng thái retained ONLINE giả.
    state.setMqttConnected(false);
    disconnectWithOfflineFallback();
    scheduleRetry(now);
    Serial.println("MQTT command SUBSCRIBE packet send failed; disconnected and retry scheduled");
    return false;
  }

  // PubSubClient 2.8 trả true sau khi transport ghi SUBSCRIBE, không chờ/expose
  // SUBACK của broker. Callback chỉ chạy ở mqtt_.loop() sau đó. Vì vậy phát
  // ONLINE trước, còn tick() trì hoãn callback và retained state đến khi main.cpp
  // gửi hết outbox; backend luôn thấy các cạnh cũ trước snapshot mới.
  state.setMqttConnected(true);
  const bool onlinePublished = publishAvailability("ONLINE", true);
  if (!onlinePublished) {
    state.setMqttConnected(false);
    disconnectWithOfflineFallback();
    scheduleRetry(now);
    Serial.println("MQTT retained ONLINE publish failed; disconnected and retry scheduled");
    return false;
  }

  reconnectDelayMs_ = AppConfig::MQTT_RECONNECT_INITIAL_MS;
  retryTimer_.clear();
  heartbeatTimer_.clear();
  bootstrapStatePending_ = true;
  Serial.println("MQTT command SUBSCRIBE packet sent; retained ONLINE published, state pending outbox");
  return true;
}

// Publish heartbeat không retained để backend xác nhận thiết bị còn sống.
bool MqttClient::publishHeartbeat() {
  if (!mqtt_.connected()) {
    return false;
  }
  JsonDocument document;
  document["schema_version"] = 1;
  document["locker_id"] = AppConfig::LOCKER_ID;
  char timestamp[25] = {};
  if (formatUtcTimestamp(timestamp, sizeof(timestamp))) {
    document["sent_at"] = timestamp;
  } else {
    document["sent_at"] = nullptr;
  }

  char topic[96] = {};
  char payload[160] = {};
  makeTopic("heartbeat", topic, sizeof(topic));
  if (serializeJson(document, payload, sizeof(payload)) >= sizeof(payload)) {
    Serial.println("Heartbeat serialization failed");
    return false;
  }
  return mqtt_.publish(topic, payload, false);
}

// Publish ONLINE/OFFLINE cùng thời gian hiện tại lên topic availability.
bool MqttClient::publishAvailability(const char* status, bool retained) {
  if (!mqtt_.connected()) {
    return false;
  }
  JsonDocument document;
  document["schema_version"] = 1;
  document["locker_id"] = AppConfig::LOCKER_ID;
  document["status"] = status;
  char timestamp[25] = {};
  if (formatUtcTimestamp(timestamp, sizeof(timestamp))) {
    document["sent_at"] = timestamp;
  } else {
    document["sent_at"] = nullptr;
  }
  char topic[96] = {};
  char payload[192] = {};
  makeTopic("availability", topic, sizeof(topic));
  if (serializeJson(document, payload, sizeof(payload)) >= sizeof(payload)) {
    Serial.println("Availability serialization failed");
    return false;
  }
  return mqtt_.publish(topic, payload, retained);
}

// Ngắt sạch nếu báo được OFFLINE, nếu không thì đóng transport để kích hoạt LWT.
void MqttClient::disconnectWithOfflineFallback() {
  bootstrapStatePending_ = false;
  if (!mqtt_.connected()) {
    return;
  }

  if (publishAvailability("OFFLINE", true)) {
    // Có thể báo OFFLINE rõ ràng thì mới gửi DISCONNECT sạch.
    mqtt_.disconnect();
    return;
  }

  // Nếu không ghi được OFFLINE thì không DISCONNECT sạch. Đóng thẳng transport
  // để broker kích hoạt Last Will đã đăng ký, tránh retained ONLINE bị treo.
  if (AppConfig::MQTT_USE_TLS) {
    secureClient_.stop();
  } else {
    plainClient_.stop();
  }
}

// Kiểm tra toàn bộ cấu hình tối thiểu trước khi cho phép kết nối broker.
bool MqttClient::configured() const {
  // Placeholder hoặc thiếu CA khi bật TLS đều chặn kết nối thay vì thử với secret rỗng.
  const bool basicConfiguration = bufferReady_ &&
                                  strcmp(Secrets::MQTT_HOST, "replace_me") != 0 &&
                                  Secrets::MQTT_HOST[0] != '\0' &&
                                  strcmp(Secrets::MQTT_USERNAME, "replace_me") != 0 &&
                                  strcmp(Secrets::MQTT_PASSWORD, "replace_me") != 0;
  const bool tlsConfiguration = !AppConfig::MQTT_USE_TLS ||
                                (strcmp(Secrets::MQTT_CA_CERT, "replace_me") != 0 &&
                                 Secrets::MQTT_CA_CERT[0] != '\0');
  return basicConfiguration && tlsConfiguration;
}

// Lập lịch kết nối lại và tăng thời gian chờ theo exponential backoff.
void MqttClient::scheduleRetry(unsigned long now) {
  retryTimer_.schedule(static_cast<uint32_t>(now),
                       static_cast<uint32_t>(reconnectDelayMs_));
  if (reconnectDelayMs_ >= AppConfig::MQTT_RECONNECT_MAX_MS / 2) {
    reconnectDelayMs_ = AppConfig::MQTT_RECONNECT_MAX_MS;
  } else {
    // Exponential backoff: 1 s, 2 s, 4 s... đến giới hạn 30 s.
    reconnectDelayMs_ *= 2UL;
  }
}

// Ghép topic chuẩn locker/<LOCKER_ID>/<suffix> vào buffer đầu ra.
void MqttClient::makeTopic(const char* suffix, char* destination, size_t destinationCapacity) const {
  snprintf(destination, destinationCapacity, "locker/%s/%s", AppConfig::LOCKER_ID, suffix);
}
