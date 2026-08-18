#include "door_security.h"

DoorAccessController::DoorAccessController(uint32_t windowMs)
    : windowMs_(windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS) {}

bool DoorAccessController::grantNextOpen(DoorState door, unsigned long now) {
  grantAvailable_ = door == DoorState::CLOSED;
  grantedAt_ = static_cast<uint32_t>(now);
  return grantAvailable_;
}

bool DoorAccessController::expireIfDue(unsigned long now) {
  if (!grantAvailable_) {
    return false;
  }
  const uint32_t elapsed = static_cast<uint32_t>(now) - grantedAt_;
  if (elapsed < windowMs_) {
    return false;
  }
  revoke();
  return true;
}

void DoorAccessController::revoke() { grantAvailable_ = false; }

DoorAccessResult DoorAccessController::evaluateTransition(DoorState previous,
                                                           DoorState current,
                                                           LockState lock,
                                                           unsigned long now) {
  if (previous != DoorState::CLOSED || current != DoorState::OPEN) {
    return DoorAccessResult::NOT_APPLICABLE;
  }

  const uint32_t elapsed = static_cast<uint32_t>(now) - grantedAt_;
  const bool authorized = grantAvailable_ && lock == LockState::UNLOCKED
      && elapsed < windowMs_;
  // An unlock ACK grants one opening, not a permanently disarmed door. The
  // grant is consumed by the first CLOSED -> OPEN edge even when it expired or
  // the latch state no longer matches.
  revoke();
  return authorized ? DoorAccessResult::AUTHORIZED : DoorAccessResult::UNAUTHORIZED;
}

bool DoorAutoLockPolicy::observeTransition(DoorState previous, DoorState current) {
  if (previous == DoorState::CLOSED && current == DoorState::OPEN) {
    lockOnNextClose_ = true;
    return false;
  }
  if (previous == DoorState::OPEN && current == DoorState::CLOSED && lockOnNextClose_) {
    lockOnNextClose_ = false;
    return true;
  }
  return false;
}

void DoorAutoLockPolicy::disarm() { lockOnNextClose_ = false; }

DoorTransitionOutbox::DoorTransitionOutbox(size_t capacity)
    : capacity_(capacity > 0 && capacity <= MAX_CAPACITY ? capacity : MAX_CAPACITY) {}

bool DoorTransitionOutbox::enqueue(const DoorTransitionRecord& record) {
  if (count_ >= capacity_) {
    return false;
  }
  records_[(head_ + count_) % capacity_] = record;
  count_ += 1;
  return true;
}

const DoorTransitionRecord* DoorTransitionOutbox::front() const {
  return count_ == 0 ? nullptr : &records_[head_];
}

bool DoorTransitionOutbox::pop() {
  if (count_ == 0) {
    return false;
  }
  head_ = (head_ + 1) % capacity_;
  count_ -= 1;
  return true;
}

size_t DoorTransitionOutbox::size() const { return count_; }

bool DoorTransitionOutbox::empty() const { return count_ == 0; }

void DoorTransitionOutbox::clear() {
  head_ = 0;
  count_ = 0;
}

bool shouldCancelLatchActuation(DoorState current, bool latchCommandInFlight) {
  return latchCommandInFlight && current != DoorState::CLOSED;
}
