#include <unity.h>

#include "door_security.h"

void setUp() {}
void tearDown() {}

void test_unlock_grant_allows_exactly_one_open_even_if_latch_stays_unlocked() {
  DoorAccessController access(30000);
  TEST_ASSERT_TRUE(access.grantNextOpen(DoorState::CLOSED, 1000));

  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::AUTHORIZED),
                        static_cast<int>(access.evaluateTransition(
                            DoorState::CLOSED, DoorState::OPEN,
                            LockState::UNLOCKED, 2000)));
  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::NOT_APPLICABLE),
                        static_cast<int>(access.evaluateTransition(
                            DoorState::OPEN, DoorState::CLOSED,
                            LockState::UNLOCKED, 3000)));
  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::UNAUTHORIZED),
                        static_cast<int>(access.evaluateTransition(
                            DoorState::CLOSED, DoorState::OPEN,
                            LockState::UNLOCKED, 4000)));
}

void test_unlock_grant_expires_at_exact_window_boundary_and_is_wrap_safe() {
  DoorAccessController access(30000);
  access.grantNextOpen(DoorState::CLOSED, 0xfffffff0UL);
  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::AUTHORIZED),
                        static_cast<int>(access.evaluateTransition(
                            DoorState::CLOSED, DoorState::OPEN,
                            LockState::UNLOCKED, 0xfffffff0UL + 29999UL)));

  access.grantNextOpen(DoorState::CLOSED, 5000);
  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::UNAUTHORIZED),
                        static_cast<int>(access.evaluateTransition(
                            DoorState::CLOSED, DoorState::OPEN,
                            LockState::UNLOCKED, 35000)));
}

void test_expired_grant_requests_auto_lock_once_and_is_wrap_safe() {
  DoorAccessController access(30000);
  TEST_ASSERT_TRUE(access.grantNextOpen(DoorState::CLOSED, 1000));
  TEST_ASSERT_FALSE(access.expireIfDue(30999));
  TEST_ASSERT_TRUE(access.expireIfDue(31000));
  TEST_ASSERT_FALSE(access.expireIfDue(31001));

  TEST_ASSERT_TRUE(access.grantNextOpen(DoorState::CLOSED, 0xfffffff0UL));
  TEST_ASSERT_FALSE(access.expireIfDue(0xfffffff0UL + 29999UL));
  TEST_ASSERT_TRUE(access.expireIfDue(0xfffffff0UL + 30000UL));
}

void test_auto_lock_policy_ignores_boot_and_arms_only_after_an_observed_open() {
  DoorAutoLockPolicy policy;
  TEST_ASSERT_FALSE(policy.observeTransition(DoorState::UNKNOWN, DoorState::CLOSED));
  TEST_ASSERT_FALSE(policy.observeTransition(DoorState::OPEN, DoorState::CLOSED));

  TEST_ASSERT_FALSE(policy.observeTransition(DoorState::CLOSED, DoorState::OPEN));
  TEST_ASSERT_TRUE(policy.observeTransition(DoorState::OPEN, DoorState::CLOSED));
  TEST_ASSERT_FALSE(policy.observeTransition(DoorState::OPEN, DoorState::CLOSED));

  TEST_ASSERT_FALSE(policy.observeTransition(DoorState::CLOSED, DoorState::OPEN));
  policy.disarm();
  TEST_ASSERT_FALSE(policy.observeTransition(DoorState::OPEN, DoorState::CLOSED));
}

void test_alarm_is_fail_safe_without_a_valid_closed_door_unlock_grant() {
  DoorAccessController access(30000);
  TEST_ASSERT_FALSE(access.grantNextOpen(DoorState::OPEN, 1000));
  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::UNAUTHORIZED),
                        static_cast<int>(access.evaluateTransition(
                            DoorState::CLOSED, DoorState::OPEN,
                            LockState::UNLOCKED, 2000)));

  access.grantNextOpen(DoorState::CLOSED, 3000);
  access.revoke();
  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::UNAUTHORIZED),
                        static_cast<int>(access.evaluateTransition(
                            DoorState::CLOSED, DoorState::OPEN,
                            LockState::UNLOCKED, 4000)));

  access.grantNextOpen(DoorState::CLOSED, 4500);
  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::UNAUTHORIZED),
                        static_cast<int>(access.evaluateTransition(
                            DoorState::CLOSED, DoorState::OPEN,
                            LockState::LOCKED, 5000)));
}

void test_transition_outbox_is_bounded_and_fifo() {
  DoorTransitionOutbox outbox(2);
  DoorTransitionRecord first;
  first.previous = DoorState::CLOSED;
  first.current = DoorState::OPEN;
  first.access = DoorAccessResult::AUTHORIZED;
  first.eventId[0] = 'A';
  DoorTransitionRecord second;
  second.previous = DoorState::OPEN;
  second.current = DoorState::CLOSED;
  second.eventId[0] = 'B';

  TEST_ASSERT_TRUE(outbox.enqueue(first));
  TEST_ASSERT_TRUE(outbox.enqueue(second));
  TEST_ASSERT_FALSE(outbox.enqueue(first));
  TEST_ASSERT_EQUAL_UINT32(2, outbox.size());
  TEST_ASSERT_EQUAL_CHAR('A', outbox.front()->eventId[0]);
  TEST_ASSERT_EQUAL_INT(static_cast<int>(DoorAccessResult::AUTHORIZED),
                        static_cast<int>(outbox.front()->access));
  TEST_ASSERT_TRUE(outbox.pop());
  TEST_ASSERT_EQUAL_CHAR('B', outbox.front()->eventId[0]);
  TEST_ASSERT_TRUE(outbox.pop());
  TEST_ASSERT_TRUE(outbox.empty());
}

void test_opening_door_cancels_any_inflight_latch_actuation() {
  TEST_ASSERT_TRUE(shouldCancelLatchActuation(DoorState::OPEN, true));
  TEST_ASSERT_FALSE(shouldCancelLatchActuation(DoorState::CLOSED, true));
  TEST_ASSERT_FALSE(shouldCancelLatchActuation(DoorState::OPEN, false));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_unlock_grant_allows_exactly_one_open_even_if_latch_stays_unlocked);
  RUN_TEST(test_unlock_grant_expires_at_exact_window_boundary_and_is_wrap_safe);
  RUN_TEST(test_expired_grant_requests_auto_lock_once_and_is_wrap_safe);
  RUN_TEST(test_auto_lock_policy_ignores_boot_and_arms_only_after_an_observed_open);
  RUN_TEST(test_alarm_is_fail_safe_without_a_valid_closed_door_unlock_grant);
  RUN_TEST(test_transition_outbox_is_bounded_and_fifo);
  RUN_TEST(test_opening_door_cancels_any_inflight_latch_actuation);
  return UNITY_END();
}
