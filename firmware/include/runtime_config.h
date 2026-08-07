#pragma once

#if __has_include("app_config.h")
#include "app_config.h"
#else
#include "app_config.example.h"
#endif

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif
