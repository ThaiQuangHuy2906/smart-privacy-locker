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

// Đổi trạng thái cửa thành OPEN, CLOSED hoặc UNKNOWN.
const char* toString(DoorState state);
// Đổi trạng thái chốt thành LOCKED, UNLOCKED hoặc UNKNOWN.
const char* toString(LockState state);
// Đổi trạng thái còi thành ACTIVE, INACTIVE hoặc UNKNOWN.
const char* toString(AlarmState state);
// Đổi trạng thái đèn thành ON, OFF hoặc UNKNOWN.
const char* toString(LedState state);
