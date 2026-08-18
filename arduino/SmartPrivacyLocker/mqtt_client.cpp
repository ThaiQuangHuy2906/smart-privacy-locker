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
  retryTimer_.clear();
  heartbeatTimer_.clear();
  bootstrapStatePending_ = false;
  bufferReady_ = mqtt_.setBufferSize(RuntimeConfig::MQTT_PACKET_SIZE);
  if (!bufferReady_) {
    Serial.println("MQTT buffer allocation failed; connection attempts are suppressed");
  }
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

void MqttClient::tick(unsigned long now, StateManager& state, bool doorOutboxEmpty) {
  if (mqtt_.connected()) {
    // Retained ONLINE is sent during connect, but the retained full state waits
    // until every locally queued door edge has been published. Do not run the
    // MQTT callback before that point: a queued GET_STATE command could
    // otherwise publish newer full state ahead of the transition outbox.
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
        // A newer full-state snapshot must never overtake queued physical door
        // edges. Leave the timer due and retry after the FIFO drains.
        return;
      }
      // Heartbeat is deliberately non-retained. A retained full-state refresh
      // follows it so the backend can prove both current liveness and current
      // state without creating periodic DEVICE_ONLINE history rows.
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

bool MqttClient::isConnected() { return mqtt_.connected(); }

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
  char payload[RuntimeConfig::MQTT_PACKET_SIZE] = {};
  makeTopic("state", topic, sizeof(topic));
  if (serializeJson(document, payload, sizeof(payload)) >= sizeof(payload)) {
    Serial.println("State serialization failed");
    return false;
  }
  return mqtt_.publish(topic, payload, retained);
}

bool MqttClient::publishDoorTransition(DoorState previous, DoorState current,
                                       const char* timestamp, bool timeSynced,
                                       const char* eventId, DoorAccessResult access) {
  const bool validAccess = current == DoorState::OPEN
      ? access != DoorAccessResult::NOT_APPLICABLE
      : access == DoorAccessResult::NOT_APPLICABLE;
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
  // Door transitions are deliberately non-retained. Full state is published
  // separately so a new consumer never replays an old door-open episode.
  return mqtt_.publish(topic, payload, false);
}

void MqttClient::disconnectGracefully() {
  heartbeatTimer_.clear();
  disconnectWithOfflineFallback();
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

bool MqttClient::connect(unsigned long now, StateManager& state) {
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
    scheduleRetry(now);
    return false;
  }

  const uint64_t chipId = ESP.getEfuseMac();
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
    // PubSubClient could not send the command SUBSCRIBE packet through its
    // local transport. Do not leave a retained ONLINE state behind.
    state.setMqttConnected(false);
    disconnectWithOfflineFallback();
    scheduleRetry(now);
    Serial.println("MQTT command SUBSCRIBE packet send failed; disconnected and retry scheduled");
    return false;
  }

  // PubSubClient 2.8 returns true after its local transport writes the
  // SUBSCRIBE packet; it does not wait for or expose the broker SUBACK grant.
  // Callbacks run only from a later mqtt_.loop(). Publish ONLINE now, then let
  // tick() defer both callbacks and retained full state until main.cpp drains
  // the bounded door-transition outbox. The backend therefore sees queued
  // edges in order before the newer state snapshot and cannot become ready on
  // incomplete bootstrap data.
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

void MqttClient::disconnectWithOfflineFallback() {
  bootstrapStatePending_ = false;
  if (!mqtt_.connected()) {
    return;
  }

  if (publishAvailability("OFFLINE", true)) {
    mqtt_.disconnect();
    return;
  }

  // Do not send a clean MQTT DISCONNECT when the explicit retained OFFLINE
  // packet could not be written. Closing the transport lets the broker apply
  // the already-registered Last Will instead of preserving stale ONLINE state.
  if (AppConfig::MQTT_USE_TLS) {
    secureClient_.stop();
  } else {
    plainClient_.stop();
  }
}

bool MqttClient::configured() const {
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

void MqttClient::scheduleRetry(unsigned long now) {
  retryTimer_.schedule(static_cast<uint32_t>(now),
                       static_cast<uint32_t>(reconnectDelayMs_));
  if (reconnectDelayMs_ >= AppConfig::MQTT_RECONNECT_MAX_MS / 2) {
    reconnectDelayMs_ = AppConfig::MQTT_RECONNECT_MAX_MS;
  } else {
    reconnectDelayMs_ *= 2UL;
  }
}

void MqttClient::makeTopic(const char* suffix, char* destination, size_t destinationCapacity) const {
  snprintf(destination, destinationCapacity, "locker/%s/%s", AppConfig::LOCKER_ID, suffix);
}
