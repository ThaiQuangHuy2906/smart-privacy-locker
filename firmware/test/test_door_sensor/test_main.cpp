#include <unity.h>

#include "door_sensor.h"

namespace {

void test_boot_remains_unknown_until_full_stable_interval() {
  DoorSensor sensor(50, false);
  DoorTransition transition;

  TEST_ASSERT_FALSE(sensor.sample(false, 0, &transition));
  TEST_ASSERT_EQUAL(DoorState::UNKNOWN, sensor.stableState());
  TEST_ASSERT_FALSE(sensor.sample(false, 49, &transition));
  TEST_ASSERT_TRUE(sensor.sample(false, 50, &transition));
  TEST_ASSERT_TRUE(transition.initialStableSample);
  TEST_ASSERT_EQUAL(DoorState::CLOSED, transition.current);
}

void test_bounce_produces_one_stable_transition_only() {
  DoorSensor sensor(50, false);
  DoorTransition transition;
  sensor.sample(false, 0, &transition);
  sensor.sample(false, 50, &transition);

  TEST_ASSERT_FALSE(sensor.sample(true, 100, &transition));
  TEST_ASSERT_FALSE(sensor.sample(false, 120, &transition));
  TEST_ASSERT_FALSE(sensor.sample(true, 135, &transition));
  TEST_ASSERT_FALSE(sensor.sample(true, 184, &transition));
  TEST_ASSERT_TRUE(sensor.sample(true, 185, &transition));
  TEST_ASSERT_FALSE(transition.initialStableSample);
  TEST_ASSERT_EQUAL(DoorState::CLOSED, transition.previous);
  TEST_ASSERT_EQUAL(DoorState::OPEN, transition.current);
  TEST_ASSERT_FALSE(sensor.sample(true, 500, &transition));
}

void test_debounce_uses_wrap_safe_elapsed_time() {
  DoorSensor sensor(20, false);
  DoorTransition transition;
  const uint32_t nearWrap = 0xFFFFFFF5UL;
  TEST_ASSERT_FALSE(sensor.sample(false, nearWrap, &transition));
  TEST_ASSERT_FALSE(sensor.sample(false, 5, &transition));
  TEST_ASSERT_TRUE(sensor.sample(false, 9, &transition));
  TEST_ASSERT_EQUAL(DoorState::CLOSED, sensor.stableState());
}

}  // namespace

void setUp() {}
void tearDown() {}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_boot_remains_unknown_until_full_stable_interval);
  RUN_TEST(test_bounce_produces_one_stable_transition_only);
  RUN_TEST(test_debounce_uses_wrap_safe_elapsed_time);
  return UNITY_END();
}
