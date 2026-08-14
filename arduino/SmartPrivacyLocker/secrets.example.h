#pragma once

// Copy to secrets.h and replace values locally. secrets.h is ignored by Git.
// Wi-Fi credentials are never defined here: WiFiManager receives them through
// its local captive portal and stores them in the ESP32's NVS.
namespace Secrets {
constexpr char MQTT_HOST[] = "replace_me";
constexpr char MQTT_USERNAME[] = "replace_me";
constexpr char MQTT_PASSWORD[] = "replace_me";

// Required only when AppConfig::MQTT_USE_TLS is true. Supply a PEM CA string
// in the ignored local secrets.h; never call setInsecure() for a remote broker.
constexpr char MQTT_CA_CERT[] = "replace_me";
}  // namespace Secrets
