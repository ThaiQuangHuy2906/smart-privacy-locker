#pragma once

#include <stdint.h>

// Timer retry không chặn; dùng phép trừ uint32_t để vẫn đúng khi millis() tràn.
class MqttRetryTimer {
 public:
  // Lập lịch lần thử kết nối kế tiếp sau một khoảng delay xác định.
  void schedule(uint32_t now, uint32_t delayMs) {
    scheduledAt_ = now;
    delayMs_ = delayMs;
    scheduled_ = true;
  }

  // Xóa lịch retry để lần kiểm tra kế tiếp được thực hiện ngay.
  void clear() {
    scheduledAt_ = 0;
    delayMs_ = 0;
    scheduled_ = false;
  }

  // Cho biết đã đến hạn retry hay chưa, kể cả khi millis() bị tràn.
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
  // Ghi nhận thời điểm vừa publish heartbeat/state thành công.
  void reset(uint32_t now) {
    lastPublishedAt_ = now;
    active_ = true;
  }

  // Vô hiệu hóa timer heartbeat cho đến lần reset tiếp theo.
  void clear() {
    lastPublishedAt_ = 0;
    active_ = false;
  }

  // Cho biết đã đủ khoảng thời gian để phát heartbeat mới hay chưa.
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
  // Tạo MQTT client ban đầu dùng transport thường; begin() sẽ chọn TLS nếu cần.
  MqttClient();
  // Cấu hình buffer, callback, TLS/plain transport và địa chỉ broker.
  void begin(MqttMessageCallback messageCallback);
  // Được gọi mỗi vòng loop; doorOutboxEmpty bảo đảm event cửa không bị state mới vượt mặt.
  void tick(unsigned long now, StateManager& state, bool doorOutboxEmpty);
  // Cho biết PubSubClient hiện còn kết nối với broker hay không.
  bool isConnected();
  // Serialize và publish ACK của một command lên topic ack.
  bool publishAck(const AckRecord& record, bool duplicate, const char* timestamp);
  // Publish snapshot DeviceState, mặc định ở chế độ retained.
  bool publishState(const DeviceState& state, bool retained = true);
  // Publish một cạnh cửa cùng event_id và kết quả authorized lên telemetry/door.
  bool publishDoorTransition(DoorState previous, DoorState current,
                             const char* timestamp, bool timeSynced,
                             const char* eventId, DoorAccessResult access);
  // Báo OFFLINE rồi đóng kết nối MQTT theo cách an toàn.
  void disconnectGracefully();

 private:
  // Callback tĩnh của PubSubClient chuyển message về activeInstance_.
  static void dispatchMessage(char* topic, uint8_t* payload, unsigned int payloadLength);
  // Chuyển message MQTT sang callback nghiệp vụ do main.cpp đăng ký.
  void handleMessage(const char* topic, const uint8_t* payload, unsigned int payloadLength);
  // Kết nối broker, đăng ký LWT, subscribe command và publish ONLINE.
  bool connect(unsigned long now, StateManager& state);
  // Publish gói heartbeat không retained để chứng minh thiết bị còn sống.
  bool publishHeartbeat();
  // Publish trạng thái ONLINE/OFFLINE lên topic availability.
  bool publishAvailability(const char* status, bool retained);
  // Ngắt kết nối; nếu không gửi được OFFLINE thì đóng transport để broker dùng LWT.
  void disconnectWithOfflineFallback();
  // Kiểm tra buffer, host, credential và CA đã được cấu hình hợp lệ hay chưa.
  bool configured() const;
  // Lập lịch reconnect với exponential backoff.
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
