#include "door_sensor.h"

DoorSensor::DoorSensor(uint32_t debounceMs, bool closedLevelHigh)
    : debounceMs_(debounceMs), closedLevelHigh_(closedLevelHigh) {}

void DoorSensor::reset() {
  // Sau boot chưa có mẫu ổn định nên cả candidate lẫn stable đều UNKNOWN.
  candidateValid_ = false;
  candidate_ = DoorState::UNKNOWN;
  candidateSinceMs_ = 0;
  stable_ = DoorState::UNKNOWN;
}

bool DoorSensor::sample(bool electricalHigh, uint32_t nowMs, DoorTransition* transition) {
  const DoorState observed = mapLevel(electricalHigh);
  if (!candidateValid_ || observed != candidate_) {
    // Mức vừa đổi: ghi candidate mới và bắt đầu đếm lại thời gian ổn định.
    candidateValid_ = true;
    candidate_ = observed;
    candidateSinceMs_ = nowMs;
    return false;
  }
  if (observed == stable_ || static_cast<uint32_t>(nowMs - candidateSinceMs_) < debounceMs_) {
    // Không phát event nếu trùng stable cũ hoặc chưa giữ đủ thời gian debounce.
    return false;
  }

  // Candidate đã đủ ổn định: chính thức thay trạng thái và trả cạnh cho main.cpp.
  const DoorState previous = stable_;
  stable_ = observed;
  if (transition != nullptr) {
    transition->previous = previous;
    transition->current = stable_;
    transition->initialStableSample = previous == DoorState::UNKNOWN;
  }
  return true;
}

DoorState DoorSensor::stableState() const { return stable_; }

bool DoorSensor::hasStableState() const { return stable_ != DoorState::UNKNOWN; }

DoorState DoorSensor::mapLevel(bool electricalHigh) const {
  // Với baseline INPUT_PULLUP của dự án: LOW tương ứng cửa đóng.
  return electricalHigh == closedLevelHigh_ ? DoorState::CLOSED : DoorState::OPEN;
}
