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

  // Khởi tạo cửa sổ thời gian cho phép một lượt mở sau UNLOCK.
  explicit DoorAccessController(uint32_t windowMs = DEFAULT_WINDOW_MS);
  // Chỉ cấp quyền nếu tại thời điểm cấp, cửa đang CLOSED.
  bool grantNextOpen(DoorState door, unsigned long now);
  // Thu hồi quyền và trả true khi cửa sổ cho phép đã hết hạn.
  bool expireIfDue(unsigned long now);
  // Hủy quyền mở đang chờ ngay lập tức.
  void revoke();
  // Phân loại cạnh cửa là được phép, trái phép hoặc không áp dụng.
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
  // Quan sát cạnh cửa và trả true khi chuỗi OPEN rồi CLOSED yêu cầu tự khóa.
  bool observeTransition(DoorState previous, DoorState current);
  // Xóa trạng thái chờ tự khóa khi có command hoặc chu kỳ mới.
  void disarm();

 private:
  bool lockOnNextClose_ = false;
};

// FIFO cố định trong RAM, không cấp phát động; event cũ luôn được gửi trước.
class DoorTransitionOutbox {
 public:
  static constexpr size_t MAX_CAPACITY = 8;

  // Khởi tạo FIFO event cửa với sức chứa cố định trong RAM.
  explicit DoorTransitionOutbox(size_t capacity = MAX_CAPACITY);
  // Thêm event vào cuối FIFO; trả false nếu hàng đợi đã đầy.
  bool enqueue(const DoorTransitionRecord& record);
  // Trả con trỏ đến event đầu FIFO mà chưa xóa nó.
  const DoorTransitionRecord* front() const;
  // Xóa event đầu FIFO sau khi publish thành công.
  bool pop();
  // Trả về số event hiện có trong FIFO.
  size_t size() const;
  // Cho biết FIFO hiện có rỗng hay không.
  bool empty() const;
  // Xóa toàn bộ event đang lưu trong FIFO.
  void clear();

 private:
  DoorTransitionRecord records_[MAX_CAPACITY] = {};
  size_t capacity_ = MAX_CAPACITY;
  size_t head_ = 0;
  size_t count_ = 0;
};

// Interlock: nếu cửa không còn CLOSED khi servo đang chạy thì phải hủy chuyển động.
bool shouldCancelLatchActuation(DoorState current, bool latchCommandInFlight);
