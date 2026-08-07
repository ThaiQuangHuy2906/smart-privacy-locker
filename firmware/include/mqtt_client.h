#pragma once

#include <PubSubClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>

#include "ack_publisher.h"
#include "state_manager.h"

using MqttMessageCallback = void (*)(const char* topic, const uint8_t* payload,
                                     unsigned int payloadLength);

class MqttClient {
 public:
  MqttClient();
  void begin(MqttMessageCallback messageCallback);
  void tick(unsigned long now, StateManager& state);
  bool isConnected();
  bool publishAck(const AckRecord& record, bool duplicate, const char* timestamp);
  bool publishState(const DeviceState& state, bool retained = true);
  void disconnectGracefully();

 private:
  static void dispatchMessage(char* topic, uint8_t* payload, unsigned int payloadLength);
  void handleMessage(const char* topic, const uint8_t* payload, unsigned int payloadLength);
  bool connect(unsigned long now, StateManager& state);
  bool publishAvailability(const char* status, bool retained);
  bool configured() const;
  void scheduleRetry(unsigned long now);
  void makeTopic(const char* suffix, char* destination, size_t destinationCapacity) const;

  WiFiClient plainClient_;
  WiFiClientSecure secureClient_;
  PubSubClient mqtt_;
  MqttMessageCallback messageCallback_ = nullptr;
  unsigned long nextAttemptAt_ = 0;
  unsigned long reconnectDelayMs_ = 0;
  bool configurationWarningPrinted_ = false;

  static MqttClient* activeInstance_;
};
