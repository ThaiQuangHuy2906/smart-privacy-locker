#pragma once

#include <Adafruit_NeoPixel.h>

// YC3 của Huy: điều khiển toàn bộ dải WS2812B như một trạng thái ON/OFF.
class LedController {
 public:
  LedController();
  void begin();
  // Chỉ phát frame mới khi trạng thái mong muốn khác trạng thái hiện tại.
  void setOn(bool on);
  bool isOn() const;

 private:
  Adafruit_NeoPixel pixels_;
  bool on_ = false;
};
