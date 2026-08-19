#pragma once

#include <stddef.h>
#include <stdint.h>

#include "device_state.h"

// Kết quả phân loại chỉ có ý nghĩa trên cạnh CLOSED -> OPEN.
enum class DoorAccessResult : uint8_t {
  NOT_APPLICABLE,
  AUTHORIZED,
  UNAUTHORIZED,
};

// Event cửa lưu tạm để phát MQTT đúng thứ tự sau khi mất/kết nối lại mạng.
struct DoorTransitionRecord {
  DoorState previous = DoorState::UNKNOWN;
  DoorState current = DoorState::UNKNOWN;
  DoorAccessResult access = DoorAccessResult::NOT_APPLICABLE;
  char eventId[37] = {};
  char timestamp[25] = {};
  bool timeSynced = false;
};

// Liên quan CB2 của Huy và YC6 của Minh: một ACK UNLOCK hợp lệ cấp đúng một
// lượt mở cửa trong cửa sổ 30 giây, không phải tắt bảo vệ vô thời hạn.
class DoorAccessController {
 public:
  static constexpr uint32_t DEFAULT_WINDOW_MS = 30000;

  explicit DoorAccessController(uint32_t windowMs = DEFAULT_WINDOW_MS);
  // Chỉ cấp quyền nếu tại thời điểm cấp, cửa đang CLOSED.
  bool grantNextOpen(DoorState door, unsigned long now);
  bool expireIfDue(unsigned long now);
  void revoke();
  DoorAccessResult evaluateTransition(DoorState previous, DoorState current,
                                      LockState lock, unsigned long now);

 private:
  uint32_t windowMs_ = DEFAULT_WINDOW_MS;
  uint32_t grantedAt_ = 0;
  bool grantAvailable_ = false;
};

// Sau chuỗi CLOSED -> OPEN -> CLOSED, yêu cầu main.cpp tự khóa lại chốt.
class DoorAutoLockPolicy {
 public:
  bool observeTransition(DoorState previous, DoorState current);
  void disarm();

 private:
  bool lockOnNextClose_ = false;
};

// FIFO cố định trong RAM, không cấp phát động; event cũ luôn được gửi trước.
class DoorTransitionOutbox {
 public:
  static constexpr size_t MAX_CAPACITY = 8;

  explicit DoorTransitionOutbox(size_t capacity = MAX_CAPACITY);
  bool enqueue(const DoorTransitionRecord& record);
  const DoorTransitionRecord* front() const;
  bool pop();
  size_t size() const;
  bool empty() const;
  void clear();

 private:
  DoorTransitionRecord records_[MAX_CAPACITY] = {};
  size_t capacity_ = MAX_CAPACITY;
  size_t head_ = 0;
  size_t count_ = 0;
};

// Interlock: nếu cửa không còn CLOSED khi servo đang chạy thì phải hủy chuyển động.
bool shouldCancelLatchActuation(DoorState current, bool latchCommandInFlight);
