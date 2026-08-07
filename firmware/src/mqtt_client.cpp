#include "mqtt_client.h"

#include <Arduino.h>
#include <ArduinoJson.h>

#include <algorithm>
#include <string.h>

#include "runtime_config.h"
#include "time_utils.h"

MqttClient* MqttClient::activeInstance_ = nullptr;

MqttClient::MqttClient() : mqtt_(plainClient_) {}

void MqttClient::begin(MqttMessageCallback messageCallback) {
  activeInstance_ = this;
  messageCallback_ = messageCallback;
  reconnectDelayMs_ = AppConfig::MQTT_RECONNECT_INITIAL_MS;
  mqtt_.setBufferSize(MQTT_MAX_PACKET_SIZE);
  mqtt_.setCallback(dispatchMessage);

  if (AppConfig::MQTT_USE_TLS) {
    // The CA only comes from ignored local configuration. The code deliberately
    // never calls WiFiClientSecure::setInsecure().
    secureClient_.setCACert(Secrets::MQTT_CA_CERT);
    mqtt_.setClient(secureClient_);
  } else {
    mqtt_.setClient(plainClient_);
  }
  mqtt_.setServer(Secrets::MQTT_HOST, AppConfig::MQTT_PORT);
}

void MqttClient::tick(unsigned long now, StateManager& state) {
  if (mqtt_.connected()) {
    mqtt_.loop();
    if (!mqtt_.connected()) {
      state.setMqttConnected(false);
      scheduleRetry(now);
    }
    return;
  }

  state.setMqttConnected(false);
  if (now < nextAttemptAt_) {
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
  if (!connect(state)) {
    scheduleRetry(now);
  }
}

bool MqttClient::isConnected() { return mqtt_.connected(); }

bool MqttClient::publishAck(const AckRecord& record, bool duplicate, const char* timestamp) {
  if (!mqtt_.connected()) {
    return false;
  }
  char topic[96] = {};
  char payload[MQTT_MAX_PACKET_SIZE] = {};
  makeTopic("ack", topic, sizeof(topic));
  if (!serializeAck(record, duplicate, timestamp, payload, sizeof(payload))) {
    Serial.println("ACK serialization failed");
    return false;
  }
  // PubSubClient publishes at QoS 0. Contract v1 therefore relies on ACK
  // correlation, timeout/reconciliation, and duplicate protection—not a false
  // claim of QoS 1 delivery.
  return mqtt_.publish(topic, payload, false);
}

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
  char timestamp[25] = {};
  if (formatUtcTimestamp(timestamp, sizeof(timestamp))) {
    document["timestamp"] = timestamp;
  } else {
    document["timestamp"] = nullptr;
  }

  char topic[96] = {};
  char payload[MQTT_MAX_PACKET_SIZE] = {};
  makeTopic("state", topic, sizeof(topic));
  if (serializeJson(document, payload, sizeof(payload)) >= sizeof(payload)) {
    Serial.println("State serialization failed");
    return false;
  }
  return mqtt_.publish(topic, payload, retained);
}

void MqttClient::disconnectGracefully() {
  if (mqtt_.connected()) {
    publishAvailability("OFFLINE", true);
    mqtt_.disconnect();
  }
}

void MqttClient::dispatchMessage(char* topic, uint8_t* payload, unsigned int payloadLength) {
  if (activeInstance_ != nullptr) {
    activeInstance_->handleMessage(topic, payload, payloadLength);
  }
}

void MqttClient::handleMessage(const char* topic, const uint8_t* payload, unsigned int payloadLength) {
  if (messageCallback_ != nullptr) {
    messageCallback_(topic, payload, payloadLength);
  }
}

bool MqttClient::connect(StateManager& state) {
  char availabilityTopic[96] = {};
  char lwtPayload[160] = {};
  char clientId[80] = {};
  makeTopic("availability", availabilityTopic, sizeof(availabilityTopic));

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
    return false;
  }

  const uint64_t chipId = ESP.getEfuseMac();
  snprintf(clientId, sizeof(clientId), "locker-%s-%04X", AppConfig::LOCKER_ID,
           static_cast<unsigned int>(chipId & 0xFFFF));
  if (!mqtt_.connect(clientId, Secrets::MQTT_USERNAME, Secrets::MQTT_PASSWORD, availabilityTopic, 0,
                     true, lwtPayload, true)) {
    Serial.println("MQTT connection failed; retry scheduled");
    return false;
  }

  state.setMqttConnected(true);
  reconnectDelayMs_ = AppConfig::MQTT_RECONNECT_INITIAL_MS;
  nextAttemptAt_ = 0;
  publishAvailability("ONLINE", true);
  publishState(state.current(), true);
  char commandTopic[96] = {};
  makeTopic("command", commandTopic, sizeof(commandTopic));
  if (!mqtt_.subscribe(commandTopic, 0)) {
    Serial.println("MQTT command subscription failed");
  }
  Serial.println("MQTT connected; availability and full state published");
  return true;
}

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

bool MqttClient::configured() const {
  const bool basicConfiguration = strcmp(Secrets::MQTT_HOST, "replace_me") != 0 &&
                                  Secrets::MQTT_HOST[0] != '\0' &&
                                  strcmp(Secrets::MQTT_USERNAME, "replace_me") != 0 &&
                                  strcmp(Secrets::MQTT_PASSWORD, "replace_me") != 0;
  const bool tlsConfiguration = !AppConfig::MQTT_USE_TLS ||
                                (strcmp(Secrets::MQTT_CA_CERT, "replace_me") != 0 &&
                                 Secrets::MQTT_CA_CERT[0] != '\0');
  return basicConfiguration && tlsConfiguration;
}

void MqttClient::scheduleRetry(unsigned long now) {
  nextAttemptAt_ = now + reconnectDelayMs_;
  if (reconnectDelayMs_ >= AppConfig::MQTT_RECONNECT_MAX_MS / 2) {
    reconnectDelayMs_ = AppConfig::MQTT_RECONNECT_MAX_MS;
  } else {
    reconnectDelayMs_ *= 2UL;
  }
}

void MqttClient::makeTopic(const char* suffix, char* destination, size_t destinationCapacity) const {
  snprintf(destination, destinationCapacity, "locker/%s/%s", AppConfig::LOCKER_ID, suffix);
}
