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

}  // namespace

void setUp() {}
void tearDown() {}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_unscheduled_timer_is_due_at_any_uptime);
  RUN_TEST(test_retry_waits_until_exact_delay_without_wrap);
  RUN_TEST(test_retry_waits_until_exact_delay_across_millis_wrap);
  RUN_TEST(test_clear_makes_timer_immediately_due_again);
  return UNITY_END();
}
