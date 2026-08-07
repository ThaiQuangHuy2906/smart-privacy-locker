#include "wifi_provisioning.h"

#include <Arduino.h>
#include <WiFi.h>

#include "runtime_config.h"
#include "time_utils.h"

void WifiProvisioning::begin() {
  WiFi.mode(WIFI_STA);
  manager_.setDebugOutput(false);
  manager_.setConfigPortalBlocking(false);
  manager_.setConfigPortalTimeout(AppConfig::WIFI_PORTAL_TIMEOUT_SECONDS);
  manager_.setBreakAfterConfig(true);

  // With stored credentials WiFiManager connects as a station. With missing or
  // unusable credentials it starts a local AP/portal. The timeout prevents an
  // indefinite portal loop; a USB-local reset or reboot can start it again.
  manager_.autoConnect(AppConfig::WIFI_PORTAL_AP_NAME);
  started_ = true;
}

void WifiProvisioning::tick() {
  if (!started_) {
    return;
  }
  manager_.process();
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected_) {
    startTimeSync();
    Serial.println("Wi-Fi connected");
  } else if (!connected && wasConnected_) {
    Serial.println("Wi-Fi disconnected");
  }
  wasConnected_ = connected;
}

bool WifiProvisioning::isConnected() const { return WiFi.status() == WL_CONNECTED; }

void WifiProvisioning::resetConfigurationAndRestart() {
  // This is invoked only through a physical USB serial session. It never reads
  // or prints the saved SSID/password.
  manager_.resetSettings();
  Serial.println("Wi-Fi configuration erased; restarting");
  ESP.restart();
}
