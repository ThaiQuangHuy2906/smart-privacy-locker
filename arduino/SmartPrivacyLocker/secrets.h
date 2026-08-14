#pragma once

// Keep real credentials out of Arduino IDE's normal sketch tabs and out of
// version control. sync-sketch.ps1 -IncludeLocalConfig copies the ignored
// firmware secret to private/secrets.local.h without printing its contents.
#if __has_include("private/secrets.local.h")
#include "private/secrets.local.h"
#else
#include "secrets.example.h"
#endif
