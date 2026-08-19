#pragma once

#include <Adafruit_NeoPixel.h>

// YC3 của Huy: điều khiển toàn bộ dải WS2812B như một trạng thái ON/OFF.
class LedController {
 public:
  // Tạo đối tượng NeoPixel theo số pixel, chân data và chuẩn GRB 800 kHz.
  LedController();
  // Khởi tạo dải LED, đặt brightness và đưa toàn bộ pixel về tắt.
  void begin();
  // Chỉ phát frame mới khi trạng thái mong muốn khác trạng thái hiện tại.
  void setOn(bool on);
  // Trả về trạng thái ON/OFF logic gần nhất đã phát ra dải LED.
  bool isOn() const;

 private:
  Adafruit_NeoPixel pixels_;
  bool on_ = false;
};
