#include <unity.h>

#include "alarm_controller.h"

namespace {

bool lastLevelHigh = false;
int writeCount = 0;

void captureOutput(bool high) {
  lastLevelHigh = high;
  ++writeCount;
}

void resetCapture() {
  lastLevelHigh = false;
  writeCount = 0;
}

void test_active_high_boots_inactive_and_switches_without_delay() {
  resetCapture();
  AlarmController controller(true, captureOutput);

  controller.begin();
  TEST_ASSERT_FALSE(controller.isActive());
  TEST_ASSERT_FALSE(lastLevelHigh);
  TEST_ASSERT_EQUAL(1, writeCount);

  TEST_ASSERT_TRUE(controller.setActive(true));
  TEST_ASSERT_TRUE(controller.isActive());
  TEST_ASSERT_TRUE(lastLevelHigh);
  TEST_ASSERT_EQUAL(2, writeCount);

  TEST_ASSERT_TRUE(controller.setActive(false));
  TEST_ASSERT_FALSE(controller.isActive());
  TEST_ASSERT_FALSE(lastLevelHigh);
  TEST_ASSERT_EQUAL(3, writeCount);
}

void test_active_low_uses_high_as_safe_inactive_level() {
  resetCapture();
  AlarmController controller(false, captureOutput);

  controller.begin();
  TEST_ASSERT_FALSE(controller.isActive());
  TEST_ASSERT_TRUE(lastLevelHigh);

  TEST_ASSERT_TRUE(controller.setActive(true));
  TEST_ASSERT_TRUE(controller.isActive());
  TEST_ASSERT_FALSE(lastLevelHigh);
}

void test_repeated_state_is_idempotent_and_missing_writer_fails_safe() {
  resetCapture();
  AlarmController controller(true, captureOutput);
  controller.begin();
  TEST_ASSERT_TRUE(controller.setActive(false));
  TEST_ASSERT_EQUAL(1, writeCount);

  AlarmController unavailable(true, nullptr);
  unavailable.begin();
  TEST_ASSERT_FALSE(unavailable.setActive(true));
  TEST_ASSERT_FALSE(unavailable.isActive());
}

}  // namespace

void setUp() {}
void tearDown() {}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_active_high_boots_inactive_and_switches_without_delay);
  RUN_TEST(test_active_low_uses_high_as_safe_inactive_level);
  RUN_TEST(test_repeated_state_is_idempotent_and_missing_writer_fails_safe);
  return UNITY_END();
}
