#include <assert.h>
#include <stdint.h>

#include "door_sensor.h"

int main() {
  DoorSensor sensor(50, false);
  DoorTransition transition;
  assert(!sensor.sample(false, 0, &transition));
  assert(sensor.stableState() == DoorState::UNKNOWN);
  assert(!sensor.sample(false, 49, &transition));
  assert(sensor.sample(false, 50, &transition));
  assert(transition.initialStableSample);
  assert(transition.current == DoorState::CLOSED);

  assert(!sensor.sample(true, 100, &transition));
  assert(!sensor.sample(false, 120, &transition));
  assert(!sensor.sample(true, 135, &transition));
  assert(!sensor.sample(true, 184, &transition));
  assert(sensor.sample(true, 185, &transition));
  assert(transition.previous == DoorState::CLOSED);
  assert(transition.current == DoorState::OPEN);
  assert(!sensor.sample(true, 500, &transition));
  return 0;
}
