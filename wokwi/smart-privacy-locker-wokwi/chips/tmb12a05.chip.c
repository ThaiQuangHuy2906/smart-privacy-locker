#include "wokwi-api.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

typedef struct {
  pin_t vcc;
  pin_t ground;
  pin_t input;
  pin_t sound_out;
  timer_t tone_timer;
  bool active;
  bool sound_high;
} chip_state_t;

static bool alarm_requested(const chip_state_t *chip) {
  return pin_read(chip->vcc) == HIGH && pin_read(chip->ground) == LOW &&
         pin_read(chip->input) == LOW;
}

static void tone_tick(void *user_data) {
  chip_state_t *chip = (chip_state_t *)user_data;
  if (!chip->active) {
    return;
  }

  chip->sound_high = !chip->sound_high;
  pin_write(chip->sound_out, chip->sound_high ? HIGH : LOW);
}

static void update_alarm(chip_state_t *chip) {
  const bool should_be_active = alarm_requested(chip);
  if (should_be_active == chip->active) {
    return;
  }

  chip->active = should_be_active;
  chip->sound_high = false;
  pin_write(chip->sound_out, LOW);
  if (chip->active) {
    // Toggle every 208 us: approximately 2.4 kHz, matching the nominal
    // frequency family of the selected active buzzer.
    timer_start(chip->tone_timer, 208, true);
  } else {
    timer_stop(chip->tone_timer);
  }
}

static void control_pin_changed(void *user_data, pin_t pin, uint32_t value) {
  (void)pin;
  (void)value;
  update_alarm((chip_state_t *)user_data);
}

void chip_init(void) {
  chip_state_t *chip = calloc(1, sizeof(chip_state_t));
  chip->vcc = pin_init("VCC", INPUT);
  chip->ground = pin_init("GND", INPUT_PULLUP);
  chip->input = pin_init("IN", INPUT_PULLUP);
  chip->sound_out = pin_init("SOUND_OUT", OUTPUT);
  pin_write(chip->sound_out, LOW);

  const timer_config_t timer_config = {
      .callback = tone_tick,
      .user_data = chip,
  };
  chip->tone_timer = timer_init(&timer_config);

  const pin_watch_config_t watch_config = {
      .edge = BOTH,
      .pin_change = control_pin_changed,
      .user_data = chip,
  };
  pin_watch(chip->vcc, &watch_config);
  pin_watch(chip->ground, &watch_config);
  pin_watch(chip->input, &watch_config);
  update_alarm(chip);
}
