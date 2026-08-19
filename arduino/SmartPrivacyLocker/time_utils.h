#pragma once

#include <stddef.h>

// Bắt đầu đồng bộ NTP không chặn vòng lặp chính.
void startTimeSync();
// Chỉ trả true khi epoch đã lớn hơn mốc hợp lý, tránh tin đồng hồ mặc định.
bool isTimeSynced();
// Ghi thời gian UTC dạng YYYY-MM-DDTHH:MM:SSZ vào buffer của caller.
bool formatUtcTimestamp(char* destination, size_t destinationCapacity);
