#pragma once

#include <WiFiManager.h>

class WifiProvisioning {
 public:
  void begin();
  void tick();
  bool isConnected() const;
  void resetConfigurationAndRestart();

 private:
  WiFiManager manager_;
  bool started_ = false;
  bool wasConnected_ = false;
};
