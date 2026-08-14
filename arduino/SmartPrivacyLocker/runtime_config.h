#pragma once

#include <stdint.h>

#if __has_include("app_config.h")
#include "app_config.h"
#else
#include "app_config.example.h"
#endif

// Phase 3 added buzzer polarity after Phase 1/2 deployments had already made
// local app_config.h copies. A copy without the macro receives the selected
// TMB12A05 LOW-trigger baseline; other hardware can override it explicitly.
#ifndef SPL_BUZZER_ACTIVE_HIGH
#define SPL_BUZZER_ACTIVE_HIGH 0
#endif

#if SPL_BUZZER_ACTIVE_HIGH != 0 && SPL_BUZZER_ACTIVE_HIGH != 1
#error "SPL_BUZZER_ACTIVE_HIGH must be 0 or 1"
#endif

namespace RuntimeConfig {
// Keep the application packet contract independent from build-system-only
// compiler flags. PubSubClient's runtime buffer is resized to this value in
// MqttClient::begin(), so Arduino IDE and PlatformIO use the same limit.
constexpr uint16_t MQTT_PACKET_SIZE = 1024;
constexpr bool BUZZER_ACTIVE_HIGH = SPL_BUZZER_ACTIVE_HIGH != 0;
}  // namespace RuntimeConfig

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif
