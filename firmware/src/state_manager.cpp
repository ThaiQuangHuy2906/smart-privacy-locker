#include "state_manager.h"

const char* toString(DoorState state) {
  switch (state) {
    case DoorState::OPEN:
      return "OPEN";
    case DoorState::CLOSED:
      return "CLOSED";
    case DoorState::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

const char* toString(LockState state) {
  switch (state) {
    case LockState::LOCKED:
      return "LOCKED";
    case LockState::UNLOCKED:
      return "UNLOCKED";
    case LockState::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

const char* toString(AlarmState state) {
  switch (state) {
    case AlarmState::ACTIVE:
      return "ACTIVE";
    case AlarmState::INACTIVE:
      return "INACTIVE";
    case AlarmState::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

const char* toString(LedState state) {
  switch (state) {
    case LedState::ON:
      return "ON";
    case LedState::OFF:
      return "OFF";
    case LedState::UNKNOWN:
    default:
      return "UNKNOWN";
  }
}

StateManager::StateManager() { resetForColdBoot(); }

const DeviceState& StateManager::current() const { return state_; }

void StateManager::resetForColdBoot() {
  state_.door = DoorState::UNKNOWN;
  state_.lock = LockState::UNKNOWN;
  state_.alarm = AlarmState::INACTIVE;
  state_.led = LedState::OFF;
  state_.wifiConnected = false;
  state_.mqttConnected = false;
}

void StateManager::setWifiConnected(bool connected) { state_.wifiConnected = connected; }

void StateManager::setMqttConnected(bool connected) { state_.mqttConnected = connected; }

void StateManager::setDoor(DoorState state) { state_.door = state; }

void StateManager::setLock(LockState state) { state_.lock = state; }

void StateManager::setLed(LedState state) { state_.led = state; }
