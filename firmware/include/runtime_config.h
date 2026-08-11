#pragma once

#if __has_include("app_config.h")
#include "app_config.h"
#else
#include "app_config.example.h"
#endif

// Phase 3 added buzzer polarity after Phase 1/2 deployments had already made
// local app_config.h copies. Keep those ignored copies source-compatible and
// allow an explicit deployment override without requiring a destructive copy.
#ifndef SPL_BUZZER_ACTIVE_HIGH
#define SPL_BUZZER_ACTIVE_HIGH 1
#endif

#if SPL_BUZZER_ACTIVE_HIGH != 0 && SPL_BUZZER_ACTIVE_HIGH != 1
#error "SPL_BUZZER_ACTIVE_HIGH must be 0 or 1"
#endif

namespace RuntimeConfig {
constexpr bool BUZZER_ACTIVE_HIGH = SPL_BUZZER_ACTIVE_HIGH != 0;
}  // namespace RuntimeConfig

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif
