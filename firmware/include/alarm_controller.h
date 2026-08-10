#pragma once

class AlarmController {
 public:
  using OutputWriter = void (*)(bool high);

  AlarmController(bool activeHigh, OutputWriter outputWriter);

  void begin();
  bool setActive(bool active);
  bool isActive() const;
  bool outputLevelHigh(bool active) const;

 private:
  bool activeHigh_;
  OutputWriter outputWriter_;
  bool active_ = false;
  bool initialized_ = false;
};
