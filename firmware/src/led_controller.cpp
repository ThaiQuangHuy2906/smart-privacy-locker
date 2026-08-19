#include "led_controller.h"

#include "pin_map.h"
#include "runtime_config.h"

// Tạo dải NeoPixel theo số pixel, chân GPIO và chuẩn tín hiệu GRB 800 kHz.
LedController::LedController()
    // WS2812B của dự án nhận thứ tự màu GRB với tốc độ tín hiệu 800 kHz.
    : pixels_(AppConfig::WS2812_PIXEL_COUNT, static_cast<int>(PinMap::WS2812B_DATA),
              NEO_GRB + NEO_KHZ800) {}

// Khởi tạo dải WS2812B, đặt brightness và phát frame tắt toàn bộ pixel.
void LedController::begin() {
  // Đưa buffer và phần cứng về OFF rõ ràng khi khởi động.
  pixels_.begin();
  pixels_.setBrightness(AppConfig::WS2812_BRIGHTNESS);
  pixels_.clear();
  pixels_.show();
  on_ = false;
}

// Bật toàn dải màu trắng hoặc tắt toàn dải rồi phát frame mới bằng show().
void LedController::setOn(bool on) {
  if (on_ == on) {
    return;
  }
  if (on) {
    // fill() chỉ đổi buffer RAM; màu trắng được áp cho mọi pixel.
    pixels_.fill(pixels_.Color(255, 255, 255));
  } else {
    pixels_.clear();
  }
  // show() mới mã hóa và phát chuỗi bit nối tiếp ra chân DATA.
  pixels_.show();
  on_ = on;
}

// Trả về trạng thái ON/OFF logic gần nhất đã gửi đến dải LED.
bool LedController::isOn() const { return on_; }
