#pragma once

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

const char* toString(DoorState state);
const char* toString(LockState state);
const char* toString(AlarmState state);
const char* toString(LedState state);
