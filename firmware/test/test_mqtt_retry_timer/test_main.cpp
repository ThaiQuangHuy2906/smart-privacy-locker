#include <unity.h>

#include <stdint.h>

#include "mqtt_client.h"

namespace {

void test_unscheduled_timer_is_due_at_any_uptime() {
  MqttRetryTimer timer;

  TEST_ASSERT_TRUE(timer.due(0));
  TEST_ASSERT_TRUE(timer.due(0x80000000UL));
  TEST_ASSERT_TRUE(timer.due(0xFFFFFFFFUL));
}

void test_retry_waits_until_exact_delay_without_wrap() {
  MqttRetryTimer timer;
  timer.schedule(1000, 250);

  TEST_ASSERT_FALSE(timer.due(1249));
  TEST_ASSERT_TRUE(timer.due(1250));
}

void test_retry_waits_until_exact_delay_across_millis_wrap() {
  MqttRetryTimer timer;
  const uint32_t nearWrap = 0xFFFFFFF5UL;
  timer.schedule(nearWrap, 20);

  TEST_ASSERT_FALSE(timer.due(0xFFFFFFFAUL));
  TEST_ASSERT_FALSE(timer.due(5));
  TEST_ASSERT_TRUE(timer.due(9));
}

void test_clear_makes_timer_immediately_due_again() {
  MqttRetryTimer timer;
  timer.schedule(1000, 250);
  timer.clear();

  TEST_ASSERT_TRUE(timer.due(1001));
}

void test_heartbeat_timer_waits_for_interval_and_rearms_after_publish() {
  MqttHeartbeatTimer timer;
  timer.reset(1000);

  TEST_ASSERT_FALSE(timer.due(10'999, 10'000));
  TEST_ASSERT_TRUE(timer.due(11'000, 10'000));

  timer.reset(11'000);
  TEST_ASSERT_FALSE(timer.due(20'999, 10'000));
  TEST_ASSERT_TRUE(timer.due(21'000, 10'000));
}

void test_heartbeat_timer_is_wrap_safe_and_inactive_until_reset() {
  MqttHeartbeatTimer timer;
  TEST_ASSERT_FALSE(timer.due(1234, 10));

  timer.reset(0xFFFFFFF5UL);
  TEST_ASSERT_FALSE(timer.due(5, 20));
  TEST_ASSERT_TRUE(timer.due(9, 20));

  timer.clear();
  TEST_ASSERT_FALSE(timer.due(10, 1));
}

}  // namespace

void setUp() {}
void tearDown() {}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_unscheduled_timer_is_due_at_any_uptime);
  RUN_TEST(test_retry_waits_until_exact_delay_without_wrap);
  RUN_TEST(test_retry_waits_until_exact_delay_across_millis_wrap);
  RUN_TEST(test_clear_makes_timer_immediately_due_again);
  RUN_TEST(test_heartbeat_timer_waits_for_interval_and_rearms_after_publish);
  RUN_TEST(test_heartbeat_timer_is_wrap_safe_and_inactive_until_reset);
  return UNITY_END();
}
