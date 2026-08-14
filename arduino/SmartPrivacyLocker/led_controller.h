#pragma once

#include <Adafruit_NeoPixel.h>

class LedController {
 public:
  LedController();
  void begin();
  void setOn(bool on);
  bool isOn() const;

 private:
  Adafruit_NeoPixel pixels_;
  bool on_ = false;
};
