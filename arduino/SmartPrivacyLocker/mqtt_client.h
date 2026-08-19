#pragma once

#include <stdint.h>

// Timer retry không chặn; dùng phép trừ uint32_t để vẫn đúng khi millis() tràn.
class MqttRetryTimer {
 public:
  void schedule(uint32_t now, uint32_t delayMs) {
    scheduledAt_ = now;
    delayMs_ = delayMs;
    scheduled_ = true;
  }

  void clear() {
    scheduledAt_ = 0;
    delayMs_ = 0;
    scheduled_ = false;
  }

  bool due(uint32_t now) const {
    // Thời gian retry nhỏ hơn rất nhiều một vòng tràn millis(), nên phép trừ
    // unsigned vẫn cho elapsed chính xác qua điểm tràn 32 bit.
    return !scheduled_ || static_cast<uint32_t>(now - scheduledAt_) >= delayMs_;
  }

 private:
  uint32_t scheduledAt_ = 0;
  uint32_t delayMs_ = 0;
  bool scheduled_ = false;
};

// Đo khoảng cách giữa hai heartbeat mà không dùng delay().
class MqttHeartbeatTimer {
 public:
  void reset(uint32_t now) {
    lastPublishedAt_ = now;
    active_ = true;
  }

  void clear() {
    lastPublishedAt_ = 0;
    active_ = false;
  }

  bool due(uint32_t now, uint32_t intervalMs) const {
    return active_ && intervalMs > 0
        && static_cast<uint32_t>(now - lastPublishedAt_) >= intervalMs;
  }

 private:
  uint32_t lastPublishedAt_ = 0;
  bool active_ = false;
};

#ifdef ARDUINO

#include <PubSubClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>

#include "ack_publisher.h"
#include "door_security.h"
#include "state_manager.h"

using MqttMessageCallback = void (*)(const char* topic, const uint8_t* payload,
                                     unsigned int payloadLength);

// Lớp bao PubSubClient: kết nối/backoff, subscribe command và publish ACK,
// state, availability, heartbeat, telemetry cửa theo MQTT contract v1.
class MqttClient {
 public:
  MqttClient();
  void begin(MqttMessageCallback messageCallback);
  // Được gọi mỗi vòng loop; doorOutboxEmpty bảo đảm event cửa không bị state mới vượt mặt.
  void tick(unsigned long now, StateManager& state, bool doorOutboxEmpty);
  bool isConnected();
  bool publishAck(const AckRecord& record, bool duplicate, const char* timestamp);
  bool publishState(const DeviceState& state, bool retained = true);
  bool publishDoorTransition(DoorState previous, DoorState current,
                             const char* timestamp, bool timeSynced,
                             const char* eventId, DoorAccessResult access);
  void disconnectGracefully();

 private:
  static void dispatchMessage(char* topic, uint8_t* payload, unsigned int payloadLength);
  void handleMessage(const char* topic, const uint8_t* payload, unsigned int payloadLength);
  bool connect(unsigned long now, StateManager& state);
  bool publishHeartbeat();
  bool publishAvailability(const char* status, bool retained);
  void disconnectWithOfflineFallback();
  bool configured() const;
  void scheduleRetry(unsigned long now);
  // Tạo topic dạng locker/<LOCKER_ID>/<suffix> vào buffer cố định.
  void makeTopic(const char* suffix, char* destination, size_t destinationCapacity) const;

  WiFiClient plainClient_;
  WiFiClientSecure secureClient_;
  PubSubClient mqtt_;
  MqttMessageCallback messageCallback_ = nullptr;
  MqttRetryTimer retryTimer_;
  MqttHeartbeatTimer heartbeatTimer_;
  // Backoff tăng gấp đôi sau mỗi lần lỗi, nhưng không vượt giá trị max cấu hình.
  unsigned long reconnectDelayMs_ = 0;
  bool bufferReady_ = false;
  bool configurationWarningPrinted_ = false;
  // Sau reconnect, phải phát hết event cửa tồn đọng rồi mới phát retained state mới.
  bool bootstrapStatePending_ = false;

  static MqttClient* activeInstance_;
};

#endif
