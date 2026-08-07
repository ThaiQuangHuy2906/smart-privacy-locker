#pragma once

#include <stddef.h>

void startTimeSync();
bool isTimeSynced();
bool formatUtcTimestamp(char* destination, size_t destinationCapacity);
