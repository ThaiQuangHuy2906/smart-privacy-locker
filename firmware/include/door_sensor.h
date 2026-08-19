#pragma once

#include <stdint.h>

#include "device_state.h"

// Một cạnh cửa đã qua debounce, kèm trạng thái trước/sau.
struct DoorTransition {
  DoorState previous = DoorState::UNKNOWN;
  DoorState current = DoorState::UNKNOWN;
  bool initialStableSample = false;
};

// Bộ lọc debounce độc lập nền tảng. Caller tự đọc GPIO rồi truyền mức điện vào,
// nhờ vậy lớp này được test native mà không cần giả lập toàn bộ Arduino.
class DoorSensor {
 public:
  // Khởi tạo bộ debounce với thời gian lọc và cực tính mức điện của cửa đóng.
  DoorSensor(uint32_t debounceMs, bool closedLevelHigh);

  // Xóa candidate và stable state để bắt đầu quan sát lại từ UNKNOWN.
  void reset();
  // true khi quan sát mới đã giữ ổn định đủ debounceMs và tạo một transition.
  bool sample(bool electricalHigh, uint32_t nowMs, DoorTransition* transition);
  // Trả về trạng thái cửa ổn định gần nhất sau debounce.
  DoorState stableState() const;
  // Cho biết cảm biến đã có ít nhất một mẫu ổn định hay chưa.
  bool hasStableState() const;

 private:
  // Đổi mức điện HIGH/LOW thành ý nghĩa vật lý OPEN/CLOSED theo cấu hình polarity.
  DoorState mapLevel(bool electricalHigh) const;

  uint32_t debounceMs_;
  bool closedLevelHigh_;
  bool candidateValid_ = false;
  DoorState candidate_ = DoorState::UNKNOWN;
  uint32_t candidateSinceMs_ = 0;
  DoorState stable_ = DoorState::UNKNOWN;
};
