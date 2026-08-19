#pragma once

// Mô hình trạng thái logic dùng chung cho toàn bộ firmware.
// UNKNOWN nghĩa là ESP32 chưa có đủ bằng chứng để khẳng định trạng thái thật;
// đặc biệt SG90 không có cảm biến phản hồi góc nên lúc mới khởi động, chốt là UNKNOWN.
enum class DoorState { OPEN, CLOSED, UNKNOWN };
enum class LockState { LOCKED, UNLOCKED, UNKNOWN };
enum class AlarmState { ACTIVE, INACTIVE, UNKNOWN };
enum class LedState { ON, OFF, UNKNOWN };

struct DeviceState {
  DoorState door = DoorState::UNKNOWN;
  LockState lock = LockState::UNKNOWN;
  AlarmState alarm = AlarmState::INACTIVE;
  LedState led = LedState::OFF;
  bool wifiConnected = false;
  bool mqttConnected = false;
};

// Chuyển enum thành chuỗi đúng hợp đồng MQTT (ví dụ LOCKED, UNLOCKED).
const char* toString(DoorState state);
const char* toString(LockState state);
const char* toString(AlarmState state);
const char* toString(LedState state);
