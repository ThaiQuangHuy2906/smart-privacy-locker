#include "door_security.h"

// Khởi tạo thời hạn quyền mở một lần, dùng 30 giây nếu đầu vào bằng 0.
DoorAccessController::DoorAccessController(uint32_t windowMs)
    : windowMs_(windowMs > 0 ? windowMs : DEFAULT_WINDOW_MS) {}

// Cấp quyền cho đúng một lần mở kế tiếp nếu cửa hiện đang đóng.
bool DoorAccessController::grantNextOpen(DoorState door, unsigned long now) {
  // Ghi thời điểm ngay cả khi không cấp; grantAvailable_ mới quyết định quyền có hiệu lực.
  grantAvailable_ = door == DoorState::CLOSED;
  grantedAt_ = static_cast<uint32_t>(now);
  return grantAvailable_;
}

// Kiểm tra thời hạn quyền mở và thu hồi khi đã hết cửa sổ cho phép.
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

// Thu hồi ngay quyền mở một lần đang chờ.
void DoorAccessController::revoke() { grantAvailable_ = false; }

// Phân loại cạnh CLOSED->OPEN dựa trên grant, trạng thái chốt và thời hạn.
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
  // ACK UNLOCK chỉ cấp một lượt mở. Cạnh CLOSED -> OPEN đầu tiên luôn tiêu thụ
  // grant, kể cả khi đã hết hạn hoặc trạng thái chốt không còn khớp.
  revoke();
  return authorized ? DoorAccessResult::AUTHORIZED : DoorAccessResult::UNAUTHORIZED;
}

// Ghi nhớ lần mở và yêu cầu auto-lock đúng một lần khi cửa đóng lại.
bool DoorAutoLockPolicy::observeTransition(DoorState previous, DoorState current) {
  if (previous == DoorState::CLOSED && current == DoorState::OPEN) {
    // Đã mở cửa: ghi nhớ phải khóa ở lần đóng kế tiếp.
    lockOnNextClose_ = true;
    return false;
  }
  if (previous == DoorState::OPEN && current == DoorState::CLOSED && lockOnNextClose_) {
    // Cửa vừa đóng lại sau một lần mở: phát yêu cầu auto-lock đúng một lần.
    lockOnNextClose_ = false;
    return true;
  }
  return false;
}

// Xóa cờ chờ tự khóa.
void DoorAutoLockPolicy::disarm() { lockOnNextClose_ = false; }

// Khởi tạo FIFO event cửa và chặn capacity trong giới hạn mảng tĩnh.
DoorTransitionOutbox::DoorTransitionOutbox(size_t capacity)
    : capacity_(capacity > 0 && capacity <= MAX_CAPACITY ? capacity : MAX_CAPACITY) {}

// Thêm event cửa vào cuối FIFO nếu vẫn còn chỗ.
bool DoorTransitionOutbox::enqueue(const DoorTransitionRecord& record) {
  if (count_ >= capacity_) {
    return false;
  }
  // Vị trí ghi nằm sau phần tử cuối hiện có và quay vòng theo capacity.
  records_[(head_ + count_) % capacity_] = record;
  count_ += 1;
  return true;
}

// Trả event đầu FIFO mà không thay đổi hàng đợi.
const DoorTransitionRecord* DoorTransitionOutbox::front() const {
  return count_ == 0 ? nullptr : &records_[head_];
}

// Loại bỏ event đầu FIFO sau khi nó đã được publish.
bool DoorTransitionOutbox::pop() {
  if (count_ == 0) {
    return false;
  }
  // Chỉ dịch đầu FIFO sau khi MQTT xác nhận đã ghi gói vào transport.
  head_ = (head_ + 1) % capacity_;
  count_ -= 1;
  return true;
}

// Trả về số event hiện có trong FIFO.
size_t DoorTransitionOutbox::size() const { return count_; }

// Cho biết FIFO hiện đang rỗng hay không.
bool DoorTransitionOutbox::empty() const { return count_ == 0; }

// Xóa nhanh toàn bộ event bằng cách đặt lại head và count.
void DoorTransitionOutbox::clear() {
  head_ = 0;
  count_ = 0;
}

// Yêu cầu hủy servo nếu đang chạy mà cửa không còn CLOSED.
bool shouldCancelLatchActuation(DoorState current, bool latchCommandInFlight) {
  return latchCommandInFlight && current != DoorState::CLOSED;
}
